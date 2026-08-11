// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type {
  AppUiLanguage,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import {
  createModeNumberMap,
  createModeStringMap,
  DEFAULT_MODE_RUNTIME_CONFIG_BY_ID,
  type ModeQuestionBankState,
  type ModeQuestionBankStateMap,
  type SpecialTrainingModeRuntimeConfig,
  type SpecialTrainingModeRuntimeConfigMap,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import {
  buildQuestionBankPreviewSignature,
  createEmptyQuestionBankScopeState,
  ensureModeQuestionBankState,
  applyQuestionBankSummaryToState,
  applyQuestionBankPreviewErrorToState,
  applyQuestionBankPreviewPendingToState,
  applyQuestionBankResetErrorToState,
  applyQuestionBankResetPendingToState,
  hasVisibleQuestionBankSummary,
} from "@/workspaces/special-training/session/questionBankRuntimeCore";
import {
  previewSpecialTrainingQuestionBank,
  resetSpecialTrainingQuestionBank,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import { resolveRuntimeHorizonBars } from "@/workspaces/special-training/specialTrainingModeRegistry";
import { resolveSpecialTrainingBankApiErrorMessage } from "@/workspaces/special-training/specialTrainingBankUi";

type UseSpecialTrainingQuestionBankRuntimeParams = {
  language: AppUiLanguage;
  dataLoadFailedLabel: string;
  selectedBankId: string;
  selectedPoolIds: readonly string[];
  modeQuestionBankState: ModeQuestionBankStateMap;
  activeChallengeModeId: SpecialTrainingModeId | null;
  hasLiveChallengeSession: boolean;
  currentChallengeScopeHash: string;
  modeRuntimeConfigById: SpecialTrainingModeRuntimeConfigMap;
  setModeRuntimeConfigById: Dispatch<
    SetStateAction<SpecialTrainingModeRuntimeConfigMap>
  >;
  setModeQuestionBankState: Dispatch<SetStateAction<ModeQuestionBankStateMap>>;
  notifyError: (message: string) => void;
};

type UseSpecialTrainingQuestionBankRuntimeResult = {
  resetModeQuestionBank: (modeId: SpecialTrainingModeId) => Promise<void>;
  updateModeRuntimeConfig: (
    modeId: SpecialTrainingModeId,
    next: Partial<SpecialTrainingModeRuntimeConfig>,
  ) => void;
};

const areModeRuntimeConfigsEqual = (
  left: SpecialTrainingModeRuntimeConfig,
  right: SpecialTrainingModeRuntimeConfig,
): boolean =>
  left.questionCount === right.questionCount &&
  left.horizonBars === right.horizonBars &&
  left.operationLimit === right.operationLimit &&
  left.decisionSecondsLimit === right.decisionSecondsLimit &&
  left.minimumBaseTimeframe === right.minimumBaseTimeframe &&
  left.fastDecisionStrictnessLevel === right.fastDecisionStrictnessLevel;

const isRecoverableQuestionBankPreviewError = (error: unknown): boolean => {
  const rawCode =
    error && typeof error === "object" && !Array.isArray(error)
      ? String(
          (error as { code?: unknown; errorCode?: unknown }).code ??
            (error as { code?: unknown; errorCode?: unknown }).errorCode ??
            "",
        )
      : "";
  const code = rawCode.toUpperCase();
  return (
    code.includes("STALE") &&
    (code.includes("SCOPE") ||
      code.includes("WINDOW") ||
      code.includes("QUESTION_BANK"))
  );
};

const readQuestionBankRuntimeErrorCode = (error: unknown): string =>
  error && typeof error === "object" && !Array.isArray(error)
    ? String(
        (error as { code?: unknown; errorCode?: unknown }).code ??
          (error as { code?: unknown; errorCode?: unknown }).errorCode ??
          "",
      )
        .trim()
        .toUpperCase()
    : "";

const readQuestionBankRuntimeErrorReason = (error: unknown): string =>
  error && typeof error === "object" && !Array.isArray(error)
    ? String(
        ((error as { args?: { reason?: unknown } }).args?.reason ??
          (error as { reason?: unknown }).reason ??
          ""),
      )
        .trim()
        .toUpperCase()
    : "";

const isQuestionBankPreviewAbortError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  const code = readQuestionBankRuntimeErrorCode(error);
  return (
    code === "BACKEND_HTTP_REQUEST_CANCELED" &&
    readQuestionBankRuntimeErrorReason(error) === "ABORTED"
  );
};

export const useSpecialTrainingQuestionBankRuntime = ({
  language,
  dataLoadFailedLabel,
  selectedBankId,
  selectedPoolIds,
  modeQuestionBankState,
  activeChallengeModeId,
  hasLiveChallengeSession,
  currentChallengeScopeHash,
  modeRuntimeConfigById,
  setModeRuntimeConfigById,
  setModeQuestionBankState,
  notifyError,
}: UseSpecialTrainingQuestionBankRuntimeParams): UseSpecialTrainingQuestionBankRuntimeResult => {
  const questionBankPreviewRequestRef = useRef<
    Record<SpecialTrainingModeId, number>
  >(createModeNumberMap());
  const questionBankBuildRequestRef = useRef<Record<SpecialTrainingModeId, number>>(
    createModeNumberMap(),
  );
  const lastPreviewSignatureByModeRef = useRef<Record<SpecialTrainingModeId, string>>(
    createModeStringMap(),
  );
  const previewAbortControllerByModeRef = useRef<
    Partial<Record<SpecialTrainingModeId, AbortController>>
  >({});
  const buildAbortControllerByModeRef = useRef<
    Partial<Record<SpecialTrainingModeId, AbortController>>
  >({});

  useEffect(() => {
    return () => {
      Object.values(previewAbortControllerByModeRef.current).forEach((controller) =>
        controller?.abort(),
      );
      Object.values(buildAbortControllerByModeRef.current).forEach((controller) =>
        controller?.abort(),
      );
    };
  }, []);

  const updateModeQuestionBankState = useCallback(
    (modeId: SpecialTrainingModeId, next: Partial<ModeQuestionBankState>) => {
      setModeQuestionBankState((current) => ({
        ...current,
        [modeId]: {
          ...current[modeId],
          ...next,
        },
      }));
    },
    [setModeQuestionBankState],
  );

  const commitQuestionBankReadModel = useCallback(
    (
      modeId: SpecialTrainingModeId,
      summary: Awaited<ReturnType<typeof previewSpecialTrainingQuestionBank>>,
      reason: "preview" | "reset",
    ) => {
      setModeQuestionBankState((current) => {
        const previous = ensureModeQuestionBankState(current[modeId]);
        return {
          ...current,
          [modeId]: applyQuestionBankSummaryToState(
            previous,
            summary,
            language,
            reason,
            null,
          ),
        };
      });
    },
    [language, setModeQuestionBankState],
  );

  const refreshModeQuestionBankPreview = useCallback(
    async (
      modeId: SpecialTrainingModeId,
      poolIds: string[],
      modeConfig: SpecialTrainingModeRuntimeConfig,
    ) => {
      const nextRequestVersion =
        (questionBankPreviewRequestRef.current[modeId] ?? 0) + 1;
      questionBankPreviewRequestRef.current[modeId] = nextRequestVersion;
      previewAbortControllerByModeRef.current[modeId]?.abort();
      const previewAbortController = new AbortController();
      previewAbortControllerByModeRef.current[modeId] = previewAbortController;
      setModeQuestionBankState((current) => {
        const previous = ensureModeQuestionBankState(current[modeId]);
        return {
          ...current,
          [modeId]: applyQuestionBankPreviewPendingToState(previous),
        };
      });

      if (!selectedBankId) {
        updateModeQuestionBankState(modeId, {
          ...createEmptyQuestionBankScopeState(poolIds.length),
          status: "EMPTY",
          errorMessage: "",
          loading: false,
          refreshing: false,
        });
        return;
      }

      try {
        const previousState = ensureModeQuestionBankState(
          modeQuestionBankState[modeId],
        );
        const requestPayload = {
          bankId: selectedBankId,
          modeId,
          questionCount: modeConfig.questionCount,
          horizonBars: resolveRuntimeHorizonBars(modeId, modeConfig.horizonBars),
          previousSummary: hasVisibleQuestionBankSummary(previousState)
            ? {
                scopeHash: previousState.scopeHash,
                poolCount: previousState.poolCount,
                instrumentCount: previousState.instrumentCount,
                symbolCount: previousState.symbolCount,
                totalQuestionCount: previousState.totalQuestionCount,
                completedQuestionCount: previousState.completedQuestionCount,
              }
            : null,
          activeSession: {
            hasLiveChallengeSession,
            modeId: activeChallengeModeId,
            scopeHash: currentChallengeScopeHash,
          },
        };
        let summary: Awaited<
          ReturnType<typeof previewSpecialTrainingQuestionBank>
        > | null = null;
        for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
          try {
            summary = await previewSpecialTrainingQuestionBank(requestPayload, {
              signal: previewAbortController.signal,
            });
            break;
          } catch (error) {
            if (
              attemptIndex === 0 &&
              isRecoverableQuestionBankPreviewError(error)
            ) {
              continue;
            }
            throw error;
          }
        }
        if (
          questionBankPreviewRequestRef.current[modeId] !== nextRequestVersion
        ) {
          return;
        }
        if (!summary) {
          return;
        }
        commitQuestionBankReadModel(modeId, summary, "preview");
      } catch (error) {
        if (
          questionBankPreviewRequestRef.current[modeId] !== nextRequestVersion
        ) {
          return;
        }
        if (isQuestionBankPreviewAbortError(error)) {
          return;
        }
        const message = resolveSpecialTrainingBankApiErrorMessage({
          language,
          error,
          fallbackMessage: dataLoadFailedLabel,
        });
        setModeQuestionBankState((current) => ({
          ...current,
          [modeId]: applyQuestionBankPreviewErrorToState(
            ensureModeQuestionBankState(current[modeId]),
            poolIds.length,
            message,
          ),
        }));
        notifyError(message);
      } finally {
        if (
          questionBankPreviewRequestRef.current[modeId] === nextRequestVersion &&
          previewAbortControllerByModeRef.current[modeId] === previewAbortController
        ) {
          delete previewAbortControllerByModeRef.current[modeId];
          updateModeQuestionBankState(modeId, {
            loading: false,
            refreshing: false,
          });
        }
      }
    },
    [
      commitQuestionBankReadModel,
      dataLoadFailedLabel,
      language,
      activeChallengeModeId,
      currentChallengeScopeHash,
      hasLiveChallengeSession,
      modeQuestionBankState,
      notifyError,
      selectedBankId,
      setModeQuestionBankState,
      updateModeQuestionBankState,
    ],
  );

  const resetModeQuestionBank = useCallback(
    async (modeId: SpecialTrainingModeId) => {
      const modeConfig =
        modeRuntimeConfigById[modeId] ??
        DEFAULT_MODE_RUNTIME_CONFIG_BY_ID[modeId];
      const nextRequestVersion =
        (questionBankBuildRequestRef.current[modeId] ?? 0) + 1;
      questionBankBuildRequestRef.current[modeId] = nextRequestVersion;
      buildAbortControllerByModeRef.current[modeId]?.abort();
      const buildAbortController = new AbortController();
      buildAbortControllerByModeRef.current[modeId] = buildAbortController;
      setModeQuestionBankState((current) => ({
        ...current,
        [modeId]: applyQuestionBankResetPendingToState(
          ensureModeQuestionBankState(current[modeId]),
        ),
      }));

      if (!selectedBankId) {
        updateModeQuestionBankState(modeId, {
          ...createEmptyQuestionBankScopeState(selectedPoolIds.length),
          status: "EMPTY",
          errorMessage: "",
          building: false,
          refreshing: false,
        });
        return;
      }

      try {
        const summary = await resetSpecialTrainingQuestionBank(
          {
            bankId: selectedBankId,
            modeId,
            questionCount: modeConfig.questionCount,
            horizonBars: resolveRuntimeHorizonBars(modeId, modeConfig.horizonBars),
            activeSession: {
              hasLiveChallengeSession,
              modeId: activeChallengeModeId,
              scopeHash: currentChallengeScopeHash,
            },
          },
          { signal: buildAbortController.signal },
        );
        if (
          questionBankBuildRequestRef.current[modeId] !== nextRequestVersion
        ) {
          return;
        }
        commitQuestionBankReadModel(modeId, summary, "reset");
      } catch (error) {
        if (
          questionBankBuildRequestRef.current[modeId] !== nextRequestVersion
        ) {
          return;
        }
        if (isQuestionBankPreviewAbortError(error)) {
          return;
        }
        const message = resolveSpecialTrainingBankApiErrorMessage({
          language,
          error,
          fallbackMessage: dataLoadFailedLabel,
        });
        setModeQuestionBankState((current) => ({
          ...current,
          [modeId]: applyQuestionBankResetErrorToState(
            ensureModeQuestionBankState(current[modeId]),
            message,
          ),
        }));
        notifyError(message);
      } finally {
        if (
          questionBankBuildRequestRef.current[modeId] === nextRequestVersion &&
          buildAbortControllerByModeRef.current[modeId] === buildAbortController
        ) {
          delete buildAbortControllerByModeRef.current[modeId];
          updateModeQuestionBankState(modeId, {
            building: false,
            refreshing: false,
          });
        }
      }
    },
    [
      commitQuestionBankReadModel,
      dataLoadFailedLabel,
      language,
      activeChallengeModeId,
      currentChallengeScopeHash,
      hasLiveChallengeSession,
      modeRuntimeConfigById,
      notifyError,
      selectedBankId,
      selectedPoolIds,
      setModeQuestionBankState,
      updateModeQuestionBankState,
    ],
  );

  const updateModeRuntimeConfig = useCallback(
    (
      modeId: SpecialTrainingModeId,
      next: Partial<SpecialTrainingModeRuntimeConfig>,
    ) => {
      setModeRuntimeConfigById((current) => {
        const previous =
          current[modeId] ?? DEFAULT_MODE_RUNTIME_CONFIG_BY_ID[modeId];
        const nextConfig = {
          ...previous,
          ...next,
        };

        if (areModeRuntimeConfigsEqual(previous, nextConfig)) {
          return current;
        }

        return {
          ...current,
          [modeId]: nextConfig,
        };
      });
    },
    [setModeRuntimeConfigById],
  );

  useEffect(() => {
    if (!activeChallengeModeId) {
      Object.values(previewAbortControllerByModeRef.current).forEach((controller) =>
        controller?.abort(),
      );
      return;
    }
    const modeId = activeChallengeModeId;
    Object.entries(previewAbortControllerByModeRef.current).forEach(
      ([runningModeId, controller]) => {
        if (runningModeId !== modeId) {
          controller?.abort();
        }
      },
    );
    const modeConfig =
      modeRuntimeConfigById[modeId] ?? DEFAULT_MODE_RUNTIME_CONFIG_BY_ID[modeId];
    const signature = buildQuestionBankPreviewSignature(
      selectedBankId,
      modeId,
      modeConfig,
      [...selectedPoolIds],
      currentChallengeScopeHash,
    );
    const previousSignature =
      lastPreviewSignatureByModeRef.current[modeId] ?? "";
    if (previousSignature === signature) {
      return;
    }
    lastPreviewSignatureByModeRef.current[modeId] = signature;
    void refreshModeQuestionBankPreview(modeId, [...selectedPoolIds], modeConfig);
  }, [
    activeChallengeModeId,
    currentChallengeScopeHash,
    modeRuntimeConfigById,
    refreshModeQuestionBankPreview,
    selectedBankId,
    selectedPoolIds,
  ]);

  return {
    resetModeQuestionBank,
    updateModeRuntimeConfig,
  };
};
