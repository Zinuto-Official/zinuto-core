// SPDX-License-Identifier: GPL-3.0-only

import type { AppDisplayPeriodKey } from "@/ui/config/uiConfig";

export type BaseTimeframe = "1m" | "5m" | "1h" | "1d";
export type DisplayPeriodKey = AppDisplayPeriodKey;
export type FreeReplayAdvancePeriod =
  | "1m"
  | "5m"
  | "1h"
  | "1d"
  | "1w"
  | "1month"
  | "1year";
