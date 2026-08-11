// SPDX-License-Identifier: GPL-3.0-only

import { useShallowStableObject } from '@/workspaces/useShallowStableObject';
import type { HistoryWorkspacePageProps } from '@/workspaces/history/HistoryWorkspacePage';

type UseHistoryWorkspacePagePropsArgs = {
  tt: HistoryWorkspacePageProps['tt'];
  compactScriptLanguage: HistoryWorkspacePageProps['compactScriptLanguage'];
  filters: {
    historyListCompact: HistoryWorkspacePageProps['historyListCompact'];
    historyKeyword: HistoryWorkspacePageProps['historyKeyword'];
    historyProfitFilter: HistoryWorkspacePageProps['historyProfitFilter'];
    historySamplePoolFilterSelectValue: HistoryWorkspacePageProps['historySamplePoolFilterSelectValue'];
    samplePoolAllId: HistoryWorkspacePageProps['samplePoolAllId'];
    historyPoolFilterOptions: HistoryWorkspacePageProps['historyPoolFilterOptions'];
  };
  dataset: {
    trainingProjects: HistoryWorkspacePageProps['trainingProjects'];
    selectedHistoryCompactStats: HistoryWorkspacePageProps['selectedHistoryCompactStats'];
    historyVisibleProjects: HistoryWorkspacePageProps['historyVisibleProjects'];
    selectedHistoryProjectId: HistoryWorkspacePageProps['selectedHistoryProjectId'];
    selectedHistoryProjectReplayNoteCount: HistoryWorkspacePageProps['selectedHistoryProjectReplayNoteCount'];
    selectedHistoryProject: HistoryWorkspacePageProps['selectedHistoryProject'];
    historyProjectsNextCursor: HistoryWorkspacePageProps['historyProjectsNextCursor'];
    replayNotesNextCursor: HistoryWorkspacePageProps['replayNotesNextCursor'];
  };
  loading: {
    isHistoryProjectsLoading: HistoryWorkspacePageProps['isHistoryProjectsLoading'];
    isHistoryProjectsLoadingMore: HistoryWorkspacePageProps['isHistoryProjectsLoadingMore'];
    isReplayNotesLoading: HistoryWorkspacePageProps['isReplayNotesLoading'];
    isReplayNotesLoadingMore: HistoryWorkspacePageProps['isReplayNotesLoadingMore'];
  };
  editing: {
    editingProjectId: HistoryWorkspacePageProps['editingProjectId'];
    editingProjectName: HistoryWorkspacePageProps['editingProjectName'];
  };
  chart: {
    effectiveThemeMode: HistoryWorkspacePageProps['effectiveThemeMode'];
    showGlobalDecimals: HistoryWorkspacePageProps['showGlobalDecimals'];
    priceColorMode: HistoryWorkspacePageProps['priceColorMode'];
    tradeColorTheme: HistoryWorkspacePageProps['tradeColorTheme'];
    chartRenderMode: HistoryWorkspacePageProps['chartRenderMode'];
    language: HistoryWorkspacePageProps['language'];
    trainerDisplayPeriod: HistoryWorkspacePageProps['trainerDisplayPeriod'];
    trainerPeriodOptionsByBase: HistoryWorkspacePageProps['trainerPeriodOptionsByBase'];
    historyReplayChartBindings: HistoryWorkspacePageProps['historyReplayChartBindings'];
    showChartSettingsModal: HistoryWorkspacePageProps['showChartSettingsModal'];
    createSystemMarkers: HistoryWorkspacePageProps['createSystemMarkers'];
    createHistoryReviewReplayNote: HistoryWorkspacePageProps['createHistoryReviewReplayNote'];
  };
  actions: {
    setHistoryKeyword: HistoryWorkspacePageProps['setHistoryKeyword'];
    setHistoryProfitFilter: HistoryWorkspacePageProps['setHistoryProfitFilter'];
    setHistorySamplePoolFilter: HistoryWorkspacePageProps['setHistorySamplePoolFilter'];
    clearAllTrainingProjects: HistoryWorkspacePageProps['clearAllTrainingProjects'];
    setHistoryListCompact: HistoryWorkspacePageProps['setHistoryListCompact'];
    setSelectedHistoryProjectId: HistoryWorkspacePageProps['setSelectedHistoryProjectId'];
    startRenameTrainingProject: HistoryWorkspacePageProps['startRenameTrainingProject'];
    deleteTrainingProject: HistoryWorkspacePageProps['deleteTrainingProject'];
    deleteTrainingProjects: HistoryWorkspacePageProps['deleteTrainingProjects'];
    saveRenameTrainingProject: HistoryWorkspacePageProps['saveRenameTrainingProject'];
    cancelRenameTrainingProject: HistoryWorkspacePageProps['cancelRenameTrainingProject'];
    setEditingProjectName: HistoryWorkspacePageProps['setEditingProjectName'];
    loadMoreTrainingProjects: HistoryWorkspacePageProps['loadMoreTrainingProjects'];
    loadMoreReplayNotes: HistoryWorkspacePageProps['loadMoreReplayNotes'];
    setShowChartSettingsModal: HistoryWorkspacePageProps['setShowChartSettingsModal'];
    setTrainerDisplayPeriod: HistoryWorkspacePageProps['setTrainerDisplayPeriod'];
    setChartRenderMode: HistoryWorkspacePageProps['setChartRenderMode'];
  };
  formatters: {
    formatMoney: HistoryWorkspacePageProps['formatMoney'];
    formatRatio: HistoryWorkspacePageProps['formatRatio'];
    formatSignedMoney: HistoryWorkspacePageProps['formatSignedMoney'];
    withCountUnit: HistoryWorkspacePageProps['withCountUnit'];
    withBuySellCount: HistoryWorkspacePageProps['withBuySellCount'];
    changeClass: HistoryWorkspacePageProps['changeClass'];
    reverseChangeClass: HistoryWorkspacePageProps['reverseChangeClass'];
    pnlClass: HistoryWorkspacePageProps['pnlClass'];
    formatReplayNoteTime: HistoryWorkspacePageProps['formatReplayNoteTime'];
  };
};

