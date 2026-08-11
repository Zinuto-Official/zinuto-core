// SPDX-License-Identifier: GPL-3.0-only

import type { AppDisplayPeriodKey } from "@/ui/config/uiConfig";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";

export type TrainerPeriodAdvanceMeta = {
  stepForCurrentClose: number;
  stepForNextOpen: number;
  nextOpenDelay: number;
  hasFutureBars: boolean;
  needsFutureBars: boolean;
};

type ResolveTrainerPeriodAdvanceMetaArgs = {
  tsMsByIndex: readonly number[];
  cursorIndex: number;
  barsOffset: number;
  barsTotal: number;
  allowStep: boolean;
  displayPeriod: AppDisplayPeriodKey;
  baseTimeframe: BaseTimeframe;
  timeZone?: string;
};

const EMPTY_ADVANCE_META: TrainerPeriodAdvanceMeta = {
  stepForCurrentClose: 0,
  stepForNextOpen: 0,
  nextOpenDelay: 0,
  hasFutureBars: false,
  needsFutureBars: false,
};

export const resolveTrainerPeriodAdvanceMeta = ({
  allowStep,
}: ResolveTrainerPeriodAdvanceMetaArgs): TrainerPeriodAdvanceMeta => {
  if (!allowStep) {
    return EMPTY_ADVANCE_META;
  }
  return {
    stepForCurrentClose: 1,
    stepForNextOpen: 1,
    nextOpenDelay: 1,
    hasFutureBars: true,
    needsFutureBars: false,
  };
};
