// SPDX-License-Identifier: GPL-3.0-only

import { type TrainingProjectRecord } from './historyService.js';

export type TradingAssetClass = 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';

export type ReplayReviewEnvironmentContext = {
  marketPresetId: string;
  marketPresetLabel: string;
  assetClass: TradingAssetClass;
  tradeSettlementMode: 'T0' | 'T1';
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  ruleBadges: string[];
};

export const POSITION_EPSILON = 1e-9;
const DEFAULT_MARKET_PRESET_ID = 'UNKNOWN_MARKET_PRESET';

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const normalizeProjectIds = (projectIds: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const projectId of projectIds) {
    const id = String(projectId ?? '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
};

export const toFixedRound = (value: number, digits = 6): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
};

export const selectRepresentativeProjectIds = <
  T extends { projectId: string; criticalFailure?: boolean },
>(
  metrics: T[],
  weight: (metric: T) => number,
  count = 3,
): string[] =>
  metrics
    .map((metric) => ({
      projectId: metric.projectId,
      weight: Math.abs(normalizeNumber(weight(metric), 0)),
      criticalFailure: metric.criticalFailure ? 1 : 0,
    }))
    .sort((left, right) => {
      if (right.criticalFailure !== left.criticalFailure) {
        return right.criticalFailure - left.criticalFailure;
      }
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      return left.projectId.localeCompare(right.projectId);
    })
    .slice(0, count)
    .map((item) => item.projectId);

export const resolveMarginRatio = (
  value: unknown,
  fallbackPercent: number,
): number => {
  const percent = normalizeNumber(value, fallbackPercent);
  if (!Number.isFinite(percent) || percent <= POSITION_EPSILON) {
    return fallbackPercent / 100;
  }
  return Math.max(POSITION_EPSILON, percent / 100);
};

const resolveTradingAssetClass = (value: unknown): TradingAssetClass => {
  return value === 'STOCK' ||
    value === 'FUTURES' ||
    value === 'FOREX' ||
    value === 'CRYPTO'
    ? value
    : 'STOCK';
};

const resolveSettlementMode = (value: unknown): 'T0' | 'T1' => {
  return value === 'T1' ? 'T1' : 'T0';
};

const buildRuleBadges = (
  tradeSettlementMode: 'T0' | 'T1',
  allowShortSelling: boolean,
  leverageMultiple: number,
  usesMakerTaker: boolean,
): string[] => {
  const badges: string[] = [tradeSettlementMode === 'T1' ? 'T+1' : 'T+0'];
  badges.push(allowShortSelling ? 'LONG_SHORT' : 'ONLY_LONG');
  if (leverageMultiple > 1.01) {
    badges.push(`${toFixedRound(leverageMultiple, 1)}x`);
  }
  if (usesMakerTaker) {
    badges.push('MAKER_TAKER');
  }
  return badges;
};

const resolveProjectedEnvironmentContext = (
  project: TrainingProjectRecord,
): ReplayReviewEnvironmentContext | null => {
  const projection = project.reviewProjection;
  if (!projection) {
    return null;
  }
  const marketPresetId =
    String(projection.marketPresetId || '').trim().toUpperCase() ||
    DEFAULT_MARKET_PRESET_ID;
  return {
    marketPresetId,
    marketPresetLabel: marketPresetId,
    assetClass: resolveTradingAssetClass(projection.assetClass),
    tradeSettlementMode: resolveSettlementMode(projection.tradeSettlementMode),
    allowLongMarginTrading: Boolean(projection.allowLongMarginTrading),
    allowShortSelling: Boolean(projection.allowShortSelling),
    leverageMultiple: toFixedRound(
      Math.max(1, normalizeNumber(projection.leverageMultiple, 1)),
      4,
    ),
    usesMakerTaker: Boolean(projection.usesMakerTaker),
    ruleBadges: buildRuleBadges(
      resolveSettlementMode(projection.tradeSettlementMode),
      Boolean(projection.allowShortSelling),
      Math.max(1, normalizeNumber(projection.leverageMultiple, 1)),
      Boolean(projection.usesMakerTaker),
    ),
  };
};

export const resolveEnvironmentContext = (
  project: TrainingProjectRecord,
): ReplayReviewEnvironmentContext => {
  const projected = resolveProjectedEnvironmentContext(project);
  if (projected) {
    return projected;
  }
  const replayRecord =
    project.replay && typeof project.replay === 'object' && !Array.isArray(project.replay)
      ? project.replay
      : {};
  const snapshotRecord =
    replayRecord.snapshot &&
    typeof replayRecord.snapshot === 'object' &&
    !Array.isArray(replayRecord.snapshot)
      ? (replayRecord.snapshot as Record<string, unknown>)
      : {};
  const settingsRecord =
    snapshotRecord.sessionTradingSettings &&
    typeof snapshotRecord.sessionTradingSettings === 'object' &&
    !Array.isArray(snapshotRecord.sessionTradingSettings)
      ? (snapshotRecord.sessionTradingSettings as Record<string, unknown>)
      : {};
  const marketPresetId =
    String(settingsRecord.marketPresetId ?? '')
      .trim()
      .toUpperCase() || DEFAULT_MARKET_PRESET_ID;
  const assetClass = resolveTradingAssetClass(settingsRecord.assetClass);
  const tradeSettlementMode = resolveSettlementMode(settingsRecord.tradeSettlementMode);
  const allowLongMarginTrading = Boolean(settingsRecord.allowLongMarginTrading);
  const allowShortSelling = Boolean(settingsRecord.allowShortSelling);
  const makerFeeRate = Math.max(0, normalizeNumber(settingsRecord.makerFeeRate));
  const takerFeeRate = Math.max(0, normalizeNumber(settingsRecord.takerFeeRate));
  const usesMakerTaker =
    assetClass !== 'STOCK' &&
    (makerFeeRate > POSITION_EPSILON || takerFeeRate > POSITION_EPSILON);

  const longInitialRatio = allowLongMarginTrading
    ? resolveMarginRatio(settingsRecord.longInitialMarginRatio, 100)
    : 1;
  const shortInitialRatio = allowShortSelling
    ? resolveMarginRatio(settingsRecord.shortInitialMarginRatio, 150)
    : 1;
  const leverageMultiple = Math.max(
    1,
    1 / Math.max(POSITION_EPSILON, Math.min(longInitialRatio, shortInitialRatio)),
  );

  return {
    marketPresetId,
    marketPresetLabel: marketPresetId,
    assetClass,
    tradeSettlementMode,
    allowLongMarginTrading,
    allowShortSelling,
    leverageMultiple: toFixedRound(leverageMultiple, 4),
    usesMakerTaker,
    ruleBadges: buildRuleBadges(
      tradeSettlementMode,
      allowShortSelling,
      leverageMultiple,
      usesMakerTaker,
    ),
  };
};

export const resolveEnvironmentKey = (
  context: ReplayReviewEnvironmentContext,
): string => {
  if (context.marketPresetId && context.marketPresetId !== DEFAULT_MARKET_PRESET_ID) {
    return context.marketPresetId;
  }
  return `${context.assetClass}_${context.tradeSettlementMode}_${context.allowShortSelling ? 'LS' : 'L'}`;
};

export const resolveEnvironmentLabel = (
  context: ReplayReviewEnvironmentContext,
): string => {
  return context.marketPresetId && context.marketPresetId !== DEFAULT_MARKET_PRESET_ID
    ? context.marketPresetId
    : `${context.assetClass} ${context.tradeSettlementMode}`;
};
