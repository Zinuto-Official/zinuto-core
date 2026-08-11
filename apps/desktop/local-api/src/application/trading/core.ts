// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_ALLOW_LONG_MARGIN_TRADING,
  DEFAULT_ALLOW_SHORT_SELLING,
  DEFAULT_CONTRACT_MULTIPLIER,
  db,
  DEFAULT_INITIAL_SECURITIES_BALANCE,
  DEFAULT_INITIAL_BANK_BALANCE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_MAKER_FEE_RATE,
  DEFAULT_MIN_TRADE_STEP,
  DEFAULT_LONG_FINANCING_ANNUAL_RATE,
  DEFAULT_LONG_INITIAL_MARGIN_RATIO,
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_TRANSFER_FEE_RATE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_MODE,
  DEFAULT_STAMP_DUTY_SINGLE_SIDE,
  DEFAULT_TRADE_SETTLEMENT_MODE,
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
  DEFAULT_POSITION_COST_MODE,
  DEFAULT_SECURITIES_ACCOUNT_ID,
  listSystemSeedSymbols,
  resolveSystemSeedMarketPresetId,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
  DEFAULT_TRANSACTION_LEVY_RATE,
  DEFAULT_TRADING_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  SYSTEM_SEED_MARKET_PRESET_ID,
  DEFAULT_USER_ID,
  initDatabase,
  getDatabaseStorageFootprint
} from '../ports/infrastructure/db/database.js';
import type { ReplaySessionDataGrant } from '../trainingDataAccessGrant.js';
type ReplaySessionScope = 'OFFICIAL' | 'SIMULATION_ONLY';
import {
  clearMarketData,
  getMarketReadDiagnostics,
  getMarketDisplayBarByDisplayIndex,
  getMarketDisplayBarContainingRawIndex,
  acquireMarketPrewarmQuiesceLease,
  invalidateMarketPrewarmRuntime,
  getMarketStorageFootprint
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  type DisplayPeriodKey,
  normalizeFreeReplayAdvancePeriod,
  resolveEffectiveFreeReplayAdvancePeriod,
  type FreeReplayAdvancePeriod,
} from '@zinuto/shared/period';
import type { MarketBarFrame, PriceMode, Side } from '../../domain/models.js';
import { createId } from '../../kernel/id.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import { markTrainingStatsDirty } from '../trainingStatsService.js';
import {
  countDefaultSpecialTrainingQuestionBankSeeds,
  ensureDefaultSpecialTrainingQuestionBankSeed,
} from '../specialTraining/banks.js';
import { toMarketDayStartMs } from '@zinuto/shared/marketTime';
import {
  forceReconcileSystemMarketSeedMetadata
} from '../systemMarketSeedService.js';
import {
  isResetAllStoredDataJobActiveState,
  waitForResetAllStoredDataJobIdle,
  type ResetAllDataJobSnapshot,
  type ResetAllDataJobStatus,
  type ResetAllDataModuleKey,
  type ResetAllDataModuleProgress,
  type ResetAllDataModuleStatus
} from './resetAllDataJobState.js';
import { isSystemResetExecutionActive } from './resetExecutionState.js';
import {
  getSystemStorageUsage as getSystemStorageUsageSnapshot,
} from '../systemStorageService.js';
import { createSessionOps } from './sessionCore.js';
import { createTradingSettingsReadOps } from './settingsReadOps.js';
import { createSystemResetOps } from './systemResetCore.js';
import { blockBackendForResetRecovery, ensureBackendStartupReady } from './resetRecoveryRuntimeBlock.js';
import { hasActiveHistoryRetentionMaintenanceExecution } from '../ports/runtime/historyRetentionMaintenanceWorkerClient.js';
import {
  acquireSourceDiagnosticsQuiesceLease,
  invalidateSourceDiagnosticsRuntimeCaches,
} from '../dataSourceService/sharedDependencies.js';
import { createTrainingResetOps } from './trainingResetCore.js';
import { createPortfolioSummaryOps } from './portfolioSummaryOps.js';
import { createPortfolioSummaryStore } from '../ports/infrastructure/db/trading/portfolioSummaryStore.js';
import { createLocalImportIdleProbe } from '../ports/infrastructure/db/trading/localImportIdleStore.js';
import { listLatestResumableSessionCandidates } from '../ports/infrastructure/db/trading/sessionResumeStore.js';
import type { AccountRow, PositionRow, SessionRow, TradingSettings } from '../../domain/trading/types.js';

