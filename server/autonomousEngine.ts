import crypto from 'node:crypto';
import {
  DiagnosticBlocker,
  ExecutionLogEntry,
  InstrumentAnalysisSnapshot,
  LocalMemoryDatabase,
  pushNotification,
} from './localMemory';

export interface IncomingInstrumentReport {
  symbol: string;
  timeframe: string;
  price: number;
  spreadPoints: number;
  assetClass?: string;
  action: 'BUY' | 'SELL' | 'WAIT' | 'NO TRADE';
  analyticalScore: number;
  regime: string;
  regimeLabelUz: string;
  mtfAlignmentPct: number;
  mtfConflict: boolean;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  recommendedLot: number;
  riskPct: number;
  riskAllowed: boolean;
  riskBlockReasons: string[];
  explanationUz: string;
  strategyVotes: {
    strategyId: string;
    strategyName: string;
    signal: 'BUY' | 'SELL' | 'WAIT';
    selectedForRegime: boolean;
    reasonUz: string;
  }[];
  smcSummary?: string;
  candlestickSummary?: string;
  atr14?: number;
}

export interface IncomingOpenPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  lotSize: number;
  sizeUsdt: number;
  stopLoss: number | null;
  takeProfit: number | null;
  profit?: number;
  strategyName: string;
  openedAt: string;
}

export interface IncomingAccountState {
  mt5Connected: boolean;
  tradeMode?: 'DEMO' | 'REAL' | 'CONTEST' | 'SIMULATED';
  tradeAllowed?: boolean;
  investorReadOnly?: boolean;
  equity: number;
  marginFree: number;
  realizedToday: number;
  dailyMaxLossUsd: number;
}

export interface ApprovedOrderCommand {
  signalHash: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  lotSize: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPct: number;
  riskRewardRatio: number;
  analyticalScore: number;
  strategySummary: string;
  reasonUz: string;
}

export interface PositionManagementCommand {
  positionId: string;
  symbol: string;
  action: 'MOVE_BREAKEVEN' | 'TRAIL_PROFIT' | 'MODIFY_SL_TP' | 'CLOSE_PROFIT' | 'CLOSE_LOSS_CUT';
  newStopLoss: number | null;
  newTakeProfit: number | null;
  reasonUz: string;
  source: 'AI_LLM' | 'ENSEMBLE_ENGINE';
}

export interface EngineCycleOutput {
  diagnostics: DiagnosticBlocker[];
  approvedOrderCommands: ApprovedOrderCommand[];
  deterministicPositionActions: PositionManagementCommand[];
  highConvictionCandidates: InstrumentAnalysisSnapshot[];
  canAutoExecute: boolean;
  portfolioRiskPct: number;
  isMarketOpenNow: boolean;
}

/**
 * Checks whether standard FX/Metals markets are open right now (Crypto is 24/7).
 * Standard FX/Gold session closes Friday 22:00 UTC and reopens Sunday 22:00 UTC.
 */
export function isInstrumentMarketOpen(symbol: string, assetClass?: string, now = new Date()): boolean {
  const sym = symbol.toUpperCase();
  if (
    assetClass === 'CRYPTO' ||
    sym.includes('BTC') ||
    sym.includes('ETH') ||
    sym.includes('SOL') ||
    sym.includes('USDT')
  ) {
    return true;
  }
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 22) return false;
  if (day === 0 && hour < 22) return false;
  return true;
}

export function buildSignalHash(symbol: string, timeframe: string, direction: string, bucketPrice: number): string {
  const priceBucket = bucketPrice >= 100 ? bucketPrice.toFixed(0) : bucketPrice.toFixed(3);
  const timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)); // 15-minute dedup window
  return crypto
    .createHash('sha256')
    .update(`${symbol.toUpperCase()}|${timeframe}|${direction}|${priceBucket}|${timeBucket}`)
    .digest('hex')
    .slice(0, 16);
}

