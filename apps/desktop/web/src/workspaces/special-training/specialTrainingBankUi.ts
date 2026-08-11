// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMessage } from "@zinuto/shared/i18n";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import {
  normalizeSpecialTrainingBaseTimeframe,
} from "@/workspaces/special-training/domain/specialTrainingTimeframes";

type ApiErrorLike = {
  code?: unknown;
  args?: unknown;
  message?: unknown;
};

export const SPECIAL_TRAINING_BANK_EDITOR_CANCEL_ACTION_VARIANT = "ghost" as const;
export const SPECIAL_TRAINING_BANK_EDITOR_BACK_ACTION_VARIANT = "outline" as const;
export const SPECIAL_TRAINING_BANK_EDITOR_PRIMARY_ACTION_VARIANT = "default" as const;

export const readSpecialTrainingBankEditorPrimaryCta = ({
  canSave,
  nextDisabled,
  saveDisabled,
}: {
  canSave: boolean;
  nextDisabled: boolean;
  saveDisabled: boolean;
}) => ({
  kind: canSave ? ("SAVE" as const) : ("NEXT" as const),
  disabled: canSave ? saveDisabled : nextDisabled,
  variant: SPECIAL_TRAINING_BANK_EDITOR_PRIMARY_ACTION_VARIANT,
});

export const formatSpecialTrainingBankTimeframeCode = (
  timeframe: BaseTimeframe | null | undefined,
): string => normalizeSpecialTrainingBaseTimeframe(timeframe) ?? "";

export const formatSpecialTrainingBankTimeframeLabel = (
  language: AppUiLanguage,
  timeframe: BaseTimeframe | null | undefined,
): string => {
  const normalized = normalizeSpecialTrainingBaseTimeframe(timeframe);
  switch (normalized) {
    case "1m":
      return formatMessage(language, "uiConfig.displayPeriod.1m");
    case "5m":
      return formatMessage(language, "uiConfig.displayPeriod.5m");
    case "1h":
      return formatMessage(language, "uiConfig.displayPeriod.1h");
    case "1d":
      return formatMessage(language, "uiConfig.displayPeriod.1d");
    default:
      return "";
  }
};

export const readSpecialTrainingBankApiErrorCode = (error: unknown): string =>
  error && typeof error === "object" && !Array.isArray(error)
    ? String((error as ApiErrorLike).code ?? "").trim()
    : "";

export const readSpecialTrainingBankApiErrorArgs = (
  error: unknown,
): Record<string, unknown> | undefined => {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return undefined;
  }
  const args = (error as ApiErrorLike).args;
  return args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : undefined;
};

export const resolveSpecialTrainingBankApiErrorMessage = ({
  language,
  error,
  fallbackMessage,
}: {
  language: AppUiLanguage;
  error: unknown;
  fallbackMessage: string;
}): string => {
  const code = readSpecialTrainingBankApiErrorCode(error);
  const args = readSpecialTrainingBankApiErrorArgs(error);
  const targetTimeframe = formatSpecialTrainingBankTimeframeLabel(
    language,
    normalizeSpecialTrainingBaseTimeframe(args?.targetTimeframe),
  );
  const maxSourceTimeframe = formatSpecialTrainingBankTimeframeLabel(
    language,
    normalizeSpecialTrainingBaseTimeframe(args?.maxSourceTimeframe),
  );
  const maxNameLength = String(args?.max ?? "").trim() || "-";
  switch (code) {
    case "SPECIAL_TRAINING_BANK_NAME_TOO_LONG":
      return formatMessage(
        language,
        "trainer.specialTrainingBanks.errorNameTooLong",
        {
          "0": maxNameLength,
        },
      );
    case "SPECIAL_TRAINING_BANK_SCOPE_REQUIRED":
      return formatMessage(language, "trainer.specialTrainingBanks.errorScopeRequired");
    case "SPECIAL_TRAINING_SYMBOLS_REQUIRED":
    case "SPECIAL_TRAINING_SYMBOLS_NO_DATA":
      return formatMessage(language, "trainer.specialTrainingBanks.errorNoData");
    case "SPECIAL_TRAINING_HORIZON_INVALID":
      return formatMessage(
        language,
        "trainer.specialTrainingBanks.errorCurrentModeConfigInvalid",
      );
    case "SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID":
      return targetTimeframe && maxSourceTimeframe
        ? formatMessage(
            language,
            "trainer.specialTrainingBanks.errorTargetTimeframeInvalidDetailed",
            {
              targetTimeframe,
              maxSourceTimeframe,
            },
          )
        : formatMessage(
            language,
            "trainer.specialTrainingBanks.errorTargetTimeframeInvalid",
          );
    default: {
      console.error("[special-training-bank] request failed", error);
      return fallbackMessage;
    }
  }
};
