// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import type { TrainingSummary } from '@/domains/training/types';
import type { PriceColorMode } from '@/domains/chart/display';
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";
import type {
  HistoryProjectLike,
  LoadMoreHistoryProjects,
} from '@/domains/history/historyTypes';
import {
  type HistoryReplayChartBindings,
  type HistoryReplayChartViewProps
} from '@/domains/chart/HistoryReplayChart';

type HistorySummaryLike = TrainingSummary;

type HistoryCompactStatsLike = {
  project: Pick<HistoryProjectLike, 'id' | 'name' | 'symbol'>;
  summary: HistorySummaryLike;
  initialCapital: number;
  finalEquity: number;
  equityReturnRate: number;
  drawdownRate: number;
  drawdownAmount: number;
  dateRange: string;
};

export type HistoryWorkspacePageProps = {
  tt: (key: AppTextKey) => string;
  compactScriptLanguage: boolean;
  historyListCompact: boolean;
  historyKeyword: string;
  historyProfitFilter: 'ALL' | 'PROFIT' | 'LOSS';
  historySamplePoolFilterSelectValue: string;
  samplePoolAllId: string;
  historyPoolFilterOptions: Array<{ id: string; name: string }>;
  trainingProjects: HistoryProjectLike[];
  selectedHistoryCompactStats: HistoryCompactStatsLike | null;
  historyVisibleProjects: HistoryProjectLike[];
  selectedHistoryProjectId: string;
  selectedHistoryProjectReplayNoteCount: number;
  selectedHistoryProject: HistoryReplayChartViewProps['project'];
  historyProjectsNextCursor: string | null;
  replayNotesNextCursor: string | null;
  isHistoryProjectsLoading: boolean;
  isHistoryProjectsLoadingMore: boolean;
  isReplayNotesLoading: boolean;
  isReplayNotesLoadingMore: boolean;
  editingProjectId: string;
  editingProjectName: string;
  effectiveThemeMode: 'light' | 'dark';
  showGlobalDecimals: boolean;
  priceColorMode: PriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
  language: AppUiLanguage;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps['trainerPeriodOptionsByBase'];
  chartRenderMode: NonNullable<HistoryReplayChartViewProps['chartRenderMode']>;
  historyReplayChartBindings: HistoryReplayChartBindings;
  showChartSettingsModal: boolean;
  setHistoryKeyword: (value: string) => void;
  setHistoryProfitFilter: (value: 'ALL' | 'PROFIT' | 'LOSS') => void;
  setHistorySamplePoolFilter: (value: string) => void;
  clearAllTrainingProjects: () => void;
  setHistoryListCompact: (updater: (current: boolean) => boolean) => void;
  setSelectedHistoryProjectId: (id: string) => void;
  startRenameTrainingProject: (project: HistoryProjectLike) => void;
  deleteTrainingProject: (projectId: string) => void;
  deleteTrainingProjects: (projectIds: string[]) => void;
  saveRenameTrainingProject: () => void;
  cancelRenameTrainingProject: () => void;
  setEditingProjectName: (value: string) => void;
  loadMoreTrainingProjects: LoadMoreHistoryProjects;
  loadMoreReplayNotes: () => Promise<void>;
  setShowChartSettingsModal: (open: boolean) => void;
  setTrainerDisplayPeriod: (period: DisplayPeriodKey) => void;
  setChartRenderMode: NonNullable<HistoryReplayChartViewProps['onChartRenderModeChange']>;
  formatMoney: (value: number, digits?: number) => string;
  formatRatio: (value: number) => string;
  formatSignedMoney: (value: number) => string;
  withCountUnit: (value: string, unit: string) => string;
  withBuySellCount: (buy: string, sell: string) => string;
  changeClass: (value: number) => string;
  reverseChangeClass: (value: number) => string;
  pnlClass: (value: number) => string;
  formatReplayNoteTime: (value: string) => string;
  createSystemMarkers: HistoryReplayChartViewProps['createSystemMarkers'];
  createHistoryReviewReplayNote: (payload: {
    trainingProjectId: string;
    contextReplay: ArchivedReplayData;
    contextDisplayPeriod?: DisplayPeriodKey;
  }) => void;
};
