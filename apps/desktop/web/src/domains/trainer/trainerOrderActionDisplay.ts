// SPDX-License-Identifier: GPL-3.0-only

import type {
  TrainerHotActionName,
  TrainerHotActionState,
} from "@/domains/trainer/trainerActionOrchestratorTypes";
import type { SessionOrderActionAvailability } from "@/domains/training/types";

export type TrainerOrderButtonDisplay = {
  buyOrderDisabled: boolean;
  sellOrderDisabled: boolean;
  isOrderActionBusy: boolean;
};

const ORDER_BUTTON_ACTIONS: ReadonlySet<TrainerHotActionName> = new Set([
  "BUY",
  "SELL",
]);

export const EMPTY_TRAINER_HOT_BUTTON_DISPLAY: TrainerHotActionState = {
  activeAction: null,
  isOrderInFlight: false,
  queuedOrderCount: 0,
};

export const hasTrainerOrderButtonPendingWork = (
  hotActionState: TrainerHotActionState | null | undefined,
): boolean => {
  if (!hotActionState) {
    return false;
  }
  return (
    hotActionState.isOrderInFlight ||
    Math.max(0, Math.floor(Number(hotActionState.queuedOrderCount) || 0)) > 0 ||
    (hotActionState.activeAction
      ? ORDER_BUTTON_ACTIONS.has(hotActionState.activeAction)
      : false)
  );
};

export const toTrainerOrderButtonDisplay = ({
  buyOrderActionState,
  sellOrderActionState,
  hotActionState,
}: {
  buyOrderActionState: SessionOrderActionAvailability | null | undefined;
  sellOrderActionState: SessionOrderActionAvailability | null | undefined;
  hotActionState: TrainerHotActionState | null | undefined;
}): TrainerOrderButtonDisplay => {
  const isOrderActionBusy = hasTrainerOrderButtonPendingWork(hotActionState);
  return {
    buyOrderDisabled: buyOrderActionState?.enabled !== true,
    sellOrderDisabled: sellOrderActionState?.enabled !== true,
    isOrderActionBusy,
  };
};
