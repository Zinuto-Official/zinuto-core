// SPDX-License-Identifier: GPL-3.0-only

import type {
  Account,
  Fill,
  Position,
  Session,
  SessionSnapshot,
} from "@/domains/training/types";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { normalizeReplayDisplayPeriod } from "@/domains/chart/replayDisplayPeriod";
import { DEFAULT_CAPITAL } from "@/workspaces/special-training/domain/specialTrainingConstants";
import { toFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  SessionReviewItem,
  SettlementResult,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

type BuildSpecialTrainingSessionReviewReplayProjectInput = {
  selectedSessionReviewIndex: number | null;
  selectedSessionReviewItem: SessionReviewItem | null;
  sessionSettlements: SettlementResult[];
};

export const resolveSpecialTrainingSessionReviewReplayDisplayPeriod = ({
  selectedSessionReviewItem,
  sessionReviewReplayProject,
  preferredDisplayPeriod,
  fallback = "1d",
}: {
  selectedSessionReviewItem: SessionReviewItem | null;
  sessionReviewReplayProject: ReturnType<typeof buildSpecialTrainingSessionReviewReplayProject>;
  preferredDisplayPeriod?: unknown;
  fallback?: DisplayPeriodKey;
}): DisplayPeriodKey =>
  normalizeReplayDisplayPeriod(preferredDisplayPeriod) ??
  normalizeReplayDisplayPeriod(sessionReviewReplayProject?.replay.displayPeriod) ??
  normalizeReplayDisplayPeriod(selectedSessionReviewItem?.baseTimeframe) ??
  normalizeReplayDisplayPeriod(sessionReviewReplayProject?.replay.baseTimeframe) ??
  fallback;

export const buildSpecialTrainingSessionReviewReplayProject = ({
  selectedSessionReviewIndex,
  selectedSessionReviewItem,
  sessionSettlements,
}: BuildSpecialTrainingSessionReviewReplayProjectInput) => {
  if (selectedSessionReviewIndex === null || !selectedSessionReviewItem) {
    return null;
  }
  const reviewSettlement = sessionSettlements[selectedSessionReviewIndex] ?? null;
  const visibleEndIndex =
    selectedSessionReviewItem.kind === "risk"
      ? selectedSessionReviewItem.settleToIndex
      : selectedSessionReviewItem.revealEndIndex;
  const visibleBars = selectedSessionReviewItem.bars.slice(0, visibleEndIndex + 1);
  if (!visibleBars.length) {
    return null;
  }
  const createdAt = new Date().toISOString();
  const bindingId = `special-training-review:${selectedSessionReviewItem.questionId}`;
  const session: Session = {
    id: bindingId,
    user_id: "special-training-review",
    instrument_id: bindingId,
    samplePoolId: bindingId,
    sourceTimeframe: selectedSessionReviewItem.baseTimeframe ?? "1d",
    timeframe: selectedSessionReviewItem.baseTimeframe ?? "1d",
    minimumBaseTimeframe: selectedSessionReviewItem.baseTimeframe ?? "1d",
    start_index: 0,
    entry_index: Math.max(
      0,
      Math.min(selectedSessionReviewItem.startIndex, visibleBars.length - 1),
    ),
    history_bars: visibleBars.length,
    cursor_index: visibleBars.length - 1,
    autoplay_interval_ms: 0,
    is_paused: 1,
    created_at: createdAt,
    symbol: selectedSessionReviewItem.symbol,
    instrumentName: null,
  };
  const fills: Fill[] = [];
  if (selectedSessionReviewItem.kind === "risk" && reviewSettlement) {
    (reviewSettlement.tradeActions ?? [])
      .map((action) => ({
        type: action.type,
        barIndex: Math.max(
          0,
          Math.floor(toFiniteNumber(action.barIndex)),
        ),
        inputMode:
          action.inputMode === "LOT" || action.inputMode === "AMOUNT"
            ? action.inputMode
            : "RATIO",
        priceMode: action.priceMode === "NEXT_OPEN" ? "NEXT_OPEN" : "CUR_CLOSE",
        lotInput: action.lotInput ?? null,
        amountInput: action.amountInput ?? null,
        ratioInput: action.ratioInput ?? null,
        quantity: Math.max(0, Number(action.quantity) || 0),
        executionPrice: Math.max(0, Number(action.executionPrice) || 0),
      }))
      .filter(
        (
          action,
        ): action is {
          type: "BUY" | "SELL";
          barIndex: number;
          inputMode: "LOT" | "AMOUNT" | "RATIO";
          priceMode: "CUR_CLOSE" | "NEXT_OPEN";
          lotInput: string | number | null;
          amountInput: string | number | null;
          ratioInput: string | number | null;
          quantity: number;
          executionPrice: number;
        } =>
          (action.type === "BUY" || action.type === "SELL") &&
          Number.isFinite(action.barIndex) &&
          action.barIndex >= selectedSessionReviewItem.startIndex &&
          action.barIndex <= visibleEndIndex &&
          action.quantity > 0 &&
          action.executionPrice > 0,
      )
      .sort((left, right) => left.barIndex - right.barIndex)
      .forEach((action, index) => {
        const fillTime = String(
          selectedSessionReviewItem.bars[action.barIndex]?.ts || createdAt,
        );
        fills.push({
          id: `${bindingId}-fill-${action.type.toLowerCase()}-${index}`,
          order_id: `${bindingId}-order-${action.type.toLowerCase()}-${index}`,
          session_id: bindingId,
          instrument_id: bindingId,
          symbol: selectedSessionReviewItem.symbol,
          side: action.type,
          fill_index: action.barIndex,
          fill_time: fillTime,
          fill_price: action.executionPrice,
          fill_qty: action.quantity,
          contract_multiplier: 1,
          fee: 0,
          tax: 0,
          slippage: 0,
          created_at: fillTime,
        });
      });
  }
  const reviewFinalAsset =
    selectedSessionReviewItem.kind === "fast"
      ? selectedSessionReviewItem.fastReview?.finalAsset ??
        reviewSettlement?.finalTotalAsset ??
        DEFAULT_CAPITAL
      : reviewSettlement?.finalTotalAsset ?? DEFAULT_CAPITAL;
  const accounts: Account[] = [
    {
      id: `${bindingId}-account`,
      user_id: "special-training-review",
      kind: "SECURITIES",
      balance: reviewFinalAsset,
      currency: "CNY",
    },
  ];
  const snapshot: SessionSnapshot = {
    session,
    accounts,
    positions: [] as Position[],
    fills,
    fillsTotal: fills.length,
    nextFillCursor: null,
    shortBorrowChargesTotal: 0,
    drawings: [],
  };
  return {
    id: bindingId,
    symbol: selectedSessionReviewItem.symbol,
    replay: {
      bars: visibleBars,
      snapshot,
      drawings: [],
      baseTimeframe: selectedSessionReviewItem.baseTimeframe ?? undefined,
      displayPeriod: selectedSessionReviewItem.baseTimeframe ?? undefined,
      specialTraining: selectedSessionReviewItem.specialTraining,
    },
  };
};
