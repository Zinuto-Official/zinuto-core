// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  type ApiLocalDataSourceSummary,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { CsvImportPlanConfigRow } from '@/app-shell/AppCsvMappingModal';
import {
  type CsvPoolNamingStrategy,
  type PendingCsvImportTargetSourceOption,
  type PendingCsvPlanOverride,
} from '@/app-shell/appCsvImportContracts';
import {
  type CsvFieldMapping,
} from '@/domains/data-import/csvHelpers';
import type {
  CsvImportCardState,
  CsvImportPreviewProgressState,
} from '@/domains/data-import/useCsvImportController';
import { useAppCsvImportPreviewActions } from '@/app-shell/appCsvImportPreviewActions';
import { useAppCsvImportPendingActions } from '@/app-shell/appCsvImportPendingActions';
import { useAppCsvImportConfirmActions } from '@/app-shell/appCsvImportConfirmActions';

type CsvImportCardControlAction = '' | 'PAUSE' | 'RESUME' | 'CANCEL';

type PendingCsvImportPoolGroup = {
  id: string;
  previewPlanId: string;
  strategy: 'FLAT' | 'WITH_PARENT';
  topLevelSubfolder: string;
  name: string;
  symbolCount: number;
  fileCount: number;
  baseTimeframe: BaseTimeframe;
};

export type { PendingCsvImportPoolGroup };

type ImportCsvRunner = (
  previewToken: string,
  previewPlanId: string,
  sourceFileCount: number,
  folderName: string,
  folderPath: string,
  csvFieldMapping: CsvFieldMapping | undefined,
  baseTimeframe: BaseTimeframe,
  importCardId?: string,
  options?: Record<string, unknown>
) => Promise<unknown>;

type UseAppCsvImportActionsParams = {
  language: string;
  appIsMountedRef: MutableRefObject<boolean>;
  lastCsvImportFolderOpenRef: MutableRefObject<{ path: string; at: number }>;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  pendingCsvFieldMapping: CsvFieldMapping | null;
  pendingCsvImportTimeZone: string;
  pendingCsvImportTimeZoneMode: 'AUTO' | 'MANUAL';
  pendingCsvImportTimeZoneConfirmed: boolean;
  pendingCsvPlanOverrides: Record<string, PendingCsvPlanOverride>;
  pendingCsvImportPoolGroups: PendingCsvImportPoolGroup[];
  pendingCsvImportTargetSourceOptions: PendingCsvImportTargetSourceOption[];
  pendingCsvPlanConfigRows: CsvImportPlanConfigRow[];
  csvImportCardStates: CsvImportCardState[];
  csvImportCardControlAction: CsvImportCardControlAction;
  customSamplePoolsCount: number;
  importCsv: ImportCsvRunner;
  beginCsvImportPreviewProgress: () => void;
  updateCsvImportPreviewProgress: (patch: Partial<CsvImportPreviewProgressState>) => void;
  markCsvImportPreviewReady: () => void;
  finishCsvImportPreviewProgress: (params: { startAt: number; previewReady: boolean; minDurationMs: number }) => Promise<void>;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  sanitizeSamplePoolName: (name: string, fallbackName: string) => string;
  resolveImportBatchWorkerCount: (groupCount: number) => number;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
  setPendingCsvImportTimeZone: Dispatch<SetStateAction<string>>;
  setPendingCsvImportTimeZoneMode: Dispatch<SetStateAction<'AUTO' | 'MANUAL'>>;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  setPendingCsvFieldMapping: Dispatch<SetStateAction<CsvFieldMapping | null>>;
  setPendingCsvPoolNamingStrategy: Dispatch<SetStateAction<CsvPoolNamingStrategy>>;
  setPendingCsvPlanOverrides: Dispatch<SetStateAction<Record<string, PendingCsvPlanOverride>>>;
  setCsvImportCardStates: Dispatch<SetStateAction<CsvImportCardState[]>>;
  setCsvImportCardControlAction: Dispatch<SetStateAction<CsvImportCardControlAction>>;
  setError: (message: string) => void;
  setHint: (message: string) => void;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values: Array<string | number>) => string;
  setPendingCsvImportTimeZoneConfirmationKey: Dispatch<SetStateAction<string>>;
};

