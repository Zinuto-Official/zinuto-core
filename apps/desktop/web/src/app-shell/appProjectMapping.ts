// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type {
  ApiTrainingProjectDetail,
  ApiTrainingProjectSummary,
} from '@/api';
import type {
  TrainingProject
} from "@/frontend-kernel/appTypes";
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';

export const mapApiTrainingProjectToLocal = (
  project: ApiTrainingProjectSummary | ApiTrainingProjectDetail
): TrainingProject => {
  const replay =
    'replay' in project && project.replay && typeof project.replay === 'object'
      ? (project.replay as ArchivedReplayData)
      : undefined;
  return {
    ...project,
    baseTimeframe: (project.baseTimeframe || '').trim().toLowerCase() || 'unknown',
    replay
  };
};

export const deriveProjectDateRange = (project: TrainingProject): string => {
  const language = getCurrentUiLanguage();
  const emptyDate = formatMessage(language, 'common.placeholder.none');
  const rawRange = String(project.trainingDateRange ?? '').trim();
  if (rawRange && rawRange !== '~' && rawRange !== '- ~ -') {
    const normalized = rawRange.replace(/\s+/g, ' ');
    const [left = '', right = ''] = normalized.split('~').map((part) => part.trim());
    if (left || right) {
      return formatMessage(language, 'app.dateRange.between', {
        start: left || emptyDate,
        end: right || emptyDate,
      });
    }
  }

  const replayBars = project.replay?.bars;
  if (Array.isArray(replayBars) && replayBars.length) {
    const first = replayBars[0]?.ts?.slice?.(0, 10) ?? emptyDate;
    const last = replayBars[replayBars.length - 1]?.ts?.slice?.(0, 10) ?? emptyDate;
    if (first || last) {
      return formatMessage(language, 'app.dateRange.between', {
        start: first || emptyDate,
        end: last || emptyDate,
      });
    }
  }

  return formatMessage(language, 'app.dateRange.empty');
};
