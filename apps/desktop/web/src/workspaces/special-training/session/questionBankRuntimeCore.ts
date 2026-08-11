// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMessage } from "@zinuto/shared/i18n";
import type { ApiSpecialTrainingQuestionBankSummary } from "@/api";
import type {
  AppUiLanguage,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import {
  createEmptyModeQuestionBankState,
  resolveRuntimeHorizonBars,
  type ModeQuestionBankState,
  type SpecialTrainingModeRuntimeConfig,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import { toFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  normalizeSpecialTrainingBaseTimeframe,
  resolveSpecialTrainingEffectiveTimeframeFromValue,
} from "@/workspaces/special-training/domain/specialTrainingTimeframes";

type QuestionBankRuntimeNoticeKind =
  | "AUTO_SWITCHED_RANGE"
  | "AUTO_SWITCHED_REVISION"
  | "ACTIVE_SESSION_STALE"
  | "RESET_DONE"
  | null;

type QuestionBankRuntimeStatus = ModeQuestionBankState["status"];

type QuestionBankRuntimeStateFacts = {
  status: QuestionBankRuntimeStatus;
  noticeKind: QuestionBankRuntimeNoticeKind;
  shouldAppendOldProgressNotice: boolean;
  sessionUsesOldSnapshot: boolean;
};

type QuestionBankActionAvailabilityFacts =
  ModeQuestionBankState["actionAvailability"];

const readRuntimeStateFacts = (
  summary: ApiSpecialTrainingQuestionBankSummary,
  reason: "preview" | "reset",
): QuestionBankRuntimeStateFacts => {
  const runtimeState = summary.runtimeState;
  const status = String(runtimeState.status || summary.status);
  const noticeKind = String(runtimeState.noticeKind || "");
  return {
    status:
      status === "AUTO_SWITCHED" ||
      status === "EMPTY" ||
      status === "READY_FRESH" ||
      status === "READY_IN_PROGRESS"
        ? status
        : summary.status,
    noticeKind:
      noticeKind === "AUTO_SWITCHED_RANGE" ||
      noticeKind === "AUTO_SWITCHED_REVISION" ||
      noticeKind === "ACTIVE_SESSION_STALE" ||
      noticeKind === "RESET_DONE"
        ? noticeKind
        : reason === "reset"
          ? "RESET_DONE"
          : null,
    shouldAppendOldProgressNotice:
      runtimeState.shouldAppendOldProgressNotice === true,
    sessionUsesOldSnapshot: runtimeState.sessionUsesOldSnapshot === true,
  };
};

const createUnavailableQuestionBankActionAvailability =
  (): QuestionBankActionAvailabilityFacts => ({
    start: {
      enabled: false,
      reasonCode: "QUESTION_BANK_READ_MODEL_UNAVAILABLE",
      hasCapacityForRun: false,
      willRestartQuestionScope: false,
    },
    reset: {
      enabled: false,
      reasonCode: "QUESTION_BANK_READ_MODEL_UNAVAILABLE",
      hasProgress: false,
    },
  });

const readActionAvailabilityFacts = (
  summary: ApiSpecialTrainingQuestionBankSummary,
): QuestionBankActionAvailabilityFacts => {
  const actionAvailability = summary.actionAvailability;
  const start = actionAvailability.start;
  const reset = actionAvailability.reset;
  return {
    start: {
      enabled: start.enabled === true,
      reasonCode: start.reasonCode,
      hasCapacityForRun: start.hasCapacityForRun === true,
      willRestartQuestionScope: start.willRestartQuestionScope === true,
    },
    reset: {
      enabled: reset.enabled === true,
      reasonCode: reset.reasonCode,
      hasProgress: reset.hasProgress === true,
    },
  };
};

const resolveQuestionBankNoticeMessage = ({
  language,
  noticeKind,
  shouldAppendOldProgressNotice,
}: {
  language: AppUiLanguage;
  noticeKind: QuestionBankRuntimeNoticeKind;
  shouldAppendOldProgressNotice: boolean;
}): string => {
  const baseMessage =
    noticeKind === "RESET_DONE"
      ? formatMessage(language, "trainer.questionBank.resetDoneNotice")
      : noticeKind === "AUTO_SWITCHED_RANGE"
        ? formatMessage(
            language,
            "trainer.questionBank.autoSwitchedRangeNotice",
          )
        : noticeKind === "AUTO_SWITCHED_REVISION"
          ? formatMessage(
              language,
              "trainer.questionBank.autoSwitchedRevisionNotice",
            )
          : noticeKind === "ACTIVE_SESSION_STALE"
            ? formatMessage(
                language,
                "trainer.questionBank.activeSessionStaleNotice",
              )
            : "";
  if (!baseMessage || !shouldAppendOldProgressNotice) {
    return baseMessage;
  }
  return `${baseMessage} ${formatMessage(
    language,
    "trainer.questionBank.oldProgressNotAppliedNotice",
  )}`.trim();
};

export const applyQuestionBankSummaryToState = (
  previous: ModeQuestionBankState,
  summary: ApiSpecialTrainingQuestionBankSummary,
  language: AppUiLanguage,
  reason: "preview" | "reset",
  requestedMinimumBaseTimeframe: BaseTimeframe | null,
): ModeQuestionBankState => {
  const readBackendCount = (value: unknown) => {
    const numeric = toFiniteNumber(value);
    return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : 0));
  };
  const totalQuestionCount = readBackendCount(summary.totalQuestionCount);
  const completedQuestionCount = readBackendCount(
    summary.completedQuestionCount,
  );
  const remainingQuestionCount = readBackendCount(summary.remainingQuestionCount);
  const availableQuestionCount = readBackendCount(summary.availableQuestionCount);
  const builtQuestionCount = readBackendCount(summary.builtQuestionCount);
  const scopeHash = String(summary.scopeHash || "").trim();
  const poolCount = Math.max(0, Math.floor(Number(summary.poolCount) || 0));
  const instrumentCount = Math.max(
    0,
    Math.floor(Number(summary.instrumentCount) || 0),
  );
  const symbolCount = Math.max(0, Math.floor(Number(summary.symbolCount) || 0));
  const runtimeState = readRuntimeStateFacts(summary, reason);
  const actionAvailability = readActionAvailabilityFacts(summary);
  const noticeMessage = resolveQuestionBankNoticeMessage({
    language,
    noticeKind: runtimeState.noticeKind,
    shouldAppendOldProgressNotice:
      runtimeState.shouldAppendOldProgressNotice,
  });
  return {
    ...previous,
    scopeHash,
    poolCount,
    instrumentCount,
    symbolCount,
    totalQuestionCount,
    completedQuestionCount,
    remainingQuestionCount,
    availableQuestionCount,
    builtQuestionCount,
    status: runtimeState.status,
    noticeKind: runtimeState.noticeKind,
    noticeMessage,
    errorMessage: "",
    updatedAt: String(summary.updatedAt || ""),
    expiresAt: summary.expiresAt ?? null,
    effectiveTrainingTimeframes: Array.from(
      new Set(
        (summary.effectiveTimeframes ?? [])
          .map((timeframe) =>
            normalizeSpecialTrainingBaseTimeframe(timeframe),
          )
          .filter((timeframe): timeframe is BaseTimeframe => Boolean(timeframe)),
      ),
    ),
    sourceTimeframes: Array.from(
      new Set(
        (summary.sourceTimeframes ?? [])
          .map((timeframe) =>
            normalizeSpecialTrainingBaseTimeframe(timeframe),
          )
          .filter((timeframe): timeframe is BaseTimeframe => Boolean(timeframe)),
      ),
    ),
    effectiveTrainingTimeframe:
      resolveSpecialTrainingEffectiveTimeframeFromValue(summary) ??
      requestedMinimumBaseTimeframe,
    hasQuestionBankCapacityForRun:
      actionAvailability.start.hasCapacityForRun,
    willRestartQuestionScope:
      actionAvailability.start.willRestartQuestionScope,
    sessionUsesOldSnapshot: runtimeState.sessionUsesOldSnapshot,
    actionAvailability,
  };
};

