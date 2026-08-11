// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { SignalIndicatorName } from "@/domains/indicators/core";
import type {
  ReplayBar,
  ReplayCurvePoint,
  ReplayTradeRound,
} from "@/domains/trainer/trainerTypes";
import type { SessionSnapshot } from "@/domains/training/types";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";

export type ArchivedReplayData = {
  bars: ReplayBar[];
  snapshot: SessionSnapshot;
  drawings: SavedDrawingOverlay[];
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  tradeRounds?: ReplayTradeRound[];
  finalEquity: number;
  equityReturnRate: number;
  chartIndicators?: {
    mainNativeIndicator?: string;
    mainNativeIndicatorParams?: number[];
    signalTopIndicator: SignalIndicatorName;
    signalTopIndicatorParams?: number[];
    signalBottomIndicator: SignalIndicatorName;
    signalBottomIndicatorParams?: number[];
  };
  noteSummary?: {
    chips?: ReplayContextSummaryChip[];
  };
  baseTimeframe?: BaseTimeframe;
  displayPeriod?: DisplayPeriodKey;
  specialTraining?: SpecialTrainingReplayOverlayContext | null;
};
