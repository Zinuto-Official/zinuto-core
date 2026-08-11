// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TradingAssetClassId,
  TradingMarketPresetId,
} from "@/domains/trainer/tradingMarketPresets";
import {
  resolveSelectedStrategyBacktestMarketPresetId,
  resolveStrategyBacktestEnvironmentSuggestion,
  shouldApplyStrategyBacktestEnvironmentSuggestion,
  type StrategyBacktestEnvironmentSelection,
} from "@/workspaces/strategy-backtest/strategyBacktestTradingEnvironment";
import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";
import type {
  TrainerMarketPresetEditorModel,
} from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";

type StrategyBacktestTradingEnvironmentArgs = {
  selectedPool: StrategyBacktestSamplePool | null;
  trainerSettingsPanel: TrainerMarketPresetEditorModel["trainerSettingsPanel"];
  tradingSettingsText: TrainerMarketPresetEditorModel["tradingSettingsText"];
};

const findOptionLabel = (
  options: Array<{ value: string; label: string }>,
  value: string,
): string => options.find((option) => option.value === value)?.label ?? value;

export const useStrategyBacktestTradingEnvironment = ({
  selectedPool,
  trainerSettingsPanel,
  tradingSettingsText,
}: StrategyBacktestTradingEnvironmentArgs) => {
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<StrategyBacktestEnvironmentSelection | null>(null);
  const [environmentTouched, setEnvironmentTouched] = useState(false);
  const [isTradingEnvironmentModalOpen, setIsTradingEnvironmentModalOpen] =
    useState(false);

  const selectedTradingEnvironmentPresetId = useMemo(
    () => resolveSelectedStrategyBacktestMarketPresetId(trainerSettingsPanel),
    [trainerSettingsPanel],
  );

  const tradingEnvironmentAssetOptions = useMemo(
    () =>
      trainerSettingsPanel.replaySettingsAssetClassOptions.map(({ value, label, icon }) => ({
        value,
        label,
        icon,
      })),
    [trainerSettingsPanel.replaySettingsAssetClassOptions],
  );
  const tradingEnvironmentPresetOptions = useMemo(
    () =>
      trainerSettingsPanel.marketPresetChips.map((chip) => ({
        value: chip.id,
        label: chip.label,
        textValue: chip.label,
      })),
    [trainerSettingsPanel.marketPresetChips],
  );

  const tradingEnvironmentSummary = useMemo(() => {
    const allowShortValue = trainerSettingsPanel.allowShortSelling ? "ALLOW" : "DISALLOW";
    return [
      {
        id: "preset",
        label: tradingSettingsText.marketPresetsSectionTitle,
        value:
          trainerSettingsPanel.activeTradingMarketPresetLabel ||
          selectedTradingEnvironmentPresetId ||
          "-",
      },
      {
        id: "settlement",
        label: tradingSettingsText.tradeSettlementModeLabel,
        value: findOptionLabel(
          trainerSettingsPanel.replaySettingsSettlementModeOptions,
          trainerSettingsPanel.tradeSettlementMode,
        ),
      },
      {
        id: "short",
        label:
          tradingSettingsText.allowShortSellingLabelByAssetClass[
            trainerSettingsPanel.tradingAssetClass
          ],
        value: findOptionLabel(
          trainerSettingsPanel.replaySettingsAllowShortOptions,
          allowShortValue,
        ),
      },
      {
        id: "step",
        label: tradingSettingsText.minTradeStepLabel,
        value: trainerSettingsPanel.minTradeStepInput || "-",
      },
    ];
  }, [
    selectedTradingEnvironmentPresetId,
    trainerSettingsPanel,
    tradingSettingsText,
  ]);

  const handleTradingEnvironmentAssetClassChange = useCallback(
    (nextValue: TradingAssetClassId) => {
      setEnvironmentTouched(true);
      const suggestion = resolveStrategyBacktestEnvironmentSuggestion({
        assetClass: nextValue,
      });
      if (suggestion) {
        setSelectedEnvironment(suggestion);
      }
      trainerSettingsPanel.onTradingAssetClassChange(nextValue);
    },
    [trainerSettingsPanel],
  );

  const handleTradingEnvironmentPresetChange = useCallback(
    (nextValue: string) => {
      const nextPresetId = String(nextValue || "").trim() as TradingMarketPresetId;
      if (!nextPresetId) {
        return;
      }
      setEnvironmentTouched(true);
      setSelectedEnvironment({
        assetClass: trainerSettingsPanel.tradingAssetClass,
        marketPresetId: nextPresetId,
      });
      trainerSettingsPanel.onSelectTradingMarketPreset(nextPresetId);
    },
    [trainerSettingsPanel],
  );

  const openTradingEnvironmentModal = useCallback(() => {
    setIsTradingEnvironmentModalOpen(true);
  }, []);

  const closeTradingEnvironmentModal = useCallback(() => {
    setIsTradingEnvironmentModalOpen(false);
  }, []);

  const saveTradingEnvironmentModal = useCallback(() => {
    if (selectedTradingEnvironmentPresetId) {
      setSelectedEnvironment({
        assetClass: trainerSettingsPanel.tradingAssetClass,
        marketPresetId: selectedTradingEnvironmentPresetId,
      });
    }
    setEnvironmentTouched(true);
    setIsTradingEnvironmentModalOpen(false);
  }, [
    selectedTradingEnvironmentPresetId,
    trainerSettingsPanel.tradingAssetClass,
  ]);

  useEffect(() => {
    const suggestion = resolveStrategyBacktestEnvironmentSuggestion(selectedPool);
    if (!suggestion) {
      return;
    }
    setSelectedEnvironment((current) =>
      shouldApplyStrategyBacktestEnvironmentSuggestion({
        current,
        suggestion,
        touched: environmentTouched,
      })
        ? suggestion
        : current,
    );
  }, [
    environmentTouched,
    selectedPool,
  ]);

  useEffect(() => {
    if (!selectedEnvironment) {
      return;
    }
    if (trainerSettingsPanel.tradingAssetClass !== selectedEnvironment.assetClass) {
      trainerSettingsPanel.onTradingAssetClassChange(selectedEnvironment.assetClass);
      return;
    }
    const availablePresetIds = trainerSettingsPanel.marketPresetChips.map((chip) => chip.id);
    if (
      availablePresetIds.length > 0 &&
      !availablePresetIds.includes(selectedEnvironment.marketPresetId)
    ) {
      setSelectedEnvironment({
        assetClass: selectedEnvironment.assetClass,
        marketPresetId: availablePresetIds[0],
      });
      return;
    }
    if (
      selectedEnvironment.marketPresetId &&
      selectedTradingEnvironmentPresetId !== selectedEnvironment.marketPresetId
    ) {
      trainerSettingsPanel.onSelectTradingMarketPreset(
        selectedEnvironment.marketPresetId,
      );
    }
  }, [
    selectedEnvironment,
    selectedTradingEnvironmentPresetId,
    trainerSettingsPanel,
  ]);

  return {
    selectedTradingEnvironmentPresetId,
    tradingEnvironmentAssetOptions,
    tradingEnvironmentPresetOptions,
    tradingEnvironmentSummary,
    handleTradingEnvironmentAssetClassChange,
    handleTradingEnvironmentPresetChange,
    isTradingEnvironmentModalOpen,
    openTradingEnvironmentModal,
    closeTradingEnvironmentModal,
    saveTradingEnvironmentModal,
  };
};
