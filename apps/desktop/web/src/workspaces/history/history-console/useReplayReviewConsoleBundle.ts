// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ApiTrainingReviewBundlePayload,
  type ApiTrainingReviewWindow,
} from "@/api";
import { useI18n } from "@/frontend-kernel/i18n";

const REPLAY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

const normalizeReplayReviewBundleAnchorMs = (
  window: ApiTrainingReviewWindow,
  anchorMs?: number,
): number | undefined => {
  if (window !== "LAST_7D" && window !== "LAST_30D") {
    return undefined;
  }
  const numeric = Number(anchorMs);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const dayBucket = Math.floor(Math.max(0, numeric) / REPLAY_REVIEW_DAY_MS);
  return dayBucket * REPLAY_REVIEW_DAY_MS + REPLAY_REVIEW_DAY_MS - 1;
};

const normalizeProjectIds = (projectIds: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  projectIds.forEach((projectId) => {
    const id = String(projectId || "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};

type UseReplayReviewConsoleBundleArgs = {
  projectIds: readonly string[];
  window?: ApiTrainingReviewWindow;
  anchorMs?: number;
  enabled?: boolean;
  onError?: (message: string) => void;
};

export const useReplayReviewConsoleBundle = ({
  projectIds,
  window,
  anchorMs,
  enabled = true,
  onError,
}: UseReplayReviewConsoleBundleArgs) => {
  const { t } = useI18n();
  const loadFailedMessage = t("common.status.loadFailed");
  const requestSpec = useMemo(() => {
    const normalizedProjectIds = normalizeProjectIds(projectIds);
    const projectIdsKey = normalizedProjectIds.join("|");
    const normalizedWindow = typeof window === "string" ? window : "ALL";
    const normalizedAnchorMs = normalizeReplayReviewBundleAnchorMs(
      normalizedWindow,
      anchorMs,
    );
    return {
      normalizedProjectIds,
      normalizedWindow,
      normalizedAnchorMs,
      projectIdsKey,
      requestKey: `${normalizedWindow}|${normalizedAnchorMs ?? "na"}|${projectIdsKey}`,
    };
  }, [anchorMs, projectIds, window]);
  const [bundle, setBundle] = useState<ApiTrainingReviewBundlePayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const latestOnErrorRef = useRef(onError);
  const latestRequestSpecRef = useRef(requestSpec);
  const loadFailedMessageRef = useRef(loadFailedMessage);
  latestOnErrorRef.current = onError;
  latestRequestSpecRef.current = requestSpec;
  loadFailedMessageRef.current = loadFailedMessage;

  const canRequest = enabled && requestSpec.normalizedProjectIds.length > 0;
  const requestKey = requestSpec.requestKey;

  useEffect(() => {
    if (!canRequest) {
      setBundle(null);
      setIsLoading(false);
      setResolvedKey(null);
      setFailedKey(null);
      return;
    }

    if (resolvedKey === requestKey || failedKey === requestKey) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const { normalizedProjectIds, normalizedWindow, normalizedAnchorMs } =
      latestRequestSpecRef.current;
    setIsLoading(true);
    setFailedKey((current) => (current === requestKey ? null : current));

    void api
      .getTrainingReviewConsoleBundle(
        {
          projectIds: normalizedProjectIds,
          window: normalizedWindow,
          anchorMs: normalizedAnchorMs,
        },
        { signal: controller.signal },
      )
      .then((payload) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setBundle(payload);
        setResolvedKey(requestKey);
        setFailedKey(null);
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setBundle(null);
        setFailedKey(requestKey);
        latestOnErrorRef.current?.(loadFailedMessageRef.current);
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [canRequest, failedKey, requestKey, resolvedKey]);

  return {
    bundle,
    isLoading,
    requestKey,
    resolvedKey,
    failedKey,
  };
};
