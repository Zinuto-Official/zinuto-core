// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import { shouldShowVolumePaneForLocalSource } from "@/domains/chart/volumeAvailability";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import {
  areDetailFocusMarkersEqual,
  createEmptyDetailSymbolDiagnostics,
  createEmptySourceDiagnostics,
  encodeRemovedSymbolsByPool,
  formatGapBoundaryLabel,
  normalizeRemovedSymbolsByPool,
  resolveTimeSpanText,
  sanitizeRemovedSymbolsByPool,
  toFiniteNumber,
  type DetailBar,
  type DetailFocusMarker,
  type DetailSymbolDiagnostics,
  type DetailSymbolRow,
  type DiagnosticDetailItem,
  type PoolSettingsRow,
  type SourceDiagnosticFilterKind,
  type SourceDiagnosticIssueItem,
  type SourceDiagnostics,
} from "@/workspaces/data/dataConfig/model";
import type { DataConfigDetailWindowTabId } from "@/workspaces/data/DataConfigDetailDrawer";

type UseDataConfigDetailProjectionInput = {
  activeSymbol: string;
  checkedSymbols: string[];
  detailPoolId: string;
  detailSymbolKeyword: string;
  detailWindowTab: DataConfigDetailWindowTabId;
  formatMoney: (value: number, digits?: number) => string;
  formatPercentDisplay: (value: number, digits?: number) => string;
  language: AppUiLanguage;
  poolSettingsRows: PoolSettingsRow[];
  removedSymbolsByPool: Record<string, string[]>;
  setActiveSymbol: Dispatch<SetStateAction<string>>;
  setCheckedSymbols: Dispatch<SetStateAction<string[]>>;
  setDetailPoolId: Dispatch<SetStateAction<string>>;
  setRemovedSymbolsByPool: Dispatch<SetStateAction<Record<string, string[]>>>;
  tt: (key: AppTextKey) => string;
  ttLoose: (key: string) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  withLabelValue: (label: string, value: string) => string;
};