export const formatQuestionBankTimeframeSummary = (
  effectiveTimeframes: readonly BaseTimeframe[],
  fallbackTimeframe: BaseTimeframe | null,
  formatTimeframeLabel: (timeframe: BaseTimeframe) => string,
): string => {
  const timeframes =
    effectiveTimeframes.length > 0
      ? effectiveTimeframes
      : fallbackTimeframe
        ? [fallbackTimeframe]
        : [];
  return timeframes
    .map((timeframe) => formatTimeframeLabel(timeframe))
    .filter((label) => label.length > 0)
    .join(" / ");
};

export const buildQuestionBankPreviewSignature = (
  selectedBankId: string,
  modeId: SpecialTrainingModeId,
  modeConfig: SpecialTrainingModeRuntimeConfig,
  selectedPoolIds: string[],
  activeSessionScopeHash: string,
): string => {
  const nextPoolIds = [...selectedPoolIds].sort((left, right) =>
    left.localeCompare(right),
  );
  return [
    selectedBankId,
    modeId,
    Math.max(1, Math.floor(Number(modeConfig.questionCount) || 1)),
    resolveRuntimeHorizonBars(modeId, modeConfig.horizonBars),
    String(modeConfig.minimumBaseTimeframe || ""),
    String(activeSessionScopeHash || ""),
    ...nextPoolIds,
  ].join("|");
};