import type {
  BarsRangeResult,
} from './marketFrameTypes.js';
export type {
  FreeReplayStartPointOverviewResult,
  ReplayArchiveBarsRangeResult,
  ReplayArchiveRangeBar,
} from './marketFrameTypes.js';

interface BootstrapSessionRow extends SessionRow {
  symbol?: string;
  instrumentName?: string | null;
}

interface SessionBootstrapResult {
  session: BootstrapSessionRow;
  chartFrame: MarketBarFrame;
  snapshot: Awaited<ReturnType<typeof sessionOps.getSessionSnapshot>>;
}

type BootstrapWindowOptions = {
  backwardBars?: number;
  forwardBars?: number;
};

type BootstrapBarsWindow = {
  requestOffset: number;
  requestLimit: number;
  before: number;
  after: number;
  maxDisplayBars: number;
};

type BootstrapFrameReadDiagnostics = {
  instrumentId: string;
  requestOffset: number;
  requestLimit: number;
  frameReadDurationMs: number;
  didFullRawRead: boolean;
  fullRawReadCountDelta: number;
  rangeReadCountDelta: number;
};

interface ResumableSessionSummary {
  sessionId: string;
  symbol: string;
  instrumentName: string | null;
  timeframe: string;
  minimumBaseTimeframe: string;
  samplePoolId: string;
  createdAt: string;
  updatedAt: string;
}

interface TrainingSummary {
  initialAsset: number;
  endingAsset: number;
  assetReturnRate: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  investedAmount: number;
  tradingCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
}

export type {
  ResetAllDataJobSnapshot,
  ResetAllDataJobStatus,
  ResetAllDataModuleKey,
  ResetAllDataModuleProgress,
  ResetAllDataModuleStatus,
  ResumableSessionSummary,
};

const round = (value: number, digits = 8): number => Number(value.toFixed(digits));
const DAY_MS = 24 * 60 * 60 * 1000;
const TRAINING_SUMMARY_MAX_TIMELINE_BARS = 6000;

let tradingDatabaseInitialized = false;
let lastBootstrapFrameReadDiagnostics: BootstrapFrameReadDiagnostics | null = null;
const ensureTradingDatabaseInitialized = async (): Promise<void> => {
  if (tradingDatabaseInitialized) {
    return;
  }
  await initDatabase();
  tradingDatabaseInitialized = true;
};

void ensureTradingDatabaseInitialized();

const toUtcDayMs = (iso: string): number => toMarketDayStartMs(iso);

const { isLocalDataImportIdle } = createLocalImportIdleProbe({ db });
import { tradingCoreStore } from './tradingCoreStoreRuntime.js';

const getSessionById = (sessionId: string): SessionRow => {
  const session = tradingCoreStore.getSessionById(sessionId);
  if (!session) {
    throw appError('SESSION_NOT_FOUND');
  }
  return session;
};

const getOrCreatePosition = (sessionId: string, instrumentId: string): PositionRow => {
  return tradingCoreStore.getOrCreatePosition(sessionId, instrumentId);
};

const getAccount = (): AccountRow => {
  const id = DEFAULT_SECURITIES_ACCOUNT_ID;
  const account = tradingCoreStore.getAccountById(id);
  if (!account) {
    throw appError('SECURITIES_ACCOUNT_NOT_FOUND');
  }
  return account;
};

const setAccountBalance = (accountId: string, value: number): void => {
  tradingCoreStore.setAccountBalance(accountId, round(value, 6));
};