export const useHistoryWorkspacePageProps = ({
  tt,
  compactScriptLanguage,
  filters,
  dataset,
  loading,
  editing,
  chart,
  actions,
  formatters
}: UseHistoryWorkspacePagePropsArgs): HistoryWorkspacePageProps =>
  useShallowStableObject({
    tt,
    compactScriptLanguage,
    historyListCompact: filters.historyListCompact,
    historyKeyword: filters.historyKeyword,
    historyProfitFilter: filters.historyProfitFilter,
    historySamplePoolFilterSelectValue: filters.historySamplePoolFilterSelectValue,
    samplePoolAllId: filters.samplePoolAllId,
    historyPoolFilterOptions: filters.historyPoolFilterOptions,
    trainingProjects: dataset.trainingProjects,
    selectedHistoryCompactStats: dataset.selectedHistoryCompactStats,
    historyVisibleProjects: dataset.historyVisibleProjects,
    selectedHistoryProjectId: dataset.selectedHistoryProjectId,
    selectedHistoryProjectReplayNoteCount: dataset.selectedHistoryProjectReplayNoteCount,
    selectedHistoryProject: dataset.selectedHistoryProject,
    historyProjectsNextCursor: dataset.historyProjectsNextCursor,
    replayNotesNextCursor: dataset.replayNotesNextCursor,
    isHistoryProjectsLoading: loading.isHistoryProjectsLoading,
    isHistoryProjectsLoadingMore: loading.isHistoryProjectsLoadingMore,
    isReplayNotesLoading: loading.isReplayNotesLoading,
    isReplayNotesLoadingMore: loading.isReplayNotesLoadingMore,
    editingProjectId: editing.editingProjectId,
    editingProjectName: editing.editingProjectName,
    effectiveThemeMode: chart.effectiveThemeMode,
    showGlobalDecimals: chart.showGlobalDecimals,
    priceColorMode: chart.priceColorMode,
    tradeColorTheme: chart.tradeColorTheme,
    chartRenderMode: chart.chartRenderMode,
    language: chart.language,
    trainerDisplayPeriod: chart.trainerDisplayPeriod,
    trainerPeriodOptionsByBase: chart.trainerPeriodOptionsByBase,
    historyReplayChartBindings: chart.historyReplayChartBindings,
    showChartSettingsModal: chart.showChartSettingsModal,
    createHistoryReviewReplayNote: chart.createHistoryReviewReplayNote,
    setHistoryKeyword: actions.setHistoryKeyword,
    setHistoryProfitFilter: actions.setHistoryProfitFilter,
    setHistorySamplePoolFilter: actions.setHistorySamplePoolFilter,
    clearAllTrainingProjects: actions.clearAllTrainingProjects,
    setHistoryListCompact: actions.setHistoryListCompact,
    setSelectedHistoryProjectId: actions.setSelectedHistoryProjectId,
    startRenameTrainingProject: actions.startRenameTrainingProject,
    deleteTrainingProject: actions.deleteTrainingProject,
    deleteTrainingProjects: actions.deleteTrainingProjects,
    saveRenameTrainingProject: actions.saveRenameTrainingProject,
    cancelRenameTrainingProject: actions.cancelRenameTrainingProject,
    setEditingProjectName: actions.setEditingProjectName,
    loadMoreTrainingProjects: actions.loadMoreTrainingProjects,
    loadMoreReplayNotes: actions.loadMoreReplayNotes,
    setShowChartSettingsModal: actions.setShowChartSettingsModal,
    setTrainerDisplayPeriod: actions.setTrainerDisplayPeriod,
    setChartRenderMode: actions.setChartRenderMode,
    formatMoney: formatters.formatMoney,
    formatRatio: formatters.formatRatio,
    formatSignedMoney: formatters.formatSignedMoney,
    withCountUnit: formatters.withCountUnit,
    withBuySellCount: formatters.withBuySellCount,
    changeClass: formatters.changeClass,
    reverseChangeClass: formatters.reverseChangeClass,
    pnlClass: formatters.pnlClass,
    formatReplayNoteTime: formatters.formatReplayNoteTime,
    createSystemMarkers: chart.createSystemMarkers
  });