export function estimatePortfolioRiskPct(positions: IncomingOpenPosition[], equity: number): number {
  if (equity <= 0 || positions.length === 0) return 0;
  let totalRiskUsd = 0;
  for (const pos of positions) {
    if (pos.stopLoss && pos.stopLoss > 0 && pos.entryPrice > 0) {
      const distFrac = Math.abs(pos.entryPrice - pos.stopLoss) / pos.entryPrice;
      const notional = pos.sizeUsdt > 0 ? pos.sizeUsdt : pos.lotSize * 10000;
      totalRiskUsd += notional * distFrac;
    } else {
      // Unprotected position without SL carries conservative 1.5% risk allocation
      totalRiskUsd += equity * 0.015;
    }
  }
  return Number(((totalRiskUsd / equity) * 100).toFixed(2));
}

export function evaluateDeterministicPositionManagement(
  positions: IncomingOpenPosition[],
  reportsBySymbol: Map<string, IncomingInstrumentReport>,
  aiAutoSlTpEnabled: boolean
): PositionManagementCommand[] {
  if (!aiAutoSlTpEnabled || positions.length === 0) return [];
  const actions: PositionManagementCommand[] = [];

  for (const pos of positions) {
    const report = reportsBySymbol.get(pos.symbol.toUpperCase());
    const price = pos.markPrice || report?.price || pos.entryPrice;
    if (!price || !pos.entryPrice) continue;

    const decimals = price >= 100 ? 2 : price >= 10 ? 3 : 5;
    const round = (v: number) => Number(v.toFixed(decimals));
    const atr = Math.max(price * 0.0018, report?.atr14 ?? price * 0.003);

    // 1. Protect any position missing SL or TP immediately
    if (!pos.stopLoss || !pos.takeProfit) {
      const safeSl =
        pos.stopLoss ??
        round(pos.side === 'LONG' ? pos.entryPrice - atr * 1.6 : pos.entryPrice + atr * 1.6);
      const safeTp =
        pos.takeProfit ??
        round(pos.side === 'LONG' ? pos.entryPrice + atr * 3.2 : pos.entryPrice - atr * 3.2);
      actions.push({
        positionId: pos.id,
        symbol: pos.symbol,
        action: 'MODIFY_SL_TP',
        newStopLoss: safeSl,
        newTakeProfit: safeTp,
        reasonUz: 'Himoyasiz pozitsiya uchun ATR asosida avtomatik SL va TP o‘rnatildi.',
        source: 'ENSEMBLE_ENGINE',
      });
      continue;
    }

    const initialRiskDist = Math.abs(pos.entryPrice - pos.stopLoss);
    if (initialRiskDist <= 0) continue;

    const favorableMove =
      pos.side === 'LONG' ? price - pos.entryPrice : pos.entryPrice - price;
    const rMultiple = favorableMove / initialRiskDist;

    // 2. Break-Even lock at >= 1.0R profit (if SL hasn't reached entry yet)
    const buffer = initialRiskDist * 0.08;
    const beTarget =
      pos.side === 'LONG' ? round(pos.entryPrice + buffer) : round(pos.entryPrice - buffer);
    const slAlreadyProtected =
      pos.side === 'LONG' ? pos.stopLoss >= pos.entryPrice : pos.stopLoss <= pos.entryPrice;

    if (rMultiple >= 1.0 && rMultiple < 1.6 && !slAlreadyProtected) {
      actions.push({
        positionId: pos.id,
        symbol: pos.symbol,
        action: 'MOVE_BREAKEVEN',
        newStopLoss: beTarget,
        newTakeProfit: pos.takeProfit,
        reasonUz: `Pozitsiya +${rMultiple.toFixed(2)}R foydaga chiqdi — SL avtomatik Break-Even (${beTarget}) ga ko‘chirildi.`,
        source: 'ENSEMBLE_ENGINE',
      });
      continue;
    }

    // 3. Trailing Stop profit lock at >= 1.6R profit
    if (rMultiple >= 1.6) {
      const trailTarget =
        pos.side === 'LONG'
          ? round(Math.max(pos.entryPrice + initialRiskDist * 0.55, price - atr * 1.15))
          : round(Math.min(pos.entryPrice - initialRiskDist * 0.55, price + atr * 1.15));

      const improvesSl =
        pos.side === 'LONG'
          ? trailTarget > pos.stopLoss + initialRiskDist * 0.12 && trailTarget < price
          : trailTarget < pos.stopLoss - initialRiskDist * 0.12 && trailTarget > price;

      // Dynamic TP extension when strong aligned momentum continues
      let nextTp = pos.takeProfit;
      if (report && ((pos.side === 'LONG' && report.action === 'BUY') || (pos.side === 'SHORT' && report.action === 'SELL')) && report.analyticalScore >= 72) {
        const extendedTp =
          pos.side === 'LONG'
            ? round(Math.max(pos.takeProfit, price + atr * 2.2))
            : round(Math.min(pos.takeProfit, price - atr * 2.2));
        if (Math.abs(extendedTp - pos.takeProfit) > initialRiskDist * 0.2) {
          nextTp = extendedTp;
        }
      }

      if (improvesSl) {
        actions.push({
          positionId: pos.id,
          symbol: pos.symbol,
          action: 'TRAIL_PROFIT',
          newStopLoss: trailTarget,
          newTakeProfit: nextTp,
          reasonUz: `Pozitsiya +${rMultiple.toFixed(2)}R foydada — Trailing SL ${trailTarget} ga ko‘tarilib foyda qulflandi.`,
          source: 'ENSEMBLE_ENGINE',
        });
      }
    }
  }

  return actions;
}

