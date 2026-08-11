// SPDX-License-Identifier: GPL-3.0-only

import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';
import {
  buildLocalDataImportDraftValidationFailure,
  buildLocalDataImportPlanningReadModel,
  validateLocalDataImportDraft,
  normalizeTradingCalendarForLocalDataImport,
  type LocalDataImportDraftValidation,
  type LocalDataImportDraftPlanningInput,
} from './importDraftValidation.js';
import type { PreviewImportSessionStore } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import type { LocalDataSourceSummary } from './types.js';
import { DEFAULT_TRADING_CALENDAR_CONFIG } from '@zinuto/shared/tradingCalendar';
import type { PreviewLocalDataImportFolderResult } from './folderPreview.js';

export const buildInitialLocalDataImportDraftValidation = ({
  preview,
  sources,
  locale,
  validatedAt,
}: {
  preview: PreviewLocalDataImportFolderResult;
  sources: LocalDataSourceSummary[];
  locale: string;
  validatedAt: string;
}): LocalDataImportDraftValidation => {
  const repairWarningCount = Array.isArray(preview.repairSummary.warnings)
    ? preview.repairSummary.warnings.length
    : 0;
  const initialImportPlanning = buildLocalDataImportPlanningReadModel({
    plans: preview.confirmableImportPlans.map((plan) => ({
      id: String(plan.previewPlanId || plan.id || '').trim(),
      strategy: plan.strategy,
      baseTimeframe: plan.baseTimeframe,
      topLevelSubfolder: plan.topLevelSubfolder,
      defaultPoolName: plan.defaultPoolName,
      symbolCount: plan.symbolCount,
      fileCount: plan.fileCount,
    })),
    sources,
    input: {
      importEntryMode: 'GENERAL',
      importTimeZone: preview.suggestedTimeZone,
      importTimeZoneMode: 'AUTO',
      timeZoneConfirmed: false,
      timeZoneConfidence: preview.timeZoneSuggestion.confidence,
      suggestedTimeZone: preview.suggestedTimeZone,
      suggestedTimeZoneReason: preview.suggestedTimeZoneReason,
      scopeStrategy: 'FLAT',
      tradingCalendar: preview.tradingCalendarSuggestion.calendar,
      repairWarningCount,
      locale,
    },
    fallbackTradingCalendar: preview.tradingCalendarSuggestion.calendar,
  });
  return validateLocalDataImportDraft({
    mapping: preview.defaultMapping,
    headers: preview.headers,
    planDrafts: initialImportPlanning.planRows.map((plan) => ({
      previewPlanId: plan.previewPlanId,
      baseTimeframe: plan.baseTimeframe,
      tradingCalendar: plan.tradingCalendar,
    })),
    validatedAt,
    planning: initialImportPlanning,
    planningInput: {
      timeZoneConfidence: preview.timeZoneSuggestion.confidence,
      repairWarningCount,
    },
  });
};

export const createLocalDataImportDraftValidationService = ({
  assertLocalImportPreviewAccess,
  listLocalDataSources,
  nowIso,
  previewImportSessionStore,
}: {
  assertLocalImportPreviewAccess: () => Promise<void>;
  listLocalDataSources: () => Promise<LocalDataSourceSummary[]>;
  nowIso: () => string;
  previewImportSessionStore: PreviewImportSessionStore;
}) => async (input: {
  previewToken: string;
  mapping: CsvFieldMapping;
  planDrafts: Array<{
    previewPlanId: string;
    tradingCalendar: unknown;
  }>;
  planning?: LocalDataImportDraftPlanningInput;
}): Promise<LocalDataImportDraftValidation> => {
  await assertLocalImportPreviewAccess();
  const previewToken = String(input.previewToken || '').trim();
  const validatedAt = nowIso();
  const plans = previewImportSessionStore.listPlans(previewToken);
  const headers = previewImportSessionStore.resolveHeaders(previewToken);
  if (!plans.length || !headers.length) {
    return buildLocalDataImportDraftValidationFailure(
      'LOCAL_DATA_IMPORT_PREVIEW_EXPIRED',
      validatedAt,
    );
  }
  const sources = await listLocalDataSources();
  const suggestedTradingCalendar =
    previewImportSessionStore.resolveSuggestedTradingCalendar(previewToken)?.calendar ?? null;
  const fallbackTradingCalendar = (() => {
    try {
      return normalizeTradingCalendarForLocalDataImport(
        input.planning?.tradingCalendar ??
          suggestedTradingCalendar ??
          DEFAULT_TRADING_CALENDAR_CONFIG,
        '1m',
      );
    } catch {
      return DEFAULT_TRADING_CALENDAR_CONFIG;
    }
  })();
  const planning = buildLocalDataImportPlanningReadModel({
    plans,
    sources,
    input: input.planning,
    fallbackTradingCalendar,
  });
  return validateLocalDataImportDraft({
    mapping: input.mapping,
    headers,
    planDrafts: planning.planRows.map((planRow) => {
      return {
        previewPlanId: planRow.previewPlanId,
        baseTimeframe: planRow.baseTimeframe,
        tradingCalendar: planRow.tradingCalendar,
      };
    }),
    validatedAt,
    planning,
    planningInput: input.planning,
  });
};
