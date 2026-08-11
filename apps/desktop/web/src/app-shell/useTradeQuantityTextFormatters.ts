// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useCallback, useMemo } from 'react';
import {
  formatTrainerTradingQuantityText,
  type TrainerTradingAssetUiModel,
} from '@/domains/trainer/trainerTradingAssetUi';

type UseTradeQuantityTextFormattersArgs = {
  language: UiLanguage;
  lotSizeForCurrentPool: number;
  lotStepUnitLabel: string;
  minTradeStep: number;
  tradeContractMultiplier: number;
  trainerTradingAssetUi: TrainerTradingAssetUiModel;
};

export const useTradeQuantityTextFormatters = ({
  language,
  lotSizeForCurrentPool,
  lotStepUnitLabel,
  minTradeStep,
  tradeContractMultiplier,
  trainerTradingAssetUi,
}: UseTradeQuantityTextFormattersArgs) => {
  const tradeStepForCurrentSettings = useMemo(() => {
    const step = Number(minTradeStep);
    if (Number.isFinite(step) && step > 0) {
      return step;
    }
    return lotSizeForCurrentPool;
  }, [lotSizeForCurrentPool, minTradeStep]);

  const formatWorkspaceTradeQuantityText = useCallback(
    (quantity: number, kind: 'ORDER' | 'POSITION' | 'ORDER_PRIMARY' = 'ORDER') =>
      formatTrainerTradingQuantityText({
        language,
        quantity,
        tradeStep: tradeStepForCurrentSettings,
        secondaryQuantityMultiplier: trainerTradingAssetUi.secondaryTradeQtyUsesContractMultiplier
          ? tradeContractMultiplier
          : 1,
        lotStepUnitLabel,
        tradeQtyUnit: trainerTradingAssetUi.tradeQtyUnit,
        secondaryTradeQtyUnit: trainerTradingAssetUi.secondaryTradeQtyUnit,
        displayMode:
          kind === 'POSITION'
            ? trainerTradingAssetUi.positionQuantityDisplayMode
            : trainerTradingAssetUi.orderQuantityDisplayMode,
        includeSecondaryQuantity: kind !== 'ORDER_PRIMARY',
      }),
    [
      language,
      lotStepUnitLabel,
      tradeStepForCurrentSettings,
      tradeContractMultiplier,
      trainerTradingAssetUi.orderQuantityDisplayMode,
      trainerTradingAssetUi.positionQuantityDisplayMode,
      trainerTradingAssetUi.secondaryTradeQtyUnit,
      trainerTradingAssetUi.secondaryTradeQtyUsesContractMultiplier,
      trainerTradingAssetUi.tradeQtyUnit,
    ],
  );

  const formatTradeLogQuantityText = useCallback(
    (quantity: number) => {
      return formatTrainerTradingQuantityText({
        language,
        quantity,
        tradeStep: tradeStepForCurrentSettings,
        secondaryQuantityMultiplier: trainerTradingAssetUi.secondaryTradeQtyUsesContractMultiplier
          ? tradeContractMultiplier
          : 1,
        lotStepUnitLabel,
        tradeQtyUnit: trainerTradingAssetUi.tradeQtyUnit,
        secondaryTradeQtyUnit: trainerTradingAssetUi.secondaryTradeQtyUnit,
        displayMode: trainerTradingAssetUi.orderQuantityDisplayMode,
        includeSecondaryQuantity: false,
      });
    },
    [
      language,
      lotStepUnitLabel,
      tradeStepForCurrentSettings,
      tradeContractMultiplier,
      trainerTradingAssetUi.orderQuantityDisplayMode,
      trainerTradingAssetUi.secondaryTradeQtyUnit,
      trainerTradingAssetUi.secondaryTradeQtyUsesContractMultiplier,
      trainerTradingAssetUi.tradeQtyUnit,
    ],
  );

  return {
    tradeStepForCurrentSettings,
    formatWorkspaceTradeQuantityText,
    formatTradeLogQuantityText,
  };
};
