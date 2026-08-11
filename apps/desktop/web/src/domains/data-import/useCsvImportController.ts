// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';

export type CsvImportCardPhase = 'UPLOADING' | 'IMPORTING' | 'FINALIZING' | 'FAILED' | 'DONE';
type CsvImportCardControlAction = '' | 'PAUSE' | 'RESUME' | 'CANCEL';

export type CsvImportPreviewProgressStage =
  | 'STAGING_DISCOVERING'
  | 'STAGING_COPYING'
  | 'STAGING_DIGESTING'
  | 'SCANNING_FILES'
  | 'READING_HEADERS'
  | 'DETECTING_TIMEFRAMES'
  | 'BUILDING_PLAN'
  | 'CHECKING_QUALITY'
  | 'DONE';

export type CsvImportPreviewProgressState = {
  stage: CsvImportPreviewProgressStage;
  progressPercent: number | null;
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
};

export type CsvImportCardState = {
  id: string;
  jobId: string;
  sourceId: string;
  poolName: string;
  sourceFolder: string;
  syncMissingSymbolsRetained?: string[];
  baseTimeframe: BaseTimeframe;
  phase: CsvImportCardPhase;
  progressPercent: number;
  progressTargetPercent: number;
  importProgressPercent: number;
  compactProgressPercent: number;
  compactProgressTargetPercent: number;
  compactProgressDisplayPercent: number;
  compactBeforeBytes: number;
  compactAfterBytes: number;
  compactReclaimedBytes: number;
  compactAfterDisplayBytes: number;
  compactReclaimedDisplayBytes: number;
  shouldShowCompactProgress: boolean;
  doneFiles: number;
  totalFiles: number;
  importedRows: number;
  skippedRows: number;
  totalRows: number;
  isPaused: boolean;
  cancelRequested: boolean;
  errorMessage: string;
};

type FinishCsvImportPreviewProgressParams = {
  startAt: number;
  previewReady: boolean;
  minDurationMs: number;
  readyHideDelayMs?: number;
  failHideDelayMs?: number;
};

const waitForDuration = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, durationMs));
  });

const CSV_IMPORT_CARD_HISTORY_MAX = 24;
const isTerminalCsvImportCardPhase = (phase: CsvImportCardPhase): boolean => phase === 'DONE' || phase === 'FAILED';

const trimCsvImportCardStates = (states: CsvImportCardState[]): CsvImportCardState[] => {
  if (states.length <= CSV_IMPORT_CARD_HISTORY_MAX) {
    return states;
  }
  const activeCount = states.filter((state) => !isTerminalCsvImportCardPhase(state.phase)).length;
  const terminalBudget = Math.max(0, CSV_IMPORT_CARD_HISTORY_MAX - activeCount);
  let terminalKept = 0;
  const kept: CsvImportCardState[] = [];
  for (let index = states.length - 1; index >= 0; index -= 1) {
    const state = states[index];
    if (!state) {
      continue;
    }
    if (!isTerminalCsvImportCardPhase(state.phase)) {
      kept.push(state);
      continue;
    }
    if (terminalKept < terminalBudget) {
      kept.push(state);
      terminalKept += 1;
    }
  }
  return kept.reverse();
};

const normalizePercent = (value: number): number => Math.max(0, Math.min(100, Number(value) || 0));

export const areCsvImportPreviewProgressStatesEqual = (
  left: CsvImportPreviewProgressState | null,
  right: CsvImportPreviewProgressState,
): boolean =>
  Boolean(left) &&
  left?.stage === right.stage &&
  left.progressPercent === right.progressPercent &&
  left.processedFiles === right.processedFiles &&
  left.totalFiles === right.totalFiles &&
  left.processedBytes === right.processedBytes &&
  left.totalBytes === right.totalBytes;

