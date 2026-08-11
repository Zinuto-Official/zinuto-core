// SPDX-License-Identifier: GPL-3.0-only

import { DEFAULT_RATIO_PRESET_INPUTS } from "@/domains/trainer/tradingFormUtils";
import { createDefaultModeRuntimeConfigMap } from "@/workspaces/special-training/specialTrainingModeRegistry";

export const POSITION_SIZE_OPTIONS = DEFAULT_RATIO_PRESET_INPUTS;
export const FAST_DECISION_HORIZON_BAR_OPTIONS = [20, 30, 50, 80, 100] as const;
export const DECISION_SECONDS_OPTIONS = [10, 20, 30, 60, 120] as const;
export const FAST_DECISION_STRICTNESS_LEVEL_OPTIONS = [
  "LENIENT",
  "STANDARD",
  "STRICT",
] as const;
export const MODE_PICKER_QUESTION_COUNT_OPTIONS = [5, 10, 20] as const;
export const MODE_PICKER_RISK_HORIZON_BAR_OPTIONS = [60, 120, 240] as const;

export const DEFAULT_DECISION_SECONDS_LIMIT = 20;
export const FAST_DECISION_HISTORY_BARS = 100;
export const FAST_DECISION_CRITICAL_SECONDS = 5;
export const FAST_DECISION_REVEAL_DURATION_MS = 500;
export const FAST_DECISION_JUDGED_HOLD_MS = 0;
export const SCOPE_RESTART_NOTICE_AUTO_CLOSE_SECONDS = 5;

export const RISK_AUTOPLAY_STEP_DELAY_MS = 720;

export const DEFAULT_CAPITAL = 100000;

export const DEFAULT_MODE_RUNTIME_CONFIG_BY_ID = createDefaultModeRuntimeConfigMap();
