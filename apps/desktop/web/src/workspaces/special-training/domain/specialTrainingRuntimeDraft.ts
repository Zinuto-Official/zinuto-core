// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from "@zinuto/shared/marketTime";
import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";
import type { Bar } from "@/domains/training/types";
import {
  DEFAULT_CAPITAL,
  POSITION_SIZE_OPTIONS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import type { RuntimeState } from "@/workspaces/special-training/domain/specialTrainingTypes";

export const readRuntimeQuestionBars = (
  bars: readonly Bar[] | null | undefined,
): Bar[] =>
  Array.isArray(bars)
    ? bars.filter((bar) =>
        Number.isFinite(parseTimestampMs(String(bar?.ts || ""))),
      )
    : [];

export const createSpecialTrainingRuntimeDraft = (
  _modeId?: SpecialTrainingModeId,
): RuntimeState => ({
  usedOperations: 0,
  openCount: 0,
  positionQty: 0,
  entryPrice: Number.NaN,
  cashBalance: DEFAULT_CAPITAL,
  sizeInput: POSITION_SIZE_OPTIONS[0] ?? "25",
  stopLossInput: "",
  paused: false,
  equityPeakAsset: DEFAULT_CAPITAL,
  maxDrawdownRatio: 0,
  initialCapital: DEFAULT_CAPITAL,
  challengeStartAsset: DEFAULT_CAPITAL,
});
