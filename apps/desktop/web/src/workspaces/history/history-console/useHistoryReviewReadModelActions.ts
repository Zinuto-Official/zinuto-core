// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiDesktopWorkspaceReadModel,
  type ApiWorkspaceReadModelAction,
} from "@/api";

const unavailableAction = (id: string): ApiWorkspaceReadModelAction => ({
  id,
  enabled: false,
  reasonCode: "HISTORY_REVIEW_READ_MODEL_UNAVAILABLE",
  priority: 100,
  facts: {},
});

const readAction = (
  model: ApiDesktopWorkspaceReadModel | null,
  actionId: string,
): ApiWorkspaceReadModelAction => {
  const action = model?.actions.find((item) => item.id === actionId);
  return action ? { ...action, facts: action.facts ?? {} } : unavailableAction(actionId);
};

export const useHistoryReviewReadModelActions = (
  isActive: boolean,
  refreshKey: string,
) => {
  const [model, setModel] = useState<ApiDesktopWorkspaceReadModel | null>(null);
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const abortController = new AbortController();
    api
      .getWorkspaceReadModel("history-review-console", {
        signal: abortController.signal,
      })
      .then((nextModel) => {
        if (!abortController.signal.aborted) {
          setModel(nextModel);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setModel(null);
        }
      });
    return () => abortController.abort();
  }, [isActive, refreshKey]);

  return useMemo(
    () => ({
      deleteAllProjects: readAction(model, "delete-all-projects"),
      deleteSelectedProjects: readAction(model, "delete-selected-projects"),
      loadMoreArchive: readAction(model, "load-more-archive"),
    }),
    [model],
  );
};
