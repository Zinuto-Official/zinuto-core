// SPDX-License-Identifier: GPL-3.0-only

import { DEFAULT_TRADING_CALENDAR_CONFIG } from "@zinuto/shared/tradingCalendar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CsvFieldMapping } from "../src/domains/data-import/csvHelpers";
import { DesktopHelpContextProvider } from "../src/domains/desktop-help/DesktopHelpContext";
import { DesktopHelpFloatingHost } from "../src/domains/desktop-help/DesktopHelpFloatingHost";
import { buildTrainerTradingAssetUi } from "../src/domains/trainer/trainerTradingAssetUi";
import { installI18nAuditBridge, useI18n } from "../src/frontend-kernel/i18n";
import {
  ttByLanguage,
  ttfByLanguage,
} from "../src/frontend-kernel/i18n/messageRuntime";
import { setGlobalTypographyContext } from "../src/frontend-kernel/typography";
import {
  getBaseTimeframeLabels,
  getCsvFieldLabels,
  getFontSizePresetOptions,
} from "../src/frontend-kernel/uiOptions";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import {
  CHART_RENDER_MODE_LABELS_BY_LANGUAGE,
  getSpecialTrainingPageContent,
  getTradingSettingsText,
} from "../src/ui/config/uiConfig";
import { getLanguageOptions, getUiLabels } from "../src/ui/config/uiLabels";
import { formatRatio } from "../src/ui/formatting/format";
import { APP_PORTAL_ROOT_ID } from "../src/ui/primitives/portalContainer";
import { buildGlobalVisualCssVariables } from "../src/ui/theme/visualColors";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";
import type {
  CsvImportCardView,
  PoolSettingsRow,
} from "../src/workspaces/data/dataConfig/model";
import {
  buildPreviewTrainerSettingsPanel,
  floatingHelpPreviewMode,
  i18nPreviewStabilityStyle,
  installWorkspaceFrameAuditBridge,
  isSettingsPreviewPage,
  language,
  noop,
  requestedPage,
  requestedScenario,
  requestedTheme,
  showFloatingHelpPreview,
  type PreviewPageId,
} from "./i18nWorkspacePreviewSupport";
import { installI18nSpecialTrainingPreviewApi } from "./installI18nSpecialTrainingPreviewApi";
import { renderI18nWorkspacePreviewPrimary } from "./renderI18nWorkspacePreviewPrimary";
import { renderI18nWorkspacePreviewSecondary } from "./renderI18nWorkspacePreviewSecondary";

