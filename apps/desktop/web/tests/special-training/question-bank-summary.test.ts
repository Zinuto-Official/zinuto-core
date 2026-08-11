// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ApiSpecialTrainingQuestionBankSummary } from "../../src/api/specialTraining";
import { createEmptyModeQuestionBankState } from "../../src/workspaces/special-training/specialTrainingModeRegistry";
import {
  applyQuestionBankPreviewErrorToState,
  applyQuestionBankPreviewPendingToState,
  applyQuestionBankResetErrorToState,
  applyQuestionBankResetPendingToState,
  applyQuestionBankSummaryToState,
  formatQuestionBankTimeframeSummary,
} from "../../src/workspaces/special-training/session/questionBankRuntimeCore";

const questionBankRuntimeHookSource = readFileSync(
  new URL(
    "../../src/workspaces/special-training/session/useSpecialTrainingQuestionBankRuntime.ts",
    import.meta.url,
  ),
  "utf8",
);

const createQuestionBankFacts = ({
  status,
  totalQuestionCount,
  availableQuestionCount,
  requestedQuestionCount = 20,
  hasProgress = false,
}: {
  status: ApiSpecialTrainingQuestionBankSummary["status"];
  totalQuestionCount: number;
  availableQuestionCount: number;
  requestedQuestionCount?: number;
  hasProgress?: boolean;
}): Pick<
  ApiSpecialTrainingQuestionBankSummary,
  "capacity" | "actionAvailability" | "runtimeState"
> => {
  const hasCapacityForRun =
    totalQuestionCount > 0 && availableQuestionCount >= requestedQuestionCount;
  return {
    capacity: {
      requestedQuestionCount,
      hasCapacityForRun,
      willRestartQuestionScope: false,
      totalQuestionCount,
      availableQuestionCount,
    },
    actionAvailability: {
      start: {
        enabled: hasCapacityForRun,
        reasonCode: hasCapacityForRun
          ? null
          : "INSUFFICIENT_AVAILABLE_QUESTIONS",
        hasCapacityForRun,
        willRestartQuestionScope: false,
      },
      reset: {
        enabled: hasProgress,
        reasonCode: hasProgress ? null : "NO_PROGRESS",
        hasProgress,
      },
    },
    runtimeState: {
      status,
      noticeKind: null,
      noticeReasonCode: null,
      shouldAppendOldProgressNotice: false,
      sessionUsesOldSnapshot: false,
    },
  };
};

test("mixed-timeframe question bank summary keeps the page out of the no-data error state", () => {
  const previous = {
    ...createEmptyModeQuestionBankState(),
    effectiveTrainingTimeframe: "1d" as const,
  };
  const summary: ApiSpecialTrainingQuestionBankSummary = {
    bankId: "bank-mixed",
    bankName: "bank-mixed",
    modeId: "fast-decision-training",
    scopeHash: "mixed-scope",
    status: "READY_FRESH",
    targetTimeframe: "1m",
    effectiveTimeframes: ["1m", "1d"],
    minimumBaseTimeframe: "1m",
    sourceTimeframes: ["1m", "1d"],
    poolCount: 2,
    instrumentCount: 3,
    totalQuestionCount: 42,
    completedQuestionCount: 0,
    remainingQuestionCount: 42,
    symbolCount: 3,
    availableQuestionCount: 42,
    builtQuestionCount: 0,
    ...createQuestionBankFacts({
      status: "READY_FRESH",
      totalQuestionCount: 42,
      availableQuestionCount: 42,
    }),
    updatedAt: "2026-04-21T00:00:00.000Z",
    expiresAt: null,
  };

  const next = applyQuestionBankSummaryToState(
    previous,
    summary,
    "en",
    "preview",
    "1m",
  );

  assert.equal(next.errorMessage, "");
  assert.equal(next.actionAvailability.start.enabled, true);
  assert.deepEqual(next.effectiveTrainingTimeframes, ["1m", "1d"]);
  assert.equal(
    formatQuestionBankTimeframeSummary(
      next.effectiveTrainingTimeframes,
      next.effectiveTrainingTimeframe,
      (timeframe) => timeframe,
    ),
    "1m / 1d",
  );
});

test("question bank summary does not derive backend total from available and built counts", () => {
  const previous = createEmptyModeQuestionBankState();
  const summary: ApiSpecialTrainingQuestionBankSummary = {
    bankId: "bank-empty",
    bankName: "bank-empty",
    modeId: "fast-decision-training",
    scopeHash: "empty-scope",
    status: "EMPTY",
    targetTimeframe: "1d",
    effectiveTimeframes: ["1d"],
    minimumBaseTimeframe: "1d",
    sourceTimeframes: ["1d"],
    poolCount: 1,
    instrumentCount: 1,
    totalQuestionCount: 0,
    completedQuestionCount: 0,
    remainingQuestionCount: 0,
    symbolCount: 1,
    availableQuestionCount: 42,
    builtQuestionCount: 7,
    ...createQuestionBankFacts({
      status: "EMPTY",
      totalQuestionCount: 0,
      availableQuestionCount: 42,
    }),
    updatedAt: "2026-04-21T00:00:00.000Z",
    expiresAt: null,
  };

  const next = applyQuestionBankSummaryToState(
    previous,
    summary,
    "en",
    "preview",
    "1d",
  );

  assert.equal(next.status, "EMPTY");
  assert.equal(next.totalQuestionCount, 0);
  assert.equal(next.availableQuestionCount, 42);
  assert.equal(next.builtQuestionCount, 7);
});

