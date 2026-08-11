// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSpecialTrainingBankScopeSummary } from "@/api";
import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";

export type SpecialTrainingPrepTone =
  "ready" | "warning" | "danger" | "neutral" | "loading";

export type SpecialTrainingBankDetailMetricEntry = {
  key: string;
  label: string;
  value: string;
  tone: SpecialTrainingPrepTone;
};

export type SpecialTrainingBankDetailNoticeEntry = {
  key: string;
  tone: "ready" | "warning" | "danger" | "loading";
  text: string;
};

export type SpecialTrainingBankCardPresentation = {
  previewState: {
    loading: boolean;
    errorMessage: string;
    summary: ApiSpecialTrainingBankScopeSummary | null;
  };
  poolCount: number;
  symbolCount: number;
  status: {
    label: string;
    tone: SpecialTrainingPrepTone;
  };
};

export type ModeQuestionBankProgressItem = {
  modeId: SpecialTrainingModeId;
  title: string;
  label: string;
  tone: SpecialTrainingPrepTone;
};
