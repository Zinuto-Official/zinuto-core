// SPDX-License-Identifier: GPL-3.0-only

import type { KLineData } from "klinecharts";

export type TrainerChartDataUpdateDecision =
  | {
      action: "none";
      reason: "same-data";
    }
  | {
      action: "realtime";
      reason: "last-bar-change" | "append";
      updateStartIndex: number;
    }
  | {
      action: "reset";
      reason:
        | "session-switched"
        | "render-signature-changed"
        | "initial-data"
        | "empty-next-data"
        | "window-shortened"
        | "prefix-changed"
        | "realtime-boundary-changed"
        | "invalid-realtime-data"
        | "data-changed-without-realtime-subscriber";
    };

type TrainerChartDataUpdatePolicyInput = {
  previousData: readonly KLineData[];
  nextData: readonly KLineData[];
  previousRenderSignature: string;
  nextRenderSignature: string;
  previousSessionId: string;
  nextSessionId: string;
  realtimeSubscriberAvailable: boolean;
  allowRealtimeWhenRenderSignatureChanges?: boolean;
};

export const areTrainerChartBarsEqual = (
  left: KLineData | undefined,
  right: KLineData | undefined,
): boolean => {
  if (!left || !right) {
    return false;
  }
  return (
    left.timestamp === right.timestamp &&
    Number(left.open) === Number(right.open) &&
    Number(left.high) === Number(right.high) &&
    Number(left.low) === Number(right.low) &&
    Number(left.close) === Number(right.close) &&
    Number(left.volume) === Number(right.volume) &&
    String(left.symbol ?? "") === String(right.symbol ?? "")
  );
};

const hasFiniteTimestamp = (item: KLineData | undefined): boolean =>
  Boolean(item) && Number.isFinite(Number(item?.timestamp));

const areChartDataWindowsEqual = (
  previousData: readonly KLineData[],
  nextData: readonly KLineData[],
): boolean => {
  if (previousData.length !== nextData.length) {
    return false;
  }
  if (previousData.length === 0) {
    return true;
  }
  const previousFirst = previousData[0];
  const nextFirst = nextData[0];
  const previousLast = previousData[previousData.length - 1];
  const nextLast = nextData[nextData.length - 1];
  if (!previousFirst || !nextFirst || !previousLast || !nextLast) {
    return false;
  }
  if (
    !areTrainerChartBarsEqual(previousFirst, nextFirst) ||
    !areTrainerChartBarsEqual(previousLast, nextLast)
  ) {
    return false;
  }
  return previousData.every((item, index) => areTrainerChartBarsEqual(item, nextData[index]));
};

export const resolveTrainerChartDataUpdateDecision = ({
  previousData,
  nextData,
  previousRenderSignature,
  nextRenderSignature,
  previousSessionId,
  nextSessionId,
  realtimeSubscriberAvailable,
  allowRealtimeWhenRenderSignatureChanges = false,
}: TrainerChartDataUpdatePolicyInput): TrainerChartDataUpdateDecision => {
  const normalizedPreviousSessionId = String(previousSessionId || "").trim();
  const normalizedNextSessionId = String(nextSessionId || "").trim();
  if (
    normalizedPreviousSessionId &&
    normalizedNextSessionId &&
    normalizedPreviousSessionId !== normalizedNextSessionId
  ) {
    return { action: "reset", reason: "session-switched" };
  }

  if (
    previousRenderSignature !== nextRenderSignature &&
    !allowRealtimeWhenRenderSignatureChanges
  ) {
    return { action: "reset", reason: "render-signature-changed" };
  }

  if (!previousData.length) {
    return nextData.length
      ? { action: "reset", reason: "initial-data" }
      : { action: "none", reason: "same-data" };
  }

  if (!nextData.length) {
    return { action: "reset", reason: "empty-next-data" };
  }

  if (nextData.length < previousData.length) {
    return { action: "reset", reason: "window-shortened" };
  }

  if (areChartDataWindowsEqual(previousData, nextData)) {
    return { action: "none", reason: "same-data" };
  }

  const realtimeBoundaryIndex = previousData.length - 1;
  for (let index = 0; index < realtimeBoundaryIndex; index += 1) {
    if (!areTrainerChartBarsEqual(previousData[index], nextData[index])) {
      return { action: "reset", reason: "prefix-changed" };
    }
  }

  const previousBoundaryBar = previousData[realtimeBoundaryIndex];
  const nextBoundaryBar = nextData[realtimeBoundaryIndex];
  if (
    !previousBoundaryBar ||
    !nextBoundaryBar ||
    previousBoundaryBar.timestamp !== nextBoundaryBar.timestamp
  ) {
    return { action: "reset", reason: "realtime-boundary-changed" };
  }

  const boundaryChanged = !areTrainerChartBarsEqual(previousBoundaryBar, nextBoundaryBar);
  const hasAppend = nextData.length > previousData.length;
  if (!boundaryChanged && !hasAppend) {
    return { action: "none", reason: "same-data" };
  }

  if (!realtimeSubscriberAvailable) {
    return { action: "reset", reason: "data-changed-without-realtime-subscriber" };
  }

  const updateStartIndex = boundaryChanged ? realtimeBoundaryIndex : previousData.length;
  for (let index = updateStartIndex; index < nextData.length; index += 1) {
    if (!hasFiniteTimestamp(nextData[index])) {
      return { action: "reset", reason: "invalid-realtime-data" };
    }
  }

  return {
    action: "realtime",
    reason: boundaryChanged ? "last-bar-change" : "append",
    updateStartIndex,
  };
};
