// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import {
  SPECIAL_TRAINING_BANK_EDITOR_STEPS,
  type SpecialTrainingBankEditorStep,
} from "@/workspaces/special-training/specialTrainingBankEditorModel";
import { SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS } from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";

export const EMPTY_BANK_EDITOR_SELECTED_POOL_IDS: string[] = [];

export const isExpectedDesktopSecondaryWindowUnavailableError = (
  error: unknown,
): boolean =>
  error instanceof Error &&
  error.message === "DESKTOP_SECONDARY_WINDOW_TAURI_REQUIRED";

export const readActionPayloadObject = (
  value: unknown,
): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const isBankEditorStepActionValue = (
  value: unknown,
): value is SpecialTrainingBankEditorStep =>
  typeof value === "string" &&
  SPECIAL_TRAINING_BANK_EDITOR_STEPS.includes(
    value as SpecialTrainingBankEditorStep,
  );

export const isBankEditorTimeframeActionValue = (
  value: unknown,
): value is BaseTimeframe =>
  typeof value === "string" &&
  SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS.includes(value as BaseTimeframe);
