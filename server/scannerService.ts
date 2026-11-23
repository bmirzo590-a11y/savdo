import { Timeframe } from '../src/types/trading';
import { getMt5ConnectionState, getSupportedInstruments, syncMt5BridgeNow } from './marketDataService';
import { calculateOrderFloatingPnl, computeAccountSummary, LlmEvaluatorFn, runRealInstrumentAnalysis } from './analysisEngine';
import { loadMemoryDb, saveMemoryDb } from './localMemory';
import { enqueueAutonomousChatEvent } from './aiChatEngine';

let scannerTimer: ReturnType<typeof setInterval> | null = null;
let scanInProgress = false;
let currentScannerTimeframe: Timeframe = 'M15';
let injectedLlmEvaluator: LlmEvaluatorFn | undefined;
const lastSeenRegimeBySymbol: Record<string, string> = {};

export function isScannerLoopActive(): boolean {
  const db = loadMemoryDb();
  return db.control.scannerStatus === 'RUNNING' && scannerTimer !== null;
}

export function isScanCurrentlyRunning(): boolean {
  return scanInProgress;
}

export async function runScannerPassNow(options?: {
  timeframe?: Timeframe;
  forceRefresh?: boolean;
  includeLlmOnSignals?: boolean;
}): Promise<{ scanned: number; signalsFound: number; unavailable: number; errors: number; timestamp: string }> {
  if (scanInProgress) {
    return {
      scanned: 0,
      signalsFound: 0,
      unavailable: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
    };
  }

  scanInProgress = true;
  const tf = options?.timeframe ?? currentScannerTimeframe;
  let scanned = 0;
  let signalsFound = 0;
  let unavailable = 0;
  let errors = 0;

  try {
    // Always verify live MT5 Bridge connection before scanning
    await syncMt5BridgeNow();
    const mt5State = getMt5ConnectionState();
    const db = loadMemoryDb();
    const instruments = getSupportedInstruments().slice(0, 24);

    if (!mt5State.connected) {
      for (const def of instruments) {
        db.scannerStates[def.symbol] = {
          symbol: def.symbol,
          timeframe: tf,
          status: 'DATA UNAVAILABLE',
          dataSource: 'MT5_DISCONNECTED',
          freshnessSec: null,
          lastCandleTimeIso: db.scannerStates[def.symbol]?.lastCandleTimeIso ?? null,
          newCandleDetected: false,
          lastScannedAt: new Date().toISOString(),
          analysisId: null,
          decision: 'DATA_UNAVAILABLE',
          confidence: 0,
          error: mt5State.disconnectReasonUz || 'MetaTrader 5 Bridge ulanmagan (DISCONNECTED).',
        };
        unavailable++;
      }
      saveMemoryDb(db);
      return {
        scanned: instruments.length,
        signalsFound: 0,
        unavailable,
        errors: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Mark instruments as SCANNING before running
    for (const def of instruments) {
      db.scannerStates[def.symbol] = {
        symbol: def.symbol,
        timeframe: tf,
        status: 'SCANNING',
        dataSource: 'MT5 BROKER',
        freshnessSec: db.scannerStates[def.symbol]?.freshnessSec ?? null,
        lastCandleTimeIso: db.scannerStates[def.symbol]?.lastCandleTimeIso ?? null,
        newCandleDetected: false,
        lastScannedAt: db.scannerStates[def.symbol]?.lastScannedAt ?? null,
        analysisId: db.scannerStates[def.symbol]?.analysisId ?? null,
        decision: db.scannerStates[def.symbol]?.decision ?? 'WAIT',
        confidence: db.scannerStates[def.symbol]?.confidence ?? 0,
        error: null,
      };
    }

    // Scan MT5 broker symbols in small batches of 3 to keep bridge latency low
    for (let i = 0; i < instruments.length; i += 3) {
      // Respect live pause mid-pass
      const liveCheck = loadMemoryDb();
      if (liveCheck.control.scannerStatus === 'PAUSED' && !options?.forceRefresh) {
        break;
      }

      const batch = instruments.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(async (def) => {
          try {
            const analysis = await runRealInstrumentAnalysis({
              db,
              symbol: def.symbol,
              timeframe: tf,
              fullMtf: false, // Fast 3-TF scan (primary + H1 + D1) on background pass; Analyze Now runs full 8-TF M1..W1
              forceRefresh: Boolean(options?.forceRefresh),
              llmEvaluator: undefined, // Never spam LLM on every background scan pass
            });
            return { ok: true as const, analysis };
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Skaner tahlil xatosi';
            db.scannerStates[def.symbol] = {
              symbol: def.symbol,
              timeframe: tf,
              status: 'ERROR',
              dataSource: 'DATA_UNAVAILABLE',
              freshnessSec: null,
              lastCandleTimeIso: null,
              newCandleDetected: false,
              lastScannedAt: new Date().toISOString(),
              analysisId: null,
              decision: 'DATA_UNAVAILABLE',
              confidence: 0,
              error: msg,
            };
            return { ok: false as const, error: msg };
          }
        })
      );

      for (const item of batchResults) {
        scanned++;
        if (!item.ok) {
          errors++;
        } else if (item.analysis.status === 'DATA_UNAVAILABLE') {
          unavailable++;
        } else {
          const anl = item.analysis;
          const scanSt = db.scannerStates[anl.symbol];
          const prevRegime = lastSeenRegimeBySymbol[anl.symbol];
          const regimeChanged = Boolean(prevRegime && prevRegime !== anl.marketRegime);
          lastSeenRegimeBySymbol[anl.symbol] = anl.marketRegime;

          const candleKey = scanSt?.lastCandleTimeIso ?? anl.timestamp.slice(0, 16);

          if (anl.decision === 'BUY' || anl.decision === 'SELL') {
            signalsFound++;
            // Event-driven autonomous AI Chief Analyst reasoning on high-conviction valid setups (deduplicated!)
            if (anl.confidence >= 65) {
              enqueueAutonomousChatEvent({
                chatId: 'chief_analyst',
                triggerType: 'VALID_SETUP',
                symbol: anl.symbol,
                timeframe: tf,
                dedupKey: `chief-setup-${anl.symbol}-${tf}-${anl.decision}-${candleKey}`,
                eventNoteUz: `${anl.symbol} (${tf}) yangi ${anl.decision} setup aniqlandi (${anl.confidence}%).`,
              });
            }
            if (
              options?.includeLlmOnSignals &&
              injectedLlmEvaluator &&
              anl.confidence >= 70
            ) {
              const llmOut = await injectedLlmEvaluator(anl);
              anl.llmStatus = llmOut.status;
              anl.llmProvider = llmOut.provider;
              anl.llmSummaryUz = llmOut.summaryUz;
              anl.llmError = llmOut.error;
              db.llmHealth = {
                status: llmOut.status,
                provider: llmOut.provider,
                lastCheckedAt: new Date().toISOString(),
                lastError: llmOut.error,
              };
            }
          }

          // Regime shift triggers Market Intelligence autonomous reasoning (deduplicated!)
          if (regimeChanged) {
            enqueueAutonomousChatEvent({
              chatId: 'market_intelligence',
              triggerType: 'REGIME_CHANGE',
              symbol: anl.symbol,
              timeframe: tf,
              dedupKey: `regime-${anl.symbol}-${anl.marketRegime}-${candleKey}`,
              eventNoteUz: `${anl.symbol} bozor rejimi o‘zgardi: ${prevRegime} -> ${anl.marketRegime}`,
            });
          } else if (scanSt?.newCandleDetected && anl.ensemble.contradictionDetected) {
            enqueueAutonomousChatEvent({
              chatId: 'strategy_analyst',
              triggerType: 'NEW_CANDLE',
              symbol: anl.symbol,
              timeframe: tf,
              dedupKey: `strat-conflict-${anl.symbol}-${tf}-${candleKey}`,
              eventNoteUz: `${anl.symbol} yangi shamda strategiya ziddiyati aniqlandi.`,
            });
          }
        }
      }
    }

    // Monitor real open positions & portfolio risk on scanner pass (deduplicated!)
    const acct = computeAccountSummary(db);
    const openOrders = db.orders.filter((o) => o.status === 'OPEN');
    for (const ord of openOrders) {
      const liveAnl = db.unifiedAnalyses[ord.symbol];
      if (!liveAnl || !liveAnl.latestPrice) continue;
      const pnl = calculateOrderFloatingPnl(ord, liveAnl.latestPrice);
      const pnlPct = ord.sizeUsdt > 0 ? (pnl / ord.sizeUsdt) * 100 : 0;
      if (Math.abs(pnlPct) >= 0.45) {
        const bucket = Math.round(pnlPct * 2); // 0.5% buckets prevent repetitive alerts
        enqueueAutonomousChatEvent({
          chatId: 'trade_manager',
          triggerType: 'POSITION_UPDATE',
          symbol: ord.symbol,
          orderId: ord.id,
          dedupKey: `tm-${ord.id}-b${bucket}`,
          eventNoteUz: `${ord.symbol} ochiq pozitsiyada sezilarli harakat (${pnlPct.toFixed(2)}%).`,
          autoExecuteTradeManager: true,
        });
      }
    }

    if (
      acct.portfolioRiskPct >= db.riskSettings.maxPortfolioRiskPct * 0.7 ||
      acct.currentDrawdownPct >= db.riskSettings.maxDrawdownPct * 0.6
    ) {
      const hourBucket = new Date().toISOString().slice(0, 13);
      enqueueAutonomousChatEvent({
        chatId: 'risk_intelligence',
        triggerType: 'POSITION_UPDATE',
        dedupKey: `risk-alert-${hourBucket}-${Math.round(acct.portfolioRiskPct)}`,
        eventNoteUz: `Portfolio risk (${acct.portfolioRiskPct}%) yoki drawdown (${acct.currentDrawdownPct}%) yuqori chegaraga yaqin.`,
      });
    }

    saveMemoryDb(db);
  } finally {
    scanInProgress = false;
  }

  return {
    scanned,
    signalsFound,
    unavailable,
    errors,
    timestamp: new Date().toISOString(),
  };
}

export function startBackendScannerLoop(llmEvaluator?: LlmEvaluatorFn, intervalMs = 45_000) {
  injectedLlmEvaluator = llmEvaluator;
  if (scannerTimer) {
    clearInterval(scannerTimer);
    scannerTimer = null;
  }

  const db = loadMemoryDb();
  if (db.control.scannerStatus === 'RUNNING') {
    // Trigger initial non-blocking pass 2s after server start so unified state populates with REAL data immediately
    setTimeout(() => {
      const current = loadMemoryDb();
      if (current.control.scannerStatus === 'RUNNING') {
        void runScannerPassNow({ timeframe: currentScannerTimeframe, forceRefresh: false });
      }
    }, 2000);
  }

  scannerTimer = setInterval(() => {
    const current = loadMemoryDb();
    if (current.control.scannerStatus !== 'RUNNING') return;
    void runScannerPassNow({ timeframe: currentScannerTimeframe, forceRefresh: false });
  }, Math.max(20_000, intervalMs));
}

export function setScannerControlState(state: 'RUNNING' | 'PAUSED', timeframe?: Timeframe) {
  if (timeframe) currentScannerTimeframe = timeframe;
  const db = loadMemoryDb();
  db.control.scannerStatus = state;
  saveMemoryDb(db);
  return db.control;
}
