// SPDX-License-Identifier: GPL-3.0-only

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  ApiReplayNoteDetail,
  ApiReplayNoteSummary,
} from '@/api';
import type { SessionSnapshot } from '@/domains/training/types';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import type {
  ReplayNoteDetailRequestResult,
  ReplayNoteType,
} from '@/workspaces/notes/useReplayNotes';
import type {
  ReplayNoteSource,
  ReplayNoteStructuredMeta,
} from '@/domains/notes/replayNoteSemantics';
import type { ReplayNoteColorToken } from '@zinuto/shared/replayNoteColors';
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
export type { ReplayNoteSource, ReplayNoteStructuredMeta } from '@/domains/notes/replayNoteSemantics';
import type { OverlayMode } from 'klinecharts';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';

export type ReplaySnapshotLike = SessionSnapshot;

export type ReplayBarLike = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ReplayDrawingLike = {
  id?: string;
  name: string;
  points: Array<{ timestamp: number; value?: number; dataIndex?: number }>;
  visible?: boolean;
  zLevel?: number;
  mode?: OverlayMode;
  modeSensitivity?: number;
  needDefaultXAxisFigure?: boolean;
  styles?: unknown;
  extendData?: unknown;
};

export type ReplayArchiveLike<TDisplayPeriod extends string> = {
  bars?: ReplayBarLike[];
  previewBars?: ReplayBarLike[];
  barWindow?: {
    startRawIndex?: number;
    endRawIndex?: number;
    totalBars?: number;
    hasBackward?: boolean;
    hasForward?: boolean;
    limited?: boolean;
  };
  snapshot: ReplaySnapshotLike;
  drawings?: ReplayDrawingLike[];
  equityCurve?: Array<{ ts?: string | number; value?: number }>;
  drawdownCurve?: Array<{ value?: number }>;
  finalEquity?: number;
  equityReturnRate?: number;
  baseTimeframe?: BaseTimeframe;
  displayPeriod?: TDisplayPeriod;
  chartIndicators?: {
    mainNativeIndicator?: string;
    mainNativeIndicatorParams?: number[];
    signalTopIndicator?: string;
    signalTopIndicatorParams?: number[];
    signalBottomIndicator?: string;
    signalBottomIndicatorParams?: number[];
  };
  contextDisplayPeriod?: TDisplayPeriod;
};

export type ReplayNoteLike<TDisplayPeriod extends string, TArchive extends ReplayArchiveLike<TDisplayPeriod>> = {
  id: string;
  title: string;
  type: ReplayNoteType;
  contentDocument: ReplayNoteDocumentV1;
  contentPreview?: string;
  contentLoaded: boolean;
  optimistic?: boolean;
  trainingProjectId: string | null;
  hasContextReplay: boolean;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  contextReplay: TArchive | null;
  contextDisplayPeriod?: TDisplayPeriod;
  colorTokens?: ReplayNoteColorToken[];
  attachments?: ReplayNoteAttachmentV1[];
  source?: ReplayNoteSource | null;
  meta?: ReplayNoteStructuredMeta | null;
  createdAt: string;
  updatedAt: string;
};

export type ReplayNoteSnapshotHydrationStatus =
  | 'idle'
  | 'loading'
  | 'error'
  | 'ready';

export type ReplayNoteSnapshotHydrationState = {
  status: ReplayNoteSnapshotHydrationStatus;
  retryCount: number;
};

export type TrainingSummaryLike = {
  initialAsset: number;
  endingAsset: number;
  assetReturnRate: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  investedAmount: number;
  tradingCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
};

export type TrainingProjectLike<TArchive extends ReplayArchiveLike<string>> = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  summary: TrainingSummaryLike;
  finalEquity: number;
  equityReturnRate: number;
  replay?: TArchive;
};

export type PatchPayload<TDisplayPeriod extends string> = Partial<{
  title: string;
  contentDocument: ReplayNoteDocumentV1;
  attachments: ReplayNoteAttachmentV1[];
  trainingProjectId: string | null;
  contextDisplayPeriod: TDisplayPeriod;
  colorTokens: ReplayNoteColorToken[];
  source: ReplayNoteSource | null;
  meta: ReplayNoteStructuredMeta | null;
}>;

export type UseReplayNotesDomainControllerArgs<
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
> = {
  replayNotes: TReplayNote[];
  replayNotesRef: MutableRefObject<TReplayNote[]>;
  selectedReplayNote: TReplayNote | null;
  isNotesPageActive: boolean;
  activeTrainingRecordNoteId: string;
  setReplayNotes: Dispatch<SetStateAction<TReplayNote[]>>;
  setReplayNotesNextCursor: Dispatch<SetStateAction<string | null>>;
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  setReplayNotesKeyword: Dispatch<SetStateAction<string>>;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  ensureReplayNoteDetail: (
    noteId: string,
  ) => Promise<ReplayNoteDetailRequestResult<TReplayNote>>;
  scheduleReplayNotePatch: (noteId: string, patch: PatchPayload<TDisplayPeriod>, debounceMs?: number) => void;
  flushReplayNotePatch: (noteId: string, patch: PatchPayload<TDisplayPeriod>) => Promise<TReplayNote | null>;
  clearReplayNotePendingState: (noteId: string) => void;
  clearAllReplayNotePendingState: () => void;
  resetNotesPageController: () => void;
  upsertReplayNoteInState: (note: TReplayNote) => void;
  appIsMountedRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string>>;
  showNotice: (message: string, title?: string, autoCloseMs?: number) => void;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  language: AppUiLanguage;
  fallbackReplayNoteTitle: string;
  bars: ReplayBarLike[];
  snapshot: ReplaySnapshotLike | null;
  sessionId: string;
  trainerDisplayPeriod: TDisplayPeriod;
  currentTrainingBaseTimeframe: string;
  drawingStoreRef: MutableRefObject<Array<{ id?: string }>>;
  currentDisplayPeriodRef: MutableRefObject<TDisplayPeriod>;
  syncDrawingStoreFromChart: (period: TDisplayPeriod) => void;
  tradingInitialSecuritiesBalance: number;
  mainNativeIndicator: string;
  mainNativeIndicatorParams: number[];
  signalTopIndicator: string;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: string;
  signalBottomIndicatorParams: number[];
  toReplayNotePreview: (
    document: ReplayNoteDocumentV1,
    attachments?: ReplayNoteAttachmentV1[],
  ) => string;
  mapApiReplayNoteToLocal: (
    note: ApiReplayNoteSummary | ApiReplayNoteDetail
  ) => TReplayNote;
  sanitizeDrawingForArchive: (input: unknown) => unknown | null;
  maxArchiveDrawingCount: number;
  samplePoolUnknownId: string;
  samplePoolUnknownName: string;
};