const settingsReadOps = createTradingSettingsReadOps({
  db,
  DEFAULT_USER_ID,
  DEFAULT_INITIAL_SECURITIES_BALANCE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_TRANSFER_FEE_RATE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_TRANSACTION_LEVY_RATE,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
  DEFAULT_LONG_FINANCING_ANNUAL_RATE,
  DEFAULT_LONG_INITIAL_MARGIN_RATIO,
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_STAMP_DUTY_MODE,
  DEFAULT_STAMP_DUTY_SINGLE_SIDE,
  DEFAULT_POSITION_COST_MODE,
  DEFAULT_TRADE_SETTLEMENT_MODE,
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
  DEFAULT_ALLOW_LONG_MARGIN_TRADING,
  DEFAULT_ALLOW_SHORT_SELLING,
  DEFAULT_TRADING_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  SYSTEM_SEED_MARKET_PRESET_ID,
  resolveSystemSeedMarketPresetId,
  DEFAULT_MIN_TRADE_STEP,
  DEFAULT_MAKER_FEE_RATE,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_CONTRACT_MULTIPLIER,
  barsRangeLimitMax: runtimeLimits.barsRangeLimitMax,
  round,
  nowIso,
  appError,
  getInstrumentBySymbol,
  getInstrumentById,
  ensureInstrumentMarketBarsReady,
  getBarsByInstrumentId: loadMarketBarsByInstrumentId,
  getBarsByInstrumentIdRange: loadMarketBarsByInstrumentIdRange,
  getAccount,
  setAccountBalance,
  ensureSystemMarketSeedReady: ensureSystemSeedUniverseReady
});

const replayAccountBalancesFromHistory = settingsReadOps.replayAccountBalancesFromHistory;

export const getTradingSettings: () => TradingSettings = settingsReadOps.getTradingSettings;
export const setTradingSettings: (payload: TradingSettings) => TradingSettings = settingsReadOps.setTradingSettings;
const getInitialBalances = settingsReadOps.getInitialBalances;
export const listInstruments = settingsReadOps.listInstruments;
const listAccounts: () => AccountRow[] = settingsReadOps.listAccounts;
export const getBarsBySymbol = settingsReadOps.getBarsBySymbol;
export const getBarsByInstrumentId = settingsReadOps.getBarsByInstrumentId;
export const getBarsBySymbolRange: (
  symbol: string,
  timeframe?: string,
  offset?: number,
  limit?: number
) => Promise<BarsRangeResult> =
  settingsReadOps.getBarsBySymbolRange;
export const getBarsByInstrumentIdRange: (
  instrumentId: string,
  offset?: number,
  limit?: number,
  options?: { signal?: AbortSignal },
) => Promise<BarsRangeResult> =
  settingsReadOps.getBarsByInstrumentIdRange;

export const getLastBootstrapFrameReadDiagnostics = ():
  | BootstrapFrameReadDiagnostics
  | null =>
  lastBootstrapFrameReadDiagnostics
    ? { ...lastBootstrapFrameReadDiagnostics }
    : null;

const readBootstrapChartFrame = async (
  instrumentId: string,
  cursorIndex: number,
  displayPeriod: DisplayPeriodKey,
  window: BootstrapBarsWindow,
): Promise<MarketBarFrame> => {
  const before = getMarketReadDiagnostics();
  const startedAtMs = Date.now();
  const chartFrame = await getBarsFrameByInstrumentId(
    instrumentId,
    0,
    window.maxDisplayBars,
    {
      displayPeriod,
      anchorRawIndex: cursorIndex,
      before: window.before,
      after: window.after,
      maxDisplayBars: window.maxDisplayBars,
    },
  );
  const after = getMarketReadDiagnostics();
  const fullRawReadCountDelta = Math.max(
    0,
    after.fullRawReadCount - before.fullRawReadCount,
  );
  lastBootstrapFrameReadDiagnostics = {
    instrumentId,
    requestOffset: window.requestOffset,
    requestLimit: window.requestLimit,
    frameReadDurationMs: Math.max(0, Date.now() - startedAtMs),
    didFullRawRead: fullRawReadCountDelta > 0,
    fullRawReadCountDelta,
    rangeReadCountDelta: Math.max(0, after.rangeReadCount - before.rangeReadCount),
  };
  return chartFrame;
};

const assertMarketBarFrameContainsCursor = (
  frame: MarketBarFrame,
  cursorIndex: number,
): void => {
  if (!frame.timestampMs.length) {
    throw appError('INVALID_PARAMS', { cursorIndex });
  }
  if (cursorIndex < frame.rawStartIndex || cursorIndex > frame.rawEndIndex) {
    throw appError('INVALID_PARAMS', {
      cursorIndex,
      rawStartIndex: frame.rawStartIndex,
      rawEndIndex: frame.rawEndIndex,
    });
  }
};

