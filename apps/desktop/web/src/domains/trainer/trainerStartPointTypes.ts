// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import type { BaseTimeframe } from "@/domains/trainer/trainerTypes";
import type { FreeReplayAdvancePeriod } from "@/domains/training/types";

export type TrainerStartPointWindowPayload = {
  title: string;
  description?: string;
  samplePoolId: string;
  instrumentId: string;
  symbol: string;
  sourceTimeframe: BaseTimeframe;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  language: UiLanguage;
  themeMode: "light" | "dark";
  currentRawAnchorIndex?: number | null;
  currentAnchorOverviewIndex: number | null;
  currentAnchorTs: string | null;
  isDisabled: boolean;
  isBusy: boolean;
  ui: {
    startPoint: string;
    dateRange: string;
    chartSettings: string;
  };
};

export type TrainerStartPointApplyPayload = {
  overviewIndex: number;
  rawAnchorIndex: number;
  anchorTs: string | null;
};

export type TrainerStartPointInlineHistoryStatus = {
  progressText: string;
  remainingText: string;
  anchorText: string;
};

export const isTrainerStartPointWindowPayload = (
  value: unknown,
): value is TrainerStartPointWindowPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as TrainerStartPointWindowPayload).symbol === "string" &&
  typeof (value as TrainerStartPointWindowPayload).samplePoolId === "string" &&
  typeof (value as TrainerStartPointWindowPayload).instrumentId === "string" &&
  typeof (value as TrainerStartPointWindowPayload).sourceTimeframe === "string" &&
  typeof (value as TrainerStartPointWindowPayload).effectiveTimeframe === "string" &&
  Boolean((value as TrainerStartPointWindowPayload).ui);
