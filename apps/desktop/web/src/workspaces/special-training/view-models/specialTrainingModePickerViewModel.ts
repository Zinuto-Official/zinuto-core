// SPDX-License-Identifier: GPL-3.0-only

import type { ModePickerQuestionBankStatus } from "@/workspaces/special-training/domain/specialTrainingTypes";
import type { ModeQuestionBankState } from "@/workspaces/special-training/specialTrainingModeRegistry";

type QuestionBankNoticeTone = "ready" | "warning" | "danger" | "neutral";

type BuildModePickerQuestionBankViewModelParams = {
  state: ModeQuestionBankState;
  activeQuestionCount: number;
  labels: {
    loadingBadge: string;
    refreshingBadge: string;
    refreshingHint: string;
    statusResetting: string;
    statusError: string;
    statusEmpty: string;
    statusFresh: string;
    statusInProgress: string;
    statusInsufficient: string;
    actionResetting: string;
    actionReset: string;
    activeSessionStaleNotice: string;
    insufficientHintTemplate: string;
    restartHintTemplate: string;
    readyHintTemplate: string;
  };
  formatMoneyFixed: (value: number, digits?: number) => string;
  formatTemplate: (
    template: string,
    values: ReadonlyArray<string | number>,
  ) => string;
};

export type ModePickerQuestionBankViewModel = {
  hasExistingQuestionBank: boolean;
  hasProgress: boolean;
  hasQuestionBankCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
  status: ModePickerQuestionBankStatus;
  actionLabel: string;
  resetDisabled: boolean;
  hintText: string;
  noticeTone: QuestionBankNoticeTone;
  sessionUsesOldSnapshot: boolean;
};

export const buildModePickerQuestionBankViewModel = ({
  state,
  activeQuestionCount,
  labels,
  formatMoneyFixed,
  formatTemplate,
}: BuildModePickerQuestionBankViewModelParams): ModePickerQuestionBankViewModel => {
  const hasExistingQuestionBank = state.totalQuestionCount > 0;
  const hasProgress = state.actionAvailability.reset.hasProgress;
  const hasQuestionBankCapacityForRun =
    state.actionAvailability.start.hasCapacityForRun;
  const willRestartQuestionScope =
    state.actionAvailability.start.willRestartQuestionScope;
  const sessionUsesOldSnapshot = state.sessionUsesOldSnapshot;

  const status: ModePickerQuestionBankStatus = (() => {
    if (state.loading) {
      return {
        label: labels.loadingBadge,
        tone: "loading",
        isPulsing: false,
      };
    }
    if (state.building) {
      return {
        label: labels.statusResetting,
        tone: "warning",
        isPulsing: false,
      };
    }
    if (state.status === "ERROR") {
      return {
        label: labels.statusError,
        tone: "danger",
        isPulsing: false,
      };
    }
    if (!hasExistingQuestionBank) {
      return {
        label: labels.statusEmpty,
        tone: "danger",
        isPulsing: false,
      };
    }
    if (!hasQuestionBankCapacityForRun) {
      return {
        label: labels.statusInsufficient,
        tone: "danger",
        isPulsing: true,
      };
    }
    if (hasProgress) {
      return {
        label: labels.statusInProgress,
        tone: "ready",
        isPulsing: false,
      };
    }
    return {
      label: labels.statusFresh,
      tone: "ready",
      isPulsing: false,
    };
  })();

  const hintText =
    state.noticeMessage ||
    (sessionUsesOldSnapshot ? labels.activeSessionStaleNotice : "") ||
    (state.status === "ERROR" && state.errorMessage ? state.errorMessage : "") ||
    (state.loading || state.building
      ? labels.loadingBadge
      : !hasQuestionBankCapacityForRun
        ? formatTemplate(labels.insufficientHintTemplate, [
            formatMoneyFixed(state.totalQuestionCount, 0),
            formatMoneyFixed(activeQuestionCount, 0),
          ])
        : willRestartQuestionScope
          ? formatTemplate(labels.restartHintTemplate, [
              formatMoneyFixed(state.availableQuestionCount, 0),
            ])
          : formatTemplate(labels.readyHintTemplate, [
              formatMoneyFixed(state.availableQuestionCount, 0),
              formatMoneyFixed(activeQuestionCount, 0),
            ]));

  const noticeTone: QuestionBankNoticeTone =
    state.status === "ERROR"
      ? "danger"
      : state.status === "AUTO_SWITCHED"
        ? "warning"
        : state.status === "READY_IN_PROGRESS"
          ? "ready"
          : !hasQuestionBankCapacityForRun
            ? "danger"
            : "neutral";

  return {
    hasExistingQuestionBank,
    hasProgress,
    hasQuestionBankCapacityForRun,
    willRestartQuestionScope,
    status,
    actionLabel: state.building ? labels.actionResetting : labels.actionReset,
    resetDisabled:
      state.loading || state.building || !state.actionAvailability.reset.enabled,
    hintText,
    noticeTone,
    sessionUsesOldSnapshot,
  };
};
