// SPDX-License-Identifier: GPL-3.0-only

import {
  createReplaySessionDataGrant,
  parseReplaySessionDataGrantJson,
  serializeReplaySessionDataGrant,
  type ReplaySessionDataGrant,
} from './trainingDataAccessGrant.js';
import { isLocalDataSourceEligibleForTraining } from '@zinuto/shared/localDataSourceEligibility';
import { nowIso } from '../kernel/time.js';
import { appError } from '../kernel/appError.js';
import {
  getInstrumentMembershipTargetRowById,
  getInstrumentMembershipTargetRowBySourceSymbol,
  getLocalSourceMembershipRowById,
  getReplaySessionAccessRecordRow,
  getSystemInstrumentIdBySymbol,
  updateReplaySessionAccessGrantJson,
  type InstrumentMembershipTargetRow,
  type LocalSourceMembershipRow,
  type ReplaySessionAccessRecordRow,
} from './ports/infrastructure/db/training/trainingMembershipStore.js';

const normalizeText = (value: unknown): string => String(value ?? '').trim();
const normalizeSymbol = (value: unknown): string =>
  normalizeText(value).toUpperCase();
const normalizeTimeframe = (value: unknown): string =>
  normalizeText(value).toLowerCase();

type InstrumentDataTarget = {
  id: string;
  sourceId: string;
  symbol: string;
  timeframe: string;
  market: string;
  localSourceId: string;
  localSourceStatus: string;
  localSourceDeletionState: string;
};

const normalizeInstrumentDataTarget = (
  row: InstrumentMembershipTargetRow | null,
): InstrumentDataTarget | null => {
  if (!row) {
    return null;
  }
  const id = normalizeText(row.id);
  const symbol = normalizeSymbol(row.symbol);
  const timeframe = normalizeTimeframe(row.baseTimeframe);
  if (!id || !symbol || !timeframe) {
    return null;
  }
  return {
    id,
    sourceId: normalizeText(row.sourceId),
    symbol,
    timeframe,
    market: normalizeText(row.market).toUpperCase(),
    localSourceId: normalizeText(row.localSourceId),
    localSourceStatus: normalizeText(row.localSourceStatus).toUpperCase(),
    localSourceDeletionState: normalizeText(
      row.localSourceDeletionState,
    ).toUpperCase(),
  };
};

const getInstrumentDataTargetById = (
  instrumentIdRaw: unknown,
): InstrumentDataTarget | null => {
  const instrumentId = normalizeText(instrumentIdRaw);
  return instrumentId
    ? normalizeInstrumentDataTarget(
        getInstrumentMembershipTargetRowById(instrumentId),
      )
    : null;
};

const assertLocalSourceAvailable = (
  source:
    | LocalSourceMembershipRow
    | Pick<
        InstrumentDataTarget,
        'localSourceId' | 'localSourceStatus' | 'localSourceDeletionState'
      >
    | null,
  sourceId: string,
): void => {
  const id = normalizeText(
    source && 'localSourceId' in source ? source.localSourceId : source?.id,
  );
  const status = normalizeText(
    source && 'localSourceStatus' in source
      ? source.localSourceStatus
      : source?.status,
  ).toUpperCase();
  const deletionState = normalizeText(
    source && 'localSourceDeletionState' in source
      ? source.localSourceDeletionState
      : source?.deletionState,
  ).toUpperCase();
  if (!source || id !== sourceId) {
    throw appError('LOCAL_DATA_SOURCE_NOT_READY', { sourceId }, 409);
  }
  if (status === 'IMPORTING') {
    throw appError('LOCAL_DATA_SOURCE_IMPORTING', { sourceId }, 409);
  }
  if (deletionState === 'MUTATING_SYMBOLS') {
    throw appError(
      'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
      { sourceId },
      409,
    );
  }
  if (
    !isLocalDataSourceEligibleForTraining({
      status,
      deletionState,
    })
  ) {
    throw appError('LOCAL_DATA_SOURCE_NOT_READY', { sourceId }, 409);
  }
};

const validateStoredGrant = (input: {
  grant: ReplaySessionDataGrant;
  samplePoolId?: unknown;
  symbol?: unknown;
  timeframe?: unknown;
}): boolean =>
  input.grant.symbol === normalizeSymbol(input.symbol) &&
  input.grant.timeframe === normalizeTimeframe(input.timeframe) &&
  input.grant.samplePoolId === normalizeText(input.samplePoolId);

const isEquivalentGrant = (
  left: ReplaySessionDataGrant,
  right: ReplaySessionDataGrant,
): boolean =>
  left.scopeKind === right.scopeKind &&
  left.samplePoolId === right.samplePoolId &&
  left.symbol === right.symbol &&
  left.timeframe === right.timeframe;

const isStoredSourceAvailable = (
  record: ReplaySessionAccessRecordRow,
): boolean =>
  Boolean(normalizeText(record.samplePoolId)) &&
  normalizeText(record.instrumentSourceId) === normalizeText(record.samplePoolId) &&
  normalizeText(record.localSourceId) === normalizeText(record.samplePoolId) &&
  normalizeText(record.localSourceStatus).toUpperCase() === 'READY' &&
  normalizeText(record.localSourceDeletionState).toUpperCase() === 'IDLE';

