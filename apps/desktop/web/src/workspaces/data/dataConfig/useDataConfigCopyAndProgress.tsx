// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from "react";
import type { DataTaskOperationProgress } from "@/domains/data-import/dataSourceTypes";
import type { CsvImportPreviewProgressState } from "@/domains/data-import/useCsvImportController";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import { getPortableDataTransferCopy, type AppUiLanguage } from "@/ui/config/uiConfig";
import { formatMessageByLanguage, type AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { useArmedAction } from "@/ui/hooks/useArmedAction";

type UseDataConfigCopyAndProgressInput = {
  clearingLocalDataSourcesProgressPercent: number;
  deletingSamplePoolProgressPercent: number;
  formatMoney: (value: number, digits?: number) => string;
  getBaseTimeframeLabels: () => Record<BaseTimeframe, string>;
  language: AppUiLanguage;
  preparingCsvImportPreviewPercent: number;
  preparingCsvImportPreviewProgress: CsvImportPreviewProgressState | null;
  tt: (key: AppTextKey) => string;
};

export const useDataConfigCopyAndProgress = ({
  clearingLocalDataSourcesProgressPercent,
  deletingSamplePoolProgressPercent,
  formatMoney,
  getBaseTimeframeLabels,
  language,
  preparingCsvImportPreviewPercent,
  preparingCsvImportPreviewProgress,
  tt,
}: UseDataConfigCopyAndProgressInput) => {
  const ttLoose = useCallback(
    (key: string): string => tt(key as AppTextKey),
    [tt],
  );
  const clearLocalPoolsActionKey = "clear-local-pools" as const;
  const {
    buildBlurClearHandler,
    clearArmedAction,
    isActionArmed,
    setArmedKey,
  } = useArmedAction<typeof clearLocalPoolsActionKey>();
  const ttf = useCallback(
    (key: AppTextKey, values: Array<unknown> = []) =>
      formatMessageByLanguage(language, key, values),
    [language],
  );
  const percentSymbol = tt("appText.percent");
  const middleDotSymbol = tt("appText.message0664");
  const baseTimeframeLabels = getBaseTimeframeLabels();
  const formatPercentDisplay = useCallback(
    (value: number, digits = 2): string =>
      formatCountWithUnitText(
        language,
        formatMoney(value, digits),
        percentSymbol,
      ),
    [formatMoney, language, percentSymbol],
  );
  const joinWithMiddleDot = (parts: ReadonlyArray<string>): string =>
    parts
      .map((part) => String(part ?? "").trim())
      .filter((part) => part.length > 0)
      .join(` ${middleDotSymbol} `);
  const portableCopy = useMemo(
    () => getPortableDataTransferCopy(language),
    [language],
  );
  const dataConfigCopy = useMemo(
    () => ({
      close: tt("appText.close2"),
      checkAllChanges: tt("appText.checkChanges"),
      viewDetails: tt("appText.viewDetails"),
      importTask: tt("appText.importTask"),
      retry: tt("appText.retry"),
      lastChecked: (value: string) => ttf("appText.lastCheckedValue0", [value]),
      readOnly: tt("appText.read"),
      readOnlyHint: tt("appText.autoSyncSupported"),
      errorFailed: tt("appText.error"),
      lightweightCheckFailed: tt("appText.lightweightCheckTryAgainLater"),
      changesDetected: tt("appText.changesDetected"),
      confirmationRequired: tt(
        "appText.manualConfirmationRequiredBeforeSyncContinue",
      ),
      previewBeforeSync: tt("appText.sourceDirectoryChangesFound"),
      sync: tt("appText.sync"),
      estimatedChangedFiles: (value: string) =>
        ttf("appText.estimatedChangedFilesValue0", [value]),
      confirmationNeeded: tt(
        "appText.manualConfirmationRequiredBeforeContinuing",
      ),
      autoSyncArmed: tt("appText.autoSyncArmed"),
      sourceFolderChanged: tt("appText.sourceDirectoryChangesFound"),
      rebindRequired: portableCopy.pendingRebindLabel,
      rebindRequiredHint: portableCopy.marketContextHint,
      rebindActionLabel: portableCopy.rebindActionLabel,
      pendingChanges: tt("appText.pendingChangesWaitingProcessed"),
      checking: tt("appText.checking"),
      checkingHint: tt("appText.runningLowCostDirectoryChangeCheck"),
      autoSyncEnabled: tt("appText.autoSyncEnabled"),
      promptOnlyHint: tt("appText.checkDataModifiedImmediately"),
      syncedAuto: tt("appText.syncedAuto"),
      syncedAutoHint: tt("appText.lightweightChecksAutoSyncWhenPossible"),
      noChangesHint: tt("appText.changesFoundLatestCheck"),
      manualCheckHint: tt("appText.manuallyCheckChangesTime"),
      manualMode: tt("appText.manual"),
      syncing: tt("appText.syncing"),
      syncingHint: tt("appText.importIncrementalSyncRunning"),
      errorsFailedHint: tt("appText.manualReviewRetryRequired"),
      importHeroTitle: tt("appText.importLocalMarketData"),
      importHeroDropTitle: tt("appText.dropMarketDataFolderHere"),
      importHeroBrowseAction: tt("appText.chooseLocalFolder"),
      importHeroScanningHint: tt("appText.fullFilePrecheckRunning"),
      localImportEmptySupportedFormats: tt(
        "appText.localImportEmptySupportedFormats",
      ),
      localImportEmptyRequiredFields: tt(
        "appText.localImportEmptyRequiredFields",
      ),
      localImportEmptySourceQualityCheck: tt(
        "appText.localImportEmptySourceQualityCheck",
      ),
      localImportEmptyTimeframeSupport: tt(
        "appText.localImportEmptyTimeframeSupport",
      ),
      importedDataTitle: tt("appText.myImportedData"),
      importedDataUpdateNotice: tt("appText.localImportedDataUpdatesAvailable"),
      importedDataEmptyTitle: tt("appText.noImportedDataYet"),
      systemSamplesTitle: tt("appText.systemBuiltInSamples"),
      tabOverview: tt("appText.overview"),
      tabSymbols: tt("appText.symbols3"),
      tabDiagnostics: tt("appText.diagnostics"),
      sourceFolder: tt("appText.sourceFolder"),
      importScope: tt("appText.importScope"),
      autoSync: tt("appText.autoSync"),
      promptAfterCheck: tt("appText.promptAfterCheck"),
      syncStatus: tt("appText.syncStatus"),
      lastCheck: tt("appText.lastCheck"),
      files: tt("appText.files"),
      phase: tt("appText.phase"),
      compaction: tt("appText.compaction"),
      symbolCount: tt("appText.symbolCount"),
      symbols: tt("appText.symbols4"),
      timeRange: tt("appText.timeRange2"),
      storageUsed: tt("appText.storageUsed"),
      removedSymbolsNote: (value: string) =>
        ttf("appText.value0SymbolsRemovedLocalView", [value]),
    }),
    [
      portableCopy.marketContextHint,
      portableCopy.pendingRebindLabel,
      portableCopy.rebindActionLabel,
      tt,
      ttf,
    ],
  );
  const normalizedDeletingProgressPercent = Math.max(
    0,
    Math.min(100, Number(deletingSamplePoolProgressPercent) || 0),
  );
  const normalizedClearingLocalDataSourcesProgressPercent = Math.max(
    0,
    Math.min(100, Number(clearingLocalDataSourcesProgressPercent) || 0),
  );
  const normalizedPreparingPreviewPercent = Math.max(
    0,
    Math.min(100, Number(preparingCsvImportPreviewPercent) || 0),
  );
  const preparingPreviewProgressPercent =
    preparingCsvImportPreviewProgress?.progressPercent ?? null;
  const hasPreparingPreviewPercent =
    preparingPreviewProgressPercent !== null &&
    (Math.max(0, preparingCsvImportPreviewProgress?.totalFiles ?? 0) > 0 ||
      Math.max(0, preparingCsvImportPreviewProgress?.totalBytes ?? 0) > 0 ||
      preparingPreviewProgressPercent >= 100);
  const resolvedPreparingPreviewPercent = hasPreparingPreviewPercent
    ? Math.max(0, Math.min(100, Number(preparingPreviewProgressPercent) || 0))
    : normalizedPreparingPreviewPercent;
  const preparingPreviewProgressCountLabel =
    preparingCsvImportPreviewProgress &&
    Math.max(0, Number(preparingCsvImportPreviewProgress.totalFiles) || 0) > 0
      ? ttf("appText.progressValue0Value1", [
          formatMoney(preparingCsvImportPreviewProgress.processedFiles, 0),
          formatMoney(preparingCsvImportPreviewProgress.totalFiles, 0),
        ])
      : "";
  const renderPreparingCsvImportPreviewProgress = () => (
    <span
      className={`data-config-import-drop-progress ${
        hasPreparingPreviewPercent ? "is-determinate" : "is-indeterminate"
      }`}
    >
      <span className="data-config-import-drop-title">
        {tt("appText.fullFilePrecheckRunning")}
        {hasPreparingPreviewPercent ? (
          <>
            {" "}
            {formatPercentDisplay(resolvedPreparingPreviewPercent, 0)}
          </>
        ) : null}
      </span>
      <span className="data-asset-import-progress-track data-config-import-preview-track">
        <span
          style={
            hasPreparingPreviewPercent
              ? {
                  width: `${resolvedPreparingPreviewPercent}%`,
                }
              : undefined
          }
        />
      </span>
      {preparingPreviewProgressCountLabel ? (
        <span className="data-config-import-drop-hint">
          {preparingPreviewProgressCountLabel}
        </span>
      ) : null}
    </span>
  );
  const renderDataTaskProgressRail = (
    progress: DataTaskOperationProgress,
    className = "",
  ) => {
    const hasPercent =
      progress.progressPercent !== null &&
      Number.isFinite(progress.progressPercent);
    const normalizedProgressPercent = hasPercent
      ? Math.max(0, Math.min(100, Number(progress.progressPercent) || 0))
      : null;
    return (
      <div
        className={`data-task-progress-rail is-${progress.tone} ${
          hasPercent ? "is-determinate" : "is-indeterminate"
        } ${className}`.trim()}
        aria-live="polite"
      >
        <div className="data-task-progress-rail-head">
          <span className="data-task-progress-rail-label">
            {progress.label}
          </span>
          {normalizedProgressPercent !== null ? (
            <span className="data-task-progress-rail-value">
              {formatPercentDisplay(normalizedProgressPercent, 0)}
            </span>
          ) : null}
        </div>
        <div className="data-task-progress-rail-track">
          <span
            style={
              normalizedProgressPercent !== null
                ? { width: `${normalizedProgressPercent}%` }
                : undefined
            }
          />
        </div>
      </div>
    );
  };
  return {
    baseTimeframeLabels,
    buildBlurClearHandler,
    clearArmedAction,
    clearLocalPoolsActionKey,
    dataConfigCopy,
    formatPercentDisplay,
    isActionArmed,
    joinWithMiddleDot,
    normalizedClearingLocalDataSourcesProgressPercent,
    normalizedDeletingProgressPercent,
    portableCopy,
    renderDataTaskProgressRail,
    renderPreparingCsvImportPreviewProgress,
    setArmedKey,
    ttLoose,
    ttf,
  };
};