import {
  toBaseTimeframe,
} from './marketFrameSemantics.js';

import {
  ensureInstrumentMarketBarsReady,
  ensureSystemSeedUniverseReady,
  getBarByIndex,
  getBarCount,
  getBarTsByRange,
  getBarsFrameByInstrumentId,
  getCloseAtOrBefore,
  getInstrumentById,
  getInstrumentBySymbol,
  loadMarketBarsByInstrumentId,
  loadMarketBarsByInstrumentIdRange,
  prewarmInstrumentMarketTimelines,
  resolveInstrumentTimelineConfig,
  updateInstrumentBarCount,
} from './marketFrameRuntime.js';
export {
  getBarsFrameByInstrumentId,
  getBarTsByInstrumentIdRange,
  getReplayArchiveBarsByInstrumentIdRawRange,
} from './marketFrameRuntime.js';

export { getFreeReplayStartPointOverview } from './freeReplayOverview.js';

const sessionOps = createSessionOps({
  db,
  DEFAULT_USER_ID,
  round,
  nowIso,
  createId,
  appError,
  getTradingSettings,
  getInstrumentBySymbol,
  getInstrumentById,
  ensureInstrumentMarketBarsReady,
  getSessionById,
  getOrCreatePosition,
  getAccount,
  setAccountBalance,
  getBarCount,
  getBarByIndex,
  getBarsByInstrumentIdRange: loadMarketBarsByInstrumentIdRange,
  getDisplayBarContainingRawIndex: getMarketDisplayBarContainingRawIndex,
  getDisplayBarByDisplayIndex: getMarketDisplayBarByDisplayIndex,
  ensureBackendStartupReady,
  resolveInstrumentTimelineConfig,
  getCloseAtOrBefore,
  listAccounts
});

export const createOrGetSession = async (
  symbol: string,
  timeframe = '1d',
  forceNew = false,
  anchorIndex?: number,
  options?: {
    instrumentId?: string;
    samplePoolId?: string;
    minimumBaseTimeframe?: FreeReplayAdvancePeriod;
    sessionTradingSettings?: TradingSettings;
    accessGrant?: ReplaySessionDataGrant;
    sessionScope?: ReplaySessionScope;
    createdAt?: string;
    archiveStartIndex?: number;
  }
): Promise<SessionRow> => {
  const session = await sessionOps.createOrGetSession(
    symbol,
    timeframe,
    forceNew,
    anchorIndex,
    options,
  );
  const instrument = getInstrumentById(session.instrument_id);
  if (instrument) {
    const totalRaw = await ensureInstrumentMarketBarsReady(instrument);
    const sourceTimeframe = toBaseTimeframe(session.timeframe, '1d');
    const displayPeriod = resolveEffectiveFreeReplayAdvancePeriod(
      sourceTimeframe,
      normalizeFreeReplayAdvancePeriod(session.minimum_base_timeframe, sourceTimeframe),
    );
    prewarmInstrumentMarketTimelines(
      instrument,
      totalRaw,
      displayPeriod,
    );
  }
  return session;
};

const resolveBootstrapWindowCounts = (
  timeframe: string,
  options?: BootstrapWindowOptions,
): {
  backwardWindow: number;
  forwardWindow: number;
} => {
  const backwardWindowDefault =
    timeframe === '1m'
      ? 1_200
      : timeframe === '5m'
        ? 1_800
        : timeframe === '1h'
          ? 1_600
          : timeframe === '1d'
            ? 1_800
            : 1_400;
  const forwardWindowDefault =
    timeframe === '1m'
      ? 180
      : timeframe === '5m'
        ? 240
        : timeframe === '1h'
          ? 240
          : timeframe === '1d'
            ? 240
            : 180;
  return {
    backwardWindow: Number.isFinite(options?.backwardBars)
      ? Math.max(0, Math.floor(Number(options?.backwardBars)))
      : backwardWindowDefault,
    forwardWindow: Number.isFinite(options?.forwardBars)
      ? Math.max(0, Math.floor(Number(options?.forwardBars)))
      : forwardWindowDefault,
  };
};

