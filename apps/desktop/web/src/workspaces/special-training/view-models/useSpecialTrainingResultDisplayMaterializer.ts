// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import type {
  ApiSpecialTrainingChallengeCommandResult,
  ApiSpecialTrainingFeedbackCode,
  ApiSpecialTrainingSettlement,
  ApiSpecialTrainingSessionSummary,
  ApiSpecialTrainingTradeAction,
} from "@/api";
import type {
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import { SPECIAL_TRAINING_MODULE_BINDINGS } from "@/ui/config/uiConfig";
import {
  toFiniteNumber,
  toNullableTrimmedString,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  SettlementResult,
  SpecialTrainingQuestion,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type UseSpecialTrainingResultDisplayMaterializerInput = {
  content: SpecialTrainingPageContent;
};

export type SpecialTrainingServerSessionFacts = {
  sessionCompletion?: ApiSpecialTrainingSettlement["sessionCompletion"];
  sessionSummary?: ApiSpecialTrainingSessionSummary | null;
};

export const readServerSessionFactsFromCommandResult = (
  commandResult: ApiSpecialTrainingChallengeCommandResult,
): SpecialTrainingServerSessionFacts => ({
  sessionSummary:
    commandResult.progress.sessionSummary ??
    commandResult.runtime.sessionSummary ??
    null,
});

export const mergeServerResult = (
  serverSettlement: ApiSpecialTrainingSettlement,
  sessionFacts?: SpecialTrainingServerSessionFacts,
): ApiSpecialTrainingSettlement => ({
  ...serverSettlement,
  sessionCompletion:
    serverSettlement.sessionCompletion ?? sessionFacts?.sessionCompletion,
  sessionSummary:
    serverSettlement.sessionSummary ?? sessionFacts?.sessionSummary ?? null,
});

export const useSpecialTrainingResultDisplayMaterializer = ({
  content,
}: UseSpecialTrainingResultDisplayMaterializerInput) => {
  const resolveFeedbackText = useCallback(
    (code: ApiSpecialTrainingFeedbackCode): string => {
      switch (code) {
        case "ABANDONED":
          return content.settlementFeedbackAbandoned;
        case "DIRECTION_CORRECT":
          return content.settlementFeedbackDirectionCorrect;
        case "DIRECTION_WRONG":
          return content.settlementFeedbackDirectionWrong;
        case "DIRECTION_TIMEOUT":
          return content.settlementFeedbackDirectionTimeout;
        case "RECOVERY_SUCCESS":
          return content.settlementFeedbackRecoverySuccess;
        case "RECOVERY_PENDING":
          return content.settlementFeedbackRecoveryPending;
        case "RECOVERY_GRADE_S":
          return content.settlementFeedbackRecoveryGradeS;
        case "RECOVERY_GRADE_A":
          return content.settlementFeedbackRecoveryGradeA;
        case "RECOVERY_GRADE_B":
          return content.settlementFeedbackRecoveryGradeB;
        case "RECOVERY_GRADE_C":
          return content.settlementFeedbackRecoveryGradeC;
        case "ALPHA_POSITIVE":
        case "ALPHA_BEAT_HOLDER":
        case "ALPHA_BEAT_STOPLOSS":
        case "ALPHA_RELATIVE_STRONG":
          return content.settlementFeedbackAlphaPositive;
        case "ALPHA_NEGATIVE":
        case "ALPHA_LOSE_HOLDER":
        case "ALPHA_LOSE_STOPLOSS":
        case "ALPHA_RELATIVE_WEAK":
          return content.settlementFeedbackAlphaNegative;
        case "CAPTURE_HIGH":
          return content.settlementFeedbackCaptureHigh;
        case "CAPTURE_LOW":
          return content.settlementFeedbackCaptureLow;
        case "DRAWDOWN_DOWNGRADED":
          return content.settlementFeedbackDrawdownDowngraded;
        case "DRAWDOWN_CONTROLLED":
          return content.settlementFeedbackDrawdownControlled;
        case "RISK_COST_OFFSET_NARROWED":
          return content.settlementFeedbackRiskCostOffsetNarrowed;
        case "RISK_COST_OFFSET_WIDENED":
          return content.settlementFeedbackRiskCostOffsetWidened;
        case "COST_BASIS_REDUCED":
          return content.settlementFeedbackRiskCostOffsetNarrowed;
        case "COST_BASIS_INCREASED":
          return content.settlementFeedbackRiskCostOffsetWidened;
        case "COST_BASIS_CLEARED":
          return content.settlementFeedbackRecoverySuccess;
        case "OPS_CONTROLLED":
          return content.settlementFeedbackOpsControlled;
        case "OPS_EXCEEDED":
          return content.settlementFeedbackOpsExceeded;
        default:
          return toNullableTrimmedString(code) ?? content.dataLoadFailedLabel;
      }
    },
    [
      content.dataLoadFailedLabel,
      content.settlementFeedbackAbandoned,
      content.settlementFeedbackAlphaNegative,
      content.settlementFeedbackAlphaPositive,
      content.settlementFeedbackCaptureHigh,
      content.settlementFeedbackCaptureLow,
      content.settlementFeedbackDirectionCorrect,
      content.settlementFeedbackDirectionTimeout,
      content.settlementFeedbackDirectionWrong,
      content.settlementFeedbackDrawdownControlled,
      content.settlementFeedbackDrawdownDowngraded,
      content.settlementFeedbackOpsControlled,
      content.settlementFeedbackOpsExceeded,
      content.settlementFeedbackRecoveryGradeA,
      content.settlementFeedbackRecoveryGradeB,
      content.settlementFeedbackRecoveryGradeC,
      content.settlementFeedbackRecoveryGradeS,
      content.settlementFeedbackRecoveryPending,
      content.settlementFeedbackRecoverySuccess,
      content.settlementFeedbackRiskCostOffsetNarrowed,
      content.settlementFeedbackRiskCostOffsetWidened,
    ],
  );

  return useCallback(
    (
      question: SpecialTrainingQuestion,
      modeId: SpecialTrainingModeId,
      cursor: number,
      serverSettlement: ApiSpecialTrainingSettlement,
      nextTradeActions?: ApiSpecialTrainingTradeAction[],
      sessionFacts?: SpecialTrainingServerSessionFacts,
    ): SettlementResult => {
      const mergedServerSettlement = mergeServerResult(
        serverSettlement,
        sessionFacts,
      );
      return {
        questionId: question.id,
        startIndex: Math.max(
          0,
          Math.floor(toFiniteNumber(question.startIndex) || 0),
        ),
        settleToIndex: Math.max(0, Math.floor(toFiniteNumber(cursor) || 0)),
        ...mergedServerSettlement,
        feedback: mergedServerSettlement.feedbackCodes.map(resolveFeedbackText),
        modeBinding: SPECIAL_TRAINING_MODULE_BINDINGS[modeId],
        riskReview: mergedServerSettlement.riskReview ?? null,
        fastReview: mergedServerSettlement.fastReview ?? null,
        tradeActions:
          modeId === "risk-discipline-training"
            ? [...(nextTradeActions ?? [])]
            : undefined,
        directionResult: mergedServerSettlement.directionResult ?? null,
      };
    },
    [resolveFeedbackText],
  );
};
