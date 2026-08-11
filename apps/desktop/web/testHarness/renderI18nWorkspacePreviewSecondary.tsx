// SPDX-License-Identifier: GPL-3.0-only

import { createReplayNoteDocumentFromPlainText } from "@zinuto/shared/replayNoteDocument";
import React from "react";
import { AppCsvMappingModal } from "../src/app-shell/AppCsvMappingModal";
import type { HistoryReplayChartBindings } from "../src/domains/chart/HistoryReplayChart";
import { formatStorageBytes } from "../src/frontend-kernel/uiOptions";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import { formatMoney, formatRatio } from "../src/ui/formatting/format";
import {
  formatCountWithUnitText,
  formatLabelValueText,
} from "../src/ui/formatting/i18nDisplay";
import { CustomIndicatorSystemPage } from "../src/workspaces/custom-indicator/CustomIndicatorSystemPage";
import { DataConfigWorkspacePage } from "../src/workspaces/data/DataConfigWorkspacePage";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";
import { DiagnosticCenterWorkspacePage } from "../src/workspaces/history/DiagnosticCenterWorkspacePage";
import NotesPage from "../src/workspaces/notes/NotesPage";
import { SystemSettingsWorkspacePage } from "../src/workspaces/settings/SystemSettingsWorkspacePage";
import { PreviewMarketDataAcquisition } from "./PreviewMarketDataAcquisition";
import {
  language,
  locale,
  noop,
  noopAsync,
  requestedPage,
  requestedScenario,
  requestedTheme,
  resolvePreviewSamplePoolDisplayName,
  type PreviewPageId,
} from "./i18nWorkspacePreviewSupport";
import { previewReviewProjects } from "./i18nWorkspaceReviewFixtures";
import {
  StrategyBacktestDetailPreviewPage,
  StrategyBacktestPreviewPage,
} from "./strategyBacktestPreviewPages";

