// SPDX-License-Identifier: GPL-3.0-only

import {
  startTransition,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { MarketBarFrame, SessionSnapshot } from "@/domains/training/types";
import type {
  BaseTimeframe,
  ReplayBar,
} from "@/domains/trainer/trainerTypes";
import {
  fitTrainerResidentBarsWindow,
  resolveTrainerResidentProtectionWindow,
  TRAINER_BACKGROUND_FETCH_MAX_BARS,
} from "@/domains/trainer/trainerHydration";
import { frameToReplayRange } from "@/domains/trainer/marketFrameStore";
import {
  applyTrainerFillEnvelopeToSnapshot,
  resolveTrainerFillCursor,
} from "@/domains/trainer/trainerFillEnvelope";

type GetBarsFrameFn = (
  symbol: string,
  timeframe: BaseTimeframe,
  offset: number,
  limit: number,
  options?: { signal?: AbortSignal; instrumentId?: string }
) => Promise<MarketBarFrame>;

type GetSnapshotFn = (
  sessionId: string,
  fillCursor?: string | null,
  options?: { signal?: AbortSignal }
) => Promise<SessionSnapshot>;

type UseTrainerSessionOrchestratorArgs = {
  appIsMountedRef: MutableRefObject<boolean>;
  barsRef: MutableRefObject<ReplayBar[]>;
  barsOffsetRef: MutableRefObject<number>;
  barsTotalRef: MutableRefObject<number>;
  isLoadingMoreBarsRef: MutableRefObject<boolean>;
  isPrefetchingBarsRef: MutableRefObject<boolean>;
  ensureBarsForwardAbortControllerRef: MutableRefObject<AbortController | null>;
  ensureBarsBackwardAbortControllerRef: MutableRefObject<AbortController | null>;
  historyRefreshInProgressRef: MutableRefObject<boolean>;
  snapshotRef: MutableRefObject<SessionSnapshot | null>;
  sessionIdRef: MutableRefObject<string | null>;
  snapshotAbortControllerRef: MutableRefObject<AbortController | null>;
  snapshotRequestVersionRef: MutableRefObject<number>;
  setBars: Dispatch<SetStateAction<ReplayBar[]>>;
  setBarsOffset: Dispatch<SetStateAction<number>>;
  setBarsTotal: Dispatch<SetStateAction<number>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  getBarsFrame: GetBarsFrameFn;
  getSnapshot: GetSnapshotFn;
};

const BARS_FORWARD_FETCH_MIN_CHUNK = 240;
const BARS_FORWARD_FETCH_MAX_CHUNK = TRAINER_BACKGROUND_FETCH_MAX_BARS;
const BARS_FORWARD_FETCH_BUFFER = 120;
const BARS_BACKWARD_FETCH_DEFAULT = TRAINER_BACKGROUND_FETCH_MAX_BARS;

export const useTrainerSessionOrchestrator = ({
  appIsMountedRef,
  barsRef,
  barsOffsetRef,
  barsTotalRef,
  isLoadingMoreBarsRef,
  isPrefetchingBarsRef,
  ensureBarsForwardAbortControllerRef,
  ensureBarsBackwardAbortControllerRef,
  historyRefreshInProgressRef,
  snapshotRef,
  sessionIdRef,
  snapshotAbortControllerRef,
  snapshotRequestVersionRef,
  setBars,
  setBarsOffset,
  setBarsTotal,
  setSnapshot,
  getBarsFrame,
  getSnapshot,
}: UseTrainerSessionOrchestratorArgs) => {
  const commitResidentBars = useCallback(
    ({
      nextBars,
      nextOffset,
      nextTotal,
      preferredTrimSide,
    }: {
      nextBars: ReplayBar[];
      nextOffset: number;
      nextTotal: number;
      preferredTrimSide: "HEAD" | "TAIL";
    }): {
      bars: ReplayBar[];
      offset: number;
      total: number;
      trimmedHeadCount: number;
      trimmedTailCount: number;
    } => {
      const protectionWindow = resolveTrainerResidentProtectionWindow({
        snapshot: snapshotRef.current,
        bars: nextBars,
      });
      const fitted = fitTrainerResidentBarsWindow({
        bars: nextBars,
        offset: nextOffset,
        total: nextTotal,
        protectedStartIndex: protectionWindow.protectedStartIndex,
        protectedEndIndex: protectionWindow.protectedEndIndex,
        preferredTrimSide,
      });
      barsOffsetRef.current = fitted.offset;
      barsTotalRef.current = fitted.total;
      barsRef.current = fitted.bars;
      startTransition(() => {
        setBarsOffset(fitted.offset);
        setBarsTotal(fitted.total);
        setBars(fitted.bars);
      });
      return fitted;
    },
	    [
	      barsOffsetRef,
	      barsRef,
	      barsTotalRef,
	      setBars,
      setBarsOffset,
      setBarsTotal,
      snapshotRef,
    ],
  );

  const ensureBarsForward = useCallback(
    async (
      symbol: string,
      minLocalIndex: number,
      prefetch = TRAINER_BACKGROUND_FETCH_MAX_BARS,
      options?: { signal?: AbortSignal; priority?: "critical" | "prefetch" },
    ) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper || !appIsMountedRef.current || options?.signal?.aborted) {
        return;
      }
      if (historyRefreshInProgressRef.current) {
        return;
      }
      const neededIndex = Math.max(0, Math.floor(minLocalIndex + prefetch));
      const isPrefetch = options?.priority === "prefetch";
      if (isPrefetch) {
        if (isLoadingMoreBarsRef.current || isPrefetchingBarsRef.current) {
          return;
        }
      } else {
        if (isLoadingMoreBarsRef.current) {
          return;
        }
        if (isPrefetchingBarsRef.current) {
          ensureBarsForwardAbortControllerRef.current?.abort();
          isPrefetchingBarsRef.current = false;
        }
      }
      const readRequestSignature = () =>
        [
          String(sessionIdRef.current || "").trim(),
          String(snapshotRef.current?.session.id || "").trim(),
          String(snapshotRef.current?.session.instrument_id || "").trim(),
          String(snapshotRef.current?.session.timeframe || "").trim().toLowerCase(),
          String(barsRef.current[0]?.displayPeriod || "").trim(),
        ].join("\u0000");
      const requestSignature = readRequestSignature();
      const abortController = new AbortController();
      const externalSignal = options?.signal;
      const handleExternalAbort = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      if (externalSignal) {
        if (externalSignal.aborted) {
          abortController.abort();
        } else {
          externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
        }
      }
      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsForwardAbortControllerRef.current = abortController;
      const isRequestActive = () =>
        !abortController.signal.aborted &&
        appIsMountedRef.current &&
        readRequestSignature() === requestSignature;

      if (isPrefetch) {
        isPrefetchingBarsRef.current = true;
      } else {
        isLoadingMoreBarsRef.current = true;
      }
      try {
        const workingBars: ReplayBar[] = [...barsRef.current];
        let didAppendBars = false;
        let nextBarsTotalState: number | null = null;
        for (let i = 0; i < 12; i += 1) {
          if (!isRequestActive()) {
            break;
          }
          const currentBarsLength = workingBars.length;
          const total = Math.max(0, Math.floor(Number.isFinite(barsTotalRef.current) ? barsTotalRef.current : 0));
          if (!currentBarsLength || total <= 0 || neededIndex < currentBarsLength || currentBarsLength >= total) {
            break;
          }
          const nextOffset = barsOffsetRef.current + currentBarsLength;
          const desired = neededIndex - currentBarsLength + 1;
          // Keep each fetch chunk moderate to avoid long main-thread stalls on very large JSON payloads.
          const limit = Math.max(
            BARS_FORWARD_FETCH_MIN_CHUNK,
            Math.min(BARS_FORWARD_FETCH_MAX_CHUNK, desired + BARS_FORWARD_FETCH_BUFFER),
          );
          const timeframe = (
            String(snapshotRef.current?.session.timeframe || "1d").trim().toLowerCase()
          ) as BaseTimeframe;
          const instrumentId = String(snapshotRef.current?.session.instrument_id || "").trim();
          const range = frameToReplayRange(
            await getBarsFrame(upper, timeframe, nextOffset, limit, {
              signal: abortController.signal,
              instrumentId,
            }),
          );
          if (!isRequestActive()) {
            break;
          }
          barsTotalRef.current = range.total;
          nextBarsTotalState = range.total;
          if (!range.bars.length) {
            break;
          }

          const expectedRawOffset = barsOffsetRef.current + workingBars.length;
          const overlap = Math.max(0, expectedRawOffset - range.offset);
          const appendBars = overlap > 0 ? range.bars.slice(overlap) : range.bars;
          if (!appendBars.length) {
            break;
          }
          workingBars.push(...appendBars);
          didAppendBars = true;
        }
        if (
          isRequestActive() &&
          ensureBarsForwardAbortControllerRef.current === abortController &&
          (didAppendBars || nextBarsTotalState !== null)
        ) {
          if (didAppendBars) {
            commitResidentBars({
              nextBars: workingBars,
              nextOffset: barsOffsetRef.current,
              nextTotal:
                nextBarsTotalState !== null ? nextBarsTotalState : barsTotalRef.current,
              preferredTrimSide: "HEAD",
            });
          } else if (nextBarsTotalState !== null) {
            barsTotalRef.current = nextBarsTotalState;
            startTransition(() => {
              setBarsTotal(nextBarsTotalState);
            });
          }
        }
      } catch {
        // Ignore prefetch failures and keep the current window.
      } finally {
        if (externalSignal) {
          externalSignal.removeEventListener('abort', handleExternalAbort);
        }
        if (ensureBarsForwardAbortControllerRef.current === abortController) {
          ensureBarsForwardAbortControllerRef.current = null;
        }
        if (isPrefetch) {
          isPrefetchingBarsRef.current = false;
        } else {
          isLoadingMoreBarsRef.current = false;
        }
      }
    },
    [
      appIsMountedRef,
      barsOffsetRef,
      barsRef,
      barsTotalRef,
      ensureBarsForwardAbortControllerRef,
      historyRefreshInProgressRef,
      getBarsFrame,
      isLoadingMoreBarsRef,
      isPrefetchingBarsRef,
      sessionIdRef,
      snapshotRef,
      commitResidentBars,
      setBarsTotal
    ]
  );

  const ensureBarsBackward = useCallback(
    async (
      symbol: string,
      prefetch = BARS_BACKWARD_FETCH_DEFAULT,
      options?: { signal?: AbortSignal },
    ) => {
      const upper = symbol.trim().toUpperCase();
      if (!upper || !appIsMountedRef.current || options?.signal?.aborted) {
        return;
      }
      const currentOffset = Math.max(
        0,
        Math.floor(Number(barsOffsetRef.current) || 0),
      );
      if (currentOffset <= 0 || isLoadingMoreBarsRef.current) {
        return;
      }
      if (isPrefetchingBarsRef.current) {
        ensureBarsForwardAbortControllerRef.current?.abort();
        isPrefetchingBarsRef.current = false;
      }

      const abortController = new AbortController();
      const externalSignal = options?.signal;
      const handleExternalAbort = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      if (externalSignal) {
        if (externalSignal.aborted) {
          abortController.abort();
        } else {
          externalSignal.addEventListener("abort", handleExternalAbort, {
            once: true,
          });
        }
      }
      ensureBarsBackwardAbortControllerRef.current?.abort();
      ensureBarsBackwardAbortControllerRef.current = abortController;
      const isRequestActive = () =>
        !abortController.signal.aborted && appIsMountedRef.current;

      isLoadingMoreBarsRef.current = true;
      historyRefreshInProgressRef.current = true;
      try {
        const timeframe = (
          String(snapshotRef.current?.session.timeframe || "1d")
            .trim()
            .toLowerCase()
        ) as BaseTimeframe;
        const requestLimit = Math.max(
          1,
          Math.min(
            TRAINER_BACKGROUND_FETCH_MAX_BARS,
            Math.max(0, Math.floor(Number(prefetch) || 0)),
            currentOffset,
          ),
        );
        const requestOffset = Math.max(0, currentOffset - requestLimit);
        const instrumentId = String(snapshotRef.current?.session.instrument_id || "").trim();
        const range = frameToReplayRange(
          await getBarsFrame(
            upper,
            timeframe,
            requestOffset,
            requestLimit,
            {
              signal: abortController.signal,
              instrumentId,
            },
          ),
        );
        if (!isRequestActive()) {
          return;
        }

        const resolvedOffset = Math.max(
          0,
          Math.floor(Number(range.offset) || requestOffset),
        );
        const currentBars = barsRef.current;
        const prependCount = Math.max(0, currentOffset - resolvedOffset);
        const prependBars =
          prependCount > 0 ? range.bars.slice(0, prependCount) : [];
        if (!prependBars.length) {
          return;
        }

        const nextBars = [...prependBars, ...currentBars];
        const nextOffset = Math.max(0, currentOffset - prependBars.length);
        const nextTotal = Math.max(
          Math.max(0, Math.floor(Number(barsTotalRef.current) || 0)),
          Math.max(0, Math.floor(Number(range.total) || 0)),
          nextOffset + nextBars.length,
        );

        commitResidentBars({
          nextBars,
          nextOffset,
          nextTotal,
          preferredTrimSide: "TAIL",
        });
      } catch {
        // Ignore backward fetch failures and keep the current window.
      } finally {
        if (externalSignal) {
          externalSignal.removeEventListener("abort", handleExternalAbort);
        }
        if (ensureBarsBackwardAbortControllerRef.current === abortController) {
          ensureBarsBackwardAbortControllerRef.current = null;
        }
        historyRefreshInProgressRef.current = false;
        isLoadingMoreBarsRef.current = false;
      }
    },
    [
      appIsMountedRef,
      barsOffsetRef,
      barsRef,
      barsTotalRef,
      commitResidentBars,
      ensureBarsBackwardAbortControllerRef,
      ensureBarsForwardAbortControllerRef,
      getBarsFrame,
      historyRefreshInProgressRef,
      isLoadingMoreBarsRef,
      isPrefetchingBarsRef,
      snapshotRef,
    ],
  );

  const refreshSnapshot = useCallback(
    async (id: string, options?: { signal?: AbortSignal }): Promise<boolean> => {
      const normalizedSessionId = id.trim();
      if (!normalizedSessionId) {
        return false;
      }
      snapshotRequestVersionRef.current += 1;
      const requestVersion = snapshotRequestVersionRef.current;
      snapshotAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      snapshotAbortControllerRef.current = abortController;
      const externalSignal = options?.signal;
      const handleExternalAbort = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      if (externalSignal) {
        if (externalSignal.aborted) {
          abortController.abort();
        } else {
          externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
        }
      }
      const isRequestActive = () =>
        appIsMountedRef.current &&
        snapshotRequestVersionRef.current === requestVersion &&
        !abortController.signal.aborted;

      try {
        if (String(sessionIdRef.current || '').trim() !== normalizedSessionId) {
          return false;
        }
        const previousSnapshot = snapshotRef.current;
        const canUseIncremental = Boolean(previousSnapshot && previousSnapshot.session.id === normalizedSessionId);
        const fillCursor = canUseIncremental
          ? resolveTrainerFillCursor(previousSnapshot)
          : null;
        const nextSnapshotRaw = await getSnapshot(normalizedSessionId, fillCursor, {
          signal: abortController.signal
        });
        if (!isRequestActive()) {
          return false;
        }
        if (
          String(sessionIdRef.current || '').trim() !== normalizedSessionId ||
          String(nextSnapshotRaw.session?.id || '').trim() !== normalizedSessionId
        ) {
          return false;
        }
        const stableSnapshot =
          canUseIncremental &&
          previousSnapshot?.session.id === nextSnapshotRaw.session.id
            ? {
                ...nextSnapshotRaw,
                session: {
                  ...nextSnapshotRaw.session,
                },
              }
            : nextSnapshotRaw;
        const merged = applyTrainerFillEnvelopeToSnapshot(stableSnapshot, {
          previousSnapshot: canUseIncremental ? previousSnapshot : null,
          appendFromPrevious: Boolean(fillCursor),
        });
        snapshotRef.current = merged;
        startTransition(() => {
          setSnapshot(merged);
        });

        return true;
      } catch (err) {
        if (!isRequestActive()) {
          return false;
        }
        throw err;
      } finally {
        if (externalSignal) {
          externalSignal.removeEventListener('abort', handleExternalAbort);
        }
        if (snapshotAbortControllerRef.current === abortController) {
          snapshotAbortControllerRef.current = null;
        }
      }
    },
	    [
	      appIsMountedRef,
	      getSnapshot,
	      sessionIdRef,
	      setSnapshot,
	      snapshotAbortControllerRef,
	      snapshotRef,
      snapshotRequestVersionRef,
    ]
  );

  return {
    ensureBarsBackward,
    ensureBarsForward,
    refreshSnapshot
  };
};
