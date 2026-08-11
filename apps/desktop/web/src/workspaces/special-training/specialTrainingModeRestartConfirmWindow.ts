// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingModeId } from "@/ui/config/uiConfig";
import { SPECIAL_TRAINING_MODE_IDS } from "@/workspaces/special-training/specialTrainingModeRegistry";

export type SpecialTrainingModeRestartConfirmWindowPayload = {
  modeId: SpecialTrainingModeId;
};

export type SpecialTrainingModeRestartConfirmActionPayload = {
  modeId: SpecialTrainingModeId;
};

const SPECIAL_TRAINING_MODE_ID_SET = new Set<SpecialTrainingModeId>(
  SPECIAL_TRAINING_MODE_IDS,
);

export const isSpecialTrainingModeRestartConfirmWindowPayload = (
  value: unknown,
): value is SpecialTrainingModeRestartConfirmWindowPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const modeId = String(
    (value as Partial<SpecialTrainingModeRestartConfirmWindowPayload>).modeId ??
      "",
  ).trim();
  return SPECIAL_TRAINING_MODE_ID_SET.has(modeId as SpecialTrainingModeId);
};

export const readSpecialTrainingModeRestartConfirmActionPayload = (
  value: unknown,
): SpecialTrainingModeRestartConfirmActionPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const modeId = String(
    (value as Partial<SpecialTrainingModeRestartConfirmActionPayload>).modeId ??
      "",
  ).trim();
  if (!SPECIAL_TRAINING_MODE_ID_SET.has(modeId as SpecialTrainingModeId)) {
    return null;
  }
  return { modeId: modeId as SpecialTrainingModeId };
};
