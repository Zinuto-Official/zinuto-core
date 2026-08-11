// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe, DisplayPeriodKey } from "@/domains/trainer/trainerTypes";

export type TrainerDisplayPeriodFrameRequest = {
  timeframe: BaseTimeframe;
  displayPeriod: DisplayPeriodKey;
  anchorRawIndex: number;
  before: number;
  after: number;
  maxDisplayBars: number;
};

export const buildTrainerDisplayPeriodFrameRequest = ({
  sourceTimeframe,
  targetDisplayPeriod,
  anchorRawIndex,
  before,
  after,
}: {
  sourceTimeframe: BaseTimeframe;
  targetDisplayPeriod: DisplayPeriodKey;
  anchorRawIndex: unknown;
  before: number;
  after: number;
}): TrainerDisplayPeriodFrameRequest => {
  const normalizedBefore = Math.max(0, Math.floor(Number(before) || 0));
  const normalizedAfter = Math.max(0, Math.floor(Number(after) || 0));
  return {
    timeframe: sourceTimeframe,
    displayPeriod: targetDisplayPeriod,
    anchorRawIndex: Math.max(0, Math.floor(Number(anchorRawIndex) || 0)),
    before: normalizedBefore,
    after: normalizedAfter,
    maxDisplayBars: normalizedBefore + normalizedAfter + 1,
  };
};
