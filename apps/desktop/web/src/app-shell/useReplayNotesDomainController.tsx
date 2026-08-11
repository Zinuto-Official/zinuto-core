// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';
import {
  api,
} from '@/api';
import type {
  ReplayArchiveLike,
  ReplayNoteLike,
  UseReplayNotesDomainControllerArgs,
} from '@/app-shell/replayNoteDomainTypes';
import { useReplayNoteSnapshotHydration } from '@/app-shell/useReplayNoteSnapshotHydration';
import { useReplayNoteMetrics } from '@/app-shell/useReplayNoteContextModel';
import { useReplayNoteFieldActions } from '@/app-shell/useReplayNoteFieldActions';
import { useReplayNoteLifecycleActions } from '@/app-shell/useReplayNoteLifecycleActions';

export {
  type ReplayNoteSnapshotHydrationStatus,
  type ReplayNoteSnapshotHydrationState,
} from '@/app-shell/replayNoteDomainTypes';

export {
  promoteRecentReplayNoteSnapshotId,
  buildRetainedReplayNoteSnapshotIds,
  shouldRetryReplayNoteSnapshotHydration,
  resolveReplayNoteSnapshotRetryDelayMs,
  resolveReplayNoteSnapshotHydrationStatus,
  shouldHydrateActiveReplayNoteSnapshot,
  REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT,
} from '@/app-shell/replayNoteSnapshotHelpers';