export const renderI18nWorkspacePreviewSecondary = (
  page: PreviewPageId,
  scope: Record<string, any>,
): React.ReactNode => {
  const {
    fontSizePresetOptions,
    isDataEmptyPreview,
    isDataPrecheckPreview,
    labels,
    languageOptions,
    previewCsvBaseTimeframeLabels,
    previewCsvFieldLabels,
    previewCsvFieldMapping,
    previewCsvImportCardViews,
    previewCsvPendingImport,
    previewCsvPlanConfigRows,
    previewDataPoolSettingsRows,
    previewDataSourceSyncMonitorStateById,
    previewDataSourceSyncPrefsById,
    tt,
    ttf,
  } = scope;
  switch (page) {
    case "HISTORY":
      return (
        <DiagnosticCenterWorkspacePage
          history={
            {
              samplePoolAllId: "ALL",
              trainingProjects: previewReviewProjects,
              historyProjectsNextCursor: null,
              isHistoryProjectsLoading: false,
              isHistoryProjectsLoadingMore: false,
              loadMoreTrainingProjects: noopAsync,
              deleteTrainingProject: noop,
              deleteTrainingProjects: noop,
              clearAllTrainingProjects: noop,
              effectiveThemeMode: requestedTheme,
              priceColorMode: "RED_UP_GREEN_DOWN",
              trainerPeriodOptionsByBase: {} as never,
              historyReplayChartBindings: {} as HistoryReplayChartBindings,
              chartRenderMode: "CANDLE",
              setChartRenderMode: noop,
              showChartSettingsModal: false,
              openChartSettingsModal: noop,
              createSystemMarkers: noop as never,
              createHistoryReviewReplayNote: noop,
              formatMoney,
              formatRatio,
              withCountUnit: (value: string | number, unit: string) =>
                formatCountWithUnitText(language, value, unit),
            } as never
          }
          ui={labels}
          language={language}
          onError={noop}
        />
      );
    case "NOTES":
    case "NOTES_EMPTY":
    case "NOTES_FILTERED_EMPTY":
    case "NOTES_COMPOSE": {
      const previewNote = {
        id: "note-1",
        title: "Preview Note",
        type: "CUSTOM" as const,
        contentDocument: createReplayNoteDocumentFromPlainText(
          "Opening plan\n\nWait for confirmation, then write down the trigger and invalidation.",
        ),
        contentPreview:
          "Opening plan Wait for confirmation, then write down the trigger and invalidation.",
        contentLoaded: true,
        trainingProjectId: null,
        hasContextReplay: false,
        contextExpiredAt: null,
        contextSessionId: null,
        contextCursorIndex: null,
        contextReplay: null,
        colorTokens: ["BLUE" as const],
        source: null,
        meta: null,
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-06T08:00:00.000Z",
      };
      const isNotesEmptyPreview = requestedPage === "NOTES_EMPTY";
      const isNotesFilteredEmptyPreview =
        requestedPage === "NOTES_FILTERED_EMPTY";
      const isNotesComposePreview = requestedPage === "NOTES_COMPOSE";
      return (
        <NotesPage
          isActive
          language={language}
          defaultReplayNoteTitle={tt("appText.zinutoInd")}
          initialComposeNoteId={isNotesComposePreview ? previewNote.id : null}
          replayNotesKeyword=""
          onReplayNotesKeywordChange={noop}
          activeScopeFilter={isNotesFilteredEmptyPreview ? "CHALLENGE" : "ALL"}
          onSelectActiveScopeFilter={noop}
          selectedColorTokens={isNotesFilteredEmptyPreview ? ["BLUE"] : []}
          onSelectColorTokens={noop}
          collectionNotes={
            isNotesEmptyPreview || isNotesFilteredEmptyPreview
              ? []
              : [previewNote]
          }
          collectionTotal={
            isNotesEmptyPreview || isNotesFilteredEmptyPreview ? 0 : 1
          }
          collectionNextCursor={null}
          isCollectionLoading={false}
          isCollectionLoadingMore={false}
          onLoadMoreCollectionNotes={noop}
          selectedReplayNote={
            isNotesEmptyPreview || isNotesFilteredEmptyPreview
              ? null
              : previewNote
          }
          onSelectReplayNoteId={noop}
          onRequestReplayNoteDelete={noop}
          onCreateCustomReplayNote={async () => null}
          onUpdateReplayNoteTitle={noop}
          onCommitReplayNoteTitle={noop}
          onUpdateReplayNoteColorTokens={noop}
          renderTrainingNoteSnapshot={() => <div>Snapshot</div>}
          onUpdateReplayNoteContent={noop}
          formatReplayNoteTime={(value) => value.slice(0, 10)}
          formatMoney={formatMoney}
        />
      );
    }
    case "CUSTOM_INDICATOR":
      return (
        <CustomIndicatorSystemPage
          language={language}
          ui={labels}
          priceColorMode="RED_UP_GREEN_DOWN"
          resolveSamplePoolDisplayName={resolvePreviewSamplePoolDisplayName}
        />
      );
    case "STRATEGY_BACKTEST":
      return <StrategyBacktestPreviewPage />;
    case "STRATEGY_BACKTEST_DETAIL":
      return <StrategyBacktestDetailPreviewPage />;
    case "DATA":
      return (
        <div>
          <div
            style={{
              position: "absolute",
              left: "-9999px",
              top: "0",
            }}
            data-i18n-slot="previewTitle"
            data-i18n-critical="true"
          >
            {labels.dataConfigTitle}
          </div>
          <DataConfigWorkspacePage
            ui={{
              dataConfigTitle: labels.dataConfigTitle,
              readCsvFolder: labels.readCsvFolder,
            }}
            tt={tt}
            enabledPoolGroupCount={0}
            combinedEnabledPoolSymbols={[]}
            isCsvImporting={previewCsvImportCardViews.length > 0}
            isPreparingCsvImportPreview={isDataPrecheckPreview}
            isClearingLocalDataSources={false}
            isNativeImportDragActive={false}
            deletingSamplePoolId=""
            preparingCsvImportPreviewPercent={0}
            preparingCsvImportPreviewProgress={null}
            clearingLocalDataSourcesProgressPercent={0}
            deletingSamplePoolProgressPercent={0}
            csvImportCardViews={previewCsvImportCardViews}
            csvImportCardControlAction={null}
            poolSettingsRows={previewDataPoolSettingsRows}
            dataSourceSyncMonitorStateById={
              previewDataSourceSyncMonitorStateById
            }
            dataSourceSyncPrefsById={previewDataSourceSyncPrefsById}
            customSamplePoolsCount={isDataEmptyPreview ? 0 : 2}
            editingSamplePoolId=""
            editingSamplePoolName=""
            pendingLocalDataSourceSyncPreview={null}
            preparingLocalDataSourceSyncPreview={null}
            totalPoolGroupCount={isDataEmptyPreview ? 1 : 3}
            headerSymbolCount={isDataEmptyPreview ? 100 : 107}
            marketDataStorageBytes={isDataEmptyPreview ? 0 : 149_200_000}
            compactScriptLanguage={
              language === "zh-CN" || language === "ko" || language === "ja"
            }
            formatMoney={formatMoney}
            formatStorageBytes={formatStorageBytes}
            withLabelValue={(label, value) =>
              formatLabelValueText(language, label, value)
            }
            getBaseTimeframeLabels={() => ({
              "1m": "1m",
              "5m": "5m",
              "1h": "1h",
              "1d": tt("appText.message0421"),
            })}
            effectiveThemeMode={requestedTheme}
            priceColorMode="RED_UP_GREEN_DOWN"
            language={language}
            trainerDisplayPeriod="1d"
            trainerPeriodOptionsByBase={{} as never}
            historyReplayChartBindings={{} as HistoryReplayChartBindings}
            onClearLocalPools={noop}
            openCsvFolderPickerAndPrepareImport={noop}
            openCsvFolderPathAndPrepareImport={noop}
            controlCsvImportCardJob={async () => undefined}
            fetchDetailSymbolBarsRange={async () => ({
              symbol: "AAPL",
              timeframe: "1d",
              total: 0,
              offset: 0,
              limit: 0,
              bars: [],
            })}
            fetchDetailSymbolDiagnostics={async () => ({
              symbol: "AAPL",
              baseTimeframe: "1d",
              diagnosticRulesVersion: "",
              status: "BUILDING",
              generatedAt: null,
              profile: {
                assetClass: "STOCK",
                marketPresetId: "US_STOCK",
                profileOrigin: "INFERRED",
              },
              health: { score: 100, severity: "INFO", affectedSymbols: 0 },
              totalBars: 0,
              summary: {
                totalIssues: 0,
                criticalIssues: 0,
                warningIssues: 0,
                infoIssues: 0,
                byCategory: {
                  TIME_INTEGRITY: 0,
                  EXTREME_ANOMALY: 0,
                },
              },
              items: [],
            })}
            startTrainingWithSymbol={noopAsync}
            dismissLocalDataSourceSyncPreview={noop}
            selectLocalDataSourceSyncPreviewPlan={noop}
            confirmLocalDataSourceSyncPreview={noopAsync}
            syncSamplePoolWithSourceFolder={noopAsync}
            removeSymbolsFromSamplePool={async () => false}
            updateDataSourceSyncPreference={noop}
            runDataSourceSyncQuickCheckSweep={noopAsync}
            refreshLocalDataSources={noopAsync}
            setEditingSamplePoolName={noop}
            saveRenameSamplePool={noop}
            cancelRenameSamplePool={noop}
            startRenameSamplePool={noop}
            moveCustomPoolWithinTimeframe={noop}
            removeCustomPool={noopAsync}
            portableRebindTargetSourceIds={[]}
            openDeviceTransferSettings={noop}
            removedSymbolsByPool={{}}
            setRemovedSymbolsByPool={noop as never}
          />
        </div>
      );
    case "DATA_ACQUISITION":
      return (
        <PreviewMarketDataAcquisition
          formatStorageBytes={formatStorageBytes}
          locale={locale}
          scenario={requestedScenario}
          tt={tt as (key: string) => string}
          ttf={ttf as (key: string, values?: Array<unknown>) => string}
        />
      );
    case "DATA_IMPORT_MODAL":
    case "DATA_IMPORT_MODAL_ERROR":
      return (
        <AppCsvMappingModal
          presentation="window"
          pendingImport={previewCsvPendingImport}
          pendingFieldMapping={previewCsvFieldMapping}
          pendingPlanConfigRows={previewCsvPlanConfigRows}
          tt={tt}
          ttf={ttf}
          pendingImportTimeZone="Asia/Shanghai"
          pendingImportTimeZoneMode="AUTO"
          pendingImportTimeZoneConfirmed={true}
          pendingImportScopeStrategy="FLAT"
          importReadinessSummaryText={tt("appText.ready")}
          availableTimeZones={[
            "Asia/Shanghai",
            "Asia/Hong_Kong",
            "America/New_York",
          ]}
          isPreparingCsvImportPreview={false}
          csvFieldLabels={previewCsvFieldLabels}
          baseTimeframeLabels={previewCsvBaseTimeframeLabels}
          onPendingImportTimeZoneChange={noop}
          onConfirmPendingImportTimeZone={noop}
          onResetPendingImportTimeZoneRecommendation={noop}
          onPendingImportTradingCalendarChange={noop}
          onResetPendingImportTradingCalendarRecommendation={noop}
          onPendingImportScopeStrategyChange={noop}
          onUpdatePendingCsvTimestampMode={noop}
          onUpdatePendingCsvMapping={noop}
          onPendingPlanPoolNameChange={noop}
          onPendingPlanSourceIdChange={noop}
          onCancelPendingCsvImport={noop}
          onConfirmPendingCsvImport={noop}
        />
      );
    case "SETTINGS":
    case "SETTINGS_GENERAL":
    case "SETTINGS_DATA_TRANSFER":
    case "SETTINGS_SIMULATION":
    case "SETTINGS_ABOUT":
    case "SETTINGS_ADVANCED":
    case "SETTINGS_BLOCKED":
      return (
        <SystemSettingsWorkspacePage
          isActive
          requestedTab={
            page === "SETTINGS_DATA_TRANSFER"
              ? "DATA_TRANSFER"
              : page === "SETTINGS_SIMULATION"
                ? "SIMULATION"
                : page === "SETTINGS_ABOUT" || page === "SETTINGS_BLOCKED"
                  ? "ABOUT"
                  : page === "SETTINGS_ADVANCED"
                    ? "ADVANCED"
                    : page === "SETTINGS_GENERAL"
                      ? "GENERAL"
                      : null
          }
          tt={tt}
          ui={{
            language: labels.language,
            lightMode: labels.lightMode,
            darkMode: labels.darkMode,
            followSystem: labels.followSystem,
            greenUpRedDown: labels.greenUpRedDown,
            redUpGreenDown: labels.redUpGreenDown,
            tradeColorTheme: labels.tradeColorTheme,
            tradeColorThemeInstitutional: labels.tradeColorThemeInstitutional,
            tradeColorThemeCrypto: labels.tradeColorThemeCrypto,
            tradeColorThemeAccessible: labels.tradeColorThemeAccessible,
          }}
          activeLanguageLabel={
            languageOptions.find(
              (item: { key: string; label: string }) => item.key === language,
            )?.label ?? language
          }
          activeFontSizeLabel={fontSizePresetOptions[1]?.label ?? ""}
          activeThemeLabel={
            requestedTheme === "dark" ? labels.darkMode : labels.lightMode
          }
          language={language}
          fontSizePreset="STANDARD"
          themeMode={requestedTheme}
          desktopCloseButtonAction="ASK"
          priceColorMode="RED_UP_GREEN_DOWN"
          tradeColorTheme="INSTITUTIONAL"
          showGlobalDecimals={true}
          developerModeEnabled={
            page === "SETTINGS_ADVANCED" || page === "SETTINGS_SIMULATION"
          }
          isSystemStorageUsageLoading={false}
          isBusy={false}
          isPreparingAction={false}
          isGlobalResetProgressVisible={false}
          globalResetProgressLabel=""
          globalResetProgressPercent={0}
          storageUsageTotalText={formatStorageBytes(5_954_000_000)}
          storageUsageRows={[
            { key: "system", label: tt("appText.system"), bytes: 42_000_000 },
            {
              key: "kline",
              label: tt("appText.lineData"),
              bytes: 3_540_000_000,
            },
            {
              key: "training",
              label: tt("appText.trainingData"),
              bytes: 1_920_000_000,
            },
            {
              key: "notes",
              label: tt("appText.notesData"),
              bytes: 148_000_000,
            },
            {
              key: "stats",
              label: tt("appText.statsData"),
              bytes: 196_000_000,
            },
            { key: "other", label: tt("appText.other2"), bytes: 108_000_000 },
          ]}
          languageOptions={languageOptions}
          fontSizePresetOptions={fontSizePresetOptions}
          setCurrentUiLanguage={noopAsync}
          setLanguage={noop}
          setFontSizePreset={noop}
          setThemeMode={noop}
          setDesktopCloseButtonAction={noop}
          setPriceColorMode={noop}
          setTradeColorTheme={noop}
          setShowGlobalDecimals={noop}
          refreshSystemStorageUsage={noopAsync}
          onRequestGlobalReset={noop}
          onEnableDeveloperMode={noop}
          globalResetStorageTotalText={formatStorageBytes(5_954_000_000)}
          isGlobalResetStorageSummaryReady={true}
          globalResetStorageRows={[
            {
              key: "kline",
              label: tt("appText.lineData"),
              bytes: 3_540_000_000,
              valueText: formatStorageBytes(3_540_000_000),
              percent: 59.5,
              progressPercent: 59.5,
              sortOrder: 1,
            },
            {
              key: "training",
              label: tt("appText.trainingData"),
              bytes: 1_920_000_000,
              valueText: formatStorageBytes(1_920_000_000),
              percent: 32.2,
              progressPercent: 32.2,
              sortOrder: 2,
            },
            {
              key: "stats",
              label: tt("appText.statsData"),
              bytes: 196_000_000,
              valueText: formatStorageBytes(196_000_000),
              percent: 3.3,
              progressPercent: 3.3,
              sortOrder: 4,
            },
            {
              key: "notes",
              label: tt("appText.notesData"),
              bytes: 148_000_000,
              valueText: formatStorageBytes(148_000_000),
              percent: 2.5,
              progressPercent: 2.5,
              sortOrder: 3,
            },
            {
              key: "other",
              label: tt("appText.other2"),
              bytes: 108_000_000,
              valueText: formatStorageBytes(108_000_000),
              percent: 1.8,
              progressPercent: 1.8,
              sortOrder: 5,
            },
            {
              key: "system",
              label: tt("appText.system"),
              bytes: 42_000_000,
              valueText: formatStorageBytes(42_000_000),
              percent: 0.7,
              progressPercent: 0.7,
              sortOrder: 0,
            },
          ]}
          globalResetAffectedPoolCount={2}
          globalResetAffectedSymbolCount={6}
          openDataWorkspaceForPortableRebind={noop}
          withLabelValue={(label, value) =>
            formatLabelValueText(language, label, value)
          }
          formatStorageBytes={formatStorageBytes}
          devSimulationInput={{}}
        />
      );
    default:
      return null;
  }
};
