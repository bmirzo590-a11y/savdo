"""
Trade Killer AI — MetaTrader 5 Yagona Bozor Ma'lumotlari va Ijro Ko'prigi (MT5-Only Bridge)
Barcha bozor narxlari, ticklar, OHLC shamlari, 2-3 yillik tarixiy ma'lumotlar,
instrument spetsifikatsiyalari, hisob balansi va orderlar FAQAT MetaTrader 5 orqali olinadi.

Ishga tushirish (Windows + ochiq MetaTrader 5 terminali):
  1) pip install MetaTrader5 fastapi uvicorn httpx pydantic
  2) python mt5_bridge.py
  3) Bridge manzili: http://127.0.0.1:8000 (Trade Killer AI backend avtomatik ulanadi)
"""

import logging
import math
import os
import threading
import time
import webbrowser
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [MT5-BRIDGE] %(levelname)s: %(message)s",
)
logger = logging.getLogger("trade_killer_mt5_bridge")

try:
    import pandas_ta_classic as pta_classic
    HAS_PANDAS_TA_CLASSIC = True
except Exception:
    pta_classic = None
    HAS_PANDAS_TA_CLASSIC = False


def load_local_env() -> bool:
    """Shu papkadagi .env faylini avtomatik yuklaydi."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [os.path.join(base_dir, ".env"), os.path.join(os.getcwd(), ".env")]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val
            return True
        except Exception as exc:
            logger.warning(".env yuklashda xatolik: %s", exc)
    return False


ENV_LOADED = load_local_env()

app = FastAPI(title="Trade Killer AI — MT5-Only Market Data & Execution Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_pna_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        resp = Response(status_code=204)
    else:
        resp = await call_next(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MT5_LOCK = threading.RLock()

TF_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
}

TF_SECONDS = {
    "M1": 60,
    "M5": 300,
    "M15": 900,
    "M30": 1800,
    "H1": 3600,
    "H4": 14400,
    "D1": 86400,
    "W1": 604800,
}

TRADE_MODE_LABELS = {
    0: "DISABLED",
    1: "LONG_ONLY",
    2: "SHORT_ONLY",
    3: "CLOSE_ONLY",
    4: "FULL",
}


def ensure_mt5() -> None:
    """MT5 terminaliga ulanishni tekshiradi, uzilgan bo'lsa qayta ulanadi."""
    with MT5_LOCK:
        term = mt5.terminal_info()
        if term is not None and getattr(term, "connected", True):
            return
        mt5.shutdown()
        if not mt5.initialize():
            code, msg = mt5.last_error()
            logger.error("MT5 ulanmadi (%s): %s", code, msg)
            raise HTTPException(
                status_code=503,
                detail=(
                    f"MT5 ulanmadi ({code}): {msg}. "
                    "Kompyuterda MetaTrader 5 ochiq va broker hisobiga ulangan bo'lishi shart."
                ),
            )
        term = mt5.terminal_info()
        if term is not None and not getattr(term, "connected", True):
            raise HTTPException(
                status_code=503,
                detail="MetaTrader 5 terminali broker serveriga ulanmagan (No connection).",
            )


