// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@/domains/training/types';
import { parseNumeric } from '@/ui/formatting/format';

export const DEFAULT_TRADING_SETTINGS_FORM_VALUES = {
  initialSecuritiesInput: '50,000',
  minTradeStepInput: '100',
  commissionRateInput: '0.03',
  makerFeeRateInput: '0',
  takerFeeRateInput: '0',
  fundingRateInput: '0',
  contractMultiplierInput: '1',
  transferFeeRateInput: '0.001',
  regulatoryFeeRateInput: '0.00341',
  platformFeeRateInput: '0',
  transactionLevyRateInput: '0',
  slippageRateInput: '0.01',
  stampDutyRateInput: '0.05',
  commissionMinimumFeeInput: '5',
  platformFeeMinimumFeeInput: '0',
  transactionLevyMinimumFeeInput: '0',
  longFinancingAnnualRateInput: '0',
  longInitialMarginRatioInput: '100',
  longMaintenanceMarginRatioInput: '100',
  shortBorrowAnnualRateInput: '6',
  shortInitialMarginRatioInput: '150',
  shortMaintenanceMarginRatioInput: '130'
} as const;

export type TradingSettingsFormDraft = {
  initialSecuritiesInput: string;
  assetClass: TradingSettings['assetClass'];
  marketPresetId: string;
  minTradeStepInput: string;
  commissionRateInput: string;
  makerFeeRateInput: string;
  takerFeeRateInput: string;
  fundingRateInput: string;
  contractMultiplierInput: string;
  transferFeeRateInput: string;
  regulatoryFeeRateInput: string;
  platformFeeRateInput: string;
  transactionLevyRateInput: string;
  slippageRateInput: string;
  stampDutyRateInput: string;
  commissionMinimumFeeInput: string;
  platformFeeMinimumFeeInput: string;
  transactionLevyMinimumFeeInput: string;
  longFinancingAnnualRateInput: string;
  longInitialMarginRatioInput: string;
  longMaintenanceMarginRatioInput: string;
  shortBorrowAnnualRateInput: string;
  shortInitialMarginRatioInput: string;
  shortMaintenanceMarginRatioInput: string;
  stampDutyMode: TradingSettings['stampDutyMode'];
  positionCostMode: TradingSettings['positionCostMode'];
  tradeSettlementMode: TradingSettings['tradeSettlementMode'];
  freeReplayEndSettlementMode: TradingSettings['freeReplayEndSettlementMode'];
  tradeAmountIncludesFees: boolean;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
};

type TradingSettingsValidationErrorCode =
  | 'INVALID_INITIAL_SECURITIES'
  | 'NEGATIVE_RATE'
  | 'INVALID_MARGIN_RATIO'
  | 'INVALID_STEP_OR_MULTIPLIER'
  | 'INVALID_ASSET_CLASS_OR_MARKET';

export type TradingSettingsPayload = {
  initialSecuritiesBalance: number;
  assetClass: TradingSettings['assetClass'];
  marketPresetId: string;
  minTradeStep: number;
  commissionRate: number;
  makerFeeRate: number;
  takerFeeRate: number;
  fundingRate: number;
  contractMultiplier: number;
  transferFeeRate: number;
  regulatoryFeeRate: number;
  platformFeeRate: number;
  transactionLevyRate: number;
  slippageRate: number;
  stampDutyRate: number;
  commissionMinimumFee: number;
  platformFeeMinimumFee: number;
  transactionLevyMinimumFee: number;
  longFinancingAnnualRate: number;
  longInitialMarginRatio: number;
  longMaintenanceMarginRatio: number;
  shortBorrowAnnualRate: number;
  shortInitialMarginRatio: number;
  shortMaintenanceMarginRatio: number;
  stampDutyMode: TradingSettings['stampDutyMode'];
  positionCostMode: TradingSettings['positionCostMode'];
  tradeSettlementMode: TradingSettings['tradeSettlementMode'];
  freeReplayEndSettlementMode: TradingSettings['freeReplayEndSettlementMode'];
  tradeAmountIncludesFees: boolean;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
};

type TradingSettingsDraftParseResult =
  | {
    ok: true;
    payload: TradingSettingsPayload;
  }
  | {
    ok: false;
    errorCode: TradingSettingsValidationErrorCode;
  };

const RATE_EPSILON = 1e-12;
const MARGIN_RATIO_MAX_PERCENT = 1000;

const isSameRate = (left: number, right: number): boolean => Math.abs(left - right) <= RATE_EPSILON;

