// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import { api, type ApiBacktestBatch } from "@/api";
import { useI18n } from "@/frontend-kernel/i18n";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type {
  StrategyBacktestIndicatorSource,
} from "@/workspaces/strategy-backtest/strategyIndicatorSources";
import {
  STRATEGY_BACKTEST_RESULT_DETAIL_WINDOW_KIND,
  type StrategyBacktestDetailStrategyIndicator,
  type StrategyBacktestResultDetailWindowPayload,
} from "@/workspaces/strategy-backtest/strategyBacktestResultDetailWindow";

type UseStrategyBacktestResultDetailWindowArgs = {
  chartRenderMode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>;
  selectedStrategyProfile: StrategyBacktestIndicatorSource | null;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
};

const toDetailStrategyIndicator = (
  batch: ApiBacktestBatch,
  profile: StrategyBacktestIndicatorSource | null,
): StrategyBacktestDetailStrategyIndicator | null => {
  const source = String(batch.config.strategySource ?? "").trim();
  if (!source) {
    return null;
  }
  const profileSource = String(profile?.source ?? "").trim();
  return {
    source,
    parameterInputs: { ...(batch.config.parameterInputs ?? {}) },
    parameters: profileSource === source ? profile?.parameters : undefined,
    displayName: batch.name || profile?.name || "Backtest",
  };
};

export const useStrategyBacktestResultDetailWindow = ({
  chartRenderMode,
  selectedStrategyProfile,
  trainerDisplayPeriod,
  trainerPeriodOptionsByBase,
}: UseStrategyBacktestResultDetailWindowArgs) => {
  const { t } = useI18n();

  const openBatchDetailWindow = useCallback(
    async (batch: ApiBacktestBatch) => {
      const title = `${batch.name} · ${t("trainer.strategyBacktest.detail")}`;
      const payload: StrategyBacktestResultDetailWindowPayload = {
        title,
        batchId: batch.id,
        batch,
        strategyIndicator: toDetailStrategyIndicator(batch, selectedStrategyProfile),
        displayPeriod: trainerDisplayPeriod,
        trainerPeriodOptionsByBase,
        chartRenderMode,
      };
      await api.openDesktopSecondaryWindow({
        kind: STRATEGY_BACKTEST_RESULT_DETAIL_WINDOW_KIND,
        title,
        payload,
      });
    },
    [
      chartRenderMode,
      selectedStrategyProfile,
      t,
      trainerDisplayPeriod,
      trainerPeriodOptionsByBase,
    ],
  );

  return {
    openBatchDetailWindow,
  };
};