export const useCsvImportController = (appIsMountedRef: MutableRefObject<boolean>) => {
  const [isPreparingCsvImportPreview, setIsPreparingCsvImportPreview] = useState(false);
  const [preparingCsvImportPreviewPercent, setPreparingCsvImportPreviewPercent] = useState(0);
  const [preparingCsvImportPreviewProgress, setPreparingCsvImportPreviewProgress] =
    useState<CsvImportPreviewProgressState | null>(null);
  const [csvImportCardStates, setRawCsvImportCardStates] = useState<CsvImportCardState[]>([]);
  const [csvImportCardControlAction, setCsvImportCardControlAction] = useState<CsvImportCardControlAction>('');
  const csvImportPreviewHideTimerRef = useRef<number | null>(null);

  const setCsvImportCardStates: Dispatch<SetStateAction<CsvImportCardState[]>> = useCallback((action) => {
    setRawCsvImportCardStates((current) => {
      const next = typeof action === 'function' ? action(current) : action;
      return trimCsvImportCardStates(next);
    });
  }, []);

  const clearCsvImportPreviewHideTimer = useCallback(() => {
    if (csvImportPreviewHideTimerRef.current !== null) {
      window.clearTimeout(csvImportPreviewHideTimerRef.current);
      csvImportPreviewHideTimerRef.current = null;
    }
  }, []);

  const clearCsvImportPreviewTimers = useCallback(() => {
    clearCsvImportPreviewHideTimer();
  }, [clearCsvImportPreviewHideTimer]);

  const beginCsvImportPreviewProgress = useCallback(() => {
    setIsPreparingCsvImportPreview(true);
    setPreparingCsvImportPreviewPercent(0);
    setPreparingCsvImportPreviewProgress({
      stage: 'STAGING_DISCOVERING',
      progressPercent: null,
      processedFiles: 0,
      totalFiles: 0,
      processedBytes: 0,
      totalBytes: 0
    });
    clearCsvImportPreviewTimers();
  }, [clearCsvImportPreviewTimers]);

  const updateCsvImportPreviewProgress = useCallback(
    (patch: Partial<CsvImportPreviewProgressState>) => {
      if (!appIsMountedRef.current) {
        return;
      }
      setPreparingCsvImportPreviewProgress((current) => {
        const next: CsvImportPreviewProgressState = {
          stage: patch.stage ?? current?.stage ?? 'SCANNING_FILES',
          progressPercent:
            patch.progressPercent === undefined
              ? current?.progressPercent ?? null
              : patch.progressPercent === null
                ? null
                : normalizePercent(patch.progressPercent),
          processedFiles: Math.max(0, Math.floor(Number(patch.processedFiles ?? current?.processedFiles ?? 0) || 0)),
          totalFiles: Math.max(0, Math.floor(Number(patch.totalFiles ?? current?.totalFiles ?? 0) || 0)),
          processedBytes: Math.max(0, Math.floor(Number(patch.processedBytes ?? current?.processedBytes ?? 0) || 0)),
          totalBytes: Math.max(0, Math.floor(Number(patch.totalBytes ?? current?.totalBytes ?? 0) || 0))
        };
        if (areCsvImportPreviewProgressStatesEqual(current, next)) {
          return current;
        }
        const nextPercent = next.progressPercent ?? 0;
        setPreparingCsvImportPreviewPercent((currentPercent) =>
          currentPercent === nextPercent ? currentPercent : nextPercent,
        );
        return next;
      });
    },
    [appIsMountedRef]
  );

  const markCsvImportPreviewReady = useCallback(() => {
    if (!appIsMountedRef.current) {
      return;
    }
    setPreparingCsvImportPreviewPercent(100);
    setPreparingCsvImportPreviewProgress((current) => {
      const completedFiles = Math.max(0, current?.processedFiles ?? 0, current?.totalFiles ?? 0);
      const completedBytes = Math.max(0, current?.processedBytes ?? 0, current?.totalBytes ?? 0);
      return {
        stage: 'DONE',
        progressPercent: 100,
        processedFiles: completedFiles,
        totalFiles: completedFiles,
        processedBytes: completedBytes,
        totalBytes: completedBytes
      };
    });
  }, [appIsMountedRef]);

  const finishCsvImportPreviewProgress = useCallback(
    async ({
      startAt,
      previewReady,
      minDurationMs,
      readyHideDelayMs = 180,
      failHideDelayMs = 80
    }: FinishCsvImportPreviewProgressParams) => {
      const elapsed = performance.now() - startAt;
      await waitForDuration(minDurationMs - elapsed);
      if (!appIsMountedRef.current) {
        return;
      }
      if (!previewReady) {
        setPreparingCsvImportPreviewPercent(0);
        setPreparingCsvImportPreviewProgress(null);
      }
      clearCsvImportPreviewHideTimer();
      csvImportPreviewHideTimerRef.current = window.setTimeout(() => {
        if (!appIsMountedRef.current) {
          return;
        }
        setIsPreparingCsvImportPreview(false);
        setPreparingCsvImportPreviewPercent(0);
        setPreparingCsvImportPreviewProgress(null);
      }, previewReady ? readyHideDelayMs : failHideDelayMs);
    },
    [appIsMountedRef, clearCsvImportPreviewHideTimer]
  );

  const clearCsvImportCardState = useCallback((id?: string) => {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    setCsvImportCardStates((current) => {
      if (!current.length) {
        return current;
      }
      if (!normalizedId) {
        return [];
      }
      const next = current.filter((item) => item.id !== normalizedId);
      return next.length === current.length ? current : next;
    });
  }, []);

  const patchCsvImportCardState = useCallback((id: string, patch: Partial<CsvImportCardState>) => {
    if (!id) {
      return;
    }
    setCsvImportCardStates((current) => {
      if (!current.length) {
        return current;
      }
      let changed = false;
      const nextStates = current.map((state) => {
        if (state.id !== id) {
          return state;
        }
        const next: CsvImportCardState = {
          ...state,
          ...patch
        };
        const nextProgressPercent = normalizePercent(next.progressPercent);
        const nextCompactProgressPercent = normalizePercent(next.compactProgressPercent);
        const currentProgressPercent = normalizePercent(state.progressPercent);
        const currentCompactProgressPercent = normalizePercent(state.compactProgressPercent);
        const currentProgressTargetPercent = normalizePercent(state.progressTargetPercent);
        const currentCompactProgressTargetPercent = normalizePercent(state.compactProgressTargetPercent);
        const isLeavingUploadPhase =
          state.phase === 'UPLOADING' && next.phase !== 'UPLOADING' && next.phase !== 'FAILED';
        if (next.phase === 'UPLOADING' || next.phase === 'FAILED' || next.phase === 'DONE' || isLeavingUploadPhase) {
          next.progressTargetPercent = nextProgressPercent;
          next.compactProgressTargetPercent = nextCompactProgressPercent;
          next.progressPercent = nextProgressPercent;
          next.compactProgressPercent = nextCompactProgressPercent;
        } else {
          const mergedProgressTargetPercent = Math.max(currentProgressTargetPercent, nextProgressPercent);
          const mergedCompactProgressTargetPercent = Math.max(
            currentCompactProgressTargetPercent,
            nextCompactProgressPercent
          );
          next.progressTargetPercent = mergedProgressTargetPercent;
          next.compactProgressTargetPercent = mergedCompactProgressTargetPercent;
          next.progressPercent = Math.max(currentProgressPercent, nextProgressPercent);
          next.compactProgressPercent = Math.max(currentCompactProgressPercent, nextCompactProgressPercent);
        }
        next.doneFiles = Math.max(0, Math.max(Number(state.doneFiles) || 0, Number(next.doneFiles) || 0));
        next.totalFiles = Math.max(0, Number(next.totalFiles) || Number(state.totalFiles) || 0);
        next.importedRows = Math.max(0, Math.max(Number(state.importedRows) || 0, Number(next.importedRows) || 0));
        next.skippedRows = Math.max(0, Math.max(Number(state.skippedRows) || 0, Number(next.skippedRows) || 0));
        next.totalRows = Math.max(0, Math.max(Number(state.totalRows) || 0, Number(next.totalRows) || 0));
        next.importProgressPercent = normalizePercent(next.importProgressPercent);
        next.compactProgressDisplayPercent = normalizePercent(next.compactProgressDisplayPercent);
        next.compactAfterDisplayBytes = Math.max(0, Number(next.compactAfterDisplayBytes) || 0);
        next.compactReclaimedDisplayBytes = Math.max(0, Number(next.compactReclaimedDisplayBytes) || 0);
        next.shouldShowCompactProgress = next.shouldShowCompactProgress === true;
        changed = true;
        return next;
      });
      return changed ? nextStates : current;
    });
  }, []);

  useEffect(() => {
    if (!csvImportCardStates.length) {
      setCsvImportCardControlAction('');
    }
  }, [csvImportCardStates.length]);

  useEffect(() => {
    return () => {
      clearCsvImportPreviewTimers();
    };
  }, [clearCsvImportPreviewTimers]);

  return {
    isPreparingCsvImportPreview,
    preparingCsvImportPreviewPercent,
    preparingCsvImportPreviewProgress,
    csvImportCardStates,
    csvImportCardControlAction,
    setCsvImportCardStates,
    setCsvImportCardControlAction,
    beginCsvImportPreviewProgress,
    updateCsvImportPreviewProgress,
    markCsvImportPreviewReady,
    finishCsvImportPreviewProgress,
    clearCsvImportCardState,
    patchCsvImportCardState
  };
};
