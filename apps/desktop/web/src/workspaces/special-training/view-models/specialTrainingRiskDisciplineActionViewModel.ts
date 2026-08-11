// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingRiskActionBlockReasonCode,
} from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";

export type RiskUiActionBlockReasonCode =
  ApiSpecialTrainingRiskActionBlockReasonCode;

export type RiskUiActionStatus = {
  allowed: boolean;
  blockedReasonCode: RiskUiActionBlockReasonCode | null;
  blockedReason: string | null;
};

export type RiskUiUndoActionStatus = RiskUiActionStatus & {
  availableSteps: number;
  maxSteps: number;
  lastUndoableAction: "BUY_AND_ADVANCE" | "SELL_AND_ADVANCE" | "NEXT_BAR" | null;
};

type BuildRiskDisciplineActionViewModelInput = {
  riskRuntimeActionState:
    | NonNullable<ApiSpecialTrainingChallengeRuntime["actionState"]>
    | null;
  resolveRiskActionBlockedReasonText: (
    code: RiskUiActionBlockReasonCode | null,
    fallbackReason?: string | null,
  ) => string | null;
  tt: (key: AppTextKey) => string;
  nextBarLabel: string;
};

export const buildRiskDisciplineActionViewModel = ({
  riskRuntimeActionState,
  resolveRiskActionBlockedReasonText,
  tt,
  nextBarLabel,
}: BuildRiskDisciplineActionViewModelInput) => {
  const readRiskUiActionDisplay = (input: {
    serverState:
      | {
          allowed: boolean;
          blockedReasonCode: ApiSpecialTrainingRiskActionBlockReasonCode | null;
          blockedReason: string | null;
        }
      | null
      | undefined;
  }): RiskUiActionStatus => {
    const serverState = input.serverState;
    if (!serverState) {
      return {
        allowed: false,
        blockedReasonCode: null,
        blockedReason: null,
      };
    }
    const blockedReasonCode = serverState.allowed
      ? null
      : serverState.blockedReasonCode;
    return {
      allowed: serverState.allowed === true,
      blockedReasonCode,
      blockedReason: resolveRiskActionBlockedReasonText(
        blockedReasonCode,
        serverState.blockedReason,
      ),
    };
  };
  const riskBuyAdvanceActionState = readRiskUiActionDisplay({
    serverState: riskRuntimeActionState?.buyAdvance,
  });
  const riskSellAdvanceActionState = readRiskUiActionDisplay({
    serverState: riskRuntimeActionState?.sellAdvance,
  });
  const riskNextBarActionState = readRiskUiActionDisplay({
    serverState: riskRuntimeActionState?.nextBar,
  });
  const riskUndoActionState: RiskUiUndoActionStatus = {
    ...readRiskUiActionDisplay({
      serverState: riskRuntimeActionState?.undo,
    }),
    availableSteps: Math.max(
      0,
      Math.floor(Number(riskRuntimeActionState?.undo.availableSteps ?? 0) || 0),
    ),
    maxSteps: Math.max(
      1,
      Math.floor(Number(riskRuntimeActionState?.undo.maxSteps ?? 5) || 5),
    ),
    lastUndoableAction: riskRuntimeActionState?.undo.lastUndoableAction ?? null,
  };
  const lastUndoableRiskActionLabel = (() => {
    switch (riskUndoActionState.lastUndoableAction) {
      case "BUY_AND_ADVANCE":
        return `${tt("appText.buy3")} + ${nextBarLabel}`;
      case "SELL_AND_ADVANCE":
        return `${tt("appText.sell3")} + ${nextBarLabel}`;
      case "NEXT_BAR":
        return nextBarLabel;
      default:
        return tt("appText.message0706");
    }
  })();
  const canUndoRiskAction = riskUndoActionState.allowed;
  const undoAvailableRiskSteps = riskUndoActionState.availableSteps;
  const undoMaxRiskSteps = riskUndoActionState.maxSteps;

  return {
    riskBuyAdvanceActionState,
    riskSellAdvanceActionState,
    riskNextBarActionState,
    riskUndoActionState,
    buyAndAdvanceDisabled: !riskBuyAdvanceActionState.allowed,
    sellAndAdvanceDisabled: !riskSellAdvanceActionState.allowed,
    nextBarDisabled: !riskNextBarActionState.allowed,
    canUndoRiskAction,
    undoAvailableRiskSteps,
    undoMaxRiskSteps,
    riskUndoButtonTitle: canUndoRiskAction
      ? `${tt("appText.undo")} · ${lastUndoableRiskActionLabel} · ${undoAvailableRiskSteps}/${undoMaxRiskSteps} · Cmd/Ctrl+Z`
      : `${tt("appText.undo")} · ${tt("appText.undoStepsAvailable")} · Cmd/Ctrl+Z`,
  };
};