export const useReplayNotesDomainController = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
>({
  replayNotes,
  replayNotesRef,
  selectedReplayNote,
  isNotesPageActive,
  activeTrainingRecordNoteId,
  setReplayNotes,
  setReplayNotesNextCursor,
  setSelectedReplayNoteId,
  setReplayNotesKeyword,
  setActiveTrainingRecordNoteId,
  ensureReplayNoteDetail,
  scheduleReplayNotePatch,
  flushReplayNotePatch,
  clearReplayNotePendingState,
  clearAllReplayNotePendingState,
  resetNotesPageController,
  upsertReplayNoteInState,
  appIsMountedRef,
  setError,
  showNotice,
  tt,
  ttf,
  language,
  fallbackReplayNoteTitle,
  bars,
  snapshot,
  sessionId,
  trainerDisplayPeriod,
  currentTrainingBaseTimeframe,
  drawingStoreRef,
  currentDisplayPeriodRef,
  syncDrawingStoreFromChart,
  tradingInitialSecuritiesBalance,
  mainNativeIndicator,
  mainNativeIndicatorParams,
  signalTopIndicator,
  signalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams,
  toReplayNotePreview,
  mapApiReplayNoteToLocal,
  sanitizeDrawingForArchive,
  maxArchiveDrawingCount,
  samplePoolUnknownId,
  samplePoolUnknownName
}: UseReplayNotesDomainControllerArgs<TDisplayPeriod, TArchive, TReplayNote>) => {
  // Hydration sub-hook
  const hydration = useReplayNoteSnapshotHydration<TDisplayPeriod, TArchive, TReplayNote>({
    replayNotes,
    replayNotesRef,
    selectedReplayNote,
    isNotesPageActive,
    activeTrainingRecordNoteId,
    setReplayNotes,
    ensureReplayNoteDetail,
    appIsMountedRef,
  });

  // Metrics sub-hook
  const metrics = useReplayNoteMetrics<TDisplayPeriod, TArchive, TReplayNote>({
    activeTrainingRecordNote: hydration.activeTrainingRecordNote,
    tt,
    ttf,
    samplePoolUnknownId,
    samplePoolUnknownName,
    bars,
    snapshot,
    currentTrainingBaseTimeframe,
    trainerDisplayPeriod,
    tradingInitialSecuritiesBalance,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    syncDrawingStoreFromChart,
    currentDisplayPeriodRef,
    drawingStoreRef,
    sanitizeDrawingForArchive,
    maxArchiveDrawingCount,
    sessionId,
  });

  // Field actions sub-hook
  const fieldActions = useReplayNoteFieldActions<TDisplayPeriod, TArchive, TReplayNote>({
    setReplayNotes,
    scheduleReplayNotePatch,
    flushReplayNotePatch,
    toReplayNotePreview,
    fallbackReplayNoteTitle,
    replayNotesRef,
  });

  // Lifecycle and creation sub-hook
  const lifecycle = useReplayNoteLifecycleActions<TDisplayPeriod, TArchive, TReplayNote>({
    replayNotes,
    replayNotesRef,
    activeTrainingRecordNoteId,
    setReplayNotes,
    setSelectedReplayNoteId,
    setReplayNotesKeyword,
    setActiveTrainingRecordNoteId,
    clearReplayNotePendingState,
    upsertReplayNoteInState,
    appIsMountedRef,
    setError,
    showNotice,
    tt,
    language,
    bars,
    snapshot,
    sessionId,
    trainerDisplayPeriod,
    currentTrainingBaseTimeframe,
    toReplayNotePreview,
    mapApiReplayNoteToLocal,
    buildTrainingRecordContextReplay: metrics.buildTrainingRecordContextReplay,
    deriveHistoryReviewMetrics: metrics.deriveHistoryReviewMetrics,
    deriveFastDecisionTitleMetrics: metrics.deriveFastDecisionTitleMetrics,
    deriveRiskDisciplineTitleMetrics: metrics.deriveRiskDisciplineTitleMetrics,
  });

  const clearAllReplayNotes = useCallback(() => {
    clearAllReplayNotePendingState();
    lifecycle.resetReplaySnapshotNoteLifecycleState();
    void (async () => {
      try {
        await api.clearReplayNotes();
        if (!appIsMountedRef.current) {
          return;
        }
        setReplayNotes([]);
        setReplayNotesNextCursor(null);
        setSelectedReplayNoteId('');
        setActiveTrainingRecordNoteId('');
        resetNotesPageController();
        setReplayNotesKeyword('');
      } catch (err) {
        if (!appIsMountedRef.current) {
          return;
        }
        setError(tt('appText.clearNotes'));
      }
    })();
  }, [
    appIsMountedRef,
    clearAllReplayNotePendingState,
    lifecycle.resetReplaySnapshotNoteLifecycleState,
    resetNotesPageController,
    setActiveTrainingRecordNoteId,
    setError,
    setReplayNotes,
    setReplayNotesKeyword,
    setReplayNotesNextCursor,
    setSelectedReplayNoteId,
    tt
  ]);

  return {
    activeTrainingRecordNote: hydration.activeTrainingRecordNote,
    activeTrainingRecordProject: metrics.activeTrainingRecordProject,
    isActiveTrainingRecordNoteNewlyCreated: lifecycle.isActiveTrainingRecordNoteNewlyCreated(hydration.activeTrainingRecordNote),
    buildTrainingRecordProjectFromNote: metrics.buildTrainingRecordProjectFromNote,
    buildCurrentReplayContext: metrics.buildTrainingRecordContextReplay,
    createCustomReplayNote: lifecycle.createCustomReplayNote,
    createChallengeReviewReplayNote: lifecycle.createChallengeReviewReplayNote,
    createHistoryReviewReplayNote: lifecycle.createHistoryReviewReplayNote,
    createTrainingRecordReplayNote: lifecycle.createTrainingRecordReplayNote,
    closeActiveTrainingRecordNote: lifecycle.closeActiveTrainingRecordNote,
    cancelActiveTrainingRecordNote: lifecycle.cancelActiveTrainingRecordNote,
    updateReplayNoteContextDisplayPeriod: fieldActions.updateReplayNoteContextDisplayPeriod,
    updateReplayNoteTitle: fieldActions.updateReplayNoteTitle,
    commitReplayNoteTitle: fieldActions.commitReplayNoteTitle,
    updateReplayNoteContent: fieldActions.updateReplayNoteContent,
    updateReplayNoteColorTokens: fieldActions.updateReplayNoteColorTokens,
    updateReplayNoteMeta: fieldActions.updateReplayNoteMeta,
    replayNoteSnapshotHydrationStateById: hydration.replayNoteSnapshotHydrationStateById,
    retryReplayNoteSnapshotDetail: hydration.retryReplayNoteSnapshotDetail,
    clearAllReplayNotes,
    formatReplayNoteTime: metrics.formatReplayNoteTime
  };
};