const resolveBootstrapBarsWindow = (
  timeframe: string,
  cursorIndex: number,
  options?: BootstrapWindowOptions
): BootstrapBarsWindow => {
  const { backwardWindow, forwardWindow } = resolveBootstrapWindowCounts(
    timeframe,
    options,
  );
  const requestLimit = Math.max(1, backwardWindow + forwardWindow + 1);
  return {
    requestOffset: Math.max(0, cursorIndex - backwardWindow),
    requestLimit,
    before: backwardWindow,
    after: forwardWindow,
    maxDisplayBars: requestLimit,
  };
};

const resolveSessionEffectiveDisplayPeriod = (
  session: Pick<SessionRow, 'timeframe' | 'minimum_base_timeframe'>,
  fallbackTimeframe: string,
): DisplayPeriodKey => {
  const sourceTimeframe = toBaseTimeframe(
    session.timeframe,
    toBaseTimeframe(fallbackTimeframe, '1d'),
  );
  return resolveEffectiveFreeReplayAdvancePeriod(
    sourceTimeframe,
    normalizeFreeReplayAdvancePeriod(session.minimum_base_timeframe, sourceTimeframe),
  );
};

export const createOrGetSessionBootstrap = async (
  symbol: string,
  timeframe = '1d',
  forceNew = false,
  anchorIndex?: number,
  options?: {
    instrumentId?: string;
    samplePoolId?: string;
    minimumBaseTimeframe?: FreeReplayAdvancePeriod;
    sessionTradingSettings?: TradingSettings;
    accessGrant?: ReplaySessionDataGrant;
    sessionScope?: ReplaySessionScope;
    createdAt?: string;
    archiveStartIndex?: number;
    backwardBars?: number;
    forwardBars?: number;
  }
): Promise<SessionBootstrapResult> => {
  const session = await createOrGetSession(symbol, timeframe, forceNew, anchorIndex, options);
  const cursorIndex = Math.max(0, Math.floor(Number(session.cursor_index) || 0));
  const displayPeriod = resolveSessionEffectiveDisplayPeriod(session, timeframe);
  const window = resolveBootstrapBarsWindow(displayPeriod, cursorIndex, options);
  const chartFrame = await readBootstrapChartFrame(
    session.instrument_id,
    cursorIndex,
    displayPeriod,
    window,
  );
  assertMarketBarFrameContainsCursor(chartFrame, cursorIndex);
  const snapshot = await getSessionSnapshot(session.id, null);
  return {
    session: snapshot.session,
    chartFrame,
    snapshot
  };
};

export const getSessionBootstrapById = async (
  sessionId: string,
  options?: BootstrapWindowOptions
): Promise<SessionBootstrapResult> => {
  const snapshot = await getSessionSnapshot(sessionId, null);
  if (snapshot.termination?.isTerminated) {
    throw appError('SESSION_NOT_FOUND');
  }
  const displayPeriod = resolveSessionEffectiveDisplayPeriod(snapshot.session, '1d');
  const cursorIndex = Math.max(0, Math.floor(Number(snapshot.session.cursor_index) || 0));
  const window = resolveBootstrapBarsWindow(displayPeriod, cursorIndex, options);
  const chartFrame = await readBootstrapChartFrame(
    snapshot.session.instrument_id,
    cursorIndex,
    displayPeriod,
    window,
  );
  assertMarketBarFrameContainsCursor(chartFrame, cursorIndex);
  return {
    session: snapshot.session,
    chartFrame,
    snapshot
  };
};

export const getLatestResumableSession = async (): Promise<ResumableSessionSummary | null> => {
  const candidates = listLatestResumableSessionCandidates(DEFAULT_USER_ID);

  for (const candidate of candidates) {
    try {
      const snapshot = await getSessionSnapshot(candidate.sessionId, null);
      if (snapshot.termination?.isTerminated) {
        continue;
      }
      return {
        sessionId: candidate.sessionId,
        symbol: String(candidate.symbol || '').trim().toUpperCase(),
        instrumentName: candidate.instrumentName ?? null,
        timeframe: String(candidate.timeframe || '').trim().toLowerCase() || '1d',
        minimumBaseTimeframe:
          String(candidate.minimumBaseTimeframe || '').trim().toLowerCase() ||
          String(candidate.timeframe || '').trim().toLowerCase() ||
          '1d',
        samplePoolId: String(candidate.samplePoolId || '').trim(),
        createdAt: String(candidate.createdAt || '').trim(),
        updatedAt: String(candidate.updatedAt || '').trim()
      };
    } catch {
      continue;
    }
  }

  return null;
};