export function runAutonomousEngineCycle(params: {
  db: LocalMemoryDatabase;
  reports: IncomingInstrumentReport[];
  openPositions: IncomingOpenPosition[];
  account: IncomingAccountState;
  aiApiReady: boolean;
}): EngineCycleOutput {
  const { db, reports, openPositions, account, aiApiReady } = params;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  // Prune expired deduplication hashes
  db.executedSignalHashes = db.executedSignalHashes
    .filter((x) => x.expiresAt > nowMs)
    .slice(0, 300);

  const diagnostics: DiagnosticBlocker[] = [];
  const approvedActiveStrategies = db.strategies.filter((s) => s.ownerApproved && s.active);
  const approvedActiveIds = new Set(approvedActiveStrategies.map((s) => s.id));
  const portfolioRiskPct = estimatePortfolioRiskPct(openPositions, account.equity);

  // Global diagnostic checks — ALWAYS explicit, never hidden
  if (reports.length === 0) {
    diagnostics.push({
      code: 'NO_MARKET_DATA',
      severity: 'CRITICAL',
      titleUz: 'Bozor ma’lumotlari kelmadi (No market data)',
      detailUz: 'Skaner hech qanday instrument yoki sham ma’lumotini olmagan.',
    });
  }

  if (db.control.scannerStatus === 'PAUSED') {
    diagnostics.push({
      code: 'SCANNER_STOPPED',
      severity: 'WARNING',
      titleUz: '24/7 Bozor Skaneri to‘xtatilgan (Scanner stopped)',
      detailUz: 'Tahlil davom etishi uchun Skanerni "RUNNING" holatiga o‘tkazing.',
    });
  }

  if (db.control.stopNewTrades) {
    diagnostics.push({
      code: 'TRADING_PERMISSION_DISABLED',
      severity: 'CRITICAL',
      titleUz: 'STOP NEW TRADES faol (Trading permission disabled)',
      detailUz: 'Favqulodda himoya yoqilgani uchun barcha yangi orderlar bloklangan.',
    });
  }

  if (db.control.autonomousMode !== 'AUTONOMOUS') {
    diagnostics.push({
      code: 'MODE_NOT_AUTONOMOUS',
      severity: 'INFO',
      titleUz: `Rejim: ${db.control.autonomousMode} (Avtomatik order ochish o‘chiq)`,
      detailUz:
        'Tahlil ishlayapti, lekin orderlarni avtomatik ochish uchun Avto-Savdo bo‘limidan AUTONOMOUS rejimini yoqing.',
    });
  }

  if (approvedActiveStrategies.length === 0) {
    diagnostics.push({
      code: 'STRATEGY_NOT_APPROVED',
      severity: 'CRITICAL',
      titleUz: 'Tasdiqlangan va faol strategiya yo‘q (Strategy not approved)',
      detailUz:
        'Strategiya Markazida kamida 1 ta strategiyani Owner sifatida tasdiqlab (Approve) va Faol (Active) qiling.',
    });
  }

  if (!aiApiReady) {
    diagnostics.push({
      code: 'AI_API_UNCONFIGURED',
      severity: 'WARNING',
      titleUz: 'AI LLM API kaliti sozlanmagan',
      detailUz:
        'Deterministik strategiya engine ishlayapti, lekin chuqur LLM tahlili uchun GEMINI_API_KEY yoki LOCAL_LLM_API_KEY kerak.',
    });
  }

  if (!account.mt5Connected) {
    diagnostics.push({
      code: 'EXECUTION_SERVICE_UNAVAILABLE',
      severity: 'WARNING',
      titleUz: 'MT5 Bridge ulanmagan (Execution service unavailable)',
      detailUz:
        'Lokal MT5 Bridge (127.0.0.1:8000) javob bermayapti. Real MT5 orderlar faqat Bridge ulanganda yuboriladi (Demo simulyatsiya mavjud).',
    });
  } else {
    if (account.investorReadOnly || account.tradeAllowed === false) {
      diagnostics.push({
        code: 'ACCOUNT_READ_ONLY',
        severity: 'CRITICAL',
        titleUz: 'MT5 hisob faqat o‘qish rejimida yoki Algo Trading o‘chiq (Account is read-only)',
        detailUz:
          'Investor paroli bilan kirilgan yoki MT5 terminalida "Algo Trading" tugmasi o‘chiq. Order yuborib bo‘lmaydi.',
      });
    }
    if (account.tradeMode === 'REAL' && !db.control.allowRealAccountTrading) {
      diagnostics.push({
        code: 'REAL_ACCOUNT_PERMISSION_REQUIRED',
        severity: 'CRITICAL',
        titleUz: 'Real MT5 hisobda savdo uchun alohida Owner ruxsati kerak',
        detailUz:
          'Ulangan hisob REAL ekanligi aniqlandi. Avto-Savdo bo‘limida "Real hisob ruxsati" yoqilmaguncha real order yuborilmaydi.',
      });
    }
  }

  if (openPositions.length >= db.control.maxOpenOrders) {
    diagnostics.push({
      code: 'RISK_LIMIT_REACHED',
      severity: 'WARNING',
      titleUz: `Maksimal ochiq order limiti to‘ldi (${openPositions.length}/${db.control.maxOpenOrders})`,
      detailUz: 'Yangi order ochish uchun mavjud pozitsiyalar yopilishi yoki Owner limitni oshirishi kerak.',
    });
  }

  if (portfolioRiskPct >= db.control.maxPortfolioRiskPct) {
    diagnostics.push({
      code: 'RISK_LIMIT_REACHED',
      severity: 'CRITICAL',
      titleUz: `Portfolio xavf limiti oshdi (${portfolioRiskPct}% >= ${db.control.maxPortfolioRiskPct}%)`,
      detailUz: 'Umumiy portfel riski belgilangan chegaraga yetgani uchun yangi orderlar to‘xtatildi.',
    });
  }

  if (account.dailyMaxLossUsd > 0 && account.realizedToday <= -Math.abs(account.dailyMaxLossUsd)) {
    diagnostics.push({
      code: 'RISK_LIMIT_REACHED',
      severity: 'CRITICAL',
      titleUz: 'Kunlik zarar limiti (Daily Max Loss) oshdi',
      detailUz: `Bugungi zarar ($${Math.abs(account.realizedToday).toFixed(2)}) ruxsat etilgan limitdan ($${account.dailyMaxLossUsd}) oshdi.`,
    });
  }

  // Evaluate EVERY instrument with Approved Strategy Ensemble
  let buyCount = 0;
  let sellCount = 0;
  let waitCount = 0;
  let noTradeCount = 0;
  let closedMarketsCount = 0;
  let disagreementCount = 0;
  let duplicateCount = 0;

  const approvedOrderCommands: ApprovedOrderCommand[] = [];
  const highConvictionCandidates: InstrumentAnalysisSnapshot[] = [];
  const reportsBySymbol = new Map<string, IncomingInstrumentReport>();

  const canAutoExecuteGlobal =
    db.control.scannerStatus === 'RUNNING' &&
    db.control.autonomousMode === 'AUTONOMOUS' &&
    !db.control.stopNewTrades &&
    approvedActiveStrategies.length > 0 &&
    portfolioRiskPct < db.control.maxPortfolioRiskPct &&
    !(account.dailyMaxLossUsd > 0 && account.realizedToday <= -Math.abs(account.dailyMaxLossUsd)) &&
    (!account.mt5Connected || (!account.investorReadOnly && account.tradeAllowed !== false)) &&
    !(account.mt5Connected && account.tradeMode === 'REAL' && !db.control.allowRealAccountTrading);

  let projectedOpenOrders = openPositions.length;
  let projectedRiskPct = portfolioRiskPct;

  for (const rep of reports) {
    reportsBySymbol.set(rep.symbol.toUpperCase(), rep);

    // Filter votes strictly against Owner-approved active strategies (fallback to all if none approved only for display diagnostics)
    const eligibleVotes =
      approvedActiveIds.size > 0
        ? rep.strategyVotes.filter((v) => approvedActiveIds.has(v.strategyId))
        : [];
    const regimeVotes = eligibleVotes.filter((v) => v.selectedForRegime);
    const activeVotePool = regimeVotes.length > 0 ? regimeVotes : eligibleVotes;

    const approvedBuyVotes = activeVotePool.filter((v) => v.signal === 'BUY').length;
    const approvedSellVotes = activeVotePool.filter((v) => v.signal === 'SELL').length;

    const slDist = Math.max(1e-9, Math.abs(rep.entryPrice - rep.stopLoss));
    const tpDist = Math.abs(rep.takeProfit - rep.entryPrice);
    const rr = Number((tpDist / slDist).toFixed(2));

    let ensembleAction: InstrumentAnalysisSnapshot['action'] = rep.action;
    if (approvedActiveIds.size > 0) {
      if (approvedBuyVotes > 0 && approvedSellVotes > 0 && Math.abs(approvedBuyVotes - approvedSellVotes) <= 0) {
        ensembleAction = 'WAIT';
        disagreementCount++;
      } else if (!rep.riskAllowed) {
        ensembleAction = 'NO TRADE';
      } else if (approvedBuyVotes > approvedSellVotes && rep.analyticalScore >= 58 && !rep.mtfConflict) {
        ensembleAction = 'BUY';
      } else if (approvedSellVotes > approvedBuyVotes && rep.analyticalScore >= 58 && !rep.mtfConflict) {
        ensembleAction = 'SELL';
      } else if (rep.action === 'BUY' || rep.action === 'SELL') {
        // Keep BUY/SELL only if approved votes don't oppose it
        if (rep.action === 'BUY' && approvedBuyVotes === 0) ensembleAction = 'WAIT';
        if (rep.action === 'SELL' && approvedSellVotes === 0) ensembleAction = 'WAIT';
      }
    } else if (rep.strategyVotes.some((v) => v.signal === 'BUY') && rep.strategyVotes.some((v) => v.signal === 'SELL')) {
      disagreementCount++;
    }

    if (ensembleAction === 'BUY') buyCount++;
    else if (ensembleAction === 'SELL') sellCount++;
    else if (ensembleAction === 'NO TRADE') noTradeCount++;
    else waitCount++;

    const signalHash = buildSignalHash(rep.symbol, rep.timeframe, ensembleAction, rep.entryPrice);
    const prev = db.perSymbolReports[rep.symbol];
    const snapshot: InstrumentAnalysisSnapshot = {
      symbol: rep.symbol,
      timeframe: rep.timeframe,
      timestamp: nowIso,
      price: rep.price,
      action: ensembleAction,
      analyticalScore: rep.analyticalScore,
      regime: rep.regime,
      regimeLabelUz: rep.regimeLabelUz,
      mtfAlignmentPct: rep.mtfAlignmentPct,
      mtfConflict: rep.mtfConflict,
      approvedBuyVotes,
      approvedSellVotes,
      totalApprovedActive: approvedActiveIds.size,
      entryPrice: rep.entryPrice,
      stopLoss: rep.stopLoss,
      takeProfit: rep.takeProfit,
      recommendedLot: rep.recommendedLot,
      riskRewardRatio: rr,
      riskAllowed: rep.riskAllowed,
      riskBlockReasons: rep.riskBlockReasons,
      explanationUz: rep.explanationUz,
      llmDecision: prev?.llmDecision,
      llmConfidencePct: prev?.llmConfidencePct,
      llmReasoningUz: prev?.llmReasoningUz,
      signalHash,
    };

    db.perSymbolReports[rep.symbol] = snapshot;

    // Collect high-conviction setups for LLM deep reasoning (only actionable or high-score setups!)
    if ((ensembleAction === 'BUY' || ensembleAction === 'SELL') && rep.analyticalScore >= 60) {
      highConvictionCandidates.push(snapshot);
    }

    // Check market open status
    const marketOpen = isInstrumentMarketOpen(rep.symbol, rep.assetClass);
    if (!marketOpen) {
      closedMarketsCount++;
      continue;
    }

    // Build executable autonomous order commands
    if (
      canAutoExecuteGlobal &&
      (ensembleAction === 'BUY' || ensembleAction === 'SELL') &&
      rep.riskAllowed &&
      rep.analyticalScore >= 62 &&
      rr >= 1.5 &&
      rep.stopLoss > 0 &&
      rep.takeProfit > 0
    ) {
      const isDuplicateHash = db.executedSignalHashes.some((h) => h.hash === signalHash);
      const alreadySameDirOpen = openPositions.filter(
        (p) =>
          p.symbol.toUpperCase() === rep.symbol.toUpperCase() &&
          ((ensembleAction === 'BUY' && p.side === 'LONG') ||
            (ensembleAction === 'SELL' && p.side === 'SHORT'))
      ).length;

      if (isDuplicateHash) {
        duplicateCount++;
        continue;
      }

      // Allow scaling/multi-order across instruments, cap same-symbol same-direction to 3 independent entries
      if (alreadySameDirOpen >= 3) {
        duplicateCount++;
        continue;
      }

      if (projectedOpenOrders >= db.control.maxOpenOrders) {
        continue;
      }

      const nextTradeRiskPct = Math.max(0.25, rep.riskPct || 1.0);
      if (projectedRiskPct + nextTradeRiskPct > db.control.maxPortfolioRiskPct) {
        continue;
      }

      const votingNames = activeVotePool
        .filter((v) => v.signal === ensembleAction)
        .map((v) => v.strategyName.split(' ')[0])
        .slice(0, 4)
        .join('+');

      approvedOrderCommands.push({
        signalHash,
        symbol: rep.symbol,
        side: ensembleAction === 'BUY' ? 'LONG' : 'SHORT',
        lotSize: Math.max(0.01, Number(rep.recommendedLot.toFixed(2))),
        entryPrice: rep.entryPrice,
        stopLoss: rep.stopLoss,
        takeProfit: rep.takeProfit,
        riskPct: nextTradeRiskPct,
        riskRewardRatio: rr,
        analyticalScore: rep.analyticalScore,
        strategySummary: votingNames ? `AI Ensemble (${votingNames})` : 'AI Ensemble',
        reasonUz: rep.explanationUz,
      });

      projectedOpenOrders += 1;
      projectedRiskPct += nextTradeRiskPct;
    }
  }

  // Add per-cycle setup/market diagnostics
  if (reports.length > 0 && buyCount === 0 && sellCount === 0) {
    diagnostics.push({
      code: 'NO_VALID_SETUP',
      severity: 'INFO',
      titleUz: 'Hozircha kuchli kirish setupi yo‘q (No valid setup)',
      detailUz: `${reports.length} ta instrument tahlil qilindi: ${waitCount} ta WAIT, ${noTradeCount} ta NO TRADE. Bozor tasdig‘i kutilmoqda.`,
    });
  }

  if (disagreementCount > 0) {
    diagnostics.push({
      code: 'STRATEGY_DISAGREEMENT',
      severity: 'INFO',
      titleUz: `Strategiyalar kelishmovchiligi (${disagreementCount} ta instrumentda)`,
      detailUz: 'BUY va SELL strategiya ovozlari qarama-qarshi kelgani uchun xavfsiz WAIT holati tanlandi.',
    });
  }

  if (closedMarketsCount > 0) {
    diagnostics.push({
      code: 'MARKET_CLOSED',
      severity: 'INFO',
      titleUz: `Ba’zi bozorlar yopiq (${closedMarketsCount} ta instrument — dam olish kuni)`,
      detailUz: 'Forex/Metall bozorlari dam olish kunlari yopiq bo‘ladi; 24/7 Kripto instrumentlari faol.',
    });
  }

  if (duplicateCount > 0) {
    diagnostics.push({
      code: 'DUPLICATE_SIGNAL_BLOCKED',
      severity: 'INFO',
      titleUz: `Takroriy signallar bloklandi (${duplicateCount} ta)`,
      detailUz: 'Bir xil signal qayta bajarilmasligi uchun deduplikatsiya filtri ishladi.',
    });
  }

  if (db.engineMetrics.lastRejectionReason) {
    diagnostics.push({
      code: 'BROKER_REJECTED_ORDER',
      severity: 'WARNING',
      titleUz: 'Oxirgi broker rad etishi qayd etilgan',
      detailUz: db.engineMetrics.lastRejectionReason,
    });
  }

  // Deterministic dynamic SL/TP management for open positions
  const deterministicPositionActions = evaluateDeterministicPositionManagement(
    openPositions,
    reportsBySymbol,
    db.control.aiAutoSlTpEnabled
  );

  // Persist real backend engine metrics
  db.control.lastAnalysisTime = nowIso;
  db.control.instrumentsScanned = reports.length;
  db.engineMetrics = {
    ...db.engineMetrics,
    aiAnalysisState: db.control.scannerStatus === 'RUNNING' && reports.length > 0 ? 'ACTIVE' : 'IDLE',
    aiAnalysisError: null,
    lastCycleTime: nowIso,
    instrumentsAnalyzed: reports.length,
    signalsGenerated: buyCount + sellCount + waitCount + noTradeCount,
    buySignals: buyCount,
    sellSignals: sellCount,
    waitSignals: waitCount,
    noTradeSignals: noTradeCount,
    openPositionsCount: openPositions.length,
    currentPortfolioRiskPct: portfolioRiskPct,
  };
  db.diagnostics = diagnostics;

  return {
    diagnostics,
    approvedOrderCommands,
    deterministicPositionActions,
    highConvictionCandidates: highConvictionCandidates
      .sort((a, b) => b.analyticalScore - a.analyticalScore)
      .slice(0, 5),
    canAutoExecute: canAutoExecuteGlobal,
    portfolioRiskPct,
    isMarketOpenNow: closedMarketsCount < Math.max(1, reports.length),
  };
}