test("question bank preview errors preserve the last visible summary", () => {
  const previous = {
    ...createEmptyModeQuestionBankState(),
    scopeHash: "last-good-scope",
    poolCount: 2,
    instrumentCount: 4,
    symbolCount: 4,
    totalQuestionCount: 18,
    completedQuestionCount: 3,
    remainingQuestionCount: 15,
    availableQuestionCount: 15,
    status: "READY_IN_PROGRESS" as const,
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
  };

  const pending = applyQuestionBankPreviewPendingToState(previous);
  assert.equal(pending.refreshing, true);
  assert.equal(pending.actionAvailability.start.enabled, false);
  assert.equal(
    pending.actionAvailability.start.reasonCode,
    "QUESTION_BANK_READ_MODEL_UNAVAILABLE",
  );

  const next = applyQuestionBankPreviewErrorToState(
    pending,
    1,
    "题库预览暂不可用",
  );

  assert.equal(next.status, "ERROR");
  assert.equal(next.errorMessage, "题库预览暂不可用");
  assert.equal(next.scopeHash, "last-good-scope");
  assert.equal(next.totalQuestionCount, 18);
  assert.equal(next.completedQuestionCount, 3);
  assert.equal(next.loading, false);
  assert.equal(next.refreshing, false);
  assert.equal(next.actionAvailability.start.enabled, false);
  assert.equal(
    next.actionAvailability.start.reasonCode,
    "QUESTION_BANK_READ_MODEL_UNAVAILABLE",
  );
  assert.equal(next.actionAvailability.reset.enabled, false);
});

test("question bank reset invalidates stale Start until a successful read model restores it", () => {
  const previous = {
    ...createEmptyModeQuestionBankState(),
    scopeHash: "last-good-scope",
    totalQuestionCount: 24,
    remainingQuestionCount: 24,
    availableQuestionCount: 24,
    status: "READY_FRESH" as const,
    actionAvailability: {
      start: {
        enabled: true,
        reasonCode: null,
        hasCapacityForRun: true,
        willRestartQuestionScope: false,
      },
      reset: {
        enabled: false,
        reasonCode: "NO_PROGRESS",
        hasProgress: false,
      },
    },
  };

  const pending = applyQuestionBankResetPendingToState(previous);
  assert.equal(pending.status, "RESETTING");
  assert.equal(pending.building, true);
  assert.equal(pending.actionAvailability.start.enabled, false);
  assert.equal(
    pending.actionAvailability.start.reasonCode,
    "QUESTION_BANK_READ_MODEL_UNAVAILABLE",
  );

  const failed = applyQuestionBankResetErrorToState(
    pending,
    "题库重建暂不可用",
  );
  assert.equal(failed.status, "ERROR");
  assert.equal(failed.building, false);
  assert.equal(failed.errorMessage, "题库重建暂不可用");
  assert.equal(failed.actionAvailability.start.enabled, false);

  const resetSummary: ApiSpecialTrainingQuestionBankSummary = {
    bankId: "bank-reset",
    bankName: "bank-reset",
    modeId: "fast-decision-training",
    scopeHash: "fresh-reset-scope",
    status: "READY_FRESH",
    targetTimeframe: "1d",
    effectiveTimeframes: ["1d"],
    minimumBaseTimeframe: "1d",
    sourceTimeframes: ["1d"],
    poolCount: 1,
    instrumentCount: 2,
    totalQuestionCount: 24,
    completedQuestionCount: 0,
    remainingQuestionCount: 24,
    symbolCount: 2,
    availableQuestionCount: 24,
    builtQuestionCount: 24,
    ...createQuestionBankFacts({
      status: "READY_FRESH",
      totalQuestionCount: 24,
      availableQuestionCount: 24,
    }),
    updatedAt: "2026-07-30T00:00:00.000Z",
    expiresAt: null,
  };
  const recovered = applyQuestionBankSummaryToState(
    failed,
    resetSummary,
    "zh-CN",
    "reset",
    "1d",
  );
  assert.equal(recovered.status, "READY_FRESH");
  assert.equal(recovered.errorMessage, "");
  assert.equal(recovered.actionAvailability.start.enabled, true);
});

test("question bank runtime clears loading flags from current preview and reset requests in finally", () => {
  assert.match(questionBankRuntimeHookSource, /attemptIndex < 2/);
  assert.match(questionBankRuntimeHookSource, /isRecoverableQuestionBankPreviewError/);
  assert.match(questionBankRuntimeHookSource, /isQuestionBankPreviewAbortError/);
  assert.match(questionBankRuntimeHookSource, /BACKEND_HTTP_REQUEST_CANCELED/);
  assert.match(questionBankRuntimeHookSource, /ABORTED/);
  assert.match(questionBankRuntimeHookSource, /resolveSpecialTrainingBankApiErrorMessage/);
  assert.match(
    questionBankRuntimeHookSource,
    /previewAbortControllerByModeRef\.current\[modeId\] === previewAbortController/,
  );
  assert.match(
    questionBankRuntimeHookSource,
    /updateModeQuestionBankState\(modeId,\s*{\s*loading:\s*false,\s*refreshing:\s*false,/,
  );
  assert.match(
    questionBankRuntimeHookSource,
    /buildAbortControllerByModeRef\.current\[modeId\] === buildAbortController/,
  );
  assert.match(
    questionBankRuntimeHookSource,
    /updateModeQuestionBankState\(modeId,\s*{\s*building:\s*false,\s*refreshing:\s*false,/,
  );
});

test("question bank runtime previews only the active mode", () => {
  assert.doesNotMatch(
    questionBankRuntimeHookSource,
    /SPECIAL_TRAINING_MODE_IDS\.forEach/,
  );
  assert.match(
    questionBankRuntimeHookSource,
    /const modeId = activeChallengeModeId/,
  );
});