export const createEmptyQuestionBankScopeState = (
  poolCount: number,
): Partial<ModeQuestionBankState> => ({
  scopeHash: "",
  poolCount,
  instrumentCount: 0,
  symbolCount: 0,
  totalQuestionCount: 0,
  completedQuestionCount: 0,
  remainingQuestionCount: 0,
  status: "EMPTY",
  noticeKind: null,
  noticeMessage: "",
  availableQuestionCount: 0,
  builtQuestionCount: 0,
  updatedAt: "",
  expiresAt: null,
  effectiveTrainingTimeframe: null,
  effectiveTrainingTimeframes: [],
  sourceTimeframes: [],
  hasQuestionBankCapacityForRun: false,
  willRestartQuestionScope: false,
  sessionUsesOldSnapshot: false,
  actionAvailability: createUnavailableQuestionBankActionAvailability(),
});

export const hasVisibleQuestionBankSummary = (
  state: ModeQuestionBankState,
): boolean => state.scopeHash.length > 0 || state.totalQuestionCount > 0;

export const applyQuestionBankPreviewPendingToState = (
  previous: ModeQuestionBankState,
): ModeQuestionBankState => {
  const hasVisibleSummary = hasVisibleQuestionBankSummary(previous);
  return {
    ...previous,
    loading: !hasVisibleSummary,
    refreshing: hasVisibleSummary,
    errorMessage: "",
    actionAvailability: createUnavailableQuestionBankActionAvailability(),
  };
};

export const applyQuestionBankResetPendingToState = (
  previous: ModeQuestionBankState,
): ModeQuestionBankState => ({
  ...previous,
  status: "RESETTING",
  noticeKind: null,
  noticeMessage: "",
  errorMessage: "",
  loading: false,
  refreshing: false,
  building: true,
  actionAvailability: createUnavailableQuestionBankActionAvailability(),
});

export const applyQuestionBankResetErrorToState = (
  previous: ModeQuestionBankState,
  errorMessage: string,
): ModeQuestionBankState => ({
  ...previous,
  status: "ERROR",
  noticeKind: null,
  noticeMessage: "",
  errorMessage,
  loading: false,
  refreshing: false,
  building: false,
  actionAvailability: createUnavailableQuestionBankActionAvailability(),
});

export const applyQuestionBankPreviewErrorToState = (
  previous: ModeQuestionBankState,
  poolCount: number,
  errorMessage: string,
): ModeQuestionBankState => {
  const baseState = hasVisibleQuestionBankSummary(previous)
    ? previous
    : {
        ...previous,
        ...createEmptyQuestionBankScopeState(poolCount),
      };
  return {
    ...baseState,
    status: "ERROR",
    noticeKind: null,
    noticeMessage: "",
    errorMessage,
    loading: false,
    refreshing: false,
    actionAvailability: createUnavailableQuestionBankActionAvailability(),
  };
};

export const ensureModeQuestionBankState = (
  currentState: ModeQuestionBankState | undefined,
): ModeQuestionBankState => currentState ?? createEmptyModeQuestionBankState();
