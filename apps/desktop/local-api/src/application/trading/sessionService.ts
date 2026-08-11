// SPDX-License-Identifier: GPL-3.0-only

import {
  createOrGetSessionBootstrap as createOrGetSessionBootstrapCore,
  createOrGetSession as createOrGetSessionCore,
  getFreeReplayStartPointOverview as getFreeReplayStartPointOverviewCore,
  getBarTsByInstrumentIdRange as getBarTsByInstrumentIdRangeCore,
  getReplayArchiveBarsByInstrumentIdRawRange as getReplayArchiveBarsByInstrumentIdRawRangeCore,
  getBarsFrameByInstrumentId as getBarsFrameByInstrumentIdCore,
  getBarsByInstrumentIdRange as getBarsByInstrumentIdRangeCore,
  getBarsBySymbolRange as getBarsBySymbolRangeCore,
  getPortfolioSummary as getPortfolioSummaryCore,
  getSessionBootstrapById as getSessionBootstrapByIdCore,
  getSessionRuntimeDelta as getSessionRuntimeDeltaCore,
  getSessionSnapshot as getSessionSnapshotCore,
  getTradingSettings as getTradingSettingsCore,
  listInstruments as listInstrumentsCore,
  setSessionPlayback as setSessionPlaybackCore,
  setTradingSettings as setTradingSettingsCore,
  updateSessionTradingSettings as updateSessionTradingSettingsCore,
  stepSession as stepSessionCore
} from './core.js';
import { DEFAULT_USER_ID } from '../ports/infrastructure/db/database.js';
import { appError, isAppError } from '../../kernel/appError.js';
import type { SessionRow } from '../../domain/trading/types.js';
import { listLatestResumableSessionCandidates } from '../ports/infrastructure/db/trading/sessionResumeStore.js';
import {
  assertReplayInstrumentReadAccess,
  ensureReplaySessionDataGrant,
  resolveReplaySessionDataGrant,
} from '../trainingDataAccessService.js';
import {
  resolveFreeReplaySessionTradingSettings,
  type FreeReplayTradingEnvironment,
} from './freeReplayEnvironmentSettings.js';
import type { FreeReplayAdvancePeriod } from '@zinuto/shared/period';

const replaySessionMutationQueue = new Map<string, Promise<void>>();

const normalizeSessionId = (value: unknown): string => String(value ?? '').trim();

export const runWithReplaySessionMutationLock = async <T>(
  sessionIdRaw: string,
  runner: () => Promise<T>,
): Promise<T> => {
  const sessionId = normalizeSessionId(sessionIdRaw);
  if (!sessionId) {
    throw appError('SESSION_NOT_FOUND');
  }
  const previous = replaySessionMutationQueue.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(runner);
  const marker = next.then(
    () => undefined,
    () => undefined,
  );
  replaySessionMutationQueue.set(sessionId, marker);
  try {
    return await next;
  } finally {
    if (replaySessionMutationQueue.get(sessionId) === marker) {
      replaySessionMutationQueue.delete(sessionId);
    }
  }
};

export const isReplaySessionMutationInFlight = (sessionIdRaw: string): boolean =>
  replaySessionMutationQueue.has(normalizeSessionId(sessionIdRaw));

export const createOrGetSession: typeof createOrGetSessionCore = async (
  symbol,
  timeframe,
  forceNew,
  anchorIndex,
  options,
) =>
  createOrGetSessionCore(symbol, timeframe, forceNew, anchorIndex, {
    ...options,
    accessGrant: await resolveReplaySessionDataGrant({
      symbol,
      timeframe: timeframe ?? '1d',
      instrumentId: options?.instrumentId,
      samplePoolId: options?.samplePoolId,
    }),
  });
export const createOrGetSessionBootstrap: typeof createOrGetSessionBootstrapCore = async (
  symbol,
  timeframe,
  forceNew,
  anchorIndex,
  options,
) =>
  createOrGetSessionBootstrapCore(symbol, timeframe, forceNew, anchorIndex, {
    ...options,
    accessGrant: await resolveReplaySessionDataGrant({
      symbol,
      timeframe: timeframe ?? '1d',
      instrumentId: options?.instrumentId,
      samplePoolId: options?.samplePoolId,
    }),
  });
export const getFreeReplayStartPointOverview: typeof getFreeReplayStartPointOverviewCore = async (
  instrumentId,
  ...args
) => {
  await assertReplayInstrumentReadAccess(instrumentId);
  return getFreeReplayStartPointOverviewCore(instrumentId, ...args);
};

