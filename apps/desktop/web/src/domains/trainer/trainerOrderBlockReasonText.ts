// SPDX-License-Identifier: GPL-3.0-only

import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { TrainerOrderBlockReasonCode } from "@/domains/training/types";

export const resolveTrainerBlockReasonText = (
  code: TrainerOrderBlockReasonCode | null | undefined,
  fallback: string | null | undefined,
  tt: (key: AppTextKey) => string,
): string => {
  if (code === "NO_SESSION") {
    return tt("appText.startTraining");
  }
  if (code === "PRICE_UNAVAILABLE") {
    return tt("appText.invalidReferencePrice");
  }
  if (code === "NEXT_OPEN_UNAVAILABLE") {
    return tt("appText.nextBar");
  }
  if (code === "BUYING_POWER_EMPTY") {
    return tt("appText.insufficientFunds");
  }
  if (code === "SELLING_DISABLED") {
    return tt("appText.sellablePosition");
  }
  if (code === "SELL_T1_BLOCKED") {
    return tt("appText.plus1Limit");
  }
  if (code === "SHORT_CAPACITY_EMPTY") {
    return tt("appText.insufficientMargin");
  }
  if (code === "QUANTITY_ZERO") {
    return tt("appText.belowMinimumTradeStep");
  }
  if (code === "OPERATION_LIMIT_REACHED") {
    return tt("appText.operationLimitReached");
  }
  if (code === "ENTRY_LIMIT_REACHED") {
    return tt("appText.entryLimitReached");
  }
  return String(fallback || "").trim();
};
