// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMonitorEntry } from "../../src/domains/data-import/dataSourceTypes";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadLocaleCatalog } from "@zinuto/shared/i18n";

import {
  areDetailFocusMarkersEqual,
  createDetailFocusMarker,
  type CsvImportCardView,
  type HallSectionItem,
  type PoolSettingsRow,
} from "../../src/workspaces/data/dataConfig/model";
import {
  resolveHallSummaryStatus,
  type DataConfigCopy,
} from "../../src/workspaces/data/dataConfig/hallStatusReadModelAdapter";
import { buildHallSections } from "../../src/workspaces/data/dataConfig/hallSectionsBuilder";
import {
  buildDataConfigInstrumentMetadataBySymbolAndTimeframe,
  readDataConfigSystemPoolInstrumentFacts,
} from "../../src/workspaces/data/useDataConfigWorkspaceViewModel";
import {
  areNumericRecordValuesEqual,
  buildCustomSamplePoolsSignature,
  buildLocalDataSourceSummariesSignature,
} from "../../src/domains/trainer/useTrainerBootstrapData";

const dataConfigSurfaceSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/DataConfigWorkspaceSurface.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigSurfaceViewSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/DataConfigWorkspaceSurfaceView.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigPoolCardsSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/DataConfigPoolCards.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigHallContentSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/DataConfigHallContent.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigManagementStylesSource = [
  "data-config-management.layer-01.css",
  "data-config-management.layer-02.css",
]
  .map((fileName) =>
    readFileSync(
      new URL(`../../src/workspaces/data/dataConfig/${fileName}`, import.meta.url),
      "utf8",
    ),
  )
  .join("\n");
