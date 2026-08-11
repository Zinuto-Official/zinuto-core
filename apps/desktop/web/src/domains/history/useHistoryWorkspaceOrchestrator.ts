// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import type { TrainingSummary } from '@/domains/training/types';
import { useHistoryWorkspaceViewModel } from '@/workspaces/history/useHistoryWorkspaceViewModel';

type HistoryProjectLike = {
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
  summary: TrainingSummary;
  replay?: {
    equityCurve?: Array<{ value?: number }>;
    snapshot?: { session?: { id?: string } };
  };
  updatedAt: string;
  createdAt: string;
};

type UseHistoryWorkspaceOrchestratorArgs<
  TProject extends HistoryProjectLike
> = {
  language: AppUiLanguage;
  historyKeyword: string;
  historyProfitFilter: 'ALL' | 'PROFIT' | 'LOSS';
  historySamplePoolFilter: string;
  samplePoolAllId: string;
  samplePoolUnknownId: string;
  trainingProjects: TProject[];
  selectedHistoryProjectId: string;
  setHistorySamplePoolFilter: Dispatch<SetStateAction<string>>;
  setSelectedHistoryProjectId: Dispatch<SetStateAction<string>>;
  ensureTrainingProjectDetail: (projectId: string) => Promise<void> | void;
  formatMoney: (value: number, digits?: number) => string;
  formatCountWithUnitText: (language: AppUiLanguage, countText: string | number, unitText: string) => string;
  withLabelValue: (label: string, value: string) => string;
};

export const useHistoryWorkspaceOrchestrator = <
  TProject extends HistoryProjectLike
>({
  language,
  historyKeyword,
  historyProfitFilter,
  historySamplePoolFilter,
  samplePoolAllId,
  samplePoolUnknownId,
  trainingProjects,
  selectedHistoryProjectId,
  setHistorySamplePoolFilter,
  setSelectedHistoryProjectId,
  ensureTrainingProjectDetail,
  formatMoney,
  formatCountWithUnitText,
  withLabelValue,
}: UseHistoryWorkspaceOrchestratorArgs<TProject>) => {
  const {
    historyPoolFilterOptions,
    historyPoolFilterOptionIds,
    historySamplePoolFilterSelectValue,
    historyVisibleProjects,
    selectedHistoryProject,
    selectedHistoryProjectReplayNoteCount,
    selectedHistoryProjectReplayNoteCountText,
    selectedHistoryCompactStats
  } = useHistoryWorkspaceViewModel({
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
  });

  useEffect(() => {
    const optionSet = new Set<string>([samplePoolAllId, ...historyPoolFilterOptionIds]);
    setHistorySamplePoolFilter((current) => optionSet.has((current || '').trim()) ? current : samplePoolAllId);
  }, [historyPoolFilterOptionIds, samplePoolAllId, setHistorySamplePoolFilter]);

  useEffect(() => {
    if (!historyVisibleProjects.length) {
      return;
    }
    setSelectedHistoryProjectId((current) =>
      historyVisibleProjects.some((item) => item.id === current) ? current : historyVisibleProjects[0].id
    );
  }, [historyVisibleProjects, setSelectedHistoryProjectId]);

  useEffect(() => {
    if (!selectedHistoryProjectId) {
      return;
    }
    void ensureTrainingProjectDetail(selectedHistoryProjectId);
  }, [ensureTrainingProjectDetail, selectedHistoryProjectId]);

  return {
    historyPoolFilterOptions,
    historyPoolFilterOptionIds,
    historySamplePoolFilterSelectValue,
    historyVisibleProjects,
    selectedHistoryProject,
    selectedHistoryProjectReplayNoteCount,
    selectedHistoryProjectReplayNoteCountText,
    selectedHistoryCompactStats,
  };
};
