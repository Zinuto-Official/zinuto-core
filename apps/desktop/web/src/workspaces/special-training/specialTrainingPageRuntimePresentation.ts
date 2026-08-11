// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopHelpContextId } from "@/domains/desktop-help/desktopHelpTypes";
import { formatMessageByLanguage } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  AppUiLanguage,
  SpecialTrainingModeDefinition,
} from "@/ui/config/uiConfig";
import type { ModeQuestionBankProgressItem } from "@/workspaces/special-training/components/specialTrainingModePickerViewTypes";
import {
  createEmptyModeQuestionBankState,
  SPECIAL_TRAINING_MODE_IDS,
  type ModeQuestionBankStateMap,
} from "@/workspaces/special-training/specialTrainingModeRegistry";

export const buildModeQuestionBankProgressItems = ({
  availableModes,
  language,
  modeQuestionBankState,
}: {
  availableModes: SpecialTrainingModeDefinition[];
  language: AppUiLanguage;
  modeQuestionBankState: ModeQuestionBankStateMap;
}): ModeQuestionBankProgressItem[] =>
  SPECIAL_TRAINING_MODE_IDS.reduce<ModeQuestionBankProgressItem[]>(
    (items, modeId) => {
      const modeState =
        modeQuestionBankState[modeId] ?? createEmptyModeQuestionBankState();
      const mode = availableModes.find((candidate) => candidate.id === modeId);
      if (!mode || (!modeState.building && modeState.status !== "ERROR")) {
        return items;
      }
      items.push({
        modeId,
        title: mode.title,
        label: formatMessageByLanguage(
          language,
          modeState.building
            ? "trainer.questionBank.statusResetting"
            : "trainer.questionBank.statusError",
        ),
        tone: modeState.building ? "warning" : "danger",
      });
      return items;
    },
    [],
  );

export const resolveSpecialTrainingHelpContextId = ({
  view,
  activeModeId,
}: {
  view: "MODE_PICKER" | "TRAINING" | "SETTLEMENT";
  activeModeId: string | null | undefined;
}): DesktopHelpContextId =>
  view === "MODE_PICKER"
    ? "SPECIAL_TRAINING_MODE_SELECTION"
    : view === "SETTLEMENT"
      ? "SPECIAL_TRAINING_SETTLEMENT"
      : activeModeId === "risk-discipline-training"
        ? "SPECIAL_TRAINING_RISK_SURVIVAL"
        : "SPECIAL_TRAINING_FAST_DECISION";

export const resolveSpecialTrainingPageClassName = ({
  view,
  isFastDecisionMode,
}: {
  view: "MODE_PICKER" | "TRAINING" | "SETTLEMENT";
  isFastDecisionMode: boolean;
}): string => {
  const stateClassName =
    view === "MODE_PICKER"
      ? "is-mode-picker"
      : view === "TRAINING" && isFastDecisionMode
        ? "is-fast-decision-training"
        : "";
  return `settings-page special-training-page ${stateClassName}`.trim();
};