const appCsvMappingModalSource = readFileSync(
  new URL("../../src/app-shell/AppCsvMappingModal.tsx", import.meta.url),
  "utf8",
);
const trainerCustomPoolManagerSource = readFileSync(
  new URL(
    "../../src/domains/trainer/useTrainerCustomPoolManager.ts",
    import.meta.url,
  ),
  "utf8",
);
const marketDataAcquisitionTriggerSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionTriggerSection.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigCopyAndProgressSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/useDataConfigCopyAndProgress.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigDetailProjectionSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/useDataConfigDetailProjection.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigSourceStateSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/useDataConfigSourceState.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigDetailActionsSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/useDataConfigDetailActions.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigCardReorderSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/useDataConfigCardReorder.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataConfigViewSource = [
  dataConfigSurfaceSource,
  dataConfigSurfaceViewSource,
  dataConfigPoolCardsSource,
  dataConfigHallContentSource,
  dataConfigCopyAndProgressSource,
  dataConfigDetailProjectionSource,
  dataConfigSourceStateSource,
  dataConfigDetailActionsSource,
  dataConfigCardReorderSource,
].join("\n");
const dataConfigDetailDrawerSource = readFileSync(
  new URL(
    "../../src/workspaces/data/DataConfigDetailDrawer.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataSourceMaintenanceActionsSource = readFileSync(
  new URL(
    "../../src/app-shell/useAppDataSourceMaintenanceActions.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataSourceSyncPreviewActionsSource = readFileSync(
  new URL(
    "../../src/app-shell/dataSourceSyncPreviewActionRuntime.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataSourceSyncMonitorControllerSource = readFileSync(
  new URL(
    "../../src/app-shell/useDataSourceSyncMonitorController.ts",
    import.meta.url,
  ),
  "utf8",
);
const csvImportWorkflowSource = readFileSync(
  new URL(
    "../../src/domains/data-import/useCsvImportWorkflow.ts",
    import.meta.url,
  ),
  "utf8",
);
const csvImportJobFinalizationSource = readFileSync(
  new URL(
    "../../src/domains/data-import/useCsvImportJobFinalization.ts",
    import.meta.url,
  ),
  "utf8",
);
const dataSettingsMessagesSource = JSON.stringify(
  loadLocaleCatalog("en"),
);
const historyReplayChartSource = readFileSync(
  new URL("../../src/domains/chart/HistoryReplayChart.tsx", import.meta.url),
  "utf8",
);
const csvImportControllerSource = readFileSync(
  new URL("../../src/domains/data-import/useCsvImportController.ts", import.meta.url),
  "utf8",
);

const dataConfigCopyForStatus: DataConfigCopy = {
  importTask: "Import task",
  viewDetails: "View details",
  retry: "Retry",
  syncing: "Syncing",
  syncingHint: "Syncing data",
  errorsFailedHint: "Sync failed",
  errorFailed: "Failed",
  lightweightCheckFailed: "Check failed",
  changesDetected: "Changes detected",
  confirmationRequired: "Confirmation required",
  previewBeforeSync: "Preview before sync",
  sync: "Sync",
  estimatedChangedFiles: (value) => `${value} changed files`,
  confirmationNeeded: "Confirmation needed",
  autoSyncArmed: "Auto sync armed",
  sourceFolderChanged: "Source folder changed",
  rebindRequired: "Rebind required",
  rebindRequiredHint: "Rebind the folder",
  rebindActionLabel: "Rebind",
  pendingChanges: "Pending changes",
  checking: "Checking",
  checkingHint: "Checking changes",
  autoSyncEnabled: "Auto sync enabled",
  promptOnlyHint: "Prompt before syncing",
  syncedAuto: "Synced automatically",
  syncedAutoHint: "No changes",
  noChangesHint: "No changes",
  manualCheckHint: "Manual check",
  manualMode: "Manual",
  readOnly: "Read only",
  readOnlyHint: "Read only source",
  symbols: "Symbols",
  lastChecked: (value) => `Last checked ${value}`,
};

const buildStatusPool = (
  overrides: Partial<PoolSettingsRow> = {},
): PoolSettingsRow => ({
  id: "source-1",
  name: "Local Source",
  sourceFolder: "/source",
  importScopeStrategy: "FLAT",
  importScopeTopLevelSubfolder: "",
  timeZone: "America/New_York",
  timeZoneOrigin: "USER_SELECTED",
  tradingCalendar: {} as PoolSettingsRow["tradingCalendar"],
  symbols: ["AAPL"],
  symbolCount: 1,
  barCount: 120,
  symbolBarCountBySymbol: { AAPL: 120 },
  symbolInstrumentIdBySymbol: { AAPL: "instrument-aapl" },
  symbolTimeRangeBySymbol: {
    AAPL: {
      timeStartTs: "2026-01-01T00:00:00.000Z",
      timeEndTs: "2026-01-02T00:00:00.000Z",
    },
  },
  timeStartTs: "2026-01-01T00:00:00.000Z",
  timeEndTs: "2026-01-02T00:00:00.000Z",
  lastSyncedAt: "2026-01-02T00:00:00.000Z",
  storageBytes: 1024,
  csvFieldMapping: {
    timestampMode: "SINGLE",
    date: "datetime",
    time: "",
    open: "open",
    high: "high",
    low: "low",
    close: "close",
    volume: "volume",
  },
  baseTimeframe: "1d",
  selected: false,
  status: "READY",
  isSystem: false,
  requiresSourceFolderRebind: false,
  sourceLocked: false,
  unlockedSymbols: ["AAPL"],
  lockedSymbols: [],
  lockedSymbolCount: 0,
  lockReason: null,
  ...overrides,
});

const buildReadyStatusItem = (
  pool: PoolSettingsRow = buildStatusPool(),
): HallSectionItem => ({
  id: pool.id,
  type: "READY",
  pool,
  compactTitle: pool.name,
});

const buildImportStatusItem = (
  overrides: Partial<CsvImportCardView> = {},
): HallSectionItem => ({
  id: "import-1",
  type: "IMPORT",
  bridgedReadyPool: buildStatusPool(),
  compactTitle: "Local Source",
  card: {
    id: "import-1",
    poolName: "Local Source",
    sourceId: "source-1",
    sourceFolder: "/source",
    timeZone: "America/New_York",
    baseTimeframe: "1d",
    phase: "IMPORTING",
    jobId: "job-1",
    cancelRequested: false,
    isPaused: false,
    progressLabelText: "42 / 100",
    importProgressPercent: 42,
    shouldShowCompactProgress: false,
    compactProgressLabelText: "Compacting",
    compactProgressDisplayPercent: 0,
    compactSizeSummaryText: "",
    compactEffectText: "",
    skippedRowsLabelText: "",
    errorMessage: "",
    totalFiles: 100,
    ...overrides,
  },
});

const buildMonitorEntry = (
  overrides: Partial<DataSourceSyncMonitorEntry> = {},
): DataSourceSyncMonitorEntry => ({
  sourceId: "source-1",
  status: "IDLE",
  mode: "PROMPT",
  quickCheckStatus: null,
  reasonCode: "",
  checkedAt: null,
  estimatedChangedFiles: 0,
  estimatedChangedSymbols: 0,
  missingSymbolsRetained: [],
  changedSymbols: [],
  invalidFiles: 0,
  symbolLimit: {
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols: [],
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  },
  lastError: null,
  autoSyncArmed: false,
  operationProgress: null,
  ...overrides,
});

const buildSignatureLocalDataSource = (
  overrides: Record<string, unknown> = {},
) =>
  ({
    id: "source-1",
    samplePoolId: "source-1",
    name: "Local Source",
    status: "READY",
    sourceFolder: "/source",
    sourceFolderBookmarkId: "bookmark-1",
    importScopeStrategy: "FLAT",
    importScopeTopLevelSubfolder: "",
    timeZone: "America/New_York",
    timeZoneOrigin: "USER_SELECTED",
    baseTimeframe: "1d",
    tradingCalendar: { tradingDays: [1, 2, 3, 4, 5], sessions: [] },
    diagnosticProfile: {
      assetClass: "STOCK",
      marketPresetId: "US_STOCK",
      profileOrigin: "USER",
    },
    fieldMapping: {
      timestampMode: "SINGLE",
      date: "datetime",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "volume",
    },
    symbols: ["AAPL"],
    unlockedSymbols: ["AAPL"],
    lockedSymbols: [],
    lockedSymbolCount: 0,
    lockReason: null,
    sourceLocked: false,
    requiresSourceFolderRebind: false,
    symbolCount: 1,
    barCount: 120,
    storageBytes: 1024,
    totalFiles: 1,
    importedFiles: 1,
    failedFiles: 0,
    timeStartTs: "2026-01-01T00:00:00.000Z",
    timeEndTs: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lastJob: {
      id: "job-1",
      status: "SUCCESS",
      stage: "DONE",
      progressPercent: 100,
      compactProgressPercent: 100,
      compactBeforeBytes: 1024,
      compactAfterBytes: 1024,
      compactReclaimedBytes: 0,
      doneFiles: 1,
      totalFiles: 1,
      errorFiles: 0,
      startedAt: "2026-01-02T00:00:00.000Z",
      finishedAt: "2026-01-02T00:00:00.000Z",
    },
    instruments: [
      {
        instrumentId: "instrument-aapl",
        samplePoolId: "source-1",
        symbol: "AAPL",
        displayLabel: "AAPL",
        baseTimeframe: "1d",
        sourceTimeframe: "1d",
        scopeKind: "LOCAL",
        sourceId: "source-1",
        sourceName: "Local Source",
        barCount: 120,
        timeStartTs: "2026-01-01T00:00:00.000Z",
        timeEndTs: "2026-01-02T00:00:00.000Z",
      },
    ],
    symbolStats: [
      {
        instrumentId: "instrument-aapl",
        symbol: "AAPL",
        displayLabel: "AAPL",
        barCount: 120,
        timeStartTs: "2026-01-01T00:00:00.000Z",
        timeEndTs: "2026-01-02T00:00:00.000Z",
      },
    ],
    ...overrides,
  }) as Parameters<typeof buildLocalDataSourceSummariesSignature>[0][number];

const buildSignatureCustomSamplePool = (
  overrides: Record<string, unknown> = {},
) =>
  ({
    id: "source-1",
    name: "Local Source",
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
    sourceFolder: "/source",
    sourceFolderBookmarkId: "bookmark-1",
    importScopeStrategy: "FLAT",
    importScopeTopLevelSubfolder: "",
    instruments: [
      {
        instrumentId: "instrument-aapl",
        samplePoolId: "source-1",
        symbol: "AAPL",
        displayLabel: "AAPL",
        sourceTimeframe: "1d",
        barCount: 120,
      },
    ],
    symbols: ["AAPL"],
    sourceLocked: false,
    unlockedSymbols: ["AAPL"],
    lockedSymbols: [],
    lockedSymbolCount: 0,
    lockReason: null,
    fileCount: 1,
    storageBytes: 1024,
    csvFieldMapping: {
      timestampMode: "SINGLE",
      date: "datetime",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "volume",
    },
    tradingCalendar: { tradingDays: [1, 2, 3, 4, 5], sessions: [] },
    baseTimeframe: "1d",
    selected: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  }) as Parameters<typeof buildCustomSamplePoolsSignature>[0][number];

const resolveStatusForItem = (
  item: HallSectionItem,
  monitor: DataSourceSyncMonitorEntry | null = null,
  readModelSourceStatusById: Parameters<
    typeof resolveHallSummaryStatus
  >[0]["readModelSourceStatusById"] = undefined,
) =>
  resolveHallSummaryStatus({
    dataConfigCopy: dataConfigCopyForStatus,
    dataSourceSyncMonitorStateById: monitor ? { [monitor.sourceId]: monitor } : {},
    dataSourceSyncPrefsById: { "source-1": { mode: "PROMPT" } },
    formatLocalizedDateTime: (value) => value || "--",
    formatMoney: (value) => String(value),
    itemOperationBlocked: false,
    item,
    readModelSourceStatusById,
    tt: (key) => key,
  });

test("data config system pool summary uses instrument metadata for time ranges", () => {
  const metadataByKey = buildDataConfigInstrumentMetadataBySymbolAndTimeframe([
    {
      id: "instrument-aapl-1d",
      symbol: "AAPL",
      baseTimeframe: "1d",
      barCount: 9400,
      timeStartTs: "1980-12-12T05:00:00.000Z",
      timeEndTs: "2018-03-27T04:00:00.000Z",
    },
    {
      id: "instrument-msft-1d",
      symbol: "MSFT",
      baseTimeframe: "1d",
      barCount: 8200,
      timeStartTs: "1986-03-13T05:00:00.000Z",
      timeEndTs: "2018-03-26T04:00:00.000Z",
    },
  ]);

  const summary = readDataConfigSystemPoolInstrumentFacts({
    symbols: ["AAPL", "MSFT"],
    baseTimeframe: "1d",
    metadataBySymbolAndTimeframe: metadataByKey,
  });

  assert.equal(summary.barCount, 17600);
  assert.equal(summary.symbolInstrumentIdBySymbol.AAPL, "instrument-aapl-1d");
  assert.deepEqual(summary.symbolTimeRangeBySymbol.AAPL, {
    timeStartTs: "1980-12-12T05:00:00.000Z",
    timeEndTs: "2018-03-27T04:00:00.000Z",
  });
  assert.equal(summary.timeStartTs, "1980-12-12T05:00:00.000Z");
  assert.equal(summary.timeEndTs, "2018-03-27T04:00:00.000Z");
});

test("data config system pool facts require backend instrument metadata", () => {
  const summary = readDataConfigSystemPoolInstrumentFacts({
    symbols: ["AAPL"],
    baseTimeframe: "1d",
    metadataBySymbolAndTimeframe: buildDataConfigInstrumentMetadataBySymbolAndTimeframe([]),
  });

  assert.equal(summary.barCount, 0);
  assert.equal(summary.symbolInstrumentIdBySymbol.AAPL, "");
  assert.equal(summary.symbolBarCountBySymbol.AAPL, 0);
  assert.deepEqual(summary.symbolTimeRangeBySymbol.AAPL, {
    timeStartTs: null,
    timeEndTs: null,
  });
  assert.equal(summary.timeStartTs, null);
  assert.equal(summary.timeEndTs, null);
});

test("data config import entry opens local import directly", () => {
  const startImportEntryStart = dataConfigViewSource.indexOf(
    "  const startLocalDataImportEntry = useCallback(",
  );
  assert.notEqual(startImportEntryStart, -1);
  const startImportEntryEnd = dataConfigViewSource.indexOf(
    "  const onDropZoneDragEnter",
    startImportEntryStart,
  );
  assert.notEqual(startImportEntryEnd, -1);
  const startImportEntrySource = dataConfigViewSource.slice(
    startImportEntryStart,
    startImportEntryEnd,
  );

  assert.match(startImportEntrySource, /openCsvFolderPickerAndPrepareImport\(\)/);
  assert.match(startImportEntrySource, /normalizeNativeImportDirectoryPath\(folderPath \?\? ""\)/);
  assert.doesNotMatch(startImportEntrySource, /String\(folderPath \|\| ""\)\.trim\(\)/);
  assert.match(startImportEntrySource, /openImport\(\)/);
  assert.doesNotMatch(startImportEntrySource, /account|membership|entitlement|upgrade/iu);
});

test("data source detail trading calendar uses single-row delete copy", () => {
  assert.match(dataConfigViewSource, /delete: tt\("appText\.delete2"\)/);
  assert.doesNotMatch(dataConfigViewSource, /delete: tt\("appText\.delete"\)/);
  assert.match(dataConfigDetailDrawerSource, /payload\.labels\.delete/);
  assert.match(dataConfigViewSource, /baseTimeframe: detailPool\.baseTimeframe/);
  assert.match(dataConfigDetailDrawerSource, /payload\.pool\.baseTimeframe/);
  assert.match(dataConfigDetailDrawerSource, /formatTradingSessionEndMinute\(session, payload\.pool\.baseTimeframe\)/);
  assert.match(dataConfigViewSource, /tradingCalendarTimeframeAlignmentInvalid: tt\(/);
  assert.match(
    dataConfigDetailDrawerSource,
    /isDailyTradingCalendarTimeframe\(\s*payload\.pool\.baseTimeframe,?\s*\)/,
  );
  assert.doesNotMatch(dataConfigDetailDrawerSource, /isTradingCalendarValidForSubmit/);
  assert.match(dataConfigDetailDrawerSource, /Boolean\(tradingCalendarSessionErrorText\)/);
  assert.match(dataConfigViewSource, /TIMEFRAME_MISALIGNED_BAR: "appText\.diagnosticCodeTimeframeMisalignedBar"/);
});

test("data import preview progress uses real job counts instead of the old fake 92 percent ceiling", () => {
  assert.doesNotMatch(csvImportControllerSource, /setInterval/);
  assert.doesNotMatch(csvImportControllerSource, /92/);
  assert.match(csvImportControllerSource, /updateCsvImportPreviewProgress/);
  assert.match(dataConfigViewSource, /preparingPreviewProgressCountLabel/);
  assert.match(dataConfigViewSource, /appText\.progressValue0Value1/);
  assert.match(dataConfigViewSource, /hasPreparingPreviewPercent \? \(/);
});

test("data config source operation statuses expose real progress view models only while active", () => {
  const checkingStatus = resolveStatusForItem(
    buildReadyStatusItem(),
    buildMonitorEntry({
      status: "CHECKING",
      operationProgress: {
        label: "Checking",
        progressPercent: 37,
        active: true,
        tone: "checking",
      },
    }),
  );

  assert.equal(checkingStatus.statusTone, "checking");
  assert.equal(checkingStatus.progressActive, true);
  assert.equal(checkingStatus.progressLabel, "Checking");
  assert.equal(checkingStatus.progressPercent, 37);
  assert.equal(checkingStatus.progressTone, "checking");

  const syncingStatus = resolveStatusForItem(
    buildReadyStatusItem(),
    buildMonitorEntry({
      status: "SYNCING",
      operationProgress: {
        label: "Syncing",
        progressPercent: null,
        active: true,
        tone: "syncing",
      },
    }),
  );

  assert.equal(syncingStatus.summaryFilter, "SYNCING");
  assert.equal(syncingStatus.progressActive, true);
  assert.equal(syncingStatus.progressLabel, "Syncing");
  assert.equal(syncingStatus.progressPercent, null);
  assert.equal(syncingStatus.progressTone, "syncing");

  const idleStatus = resolveStatusForItem(buildReadyStatusItem());
  assert.equal(idleStatus.progressActive, undefined);
  assert.equal(idleStatus.progressLabel, undefined);
  assert.equal(idleStatus.progressPercent, undefined);
});

test("data config source status consumes local-api read model source facts", () => {
  const rebindStatus = resolveStatusForItem(
    buildReadyStatusItem(),
    null,
    {
      "source-1": {
        statusCode: "REBIND_REQUIRED",
        reasonCode: "LOCAL_DATA_SOURCE_FOLDER_REBIND_REQUIRED",
      },
    },
  );

  assert.equal(rebindStatus.statusTone, "warning");
  assert.equal(rebindStatus.statusLabel, "Rebind required");
  assert.equal(rebindStatus.primaryActionLabel, "Rebind");

  const failedStatus = resolveStatusForItem(
    buildReadyStatusItem(),
    null,
    {
      "source-1": {
        statusCode: "FAILED",
        reasonCode: "LOCAL_DATA_SOURCE_IMPORT_FAILED",
      },
    },
  );

  assert.equal(failedStatus.statusTone, "danger");
  assert.equal(failedStatus.statusLabel, "Failed");
  assert.equal(failedStatus.summaryFilter, "ERROR");
});

test("data config detail window surfaces trading calendar save failures in place", () => {
  assert.match(dataConfigViewSource, /operationErrorText: detailOperationErrorText/);
  assert.match(
    dataConfigViewSource,
    /setDetailOperationErrorText\(formatDetailOperationError\(error\)\)/,
  );
  assert.doesNotMatch(dataConfigViewSource, /trading calendar update failed/);
  assert.match(dataConfigDetailDrawerSource, /payload\.operationErrorText/);
  assert.match(dataConfigDetailDrawerSource, /role="alert"/);
});

test("data config import cards keep existing job progress view model", () => {
  const importingStatus = resolveStatusForItem(buildImportStatusItem());

  assert.equal(importingStatus.summaryFilter, "SYNCING");
  assert.equal(importingStatus.progressActive, true);
  assert.equal(importingStatus.progressLabel, "42 / 100");
  assert.equal(importingStatus.progressPercent, 42);
  assert.equal(importingStatus.progressTone, "syncing");

  const finalizingStatus = resolveStatusForItem(
    buildImportStatusItem({
      phase: "FINALIZING",
      progressLabelText: "Finalizing",
      importProgressPercent: 100,
      compactProgressLabelText: "Compacting 50%",
      compactProgressDisplayPercent: 50,
    }),
  );

  assert.equal(finalizingStatus.progressActive, true);
  assert.equal(finalizingStatus.progressLabel, "Compacting 50%");
  assert.equal(finalizingStatus.progressPercent, 50);
});

test("data cards render task progress rails for source, delete, diagnostics, and chart loading", () => {
  assert.match(dataConfigViewSource, /renderDataTaskProgressRail/);
  assert.match(
    dataConfigViewSource,
    /preparingLocalDataSourceSyncPreview[\s\S]{0,120}operationProgress/,
  );
  assert.match(dataConfigViewSource, /data-asset-card-progress-panel-inline/);
  assert.match(dataConfigViewSource, /deletingProgressLabel/);
  assert.match(dataConfigViewSource, /normalizedClearingLocalDataSourcesProgressPercent/);
  assert.match(dataConfigViewSource, /appText\.clearLocalSamplePools/);
  assert.match(dataConfigDetailDrawerSource, /payload\.operationProgress/);
  assert.match(dataConfigDetailDrawerSource, /createIndeterminateProgress/);
  assert.match(
    dataConfigDetailDrawerSource,
    /isLoadingSourceDiagnostics[\s\S]{0,500}<DataTaskProgressRail/,
  );
  assert.equal(
    dataConfigDetailDrawerSource.match(
      /payload\.sourceDiagnostics\s*\.isLoadingSourceDiagnostics\s*\?\s*\(/g,
    )?.length ?? 0,
    1,
  );
  assert.match(
    dataConfigDetailDrawerSource,
    /isLoadingSymbolBars[\s\S]{0,500}<DataTaskProgressRail/,
  );
});

test("manual change checks keep a clean result visible long enough to read", () => {
  assert.match(
    dataSourceSyncMonitorControllerSource,
    /DATA_SYNC_USER_CHECK_MIN_VISIBLE_MS = 1_500/,
  );
  assert.match(
    dataSourceSyncMonitorControllerSource,
    /quickCheck\.status === 'NO_CHANGES'[\s\S]{0,100}options\?\.trigger === 'USER'[\s\S]{0,220}waitForMinimumVisibleDuration/,
  );
  assert.match(
    dataSourceSyncMonitorControllerSource,
    /globalThis\.setTimeout\(resolve, remainingDurationMs\)/,
  );
});

test("clear local sample pools uses a persistent inline destructive review", () => {
  assert.match(
    dataConfigHallContentSource,
    /armClearLocalSources[\s\S]{0,220}setArmedKey\(clearLocalPoolsActionKey\)/,
  );
  assert.match(
    dataConfigHallContentSource,
    /confirmClearLocalSources[\s\S]{0,180}clearArmedAction\(\)[\s\S]{0,80}onClearLocalPools\(\)/,
  );
  assert.match(
    dataConfigHallContentSource,
    /data-config-clear-review/,
  );
  assert.match(
    dataConfigHallContentSource,
    /clearLocalSamplePoolsArmed/,
  );
  assert.match(
    dataConfigHallContentSource,
    /clearLocalSamplePools/,
  );
  assert.match(
    dataConfigHallContentSource,
    /preventLocalSourceMutationDuringClearReview[\s\S]{0,160}event\.preventDefault\(\)[\s\S]{0,80}event\.stopPropagation\(\)/,
  );
  assert.match(
    dataConfigHallContentSource,
    /onDrop={[\s\S]{0,180}clearLocalPoolsArmed[\s\S]{0,180}preventLocalSourceMutationDuringClearReview/,
  );
  assert.match(
    dataConfigViewSource,
    /isLocalClearReview[\s\S]{0,240}is-clear-review/,
  );
  assert.match(
    dataConfigManagementStylesSource,
    /data-config-clear-review-pulse var\(--motion-loop-shimmer\)[\s\S]{0,80}var\(--motion-loop-iteration-count\)/,
  );
  assert.match(
    dataConfigManagementStylesSource,
    /prefers-reduced-motion: reduce/,
  );
});

test("sample-pool names show the shared character limit without rewriting legacy names", () => {
  assert.match(
    appCsvMappingModalSource,
    /csv-preview-summary-pool-name-count/,
  );
  assert.match(
    appCsvMappingModalSource,
    /poolNameCharacterCount[\s\S]{0,220}INPUT_LIMITS\.samplePoolNameChars/,
  );
  assert.match(
    dataConfigViewSource,
    /data-asset-card-name-count/,
  );
  assert.match(
    dataConfigViewSource,
    /editingSamplePoolNameCharacterCountText[\s\S]{0,220}INPUT_LIMITS\.samplePoolNameChars/,
  );
  assert.match(
    dataConfigPoolCardsSource,
    /const focusPoolNameInputAfterMenuClose[\s\S]{0,360}window\.requestAnimationFrame[\s\S]{0,160}input\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(
    dataConfigPoolCardsSource,
    /<Input[\s\S]{0,160}ref=\{focusPoolNameInputAfterMenuClose\}/,
  );
  assert.match(
    dataConfigPoolCardsSource,
    /onCloseAutoFocus=\{[\s\S]{0,360}renameInput[\s\S]{0,180}event\.preventDefault\(\)[\s\S]{0,180}focusPoolNameInputAfterMenuClose\(renameInput\)/,
  );
  assert.match(
    trainerCustomPoolManagerSource,
    /editingSamplePoolOriginalNameRef/,
  );
  assert.match(
    trainerCustomPoolManagerSource,
    /editingSamplePoolName !== editingSamplePoolOriginalNameRef\.current/,
  );
});

test("sample pool sync uses inline progress instead of the sync preview dialog", () => {
  assert.doesNotMatch(dataConfigViewSource, /LocalDataSourceSyncPreviewDialog/);
  assert.match(
    dataSourceSyncPreviewActionsSource,
    /setPreparingLocalDataSourceSyncPreview\(null\);\s*await runConfirmedLocalDataSourceSync\(previewState\);/,
  );
  assert.doesNotMatch(
    dataSourceSyncPreviewActionsSource,
    /setPendingLocalDataSourceSyncPreview\(previewState\)/,
  );
  assert.doesNotMatch(
    dataSourceMaintenanceActionsSource,
    /showNotice\(notice\.message,\s*notice\.title\)/,
  );
  assert.doesNotMatch(
    csvImportWorkflowSource,
    /showNotice\(notice\.message,\s*notice\.title\)/,
  );
  assert.doesNotMatch(
    dataSourceSyncMonitorControllerSource,
    /scopeCandidates\.length\s*!==\s*1/,
  );
  assert.doesNotMatch(
    dataSourceMaintenanceActionsSource,
    /scopeCandidates\[0\]/,
  );
  assert.doesNotMatch(
    dataSourceMaintenanceActionsSource,
    /matchedPreviewPlanId[\s\S]{0,120}\|\|[\s\S]{0,120}scopeCandidates/,
  );
});

test("csv import finalization does not mutate trainer sessions", () => {
  assert.doesNotMatch(csvImportJobFinalizationSource, /loadSymbol\s*\(/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /resetSymbolTraining/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /setBars(?:Offset|Total)?\s*\(/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /setSessionId\s*\(/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /setSnapshot\s*\(/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /setSelectedSymbol\s*\(/);
  assert.doesNotMatch(csvImportJobFinalizationSource, /setIsBusy\s*\(/);
});

test("data config empty state presents two primary paths without a mock promotion", () => {
  assert.match(dataConfigHallContentSource, /data-config-add-decision/);
  assert.match(dataConfigHallContentSource, /data-config-add-decision-options/);
  assert.match(
    dataConfigHallContentSource,
    /appText\.dataManagementAddDataTitle/,
  );
  assert.match(
    dataConfigHallContentSource,
    /data-onboarding-target="LOCAL_IMPORT_ENTRY"/,
  );
  assert.match(
    dataConfigHallContentSource,
    /presentation="decision"/,
  );
  assert.match(
    dataConfigHallContentSource,
    /presentation="toolbar"/,
  );
  assert.doesNotMatch(
    dataConfigHallContentSource,
    /data-config-import-drop-card/,
  );
  assert.doesNotMatch(dataConfigHallContentSource, /GRAPHIC_IMAGE_ASSET_URLS/);
  assert.doesNotMatch(dataConfigHallContentSource, /data-config-add-sample/);
  assert.doesNotMatch(dataConfigHallContentSource, /localImportMockSample/);
  assert.doesNotMatch(dataConfigCopyAndProgressSource, /localImportMockSample/);
  assert.doesNotMatch(dataConfigViewSource, /downloadLocalImportMockSample/);
  assert.match(
    marketDataAcquisitionTriggerSource,
    /data-onboarding-target="LOCAL_IMPORT_SAMPLE"/,
  );
  assert.match(
    marketDataAcquisitionTriggerSource,
    /data-config-acquisition-choice/,
  );
  assert.ok(
    dataSettingsMessagesSource.includes(
      "Format: csv recommended; also supports json / parquet / xlsx",
    ),
  );
  assert.ok(
    dataSettingsMessagesSource.includes(
      "Columns: datetime (or date + time), open, high, low, close are required; volume is optional and imports as 0 when missing",
    ),
  );
  assert.ok(
    dataSettingsMessagesSource.includes(
      "Sources: public data sites, brokers, or providers; confirm authorization and quality first, prefer adjusted history",
    ),
  );
  assert.equal(dataSettingsMessagesSource.includes("Download mock CSV folder"), false);
  assert.equal(dataSettingsMessagesSource.includes("fake CSV folder"), false);
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyAdjustedGuide/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyDataSourceGuidance/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyFieldDatetimeGuide/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyFieldOhlcGuide/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyFieldVolumeGuide/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyFormatGuide/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyFormatSupport/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /appText\.localImportEmptyQualityGuidance/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyAdjustedGuide/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyDataSourceGuidance/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyFieldDatetimeGuide/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyFieldOhlcGuide/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyFieldVolumeGuide/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyFormatGuide/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyFormatSupport/,
  );
  assert.doesNotMatch(
    dataSettingsMessagesSource,
    /localImportEmptyQualityGuidance/,
  );
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptyFieldGuide/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySchemaNote/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySyncModesGuide/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySyncAutoGuide/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySyncBoundary/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySyncPromptGuide/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptySyncRepairGuide/);
  assert.doesNotMatch(dataSettingsMessagesSource, /localImportEmptyExampleTitle/);
});

test("data management keeps active work in stable source rows", () => {
  assert.doesNotMatch(dataConfigSurfaceViewSource, /sortHallSectionItems/);
  assert.doesNotMatch(
    dataConfigSurfaceViewSource,
    /leftStatus\.priority|rightStatus\.priority/,
  );
  assert.match(dataConfigHallContentSource, /stableImportedSections/);
  assert.match(dataConfigHallContentSource, /latestImportCardsBySourceId/);
  assert.match(dataConfigHallContentSource, /provisionalImportCards/);
  assert.match(dataConfigHallContentSource, /seenPoolIds\.has\(stableItem\.pool\.id\)/);
  assert.match(
    dataConfigHallContentSource,
    /stableImportedItems\.reduce\([\s\S]*item\.pool\.symbolCount[\s\S]*item\.pool\.storageBytes/,
  );
  assert.doesNotMatch(
    dataConfigSurfaceViewSource,
    /importedHallSections\.reduce\(/,
  );
  assert.match(
    dataConfigHallContentSource,
    /item\.bridgedReadyPool[\s\S]{0,120}poolSettingsById\.get\(sourceId\)/,
  );
  assert.doesNotMatch(dataConfigHallContentSource, /data-config-task-section/);
  assert.doesNotMatch(dataConfigHallContentSource, /activeReadyTaskItems/);
  assert.match(dataConfigHallContentSource, /renderImportedSourceList/);
  assert.match(dataConfigHallContentSource, /systemDataExpanded/);
  assert.match(
    dataConfigHallContentSource,
    /shouldShowSystemData = !hasLocalSources \|\| systemDataExpanded/,
  );
  assert.match(dataConfigPoolCardsSource, /data-config-source-row/);
  assert.match(dataConfigPoolCardsSource, /data-config-source-card-operation/);
  assert.match(dataConfigPoolCardsSource, /data-config-source-card-coverage-band/);
  assert.match(dataConfigPoolCardsSource, /data-card-navigable/);
  assert.match(dataConfigPoolCardsSource, /openReadyPoolDetails/);
  assert.match(dataConfigPoolCardsSource, /shouldIgnoreReadyPoolCardNavigation/);
  assert.match(dataConfigPoolCardsSource, /data-no-card-navigation/);
  assert.doesNotMatch(dataConfigPoolCardsSource, /data-config-source-card-open-surface/);
  assert.match(dataConfigPoolCardsSource, /data-config-source-card-drag-handle/);
  assert.match(dataConfigPoolCardsSource, /resolveSourceFolderTail/);
  assert.match(dataConfigPoolCardsSource, /completedImportNeedsStateCleanup/);
  assert.match(dataConfigPoolCardsSource, /controlCsvImportCardJob\(importCard\.id, "CANCEL"\)/);
  assert.match(
    dataConfigPoolCardsSource,
    /!pool\.isSystem[\s\S]{0,120}!disabledCard/,
  );
  assert.doesNotMatch(dataConfigPoolCardsSource, /<ContextMenu/);
  assert.doesNotMatch(dataConfigPoolCardsSource, /onContextMenu=\{\(\) =>/);
  assert.match(dataConfigPoolCardsSource, /runPrimarySourceAction/);
  assert.match(dataConfigPoolCardsSource, /data-config-source-card-detail-affordance/);
  assert.match(dataConfigHallContentSource, /data-config-precheck-inline/);
  assert.match(
    dataConfigCopyAndProgressSource,
    /preparingPreviewProgressCountLabel \? \([\s\S]*data-config-import-drop-hint/,
  );
});

test("data management bridges an importing pool into its stable source slot", () => {
  const pool = buildStatusPool({ status: "IMPORTING" });
  const importItem = buildImportStatusItem({
    id: "import-existing",
    sourceId: pool.id,
  });
  if (importItem.type !== "IMPORT") {
    assert.fail("expected import fixture");
  }
  const sections = buildHallSections({
    baseTimeframeLabels: {
      "1m": "1 minute",
      "5m": "5 minutes",
      "1h": "1 hour",
      "1d": "1 day",
    },
    csvImportCardViews: [importItem.card],
    poolSettingsById: new Map([[pool.id, pool]]),
    poolSettingsRows: [pool],
  });
  const builtItem = sections.flatMap((section) => section.items)[0];

  assert.equal(builtItem?.type, "IMPORT");
  if (builtItem?.type !== "IMPORT") {
    assert.fail("expected importing source slot");
  }
  assert.equal(builtItem.bridgedReadyPool, pool);
});

test("data management uses the newest import record for a source", () => {
  const pool = buildStatusPool({ status: "IMPORTING" });
  const completedCard = buildImportStatusItem({
    id: "import-completed",
    sourceId: pool.id,
    phase: "DONE",
  });
  const activeCard = buildImportStatusItem({
    id: "import-active",
    sourceId: pool.id,
    phase: "IMPORTING",
    importProgressPercent: 64,
  });
  if (completedCard.type !== "IMPORT" || activeCard.type !== "IMPORT") {
    assert.fail("expected import fixtures");
  }
  const sections = buildHallSections({
    baseTimeframeLabels: {
      "1m": "1 minute",
      "5m": "5 minutes",
      "1h": "1 hour",
      "1d": "1 day",
    },
    csvImportCardViews: [completedCard.card, activeCard.card],
    poolSettingsById: new Map([[pool.id, pool]]),
    poolSettingsRows: [pool],
  });
  const builtItem = sections.flatMap((section) => section.items)[0];

  assert.equal(builtItem?.type, "IMPORT");
  if (builtItem?.type !== "IMPORT") {
    assert.fail("expected importing source slot");
  }
  assert.equal(builtItem.card.id, "import-active");
});

test("data config cards keep stable element refs across import progress renders", () => {
  assert.match(dataConfigViewSource, /cardElementRefCallbackMapRef/);
  assert.match(dataConfigViewSource, /const getCardElementRef = useCallback/);
  assert.match(dataConfigViewSource, /ref=\{getCardElementRef\(key\)\}/);
  assert.doesNotMatch(
    dataConfigViewSource,
    /ref=\{\(node\) => bindCardElementRef\(key, node\)\}/,
  );
});

test("data diagnostics mini chart uses source period without focus remounts", () => {
  assert.match(
    dataConfigViewSource,
    /const miniHistoryChartDisplayPeriod: BaseTimeframe =\s*detailPool\?\.baseTimeframe \?\? "1d";/,
  );
  assert.match(
    dataConfigViewSource,
    /displayPeriod: miniHistoryChartDisplayPeriod/,
  );
  assert.match(
    dataConfigViewSource,
    /const miniHistoryChartKey = `\$\{detailPool\?\.id \?\? ""\}:\$\{activeSymbol\}:\$\{miniHistoryChartDisplayPeriod\}`;/,
  );
  assert.doesNotMatch(
    dataConfigViewSource,
    /const miniHistoryChartKey = .*focusedDetailItemId/,
  );
});

test("data diagnostics mini chart treats empty preview data as neutral empty state", () => {
  assert.match(dataConfigViewSource, /!symbol \|\| !activeFocusedDetailItem/);
  assert.match(
    dataConfigViewSource,
    /!activeSymbolInstrumentId \|\| activeSymbolTotalBars <= 0/,
  );
  assert.match(dataConfigDetailDrawerSource, /hasActiveMarketBars/);
  assert.match(dataConfigViewSource, /activeBarCount: activeDetailBarCount/);
  assert.match(dataConfigDetailDrawerSource, /payload\.sourceDiagnostics\.emptyText/);
  assert.match(dataConfigDetailDrawerSource, /payload\.labels\.barsAvailableSymbol/);
  assert.match(dataConfigDetailDrawerSource, /payload\.labels\.diagnosticsUnavailable/);
  assert.doesNotMatch(
    dataConfigDetailDrawerSource,
    /payload\.sourceDiagnostics\.items\.length[\s\S]{0,120}payload\.labels\.marketPreviewNoData/,
  );
  assert.doesNotMatch(
    dataConfigDetailDrawerSource,
    /data-asset-mini-chart-state is-warning/,
  );
});

test("data config detail diagnostics are loaded only from the diagnostics tab", () => {
  const tabGateIndex = dataConfigSurfaceSource.indexOf(
    'detailWindowTab !== "DIAGNOSTICS"',
  );
  const diagnosticsCallIndex = dataConfigSurfaceSource.indexOf(
    ".getLocalDataSourceDiagnostics(",
  );

  assert.ok(tabGateIndex >= 0);
  assert.ok(diagnosticsCallIndex > tabGateIndex);
  assert.match(dataConfigSurfaceSource, /loadedSourceDiagnosticsSignatureRef/);
  assert.match(
    dataConfigSurfaceSource,
    /loadedSourceDiagnosticsSignatureRef\.current ===\s*detailDiagnosticsSignature/,
  );
});

test("data config symbol diagnostics are gated to focused diagnostics previews", () => {
  const tabGateIndex = dataConfigSurfaceSource.lastIndexOf(
    'detailWindowTab !== "DIAGNOSTICS"',
    dataConfigSurfaceSource.indexOf("void fetchDetailSymbolDiagnostics"),
  );
  const focusGateIndex = dataConfigSurfaceSource.lastIndexOf(
    "!activeFocusedDetailItem",
    dataConfigSurfaceSource.indexOf("void fetchDetailSymbolDiagnostics"),
  );
  const symbolDiagnosticsCallIndex = dataConfigSurfaceSource.indexOf(
    "void fetchDetailSymbolDiagnostics",
  );

  assert.ok(tabGateIndex >= 0);
  assert.ok(focusGateIndex >= 0);
  assert.ok(symbolDiagnosticsCallIndex > tabGateIndex);
  assert.ok(symbolDiagnosticsCallIndex > focusGateIndex);
});

test("data config symbols show neutral health until diagnostics are loaded", () => {
  assert.match(dataConfigSurfaceSource, /sourceDiagnosticsLoadedForDetail/);
  assert.match(dataConfigSurfaceViewSource, /sourceDiagnosticsLoadedForDetail/);
  assert.match(
    dataConfigSurfaceViewSource,
    /!sourceDiagnosticsLoadedForDetail[\s\S]{0,80}\? "--"/,
  );
  assert.match(
    dataConfigSurfaceViewSource,
    /sourceDiagnostics\.status === "BUILDING"[\s\S]{0,80}\? tt\("appText\.loading"\)/,
  );
  assert.match(
    dataConfigSurfaceViewSource,
    /!sourceDiagnosticsLoadedForDetail[\s\S]{0,120}\? "muted"/,
  );
});

test("data diagnostics focus marker updates are semantic", () => {
  const marker = createDetailFocusMarker(
    {
      id: "issue-1",
      symbol: "AAPL",
      category: "EXTREME_ANOMALY",
      code: "EXTREME_PRICE_SPIKE",
      severity: "WARNING",
      dateLabel: "AAPL · volatile",
      focusBarIndex: 42,
      detailText: "change: 12%",
      tone: "warning",
      markerLabel: "2026-05-13",
    },
    12,
  );

  assert.deepEqual(marker, {
    rawBarIndex: 12,
    label: "2026-05-13",
    tone: "warning",
    fullHeight: true,
  });
  assert.equal(areDetailFocusMarkersEqual(marker, { ...marker }), true);
  assert.equal(
    areDetailFocusMarkersEqual(marker, { ...marker, rawBarIndex: 13 }),
    false,
  );
  assert.match(dataConfigViewSource, /commitFocusedDetailMarker/);
  assert.match(dataConfigViewSource, /areDetailFocusMarkersEqual/);
});

test("data diagnostics filter uses only time and extreme anomaly categories", () => {
  assert.match(dataConfigViewSource, /TIME_INTEGRITY/);
  assert.match(dataConfigViewSource, /EXTREME_ANOMALY/);
  assert.doesNotMatch(dataConfigViewSource, /PRICE_BEHAVIOR/);
  assert.doesNotMatch(dataConfigViewSource, /STRUCTURE/);
  assert.doesNotMatch(dataConfigViewSource, /COVERAGE/);
});

test("sample pool source signatures are stable for equivalent data and sensitive to real source changes", () => {
  const source = buildSignatureLocalDataSource();
  assert.equal(
    buildLocalDataSourceSummariesSignature([source]),
    buildLocalDataSourceSummariesSignature([buildSignatureLocalDataSource()]),
  );
  assert.notEqual(
    buildLocalDataSourceSummariesSignature([source]),
    buildLocalDataSourceSummariesSignature([
      buildSignatureLocalDataSource({ symbolCount: 2, symbols: ["AAPL", "MSFT"] }),
    ]),
  );
  assert.notEqual(
    buildLocalDataSourceSummariesSignature([source]),
    buildLocalDataSourceSummariesSignature([
      buildSignatureLocalDataSource({ status: "IMPORTING" }),
    ]),
  );
  assert.notEqual(
    buildLocalDataSourceSummariesSignature([source]),
    buildLocalDataSourceSummariesSignature([
      buildSignatureLocalDataSource({
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    ]),
  );
});

test("sample pool sync signatures ignore timestamp-only custom pool churn but keep semantic changes", () => {
  const pool = buildSignatureCustomSamplePool();
  assert.equal(
    buildCustomSamplePoolsSignature([pool]),
    buildCustomSamplePoolsSignature([
      buildSignatureCustomSamplePool({
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]),
  );
  assert.notEqual(
    buildCustomSamplePoolsSignature([pool]),
    buildCustomSamplePoolsSignature([
      buildSignatureCustomSamplePool({
        instruments: [
          {
            instrumentId: "instrument-aapl",
            samplePoolId: "source-1",
            symbol: "AAPL",
            displayLabel: "AAPL",
            sourceTimeframe: "1d",
            barCount: 240,
          },
        ],
      }),
    ]),
  );
  assert.notEqual(
    buildCustomSamplePoolsSignature([pool]),
    buildCustomSamplePoolsSignature([
      buildSignatureCustomSamplePool({
        sourceLocked: true,
        lockedSymbols: ["AAPL"],
        lockedSymbolCount: 1,
      }),
    ]),
  );
  assert.equal(areNumericRecordValuesEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(areNumericRecordValuesEqual({ a: 1 }, { a: 2 }), false);
});

test("history replay chart focuses once per semantic focus request", () => {
  assert.match(historyReplayChartSource, /lastAppliedFocusSignatureRef/);
  assert.match(historyReplayChartSource, /const focusSignature = JSON\.stringify/);
  assert.match(
    historyReplayChartSource,
    /lastAppliedFocusSignatureRef\.current === focusSignature/,
  );
  assert.match(historyReplayChartSource, /focusRequestNonce/);
  assert.match(historyReplayChartSource, /firstBucketStartMs/);
  assert.match(historyReplayChartSource, /lastBucketStartMs/);
});
