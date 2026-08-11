// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type UseRuntimeProgressAndLifecycleEffectsArgs = {
  appIsMountedRef: MutableRefObject<boolean>;
  globalResetProgressHideTimerRef: MutableRefObject<number | null>;
  isGlobalResetProgressVisible: boolean;
  globalResetProgressPercent: number;
  globalResetProgressTargetPercent: number;
  globalResetProgressPercentRef: MutableRefObject<number>;
  setGlobalResetProgressPercent: Dispatch<SetStateAction<number>>;
  clearingLocalDataSourcesProgressPercent: number;
  clearingLocalDataSourcesProgressTargetPercent: number;
  clearingLocalDataSourcesProgressPercentRef: MutableRefObject<number>;
  setClearingLocalDataSourcesProgressPercent: Dispatch<SetStateAction<number>>;
  appBootstrapAbortControllerRef: MutableRefObject<AbortController | null>;
  aggregationPrewarmTaskRef: MutableRefObject<number | null>;
  ensureBarsForwardAbortControllerRef: MutableRefObject<AbortController | null>;
  ensureBarsBackwardAbortControllerRef: MutableRefObject<AbortController | null>;
  snapshotAbortControllerRef: MutableRefObject<AbortController | null>;
  symbolLoadAbortControllerRef: MutableRefObject<AbortController | null>;
  cleanupHistoryProjectRequests: () => void;
};

export const useRuntimeProgressAndLifecycleEffects = ({
  appIsMountedRef,
  globalResetProgressHideTimerRef,
  isGlobalResetProgressVisible,
  globalResetProgressPercent,
  globalResetProgressTargetPercent,
  globalResetProgressPercentRef,
  setGlobalResetProgressPercent,
  clearingLocalDataSourcesProgressPercent,
  clearingLocalDataSourcesProgressTargetPercent,
  clearingLocalDataSourcesProgressPercentRef,
  setClearingLocalDataSourcesProgressPercent,
  appBootstrapAbortControllerRef,
  aggregationPrewarmTaskRef,
  ensureBarsForwardAbortControllerRef,
  ensureBarsBackwardAbortControllerRef,
  snapshotAbortControllerRef,
  symbolLoadAbortControllerRef,
  cleanupHistoryProjectRequests,
}: UseRuntimeProgressAndLifecycleEffectsArgs) => {
  useEffect(() => {
    globalResetProgressPercentRef.current = Math.max(
      0,
      Math.min(100, Number(globalResetProgressPercent) || 0),
    );
  }, [globalResetProgressPercent, globalResetProgressPercentRef]);

  useEffect(() => {
    clearingLocalDataSourcesProgressPercentRef.current = Math.max(
      0,
      Math.min(100, Number(clearingLocalDataSourcesProgressPercent) || 0),
    );
  }, [
    clearingLocalDataSourcesProgressPercent,
    clearingLocalDataSourcesProgressPercentRef,
  ]);

  useEffect(() => {
    if (!isGlobalResetProgressVisible) {
      return;
    }
    const current = Math.max(
      0,
      Math.min(100, Number(globalResetProgressPercent) || 0),
    );
    const target = Math.max(
      0,
      Math.min(100, Number(globalResetProgressTargetPercent) || 0),
    );
    if (current >= target) {
      return;
    }
    const timerId = window.setTimeout(() => {
      setGlobalResetProgressPercent((value) =>
        Math.min(
          target,
          Math.max(0, Math.min(100, Number(value) || 0)) + 1,
        ),
      );
    }, 16);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    globalResetProgressPercent,
    globalResetProgressTargetPercent,
    isGlobalResetProgressVisible,
    setGlobalResetProgressPercent,
  ]);

  useEffect(() => {
    const current = Math.max(
      0,
      Math.min(100, Number(clearingLocalDataSourcesProgressPercent) || 0),
    );
    const target = Math.max(
      0,
      Math.min(100, Number(clearingLocalDataSourcesProgressTargetPercent) || 0),
    );
    if (current >= target) {
      return;
    }
    const timerId = window.setTimeout(() => {
      setClearingLocalDataSourcesProgressPercent((value) =>
        Math.min(
          target,
          Math.max(0, Math.min(100, Number(value) || 0)) + 1,
        ),
      );
    }, 16);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    clearingLocalDataSourcesProgressPercent,
    clearingLocalDataSourcesProgressTargetPercent,
    setClearingLocalDataSourcesProgressPercent,
  ]);

  useEffect(() => {
    appIsMountedRef.current = true;
    return () => {
      appIsMountedRef.current = false;
      if (globalResetProgressHideTimerRef.current !== null) {
        window.clearTimeout(globalResetProgressHideTimerRef.current);
        globalResetProgressHideTimerRef.current = null;
      }
      appBootstrapAbortControllerRef.current?.abort();
      appBootstrapAbortControllerRef.current = null;
      if (aggregationPrewarmTaskRef.current !== null) {
        const runtimeWindow = window as Window & {
          cancelIdleCallback?: (handle: number) => void;
        };
        if (typeof runtimeWindow.cancelIdleCallback === "function") {
          runtimeWindow.cancelIdleCallback(aggregationPrewarmTaskRef.current);
        } else {
          window.clearTimeout(aggregationPrewarmTaskRef.current);
        }
        aggregationPrewarmTaskRef.current = null;
      }
      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsForwardAbortControllerRef.current = null;
      ensureBarsBackwardAbortControllerRef.current?.abort();
      ensureBarsBackwardAbortControllerRef.current = null;
      snapshotAbortControllerRef.current?.abort();
      snapshotAbortControllerRef.current = null;
      symbolLoadAbortControllerRef.current?.abort();
      symbolLoadAbortControllerRef.current = null;
      cleanupHistoryProjectRequests();
    };
  }, [
    aggregationPrewarmTaskRef,
    appBootstrapAbortControllerRef,
    appIsMountedRef,
    cleanupHistoryProjectRequests,
    ensureBarsBackwardAbortControllerRef,
    ensureBarsForwardAbortControllerRef,
    globalResetProgressHideTimerRef,
    snapshotAbortControllerRef,
    symbolLoadAbortControllerRef,
  ]);
};