export const useAppCsvImportActions = ({
  language,
  appIsMountedRef,
  lastCsvImportFolderOpenRef,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  localDataSourceSummaries,
  pendingCsvFolderImport,
  pendingCsvFieldMapping,
  pendingCsvImportTimeZone,
  pendingCsvImportTimeZoneMode,
  pendingCsvImportTimeZoneConfirmed,
  pendingCsvPlanOverrides,
  pendingCsvImportPoolGroups,
  pendingCsvImportTargetSourceOptions,
  pendingCsvPlanConfigRows,
  csvImportCardStates,
  csvImportCardControlAction,
  customSamplePoolsCount,
  importCsv,
  beginCsvImportPreviewProgress,
  updateCsvImportPreviewProgress,
  markCsvImportPreviewReady,
  finishCsvImportPreviewProgress,
  patchCsvImportCardState,
  sanitizeSamplePoolName,
  resolveImportBatchWorkerCount,
  resolveUnknownErrorMessage,
  setPendingCsvImportTimeZone,
  setPendingCsvImportTimeZoneConfirmationKey,
  setPendingCsvImportTimeZoneMode,
  setPendingCsvFolderImport,
  setPendingCsvFieldMapping,
  setPendingCsvPoolNamingStrategy,
  setPendingCsvPlanOverrides,
  setCsvImportCardStates,
  setCsvImportCardControlAction,
  setError,
  setHint,
  tt,
  ttf
}: UseAppCsvImportActionsParams) => {
  const previewActions = useAppCsvImportPreviewActions({
    language,
    appIsMountedRef,
    lastCsvImportFolderOpenRef,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    localDataSourceSummaries,
    pendingCsvFolderImport,
    pendingCsvFieldMapping,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvImportTimeZoneConfirmed,
    pendingCsvPlanOverrides,
    pendingCsvImportTargetSourceOptions,
    pendingCsvPlanConfigRows,
    beginCsvImportPreviewProgress,
    updateCsvImportPreviewProgress,
    markCsvImportPreviewReady,
    finishCsvImportPreviewProgress,
    resolveUnknownErrorMessage,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneMode,
    setPendingCsvFolderImport,
    setPendingCsvFieldMapping,
    setPendingCsvPoolNamingStrategy,
    setPendingCsvPlanOverrides,
    setError,
    setHint,
    tt,
    setPendingCsvImportTimeZoneConfirmationKey,
  });

  const pendingActions = useAppCsvImportPendingActions({
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportPoolGroups,
    pendingCsvImportTargetSourceOptions,
    customSamplePoolsCount,
    sanitizeSamplePoolName,
    markPendingCsvDraftValidationPending: previewActions.markPendingCsvDraftValidationPending,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneMode,
    setPendingCsvFolderImport,
    setPendingCsvFieldMapping,
    setPendingCsvPlanOverrides,
    tt,
    ttf,
    setPendingCsvImportTimeZoneConfirmationKey,
  });

  const confirmActions = useAppCsvImportConfirmActions({
    appIsMountedRef,
    isPreparingCsvImportPreview,
    pendingCsvFolderImport,
    pendingCsvFieldMapping,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvPlanConfigRows,
    csvImportCardStates,
    csvImportCardControlAction,
    importCsv,
    resolveImportBatchWorkerCount,
    resolveUnknownErrorMessage,
    sanitizeSamplePoolName,
    patchCsvImportCardState,
    setCsvImportCardStates,
    setCsvImportCardControlAction,
    setError,
    setHint,
    tt,
    ttf,
    resetPendingCsvImportState: previewActions.resetPendingCsvImportState,
    discardCsvImportPreviewToken: previewActions.discardCsvImportPreviewToken,
  });

  return {
    resetPendingCsvImportTimeZoneRecommendation: pendingActions.resetPendingCsvImportTimeZoneRecommendation,
    resetPendingCsvImportTradingCalendarRecommendation: pendingActions.resetPendingCsvImportTradingCalendarRecommendation,
    prepareCsvImportFromFolderPath: previewActions.prepareCsvImportFromFolderPath,
    prepareCsvImportFromSelectedFolderPath: previewActions.prepareCsvImportFromSelectedFolderPath,
    openCsvFolderPickerAndPrepareImport: previewActions.openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport: previewActions.openCsvFolderPathAndPrepareImport,
    resolvePendingCsvPoolNamePrefix: pendingActions.resolvePendingCsvPoolNamePrefix,
    confirmPendingCsvImportTimeZone: pendingActions.confirmPendingCsvImportTimeZone,
    updatePendingCsvImportTimeZone: pendingActions.updatePendingCsvImportTimeZone,
    updatePendingCsvImportTradingCalendar: pendingActions.updatePendingCsvImportTradingCalendar,
    updatePendingCsvPlanSourceId: pendingActions.updatePendingCsvPlanSourceId,
    updatePendingCsvPlanPoolName: pendingActions.updatePendingCsvPlanPoolName,
    confirmPendingCsvImport: confirmActions.confirmPendingCsvImport,
    controlCsvImportCardJob: confirmActions.controlCsvImportCardJob,
    cancelPendingCsvImport: previewActions.cancelPendingCsvImport,
    updatePendingCsvMapping: pendingActions.updatePendingCsvMapping,
    updatePendingCsvTimestampMode: pendingActions.updatePendingCsvTimestampMode
  };
};
