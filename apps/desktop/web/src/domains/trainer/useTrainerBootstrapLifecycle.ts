// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  endTrainerPerfSpan,
  startTrainerPerfSpan,
} from '@/domains/trainer/trainerPerfTrace';
import { runRuntimeStartupTaskWithRetry } from '@/domains/trainer/runtimeStartupDataRecovery';

type InstrumentLike = {
  symbol: string;
  name: string | null;
  barCount: number;
};

type UseTrainerBootstrapLifecycleParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  appBootstrapAbortControllerRef: MutableRefObject<AbortController | null>;
  refreshInstruments: (options?: { signal?: AbortSignal }) => Promise<InstrumentLike[]>;
  syncCustomSamplePoolsFromDataSources: (options?: { signal?: AbortSignal }) => Promise<unknown[]>;
  refreshTradingSettings: (options?: { signal?: AbortSignal }) => Promise<unknown>;
  shouldDeferLowPriorityFollowUps?: () => boolean;
  setHint: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  tt: (key: AppTextKey) => string;
};

const TRAINER_BOOTSTRAP_FOLLOW_UP_INITIAL_DELAY_MS = 900;
const TRAINER_BOOTSTRAP_FOLLOW_UP_RETRY_DELAYS_MS = [1200, 2400] as const;

export const useTrainerBootstrapLifecycle = ({
  appIsMountedRef,
  appBootstrapAbortControllerRef,
  refreshInstruments,
  syncCustomSamplePoolsFromDataSources,
  refreshTradingSettings,
  shouldDeferLowPriorityFollowUps,
  setHint,
  setError,
  tt
}: UseTrainerBootstrapLifecycleParams) => {
  const hasBootstrappedRef = useRef(false);
  const shouldDeferLowPriorityFollowUpsRef = useRef(shouldDeferLowPriorityFollowUps);

  useEffect(() => {
    shouldDeferLowPriorityFollowUpsRef.current = shouldDeferLowPriorityFollowUps;
  }, [shouldDeferLowPriorityFollowUps]);

  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }
    hasBootstrappedRef.current = true;
    appBootstrapAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    appBootstrapAbortControllerRef.current = abortController;
    let deferredFollowUpTimerId: number | null = null;
    let followUpRetryIndex = 0;

    const scheduleDeferredFollowUps = (delayMs: number, runner: () => void) => {
      if (abortController.signal.aborted || !appIsMountedRef.current) {
        return;
      }
      if (typeof window !== 'undefined') {
        if (deferredFollowUpTimerId !== null) {
          window.clearTimeout(deferredFollowUpTimerId);
        }
        deferredFollowUpTimerId = window.setTimeout(() => {
          deferredFollowUpTimerId = null;
          runner();
        }, Math.max(1, Math.floor(delayMs)));
        return;
      }
      runner();
    };

    const setup = async () => {
      try {
        startTrainerPerfSpan('app-bootstrap-refresh-instruments');
        const instrumentRecovery = await runRuntimeStartupTaskWithRetry({
          signal: abortController.signal,
          isActive: () => appIsMountedRef.current,
          task: () => refreshInstruments({ signal: abortController.signal }),
        });
        if (instrumentRecovery.status === 'aborted') {
          endTrainerPerfSpan('app-bootstrap-refresh-instruments', {
            status: 'aborted',
          });
          return;
        }
        if (instrumentRecovery.status === 'failed') {
          throw instrumentRecovery.error;
        }
        const list = instrumentRecovery.value;
        endTrainerPerfSpan('app-bootstrap-refresh-instruments', {
          instrumentCount: list.length,
        });
        if (abortController.signal.aborted || !appIsMountedRef.current) {
          return;
        }
        const runDeferredFollowUps = () => {
          if (abortController.signal.aborted || !appIsMountedRef.current) {
            return;
          }
          if (shouldDeferLowPriorityFollowUpsRef.current?.()) {
            scheduleDeferredFollowUps(420, runDeferredFollowUps);
            return;
          }
          void Promise.allSettled([
            syncCustomSamplePoolsFromDataSources({
              signal: abortController.signal
            }),
            refreshTradingSettings({
              signal: abortController.signal
            }),
          ]).then((results) => {
            if (abortController.signal.aborted || !appIsMountedRef.current) {
              return;
            }
            const customSamplePoolsFailed = results[0]?.status === 'rejected';
            const tradingSettingsFailed =
              results[1]?.status === 'rejected';
            if (
              (customSamplePoolsFailed || tradingSettingsFailed) &&
              followUpRetryIndex < TRAINER_BOOTSTRAP_FOLLOW_UP_RETRY_DELAYS_MS.length
            ) {
              const retryDelayMs =
                TRAINER_BOOTSTRAP_FOLLOW_UP_RETRY_DELAYS_MS[followUpRetryIndex];
              followUpRetryIndex += 1;
              scheduleDeferredFollowUps(retryDelayMs, runDeferredFollowUps);
              return;
            }
            if (tradingSettingsFailed) {
              setHint((current) => (current ? current : tt('appText.tradingSettingsApiUnavailableDefaultsApplied')));
            }
            if (customSamplePoolsFailed || tradingSettingsFailed) {
              console.warn('[trainer-bootstrap] low-priority follow-up sync failed', {
                customSamplePoolsFailed,
                tradingSettingsFailed,
              });
            }
          });
        };
        scheduleDeferredFollowUps(
          TRAINER_BOOTSTRAP_FOLLOW_UP_INITIAL_DELAY_MS,
          runDeferredFollowUps,
        );
        if (!list.length) {
          setHint(tt('appText.importMarketData'));
        }
      } catch (err) {
        endTrainerPerfSpan('app-bootstrap-refresh-instruments', {
          status: 'failed',
        });
        if (abortController.signal.aborted || !appIsMountedRef.current) {
          return;
        }
        setError(tt('appText.initialization'));
      } finally {
        if (appBootstrapAbortControllerRef.current === abortController) {
          appBootstrapAbortControllerRef.current = null;
        }
      }
    };

    void setup();
    return () => {
      abortController.abort();
      if (deferredFollowUpTimerId !== null && typeof window !== 'undefined') {
        window.clearTimeout(deferredFollowUpTimerId);
      }
      if (appBootstrapAbortControllerRef.current === abortController) {
        appBootstrapAbortControllerRef.current = null;
      }
    };
  }, [appBootstrapAbortControllerRef, appIsMountedRef, refreshInstruments, refreshTradingSettings, setError, setHint, syncCustomSamplePoolsFromDataSources, tt]);
};
