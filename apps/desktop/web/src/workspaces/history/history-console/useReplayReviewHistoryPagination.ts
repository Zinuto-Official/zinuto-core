// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import type {
  HistoryProjectsLoadMoreResult,
  LoadMoreHistoryProjects,
} from "@/domains/history/historyTypes";

const isPaginationFailure = (result: HistoryProjectsLoadMoreResult): boolean =>
  result === "FAILED" || result === "BLOCKED";

// SKIPPED means no page was fetched (superseded request, no cursor, or a load
// already in flight). Treating it as success makes the anchor tick retry the
// same cursor forever, so the automatic path terminates like a failure and the
// manual retry button takes over.
const isAutomaticPaginationTerminal = (
  result: HistoryProjectsLoadMoreResult,
): boolean => result === "FAILED" || result === "BLOCKED" || result === "SKIPPED";

export const useReplayReviewHistoryPagination = ({
  historyProjectsNextCursor,
  loadMoreTrainingProjects,
  shouldLoadMoreHistory,
}: {
  historyProjectsNextCursor: string | null;
  loadMoreTrainingProjects: LoadMoreHistoryProjects;
  shouldLoadMoreHistory: boolean;
}) => {
  const [isHistoryPaginationStalled, setIsHistoryPaginationStalled] =
    useState(false);

  useEffect(() => {
    if (!shouldLoadMoreHistory || isHistoryPaginationStalled) {
      return;
    }
    let disposed = false;
    void loadMoreTrainingProjects({ automatic: true }).then((result) => {
      if (!disposed && isAutomaticPaginationTerminal(result)) {
        setIsHistoryPaginationStalled(true);
      }
    });
    return () => {
      disposed = true;
    };
  }, [
    isHistoryPaginationStalled,
    loadMoreTrainingProjects,
    shouldLoadMoreHistory,
  ]);

  useEffect(() => {
    setIsHistoryPaginationStalled(false);
  }, [historyProjectsNextCursor]);

  const retryHistoryPagination = useCallback(() => {
    void loadMoreTrainingProjects().then((result) => {
      if (result === "LOADED") {
        setIsHistoryPaginationStalled(false);
      } else if (isPaginationFailure(result)) {
        setIsHistoryPaginationStalled(true);
      }
    });
  }, [loadMoreTrainingProjects]);

  return {
    isHistoryPaginationStalled,
    retryHistoryPagination,
  };
};
