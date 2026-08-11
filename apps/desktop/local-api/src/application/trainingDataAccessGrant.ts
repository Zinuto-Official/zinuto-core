// SPDX-License-Identifier: GPL-3.0-only

export type ReplaySessionDataGrantScopeKind =
  | 'SYSTEM_INSTRUMENT'
  | 'LOCAL_SOURCE';

export type ReplaySessionDataGrant = {
  grantVersion: 2;
  scopeKind: ReplaySessionDataGrantScopeKind;
  samplePoolId: string;
  symbol: string;
  timeframe: string;
  grantedAt: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeScopeKind = (
  value: unknown,
): ReplaySessionDataGrantScopeKind | null => {
  const normalized = normalizeText(value).toUpperCase();
  return normalized === 'SYSTEM_INSTRUMENT' || normalized === 'LOCAL_SOURCE'
    ? normalized
    : null;
};

export const createReplaySessionDataGrant = (input: {
  scopeKind: ReplaySessionDataGrantScopeKind;
  samplePoolId?: string | null;
  symbol: string;
  timeframe: string;
  grantedAt: string;
}): ReplaySessionDataGrant => ({
  grantVersion: 2,
  scopeKind: input.scopeKind,
  samplePoolId: normalizeText(input.samplePoolId),
  symbol: normalizeText(input.symbol).toUpperCase(),
  timeframe: normalizeText(input.timeframe).toLowerCase(),
  grantedAt: normalizeText(input.grantedAt),
});

export const parseReplaySessionDataGrant = (
  raw: unknown,
): ReplaySessionDataGrant | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const scopeKind = normalizeScopeKind(record.scopeKind);
  const symbol = normalizeText(record.symbol).toUpperCase();
  const timeframe = normalizeText(record.timeframe).toLowerCase();
  const grantedAt = normalizeText(record.grantedAt);
  if (
    Number(record.grantVersion) !== 2 ||
    !scopeKind ||
    !symbol ||
    !timeframe ||
    !grantedAt
  ) {
    return null;
  }
  return {
    grantVersion: 2,
    scopeKind,
    samplePoolId: normalizeText(record.samplePoolId),
    symbol,
    timeframe,
    grantedAt,
  };
};

export const parseReplaySessionDataGrantJson = (
  rawJson: unknown,
): ReplaySessionDataGrant | null => {
  const rawText = normalizeText(rawJson);
  if (!rawText || rawText === 'null') {
    return null;
  }
  try {
    return parseReplaySessionDataGrant(JSON.parse(rawText));
  } catch {
    return null;
  }
};

export const serializeReplaySessionDataGrant = (
  grant: ReplaySessionDataGrant,
): string => JSON.stringify(grant);
