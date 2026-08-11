// SPDX-License-Identifier: GPL-3.0-only

import type { TradingAssetClass } from '@zinuto/shared/trading';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import { formatCountWithUnitText, formatLotsAndSharesText } from '@/ui/formatting/i18nDisplay';

export type TrainerTradingTextLike = {
  assetClassLabels: Record<TradingAssetClass, string>;
  trainerTradeQuantityModeLabelByAssetClass: Record<TradingAssetClass, string>;
  trainerTradeQuantityPlaceholderByAssetClass: Record<TradingAssetClass, string>;
  trainerTradeQuantityUnitByAssetClass: Record<TradingAssetClass, string>;
  trainerTradeQtyValueUnitByAssetClass: Record<TradingAssetClass, string>;
  trainerTradeAmountModeLabelByAssetClass: Record<TradingAssetClass, string>;
  trainerTradeAmountPlaceholderByAssetClass: Record<TradingAssetClass, string>;
  trainerPositionQtyLabelByAssetClass: Record<TradingAssetClass, string>;
  trainerPositionValueLabelByAssetClass: Record<TradingAssetClass, string>;
};

export type TrainerTradingAssetUiModel = {
  assetClass: TradingAssetClass;
  assetClassLabel: string;
  quantityInputMode: 'LOT_STEPS' | 'QTY';
  quantityModeLabel: string;
  quantityInputPlaceholder: string;
  quantityInputUnit: string;
  amountModeLabel: string;
  amountInputPlaceholder: string;
  positionQtyLabel: string;
  positionValueLabel: string;
  tradeQtyUnit: string;
  secondaryTradeQtyUnit: string | null;
  secondaryTradeQtyUsesContractMultiplier: boolean;
  orderQuantityDisplayMode: 'LOTS_AND_QTY' | 'QTY_ONLY';
  positionQuantityDisplayMode: 'LOTS_AND_QTY' | 'QTY_ONLY';
  showBorrowSummary: boolean;
};

export const normalizeTradingAssetClass = (
  value: unknown,
  fallback: TradingAssetClass = 'STOCK'
): TradingAssetClass => {
  return value === 'FUTURES' || value === 'FOREX' || value === 'CRYPTO' || value === 'STOCK'
    ? value
    : fallback;
};

export const shouldUseTrainerDirectQuantityInput = (assetClass: TradingAssetClass): boolean => {
  const normalizedAssetClass = normalizeTradingAssetClass(assetClass);
  return normalizedAssetClass === 'CRYPTO';
};

export const buildTrainerTradingAssetUi = ({
  assetClass,
  allowShortSelling,
  tradingText,
  lotStepUnitLabel
}: {
  assetClass: TradingAssetClass;
  allowShortSelling: boolean;
  tradingText: TrainerTradingTextLike;
  lotStepUnitLabel: string;
}): TrainerTradingAssetUiModel => {
  const normalizedAssetClass = normalizeTradingAssetClass(assetClass);
  const showBorrowSummary = normalizedAssetClass === 'STOCK' && allowShortSelling;
  const quantityInputMode = shouldUseTrainerDirectQuantityInput(normalizedAssetClass) ? 'QTY' : 'LOT_STEPS';
  const tradeQtyUnit = tradingText.trainerTradeQtyValueUnitByAssetClass[normalizedAssetClass];
  const secondaryTradeQtyUnit =
    normalizedAssetClass === 'STOCK' || normalizedAssetClass === 'FOREX' ? tradeQtyUnit : null;
  const orderQuantityDisplayMode =
    normalizedAssetClass === 'STOCK' || normalizedAssetClass === 'FOREX' ? 'LOTS_AND_QTY' : 'QTY_ONLY';
  const positionQuantityDisplayMode = normalizedAssetClass === 'FOREX' ? 'LOTS_AND_QTY' : 'QTY_ONLY';

  return {
    assetClass: normalizedAssetClass,
    assetClassLabel: tradingText.assetClassLabels[normalizedAssetClass],
    quantityInputMode,
    quantityModeLabel: tradingText.trainerTradeQuantityModeLabelByAssetClass[normalizedAssetClass],
    quantityInputPlaceholder: tradingText.trainerTradeQuantityPlaceholderByAssetClass[normalizedAssetClass],
    quantityInputUnit: quantityInputMode === 'QTY' ? tradeQtyUnit : lotStepUnitLabel,
    amountModeLabel: tradingText.trainerTradeAmountModeLabelByAssetClass[normalizedAssetClass],
    amountInputPlaceholder: tradingText.trainerTradeAmountPlaceholderByAssetClass[normalizedAssetClass],
    positionQtyLabel: tradingText.trainerPositionQtyLabelByAssetClass[normalizedAssetClass],
    positionValueLabel: tradingText.trainerPositionValueLabelByAssetClass[normalizedAssetClass],
    tradeQtyUnit,
    secondaryTradeQtyUnit,
    secondaryTradeQtyUsesContractMultiplier: normalizedAssetClass === 'FOREX',
    orderQuantityDisplayMode,
    positionQuantityDisplayMode,
    showBorrowSummary
  };
};

