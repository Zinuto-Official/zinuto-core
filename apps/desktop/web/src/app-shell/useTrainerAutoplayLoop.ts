// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { barsPerSecondToIntervalMs } from '@/domains/trainer/autoplayRate';
import {
  createTrainerAutoplayScheduler,
  resolveTrainerAutoplaySurfaceRunning,
  type TrainerAutoplayStepResult,
} from '@/app-shell/trainerAutoplayRuntime';
import type { DisplayPeriodKey } from '@/domains/chart/chartPeriods';

type UseTrainerAutoplayLoopArgs = {
  sessionId: string;
  isAutoplay: boolean;
  isSurfaceActive: boolean;
  trainerDisplayPeriod: DisplayPeriodKey;
  autoplayBarsPerSec: string;
  parseNumeric: (value: string) => number;
  autoplayStep: () => Promise<TrainerAutoplayStepResult>;
  apiSetPlayback: (
    sessionId: string,
    intervalMs: number,
    isPaused: boolean,
    displayPeriod?: DisplayPeriodKey,
  ) => Promise<unknown>;
  onPlaybackSyncError: () => void;
};

export const useTrainerAutoplayLoop = ({
  sessionId,
  isAutoplay,
  isSurfaceActive,
  trainerDisplayPeriod,
  autoplayBarsPerSec,
  parseNumeric,
  autoplayStep,
  apiSetPlayback,
  onPlaybackSyncError,
}: UseTrainerAutoplayLoopArgs) => {
  const autoplayStepRef = useRef(autoplayStep);
  autoplayStepRef.current = autoplayStep;
  const apiSetPlaybackRef = useRef(apiSetPlayback);
  apiSetPlaybackRef.current = apiSetPlayback;
  const onPlaybackSyncErrorRef = useRef(onPlaybackSyncError);
  onPlaybackSyncErrorRef.current = onPlaybackSyncError;
  const shouldRunAutoplayRef = useRef(false);
  const intervalMsRef = useRef(0);
  const previousSessionIdRef = useRef("");
  const schedulerRef = useRef<ReturnType<typeof createTrainerAutoplayScheduler> | null>(null);
  const playbackSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  const normalizedSessionId = String(sessionId || '').trim();
  const intervalMs = barsPerSecondToIntervalMs(autoplayBarsPerSec, parseNumeric);
  intervalMsRef.current = intervalMs;
  const shouldRunAutoplay = resolveTrainerAutoplaySurfaceRunning({
    hasSession: normalizedSessionId.length > 0,
    isSurfaceActive,
    userAutoplayIntent: isAutoplay,
  });
  shouldRunAutoplayRef.current = shouldRunAutoplay;

  if (!schedulerRef.current) {
    schedulerRef.current = createTrainerAutoplayScheduler({
      getShouldRun: () => shouldRunAutoplayRef.current,
      getDelayMs: () => intervalMsRef.current,
      step: () => autoplayStepRef.current(),
      onStepError: () => {
        onPlaybackSyncErrorRef.current();
      },
    });
  }

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!normalizedSessionId || !scheduler) {
      return;
    }
    if (shouldRunAutoplay) {
      scheduler.reschedule();
    }
    let cancelled = false;
    playbackSyncQueueRef.current = playbackSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await apiSetPlaybackRef.current(
            normalizedSessionId,
            intervalMs,
            !shouldRunAutoplay,
            trainerDisplayPeriod,
          );
        } catch {
          if (!cancelled) {
            onPlaybackSyncErrorRef.current();
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [intervalMs, normalizedSessionId, shouldRunAutoplay, trainerDisplayPeriod]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) {
      return;
    }
    if (previousSessionIdRef.current !== normalizedSessionId) {
      previousSessionIdRef.current = normalizedSessionId;
      scheduler.stop();
    }
    if (shouldRunAutoplay) {
      scheduler.start();
      return;
    }
    scheduler.stop();
  }, [normalizedSessionId, shouldRunAutoplay]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.stop();
    };
  }, []);
};
