// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyModeQuestionBankState,
  type ModeQuestionBankState,
} from "../../src/workspaces/special-training/specialTrainingModeRegistry";
import { buildModePickerQuestionBankViewModel } from "../../src/workspaces/special-training/view-models/specialTrainingModePickerViewModel";

const labels = {
  loadingBadge: "Loading",
  refreshingBadge: "Refreshing",
  refreshingHint: "Refreshing with previous summary",
  statusResetting: "Resetting",
  statusError: "Bank Error",
  statusEmpty: "Question bank empty",
  statusFresh: "Not Started",
  statusInProgress: "In Progress",
  statusInsufficient: "Not Enough Questions",
  actionResetting: "Resetting...",
  actionReset: "Reset Question Bank",
  activeSessionStaleNotice: "Stale current run",
  insufficientHintTemplate: "{0}/{1}",
  restartHintTemplate: "{0}",
  readyHintTemplate: "{0}/{1}",
};

const buildState = (
  patch: Partial<ModeQuestionBankState> = {},
): ModeQuestionBankState => ({
  ...createEmptyModeQuestionBankState(),
  scopeHash: "scope-ready",
  totalQuestionCount: 10,
  remainingQuestionCount: 10,
  availableQuestionCount: 10,
  status: "READY_FRESH",
  actionAvailability: {
    start: {
      enabled: true,
      reasonCode: null,
      hasCapacityForRun: true,
      willRestartQuestionScope: false,
    },
    reset: {
      enabled: false,
      reasonCode: "QUESTION_BANK_HAS_NO_PROGRESS",
      hasProgress: false,
    },
  },
  ...patch,
});

const buildViewModel = (
  state: ModeQuestionBankState,
  activeQuestionCount = 5,
) =>
  buildModePickerQuestionBankViewModel({
    state,
    activeQuestionCount,
    labels,
    formatMoneyFixed: (value) => String(value),
    formatTemplate: (template, values) => {
      let result = template;
      values.forEach((value, index) => {
        result = result.replace(`{${index}}`, String(value));
      });
      return result;
    },
  });

test("auto-switched question bank with no progress displays not started", () => {
  const viewModel = buildViewModel(
    buildState({
      status: "AUTO_SWITCHED",
      completedQuestionCount: 0,
      noticeKind: "AUTO_SWITCHED_RANGE",
      noticeMessage: "New question bank applied",
    }),
  );

  assert.equal(viewModel.status.label, labels.statusFresh);
  assert.equal(viewModel.status.tone, "ready");
});

test("auto-switched question bank with progress displays in progress", () => {
  const viewModel = buildViewModel(
    buildState({
      status: "AUTO_SWITCHED",
      completedQuestionCount: 3,
      remainingQuestionCount: 7,
      availableQuestionCount: 7,
      noticeKind: "AUTO_SWITCHED_REVISION",
      noticeMessage: "New question bank applied",
      actionAvailability: {
        start: {
          enabled: true,
          reasonCode: null,
          hasCapacityForRun: true,
          willRestartQuestionScope: false,
        },
        reset: {
          enabled: true,
          reasonCode: null,
          hasProgress: true,
        },
      },
    }),
  );

  assert.equal(viewModel.status.label, labels.statusInProgress);
  assert.equal(viewModel.status.tone, "ready");
});

test("question bank warning states stay visible ahead of progress labels", () => {
  assert.equal(
    buildViewModel(buildState({ building: true })).status.label,
    labels.statusResetting,
  );
  assert.equal(
    buildViewModel(buildState({ status: "ERROR" })).status.label,
    labels.statusError,
  );
  assert.equal(
    buildViewModel(
      buildState({
        status: "EMPTY",
        totalQuestionCount: 0,
        completedQuestionCount: 0,
        remainingQuestionCount: 0,
        availableQuestionCount: 0,
      }),
    ).status.label,
    labels.statusEmpty,
  );
  assert.equal(
    buildViewModel(
      buildState({
        totalQuestionCount: 3,
        completedQuestionCount: 1,
        remainingQuestionCount: 2,
        availableQuestionCount: 2,
        actionAvailability: {
          start: {
            enabled: false,
            reasonCode: "QUESTION_BANK_INSUFFICIENT",
            hasCapacityForRun: false,
            willRestartQuestionScope: false,
          },
          reset: {
            enabled: true,
            reasonCode: null,
            hasProgress: true,
          },
        },
      }),
      5,
    ).status.label,
    labels.statusInsufficient,
  );
});

test("question bank refreshing keeps the previous actionable status visible", () => {
  const refreshingViewModel = buildViewModel(buildState({ refreshing: true }));
  assert.equal(refreshingViewModel.status.label, labels.statusFresh);
  assert.equal(refreshingViewModel.status.tone, "ready");
  assert.equal(refreshingViewModel.hintText, "10/5");
});

test("question bank error states keep actionable detail visible", () => {
  const errorViewModel = buildViewModel(
    buildState({
      status: "ERROR",
      errorMessage: "Preview failed; retry available",
    }),
  );
  assert.equal(errorViewModel.status.label, labels.statusError);
  assert.equal(errorViewModel.hintText, "Preview failed; retry available");
});