export const resolveTradeQuantityFractionDigits = (step: number): number => {
  const numeric = Number(step);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  const normalized = Number(numeric.toFixed(8));
  if (Math.abs(normalized - Math.round(normalized)) <= 1e-8) {
    return 0;
  }
  const text = normalized.toFixed(8).replace(/0+$/, '');
  const dotIndex = text.indexOf('.');
  if (dotIndex < 0) {
    return 0;
  }
  return Math.max(0, Math.min(8, text.length - dotIndex - 1));
};

const normalizeTradeStep = (step: number): number => {
  const numeric = Number(step);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }
  return numeric;
};

const formatTradeQuantityNumber = (value: number, digits: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (digits <= 0) {
    return String(Math.round(value));
  }
  return value.toFixed(digits).replace(/\.?0+$/, '');
};

const resolveDisplayDigitsFromValue = (value: number, maxDigits: number): number => {
  if (!Number.isFinite(value) || Math.abs(value - Math.round(value)) <= 1e-8) {
    return 0;
  }
  const normalized = Number(value.toFixed(maxDigits));
  const text = normalized.toFixed(maxDigits).replace(/0+$/, '');
  const dotIndex = text.indexOf('.');
  if (dotIndex < 0) {
    return 0;
  }
  return Math.max(0, Math.min(maxDigits, text.length - dotIndex - 1));
};

export const formatTrainerTradingQuantityText = ({
  language,
  quantity,
  tradeStep,
  secondaryQuantityMultiplier,
  lotStepUnitLabel,
  tradeQtyUnit,
  secondaryTradeQtyUnit,
  displayMode,
  includeSecondaryQuantity = true
}: {
  language: AppUiLanguage;
  quantity: number;
  tradeStep: number;
  secondaryQuantityMultiplier?: number;
  lotStepUnitLabel: string;
  tradeQtyUnit: string;
  secondaryTradeQtyUnit?: string | null;
  displayMode: TrainerTradingAssetUiModel['orderQuantityDisplayMode'] | TrainerTradingAssetUiModel['positionQuantityDisplayMode'];
  includeSecondaryQuantity?: boolean;
}): string => {
  const normalizedStep = normalizeTradeStep(tradeStep);
  const normalizedQty = Number.isFinite(quantity) ? quantity : 0;
  const qtyDigits = resolveTradeQuantityFractionDigits(normalizedStep);
  const qtyText = formatTradeQuantityNumber(normalizedQty, qtyDigits);
  if (displayMode === 'QTY_ONLY') {
    return formatCountWithUnitText(language, qtyText, tradeQtyUnit);
  }
  const lots = normalizedQty / normalizedStep;
  const lotDigits = resolveDisplayDigitsFromValue(lots, 4);
  const lotsText = formatTradeQuantityNumber(lots, lotDigits);
  if (!includeSecondaryQuantity) {
    return formatCountWithUnitText(language, lotsText, lotStepUnitLabel);
  }
  const normalizedSecondaryMultiplier =
    Number.isFinite(secondaryQuantityMultiplier) && Number(secondaryQuantityMultiplier) > 0
      ? Number(secondaryQuantityMultiplier)
      : 1;
  const secondaryQty = normalizedQty * normalizedSecondaryMultiplier;
  const secondaryStep = normalizedStep * normalizedSecondaryMultiplier;
  const secondaryDigits = resolveTradeQuantityFractionDigits(secondaryStep);
  const secondaryQtyText = formatTradeQuantityNumber(secondaryQty, secondaryDigits);
  return formatLotsAndSharesText(
    language,
    lotsText,
    lotStepUnitLabel,
    secondaryQtyText,
    secondaryTradeQtyUnit || tradeQtyUnit
  );
};