export const setSessionPlayback = async (
  sessionId: string,
  intervalMs: number,
  isPaused: boolean,
): Promise<SessionRow> =>
  sessionOps.setSessionPlayback(sessionId, intervalMs, isPaused);

export const updateSessionTradingSettings = async (
  sessionId: string,
  settings: TradingSettings,
) => sessionOps.updateSessionTradingSettings(sessionId, settings);

export const stepSession = async (
  sessionId: string,
  count = 1
): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> =>
  sessionOps.stepSession(sessionId, count);

export const executeSessionAction = async (
  sessionId: string,
  payload: {
    action: 'STEP';
    count?: number;
    displayPeriod?: DisplayPeriodKey | string;
    fillCursor?: string | null;
    occurredAt?: string;
  } | {
    action: 'PLAYBACK_TICK';
    displayPeriod?: DisplayPeriodKey | string;
    fillCursor?: string | null;
    occurredAt?: string;
  } | {
    action: 'BUY' | 'SELL';
    inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
    lotInput?: string | number | null;
    amountInput?: string | number | null;
    ratioInput?: string | number | null;
    priceMode: PriceMode;
    displayPeriod?: DisplayPeriodKey | string;
    fillCursor?: string | null;
    occurredAt?: string;
  } | {
    action: 'UNDO';
    displayPeriod?: DisplayPeriodKey | string;
    fillCursor?: string | null;
    occurredAt?: string;
  },
): ReturnType<typeof sessionOps.executeSessionAction> =>
  sessionOps.executeSessionAction(sessionId, payload);

export const placeOrder = async (
  sessionId: string,
  payload: {
    side: Side;
    qty?: number;
    amount?: number;
    priceMode: PriceMode;
    nextOpenDelayBars?: number;
    autoStep?: boolean;
  }
): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> =>
  sessionOps.placeOrder(sessionId, payload);

export const getSessionOrderQuote = async (
  sessionId: string,
  payload: {
    side: Side;
    inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
    lotInput?: string | number | null;
    amountInput?: string | number | null;
    ratioInput?: string | number | null;
    priceMode: PriceMode;
    displayPeriod: DisplayPeriodKey | string;
  },
) => sessionOps.getSessionOrderQuote(sessionId, payload);

export const getSessionSnapshot = async (
  sessionId: string,
  fillCursor?: string | null,
) => sessionOps.getSessionSnapshot(sessionId, fillCursor);

export const getSessionRuntimeDelta = async (
  sessionId: string,
  actionResult: Awaited<ReturnType<typeof sessionOps.executeSessionAction>>,
  fillCursor?: string | null,
) => sessionOps.getSessionRuntimeDelta(sessionId, actionResult, fillCursor);

const portfolioSummaryStore = createPortfolioSummaryStore({ db });
const portfolioSummaryOps = createPortfolioSummaryOps({
  portfolioSummaryStore,
  getBarCount,
  getBarByIndex,
  toUtcDayMs,
  DAY_MS,
  round
});

export const getPortfolioSummary = portfolioSummaryOps.getPortfolioSummary;

const trainingResetOps = createTrainingResetOps({
  db,
  DAY_MS,
  TRAINING_SUMMARY_MAX_TIMELINE_BARS,
  DEFAULT_USER_ID,
  DEFAULT_SECURITIES_ACCOUNT_ID,
  round,
  toUtcDayMs,
  nowIso,
  createId,
  getInitialBalances,
  getSessionById,
  getOrCreatePosition,
  setAccountBalance,
  listAccounts,
  replayAccountBalancesFromHistory,
  getInstrumentBySymbol,
  getBarCount,
  getBarByIndex,
  getBarTsByRange,
  getCloseAtOrBefore,
  executeFill: sessionOps.executeFill,
  runSerializedTrainingMutation: sessionOps.runSerializedTrainingMutation,
  appError
});

