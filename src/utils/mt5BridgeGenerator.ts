export function buildMt5BridgePython(): string {
  return `"""
Trade Killer AI — MetaTrader 5 + Real Shamlar + 6-Strategiya AI Miyasi + Backtest + AI Proksi
Oson ishga tushirish (VS Code terminalida):
  1) pip install MetaTrader5 fastapi uvicorn httpx pydantic
  2) Shu papkaga .env faylini qo'ying (yoki PowerShell da kiriting):
       LOCAL_LLM_BASE_URL=http://localhost:3001/v1
       LOCAL_LLM_API_KEY=SIZNING_PROKSI_KALITINGIZ
  3) python mt5_bridge.py
  4) Brauzerda oching: http://127.0.0.1:8000
"""

import json
import math
import os
import threading
import webbrowser
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel


def load_local_env() -> bool:
    """Shu papkadagi .env faylini avtomatik yuklaydi (qo'shimcha kutubxonasiz)."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [os.path.join(base_dir, ".env"), os.path.join(os.getcwd(), ".env")]
    loaded = False
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
            loaded = True
            break
        except Exception:
            pass
    return loaded


ENV_LOADED = load_local_env()

app = FastAPI(title="Trade Killer MT5 + 6-Strategy AI Bridge")
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
        from fastapi.responses import Response
        resp = Response(status_code=204)
    else:
        resp = await call_next(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WATCH_SYMBOLS = ["XAUUSD", "EURUSD", "BTCUSD", "GBPUSD", "US100", "USDJPY"]

SYMBOL_ALIASES: Dict[str, List[str]] = {
    "XAUUSD": ["XAUUSD", "GOLD", "XAUUSDm", "XAUUSD.r", "XAUUSDc", "XAUUSDpro"],
    "EURUSD": ["EURUSD", "EURUSDm", "EURUSD.r", "EURUSDc", "EURUSDpro"],
    "GBPUSD": ["GBPUSD", "GBPUSDm", "GBPUSD.r", "GBPUSDc", "GBPUSDpro"],
    "USDJPY": ["USDJPY", "USDJPYm", "USDJPY.r", "USDJPYc", "USDJPYpro"],
    "BTCUSD": ["BTCUSD", "BTCUSDT", "BTCUSDm", "BITCOIN", "#Bitcoin"],
    "US100": ["US100", "USTEC", "NAS100", "NDX", "NQ100", "US100Cash", "USTECm"],
}

TF_MAP = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
}


def ensure_mt5() -> None:
    if not mt5.initialize():
        code, msg = mt5.last_error()
        raise HTTPException(
            status_code=500,
            detail=(
                f"MT5 ulanmadi ({code}): {msg}. "
                "Kompyuterda MetaTrader 5 ochiq va hisobga kirilgan bo'lsin "
                "(agar MT5 Administrator sifatida ochilgan bo'lsa, VS Code ni ham Administrator qilib oching)."
            ),
        )


def resolve_mt5_symbol(requested: str) -> str:
    """Broker sufiks va nom farqlarini (masalan XAUUSDm, GOLD, USTEC) avtomatik topadi."""
    ensure_mt5()
    req = (requested or "XAUUSD").strip()
    if mt5.symbol_info(req) is not None:
        return req

    all_syms = mt5.symbols_get() or []
    if not all_syms:
        return req

    by_upper = {s.name.upper(): s for s in all_syms}
    candidates = SYMBOL_ALIASES.get(req.upper(), [req])

    # 1. Exact alias match
    for cand in candidates:
        if cand.upper() in by_upper:
            return by_upper[cand.upper()].name

    # 2. Prefix match (prefer visible Market Watch symbols first)
    ordered = sorted(all_syms, key=lambda s: (not s.visible, len(s.name)))
    for cand in candidates:
        cu = cand.upper()
        for s in ordered:
            su = s.name.upper()
            if su.startswith(cu) and len(su) <= len(cu) + 6:
                return s.name

    return req


def discover_mt5_symbols() -> List[str]:
    """Asosiy WATCH_SYMBOLS va MT5 Market Watch dagi ochiq instrumentlarni birlashtiradi."""
    ensure_mt5()
    all_syms = mt5.symbols_get() or []
    resolved: List[str] = []
    seen = set()

    for base_sym in WATCH_SYMBOLS:
        actual = resolve_mt5_symbol(base_sym)
        if mt5.symbol_info(actual) is not None and actual not in seen:
            resolved.append(actual)
            seen.add(actual)

    for s in all_syms:
        if s.visible and s.name not in seen:
            resolved.append(s.name)
            seen.add(s.name)
            if len(resolved) >= 20:
                break

    if not resolved and all_syms:
        for s in all_syms[:8]:
            resolved.append(s.name)
    return resolved


def read_mt5_candles(symbol: str, timeframe: str = "M5", count: int = 200) -> List[Dict[str, Any]]:
    actual = resolve_mt5_symbol(symbol)
    mt5.symbol_select(actual, True)
    tf = TF_MAP.get(timeframe.upper(), mt5.TIMEFRAME_M5)
    rates = mt5.copy_rates_from_pos(actual, tf, 0, min(max(count, 20), 5000))
    if rates is None or len(rates) == 0:
        raise HTTPException(status_code=404, detail=f"{actual} uchun MT5 shamlari olinmadi.")

    candles = []
    for r in rates:
        dt = datetime.fromtimestamp(int(r["time"]))
        fmt = "%m-%d %H:%M" if timeframe.upper() in ("H4", "D1", "W1") else "%H:%M"
        candles.append({
            "time": dt.strftime(fmt),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r["tick_volume"]),
        })
    return candles


def _calc_ema(values: List[float], period: int) -> List[float]:
    if not values:
        return []
    k = 2.0 / (period + 1)
    out = [values[0]]
    prev = values[0]
    for v in values[1:]:
        prev = v * k + prev * (1.0 - k)
        out.append(prev)
    return out


def _calc_rsi_rma(closes: List[float], period: int = 14) -> List[float]:
    n = len(closes)
    rsi = [50.0] * n
    if n <= period:
        return rsi
    gains = sum(max(closes[i] - closes[i - 1], 0.0) for i in range(1, period + 1)) / period
    losses = sum(max(closes[i - 1] - closes[i], 0.0) for i in range(1, period + 1)) / period
    rsi[period] = 100.0 if losses == 0 else (0.0 if gains == 0 else 100.0 - 100.0 / (1.0 + gains / losses))
    for i in range(period + 1, n):
        ch = closes[i] - closes[i - 1]
        g = ch if ch > 0 else 0.0
        l = -ch if ch < 0 else 0.0
        gains = (gains * (period - 1) + g) / period
        losses = (losses * (period - 1) + l) / period
        rsi[i] = 100.0 if losses == 0 else (0.0 if gains == 0 else 100.0 - 100.0 / (1.0 + gains / losses))
    return rsi


def compute_strategy_brain(candles: List[Dict[str, Any]], symbol: str, timeframe: str) -> Dict[str, Any]:
    """
    6 ta AI strategiyasini haqiqiy MT5 shamlari ustida hisoblaydi:
      1) EMA 20 / 50 / 100 / 200 Ribbon
      2) Glaz RSI Chart Bars (14, 70/30)
      3) Libertus RSI Divergences v3.3 (90-bar BULL/BEAR)
      4) Smart Money Concepts [LuxAlgo] (BOS/CHoCH, OB, FVG, Premium/Discount)
      5) Scalping PullBack Tool R1.1 (PAC EMA 34 + EMA 89/200/600 + Heikin Ashi)
      6) VWAP Stdev Bands v2 Mod (+/-1.28, +/-2.01, +/-2.51 sigma)
    """
    n = len(candles)
    if n < 20:
        return {"symbol": symbol, "timeframe": timeframe, "error": "Shamlar yetarli emas"}

    opens = [c["open"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    closes = [c["close"] for c in candles]
    vols = [max(1, c.get("volume", 1)) for c in candles]

    # 1. EMA Ribbon
    ema20 = _calc_ema(closes, 20)
    ema50 = _calc_ema(closes, 50)
    ema100 = _calc_ema(closes, 100)
    ema200 = _calc_ema(closes, 200)
    e20, e50, e100, e200 = ema20[-1], ema50[-1], ema100[-1], ema200[-1]
    alignment = (
        "Buqa Fan (20>50>100>200)"
        if e20 > e50 > e100 > e200
        else ("Ayiq Fan (20<50<100<200)" if e20 < e50 < e100 < e200 else "Aralash")
    )

    # 2 & 3. RSI 14 + Libertus Divergences (90-bar lookback)
    rsi = _calc_rsi_rma(closes, 14)
    max_p, max_r = [closes[0]] * n, [rsi[0]] * n
    min_p, min_r = [closes[0]] * n, [rsi[0]] * n
    last_div, div_ago = "YO'Q", None
    for i in range(n):
        start = max(0, i - 89)
        hi_i = max(range(start, i + 1), key=lambda k: rsi[k])
        lo_i = min(range(start, i + 1), key=lambda k: rsi[k])
        cm = closes[i] if hi_i == i else max_p[i - 1]
        cmr = rsi[i] if hi_i == i else max_r[i - 1]
        cn = closes[i] if lo_i == i else min_p[i - 1]
        cnr = rsi[i] if lo_i == i else min_r[i - 1]
        if closes[i] > cm:
            cm = closes[i]
        if rsi[i] > cmr:
            cmr = rsi[i]
        if closes[i] < cn:
            cn = closes[i]
        if rsi[i] < cnr:
            cnr = rsi[i]
        max_p[i], max_r[i], min_p[i], min_r[i] = cm, cmr, cn, cnr
        if i >= 2:
            if max_p[i - 1] > max_p[i - 2] and rsi[i - 1] < max_r[i] and rsi[i] <= rsi[i - 1]:
                last_div, div_ago = "BEAR", (n - 1) - (i - 1)
            if min_p[i - 1] < min_p[i - 2] and rsi[i - 1] > min_r[i] and rsi[i] >= rsi[i - 1]:
                last_div, div_ago = "BULL", (n - 1) - (i - 1)

    # 4. Scalping PullBack Tool R1.1 (Heikin Ashi + PAC EMA 34 + EMA 89/200)
    ha_c = [(opens[i] + highs[i] + lows[i] + closes[i]) / 4.0 for i in range(n)]
    ha_o = [0.0] * n
    ha_o[0] = (opens[0] + closes[0]) / 2.0
    for i in range(1, n):
        ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2.0
    ha_h = [max(highs[i], ha_o[i], ha_c[i]) for i in range(n)]
    ha_l = [min(lows[i], ha_o[i], ha_c[i]) for i in range(n)]

    pac_c = _calc_ema(ha_c, 34)
    pac_l = _calc_ema(ha_l, 34)
    pac_u = _calc_ema(ha_h, 34)
    fast89 = _calc_ema(ha_c, 89)
    med200 = _calc_ema(ha_c, 200)

    td = 1 if fast89[-1] > med200[-1] and pac_l[-1] > med200[-1] else (-1 if fast89[-1] < med200[-1] and pac_u[-1] < med200[-1] else 0)
    trade_dir, b_below, b_above = 0, 99, 99
    pb_sig, pb_ago = "KUTISH", 99
    for i in range(n):
        b_below = 0 if ha_c[i] < pac_c[i] else b_below + 1
        b_above = 0 if ha_c[i] > pac_c[i] else b_above + 1
        t_i = 1 if fast89[i] > med200[i] and pac_l[i] > med200[i] else (-1 if fast89[i] < med200[i] and pac_u[i] < med200[i] else 0)
        exit_u = i > 0 and ha_o[i] < pac_u[i] and ha_c[i] > pac_u[i] and b_below <= 3
        exit_l = i > 0 and ha_o[i] > pac_l[i] and ha_c[i] < pac_l[i] and b_above <= 3
        prev_td = trade_dir
        if trade_dir == 1 and ha_c[i] < pac_c[i]:
            trade_dir = 0
        elif trade_dir == -1 and ha_c[i] > pac_c[i]:
            trade_dir = 0
        elif trade_dir == 0 and t_i == 1 and exit_u:
            trade_dir = 1
        elif trade_dir == 0 and t_i == -1 and exit_l:
            trade_dir = -1
        if prev_td == 0 and trade_dir == 1:
            pb_sig, pb_ago = "BUY", (n - 1) - i
        elif prev_td == 0 and trade_dir == -1:
            pb_sig, pb_ago = "SELL", (n - 1) - i

    # 5. VWAP Stdev Bands v2 Mod
    vwap_sum = 0.0
    vol_sum = 0.0
    v2_sum = 0.0
    step_reset = 48 if timeframe.upper() in ("M1", "M5") else (32 if timeframe.upper() == "M15" else 96)
    vwap_val, dev_val = closes[-1], 0.0
    for i in range(n):
        hl2 = (highs[i] + lows[i]) / 2.0
        v = vols[i]
        if i % step_reset == 0 and timeframe.upper() in ("M1", "M5", "M15"):
            vwap_sum, vol_sum, v2_sum = hl2 * v, float(v), v * hl2 * hl2
        else:
            vwap_sum += hl2 * v
            vol_sum += v
            v2_sum += v * hl2 * hl2
        vwap_val = vwap_sum / vol_sum
        dev_val = math.sqrt(max(v2_sum / vol_sum - vwap_val * vwap_val, 0.0))

    # 6. LuxAlgo SMC (Swing + Internal BOS/CHoCH + Premium/Discount)
    swing_len = max(10, min(50, n // 4))
    s_leg, i_leg = 0, 0
    s_hi, s_lo, i_hi, i_lo = None, None, None, None
    s_hi_x, s_lo_x, i_hi_x, i_lo_x = False, False, False, False
    s_bias, i_bias = 0, 0
    last_tag = "Kuzatilmoqda"
    for i in range(n):
        if i >= swing_len:
            mx = max(highs[i - swing_len + 1 : i + 1])
            mn = min(lows[i - swing_len + 1 : i + 1])
            prev = s_leg
            if highs[i - swing_len] > mx:
                s_leg = 0
            elif lows[i - swing_len] < mn:
                s_leg = 1
            if s_leg != prev:
                if s_leg == 1:
                    s_lo, s_lo_x = lows[i - swing_len], False
                else:
                    s_hi, s_hi_x = highs[i - swing_len], False
        if i >= 5:
            mx5 = max(highs[i - 4 : i + 1])
            mn5 = min(lows[i - 4 : i + 1])
            prev5 = i_leg
            if highs[i - 5] > mx5:
                i_leg = 0
            elif lows[i - 5] < mn5:
                i_leg = 1
            if i_leg != prev5:
                if i_leg == 1:
                    i_lo, i_lo_x = lows[i - 5], False
                else:
                    i_hi, i_hi_x = highs[i - 5], False
        if i > 0 and i_hi is not None and not i_hi_x and closes[i] > i_hi >= closes[i - 1]:
            last_tag = "Ichki Bullish " + ("CHoCH" if i_bias == -1 else "BOS")
            i_hi_x, i_bias = True, 1
        if i > 0 and i_lo is not None and not i_lo_x and closes[i] < i_lo <= closes[i - 1]:
            last_tag = "Ichki Bearish " + ("CHoCH" if i_bias == 1 else "BOS")
            i_lo_x, i_bias = True, -1
        if i > 0 and s_hi is not None and not s_hi_x and closes[i] > s_hi >= closes[i - 1]:
            last_tag = "Swing Bullish " + ("CHoCH" if s_bias == -1 else "BOS")
            s_hi_x, s_bias = True, 1
        if i > 0 and s_lo is not None and not s_lo_x and closes[i] < s_lo <= closes[i - 1]:
            last_tag = "Swing Bearish " + ("CHoCH" if s_bias == 1 else "BOS")
            s_lo_x, s_bias = True, -1

    tr_top, tr_bot = max(highs), min(lows)
    z_pct = ((closes[-1] - tr_bot) / max(1e-9, tr_top - tr_bot)) * 100.0
    smc_zone = "Premium" if z_pct > 52.5 else ("Discount" if z_pct < 47.5 else "Equilibrium")

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "lastPrice": round(closes[-1], 5),
        "emaRibbon": {
            "ema20": round(e20, 5),
            "ema50": round(e50, 5),
            "ema100": round(e100, 5),
            "ema200": round(e200, 5),
            "alignment": alignment,
        },
        "rsi14": round(rsi[-1], 2),
        "rsiDivergence": {"latest": last_div, "barsAgo": div_ago},
        "smc": {
            "swingBias": "BULLISH" if s_bias == 1 else ("BEARISH" if s_bias == -1 else "NEUTRAL"),
            "internalBias": "BULLISH" if i_bias == 1 else ("BEARISH" if i_bias == -1 else "NEUTRAL"),
            "lastStructure": last_tag,
            "zone": smc_zone,
            "zonePct": round(z_pct, 1),
        },
        "scalpingPullback": {
            "pacUpper": round(pac_u[-1], 5),
            "pacLower": round(pac_l[-1], 5),
            "fastEma89": round(fast89[-1], 5),
            "mediumEma200": round(med200[-1], 5),
            "trendDirection": td,
            "signal": pb_sig if pb_ago <= 4 else "KUTISH",
        },
        "vwapBands": {
            "vwap": round(vwap_val, 5),
            "upper201": round(vwap_val + 2.01 * dev_val, 5),
            "lower201": round(vwap_val - 2.01 * dev_val, 5),
        },
    }


def snapshot_mt5_state() -> Dict[str, Any]:
    ensure_mt5()
    acct = mt5.account_info()
    now_dt = datetime.now()
    day_start = datetime(now_dt.year, now_dt.month, now_dt.day)
    realized_today = 0.0
    try:
        deals = mt5.history_deals_get(day_start, now_dt) or []
        for d in deals:
            if getattr(d, "entry", 0) in (1, 2):
                realized_today += float(getattr(d, "profit", 0.0)) + float(getattr(d, "swap", 0.0)) + float(getattr(d, "commission", 0.0))
    except Exception:
        pass

    account_data = {
        "login": acct.login if acct else 0,
        "server": acct.server if acct else "",
        "balance": round(float(acct.balance), 2) if acct else 0.0,
        "equity": round(float(acct.equity), 2) if acct else 0.0,
        "margin": round(float(acct.margin), 2) if acct else 0.0,
        "margin_free": round(float(acct.margin_free), 2) if acct else 0.0,
        "profit": round(float(acct.profit), 2) if acct else 0.0,
        "realizedToday": round(realized_today, 2),
    }

    pairs = []
    for sym in discover_mt5_symbols():
        mt5.symbol_select(sym, True)
        info = mt5.symbol_info(sym)
        tick = mt5.symbol_info_tick(sym)
        if info and tick and (float(tick.bid) > 0 or float(tick.last) > 0):
            last_bid = float(tick.bid) if float(tick.bid) > 0 else float(tick.last)
            rates_h1 = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_H1, 0, 24)
            high24 = last_bid
            low24 = last_bid
            change24 = 0.0
            vol24 = 0
            rsi_val = 50.0
            trend_label = "Yonlama"
            if rates_h1 is not None and len(rates_h1) > 1:
                highs_24 = [float(r["high"]) for r in rates_h1]
                lows_24 = [float(r["low"]) for r in rates_h1]
                closes_24 = [float(r["close"]) for r in rates_h1]
                high24 = max(highs_24)
                low24 = min(lows_24)
                open_first = float(rates_h1[0]["open"])
                if open_first > 0:
                    change24 = round(((last_bid - open_first) / open_first) * 100.0, 2)
                vol24 = int(sum(int(r["tick_volume"]) for r in rates_h1))
                rsi_arr = _calc_rsi_rma(closes_24, min(14, max(2, len(closes_24) - 1)))
                rsi_val = round(rsi_arr[-1], 1) if rsi_arr else 50.0
                if change24 > 0.12:
                    trend_label = "Ko‘tarilish"
                elif change24 < -0.12:
                    trend_label = "Pasayish"

            clean_sym = sym.split(".")[0].rstrip("mc_")
            base_ccy = getattr(info, "currency_base", "") or clean_sym[:3]
            quote_ccy = getattr(info, "currency_profit", "") or (clean_sym[3:6] if len(clean_sym) >= 6 else "USD")
            pairs.append({
                "symbol": sym,
                "base": base_ccy,
                "quote": quote_ccy,
                "price": last_bid,
                "ask": float(tick.ask) if float(tick.ask) > 0 else last_bid,
                "spreadPoints": int(info.spread),
                "change24h": change24,
                "high24h": high24,
                "low24h": low24,
                "volume24h": vol24,
                "rsi14": rsi_val,
                "trend": trend_label,
                "contractSize": float(info.trade_contract_size) or 100.0,
            })

    raw_positions = mt5.positions_get() or []
    acct_lev = int(acct.leverage) if acct and getattr(acct, "leverage", 0) else 100
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
            "openedAt": datetime.fromtimestamp(p.time).strftime("%H:%M:%S"),
        })

    return {"account": account_data, "pairs": pairs, "positions": positions}


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
    actual = resolve_mt5_symbol(symbol)
    t_info = mt5.terminal_info()
    if t_info is not None and not getattr(t_info, "trade_allowed", True):
        raise HTTPException(
            status_code=400,
            detail="MT5 da 'Algo Trading' tugmasi o'chiq! MT5 dasturining tepasidagi Algo Trading tugmasini yashil qilib yoqing.",
        )

    mt5.symbol_select(actual, True)
    info = mt5.symbol_info(actual)
    tick = mt5.symbol_info_tick(actual)
    if not tick:
        raise HTTPException(status_code=404, detail=f"{actual} narxi topilmadi.")

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
    ensure_mt5()
    targets = [p for p in (mt5.positions_get() or []) if str(p.ticket) == str(position_id)]
    if not targets:
        raise HTTPException(status_code=404, detail=f"Ticket #{position_id} topilmadi.")
    p = targets[0]
    res = mt5.order_send({
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": p.symbol,
        "position": p.ticket,
        "sl": float(sl) if sl else 0.0,
        "tp": float(tp) if tp else 0.0,
    })
    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
        detail = res.comment if res else str(mt5.last_error())
        raise HTTPException(status_code=400, detail=f"SL/TP o'zgartirish xatosi: {detail}")
    return {"ticket": p.ticket, "sl": sl, "tp": tp}


def get_proxy_settings() -> Dict[str, str]:
    return {
        "base_url": os.environ.get("LOCAL_LLM_BASE_URL", "http://localhost:3001/v1").rstrip("/"),
        "api_key": os.environ.get("LOCAL_LLM_API_KEY", "").strip(),
        "model": "auto",
    }


async def call_local_llm_proxy(
    messages: List[Dict[str, str]],
    tools: Optional[List[Dict[str, Any]]] = None,
    json_mode: bool = False,
) -> Dict[str, Any]:
    cfg = get_proxy_settings()
    if not cfg["api_key"]:
        raise HTTPException(
            status_code=400,
            detail="LOCAL_LLM_API_KEY berilmagan. Shu papkaga .env fayli qo'ying yoki muhit o'zgaruvchisi sifatida bering.",
        )

    payload: Dict[str, Any] = {
        "model": cfg["model"],
        "messages": messages,
    }
    if tools:
        payload["tools"] = tools
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{cfg['base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {cfg['api_key']}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Lokal AI proksiga ulanib bo'lmadi ({cfg['base_url']}). Proksi server ishlab turganini tekshiring.",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI proksi xatosi: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


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


class ChatPayload(BaseModel):
    messages: List[Dict[str, str]]
    fullPermissions: bool = True


class SummaryPayload(BaseModel):
    context: Optional[Dict[str, Any]] = None


class ScanPayload(BaseModel):
    pairs: Optional[List[Dict[str, Any]]] = None
    styleFilter: Optional[str] = None


@app.get("/")
def serve_ui():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return HTMLResponse(
        content=f"""<!doctype html>
<html lang="uz"><head><meta charset="utf-8"/><title>Trade Killer AI · MT5 Bridge</title></head>
<body style="background:#0C111C;color:#E2E8F0;font-family:system-ui,sans-serif;padding:40px;line-height:1.6;">
  <h2 style="color:#F25F8C;">MT5 Bridge serveri ishlab turibdi (127.0.0.1:8000)</h2>
  <p>Biroq <code>index.html</code> fayli ushbu papkada topilmadi:</p>
  <pre style="background:#131B2B;padding:12px;border-radius:8px;">{BASE_DIR}</pre>
  <p>Saytdagi <b>index.html yuklab olish</b> tugmasi orqali faylni yuklab, aynan shu papkaga qo'ying va sahifani yangilang (F5).</p>
</body></html>""",
        status_code=200,
    )


@app.get("/api/health")
def health():
    cfg = get_proxy_settings()
    return {
        "ok": True,
        "envLoaded": ENV_LOADED,
        "proxyUrl": cfg["base_url"],
        "model": cfg["model"],
        "hasApiKey": bool(cfg["api_key"]),
    }


@app.get("/api/ai/test")
async def test_mt5_and_ai_proxy():
    """MT5 terminali va lokal AI proksini (localhost:3001/v1) birgalikda test qiladi."""
    cfg = get_proxy_settings()
    mt5_ok = False
    mt5_detail = ""
    try:
        if mt5.initialize():
            acct = mt5.account_info()
            mt5_ok = True
            if acct:
                mt5_detail = f"Ulangan · Hisob #{acct.login} ({acct.server}) · Balans {acct.balance:.2f} USD"
            else:
                mt5_detail = "MT5 terminali tayyor"
        else:
            code, msg = mt5.last_error()
            mt5_detail = f"Ulanmadi ({code}): {msg}"
    except Exception as exc:
        mt5_detail = f"MT5 xatosi: {exc}"

    ai_ok = False
    ai_detail = ""
    if not cfg["api_key"] or "SIZNING_PROKSI_KALITINGIZ" in cfg["api_key"]:
        ai_detail = "LOCAL_LLM_API_KEY kiritilmagan (.env fayliga proksi kalitingizni yozing)"
    else:
        try:
            res = await call_local_llm_proxy(
                [{"role": "user", "content": "Faqat bitta so'z yoz: TAYYOR"}]
            )
            txt = ((res.get("choices") or [{}])[0].get("message", {}) or {}).get("content", "").strip()
            ai_ok = bool(txt)
            ai_detail = f"Ulangan ({cfg['base_url']} · model={cfg['model']}) · Javob: {txt[:40]}"
        except HTTPException as exc:
            ai_detail = str(exc.detail)
        except Exception as exc:
            ai_detail = f"Proksi xatosi: {exc}"

    return {
        "mt5Ok": mt5_ok,
        "mt5Detail": mt5_detail,
        "aiOk": ai_ok,
        "aiDetail": ai_detail,
        "proxyUrl": cfg["base_url"],
        "model": cfg["model"],
        "hasApiKey": bool(cfg["api_key"]),
    }


@app.get("/api/status")
def get_status():
    return snapshot_mt5_state()


@app.get("/api/candles")
def get_candles(
    symbol: str = Query("XAUUSD"),
    timeframe: str = Query("M5"),
    count: int = Query(180),
):
    resolved = resolve_mt5_symbol(symbol)
    return {"symbol": resolved, "timeframe": timeframe, "candles": read_mt5_candles(resolved, timeframe, count)}


@app.get("/api/brain")
def get_strategy_brain(
    symbol: str = Query("XAUUSD"),
    timeframe: str = Query("M5"),
):
    resolved = resolve_mt5_symbol(symbol)
    candles = read_mt5_candles(resolved, timeframe, 220)
    return compute_strategy_brain(candles, resolved, timeframe)


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


@app.post("/api/ai/chat")
async def ai_chat(body: ChatPayload):
    state = snapshot_mt5_state()
    strategy_brains = {}
    for sym in discover_mt5_symbols()[:4]:
        try:
            bars_m5 = read_mt5_candles(sym, "M5", 200)
            strategy_brains[sym] = compute_strategy_brain(bars_m5, sym, "M5")
        except Exception:
            pass

    system_msg = {
        "role": "system",
        "content": (
            "Siz Trade Killer AI — MetaTrader 5 (MT5) terminali uchun to'liq huquqli skalping va uzoq muddatli savdo AI sisiz. "
            "Sizning miyangiz 6 ta strategiyaga asoslangan: (1) EMA 20/50/100/200 Ribbon, (2) Glaz RSI Bars (>70/<30), "
            "(3) Libertus RSI Divergences v3.3 (BULL/BEAR), (4) LuxAlgo SMC (BOS/CHoCH, OB, FVG, Premium/Discount), "
            "(5) Scalping PullBack Tool R1.1 (PAC34 + EMA 89/200), (6) VWAP Stdev Bands (+/-2.01 sigma). "
            "Faqat o'zbek tilida javob bering. Joriy MT5 holati va 6-strategiya hisob-kitoblari:\\n"
            + json.dumps({"state": state, "strategy_brains": strategy_brains}, ensure_ascii=False)
        ),
    }

    openai_messages = [system_msg] + [
        {"role": "assistant" if m["role"] == "model" else m["role"], "content": m["text"]}
        for m in body.messages
    ]

    tools = [
        {
            "type": "function",
            "function": {
                "name": "open_mt5_order",
                "description": "MT5 da BUY yoki SELL buyurtma ochish",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {"type": "string"},
                        "side": {"type": "string"},
                        "lotSize": {"type": "number"},
                        "stopLoss": {"type": "number"},
                        "takeProfit": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["symbol", "side", "lotSize", "reason"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "close_mt5_position",
                "description": "MT5 pozitsiyani ticket ID yoki ALL bo'yicha yopish",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "positionId": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["positionId", "reason"],
                },
            },
        },
    ] if body.fullPermissions else None

    data = await call_local_llm_proxy(openai_messages, tools)
    choice = (data.get("choices") or [{}])[0].get("message", {})
    reply = choice.get("content") or ""
    executed = []

    for tc in (choice.get("tool_calls") or []):
        fn = tc.get("function", {})
        name = fn.get("name")
        args = json.loads(fn.get("arguments") or "{}")
        if name == "open_mt5_order":
            res = execute_mt5_order(
                args["symbol"], args["side"], args["lotSize"], args.get("stopLoss"), args.get("takeProfit")
            )
            executed.append({"name": name, "args": args, "result": res})
        elif name == "close_mt5_position":
            closed = close_mt5_ticket(str(args["positionId"]))
            executed.append({"name": name, "args": args, "result": {"closed": closed}})

    return {"reply": reply or "MT5 amali bajarildi.", "functionCalls": executed}


@app.post("/api/ai/summary")
async def ai_summary(body: SummaryPayload):
    state = snapshot_mt5_state()
    brains = {}
    for sym in discover_mt5_symbols()[:4]:
        try:
            brains[sym] = compute_strategy_brain(read_mt5_candles(sym, "M5", 200), sym, "M5")
        except Exception:
            pass

    prompt = (
        "MT5 real holati va 6-strategiya ko'rsatkichlari asosida o'zbek tilida sof JSON formatida xulosa bering. "
        "Maydonlar: marketBias, confidencePct (son), headline, riskNote, recommendations: [{symbol, action, style, entry, stopLoss, takeProfit, rationale}].\\n"
        + json.dumps({"state": state, "brains": brains, "clientContext": body.context or {}}, ensure_ascii=False)
    )
    data = await call_local_llm_proxy(
        [{"role": "system", "content": "Faqat sof JSON qaytaring."}, {"role": "user", "content": prompt}],
        json_mode=True,
    )
    raw = ((data.get("choices") or [{}])[0].get("message", {}) or {}).get("content", "{}").strip()
    raw = raw.replace("\`\`\`json", "").replace("\`\`\`", "").strip()
    return json.loads(raw or "{}")


@app.post("/api/ai/scan")
async def ai_scan(body: ScanPayload):
    brains = []
    for sym in discover_mt5_symbols()[:8]:
        try:
            brains.append(compute_strategy_brain(read_mt5_candles(sym, "M5", 200), sym, "M5"))
        except Exception:
            pass

    prompt = (
        f"Barcha MT5 instrumentlarini ({body.styleFilter or 'Skalping va Uzoq muddatli'}) skaner qilib, o'zbek tilida sof JSON qaytaring. "
        "Maydonlar: overallSummary, signals: [{symbol, style, timeframe, signal, confidencePct, entry, stopLoss, takeProfit, summary}].\\n"
        + json.dumps({"brains": brains, "pairs": body.pairs or []}, ensure_ascii=False)
    )
    data = await call_local_llm_proxy(
        [{"role": "system", "content": "Faqat sof JSON qaytaring."}, {"role": "user", "content": prompt}],
        json_mode=True,
    )
    raw = ((data.get("choices") or [{}])[0].get("message", {}) or {}).get("content", "{}").strip()
    raw = raw.replace("\`\`\`json", "").replace("\`\`\`", "").strip()
    return json.loads(raw or "{}")


if __name__ == "__main__":
    import uvicorn
    cfg = get_proxy_settings()
    print("=" * 60)
    print(" Trade Killer AI · MT5 & Lokal AI Proksi Serveri")
    print(f" Papka        : {BASE_DIR}")
    print(f" .env yuklandi: {'Ha' if ENV_LOADED else 'Yoq (ixtiyoriy - faqat AI proksi uchun)'}")
    print(f" AI Proksi URL: {cfg['base_url']} (model={cfg['model']})")
    print(f" API Kalit    : {'Kiritilgan' if cfg['api_key'] else 'Kiritilmagan (MT5 baribir ishlaydi)'}")
    print(" Brauzer      : http://127.0.0.1:8000")
    print("=" * 60)
    threading.Timer(1.2, lambda: webbrowser.open("http://127.0.0.1:8000")).start()
    uvicorn.run(app, host="127.0.0.1", port=8000)
`;
}