export const useDataConfigDetailProjection = ({
  activeSymbol,
  checkedSymbols,
  detailPoolId,
  detailSymbolKeyword,
  detailWindowTab,
  formatMoney,
  formatPercentDisplay,
  language,
  poolSettingsRows,
  removedSymbolsByPool,
  setActiveSymbol,
  setCheckedSymbols,
  setDetailPoolId,
  setRemovedSymbolsByPool,
  tt,
  ttLoose,
  ttf,
  withLabelValue,
}: UseDataConfigDetailProjectionInput) => {
  const detailPool = useMemo(
    () => poolSettingsRows.find((pool) => pool.id === detailPoolId) ?? null,
    [poolSettingsRows, detailPoolId],
  );
  const detailDiagnosticsSourceId = detailPool?.id ?? "";
  const detailDiagnosticsBaseTimeframe = detailPool?.baseTimeframe ?? "1d";
  const detailDiagnosticsSignature = detailPool
    ? [
        detailPool.id,
        detailPool.baseTimeframe,
        detailPool.symbols.join(","),
        detailPool.barCount,
        detailPool.timeStartTs ?? "",
        detailPool.timeEndTs ?? "",
        detailPool.lastSyncedAt ?? "",
      ].join(":")
    : "";
  const detailBaseSymbols = useMemo(() => {
    if (!detailPool) {
      return [];
    }
    return detailPool.symbols;
  }, [detailPool]);
  const detailKeyword = detailSymbolKeyword.trim().toUpperCase();
  const detailRows = useMemo<DetailSymbolRow[]>(() => {
    if (!detailPool) {
      return [];
    }
    const lockedSymbolSet = new Set(detailPool.lockedSymbols);
    return detailBaseSymbols
      .filter((symbol) => !detailKeyword || symbol.includes(detailKeyword))
      .map((symbol) => {
        const timeRange = detailPool.symbolTimeRangeBySymbol[symbol];
        const timeStartTs = timeRange?.timeStartTs ?? null;
        const timeEndTs = timeRange?.timeEndTs ?? null;
        return {
          symbol,
          barCount: Math.max(
            0,
            Number(detailPool.symbolBarCountBySymbol[symbol] || 0),
          ),
          timeSpanText: resolveTimeSpanText(
            timeStartTs,
            timeEndTs,
            tt("appText.unknownTimeRange"),
            (startLabel, endLabel) =>
              ttf("appText.value0Value13", [startLabel, endLabel]),
          ),
          timeStartTs,
          timeEndTs,
          locked: lockedSymbolSet.has(symbol),
        };
      });
  }, [detailBaseSymbols, detailKeyword, detailPool, tt]);
  const detailSymbols = useMemo(
    () => detailRows.map((row) => row.symbol),
    [detailRows],
  );
  useEffect(() => {
    if (detailPoolId && !detailPool) {
      setDetailPoolId("");
    }
  }, [detailPool, detailPoolId]);

  useEffect(() => {
    setRemovedSymbolsByPool((current) => {
      const sanitized = sanitizeRemovedSymbolsByPool(current, poolSettingsRows);
      if (
        encodeRemovedSymbolsByPool(current) ===
        encodeRemovedSymbolsByPool(sanitized)
      ) {
        return current;
      }
      return sanitized;
    });
  }, [poolSettingsRows]);

  useEffect(() => {
    const normalized = normalizeRemovedSymbolsByPool(removedSymbolsByPool);
    if (
      encodeRemovedSymbolsByPool(removedSymbolsByPool) ===
      encodeRemovedSymbolsByPool(normalized)
    ) {
      return;
    }
    setRemovedSymbolsByPool(normalized);
  }, [removedSymbolsByPool, setRemovedSymbolsByPool]);

  useEffect(() => {
    if (!detailRows.length) {
      setActiveSymbol("");
      setCheckedSymbols([]);
      return;
    }
    const firstUnlockedSymbol =
      detailRows.find((row) => !row.locked)?.symbol ?? "";
    setActiveSymbol((current) =>
      current &&
      detailRows.some((row) => row.symbol === current && !row.locked)
        ? current
        : firstUnlockedSymbol,
    );
    setCheckedSymbols((current) =>
      current.filter((symbol) => detailSymbols.includes(symbol)),
    );
  }, [detailRows, detailSymbols]);

  const activeDetailSymbolRow = useMemo(
    () => detailRows.find((row) => row.symbol === activeSymbol) ?? null,
    [detailRows, activeSymbol],
  );
  const activeDetailBarCount = Math.max(
    0,
    Number(activeDetailSymbolRow?.barCount || 0),
  );
  const symbolBarsRangeCacheRef = useRef(
    new Map<
      string,
      { total: number; offset: number; limit: number; bars: DetailBar[] }
    >(),
  );
  const symbolDiagnosticsCacheRef = useRef(
    new Map<string, DetailSymbolDiagnostics>(),
  );
  const [activeSymbolBars, setActiveSymbolBars] = useState<DetailBar[]>([]);
  const [isLoadingSymbolBars, setIsLoadingSymbolBars] = useState(false);
  const [activeSymbolBarsLoadFailed, setActiveSymbolBarsLoadFailed] =
    useState(false);
  const [activeSymbolDiagnostics, setActiveSymbolDiagnostics] =
    useState<DetailSymbolDiagnostics>(() =>
      createEmptyDetailSymbolDiagnostics(),
    );
  const [sourceDiagnostics, setSourceDiagnostics] = useState<SourceDiagnostics>(
    () => createEmptySourceDiagnostics(),
  );
  const [isLoadingSourceDiagnostics, setIsLoadingSourceDiagnostics] =
    useState(false);
  const [sourceDiagnosticsLoadFailed, setSourceDiagnosticsLoadFailed] =
    useState(false);
  const [activeSourceDiagnosticKind, setActiveSourceDiagnosticKind] =
    useState<SourceDiagnosticFilterKind>("ALL");
  const [focusedDetailItemId, setFocusedDetailItemId] = useState("");
  const [focusedDetailBarIndex, setFocusedDetailBarIndex] = useState<
    number | null
  >(null);
  const [focusDetailRequestNonce, setFocusDetailRequestNonce] = useState(0);
  const [focusedDetailMarker, setFocusedDetailMarker] =
    useState<DetailFocusMarker | null>(null);
  const loadedSourceDiagnosticsSignatureRef = useRef("");
  const activeSymbolHistoryProject = useMemo<
    HistoryReplayChartViewProps["project"]
  >(() => {
    if (!detailPool || !activeSymbol || !activeSymbolBars.length) {
      return null;
    }
    return {
      id: `data-config-preview:${detailPool.id}:${activeSymbol}`,
      symbol: activeSymbol,
      replay: {
        bars: activeSymbolBars.map((bar) => ({
          ts: bar.ts,
          open: toFiniteNumber(bar.open),
          high: toFiniteNumber(bar.high),
          low: toFiniteNumber(bar.low),
          close: toFiniteNumber(bar.close),
          volume: Math.max(0, toFiniteNumber(bar.volume)),
        })),
        baseTimeframe: detailPool.baseTimeframe,
        snapshot: null,
      },
    };
  }, [activeSymbol, activeSymbolBars, detailPool]);
  const activeSymbolShowVolumePane = useMemo(
    () =>
      detailPool?.isSystem
        ? true
        : shouldShowVolumePaneForLocalSource(detailPool?.csvFieldMapping),
    [detailPool?.csvFieldMapping, detailPool?.isSystem],
  );
  const activeSymbolTotalBars = Math.max(
    activeDetailBarCount,
    activeSymbolDiagnostics.totalBars,
  );
  const sourceDiagnosticsLoadedForDetail =
    Boolean(detailDiagnosticsSourceId) &&
    sourceDiagnostics.sourceId === detailDiagnosticsSourceId &&
    Boolean(sourceDiagnostics.diagnosticRulesVersion);
  const sourceDiagnosticSummaryBySymbol = useMemo(() => {
    const map = new Map<string, SourceDiagnostics["symbols"][number]>();
    sourceDiagnostics.symbols.forEach((summary) => {
      const symbol = String(summary.symbol || "").trim().toUpperCase();
      if (symbol) {
        map.set(symbol, summary);
      }
    });
    return map;
  }, [sourceDiagnostics.symbols]);
  const sourceTimeIntegrityCount = Math.max(
    0,
    sourceDiagnostics.summary.byCategory.TIME_INTEGRITY,
  );
  const sourceExtremeAnomalyCount = Math.max(
    0,
    sourceDiagnostics.summary.byCategory.EXTREME_ANOMALY,
  );
  const sourceDiagnosticFilterOptions = useMemo<
    Array<{
      kind: SourceDiagnosticFilterKind;
      label: string;
    }>
  >(() => {
    const options: Array<{
      kind: SourceDiagnosticFilterKind;
      label: string;
    }> = [
      {
        kind: "ALL",
        label: ttf("appText.value0Value12", [
          ttLoose("appText.diagnosticFilterAll"),
          formatMoney(sourceDiagnostics.totalIssues, 0),
        ]),
      },
    ];
    const categoryOptions: Array<{
      kind: SourceDiagnosticFilterKind;
      labelKey: string;
      count: number;
    }> = [
      {
        kind: "TIME_INTEGRITY",
        labelKey: "appText.diagnosticCategoryTimeIntegrity",
        count: sourceTimeIntegrityCount,
      },
      {
        kind: "EXTREME_ANOMALY",
        labelKey: "appText.diagnosticCategoryExtremeAnomaly",
        count: sourceExtremeAnomalyCount,
      },
    ];
    categoryOptions.forEach((option) => {
      if (option.count <= 0) {
        return;
      }
      options.push({
        kind: option.kind,
        label: ttf("appText.value0Value12", [
          ttLoose(option.labelKey),
          formatMoney(option.count, 0),
        ]),
      });
    });
    return options;
  }, [
    formatMoney,
    sourceDiagnostics.totalIssues,
    sourceExtremeAnomalyCount,
    sourceTimeIntegrityCount,
    ttf,
    ttLoose,
  ]);
  useEffect(() => {
    if (activeSourceDiagnosticKind === "ALL") {
      return;
    }
    if (
      sourceDiagnosticFilterOptions.some(
        (option) => option.kind === activeSourceDiagnosticKind,
      )
    ) {
      return;
    }
    setActiveSourceDiagnosticKind("ALL");
  }, [activeSourceDiagnosticKind, sourceDiagnosticFilterOptions]);
  const activeDiagnosticDetailItems = useMemo<DiagnosticDetailItem[]>(() => {
    const activeBaseTimeframe: BaseTimeframe =
      detailPool?.baseTimeframe ?? "1d";
    const getIssueCategoryLabel = (
      category: SourceDiagnosticIssueItem["category"],
    ) => {
      if (category === "EXTREME_ANOMALY") {
        return ttLoose("appText.diagnosticCategoryExtremeAnomaly");
      }
      return ttLoose("appText.diagnosticCategoryTimeIntegrity");
    };
    const getIssueCodeLabel = (code: SourceDiagnosticIssueItem["code"]) => {
      const keyByCode: Record<SourceDiagnosticIssueItem["code"], string> = {
        INVALID_OHLC: "appText.diagnosticCodeInvalidOhlc",
        DUPLICATE_TIMESTAMP: "appText.diagnosticCodeDuplicateTimestamp",
        TIME_ORDER_BREAK: "appText.diagnosticCodeTimeOrderBreak",
        DATA_GAP: "appText.diagnosticCodeDataGap",
        OUT_OF_SESSION_BAR: "appText.diagnosticCodeOutOfSessionBar",
        TIMEFRAME_MISALIGNED_BAR: "appText.diagnosticCodeTimeframeMisalignedBar",
        EXTREME_PRICE_SPIKE: "appText.diagnosticCodeExtremePriceSpike",
      };
      return ttLoose(keyByCode[code]);
    };
    const formatIssuePrimary = (item: SourceDiagnosticIssueItem): string =>
      formatDotJoinedText(language, [
        item.symbol,
        getIssueCodeLabel(item.code),
        item.dateLabel || "--",
      ]);
    const formatIssueDetail = (item: SourceDiagnosticIssueItem): string => {
      if (item.code === "DATA_GAP") {
        return formatDotJoinedText(language, [
          withLabelValue(
            getIssueCategoryLabel(item.category),
            formatMoney(item.missingBars, 0),
          ),
          withLabelValue(
            ttLoose("appText.start"),
            formatGapBoundaryLabel(
              item.focusStartTs ?? "",
              activeBaseTimeframe,
            ) ||
              item.dateLabel ||
              "--",
          ),
          withLabelValue(
            ttLoose("appText.end"),
            formatGapBoundaryLabel(
              item.focusEndTs ?? "",
              activeBaseTimeframe,
            ) ||
              item.dateLabel ||
              "--",
          ),
        ]);
      }
      if (item.category === "TIME_INTEGRITY") {
        return formatDotJoinedText(language, [
          withLabelValue(
            getIssueCategoryLabel(item.category),
            getIssueCodeLabel(item.code),
          ),
          withLabelValue(ttLoose("appText.total"), formatMoney(item.count, 0)),
        ]);
      }
      return formatDotJoinedText(language, [
        withLabelValue(
          getIssueCategoryLabel(item.category),
          getIssueCodeLabel(item.code),
        ),
        withLabelValue(
          ttLoose("appText.change"),
          formatPercentDisplay(
            (item.closeChangeRatio || item.ratio) * 100,
            2,
          ),
        ),
      ]);
    };
    return sourceDiagnostics.items
      .filter(
        (item) =>
          activeSourceDiagnosticKind === "ALL" ||
          item.category === activeSourceDiagnosticKind,
      )
      .map((item) => ({
        id: item.id,
        symbol: item.symbol,
        category: item.category,
        code: item.code,
        severity: item.severity,
        dateLabel: formatIssuePrimary(item),
        focusBarIndex: item.focusBarIndex,
        detailText: formatIssueDetail(item),
        tone:
          item.severity === "CRITICAL"
            ? "danger"
            : item.severity === "WARNING"
              ? "warning"
              : "primary",
        markerLabel: item.dateLabel || item.symbol,
        stacked: item.category === "TIME_INTEGRITY",
      }));
  }, [
    activeSourceDiagnosticKind,
    detailPool?.baseTimeframe,
    sourceDiagnostics.items,
    formatMoney,
    formatPercentDisplay,
    language,
    ttLoose,
    withLabelValue,
  ]);
  const activeFocusedDetailItem = useMemo(
    () =>
      activeDiagnosticDetailItems.find(
        (detailItem) => detailItem.id === focusedDetailItemId,
      ) ?? null,
    [activeDiagnosticDetailItems, focusedDetailItemId],
  );
  useEffect(() => {
    if (!focusedDetailItemId || activeFocusedDetailItem) {
      return;
    }
    setFocusedDetailItemId("");
    setFocusedDetailBarIndex(null);
    setFocusedDetailMarker(null);
  }, [activeFocusedDetailItem, focusedDetailItemId]);
  const activeDiagnosticDetailTitle = (() => {
    if (activeSourceDiagnosticKind === "ALL") {
      return ttLoose("appText.sourceDiagnostics");
    }
    if (activeSourceDiagnosticKind === "EXTREME_ANOMALY") {
      return ttLoose("appText.diagnosticCategoryExtremeAnomaly");
    }
    return ttLoose("appText.diagnosticCategoryTimeIntegrity");
  })();
  const activeDiagnosticDetailHint =
    ttLoose("appText.diagnosticNoIssueSelected");
  const activeDiagnosticDetailEmptyText = (() => {
    if (activeSourceDiagnosticKind === "ALL") {
      return ttLoose("appText.goodDataQuality");
    }
    return ttLoose("appText.diagnosticNoIssuesForFilter");
  })();
  const jumpToDiagnosticDetailBar = useCallback(
    (detailItem: DiagnosticDetailItem) => {
      setFocusedDetailItemId(detailItem.id);
      setFocusedDetailBarIndex(null);
      setFocusedDetailMarker(null);
      setFocusDetailRequestNonce((current) => current + 1);
    },
    [activeSourceDiagnosticKind, activeSymbol, detailPool?.id],
  );
  const commitFocusedDetailMarker = useCallback(
    (nextMarker: DetailFocusMarker | null) => {
      setFocusedDetailMarker((current) =>
        areDetailFocusMarkersEqual(current, nextMarker) ? current : nextMarker,
      );
    },
    [],
  );
  const activeDiagnosticDetailCount = Math.max(
    0,
    activeDiagnosticDetailItems.length,
  );
  const diagnosticPanelTitle = ttLoose("appText.alerts");
  const miniChartBasePeriod: BaseTimeframe = detailPool?.baseTimeframe ?? "1d";
  const miniHistoryChartDisplayPeriod: BaseTimeframe =
    detailPool?.baseTimeframe ?? "1d";
  const shouldRenderMiniHistoryChart =
    !isLoadingSymbolBars &&
    !activeSymbolBarsLoadFailed &&
    Boolean(activeSymbolHistoryProject);
  const detailWindowResetKey = `${detailPool?.id ?? ""}:${detailWindowTab}:${activeSymbol}:${activeSourceDiagnosticKind}:${focusedDetailItemId}`;
  const miniHistoryChartKey = `${detailPool?.id ?? ""}:${activeSymbol}:${miniHistoryChartDisplayPeriod}`;
  const checkedSymbolSet = useMemo(
    () => new Set(checkedSymbols),
    [checkedSymbols],
  );
  const isAllDetailRowsChecked =
    detailRows.some((row) => !row.locked) &&
    detailRows
      .filter((row) => !row.locked)
      .every((row) => checkedSymbolSet.has(row.symbol));
  return {
    activeDetailBarCount,
    activeDetailSymbolRow,
    activeDiagnosticDetailCount,
    activeDiagnosticDetailEmptyText,
    activeDiagnosticDetailHint,
    activeDiagnosticDetailItems,
    activeDiagnosticDetailTitle,
    activeFocusedDetailItem,
    activeSourceDiagnosticKind,
    activeSymbolBars,
    activeSymbolBarsLoadFailed,
    activeSymbolDiagnostics,
    activeSymbolHistoryProject,
    activeSymbolShowVolumePane,
    activeSymbolTotalBars,
    checkedSymbolSet,
    commitFocusedDetailMarker,
    detailDiagnosticsBaseTimeframe,
    detailDiagnosticsSignature,
    detailDiagnosticsSourceId,
    detailPool,
    detailRows,
    detailSymbols,
    detailWindowResetKey,
    diagnosticPanelTitle,
    focusDetailRequestNonce,
    focusedDetailBarIndex,
    focusedDetailItemId,
    focusedDetailMarker,
    isLoadingSourceDiagnostics,
    isLoadingSymbolBars,
    isAllDetailRowsChecked,
    jumpToDiagnosticDetailBar,
    loadedSourceDiagnosticsSignatureRef,
    miniChartBasePeriod,
    miniHistoryChartDisplayPeriod,
    miniHistoryChartKey,
    setActiveSourceDiagnosticKind,
    setActiveSymbolBars,
    setActiveSymbolBarsLoadFailed,
    setActiveSymbolDiagnostics,
    setFocusDetailRequestNonce,
    setFocusedDetailBarIndex,
    setFocusedDetailItemId,
    setFocusedDetailMarker,
    setIsLoadingSourceDiagnostics,
    setIsLoadingSymbolBars,
    setSourceDiagnostics,
    setSourceDiagnosticsLoadFailed,
    shouldRenderMiniHistoryChart,
    sourceDiagnosticFilterOptions,
    sourceDiagnosticSummaryBySymbol,
    sourceDiagnostics,
    sourceDiagnosticsLoadFailed,
    sourceDiagnosticsLoadedForDetail,
    sourceExtremeAnomalyCount,
    sourceTimeIntegrityCount,
    symbolBarsRangeCacheRef,
    symbolDiagnosticsCacheRef,
  };
};