def classify_asset_class(info: Any) -> str:
    path_str = str(getattr(info, "path", "") or "").upper()
    desc_str = str(getattr(info, "description", "") or "").upper()
    name_str = str(getattr(info, "name", "") or "").upper()
    combined = f"{path_str} {desc_str} {name_str}"
    if any(k in combined for k in ("CRYPTO", "BTC", "ETH", "SOL", "XRP", "LTC", "DOGE", "BNB")):
        return "CRYPTO"
    if any(k in combined for k in ("METAL", "GOLD", "SILVER", "XAU", "XAG", "XPT", "XPD")):
        return "METAL"
    if any(k in combined for k in ("OIL", "WTI", "BRENT", "NGAS", "ENERGY", "XTI", "XBR", "USOIL", "UKOIL")):
        return "ENERGY"
    if any(k in combined for k in ("INDEX", "INDICES", "US100", "USTEC", "NAS100", "US30", "US500", "SPX", "DAX", "GER40", "NDX", "JP225")):
        return "INDEX"
    if any(k in combined for k in ("FOREX", "FX", "MAJOR", "MINOR", "EXOTIC", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD")):
        return "FOREX"
    return "OTHER"


def find_exact_broker_symbol(requested: str) -> str:
    """Broker symbol nomini buzmasdan aniq mosini topadi."""
    ensure_mt5()
    req = (requested or "").strip()
    if not req:
        raise HTTPException(status_code=400, detail="Symbol nomi berilmagan.")
    if mt5.symbol_info(req) is not None:
        return req
    all_syms = mt5.symbols_get() or []
    req_up = req.upper()
    for s in all_syms:
        if s.name.upper() == req_up:
            return s.name
    raise HTTPException(
        status_code=404,
        detail=f"Broker serverida '{req}' instrumenti topilmadi. Aniq broker symbol nomini ishlating.",
    )


def serialize_symbol_spec(info: Any) -> Dict[str, Any]:
    name = str(getattr(info, "name", ""))
    base_ccy = str(getattr(info, "currency_base", "") or "")
    profit_ccy = str(getattr(info, "currency_profit", "") or "")
    margin_ccy = str(getattr(info, "currency_margin", "") or "")
    trade_mode = int(getattr(info, "trade_mode", 0) or 0)
    digits = int(getattr(info, "digits", 5) or 5)
    point = float(getattr(info, "point", 0.00001) or 0.00001)
    tick_size = float(getattr(info, "trade_tick_size", 0.0) or point)
    tick_value = float(getattr(info, "trade_tick_value", 0.0) or 0.0)
    contract_size = float(getattr(info, "trade_contract_size", 0.0) or 1.0)
    vol_min = float(getattr(info, "volume_min", 0.01) or 0.01)
    vol_max = float(getattr(info, "volume_max", 100.0) or 100.0)
    vol_step = float(getattr(info, "volume_step", 0.01) or 0.01)
    spread_pts = int(getattr(info, "spread", 0) or 0)
    visible = bool(getattr(info, "visible", False))
    selected = bool(getattr(info, "select", visible))
    path_str = str(getattr(info, "path", "") or "")
    desc_str = str(getattr(info, "description", "") or "")
    tradable = trade_mode in (1, 2, 4)
    return {
        "brokerSymbol": name,
        "instrument": f"{base_ccy}/{profit_ccy}" if base_ccy and profit_ccy and base_ccy != profit_ccy else name,
        "base": base_ccy or name[:3],
        "quote": profit_ccy or (name[3:6] if len(name) >= 6 else "USD"),
        "marginCurrency": margin_ccy,
        "assetClass": classify_asset_class(info),
        "description": desc_str,
        "path": path_str,
        "digits": digits,
        "point": point,
        "tickSize": tick_size,
        "tickValue": tick_value,
        "contractSize": contract_size,
        "volumeMin": vol_min,
        "volumeMax": vol_max,
        "volumeStep": vol_step,
        "spreadPoints": spread_pts,
        "tradeMode": trade_mode,
        "tradeModeLabel": TRADE_MODE_LABELS.get(trade_mode, "UNKNOWN"),
        "tradable": tradable,
        "visible": visible,
        "selected": selected,
        "tradingSession": "MT5 Broker Session" if tradable else "Savdo yopiq",
    }


def serialize_tick(sym: str, info: Any, tick: Any) -> Dict[str, Any]:
    bid = float(getattr(tick, "bid", 0.0) or 0.0)
    ask = float(getattr(tick, "ask", 0.0) or 0.0)
    last = float(getattr(tick, "last", 0.0) or 0.0)
    point = float(getattr(info, "point", 0.00001) or 0.00001) if info else 0.00001
    time_sec = int(getattr(tick, "time", 0) or 0)
    time_msc = int(getattr(tick, "time_msc", 0) or 0)
    if time_msc <= 0 and time_sec > 0:
        time_msc = time_sec * 1000
    spread_price = round(max(0.0, ask - bid), int(getattr(info, "digits", 5) or 5)) if (ask > 0 and bid > 0) else 0.0
    spread_points = int(round(spread_price / point)) if (point > 0 and spread_price > 0) else int(getattr(info, "spread", 0) or 0)
    tick_iso = datetime.fromtimestamp(time_msc / 1000.0, tz=timezone.utc).isoformat() if time_msc > 0 else None
    vol_tick = int(getattr(tick, "volume", 0) or 0)
    vol_real_raw = float(getattr(tick, "volume_real", 0.0) or 0.0)
    return {
        "brokerSymbol": sym,
        "bid": bid if bid > 0 else None,
        "ask": ask if ask > 0 else None,
        "last": last if last > 0 else (bid if bid > 0 else None),
        "spreadPoints": spread_points,
        "spreadPrice": spread_price,
        "tickTimeSec": time_sec,
        "tickTimeMs": time_msc,
        "tickTimeIso": tick_iso,
        "tickVolume": vol_tick,
        "realVolume": vol_real_raw if vol_real_raw > 0 else None,
    }


def serialize_rates(rates: Any, timeframe: str) -> List[Dict[str, Any]]:
    if rates is None or len(rates) == 0:
        return []
    tf_up = timeframe.upper()
    fmt = "%Y-%m-%d" if tf_up in ("D1", "W1") else ("%m-%d %H:%M" if tf_up in ("H1", "H4") else "%H:%M")
    candles: List[Dict[str, Any]] = []
    for r in rates:
        t_sec = int(r["time"])
        epoch_ms = t_sec * 1000
        dt_utc = datetime.fromtimestamp(t_sec, tz=timezone.utc)
        tick_vol = int(r["tick_volume"]) if "tick_volume" in r.dtype.names else 0
        real_vol_val = int(r["real_volume"]) if "real_volume" in r.dtype.names else 0
        spread_val = int(r["spread"]) if "spread" in r.dtype.names else 0
        candles.append({
            "time": dt_utc.strftime(fmt),
            "epochMs": epoch_ms,
            "timeIso": dt_utc.isoformat(),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": tick_vol,
            "tickVolume": tick_vol,
            "realVolume": real_vol_val if real_vol_val > 0 else None,
            "spread": spread_val,
        })
    return candles


def read_mt5_candles(symbol: str, timeframe: str = "M15", count: int = 200) -> Dict[str, Any]:
    with MT5_LOCK:
        actual = find_exact_broker_symbol(symbol)
        mt5.symbol_select(actual, True)
        tf_up = timeframe.upper()
        if tf_up not in TF_MAP:
            raise HTTPException(status_code=400, detail=f"Noto'g'ri timeframe: {timeframe}")
        tf = TF_MAP[tf_up]
        safe_count = min(max(int(count), 10), 50000)
        rates = mt5.copy_rates_from_pos(actual, tf, 0, safe_count)
        info = mt5.symbol_info(actual)
        tick = mt5.symbol_info_tick(actual)
        candles = serialize_rates(rates, tf_up)
        if not candles:
            raise HTTPException(
                status_code=404,
                detail=f"{actual} ({tf_up}) uchun MT5 broker serverida shamlar topilmadi.",
            )
        return {
            "brokerSymbol": actual,
            "symbol": actual,
            "timeframe": tf_up,
            "dataSource": "MT5_BROKER",
            "barsCount": len(candles),
            "firstTimeIso": candles[0]["timeIso"],
            "lastTimeIso": candles[-1]["timeIso"],
            "tick": serialize_tick(actual, info, tick) if tick else None,
            "candles": candles,
        }


def read_mt5_history_range(symbol: str, timeframe: str = "H1", years: float = 2.0, max_bars: int = 25000) -> Dict[str, Any]:
    """MT5 broker serveridan 2-3 yillik haqiqiy tarixiy shamlarni tortadi (yo'q davrlarni hech qachon to'qimaydi!)."""
    with MT5_LOCK:
        actual = find_exact_broker_symbol(symbol)
        mt5.symbol_select(actual, True)
        tf_up = timeframe.upper()
        if tf_up not in TF_MAP:
            raise HTTPException(status_code=400, detail=f"Noto'g'ri timeframe: {timeframe}")
        tf = TF_MAP[tf_up]
        clamped_years = max(0.05, min(5.0, float(years)))
        utc_to = datetime.now(timezone.utc)
        utc_from = utc_to - timedelta(days=int(clamped_years * 365))
        rates = mt5.copy_rates_range(actual, tf, utc_from, utc_to)
        if rates is None or len(rates) == 0:
            # Fallback to copy_rates_from_pos with broker's actual available bars
            rates = mt5.copy_rates_from_pos(actual, tf, 0, min(max_bars, 50000))
        candles = serialize_rates(rates, tf_up)
        if len(candles) > max_bars:
            candles = candles[-max_bars:]
        return {
            "brokerSymbol": actual,
            "timeframe": tf_up,
            "requestedYears": clamped_years,
            "dataSource": "MT5_BROKER",
            "barsCount": len(candles),
            "firstTimeIso": candles[0]["timeIso"] if candles else None,
            "lastTimeIso": candles[-1]["timeIso"] if candles else None,
            "candles": candles,
        }


def snapshot_mt5_state() -> Dict[str, Any]:
    with MT5_LOCK:
        ensure_mt5()
        term = mt5.terminal_info()
        acct = mt5.account_info()
        now_utc = datetime.now(timezone.utc)
        day_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc)
        realized_today = 0.0
        closed_deals: List[Dict[str, Any]] = []
        try:
            week_start = now_utc - timedelta(days=7)
            deals = mt5.history_deals_get(week_start, now_utc) or []
            for d in deals:
                entry_type = int(getattr(d, "entry", 0) or 0)
                if entry_type in (1, 2):
                    pnl = float(getattr(d, "profit", 0.0)) + float(getattr(d, "swap", 0.0)) + float(getattr(d, "commission", 0.0))
                    d_time = int(getattr(d, "time", 0) or 0)
                    if d_time >= int(day_start.timestamp()):
                        realized_today += pnl
                    closed_deals.append({
                        "ticket": str(getattr(d, "ticket", "")),
                        "order": str(getattr(d, "order", "")),
                        "positionId": str(getattr(d, "position_id", "")),
                        "symbol": str(getattr(d, "symbol", "")),
                        "side": "LONG" if getattr(d, "type", 0) == mt5.DEAL_TYPE_BUY else "SHORT",
                        "volume": float(getattr(d, "volume", 0.0)),
                        "price": float(getattr(d, "price", 0.0)),
                        "profit": round(pnl, 2),
                        "closedAt": datetime.fromtimestamp(d_time, tz=timezone.utc).isoformat() if d_time > 0 else now_utc.isoformat(),
                        "comment": str(getattr(d, "comment", "")),
                    })
        except Exception as exc:
            logger.warning("history_deals_get xatosi: %s", exc)

        terminal_data = {
            "connected": bool(getattr(term, "connected", False)) if term else False,
            "tradeAllowed": bool(getattr(term, "trade_allowed", False)) if term else False,
            "company": str(getattr(term, "company", "")) if term else "",
            "name": str(getattr(term, "name", "MetaTrader 5")) if term else "MetaTrader 5",
            "build": int(getattr(term, "build", 0)) if term else 0,
        }

        account_data = {
            "login": int(getattr(acct, "login", 0)) if acct else 0,
            "server": str(getattr(acct, "server", "")) if acct else "",
            "company": str(getattr(acct, "company", "")) if acct else "",
            "balance": round(float(acct.balance), 2) if acct else 0.0,
            "equity": round(float(acct.equity), 2) if acct else 0.0,
            "margin": round(float(acct.margin), 2) if acct else 0.0,
            "margin_free": round(float(acct.margin_free), 2) if acct else 0.0,
            "margin_level": round(float(getattr(acct, "margin_level", 0.0) or 0.0), 2) if acct else 0.0,
            "profit": round(float(acct.profit), 2) if acct else 0.0,
            "realizedToday": round(realized_today, 2),
            "tradeMode": (
                "REAL" if acct and getattr(acct, "trade_mode", 0) == getattr(mt5, "ACCOUNT_TRADE_MODE_REAL", 2)
                else "CONTEST" if acct and getattr(acct, "trade_mode", 0) == getattr(mt5, "ACCOUNT_TRADE_MODE_CONTEST", 1)
                else "DEMO"
            ),
            "tradeAllowed": bool(
                (acct is not None and getattr(acct, "trade_allowed", True))
                and (term is not None and getattr(term, "trade_allowed", True))
            ),
            "investorReadOnly": bool(acct is not None and not getattr(acct, "trade_allowed", True)),
            "currency": str(getattr(acct, "currency", "USD")) if acct else "USD",
            "leverage": int(getattr(acct, "leverage", 100)) if acct else 100,
        }

        all_syms = mt5.symbols_get() or []
        visible_syms = [s for s in all_syms if getattr(s, "visible", False)]
        active_syms = visible_syms if visible_syms else all_syms[:50]

        symbols_list = [serialize_symbol_spec(s) for s in all_syms]
        ticks_map: Dict[str, Any] = {}
        pairs: List[Dict[str, Any]] = []

        for s in active_syms[:120]:
            tick = mt5.symbol_info_tick(s.name)
            spec = serialize_symbol_spec(s)
            if tick:
                t_ser = serialize_tick(s.name, s, tick)
                ticks_map[s.name] = t_ser
                last_price = t_ser["bid"] or t_ser["last"]
                if last_price and last_price > 0:
                    pairs.append({
                        **spec,
                        "symbol": s.name,
                        "price": last_price,
                        "bid": t_ser["bid"],
                        "ask": t_ser["ask"],
                        "last": t_ser["last"],
                        "spreadPoints": t_ser["spreadPoints"],
                        "tickTimeMs": t_ser["tickTimeMs"],
                        "tickTimeIso": t_ser["tickTimeIso"],
                        "tickVolume": t_ser["tickVolume"],
                        "realVolume": t_ser["realVolume"],
                        "change24h": 0.0,
                        "high24h": last_price,
                        "low24h": last_price,
                        "volume24h": t_ser["tickVolume"],
                        "rsi14": 50.0,
                        "trend": "Yonlama",
                    })

        raw_positions = mt5.positions_get() or []
        acct_lev = account_data["leverage"] or 100
        positions = []
        for p in raw_positions:
            sym_info = mt5.symbol_info(p.symbol)
            c_size = float(sym_info.trade_contract_size) if sym_info else 100.0
            notional = round(float(p.volume) * c_size * float(p.price_current), 2)
            positions.append({
                "id": str(p.ticket),
                "symbol": p.symbol,
                "side": "LONG" if p.type == mt5.POSITION_TYPE_BUY else "SHORT",
                "orderType": "MARKET",
                "entryPrice": float(p.price_open),
                "markPrice": float(p.price_current),
                "lotSize": float(p.volume),
                "sizeUsdt": notional,
                "leverage": acct_lev,
                "stopLoss": float(p.sl) if p.sl else None,
                "takeProfit": float(p.tp) if p.tp else None,
                "profit": round(float(p.profit), 2),
                "status": "OPEN",
                "strategyName": p.comment or "MT5",
                "openedAt": datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
            })

        raw_pending = mt5.orders_get() or []
        pending_orders = []
        for o in raw_pending:
            pending_orders.append({
                "id": str(o.ticket),
                "symbol": o.symbol,
                "side": "LONG" if o.type in (mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP, mt5.ORDER_TYPE_BUY_STOP_LIMIT) else "SHORT",
                "orderType": "LIMIT",
                "entryPrice": float(o.price_open),
                "markPrice": float(o.price_current),
                "lotSize": float(o.volume_current),
                "stopLoss": float(o.sl) if o.sl else None,
                "takeProfit": float(o.tp) if o.tp else None,
                "status": "PENDING",
                "strategyName": o.comment or "MT5 Pending",
                "openedAt": datetime.fromtimestamp(o.time_setup, tz=timezone.utc).isoformat(),
            })

        return {
            "connected": terminal_data["connected"],
            "serverTimeMs": int(time.time() * 1000),
            "terminal": terminal_data,
            "account": account_data,
            "totalBrokerSymbols": len(symbols_list),
            "visibleSymbolsCount": len(visible_syms),
            "symbols": symbols_list,
            "ticks": ticks_map,
            "pairs": pairs,
            "positions": positions,
            "pendingOrders": pending_orders,
            "closedDeals": closed_deals[-100:],
        }


def _send_with_filling_fallback(request: Dict[str, Any]):
    modes = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
    last_res = None
    for mode in modes:
        req = dict(request)
        req["type_filling"] = mode
        res = mt5.order_send(req)
        last_res = res
        if res is not None and res.retcode == mt5.TRADE_RETCODE_DONE:
            return res
        if res is not None and res.retcode not in (10030,):
            break
    return last_res


def execute_mt5_order(
    symbol: str,
    side: str,
    lot_size: float,
    sl: Optional[float] = None,
    tp: Optional[float] = None,
    comment: str = "TradeKillerAI",
) -> Dict[str, Any]:
    with MT5_LOCK:
        actual = find_exact_broker_symbol(symbol)
        acct_info = mt5.account_info()
        if acct_info is not None and not getattr(acct_info, "trade_allowed", True):
            raise HTTPException(
                status_code=403,
                detail="MT5 hisob faqat o'qish (Investor / Read-only) rejimida! Order yuborishga ruxsat yo'q.",
            )
        t_info = mt5.terminal_info()
        if t_info is not None and not getattr(t_info, "trade_allowed", True):
            raise HTTPException(
                status_code=400,
                detail="MT5 da 'Algo Trading' tugmasi o'chiq! MT5 dasturining tepasidagi Algo Trading tugmasini yoqing.",
            )

        mt5.symbol_select(actual, True)
        info = mt5.symbol_info(actual)
        tick = mt5.symbol_info_tick(actual)
        if not tick:
            raise HTTPException(status_code=404, detail=f"{actual} tick narxi topilmadi.")

        digits = int(getattr(info, "digits", 5)) if info else 5
        order_type = mt5.ORDER_TYPE_BUY if side.upper() in ("LONG", "BUY") else mt5.ORDER_TYPE_SELL
        price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid

        result = _send_with_filling_fallback({
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": actual,
            "volume": float(lot_size),
            "type": order_type,
            "price": price,
            "sl": round(float(sl), digits) if sl else 0.0,
            "tp": round(float(tp), digits) if tp else 0.0,
            "deviation": 30,
            "magic": 202601,
            "comment": comment[:30],
            "type_time": mt5.ORDER_TIME_GTC,
        })
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            detail = f"{result.retcode}: {result.comment}" if result else str(mt5.last_error())
            raise HTTPException(status_code=400, detail=f"MT5 order xatosi: {detail}")
        return {"ticket": result.order, "price": result.price, "volume": result.volume, "symbol": actual}


def close_mt5_ticket(position_id: str) -> List[int]:
    with MT5_LOCK:
        ensure_mt5()
        targets = mt5.positions_get() or []
        if position_id.upper() != "ALL":
            targets = [p for p in targets if str(p.ticket) == str(position_id)]
        closed = []
        for p in targets:
            tick = mt5.symbol_info_tick(p.symbol)
            if not tick:
                continue
            close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
            price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
            res = _send_with_filling_fallback({
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": p.symbol,
                "volume": p.volume,
                "type": close_type,
                "position": p.ticket,
                "price": price,
                "deviation": 30,
                "magic": 202601,
                "comment": "TradeKillerClose",
                "type_time": mt5.ORDER_TIME_GTC,
            })
            if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                closed.append(p.ticket)
        return closed


def modify_mt5_sl_tp(position_id: str, sl: Optional[float], tp: Optional[float]) -> Dict[str, Any]:
    with MT5_LOCK:
        ensure_mt5()
        targets = [p for p in (mt5.positions_get() or []) if str(p.ticket) == str(position_id)]
        if not targets:
            raise HTTPException(status_code=404, detail=f"Ticket #{position_id} topilmadi.")
        p = targets[0]
        info = mt5.symbol_info(p.symbol)
        digits = int(getattr(info, "digits", 5)) if info else 5
        new_sl = round(float(sl), digits) if sl else 0.0
        new_tp = round(float(tp), digits) if tp else 0.0
        res = mt5.order_send({
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": p.symbol,
            "position": p.ticket,
            "sl": new_sl,
            "tp": new_tp,
        })
        if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
            detail = f"{res.retcode}: {res.comment}" if res else str(mt5.last_error())
            raise HTTPException(status_code=400, detail=f"SL/TP o'zgartirish xatosi: {detail}")
        return {"ticket": p.ticket, "sl": new_sl, "tp": new_tp}


class OrderPayload(BaseModel):
    symbol: str
    side: str
    lotSize: float = 0.1
    stopLoss: Optional[float] = None
    takeProfit: Optional[float] = None


class ClosePayload(BaseModel):
    positionId: str


class ModifyPayload(BaseModel):
    positionId: str
    stopLoss: Optional[float] = None
    takeProfit: Optional[float] = None


class SymbolSelectPayload(BaseModel):
    symbol: str
    enable: bool = True


@app.get("/")
def serve_ui():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return HTMLResponse(
        content=(
            "<!doctype html><html lang='uz'><head><meta charset='utf-8'/><title>Trade Killer AI · MT5 Bridge</title></head>"
            "<body style='background:#060811;color:#E2E8F0;font-family:system-ui,sans-serif;padding:40px;'>"
            "<h2 style='color:#00E5A0;'>Trade Killer AI — MT5-Only Bridge ishlab turibdi (127.0.0.1:8000)</h2>"
            "<p>Barcha bozor narxlari, ticklar, OHLC shamlari va orderlar faqat MetaTrader 5 orqali uzatilmoqda.</p>"
            "</body></html>"
        ),
        status_code=200,
    )


@app.get("/api/health")
def health():
    mt5_ok = False
    mt5_detail = ""
    login = 0
    server_name = ""
    try:
        ensure_mt5()
        acct = mt5.account_info()
        mt5_ok = True
        if acct:
            login = int(acct.login)
            server_name = str(acct.server)
            mt5_detail = f"Ulangan · #{login} ({server_name})"
        else:
            mt5_detail = "MT5 terminali ulangan"
    except HTTPException as exc:
        mt5_detail = str(exc.detail)
    except Exception as exc:
        mt5_detail = str(exc)

    return {
        "ok": True,
        "mt5Connected": mt5_ok,
        "mt5Detail": mt5_detail,
        "login": login,
        "server": server_name,
        "serverTimeMs": int(time.time() * 1000),
        "envLoaded": ENV_LOADED,
        "hasPandasTaClassic": HAS_PANDAS_TA_CLASSIC,
        "mode": "MT5_ONLY",
    }


@app.get("/api/status")
def get_status():
    return snapshot_mt5_state()


@app.get("/api/symbols")
def get_all_symbols(visible_only: bool = Query(False)):
    with MT5_LOCK:
        ensure_mt5()
        all_syms = mt5.symbols_get() or []
        if visible_only:
            all_syms = [s for s in all_syms if getattr(s, "visible", False)]
        return {
            "count": len(all_syms),
            "serverTimeMs": int(time.time() * 1000),
            "symbols": [serialize_symbol_spec(s) for s in all_syms],
        }


@app.post("/api/symbols/select")
def select_symbol(body: SymbolSelectPayload):
    with MT5_LOCK:
        actual = find_exact_broker_symbol(body.symbol)
        ok = mt5.symbol_select(actual, bool(body.enable))
        if not ok:
            code, msg = mt5.last_error()
            raise HTTPException(status_code=400, detail=f"{actual} Market Watch ga qo'shilmadi ({code}): {msg}")
        info = mt5.symbol_info(actual)
        tick = mt5.symbol_info_tick(actual)
        return {
            "ok": True,
            "brokerSymbol": actual,
            "spec": serialize_symbol_spec(info) if info else None,
            "tick": serialize_tick(actual, info, tick) if tick else None,
        }


@app.get("/api/ticks")
def get_ticks(symbols: Optional[str] = Query(None)):
    with MT5_LOCK:
        ensure_mt5()
        if symbols:
            req_list = [s.strip() for s in symbols.split(",") if s.strip()]
        else:
            all_syms = mt5.symbols_get() or []
            req_list = [s.name for s in all_syms if getattr(s, "visible", False)][:120]

        result: Dict[str, Any] = {}
        for sym in req_list:
            info = mt5.symbol_info(sym)
            if info is None:
                continue
            if not getattr(info, "visible", False):
                mt5.symbol_select(sym, True)
            tick = mt5.symbol_info_tick(sym)
            if tick:
                result[sym] = serialize_tick(sym, info, tick)

        return {
            "count": len(result),
            "serverTimeMs": int(time.time() * 1000),
            "ticks": result,
        }


@app.get("/api/candles")
def get_candles(
    symbol: str = Query(...),
    timeframe: str = Query("M15"),
    count: int = Query(200),
):
    return read_mt5_candles(symbol, timeframe, count)


@app.get("/api/history")
def get_history(
    symbol: str = Query(...),
    timeframe: str = Query("H1"),
    years: float = Query(2.0),
    max_bars: int = Query(25000),
):
    return read_mt5_history_range(symbol, timeframe, years, max_bars)


@app.get("/api/mtf")
def get_multi_timeframe_candles(
    symbol: str = Query(...),
    count: int = Query(150),
):
    actual = find_exact_broker_symbol(symbol)
    tfs = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"]
    candles_by_tf: Dict[str, List[Dict[str, Any]]] = {}
    errors_by_tf: Dict[str, str] = {}
    for tf in tfs:
        try:
            res = read_mt5_candles(actual, tf, min(max(count, 50), 500))
            candles_by_tf[tf] = res["candles"]
        except HTTPException as exc:
            errors_by_tf[tf] = str(exc.detail)
        except Exception as exc:
            errors_by_tf[tf] = str(exc)
    return {
        "brokerSymbol": actual,
        "symbol": actual,
        "dataSource": "MT5_BROKER",
        "candlesByTf": candles_by_tf,
        "errorsByTf": errors_by_tf,
    }


@app.post("/api/orders")
def place_order(body: OrderPayload):
    return execute_mt5_order(body.symbol, body.side, body.lotSize, body.stopLoss, body.takeProfit)


@app.post("/api/close")
def close_single(body: ClosePayload):
    return {"closedTickets": close_mt5_ticket(body.positionId)}


@app.post("/api/modify")
def modify_targets(body: ModifyPayload):
    return modify_mt5_sl_tp(body.positionId, body.stopLoss, body.takeProfit)


@app.post("/api/kill-all")
def kill_all():
    return {"closedTickets": close_mt5_ticket("ALL")}


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("MT5_BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("MT5_BRIDGE_PORT", "8000"))
    logger.info("Trade Killer AI MT5-Only Bridge ishga tushmoqda: http://%s:%d", host, port)
    uvicorn.run(app, host=host, port=port, log_level="info")
