// SPDX-License-Identifier: GPL-3.0-only

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModePickerStatusTone = 'ready' | 'warning' | 'danger' | 'loading' | 'neutral';

export type ModePickerQuestionBankStatusFact = {
  label: string;
  tone: ModePickerStatusTone;
  isPulsing: boolean;
  statusCode: string;
};

export type ModePickerNoticeTone = 'ready' | 'warning' | 'danger' | 'neutral';

export type ModePickerQuestionBankFact = {
  hasExistingQuestionBank: boolean;
  hasProgress: boolean;
  hasQuestionBankCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
  sessionUsesOldSnapshot: boolean;
  status: ModePickerQuestionBankStatusFact;
  resetDisabled: boolean;
  noticeTone: ModePickerNoticeTone;
  noticeMessage: string | null;
  errorMessage: string | null;
  isLoading: boolean;
  isBuilding: boolean;
  isRefreshing: boolean;
  totalQuestionCount: number;
  availableQuestionCount: number;
  completedQuestionCount: number;
};

export type ModePickerStartAvailabilityFact = {
  enabled: boolean;
  reasonCode: string | null;
  hasCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
};

export type ModePickerReadinessFact = {
  canStart: boolean;
  canRestartProgress: boolean;
  startTrainingUnavailable: boolean;
  startAvailability: ModePickerStartAvailabilityFact;
  questionBankFact: ModePickerQuestionBankFact;
  prepQuestionCountTone: 'loading' | 'danger' | 'warning' | 'ready';
  prepQuestionCountSummary: {
    total: number;
    available: number;
    completed: number;
    activeQuestionCount: number;
    hasCapacityForRun: boolean;
    willRestartQuestionScope: boolean;
    isLoading: boolean;
    isBuilding: boolean;
  };
};

// ---------------------------------------------------------------------------
// Types for input
// ---------------------------------------------------------------------------

