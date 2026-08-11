// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import type { TrainingSummary } from '@/domains/training/types';
import {
  formatHistoryDateRangeFacts,
  useHistoryReviewReadModelFacts,
} from '@/domains/history/historyReviewReadModelFacts';

type TrainingSummaryLike = TrainingSummary;

type ReplayLike = {
  equityCurve?: Array<{ value?: number }>;
  snapshot?: { session?: { id?: string } };
};

type TrainingProjectBase = {
  id: string;
  name: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  trainingDateRange: string;
  totalPnl: number;
  initialTotal: number;
  finalEquity: number;
  equityReturnRate: number;
  summary: TrainingSummaryLike;
  replay?: ReplayLike;
  updatedAt: string;
  createdAt: string;
};

type UseHistoryWorkspaceViewModelArgs<TProject extends TrainingProjectBase> = {
  language: AppUiLanguage;
  historyKeyword: string;
  historyProfitFilter: 'ALL' | 'PROFIT' | 'LOSS';
  historySamplePoolFilter: string;
  samplePoolAllId: string;
  samplePoolUnknownId: string;
  trainingProjects: TProject[];
  selectedHistoryProjectId: string;
  formatMoney: (value: number, digits?: number) => string;
  formatCountWithUnitText: (language: AppUiLanguage, countText: string | number, unitText: string) => string;
  withLabelValue: (label: string, value: string) => string;
};

export const useHistoryWorkspaceViewModel = <TProject extends TrainingProjectBase>({
  language,
  historyKeyword,
  historyProfitFilter,
  historySamplePoolFilter,
  samplePoolAllId,
  samplePoolUnknownId,
  trainingProjects,
  selectedHistoryProjectId,
  formatMoney,
  formatCountWithUnitText,
  withLabelValue,
}: UseHistoryWorkspaceViewModelArgs<TProject>) => {
  const readModelRefreshKey = useMemo(
    () =>
      JSON.stringify({
        projectIds: trainingProjects.map((project) => project.id),
        keyword: historyKeyword,
        profitFilter: historyProfitFilter,
        samplePoolFilter: historySamplePoolFilter,
      }),
    [historyKeyword, historyProfitFilter, historySamplePoolFilter, trainingProjects],
  );

  const historyReviewFacts = useHistoryReviewReadModelFacts(readModelRefreshKey, {
    keyword: historyKeyword,
    profitFilter: historyProfitFilter,
    samplePoolFilter: historySamplePoolFilter,
    samplePoolAllId,
    samplePoolUnknownId,
  });

  const historyPoolFilterOptions = historyReviewFacts.poolFilterOptions;

  const historyPoolFilterOptionIds = useMemo(
    () => historyPoolFilterOptions.map((item) => (item.id || '').trim()).filter(Boolean),
    [historyPoolFilterOptions]
  );

  const historySamplePoolFilterSelectValue = useMemo(() => {
    const normalized = (historySamplePoolFilter || '').trim();
    if (!normalized || normalized === samplePoolAllId) {
      return samplePoolAllId;
    }
    return historyPoolFilterOptionIds.includes(normalized) ? normalized : samplePoolAllId;
  }, [historyPoolFilterOptionIds, historySamplePoolFilter, samplePoolAllId]);


  const historyVisibleProjects = useMemo(() => {
    const projectById = new Map(trainingProjects.map((p) => [p.id, p]));
    return historyReviewFacts.filteredProjectIds
      .map((id) => projectById.get(id))
      .filter((p): p is TProject => p !== undefined);
  }, [historyReviewFacts.filteredProjectIds, trainingProjects]);

  const selectedHistoryProject = useMemo(
    () => historyVisibleProjects.find((item) => item.id === selectedHistoryProjectId) ?? historyVisibleProjects[0] ?? null,
    [historyVisibleProjects, selectedHistoryProjectId]
  );

  const selectedHistoryProjectBindingId = useMemo(
    () => (selectedHistoryProject?.id || '').trim(),
    [selectedHistoryProject]
  );

  const selectedHistoryProjectSessionId = useMemo(
    () => historyReviewFacts.selectedProjectSessionId ?? '',
    [historyReviewFacts.selectedProjectSessionId]
  );

  const selectedHistoryProjectReplayNoteCount = useMemo(() => {
    if (!selectedHistoryProjectBindingId) {
      return 0;
    }
    return (
      historyReviewFacts.projectFactsById.get(selectedHistoryProjectBindingId)
        ?.replayNoteCount ?? 0
    );
  }, [historyReviewFacts.projectFactsById, selectedHistoryProjectBindingId]);

  const selectedHistoryProjectReplayNoteCountText = useMemo(() => {
    const notesWithUnit = formatCountWithUnitText(language, formatMoney(selectedHistoryProjectReplayNoteCount, 0), tt('appText.notes2'));
    return withLabelValue(tt('appText.reviewNotes'), notesWithUnit);
  }, [formatCountWithUnitText, formatMoney, language, selectedHistoryProjectReplayNoteCount, withLabelValue]);

  const selectedHistoryCompactStats = useMemo(() => {
    if (!selectedHistoryProject) {
      return null;
    }
    const facts = historyReviewFacts.projectFactsById.get(
      selectedHistoryProject.id,
    );
    const compactStats = facts?.compactStats;
    if (!compactStats) {
      return null;
    }

    return {
      project: selectedHistoryProject,
      summary: selectedHistoryProject.summary,
      initialCapital: compactStats.initialCapital,
      finalEquity: compactStats.finalEquity,
      equityReturnRate: compactStats.equityReturnRate,
      drawdownRate: compactStats.drawdownRate,
      drawdownAmount: compactStats.drawdownAmount,
      dateRange: formatHistoryDateRangeFacts(language, compactStats.dateRange)
    };
  }, [historyReviewFacts.projectFactsById, language, selectedHistoryProject]);

  return {
    historyPoolFilterOptions,
    historyPoolFilterOptionIds,
    historySamplePoolFilterSelectValue,
    historyVisibleProjects,
    selectedHistoryProject,
    selectedHistoryProjectBindingId,
    selectedHistoryProjectSessionId,
    selectedHistoryProjectReplayNoteCount,
    selectedHistoryProjectReplayNoteCountText,
    selectedHistoryCompactStats
  };
};