const parseRateInput = (rawInput: string): number | null => {
  const normalized = String(rawInput ?? '').replace(/,/g, '').trim();
  if (!normalized || normalized === '.') {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export const parseTradingSettingsDraft = (
  draft: TradingSettingsFormDraft
): TradingSettingsDraftParseResult => {
  const securities = parseNumeric(draft.initialSecuritiesInput);
  const minTradeStep = parseRateInput(draft.minTradeStepInput);
  const commissionRate = parseRateInput(draft.commissionRateInput);
  const makerFeeRate = parseRateInput(draft.makerFeeRateInput);
  const takerFeeRate = parseRateInput(draft.takerFeeRateInput);
  const fundingRate = parseRateInput(draft.fundingRateInput);
  const contractMultiplier = parseRateInput(draft.contractMultiplierInput);
  const transferFeeRate = parseRateInput(draft.transferFeeRateInput);
  const regulatoryFeeRate = parseRateInput(draft.regulatoryFeeRateInput);
  const platformFeeRate = parseRateInput(draft.platformFeeRateInput);
  const transactionLevyRate = parseRateInput(draft.transactionLevyRateInput);
  const slippageRate = parseRateInput(draft.slippageRateInput);
  const stampDutyRate = parseRateInput(draft.stampDutyRateInput);
  const commissionMinimumFee = parseRateInput(draft.commissionMinimumFeeInput);
  const platformFeeMinimumFee = parseRateInput(draft.platformFeeMinimumFeeInput);
  const transactionLevyMinimumFee = parseRateInput(draft.transactionLevyMinimumFeeInput);
  const longFinancingAnnualRate = parseRateInput(draft.longFinancingAnnualRateInput);
  const longInitialMarginRatio = parseRateInput(draft.longInitialMarginRatioInput);
  const longMaintenanceMarginRatio = parseRateInput(draft.longMaintenanceMarginRatioInput);
  const shortBorrowAnnualRate = parseRateInput(draft.shortBorrowAnnualRateInput);
  const shortInitialMarginRatio = parseRateInput(draft.shortInitialMarginRatioInput);
  const shortMaintenanceMarginRatio = parseRateInput(draft.shortMaintenanceMarginRatioInput);

  if (!Number.isInteger(securities) || securities <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_INITIAL_SECURITIES'
    };
  }
  const marketPresetId = String(draft.marketPresetId || '').trim();
  if (
    (draft.assetClass !== 'STOCK' &&
      draft.assetClass !== 'FUTURES' &&
      draft.assetClass !== 'FOREX' &&
      draft.assetClass !== 'CRYPTO') ||
    !marketPresetId
  ) {
    return {
      ok: false,
      errorCode: 'INVALID_ASSET_CLASS_OR_MARKET'
    };
  }

  if (
    minTradeStep === null ||
    commissionRate === null ||
    makerFeeRate === null ||
    takerFeeRate === null ||
    fundingRate === null ||
    contractMultiplier === null ||
    transferFeeRate === null ||
    regulatoryFeeRate === null ||
    platformFeeRate === null ||
    transactionLevyRate === null ||
    slippageRate === null ||
    stampDutyRate === null ||
    commissionMinimumFee === null ||
    platformFeeMinimumFee === null ||
    transactionLevyMinimumFee === null ||
    longFinancingAnnualRate === null ||
    shortBorrowAnnualRate === null ||
    minTradeStep < 0 ||
    commissionRate < 0 ||
    makerFeeRate < 0 ||
    takerFeeRate < 0 ||
    contractMultiplier < 0 ||
    transferFeeRate < 0 ||
    regulatoryFeeRate < 0 ||
    platformFeeRate < 0 ||
    transactionLevyRate < 0 ||
    slippageRate < 0 ||
    stampDutyRate < 0 ||
    commissionMinimumFee < 0 ||
    platformFeeMinimumFee < 0 ||
    transactionLevyMinimumFee < 0 ||
    longFinancingAnnualRate < 0 ||
    shortBorrowAnnualRate < 0
  ) {
    return {
      ok: false,
      errorCode: 'NEGATIVE_RATE'
    };
  }
  if (minTradeStep <= 0 || contractMultiplier <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_STEP_OR_MULTIPLIER'
    };
  }
  if (
    longInitialMarginRatio === null ||
    longMaintenanceMarginRatio === null ||
    longInitialMarginRatio <= 0 ||
    longInitialMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
    longMaintenanceMarginRatio <= 0 ||
    longMaintenanceMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
    longMaintenanceMarginRatio - longInitialMarginRatio > RATE_EPSILON ||
    shortInitialMarginRatio === null ||
    shortMaintenanceMarginRatio === null ||
    shortInitialMarginRatio <= 0 ||
    shortInitialMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
    shortMaintenanceMarginRatio <= 0 ||
    shortMaintenanceMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
    shortMaintenanceMarginRatio - shortInitialMarginRatio > RATE_EPSILON
  ) {
    return {
      ok: false,
      errorCode: 'INVALID_MARGIN_RATIO'
    };
  }

  return {
    ok: true,
    payload: {
      initialSecuritiesBalance: securities,
      assetClass: draft.assetClass,
      marketPresetId,
      minTradeStep,
      commissionRate,
      makerFeeRate,
      takerFeeRate,
      fundingRate,
      contractMultiplier,
      transferFeeRate,
      regulatoryFeeRate,
      platformFeeRate,
      transactionLevyRate,
      slippageRate,
      stampDutyRate,
      commissionMinimumFee,
      platformFeeMinimumFee,
      transactionLevyMinimumFee,
      longFinancingAnnualRate,
      longInitialMarginRatio,
      longMaintenanceMarginRatio,
      shortBorrowAnnualRate,
      shortInitialMarginRatio,
      shortMaintenanceMarginRatio,
      stampDutyMode: draft.stampDutyMode,
      positionCostMode: draft.positionCostMode,
      tradeSettlementMode: draft.tradeSettlementMode,
      freeReplayEndSettlementMode: draft.freeReplayEndSettlementMode,
      tradeAmountIncludesFees: draft.tradeAmountIncludesFees,
      allowLongMarginTrading: draft.allowLongMarginTrading,
      allowShortSelling: draft.allowShortSelling
    }
  };
};

