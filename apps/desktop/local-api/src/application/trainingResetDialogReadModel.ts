// SPDX-License-Identifier: GPL-3.0-only

export type TrainingResetDialogMetrics = {
  initialCapital: number;
  finalEquity: number;
  equityReturnRate: number;
};

export type TerminationReasonMapping = {
  reasonCode: string | null;
  messageKey: string;
};

export type TrainingResetDialogReadModel = {
  metrics: TrainingResetDialogMetrics;
  terminationReason: TerminationReasonMapping;
  settlementMode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  forcedLiquidationCount: number;
  forcedLiquidationSellCount: number;
  forcedLiquidationBuyCount: number;
  hasForcedLiquidation: boolean;
};

type TrainingSummaryLike = {
  initialAsset?: number | null;
  endingAsset?: number | null;
  totalPnl?: number | null;
  assetReturnRate?: number | null;
  forcedLiquidationCount?: number | null;
  forcedLiquidationSellCount?: number | null;
  forcedLiquidationBuyCount?: number | null;
};


const toNonNegativeInt = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

export const resolveTerminationReasonMapping = (
  reasonCode: string | null | undefined,
): TerminationReasonMapping => {
  switch (reasonCode) {
    case 'NO_POSITION_AND_CANNOT_OPEN':
      return {
        reasonCode,
        messageKey: 'appText.openPositionRemainsMinimumTradeUnitLongerOpen',
      };
    case 'NO_FUTURE_DATA':
      return {
        reasonCode,
        messageKey: 'appText.futureBarsLeftOpenPositionRemainsFreeReplay',
      };
    case 'NO_FUTURE_DATA_AND_POSITION_BLOCKED':
      return {
        reasonCode,
        messageKey:
          'appText.futureBarsLeftRemainingPositionLongerResolvedUnder',
      };
    default:
      return { reasonCode: null, messageKey: '' };
  }
};

export const buildTrainingResetDialogMetrics = ({
  summary,
  initialSecuritiesBalance,
}: {
  summary: TrainingSummaryLike | null;
  initialSecuritiesBalance: number;
}): TrainingResetDialogMetrics => {
  const initialCapital = Number.isFinite(Number(summary?.initialAsset))
    ? Math.max(0, Number(summary?.initialAsset))
    : Math.max(0, initialSecuritiesBalance);
  const finalEquity = Number.isFinite(Number(summary?.endingAsset))
    ? Number(summary?.endingAsset)
    : initialCapital + Number(summary?.totalPnl ?? 0);
  const equityReturnRate = Number.isFinite(Number(summary?.assetReturnRate))
    ? Number(summary?.assetReturnRate)
    : initialCapital > 0
      ? (finalEquity - initialCapital) / initialCapital
      : 0;
  return {
    initialCapital,
    finalEquity,
    equityReturnRate,
  };
};

export const buildTrainingResetDialogReadModel = ({
  summary,
  initialSecuritiesBalance,
  settlementMode,
  terminationReasonCode,
}: {
  summary: TrainingSummaryLike | null;
  initialSecuritiesBalance: number;
  settlementMode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  terminationReasonCode?: string | null;
}): TrainingResetDialogReadModel => {
  const metrics = buildTrainingResetDialogMetrics({
    summary,
    initialSecuritiesBalance,
  });
  const terminationReason = resolveTerminationReasonMapping(
    terminationReasonCode,
  );
  const forcedLiquidationCount = toNonNegativeInt(
    summary?.forcedLiquidationCount,
  );
  const forcedLiquidationSellCount = toNonNegativeInt(
    summary?.forcedLiquidationSellCount,
  );
  const forcedLiquidationBuyCount = toNonNegativeInt(
    summary?.forcedLiquidationBuyCount,
  );

  return {
    metrics,
    terminationReason,
    settlementMode,
    forcedLiquidationCount,
    forcedLiquidationSellCount,
    forcedLiquidationBuyCount,
    hasForcedLiquidation: forcedLiquidationCount > 0,
  };
};
