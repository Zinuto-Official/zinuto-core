// SPDX-License-Identifier: GPL-3.0-only

import { isDisplayPeriodKey } from "@/ui/config/uiConfig";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";

type ReplayDisplayPeriodCarrier = {
  displayPeriod?: unknown;
  contextDisplayPeriod?: unknown;
  baseTimeframe?: unknown;
};

export const normalizeReplayDisplayPeriod = (
  value: unknown,
): DisplayPeriodKey | undefined =>
  isDisplayPeriodKey(value) ? value : undefined;

export const resolveReplayDisplayPeriod = ({
  replay,
  preferredDisplayPeriod,
  baseTimeframe,
  fallback = "1d",
}: {
  replay?: ReplayDisplayPeriodCarrier | null;
  preferredDisplayPeriod?: unknown;
  baseTimeframe?: unknown;
  fallback?: DisplayPeriodKey;
}): DisplayPeriodKey =>
  normalizeReplayDisplayPeriod(preferredDisplayPeriod) ??
  normalizeReplayDisplayPeriod(replay?.displayPeriod) ??
  normalizeReplayDisplayPeriod(replay?.contextDisplayPeriod) ??
  normalizeReplayDisplayPeriod(replay?.baseTimeframe) ??
  normalizeReplayDisplayPeriod(baseTimeframe) ??
  fallback;