const systemResetOps = createSystemResetOps({
  db,
  DEFAULT_USER_ID,
  DEFAULT_SECURITIES_ACCOUNT_ID,
  DEFAULT_INITIAL_SECURITIES_BALANCE,
  DEFAULT_INITIAL_BANK_BALANCE,
  DEFAULT_TRADING_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_MIN_TRADE_STEP,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_MAKER_FEE_RATE,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_CONTRACT_MULTIPLIER,
  DEFAULT_TRANSFER_FEE_RATE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_TRANSACTION_LEVY_RATE,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
  DEFAULT_LONG_FINANCING_ANNUAL_RATE,
  DEFAULT_LONG_INITIAL_MARGIN_RATIO,
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_STAMP_DUTY_MODE,
  DEFAULT_STAMP_DUTY_SINGLE_SIDE,
  DEFAULT_POSITION_COST_MODE,
  DEFAULT_TRADE_SETTLEMENT_MODE,
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
  DEFAULT_ALLOW_LONG_MARGIN_TRADING,
  DEFAULT_ALLOW_SHORT_SELLING,
  resetJobDeadlineMs: runtimeLimits.resetJobDeadlineMs,
  resetRecoveryDeadlineMs: runtimeLimits.resetRecoveryDeadlineMs,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  nowIso,
  getDatabaseStorageFootprint,
  getMarketStorageFootprint,
  clearMarketData,
  markTrainingStatsDirty,
  countDefaultSpecialTrainingQuestionBankSeeds,
  ensureDefaultSpecialTrainingQuestionBankSeed,
  forceReconcileSystemMarketSeedMetadata,
  getInstrumentBySymbol,
  updateInstrumentBarCount,
  listAccounts,
  getTradingSettings,
  listInstruments,
  listSystemSeedSymbols,
  isLocalDataImportIdle,
  hasActiveHistoryRetentionMaintenanceExecution,
  acquireSourceDiagnosticsQuiesceLease,
  invalidateSourceDiagnosticsRuntimeCaches,
  acquireMarketPrewarmQuiesceLease,
  invalidateMarketPrewarmRuntime,
  onRecoveryRequired: blockBackendForResetRecovery,
  runSerializedTrainingMutation: sessionOps.runSerializedTrainingMutation
});

export const previewTrainingSummary = async (
  symbol?: string,
  timeframe = '1d',
  finalizePriceMode?: PriceMode
): Promise<TrainingSummary> =>
  trainingResetOps.previewTrainingSummary(symbol, timeframe, finalizePriceMode);

export const cleanupStaleSessions = async (keepSessionId?: string) =>
  trainingResetOps.cleanupStaleSessions(keepSessionId);

export const deleteSession = async (sessionId: string): Promise<{ deleted: number; accounts: AccountRow[] }> => {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return { deleted: 0, accounts: listAccounts() };
  }
  return sessionOps.runSerializedTrainingMutation(async () => {
    const deleted = tradingCoreStore.deleteReplaySession(
      DEFAULT_USER_ID,
      normalizedSessionId,
    );
    replayAccountBalancesFromHistory();
    return {
      deleted,
      accounts: listAccounts()
    };
  });
};

export const startResetAllStoredDataJob = (): ResetAllDataJobSnapshot => systemResetOps.startResetAllStoredDataJob();
export const getResetAllStoredDataJob = (jobId: string): ResetAllDataJobSnapshot => systemResetOps.getResetAllStoredDataJob(jobId);
export const resetAllStoredData = async () => systemResetOps.resetAllStoredData();
export const waitForResetAllStoredDataRuntimeIdle = waitForResetAllStoredDataJobIdle;
export const isResetAllStoredDataRuntimeActive = (): boolean => isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive();
export const recoverInterruptedResetAllStoredData = async () => systemResetOps.recoverInterruptedResetAllStoredData();

export const getSystemStorageUsage = async () => getSystemStorageUsageSnapshot();
export const resetAllTraining = async (finalizePriceMode: PriceMode = 'CUR_CLOSE') =>
  trainingResetOps.resetAllTraining(finalizePriceMode);

export const resetSymbolTraining = async (
  symbol: string,
  timeframe = '1d',
  finalizePriceMode: PriceMode = 'CUR_CLOSE'
) => trainingResetOps.resetSymbolTraining(symbol, timeframe, finalizePriceMode);
