// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  ApiLocalDataImportDraftValidation,
  ApiTradingCalendarConfig,
} from '@/api';
import { DEFAULT_TRADING_CALENDAR_CONFIG } from '@zinuto/shared/tradingCalendar';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { getCsvFieldLabels } from '@/frontend-kernel/uiOptions';
import type { CsvImportPlanConfigRow } from '@/app-shell/AppCsvMappingModal';
import { normalizeTradingCalendarForSubmit } from '@/domains/data-import/tradingCalendarUi';
import type {
  CsvFieldMapping,
} from '@/domains/data-import/csvHelpers';
import type { PendingCsvFolderImport } from '@/domains/data-import/dataSourceTypes';
import type {
  CsvImportEntryMode,
  CsvPoolNamingStrategy,
  PendingCsvPlanOverride,
} from '@/app-shell/appCsvImportContracts';

type PendingCsvDraftValidationPayload = {
  previewToken: string;
  mapping: CsvFieldMapping;
  planDrafts: PendingCsvDraftValidationPlanDraft[];
  planning: {
    importEntryMode: CsvImportEntryMode;
    fullReimportTargetSourceId?: string;
    importTimeZone: string;
    importTimeZoneMode: 'AUTO' | 'MANUAL';
    timeZoneConfirmed: boolean;
    timeZoneConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
    suggestedTimeZone: string;
    suggestedTimeZoneReason:
      | 'PRESET_DEFAULT'
      | 'RULE_INFERRED'
      | 'TIMESTAMP_INFERRED'
      | 'EXISTING_SOURCE'
      | 'SYSTEM_FALLBACK';
    scopeStrategy: CsvPoolNamingStrategy;
    tradingCalendar: ApiTradingCalendarConfig;
    tradingCalendarTouched?: boolean;
    repairWarningCount: number;
    locale: string;
    planOverrides: Array<PendingCsvPlanOverride & { previewPlanId: string }>;
  };
};

type PendingCsvDraftValidationPlanDraft = {
  previewPlanId: string;
  tradingCalendar: ApiTradingCalendarConfig;
};

export const buildPendingCsvDraftValidationPlanDrafts = (
  planRows: CsvImportPlanConfigRow[],
): PendingCsvDraftValidationPlanDraft[] =>
  planRows
    .filter(
      (row) =>
        Math.max(0, Number(row.fileCount) || 0) > 0 &&
        Math.max(0, Number(row.symbolCount) || 0) > 0,
    )
    .map((row) => ({
      previewPlanId: String(row.previewPlanId || '').trim(),
      tradingCalendar: normalizeTradingCalendarForSubmit(
        row.tradingCalendar,
        row.baseTimeframe,
      ),
    }))
    .filter((row) => Boolean(row.previewPlanId));

export const resolveDraftValidationErrorMessage = (
  validation: ApiLocalDataImportDraftValidation,
  tt: (key: AppTextKey) => string,
  ttf: (key: AppTextKey, values: Array<string | number>) => string,
): string => {
  const fieldLabels = getCsvFieldLabels();
  const firstMappingIssue = validation.mapping.issues[0] ?? null;
  if (validation.confirm.reasonCode === 'CSV_MAPPING_DUPLICATED') {
    return tt('appText.fieldMappingRepeatedSelectDifferentColumnEachField');
  }
  if (validation.confirm.reasonCode === 'CSV_MAPPING_HEADER_MISSING') {
    const field = firstMappingIssue?.field ?? 'date';
    return ttf('appText.value0MappingInvalid', [fieldLabels[field]]);
  }
  if (validation.confirm.reasonCode === 'CSV_MAPPING_REQUIRED') {
    const field = firstMappingIssue?.field ?? 'date';
    return ttf('appText.value0Selected', [fieldLabels[field]]);
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_TRADING_CALENDAR_INVALID') {
    return tt('appText.tradingCalendarInvalid');
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_IMPORT_TARGET_SOURCE_INVALID') {
    return tt('appText.importTargetNeedsReview');
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_IMPORT_REPAIR_WARNINGS') {
    return tt('appText.importRepairWarningsNeedReview');
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_IMPORT_TIME_ZONE_CONFIRMATION_REQUIRED') {
    return tt('appText.importLowConfidenceTimeZoneConfirm');
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_IMPORT_PREVIEW_EXPIRED') {
    return tt('appText.importConfigurationExpiredRescanFolder');
  }
  if (validation.confirm.reasonCode === 'LOCAL_DATA_IMPORT_NO_CONFIRMABLE_PLAN') {
    return tt('appText.validSymbolFilenameFound');
  }
  return tt('appText.importPreviewFailed');
};