const canReuseStoredGrant = (
  record: ReplaySessionAccessRecordRow,
  grant: ReplaySessionDataGrant,
): boolean => {
  if (
    !validateStoredGrant({
      grant,
      samplePoolId: record.samplePoolId,
      symbol: record.symbol,
      timeframe: record.timeframe,
    })
  ) {
    return false;
  }
  const market = normalizeText(record.market).toUpperCase();
  if (market === 'SYSTEM') {
    return grant.scopeKind === 'SYSTEM_INSTRUMENT';
  }
  return market === 'LOCAL' &&
    grant.scopeKind === 'LOCAL_SOURCE' &&
    isStoredSourceAvailable(record);
};

const readSessionDataAccessState = (
  sessionIdRaw: string,
): {
  record: ReplaySessionAccessRecordRow;
  storedGrant: ReplaySessionDataGrant | null;
  validStoredGrant: ReplaySessionDataGrant | null;
} => {
  const sessionId = normalizeText(sessionIdRaw);
  if (!sessionId) {
    throw appError('SESSION_NOT_FOUND');
  }
  const record = getReplaySessionAccessRecordRow(sessionId);
  if (!record || normalizeText(record.sessionScope) !== 'OFFICIAL') {
    throw appError('SESSION_NOT_FOUND');
  }
  const storedGrant = parseReplaySessionDataGrantJson(record.accessGrantJson);
  return {
    record,
    storedGrant,
    validStoredGrant:
      storedGrant && canReuseStoredGrant(record, storedGrant)
        ? storedGrant
        : null,
  };
};

export const readValidStoredReplaySessionDataGrant = (
  sessionIdRaw: string,
): ReplaySessionDataGrant | null =>
  readSessionDataAccessState(sessionIdRaw).validStoredGrant;

const createGrant = (input: {
  scopeKind: ReplaySessionDataGrant['scopeKind'];
  samplePoolId: string;
  symbol: string;
  timeframe: string;
}): ReplaySessionDataGrant =>
  createReplaySessionDataGrant({ ...input, grantedAt: nowIso() });

export const resolveReplaySessionDataGrant = async ({
  symbol,
  timeframe,
  instrumentId,
  samplePoolId,
}: {
  symbol: string;
  timeframe: string;
  instrumentId?: string;
  samplePoolId?: string;
}): Promise<ReplaySessionDataGrant> => {
  const normalizedInstrumentId = normalizeText(instrumentId);
  let target = getInstrumentDataTargetById(normalizedInstrumentId);
  if (normalizedInstrumentId && !target) {
    throw appError(
      'INSTRUMENT_NOT_FOUND',
      { instrumentId: normalizedInstrumentId },
      404,
    );
  }
  const requestedSymbol = normalizeSymbol(symbol);
  const requestedTimeframe = normalizeTimeframe(timeframe);
  const requestedPoolId = normalizeText(samplePoolId);
  if (!target && requestedPoolId && requestedSymbol && requestedTimeframe) {
    target = normalizeInstrumentDataTarget(
      getInstrumentMembershipTargetRowBySourceSymbol(
        requestedPoolId,
        requestedSymbol,
        requestedTimeframe,
      ),
    );
  }
  const normalizedSymbol = target?.symbol ?? requestedSymbol;
  const normalizedTimeframe = target?.timeframe ?? requestedTimeframe;
  const normalizedPoolId = target?.sourceId || requestedPoolId;
  if (!normalizedSymbol || !normalizedTimeframe) {
    throw appError('INVALID_PARAMS');
  }
  if (
    target?.market === 'SYSTEM' ||
    (!target && getSystemInstrumentIdBySymbol(normalizedSymbol, normalizedTimeframe))
  ) {
    return createGrant({
      scopeKind: 'SYSTEM_INSTRUMENT',
      samplePoolId: normalizedPoolId,
      symbol: normalizedSymbol,
      timeframe: normalizedTimeframe,
    });
  }
  if (target && target.market !== 'LOCAL') {
    throw appError('INSTRUMENT_NOT_FOUND', { instrumentId: target.id }, 404);
  }
  if (!normalizedPoolId) {
    throw appError('LOCAL_DATA_SOURCE_NOT_READY', { sourceId: '' }, 409);
  }
  assertLocalSourceAvailable(
    target ?? getLocalSourceMembershipRowById(normalizedPoolId),
    normalizedPoolId,
  );
  if (!target) {
    throw appError('INSTRUMENT_NOT_FOUND', { instrumentId: '' }, 404);
  }
  return createGrant({
    scopeKind: 'LOCAL_SOURCE',
    samplePoolId: normalizedPoolId,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  });
};

export const assertReplayInstrumentReadAccess = async (
  instrumentId: string,
): Promise<ReplaySessionDataGrant> =>
  resolveReplaySessionDataGrant({
    symbol: '',
    timeframe: '',
    instrumentId,
  });

export const ensureReplaySessionDataGrant = async (
  sessionIdRaw: string,
): Promise<ReplaySessionDataGrant> => {
  const { record, storedGrant, validStoredGrant } =
    readSessionDataAccessState(sessionIdRaw);
  if (validStoredGrant) {
    return validStoredGrant;
  }
  const nextGrant = await resolveReplaySessionDataGrant({
    symbol: record.symbol,
    timeframe: record.timeframe,
    instrumentId: record.instrumentId,
    samplePoolId: record.samplePoolId,
  });
  const grantedAt =
    storedGrant && isEquivalentGrant(storedGrant, nextGrant)
      ? storedGrant.grantedAt
      : nextGrant.grantedAt;
  const persistedGrant = { ...nextGrant, grantedAt };
  updateReplaySessionAccessGrantJson({
    sessionId: record.sessionId,
    updatedAt: nowIso(),
    accessGrantJson: serializeReplaySessionDataGrant(persistedGrant),
  });
  return persistedGrant;
};
