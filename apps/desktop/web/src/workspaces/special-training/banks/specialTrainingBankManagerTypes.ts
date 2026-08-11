// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type {
  ApiSpecialTrainingBank,
  ApiSpecialTrainingBankScopeSummary,
} from "@/api";
import type {
  AppUiLanguage,
  getSpecialTrainingPageContent,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import type { Dispatch, SetStateAction } from "react";
import type { SpecialTrainingModeRuntimeConfigMap } from "@/workspaces/special-training/specialTrainingModeRegistry";
import type { SpecialTrainingBankEditorPool } from "@/workspaces/special-training/specialTrainingBankEditorModel";

export const SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS: readonly BaseTimeframe[] =
  ["1m", "5m", "1h", "1d"];

export type SpecialTrainingPageContent = ReturnType<
  typeof getSpecialTrainingPageContent
>;

export type EnabledSamplePoolInput = {
  id: string;
  name: string;
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  assetClassLabel: string;
  marketPresetId: string;
  baseTimeframe: BaseTimeframe;
  symbols: string[];
  instruments: Array<{
    instrumentId: string;
    symbol: string;
  }>;
  questionBankRevisionToken: string;
};

export type NormalizedEnabledSamplePool = SpecialTrainingBankEditorPool & {
  assetClass: ApiSpecialTrainingBank["assetClass"];
  marketPresetId: string;
  questionBankRevisionToken: string;
};

export type BankCardPreviewState = {
  loading: boolean;
  errorMessage: string;
  summary: ApiSpecialTrainingBankScopeSummary | null;
  missingPoolIds: string[];
};

export type UseSpecialTrainingBankManagerOptions = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  enabledSamplePoolSymbols: string[];
  enabledSamplePools: EnabledSamplePoolInput[];
  globalResetRevision: number;
  activeModeId: SpecialTrainingModeId | undefined;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  setModeRuntimeConfigById: Dispatch<
    SetStateAction<SpecialTrainingModeRuntimeConfigMap>
  >;
};

export const createEmptyBankCardPreviewState = (): BankCardPreviewState => ({
  loading: false,
  errorMessage: "",
  summary: null,
  missingPoolIds: [],
});
