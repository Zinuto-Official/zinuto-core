// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import { HISTORY_PROJECT_PAGE_SIZE } from "@/frontend-kernel/runtimeConstants";
import type { ReplayReviewWindow } from "@/workspaces/history/history-console/types";
import {
  resolveStableReplayReviewWindowAnchorMs,
  type ReplayReviewConsolePageProps,
} from "@/workspaces/history/history-console/ReplayReviewConsoleHelpers";

export const useReplayReviewWindowState = ({
  isActive,
  ui,
}: {
  isActive: boolean;
  ui: ReplayReviewConsolePageProps["ui"];
}) => {
  const [reviewWindow, setReviewWindow] =
    useState<ReplayReviewWindow>("LAST_50");
  const [reviewWindowAnchorMs, setReviewWindowAnchorMs] = useState(() =>
    resolveStableReplayReviewWindowAnchorMs(),
  );
  const [reviewDisplayLimit, setReviewDisplayLimit] = useState(
    HISTORY_PROJECT_PAGE_SIZE,
  );
  const lastUserAnchorInteractionAtRef = useRef(0);

  useEffect(() => {
    if (
      !isActive ||
      (reviewWindow !== "LAST_7D" && reviewWindow !== "LAST_30D")
    ) {
      return;
    }
    lastUserAnchorInteractionAtRef.current = Date.now();
    setReviewWindowAnchorMs(resolveStableReplayReviewWindowAnchorMs());
    const timer = window.setInterval(() => {
      if (Date.now() - lastUserAnchorInteractionAtRef.current < 60 * 1000) {
        return;
      }
      setReviewWindowAnchorMs(resolveStableReplayReviewWindowAnchorMs());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isActive, reviewWindow]);

  useEffect(() => {
    setReviewDisplayLimit(HISTORY_PROJECT_PAGE_SIZE);
  }, [reviewWindow]);

  const reviewWindowOptions = useMemo(
    () => [
      { value: "LAST_10" as const, label: ui.reviewRecent10Sessions },
      { value: "LAST_50" as const, label: ui.reviewRecent50Sessions },
      { value: "LAST_7D" as const, label: ui.statsQuick7d },
      { value: "LAST_30D" as const, label: ui.statsQuick30d },
      { value: "ALL" as const, label: ui.statsQuickAll },
    ],
    [ui],
  );

  return {
    reviewDisplayLimit,
    reviewWindow,
    reviewWindowAnchorMs,
    reviewWindowOptions,
    setReviewDisplayLimit,
    setReviewWindow,
  };
};
