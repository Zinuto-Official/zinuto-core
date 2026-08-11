// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMessage } from "@zinuto/shared/i18n";
import { INPUT_LIMITS, trimAndLimitInputText } from "@zinuto/shared/input-limits";
import type { AppUiLanguage } from "@/ui/config/uiConfig";

export type SpecialTrainingBankEditorMode =
  | "CREATE"
  | "EDIT"
  | "COPY"
  | "REPAIR";

export type SpecialTrainingBankEditorStep = "CONFIG" | "PREVIEW";

export const SPECIAL_TRAINING_BANK_EDITOR_STEPS: ReadonlyArray<SpecialTrainingBankEditorStep> =
  ["CONFIG", "PREVIEW"];

export type SpecialTrainingBankEditorDraft = {
  sourceBankId: string | null;
  name: string;
  poolIds: string[];
  targetTimeframe: BaseTimeframe;
};

export type SpecialTrainingBankEditorPool = {
  id: string;
  name: string;
  assetClassLabel: string;
  baseTimeframe: BaseTimeframe;
  symbols: string[];
  instruments: Array<{
    instrumentId: string;
    symbol: string;
  }>;
};

export type SpecialTrainingBankEditorAutoRemovedPool = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
};

export const normalizeSpecialTrainingBankEditorName = (value: string): string =>
  trimAndLimitInputText(value, INPUT_LIMITS.specialTrainingBankNameChars);

export const resolveSpecialTrainingBankDefaultName = ({
  language,
  existingNames,
}: {
  language: AppUiLanguage;
  existingNames: readonly string[];
}): string => {
  const normalizedExistingNames = new Set(
    existingNames
      .map((name) => normalizeSpecialTrainingBankEditorName(String(name || "")))
      .filter((name) => name.length > 0),
  );
  for (let index = 1; index <= normalizedExistingNames.size + 2; index += 1) {
    const candidate = formatMessage(
      language,
      "trainer.specialTrainingBanks.defaultNameTemplate",
      { index },
    ).trim();
    const normalizedCandidate = normalizeSpecialTrainingBankEditorName(candidate);
    if (!normalizedExistingNames.has(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }
  return normalizeSpecialTrainingBankEditorName(formatMessage(
    language,
    "trainer.specialTrainingBanks.defaultNameTemplate",
    { index: normalizedExistingNames.size + 1 },
  ));
};
