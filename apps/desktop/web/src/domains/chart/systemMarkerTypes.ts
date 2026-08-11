// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, KLineData } from "klinecharts";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import type { SessionSnapshot } from "@/domains/training/types";

export type SystemMarkerRenderer = (
  chart: Chart,
  visibleData: KLineData[],
  currentSnapshot: SessionSnapshot,
  sourceBars: ReplayBar[],
  visibleItems: AggregatedBarItem[],
  context?: {
    trainingProjectId?: string | null;
    displayPeriod?: DisplayPeriodKey;
    baseDisplayPeriod?: DisplayPeriodKey | string | null;
    onRequestDisplayPeriod?: (period: DisplayPeriodKey) => void;
    chartViewportWidthPx?: number;
    refreshTradesAndNotes?: boolean;
  },
) => void;
