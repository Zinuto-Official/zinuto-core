// SPDX-License-Identifier: GPL-3.0-only

import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { CustomSamplePool } from "@/frontend-kernel/appTypes";
import type { CsvFieldMapping } from "@/domains/data-import/csvHelpers";
import type { CsvImportCardState } from "@/domains/data-import/useCsvImportController";
import type {
  DataTaskOperationProgress,
} from "@/domains/data-import/dataSourceTypes";
import type { ApiLocalDataSourceSummary } from "@/api";
import type { MutableRefObject } from "react";

export type LocalDataSourceSyncPreviewOptions = {
  hasLocalSymbolRemoval?: boolean;
  removedSymbolCount?: number;
  poolName?: string;
  sourceFolderUsageMode?: "BOUND_SOURCE" | "ONE_OFF";
  onOperationProgress?: (progress: DataTaskOperationProgress) => void;
};

export type ConfirmedLocalDataSourceSyncResult = {
  completed: boolean;
  importedRows: number;
  ignoredRows: number;
  ignoredOnly: boolean;
};

export type ImportCsvFn = (
  previewToken: string,
  previewPlanId: string,
  fileCount: number,
  poolName: string,
  sourceFolder: string,
  mapping: CsvFieldMapping,
  baseTimeframe: "1m" | "5m" | "1h" | "1d",
  importCardId: string,
  options?: {
    mode?: "BATCH" | "INCREMENTAL_UPDATE";
    sourceId?: string;
    sourceFolder?: string;
    sourceFolderBookmarkId?: string;
    sourceFolderUsageMode?: "BOUND_SOURCE" | "ONE_OFF";
    importScopeStrategy?: "FLAT" | "WITH_PARENT" | null;
    importScopeTopLevelSubfolder?: string;
  },
) => Promise<unknown>;

export type UseDataSourceSyncPreviewActionsArgs = {
  language: string;
  appIsMountedRef: MutableRefObject<boolean>;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  isPreparingCsvImportPreview: boolean;
  customSamplePools: CustomSamplePool[];
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  csvImportCardStates: CsvImportCardState[];
  importCsv: ImportCsvFn;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, replacements: Array<string | number>) => string;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  resolveSourceFolderBookmarkIdBySourceId: (sourceId: string) => string;
  patchCsvImportCardState: (id: string, patch: Partial<CsvImportCardState>) => void;
  setError: (value: string) => void;
  setHint: (value: string) => void;
  setCsvImportCardStates: React.Dispatch<React.SetStateAction<CsvImportCardState[]>>;
};