type QuestionBankStateInput = {
  loading: boolean;
  refreshing: boolean;
  building: boolean;
  status: string;
  errorMessage: string | null;
  noticeMessage: string | null;
  totalQuestionCount: number;
  availableQuestionCount: number;
  completedQuestionCount: number;
  sessionUsesOldSnapshot: boolean;
  actionAvailability: {
    start: {
      enabled: boolean;
      hasCapacityForRun: boolean;
      willRestartQuestionScope: boolean;
    };
    reset: {
      enabled: boolean;
      hasProgress: boolean;
    };
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const buildModePickerQuestionBankFact = ({
  state,
}: {
  state: QuestionBankStateInput;
}): ModePickerQuestionBankFact => {
  const hasExistingQuestionBank = state.totalQuestionCount > 0;
  const hasProgress = state.actionAvailability.reset.hasProgress;
  const hasQuestionBankCapacityForRun =
    state.actionAvailability.start.hasCapacityForRun;
  const willRestartQuestionScope =
    state.actionAvailability.start.willRestartQuestionScope;

  const statusCode = (() => {
    if (state.loading) return 'LOADING';
    if (state.refreshing) return 'REFRESHING';
    if (state.building) return 'BUILDING';
    if (state.status === 'ERROR') return 'ERROR';
    if (!hasExistingQuestionBank) return 'EMPTY';
    if (!hasQuestionBankCapacityForRun) return 'INSUFFICIENT';
    if (hasProgress) return 'IN_PROGRESS';
    return 'FRESH';
  })();

  const statusTone: ModePickerStatusTone = (() => {
    if (state.loading || state.refreshing) return 'loading';
    if (state.building) return 'warning';
    if (state.status === 'ERROR') return 'danger';
    if (!hasExistingQuestionBank) return 'danger';
    if (!hasQuestionBankCapacityForRun) return 'danger';
    return 'ready';
  })();

  const isPulsing = !state.loading && !state.refreshing && !state.building &&
    state.status !== 'ERROR' && hasExistingQuestionBank && !hasQuestionBankCapacityForRun;

  const noticeTone: ModePickerNoticeTone =
    state.status === 'ERROR'
      ? 'danger'
      : state.status === 'AUTO_SWITCHED'
        ? 'warning'
        : state.status === 'READY_IN_PROGRESS'
          ? 'ready'
          : !hasQuestionBankCapacityForRun
            ? 'danger'
            : 'neutral';

  return {
    hasExistingQuestionBank,
    hasProgress,
    hasQuestionBankCapacityForRun,
    willRestartQuestionScope,
    sessionUsesOldSnapshot: state.sessionUsesOldSnapshot,
    status: {
      label: statusCode,
      tone: statusTone,
      isPulsing,
      statusCode,
    },
    resetDisabled:
      state.loading || state.building || !state.actionAvailability.reset.enabled,
    noticeTone,
    noticeMessage: state.noticeMessage || null,
    errorMessage: state.status === 'ERROR' ? state.errorMessage : null,
    isLoading: state.loading,
    isBuilding: state.building,
    isRefreshing: state.refreshing,
    totalQuestionCount: state.totalQuestionCount,
    availableQuestionCount: state.availableQuestionCount,
    completedQuestionCount: state.completedQuestionCount,
  };
};

export const buildModePickerStartAvailabilityFact = ({
  isQuestionLoading,
  questionBankFact,
}: {
  isQuestionLoading: boolean;
  questionBankFact: ModePickerQuestionBankFact;
}): ModePickerStartAvailabilityFact => {
  const enabled =
    !isQuestionLoading &&
    !questionBankFact.isLoading &&
    !questionBankFact.isBuilding &&
    questionBankFact.hasExistingQuestionBank &&
    questionBankFact.hasQuestionBankCapacityForRun;
  return {
    enabled,
    reasonCode: enabled ? null : 'START_UNAVAILABLE',
    hasCapacityForRun: questionBankFact.hasQuestionBankCapacityForRun,
    willRestartQuestionScope: questionBankFact.willRestartQuestionScope,
  };
};

export const buildModePickerReadinessFact = ({
  isQuestionLoading,
  questionBankState,
  selectedBank,
  selectedBankMissingPoolIdsLength,
  activeQuestionCount,
}: {
  isQuestionLoading: boolean;
  questionBankState: QuestionBankStateInput;
  selectedBank: unknown | null | undefined;
  selectedBankMissingPoolIdsLength: number;
  activeQuestionCount: number;
}): ModePickerReadinessFact => {
  const questionBankFact = buildModePickerQuestionBankFact({
    state: questionBankState,
  });
  const startAvailability = buildModePickerStartAvailabilityFact({
    isQuestionLoading,
    questionBankFact,
  });
  const canRestartProgress =
    !!selectedBank &&
    selectedBankMissingPoolIdsLength <= 0 &&
    questionBankState.actionAvailability.reset.enabled &&
    !questionBankFact.isLoading &&
    !questionBankFact.isRefreshing &&
    !questionBankFact.isBuilding;

  const prepQuestionCountTone: ModePickerReadinessFact['prepQuestionCountTone'] =
    questionBankFact.isLoading
      ? 'loading'
      : !questionBankFact.hasQuestionBankCapacityForRun
        ? 'danger'
        : questionBankFact.willRestartQuestionScope
          ? 'warning'
          : 'ready';

  return {
    canStart: startAvailability.enabled,
    canRestartProgress,
    startTrainingUnavailable: !startAvailability.enabled,
    startAvailability,
    questionBankFact,
    prepQuestionCountTone,
    prepQuestionCountSummary: {
      total: questionBankFact.totalQuestionCount,
      available: questionBankFact.availableQuestionCount,
      completed: questionBankFact.completedQuestionCount,
      activeQuestionCount,
      hasCapacityForRun: questionBankFact.hasQuestionBankCapacityForRun,
      willRestartQuestionScope: questionBankFact.willRestartQuestionScope,
      isLoading: questionBankFact.isLoading,
      isBuilding: questionBankFact.isBuilding,
    },
  };
};