export const startPreparedFreeReplaySession = async (payload: {
  mode: 'RANDOM' | 'FOCUSED';
  selectedPoolId?: string;
  selectedPoolName?: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
  selectedAnchorIndex?: number;
  minimumBaseTimeframe?: FreeReplayAdvancePeriod;
  tradingEnvironment: FreeReplayTradingEnvironment;
}) => {
  const selectedPoolId = String(payload.selectedPoolId || '').trim();
  const selectedInstrumentId = String(payload.selectedInstrumentId || '').trim();
  const selectedSymbol = String(payload.selectedSymbol || '').trim().toUpperCase();
  if (!selectedPoolId) {
    throw appError('FREE_REPLAY_SELECTION_STALE', {}, 409);
  }

  // Resolve only the submitted pool and one instrument at start time. The
  // preparation screen intentionally does not send a full candidate list.
  const { resolveFreeReplayStartSelection } = await import(
    './freeReplayPrepReadModel.js',
  );
  const picked = await resolveFreeReplayStartSelection({
    mode: payload.mode,
    selectedPoolId,
    selectedInstrumentId: selectedInstrumentId || undefined,
    selectedSymbol: selectedSymbol || undefined,
  });
  if (!picked) {
    throw appError('FREE_REPLAY_SELECTION_STALE', {}, 409);
  }
  if (
    payload.mode === 'FOCUSED' &&
    selectedSymbol &&
    picked.symbol !== selectedSymbol
  ) {
    throw appError('FREE_REPLAY_SELECTION_STALE', {}, 409);
  }
  const sessionTradingSettings = resolveFreeReplaySessionTradingSettings(
    getTradingSettings(),
    payload.tradingEnvironment,
  );

  let bootstrap;
  try {
    bootstrap = await createOrGetSessionBootstrap(
      picked.symbol,
      picked.sourceTimeframe,
      true,
      Number.isFinite(payload.selectedAnchorIndex)
        ? Math.max(0, Math.floor(Number(payload.selectedAnchorIndex)))
        : undefined,
      {
        instrumentId: picked.instrumentId,
        samplePoolId: picked.poolId,
        minimumBaseTimeframe: payload.minimumBaseTimeframe,
        sessionTradingSettings,
      },
    );
  } catch (error) {
    if (
      isAppError(error) &&
      [
        'INSTRUMENT_NOT_FOUND',
        'LOCAL_DATA_SOURCE_NOT_READY',
        'LOCAL_DATA_SOURCE_IMPORTING',
        'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
      ].includes(error.code)
    ) {
      throw appError('FREE_REPLAY_SELECTION_STALE', {}, 409);
    }
    throw error;
  }

  return {
    selected: {
      ...picked,
      anchorIndex:
        Number.isFinite(payload.selectedAnchorIndex)
          ? Math.max(0, Math.floor(Number(payload.selectedAnchorIndex)))
          : null,
      instrumentId: String(
        bootstrap.snapshot.session.instrument_id ||
          bootstrap.session.instrument_id ||
          '',
      ).trim(),
    },
    bootstrap,
  };
};
export const getBarsBySymbolRange: typeof getBarsBySymbolRangeCore = (...args) => getBarsBySymbolRangeCore(...args);
export const getBarsFrameByInstrumentId: typeof getBarsFrameByInstrumentIdCore = async (
  instrumentId,
  ...args
) => {
  await assertReplayInstrumentReadAccess(instrumentId);
  return getBarsFrameByInstrumentIdCore(instrumentId, ...args);
};
export const getBarsByInstrumentIdRange: typeof getBarsByInstrumentIdRangeCore = async (
  instrumentId,
  ...args
) => {
  await assertReplayInstrumentReadAccess(instrumentId);
  return getBarsByInstrumentIdRangeCore(instrumentId, ...args);
};
export const getReplayArchiveBarsByInstrumentIdRawRange: typeof getReplayArchiveBarsByInstrumentIdRawRangeCore = async (
  instrumentId,
  ...args
) => {
  await assertReplayInstrumentReadAccess(instrumentId);
  return getReplayArchiveBarsByInstrumentIdRawRangeCore(instrumentId, ...args);
};
export const getBarTsByInstrumentIdRange: typeof getBarTsByInstrumentIdRangeCore = (...args) =>
  getBarTsByInstrumentIdRangeCore(...args);
export const getLatestResumableSession = async () => {
  const candidates = listLatestResumableSessionCandidates(DEFAULT_USER_ID);

  for (const candidate of candidates) {
    try {
      await ensureReplaySessionDataGrant(candidate.sessionId);
      const snapshot = await getSessionSnapshotCore(candidate.sessionId, null);
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
        updatedAt: String(candidate.updatedAt || '').trim(),
      };
    } catch {
      continue;
    }
  }

  return null;
};
export const getPortfolioSummary: typeof getPortfolioSummaryCore = (...args) => getPortfolioSummaryCore(...args);
export const getSessionBootstrapById: typeof getSessionBootstrapByIdCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return getSessionBootstrapByIdCore(sessionId, ...args);
};
export const getSessionSnapshot: typeof getSessionSnapshotCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return getSessionSnapshotCore(sessionId, ...args);
};
export const getSessionRuntimeDelta: typeof getSessionRuntimeDeltaCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return getSessionRuntimeDeltaCore(sessionId, ...args);
};
export const getTradingSettings: typeof getTradingSettingsCore = (...args) => getTradingSettingsCore(...args);
export const listInstruments: typeof listInstrumentsCore = (...args) => listInstrumentsCore(...args);
export const setSessionPlayback = async (
  sessionId: string,
  intervalMs: number,
  isPaused: boolean,
): Promise<SessionRow> => {
  await ensureReplaySessionDataGrant(sessionId);
  return setSessionPlaybackCore(sessionId, intervalMs, isPaused);
};
export const setTradingSettings: typeof setTradingSettingsCore = (...args) => setTradingSettingsCore(...args);
export const updateSessionTradingSettings: typeof updateSessionTradingSettingsCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return updateSessionTradingSettingsCore(sessionId, ...args);
};
export const stepSession: typeof stepSessionCore = async (sessionId, ...args) => {
  await ensureReplaySessionDataGrant(sessionId);
  return stepSessionCore(sessionId, ...args);
};