export const isTradingSettingsPayloadChanged = (
  payload: TradingSettingsPayload,
  baseline: TradingSettings
): boolean => {
  if (payload.initialSecuritiesBalance !== baseline.initialSecuritiesBalance) {
    return true;
  }
  if (payload.assetClass !== baseline.assetClass) {
    return true;
  }
  if (payload.marketPresetId !== baseline.marketPresetId) {
    return true;
  }
  if (!isSameRate(payload.minTradeStep, baseline.minTradeStep)) {
    return true;
  }
  if (!isSameRate(payload.commissionRate, baseline.commissionRate)) {
    return true;
  }
  if (!isSameRate(payload.makerFeeRate, baseline.makerFeeRate)) {
    return true;
  }
  if (!isSameRate(payload.takerFeeRate, baseline.takerFeeRate)) {
    return true;
  }
  if (!isSameRate(payload.fundingRate, baseline.fundingRate)) {
    return true;
  }
  if (!isSameRate(payload.contractMultiplier, baseline.contractMultiplier)) {
    return true;
  }
  if (!isSameRate(payload.transferFeeRate, baseline.transferFeeRate)) {
    return true;
  }
  if (!isSameRate(payload.regulatoryFeeRate, baseline.regulatoryFeeRate)) {
    return true;
  }
  if (!isSameRate(payload.platformFeeRate, baseline.platformFeeRate)) {
    return true;
  }
  if (!isSameRate(payload.transactionLevyRate, baseline.transactionLevyRate)) {
    return true;
  }
  if (!isSameRate(payload.slippageRate, baseline.slippageRate)) {
    return true;
  }
  if (!isSameRate(payload.stampDutyRate, baseline.stampDutyRate)) {
    return true;
  }
  if (!isSameRate(payload.commissionMinimumFee, baseline.commissionMinimumFee)) {
    return true;
  }
  if (!isSameRate(payload.platformFeeMinimumFee, baseline.platformFeeMinimumFee)) {
    return true;
  }
  if (!isSameRate(payload.transactionLevyMinimumFee, baseline.transactionLevyMinimumFee)) {
    return true;
  }
  if (!isSameRate(payload.longFinancingAnnualRate, baseline.longFinancingAnnualRate)) {
    return true;
  }
  if (!isSameRate(payload.longInitialMarginRatio, baseline.longInitialMarginRatio)) {
    return true;
  }
  if (!isSameRate(payload.longMaintenanceMarginRatio, baseline.longMaintenanceMarginRatio)) {
    return true;
  }
  if (!isSameRate(payload.shortBorrowAnnualRate, baseline.shortBorrowAnnualRate)) {
    return true;
  }
  if (!isSameRate(payload.shortInitialMarginRatio, baseline.shortInitialMarginRatio)) {
    return true;
  }
  if (!isSameRate(payload.shortMaintenanceMarginRatio, baseline.shortMaintenanceMarginRatio)) {
    return true;
  }
  if (payload.stampDutyMode !== baseline.stampDutyMode) {
    return true;
  }
  if (payload.positionCostMode !== baseline.positionCostMode) {
    return true;
  }
  if (payload.tradeSettlementMode !== baseline.tradeSettlementMode) {
    return true;
  }
  if (payload.freeReplayEndSettlementMode !== baseline.freeReplayEndSettlementMode) {
    return true;
  }
  if (payload.tradeAmountIncludesFees !== Boolean(baseline.tradeAmountIncludesFees)) {
    return true;
  }
  if (
    payload.allowLongMarginTrading !==
    Boolean(baseline.allowLongMarginTrading)
  ) {
    return true;
  }
  return payload.allowShortSelling !== Boolean(baseline.allowShortSelling);
};
