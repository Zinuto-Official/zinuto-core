// SPDX-License-Identifier: GPL-3.0-only

import type { TradingExecutionSettings } from '../../domain/trading/types.js';
import { appError } from '../../kernel/appError.js';

const normalizeAssetClass = (
  value: unknown,
  fallback: TradingExecutionSettings['assetClass']
): TradingExecutionSettings['assetClass'] => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'STOCK' ||
    normalized === 'FUTURES' ||
    normalized === 'FOREX' ||
    normalized === 'CRYPTO'
  ) {
    return normalized;
  }
  return fallback;
};

const pickFinite = (value: unknown, fallbackValue: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallbackValue;
};

const pickNonNegative = (value: unknown, fallbackValue: number): number => {
  const numeric = pickFinite(value, fallbackValue);
  return numeric >= 0 ? numeric : fallbackValue;
};

const pickPositive = (value: unknown, fallbackValue: number): number => {
  const numeric = pickFinite(value, fallbackValue);
  return numeric > 0 ? numeric : fallbackValue;
};

const createStoredTradingSettingsError = (reason: string): Error =>
  appError('SESSION_TRADING_SETTINGS_CORRUPTED', { reason });

const readFiniteNumber = (
  source: Record<string, unknown>,
  key: keyof TradingExecutionSettings,
  options: {
    positive?: boolean;
    nonNegative?: boolean;
  } = {},
): number => {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    throw createStoredTradingSettingsError(`MISSING_${String(key)}`);
  }
  const numeric = Number(source[key]);
  if (!Number.isFinite(numeric)) {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  if (options.positive && numeric <= 0) {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  if (options.nonNegative && numeric < 0) {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  return numeric;
};

const readEnumValue = <T extends string>(
  source: Record<string, unknown>,
  key: keyof TradingExecutionSettings,
  allowed: readonly T[],
): T => {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    throw createStoredTradingSettingsError(`MISSING_${String(key)}`);
  }
  const normalized = String(source[key] ?? '').trim().toUpperCase();
  if (!allowed.includes(normalized as T)) {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  return normalized as T;
};

const readStringValue = (
  source: Record<string, unknown>,
  key: keyof TradingExecutionSettings,
): string => {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    throw createStoredTradingSettingsError(`MISSING_${String(key)}`);
  }
  const normalized = String(source[key] ?? '').trim();
  if (!normalized) {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  return normalized;
};

const readBooleanValue = (
  source: Record<string, unknown>,
  key: keyof TradingExecutionSettings,
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    throw createStoredTradingSettingsError(`MISSING_${String(key)}`);
  }
  if (typeof source[key] !== 'boolean') {
    throw createStoredTradingSettingsError(`INVALID_${String(key)}`);
  }
  return source[key] as boolean;
};

const parseStoredTradingExecutionSettings = (
  source: Record<string, unknown>,
): TradingExecutionSettings => ({
  initialSecuritiesBalance: readFiniteNumber(source, 'initialSecuritiesBalance', { positive: true }),
  assetClass: readEnumValue(source, 'assetClass', ['STOCK', 'FUTURES', 'FOREX', 'CRYPTO']),
  marketPresetId: readStringValue(source, 'marketPresetId'),
  minTradeStep: readFiniteNumber(source, 'minTradeStep', { positive: true }),
  commissionRate: readFiniteNumber(source, 'commissionRate', { nonNegative: true }),
  makerFeeRate: readFiniteNumber(source, 'makerFeeRate', { nonNegative: true }),
  takerFeeRate: readFiniteNumber(source, 'takerFeeRate', { nonNegative: true }),
  fundingRate: readFiniteNumber(source, 'fundingRate'),
  contractMultiplier: readFiniteNumber(source, 'contractMultiplier', { positive: true }),
  transferFeeRate: readFiniteNumber(source, 'transferFeeRate', { nonNegative: true }),
  regulatoryFeeRate: readFiniteNumber(source, 'regulatoryFeeRate', { nonNegative: true }),
  platformFeeRate: readFiniteNumber(source, 'platformFeeRate', { nonNegative: true }),
  transactionLevyRate: readFiniteNumber(source, 'transactionLevyRate', { nonNegative: true }),
  slippageRate: readFiniteNumber(source, 'slippageRate', { nonNegative: true }),
  stampDutyRate: readFiniteNumber(source, 'stampDutyRate', { nonNegative: true }),
  commissionMinimumFee: readFiniteNumber(source, 'commissionMinimumFee', { nonNegative: true }),
  platformFeeMinimumFee: readFiniteNumber(source, 'platformFeeMinimumFee', { nonNegative: true }),
  transactionLevyMinimumFee: readFiniteNumber(source, 'transactionLevyMinimumFee', { nonNegative: true }),
  longFinancingAnnualRate: readFiniteNumber(source, 'longFinancingAnnualRate', { nonNegative: true }),
  longInitialMarginRatio: readFiniteNumber(source, 'longInitialMarginRatio', { positive: true }),
  longMaintenanceMarginRatio: readFiniteNumber(source, 'longMaintenanceMarginRatio', { positive: true }),
  shortBorrowAnnualRate: readFiniteNumber(source, 'shortBorrowAnnualRate', { nonNegative: true }),
  shortInitialMarginRatio: readFiniteNumber(source, 'shortInitialMarginRatio', { positive: true }),
  shortMaintenanceMarginRatio: readFiniteNumber(source, 'shortMaintenanceMarginRatio', { positive: true }),
  stampDutyMode: readEnumValue(source, 'stampDutyMode', ['BUY', 'SELL', 'DOUBLE']),
  positionCostMode: readEnumValue(source, 'positionCostMode', ['AVERAGE_OPEN', 'DILUTED']),
  tradeSettlementMode: readEnumValue(source, 'tradeSettlementMode', ['T0', 'T1']),
  freeReplayEndSettlementMode: readEnumValue(source, 'freeReplayEndSettlementMode', [
    'CURRENT_TOTAL_ASSET',
    'FORCE_CLOSE',
  ]),
  tradeAmountIncludesFees: readBooleanValue(source, 'tradeAmountIncludesFees'),
  allowLongMarginTrading: readBooleanValue(source, 'allowLongMarginTrading'),
  allowShortSelling: readBooleanValue(source, 'allowShortSelling'),
});

export const normalizeTradingExecutionSettings = (
  source: Record<string, unknown>,
  fallback: TradingExecutionSettings
): TradingExecutionSettings => {
  const stampDutyModeRaw = String(source.stampDutyMode ?? '').trim().toUpperCase();
  const stampDutyMode: TradingExecutionSettings['stampDutyMode'] =
    stampDutyModeRaw === 'BUY' || stampDutyModeRaw === 'DOUBLE' || stampDutyModeRaw === 'SELL'
      ? stampDutyModeRaw
      : fallback.stampDutyMode;
  const positionCostModeRaw = String(source.positionCostMode ?? '').trim().toUpperCase();
  const positionCostMode: TradingExecutionSettings['positionCostMode'] =
    positionCostModeRaw === 'AVERAGE_OPEN' || positionCostModeRaw === 'DILUTED'
      ? positionCostModeRaw
      : fallback.positionCostMode;
  const tradeSettlementModeRaw = String(source.tradeSettlementMode ?? '').trim().toUpperCase();
  const tradeSettlementMode: TradingExecutionSettings['tradeSettlementMode'] =
    tradeSettlementModeRaw === 'T1' ? 'T1' : tradeSettlementModeRaw === 'T0' ? 'T0' : fallback.tradeSettlementMode;
  const freeReplayEndSettlementModeRaw = String(source.freeReplayEndSettlementMode ?? '').trim().toUpperCase();
  const freeReplayEndSettlementMode: TradingExecutionSettings['freeReplayEndSettlementMode'] =
    freeReplayEndSettlementModeRaw === 'CURRENT_TOTAL_ASSET' || freeReplayEndSettlementModeRaw === 'FORCE_CLOSE'
      ? freeReplayEndSettlementModeRaw
      : fallback.freeReplayEndSettlementMode;

  return {
    initialSecuritiesBalance: pickPositive(source.initialSecuritiesBalance, fallback.initialSecuritiesBalance),
    assetClass: normalizeAssetClass(source.assetClass, fallback.assetClass),
    marketPresetId: String(source.marketPresetId ?? '').trim() || fallback.marketPresetId,
    minTradeStep: pickPositive(source.minTradeStep, fallback.minTradeStep),
    commissionRate: pickNonNegative(source.commissionRate, fallback.commissionRate),
    makerFeeRate: pickNonNegative(source.makerFeeRate, fallback.makerFeeRate),
    takerFeeRate: pickNonNegative(source.takerFeeRate, fallback.takerFeeRate),
    fundingRate: pickFinite(source.fundingRate, fallback.fundingRate),
    contractMultiplier: pickPositive(source.contractMultiplier, fallback.contractMultiplier),
    transferFeeRate: pickNonNegative(source.transferFeeRate, fallback.transferFeeRate),
    regulatoryFeeRate: pickNonNegative(source.regulatoryFeeRate, fallback.regulatoryFeeRate),
    platformFeeRate: pickNonNegative(source.platformFeeRate, fallback.platformFeeRate),
    transactionLevyRate: pickNonNegative(source.transactionLevyRate, fallback.transactionLevyRate),
    slippageRate: pickNonNegative(source.slippageRate, fallback.slippageRate),
    stampDutyRate: pickNonNegative(source.stampDutyRate, fallback.stampDutyRate),
    commissionMinimumFee: pickNonNegative(source.commissionMinimumFee, fallback.commissionMinimumFee),
    platformFeeMinimumFee: pickNonNegative(source.platformFeeMinimumFee, fallback.platformFeeMinimumFee),
    transactionLevyMinimumFee: pickNonNegative(source.transactionLevyMinimumFee, fallback.transactionLevyMinimumFee),
    longFinancingAnnualRate: pickNonNegative(
      source.longFinancingAnnualRate,
      fallback.longFinancingAnnualRate,
    ),
    longInitialMarginRatio: pickPositive(
      source.longInitialMarginRatio,
      fallback.longInitialMarginRatio,
    ),
    longMaintenanceMarginRatio: pickPositive(
      source.longMaintenanceMarginRatio,
      fallback.longMaintenanceMarginRatio,
    ),
    shortBorrowAnnualRate: pickNonNegative(source.shortBorrowAnnualRate, fallback.shortBorrowAnnualRate),
    shortInitialMarginRatio: pickPositive(source.shortInitialMarginRatio, fallback.shortInitialMarginRatio),
    shortMaintenanceMarginRatio: pickPositive(source.shortMaintenanceMarginRatio, fallback.shortMaintenanceMarginRatio),
    stampDutyMode,
    positionCostMode,
    tradeSettlementMode,
    freeReplayEndSettlementMode,
    tradeAmountIncludesFees:
      typeof source.tradeAmountIncludesFees === 'boolean' ? source.tradeAmountIncludesFees : fallback.tradeAmountIncludesFees,
    allowLongMarginTrading:
      typeof source.allowLongMarginTrading === 'boolean'
        ? source.allowLongMarginTrading
        : fallback.allowLongMarginTrading,
    allowShortSelling: typeof source.allowShortSelling === 'boolean' ? source.allowShortSelling : fallback.allowShortSelling
  };
};

export const resolveTradingExecutionSettingsFromStoredJson = (rawJson: unknown): TradingExecutionSettings => {
  const normalizedJson = String(rawJson ?? '').trim();
  if (!normalizedJson) {
    throw createStoredTradingSettingsError('MISSING_STORED_JSON');
  }
  try {
    const parsed = JSON.parse(normalizedJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw createStoredTradingSettingsError('INVALID_STORED_JSON');
    }
    return parseStoredTradingExecutionSettings(parsed as Record<string, unknown>);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    throw createStoredTradingSettingsError('INVALID_STORED_JSON');
  }
};