export const I18nWorkspacePreviewSurface = ({
  page,
}: {
  page: PreviewPageId;
}) => {
  const { locale: activeLocale, widthProfile } = useI18n();
  const [showDesktopHelpLauncher, setShowDesktopHelpLauncher] = useState(true);
  const labels = getUiLabels(language);
  const specialTrainingContent = useMemo(
    () => getSpecialTrainingPageContent(language),
    [],
  );
  const tradingSettingsText = useMemo(
    () => getTradingSettingsText(language),
    [],
  );
  const fontSizePresetOptions = useMemo(
    () => getFontSizePresetOptions(language),
    [],
  );
  const languageOptions = useMemo(() => getLanguageOptions(language), []);
  const tt = useMemo(
    () => (key: Parameters<typeof ttByLanguage>[1]) =>
      ttByLanguage(language, key),
    [],
  );
  const ttf = useMemo(
    () => (key: Parameters<typeof ttfByLanguage>[1], values?: Array<unknown>) =>
      ttfByLanguage(language, key, values ?? []),
    [],
  );
  const previewTrainerSettingsPanel = useMemo(
    () => buildPreviewTrainerSettingsPanel({ labels, tradingSettingsText, tt }),
    [labels, tradingSettingsText, tt],
  );

  useEffect(() => installI18nAuditBridge(), []);
  useEffect(() => installWorkspaceFrameAuditBridge(), []);

  const typography = useMemo(
    () =>
      setGlobalTypographyContext({
        language,
        fontSizePreset: "STANDARD",
      }),
    [],
  );

  const rootStyle = useMemo(
    () =>
      ({
        ...typography.cssVariables,
        ...buildGlobalVisualCssVariables(
          requestedTheme,
          "RED_UP_GREEN_DOWN",
          "INSTITUTIONAL",
        ),
        padding: requestedPage === "DATA_ACQUISITION" ? "0" : "20px",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        height: requestedPage === "DATA_ACQUISITION" ? "100vh" : undefined,
        overflow: requestedPage === "DATA_ACQUISITION" ? "hidden" : "auto",
        minHeight: requestedPage === "DATA_ACQUISITION" ? "100vh" : "100%",
      }) as React.CSSProperties,
    [typography.cssVariables],
  );

  const previewTrainerChartDomRef = useRef<HTMLDivElement | null>(null);

  const previewSharedTrainerChartWorkspaceProps = useMemo(
    () => ({
      activeDrawTool: "cursor" as const,
      drawToolOptions: [],
      drawToolLabels: {},
      drawTooltipByTool: {},
      onDrawToolSelect: noop,
      drawColors: [
        "var(--visual-accent-base)",
        "var(--success)",
        "var(--warning)",
      ],
      drawColor: "var(--visual-accent-base)",
      onDrawColorChange: noop,
      drawLineWidth: 2,
      onDrawLineWidthChange: noop,
      drawMagnet: "weak_magnet",
      onDrawMagnetChange: noop,
      drawLineType: "solid" as const,
      onDrawLineTypeChange: noop,
      drawingCount: 0,
      allDrawingsVisible: true,
      onToggleAllDrawingsVisible: noop,
      onClearDrawings: noop,
      onCreateNote: noop,
      showNoteAction: true,
      chartDomRef: previewTrainerChartDomRef,
      showChartSettingsModal: false,
      indicatorQuickMenu: null,
      onOpenChartSettingsModal: noop,
      chartRenderMode: "CANDLE" as const,
      onChartRenderModeChange: noop,
      chartRenderModeLabels: CHART_RENDER_MODE_LABELS_BY_LANGUAGE[language],
      chartRenderModeGroupLabel: labels.chartSettings,
      periodOptions: ["1d", "1h"],
      selectedPeriod: "1d",
      onPeriodChange: noop,
      getPeriodLabel: (period: string) => period.toUpperCase(),
      basePeriod: "1d",
      hasProgressWarning: false,
      showSubIndicatorToggle: true,
      hasAnySubIndicator: true,
      showSubIndicators: true,
      onToggleSubIndicators: noop,
      subIndicatorToggleTitle: labels.chartSettings,
      replayEmptyWatermarkText: labels.chartSettings,
      selectedBarChange: null,
      formatRatio,
      pnlClass: (value: number) =>
        value > 0 ? "up" : value < 0 ? "down" : "flat",
      chartChangeBubbleRight: 56,
      labels: {
        color: labels.color,
        thickness: labels.thickness,
        magnet: labels.magnet,
        weak: labels.weak,
        strong: labels.strong,
        lineType: labels.lineType,
        solid: labels.solid,
        dashed: labels.dashed,
        hideAll: labels.hideAll,
        showAll: labels.showAll,
        deleteAll: labels.deleteAll,
        addNote: labels.navNotes,
        chartSettings: labels.chartSettings,
        indicator: labels.chartSettings,
        periodTitle: labels.chartSettings,
        periodOriginPrefix: labels.chartSettings,
        changeTooltip: labels.chartSettings,
      },
    }),
    [labels, language],
  );

  const previewSpecialTrainingSamplePools = useMemo(
    () => [
      {
        id: "preview-special-training",
        name: "U.S. Preview Pool",
        assetClass: "STOCK" as const,
        assetClassLabel: tradingSettingsText.assetClassLabels.STOCK,
        marketPresetId: "US_STOCK",
        baseTimeframe: "1d" as const,
        symbols: ["AAPL", "NVDA", "TSLA"],
        instruments: [
          { instrumentId: "preview-aapl-1d", symbol: "AAPL" },
          { instrumentId: "preview-nvda-1d", symbol: "NVDA" },
          { instrumentId: "preview-tsla-1d", symbol: "TSLA" },
        ],
        questionBankRevisionToken: "preview-special-training-v1",
      },
    ],
    [tradingSettingsText.assetClassLabels.STOCK],
  );

  installI18nSpecialTrainingPreviewApi({
    page,
    language,
    previewSpecialTrainingSamplePools,
  });

  const sharedProps = {
    tt,
    ttf,
  };

  const trainerTradingAssetUi = useMemo(
    () =>
      buildTrainerTradingAssetUi({
        assetClass: "STOCK",
        allowShortSelling: true,
        tradingText: tradingSettingsText,
        lotStepUnitLabel: tt("appText.lots2"),
      }),
    [tradingSettingsText, tt],
  );

  const previewCsvFieldMapping = useMemo<CsvFieldMapping>(
    () => ({
      timestampMode: "SINGLE",
      date: "datetime",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "volume",
    }),
    [],
  );
  const isCsvImportErrorPreview = requestedPage === "DATA_IMPORT_MODAL_ERROR";
  const isDataLongImportPreview =
    requestedPage === "DATA" && requestedScenario === "long-import";
  const isDataPrecheckPreview =
    requestedPage === "DATA" &&
    (requestedScenario === "precheck" ||
      requestedScenario === "empty-precheck");
  const isDataEmptyPreview =
    requestedPage === "DATA" &&
    (requestedScenario === "empty" || requestedScenario === "empty-precheck");
  const isDataPopulatedPreview =
    requestedPage === "DATA" && requestedScenario === "populated";
  const isDataTechnicalNameCollisionPreview =
    requestedPage === "DATA" &&
    requestedScenario === "technical-name-collision";
  const isDataExistingImportTransitionPreview =
    requestedPage === "DATA" &&
    requestedScenario === "existing-import-transition";
  const isDataExistingImportPreview =
    requestedPage === "DATA" &&
    (requestedScenario === "existing-import" ||
      isDataExistingImportTransitionPreview);
  const [existingImportTransitionStep, setExistingImportTransitionStep] =
    useState(0);
  useEffect(() => {
    setExistingImportTransitionStep(0);
    if (!isDataExistingImportTransitionPreview) {
      return;
    }
    const progressTimerId = window.setTimeout(() => {
      setExistingImportTransitionStep(1);
    }, 180);
    const completionTimerId = window.setTimeout(() => {
      setExistingImportTransitionStep(2);
    }, 480);
    return () => {
      window.clearTimeout(progressTimerId);
      window.clearTimeout(completionTimerId);
    };
  }, [isDataExistingImportTransitionPreview]);
  const existingImportProgressPercent = isDataExistingImportTransitionPreview
    ? existingImportTransitionStep === 0
      ? 42
      : existingImportTransitionStep === 1
        ? 68
        : 100
    : 42;
  const existingImportPhase =
    isDataExistingImportTransitionPreview && existingImportTransitionStep === 2
      ? ("DONE" as const)
      : ("IMPORTING" as const);
  const previewCsvPendingImport = useMemo(
    () => ({
      importEntryMode: "GENERAL" as const,
      folderName: "A股日线样本池",
      folderPath: "/Volumes/Zinuto/Imports/A_SHARE/1d",
      marketDataAcquisitionMetadata: {
        schemaVersion: 1 as const,
        connectorId: "akshare" as const,
        adjustment: "qfq" as const,
        sourceSymbols: ["000001"],
        importSymbols: ["000001"],
      },
      sourceFolderPath: "/Volumes/Zinuto/Imports/A_SHARE/1d",
      previewToken: "preview-data-import-token",
      planSummaries: [
        {
          id: "preview-plan-a-share-1d",
          strategy: "FLAT" as const,
          baseTimeframe: "1d" as const,
          topLevelSubfolder: "",
          symbolCount: 622,
          fileCount: 622,
        },
      ],
      confirmableImportPlans: [
        {
          id: "preview-plan-a-share-1d",
          previewPlanId: "preview-plan-a-share-1d",
          strategy: "FLAT" as const,
          baseTimeframe: "1d" as const,
          topLevelSubfolder: "",
          symbolCount: 622,
          fileCount: 622,
        },
      ],
      headers: ["datetime", "open", "close", "high", "low", "volume", "amount"],
      mapping: previewCsvFieldMapping,
      timeZoneSuggestion: {
        timeZone: "Asia/Shanghai",
        reason: "PRESET_DEFAULT" as const,
        confidence: isCsvImportErrorPreview
          ? ("LOW" as const)
          : ("MEDIUM" as const),
        reasons: [
          {
            code: "PRESET_DEFAULT",
            timeZone: "Asia/Shanghai",
            score: 76,
          },
        ],
        samples: [],
      },
      tradingCalendarSuggestion: {
        calendar: DEFAULT_TRADING_CALENDAR_CONFIG,
        confidence: "MEDIUM" as const,
        origin: "DETECTED" as const,
        sampleCount: 128,
        activeDayCount: 5,
      },
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      draftValidation: {
        mapping: {
          valid: true,
          reasonCode: "READY" as const,
          issueCount: 0,
          issues: [],
        },
        tradingCalendar: {
          valid: true,
          reasonCode: "READY" as const,
          issueCount: 0,
          issues: [],
        },
        targeting: {
          valid: true,
          reasonCode: "READY" as const,
          issueCount: 0,
          issues: [],
        },
        repair: {
          valid: true,
          reasonCode: "READY" as const,
          warningCount: 0,
        },
        timeZone: {
          valid: true,
          reasonCode: "READY" as const,
          confirmationRequired: false,
        },
        confirm: {
          enabled: true,
          reasonCode: "READY" as const,
        },
        blockingIssue: {
          kind: "none" as const,
          reasonCode: "READY" as const,
        },
        planning: {
          targetSourceOptions: [],
          recommendedTimeZone: "Asia/Shanghai",
          recommendedTimeZoneReason: "PRESET_DEFAULT" as const,
          recommendedTradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
          scopeStrategy: "FLAT" as const,
          availableScopeStrategies: ["FLAT" as const],
          planRows: [],
        },
        validatedAt: "2026-05-29T00:00:00.000Z",
      },
      mappingProfile: {
        canonicalSchemaKey: "ts:SINGLE|price:RAW|volume:OPTIONAL",
        priceFamily: "RAW" as const,
        confidence: "HIGH" as const,
        score: 100,
        conflicts: [],
      },
      fieldDiagnostics: [
        {
          field: "date" as const,
          status: "MATCHED" as const,
          selectedHeader: "datetime",
          confidence: "HIGH" as const,
          reason: "TIME_PRIMARY",
          candidates: [],
        },
        {
          field: "open" as const,
          status: "MATCHED" as const,
          selectedHeader: "open",
          confidence: "HIGH" as const,
          reason: "RAW_OHLC",
          candidates: [],
        },
        {
          field: "close" as const,
          status: "MATCHED" as const,
          selectedHeader: "close",
          confidence: "HIGH" as const,
          reason: "RAW_OHLC",
          candidates: [],
        },
        {
          field: "high" as const,
          status: "MATCHED" as const,
          selectedHeader: "high",
          confidence: "HIGH" as const,
          reason: "RAW_OHLC",
          candidates: [],
        },
        {
          field: "low" as const,
          status: "MATCHED" as const,
          selectedHeader: "low",
          confidence: "HIGH" as const,
          reason: "RAW_OHLC",
          candidates: [],
        },
        {
          field: "volume" as const,
          status: "MATCHED" as const,
          selectedHeader: "volume",
          confidence: "HIGH" as const,
          reason: "VOLUME",
          candidates: [],
        },
      ],
      repairSummary: {
        applied: ["TIMESTAMP_SORTED_BEFORE_IMPORT"],
        warnings: isCsvImportErrorPreview
          ? ["DUPLICATE_TIMESTAMP_CONFLICT"]
          : [],
        sample: {
          checkedRows: 128,
          parseableTimestampRows: 128,
          validOhlcRows: 128,
          duplicateTimestampRows: 0,
          conflictingDuplicateTimestampRows: 0,
        },
      },
      schemaDiagnostics: {
        canonicalSchemaKey: "ts:SINGLE|price:RAW|volume:OPTIONAL",
        validSchemaCount: 1,
        inconsistentFiles: isCsvImportErrorPreview
          ? [
              {
                relativePath: "A_SHARE/1d/SCHEMA-CONFLICT.csv",
                reason: "CSV_HEADER_SCHEMA_INCONSISTENT",
                canonicalSchemaKey: "ts:SINGLE|price:ADJUSTED|volume:OPTIONAL",
                conflicts: ["priceFamily"],
              },
            ]
          : [],
      },
      detectedTimeframe: "1d" as const,
      detectedTimeframes: ["1d" as const],
      validSymbolCount: 622,
      totalFiles: 622,
      validFiles: isCsvImportErrorPreview ? 614 : 622,
      invalidFiles: isCsvImportErrorPreview ? 8 : 0,
      invalidFileSamples: isCsvImportErrorPreview
        ? [
            {
              relativePath: "A_SHARE/1d/000001.SZ.csv",
              reason: "CSV_HEADER_SCHEMA_INCONSISTENT",
            },
            {
              relativePath: "A_SHARE/1d/600519.SH.csv",
              reason: "CSV_HEADER_READ_FAILED",
            },
            {
              relativePath: "A_SHARE/1d/BAD-NAME.csv",
              reason: "CSV_FILENAME_INVALID",
            },
          ]
        : [],
    }),
    [isCsvImportErrorPreview, previewCsvFieldMapping],
  );
  const previewCsvPlanConfigRows = useMemo(
    () => [
      {
        id: "preview-plan-row-a-share-1d",
        previewPlanId: "preview-plan-a-share-1d",
        strategy: "FLAT" as const,
        topLevelSubfolder: "",
        poolName: "1d-1d",
        autoGeneratedPoolName: "A股日线样本池",
        sourceId: "",
        targetSourceId: "",
        targetSourceOptions: [],
        hasExistingTargetOptions: false,
        symbolCount: 622,
        fileCount: 622,
        baseTimeframe: "1d" as const,
        effectiveTimeZone: "Asia/Shanghai",
        effectiveTimeZoneOrigin: "INFERRED_DEFAULT" as const,
        effectiveTimeZoneSource: "NEW_SOURCE_PENDING_IMPORT" as const,
        targetSourceTimeZone: null,
        targetSourceTimeZoneOrigin: null,
        willUpdateExistingSourceTimeZone: false,
        tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
        targetSourceTradingCalendar: null,
        willUpdateExistingSourceTradingCalendar: false,
      },
    ],
    [],
  );
  const previewCsvFieldLabels = useMemo(() => getCsvFieldLabels(), []);
  const previewCsvBaseTimeframeLabels = useMemo(
    () => getBaseTimeframeLabels(),
    [],
  );
  const createPreviewDataPool = (
    overrides: Partial<PoolSettingsRow> & Pick<PoolSettingsRow, "id" | "name">,
  ): PoolSettingsRow => {
    const symbols = overrides.symbols ?? ["AAPL", "MSFT", "NVDA"];
    const timeStartTs = overrides.timeStartTs ?? "2015-01-05T05:00:00.000Z";
    const timeEndTs = overrides.timeEndTs ?? "2025-12-31T05:00:00.000Z";
    return {
      sourceFolder: "/Volumes/Zinuto/Imports/US_STOCK/1d",
      importScopeStrategy: "FLAT",
      importScopeTopLevelSubfolder: "",
      timeZone: "America/New_York",
      timeZoneOrigin: "PRESET_DEFAULT",
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      symbols,
      symbolCount: symbols.length,
      barCount: symbols.length * 2520,
      symbolBarCountBySymbol: symbols.reduce<Record<string, number>>(
        (accumulator, symbol) => {
          accumulator[symbol] = 2520;
          return accumulator;
        },
        {},
      ),
      symbolInstrumentIdBySymbol: symbols.reduce<Record<string, string>>(
        (accumulator, symbol) => {
          accumulator[symbol] = `${overrides.id}-${symbol}`;
          return accumulator;
        },
        {},
      ),
      symbolTimeRangeBySymbol: symbols.reduce<
        Record<string, { timeStartTs: string | null; timeEndTs: string | null }>
      >((accumulator, symbol) => {
        accumulator[symbol] = { timeStartTs, timeEndTs };
        return accumulator;
      }, {}),
      timeStartTs,
      timeEndTs,
      lastSyncedAt: "2026-04-20T08:15:00.000Z",
      storageBytes: 18_500_000,
      csvFieldMapping: previewCsvFieldMapping,
      baseTimeframe: "1d",
      diagnosticProfile: {
        assetClass: "STOCK",
        marketPresetId: "US_STOCK",
        profileOrigin: "INFERRED",
      },
      selected: true,
      status: "READY",
      isSystem: false,
      requiresSourceFolderRebind: false,
      sourceLocked: false,
      unlockedSymbols: symbols,
      lockedSymbols: [],
      lockedSymbolCount: 0,
      lockReason: null,
      ...overrides,
    };
  };
  const previewDataPoolSettingsRows = useMemo<PoolSettingsRow[]>(() => {
    const localPools = [
      createPreviewDataPool({
        id: "preview-a-share-1d",
        name: isDataTechnicalNameCollisionPreview
          ? "Zinuto-Data-ccxt-20260725-083700-f14d3e08-日K"
          : "A 股日线自导入",
        sourceFolder: isDataTechnicalNameCollisionPreview
          ? "/Volumes/Zinuto/Imports/Zinuto-Data-ccxt-20260725-083700-f14d3e08/BTC_ETH/1d"
          : "/Volumes/Zinuto/Imports/A_SHARE/1d",
        timeZone: "Asia/Shanghai",
        symbols: isDataTechnicalNameCollisionPreview
          ? ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
          : ["000001.SZ", "600519.SH", "300750.SZ", "510300.SH"],
        symbolCount: 4,
        barCount: 9_840,
        storageBytes: 22_400_000,
        lastSyncedAt: "2026-04-26T09:20:00.000Z",
        status: isDataExistingImportPreview ? "IMPORTING" : "READY",
      }),
      ...(isDataTechnicalNameCollisionPreview
        ? [
            createPreviewDataPool({
              id: "preview-ccxt-collision-1d",
              name: "Zinuto-Data-ccxt-20260725-083700-f14d3e08-日K",
              sourceFolder:
                "/Volumes/Zinuto/Imports/Zinuto-Data-ccxt-20260725-083700-f14d3e08/SOL_BNB/1d",
              timeZone: "UTC",
              symbols: ["SOLUSDT", "BNBUSDT"],
              symbolCount: 2,
              barCount: 730,
              storageBytes: 11_260_000,
              lastSyncedAt: "2026-04-26T04:10:00.000Z",
            }),
          ]
        : [
            createPreviewDataPool({
              id: "preview-rebind-1h",
              name: "迁移后待重绑",
              sourceFolder: "",
              baseTimeframe: "1h",
              symbols: ["AAPL", "MSFT", "NVDA"],
              symbolCount: 3,
              barCount: 18_600,
              storageBytes: 14_800_000,
              requiresSourceFolderRebind: true,
              lastSyncedAt: "2026-04-18T12:00:00.000Z",
            }),
          ]),
    ];
    const systemPool = createPreviewDataPool({
      id: "SYSTEM_WIKI_EOD_100",
      name: "Nasdaq Data Link WIKI EOD 100",
      sourceFolder: "SYSTEM",
      symbols: ["AAPL", "MSFT", "IBM", "GE", "XOM"],
      symbolCount: 100,
      barCount: 240_000,
      storageBytes: 112_000_000,
      isSystem: true,
      sourceLocked: true,
      lastSyncedAt: null,
    });
    return isDataEmptyPreview ? [systemPool] : [...localPools, systemPool];
  }, [
    isDataEmptyPreview,
    isDataExistingImportPreview,
    isDataTechnicalNameCollisionPreview,
  ]);
  const previewCsvImportCardViews = useMemo<CsvImportCardView[]>(
    () =>
      isDataEmptyPreview ||
      isDataPopulatedPreview ||
      isDataPrecheckPreview ||
      isDataTechnicalNameCollisionPreview
        ? []
        : [
            ...(isDataExistingImportPreview
              ? [
                  {
                    id: "preview-finished-import",
                    poolName: "A 股日线自导入",
                    sourceId: "preview-a-share-1d",
                    sourceFolder: "/Volumes/Zinuto/Imports/A_SHARE/1d",
                    timeZone: "Asia/Shanghai",
                    baseTimeframe: "1d" as const,
                    phase: "DONE" as const,
                    jobId: "preview-finished-job",
                    cancelRequested: false,
                    isPaused: false,
                    progressLabelText: "620 / 620",
                    importProgressPercent: 100,
                    shouldShowCompactProgress: false,
                    compactProgressLabelText: "100%",
                    compactProgressDisplayPercent: 100,
                    compactSizeSummaryText: "620 files",
                    compactEffectText: "620 files imported",
                    skippedRowsLabelText: "",
                    errorMessage: "",
                    totalFiles: 620,
                  },
                ]
              : []),
            {
              id: "preview-running-import",
              poolName: isDataExistingImportPreview
                ? "A 股日线自导入"
                : "港股 5m 增量导入",
              sourceId: isDataExistingImportPreview
                ? "preview-a-share-1d"
                : "preview-running-import-source",
              sourceFolder: isDataExistingImportPreview
                ? "/Volumes/Zinuto/Imports/A_SHARE/1d"
                : isDataLongImportPreview
                  ? "~/Data/import-fixtures/asia/hk/5m/deeply/nested/folder/with/a/very-long-source-path"
                  : "~/Data/Imports/HK_STOCK/5m",
              timeZone: isDataExistingImportPreview
                ? "Asia/Shanghai"
                : "Asia/Hong_Kong",
              baseTimeframe: isDataExistingImportPreview ? "1d" : "5m",
              phase: isDataExistingImportPreview
                ? existingImportPhase
                : ("IMPORTING" as const),
              jobId: "preview-running-job",
              cancelRequested: false,
              isPaused: false,
              progressLabelText: isDataLongImportPreview
                ? "0 / 444"
                : `${Math.round((620 * existingImportProgressPercent) / 100)} / 620`,
              importProgressPercent: isDataLongImportPreview
                ? 5
                : existingImportProgressPercent,
              shouldShowCompactProgress: true,
              compactProgressLabelText: isDataLongImportPreview
                ? "5%"
                : `${existingImportProgressPercent}%`,
              compactProgressDisplayPercent: isDataLongImportPreview
                ? 5
                : existingImportProgressPercent,
              compactSizeSummaryText: isDataLongImportPreview
                ? ""
                : "620 files",
              compactEffectText: isDataLongImportPreview
                ? "0 files imported"
                : `${Math.round((620 * existingImportProgressPercent) / 100)} files imported`,
              skippedRowsLabelText: "",
              errorMessage: "",
              totalFiles: isDataLongImportPreview ? 444 : 620,
            },
          ],
    [
      isDataEmptyPreview,
      isDataExistingImportPreview,
      existingImportPhase,
      existingImportProgressPercent,
      isDataLongImportPreview,
      isDataPopulatedPreview,
      isDataPrecheckPreview,
      isDataTechnicalNameCollisionPreview,
    ],
  );
  const previewDataSourceSyncMonitorStateById = useMemo(
    () => ({
      "preview-a-share-1d": {
        sourceId: "preview-a-share-1d",
        status: "DIRTY" as const,
        mode: "PROMPT" as const,
        quickCheckStatus: "POTENTIAL_CHANGES" as const,
        reasonCode: "SOURCE_FOLDER_CHANGED",
        checkedAt: "2026-04-27T02:30:00.000Z",
        estimatedChangedFiles: 12,
        estimatedChangedSymbols: 6,
        missingSymbolsRetained: [],
        changedSymbols: ["000001.SZ", "600519.SH"],
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
      },
    }),
    [],
  );
  const previewDataSourceSyncPrefsById = useMemo(
    () => ({
      "preview-a-share-1d": { mode: "PROMPT" as const },
      "preview-rebind-1h": { mode: "PROMPT" as const },
    }),
    [],
  );

  const previewRenderScope = {
    fontSizePresetOptions,
    labels,
    languageOptions,
    isDataEmptyPreview,
    isDataPrecheckPreview,
    previewCsvBaseTimeframeLabels,
    previewCsvFieldLabels,
    previewCsvFieldMapping,
    previewCsvImportCardViews,
    previewCsvPendingImport,
    previewCsvPlanConfigRows,
    previewDataPoolSettingsRows,
    previewDataSourceSyncMonitorStateById,
    previewDataSourceSyncPrefsById,
    previewSharedTrainerChartWorkspaceProps,
    previewSpecialTrainingSamplePools,
    previewTrainerSettingsPanel,
    sharedProps,
    specialTrainingContent,
    tradingSettingsText,
    trainerTradingAssetUi,
    tt,
    ttf,
  };
  const previewContent =
    renderI18nWorkspacePreviewPrimary(page, previewRenderScope) ??
    renderI18nWorkspacePreviewSecondary(page, previewRenderScope);

  return (
    <div
      className={`app-root theme-${requestedTheme} price-scheme-red-up font-size-standard layout-constrained`}
      style={rootStyle}
      lang={activeLocale === "en-XA" ? "en" : activeLocale}
      data-ui-language={activeLocale}
      data-script-group={language}
      data-locale-width-profile={widthProfile}
      data-preview-page={page}
      data-preview-theme={requestedTheme}
      data-i18n-preview-root="true"
    >
      <style>{i18nPreviewStabilityStyle}</style>
      <span
        aria-hidden="true"
        data-i18n-slot="workspacePreviewCritical"
        data-i18n-critical="true"
        style={{
          display: "block",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
      {showFloatingHelpPreview ? (
        <DesktopHelpContextProvider
          activeWorkspace={
            isSettingsPreviewPage ? "SETTINGS" : "COMMAND_CENTER"
          }
          onNavigateToTarget={noop}
          showDesktopHelpLauncher={showDesktopHelpLauncher}
          setShowDesktopHelpLauncher={setShowDesktopHelpLauncher}
        >
          {previewContent}
          <DesktopHelpFloatingHost
            defaultOpen={floatingHelpPreviewMode === "floating"}
            onboardingActive={false}
          />
        </DesktopHelpContextProvider>
      ) : (
        previewContent
      )}
      <div id={APP_PORTAL_ROOT_ID} className="app-portal-root" />
    </div>
  );
};
