// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ApiTradingCalendarConfig } from '@/api';

export type CsvPoolNamingStrategy = 'FLAT' | 'WITH_PARENT';
export type CsvImportEntryMode = 'GENERAL' | 'FULL_REIMPORT';

export type CsvImportActionStartRejectionCode =
  | 'CONFIGURATION_EXPIRED'
  | 'DUPLICATE_REQUEST'
  | 'IMPORT_BLOCKED'
  | 'INVALID_FOLDER'
  | 'VALIDATION_FAILED';

export type CsvImportPreparationResult =
  | {
      ready: true;
      previewToken: string;
    }
  | {
      ready: false;
      canceled?: boolean;
      reason?: string;
    };

export type CsvImportActionStartResult =
  | {
      accepted: true;
      completion?: Promise<CsvImportPreparationResult>;
    }
  | {
      accepted: false;
      code: CsvImportActionStartRejectionCode;
      reason?: string;
    };

export const resolveCsvImportEntryBlockCode = ({
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
}: {
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
}): CsvImportActionStartRejectionCode | null =>
  isPreparingCsvImportPreview ||
  isClearingLocalDataSources ||
  Boolean(String(deletingSamplePoolId || '').trim())
    ? 'IMPORT_BLOCKED'
    : null;

export const CSV_IMPORT_TARGET_SOURCE_AUTO_CREATE_ID =
  '__zinuto_auto_create__';

export const buildCsvImportTimeZoneConfirmationKey = (
  previewToken: unknown,
  timeZone: unknown,
): string => {
  const normalizedPreviewToken = String(previewToken ?? '').trim();
  const normalizedTimeZone = String(timeZone ?? '').trim();
  return normalizedPreviewToken && normalizedTimeZone
    ? `${normalizedPreviewToken}:${normalizedTimeZone}`
    : '';
};

export type PendingCsvPlanOverride = {
  targetSourceId: string;
  sourceTouched: boolean;
  poolName: string;
  nameTouched: boolean;
};

export type PendingCsvImportTargetSourceOption = {
  sourceId: string;
  sourceName: string;
  baseTimeframe: BaseTimeframe;
  importScopeStrategy: 'FLAT' | 'WITH_PARENT' | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin:
    | 'PRESET_DEFAULT'
    | 'PRESET_DEFAULT'
    | 'INFERRED_DEFAULT'
    | 'USER_SELECTED';
  tradingCalendar: ApiTradingCalendarConfig;
};
