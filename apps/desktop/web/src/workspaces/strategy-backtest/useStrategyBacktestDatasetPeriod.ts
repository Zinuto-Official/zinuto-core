// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo } from "react";

import { useI18n } from "@/frontend-kernel/i18n";
import {
  resolveStrategyBacktestVisibleBarCount,
  resolveStrategyBacktestDatasetRange,
} from "@/workspaces/strategy-backtest/strategyBacktestDatasetRange";
import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";

export const useStrategyBacktestDatasetPeriod = ({
  pool,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: {
  pool: StrategyBacktestSamplePool | null;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) => {
  const { t, formatNumber } = useI18n();
  const range = useMemo(() => resolveStrategyBacktestDatasetRange(pool), [pool]);
  useEffect(() => {
    onStartDateChange(range?.startDate ?? "");
    onEndDateChange(range?.endDate ?? "");
  }, [onEndDateChange, onStartDateChange, pool?.id, range?.endDate, range?.startDate]);
  const barCount = useMemo(
    () => resolveStrategyBacktestVisibleBarCount({ range, startDate, endDate }),
    [endDate, range, startDate],
  );
  const periodText = useMemo(() => {
    if (!pool || barCount <= 0) return "";
    if (pool.baseTimeframe === "1d") {
      return t("trainer.strategyBacktest.periodTradingDays", { count: formatNumber(barCount) });
    }
    if (pool.baseTimeframe === "1h") {
      return t("trainer.strategyBacktest.periodHours", { count: formatNumber(barCount) });
    }
    const minutes = barCount * (pool.baseTimeframe === "5m" ? 5 : 1);
    return t("trainer.strategyBacktest.periodMinutes", { count: formatNumber(minutes) });
  }, [barCount, formatNumber, pool, t]);

  return { range, periodText };
};