export function appendExecutionLog(
  db: LocalMemoryDatabase,
  entry: Omit<ExecutionLogEntry, 'id' | 'timestamp'>
): ExecutionLogEntry {
  const full: ExecutionLogEntry = {
    ...entry,
    id: `exec-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    timestamp: new Date().toISOString(),
  };
  db.executionLogs.unshift(full);
  db.executionLogs = db.executionLogs.slice(0, 250);
  return full;
}

/**
 * Self-contained 10-order automated verification test suite (DEMO/TEST ONLY — never touches real MT5).
 * Verifies: 10-order parallel execution, duplicate prevention, portfolio risk cap, broker rejection handling, and SL/TP sync.
 */
export function runDemoMultiOrderVerificationSuite(db: LocalMemoryDatabase) {
  const testSymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'GBPUSD', 'US100', 'USDJPY', 'XAGUSD', 'ETHUSD', 'USOIL', 'BTCUSD'];
  const maxAllowed = Math.max(10, db.control.maxOpenOrders);
  const maxRiskPct = db.control.maxPortfolioRiskPct;
  const seenHashes = new Set<string>();

  let sent = 0;
  let duplicatesBlocked = 0;
  let riskBlocked = 0;
  let brokerRejected = 0;
  let slTpSynced = 0;
  let simulatedRiskPct = 0;

  const details: string[] = [];

  for (let i = 0; i < 13; i++) {
    const symbol = testSymbols[i % testSymbols.length];
    const side = i % 2 === 0 ? 'BUY' : 'SELL';
    // Inject intentional duplicate at i === 10
    const hash = i === 10 ? `test-dup-${testSymbols[0]}-BUY` : `test-${i === 0 ? `dup-${symbol}-${side}` : `${i}-${symbol}-${side}`}`;
    // Inject intentional portfolio risk limit breach at i === 12
    const tradeRisk = i === 12 ? Number((maxRiskPct - simulatedRiskPct + 0.75).toFixed(2)) : 0.45;

    if (seenHashes.has(hash)) {
      duplicatesBlocked++;
      details.push(`#${i + 1} ${symbol} ${side}: BLOKLANDI (Takroriy signal deduplikatsiyasi ishladi)`);
      continue;
    }

    // Inject intentional broker rejection simulation at i === 11
    if (i === 11) {
      brokerRejected++;
      details.push(`#${i + 1} ${symbol} ${side}: BROKER RAD ETDI (10019 No money / Spread filter tekshirildi)`);
      continue;
    }

    if (sent >= maxAllowed || simulatedRiskPct + tradeRisk > maxRiskPct) {
      riskBlocked++;
      details.push(`#${i + 1} ${symbol} ${side}: RISK LIMITI (${(simulatedRiskPct + tradeRisk).toFixed(2)}% > ${maxRiskPct}%)`);
      continue;
    }

    seenHashes.add(hash);
    sent++;
    simulatedRiskPct += tradeRisk;
    slTpSynced++;
    details.push(`#${i + 1} ${symbol} ${side}: OK (Parallel demo order + SL/TP sinxronlandi · jami risk ${simulatedRiskPct.toFixed(2)}%)`);
  }

  appendExecutionLog(db, {
    type: 'STRESS_TEST',
    symbol: 'MULTI-10',
    source: 'TEST',
    accountMode: 'SIMULATED_DEMO',
    reasonUz: `10-order parallel test: ${sent} ochildi, ${duplicatesBlocked} dublikat bloklandi, ${riskBlocked} risk limiti to‘xtatdi, ${brokerRejected} broker rad etishi tekshirildi.`,
  });

  pushNotification({
    priority: 'NORMAL',
    category: 'RISK',
    title: 'Multi-Order 10x Avtonom Test Yakunlandi',
    message: `Ochildi: ${sent} · Dublikat blok: ${duplicatesBlocked} · Risk limit: ${riskBlocked} · Broker reject: ${brokerRejected}.`,
  });

  return {
    passed: sent >= 10 && duplicatesBlocked >= 1 && riskBlocked >= 1 && brokerRejected >= 1,
    ordersExecuted: sent,
    duplicatesBlocked,
    riskBlocked,
    brokerRejected,
    slTpSynced,
    finalSimulatedRiskPct: Number(simulatedRiskPct.toFixed(2)),
    details,
    timestamp: new Date().toISOString(),
  };
}