export const usePendingCsvDraftValidation = ({
  appIsMountedRef,
  pendingCsvFieldMapping,
  pendingCsvFolderImport,
  pendingCsvImportTimeZone,
  pendingCsvImportTimeZoneMode,
  pendingCsvImportTimeZoneConfirmed,
  pendingCsvImportScopeStrategy,
  pendingCsvPlanOverrides,
  pendingCsvPlanConfigRows,
  language,
  setPendingCsvFolderImport,
  validateLocalDataImportDraft,
}: {
  appIsMountedRef: MutableRefObject<boolean>;
  pendingCsvFieldMapping: CsvFieldMapping | null;
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  pendingCsvImportTimeZone: string;
  pendingCsvImportTimeZoneMode: 'AUTO' | 'MANUAL';
  pendingCsvImportTimeZoneConfirmed: boolean;
  pendingCsvImportScopeStrategy: CsvPoolNamingStrategy;
  pendingCsvPlanOverrides: Record<string, PendingCsvPlanOverride>;
  pendingCsvPlanConfigRows: CsvImportPlanConfigRow[];
  language: string;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  validateLocalDataImportDraft: (
    payload: PendingCsvDraftValidationPayload,
  ) => Promise<ApiLocalDataImportDraftValidation>;
}) => {
  const pendingCsvDraftValidationInputKey = useMemo(() => {
    const previewToken = String(pendingCsvFolderImport?.previewToken || '').trim();
    const importDraft = pendingCsvFolderImport;
    if (!previewToken || !pendingCsvFieldMapping || !importDraft) {
      return '';
    }
    return JSON.stringify({
      previewToken,
      mapping: pendingCsvFieldMapping,
      planDrafts: buildPendingCsvDraftValidationPlanDrafts(
        pendingCsvPlanConfigRows,
      ),
      planning: {
        importEntryMode: importDraft.importEntryMode,
        fullReimportTargetSourceId:
          importDraft.fullReimportTargetSourceId,
        importTimeZone: pendingCsvImportTimeZone,
        importTimeZoneMode: pendingCsvImportTimeZoneMode,
        timeZoneConfirmed: pendingCsvImportTimeZoneConfirmed,
        timeZoneConfidence:
          importDraft.timeZoneSuggestion.confidence ?? 'LOW',
        suggestedTimeZone: importDraft.suggestedTimeZone || pendingCsvImportTimeZone,
        suggestedTimeZoneReason:
          importDraft.suggestedTimeZoneReason ?? 'SYSTEM_FALLBACK',
        scopeStrategy: pendingCsvImportScopeStrategy,
        tradingCalendar:
          importDraft.tradingCalendar ??
          importDraft.tradingCalendarSuggestion.calendar ??
          DEFAULT_TRADING_CALENDAR_CONFIG,
        tradingCalendarTouched: importDraft.tradingCalendarTouched === true,
        repairWarningCount: Array.isArray(importDraft.repairSummary.warnings)
          ? importDraft.repairSummary.warnings.length
          : 0,
        locale: language,
        planOverrides: Object.entries(pendingCsvPlanOverrides).map(
          ([previewPlanId, override]) => ({
            previewPlanId,
            ...override,
          }),
        ),
      },
    } satisfies PendingCsvDraftValidationPayload);
  }, [
    language,
    pendingCsvFieldMapping,
    pendingCsvFolderImport,
    pendingCsvFolderImport?.previewToken,
    pendingCsvImportScopeStrategy,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneConfirmed,
    pendingCsvImportTimeZoneMode,
    pendingCsvPlanConfigRows,
    pendingCsvPlanOverrides,
  ]);

  useEffect(() => {
    if (!pendingCsvDraftValidationInputKey) {
      return;
    }
    const payload = JSON.parse(
      pendingCsvDraftValidationInputKey,
    ) as PendingCsvDraftValidationPayload;
    let canceled = false;
    setPendingCsvFolderImport((current) =>
      current?.previewToken === payload.previewToken
        ? {
            ...current,
            draftValidation: null,
          }
        : current,
    );
    void validateLocalDataImportDraft(payload)
      .then((draftValidation) => {
        if (canceled || !appIsMountedRef.current) {
          return;
        }
        setPendingCsvFolderImport((current) =>
          current?.previewToken === payload.previewToken
            ? {
                ...current,
                draftValidation,
                importPlanning: draftValidation.planning,
              }
            : current,
        );
      })
      .catch(() => {
        if (canceled || !appIsMountedRef.current) {
          return;
        }
        setPendingCsvFolderImport((current) =>
          current?.previewToken === payload.previewToken
            ? {
                ...current,
                draftValidation: null,
              }
            : current,
        );
      });
    return () => {
      canceled = true;
    };
  }, [
    appIsMountedRef,
    pendingCsvDraftValidationInputKey,
    setPendingCsvFolderImport,
    validateLocalDataImportDraft,
  ]);
};
