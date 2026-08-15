// SPDX-License-Identifier: GPL-3.0-only

import { api, subscribeDesktopViewportChanges, type ApiDesktopWorkspaceReadModel } from "@/api";
import { createMainChartStyles, type PriceColorMode } from "@/domains/chart/display";
import { attachStableElementResizeObserver, whenElementRenderable, type StableElementResizeObserverHandle } from "@/domains/chart/chartStableResize";
import { buildChartSymbolInfo } from "@/domains/chart/pricePrecision";
import { clearIndicatorTooltipFeatureActiveState } from "@/domains/indicators/tooltipFeatureActiveState";
import { reportAppError } from "@/frontend-kernel/errors/appErrorUtils";
import { CHART_STYLE_COLOR_TOKENS } from "@/ui/theme/visual/chartColorTokens";
import { useTheme } from "@/ui/theme/ThemeProvider";
import { cloneIndicatorDefinitionForEditor } from "@/workspaces/custom-indicator/customIndicatorEditorDefinition";
import { applyPaneLayout, applyVolumeIndicatorTooltipFeature, buildCompiledScriptMountKey, mountCustomScriptIndicator, mountVolumeIndicator, toKlinePeriod, unmountCustomScriptIndicator } from "@/workspaces/custom-indicator/chart/workbenchChartHelpers";
import { readCustomIndicatorSystemDefaults, readCustomIndicatorValidationFacts } from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";
import { CustomIndicatorWorkbenchLayout } from "@/workspaces/custom-indicator/CustomIndicatorWorkbenchLayout";
import { createCustomIndicatorTooltipNameFeature, CUSTOM_INDICATOR_TOOLTIP_TARGET_ACTIVE_SCRIPT, CUSTOM_INDICATOR_TOOLTIP_TARGET_SYSTEM_VOLUME, resolveCustomIndicatorTooltipFeatureTarget } from "@/workspaces/custom-indicator/indicatorTooltipFeature";
import { useCustomIndicatorWorkbenchEditorState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorState";
import { useCustomIndicatorWorkbenchMarketState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchMarketState";
import { useCustomIndicatorWorkbenchState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchState";
import type { CustomIndicatorScriptIssueContext, CustomIndicatorSystemPageProps } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import { attachRafResizeMeasurement } from "@/ui/attachRafResizeMeasurement";
import { resolveKlineLocale } from "@/ui/config/frameworkKlineI18n";
import { resolveValidationLoadMoreState } from "@/workspaces/custom-indicator/validationMarketFrameUi";
import { clearActiveCompiledScriptState, clearActiveCompiledScriptTooltipFeatures, setActiveCompiledScriptState } from "@/domains/custom-indicator/indicator/compiledIndicatorRenderState";
import { init, dispose, type Chart } from "klinecharts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

const VALIDATION_SYMBOL = "AAPL";
const EMPTY_CUSTOM_INDICATOR_DEFINITION = {
  name: "",
  source: "",
  parameters: [],
  outputs: [],
};
const PREVIEW_PANEL_MIN_HEIGHT = 260;
const WORKBENCH_PANEL_MIN_HEIGHT = 280;
const MIN_WORKBENCH_PANEL_RATIO = 0.28;
const MAX_WORKBENCH_PANEL_RATIO = 0.72;
const VALIDATION_PREFETCH_TRIGGER_BARS = 20;

export const CustomIndicatorSystemPage = ({
  isActive = true,
  language,
  ui,
  priceColorMode,
  resolveSamplePoolDisplayName,
}: CustomIndicatorSystemPageProps) => {
  const { resolvedMode } = useTheme();
  const [customIndicatorReadModel, setCustomIndicatorReadModel] =
    useState<ApiDesktopWorkspaceReadModel | null>(null);
  const customIndicatorSystemDefaults = useMemo(
    () => readCustomIndicatorSystemDefaults(customIndicatorReadModel),
    [customIndicatorReadModel],
  );
  const customIndicatorValidationFacts = useMemo(
    () => readCustomIndicatorValidationFacts(customIndicatorReadModel),
    [customIndicatorReadModel],
  );
  const defaultSystemTemplate = useMemo(
    () =>
      customIndicatorSystemDefaults.templates.find(
        (template) =>
          template.id === customIndicatorSystemDefaults.defaultTemplateId,
      ) ??
      customIndicatorSystemDefaults.templates[0] ??
      null,
    [customIndicatorSystemDefaults],
  );
  const defaultDefinition = useMemo(
    () =>
      cloneIndicatorDefinitionForEditor(
        defaultSystemTemplate?.definition ?? EMPTY_CUSTOM_INDICATOR_DEFINITION,
      ),
    [defaultSystemTemplate],
  );
  const systemVolumeTemplateId =
    customIndicatorSystemDefaults.volumeTemplateId ?? "VOL";
  const indicatorTooltipFeatureColor =
    resolvedMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.main.tickTextDark
      : CHART_STYLE_COLOR_TOKENS.main.tickTextLight;
  const indicatorTooltipFeatureActiveColor =
    resolvedMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryDark
      : CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryLight;
  const indicatorTooltipFeatureBackground =
    CHART_STYLE_COLOR_TOKENS.curve.transparent;
  const volumeTooltipFeature = useMemo(
    () =>
      createCustomIndicatorTooltipNameFeature({
        target: CUSTOM_INDICATOR_TOOLTIP_TARGET_SYSTEM_VOLUME,
        label: systemVolumeTemplateId,
        color: indicatorTooltipFeatureColor,
        activeColor: indicatorTooltipFeatureActiveColor,
        backgroundColor: indicatorTooltipFeatureBackground,
      }),
    [
      indicatorTooltipFeatureActiveColor,
      indicatorTooltipFeatureBackground,
      indicatorTooltipFeatureColor,
      systemVolumeTemplateId,
    ],
  );
  const mainPanelRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [validationChartReadyVersion, setValidationChartReadyVersion] = useState(0);
  const validationChartResizeHandleRef =
    useRef<StableElementResizeObserverHandle | null>(null);
  const requestValidationChartLayoutRef = useRef<
    (preserveCurrentRatio?: boolean) => void
  >(() => undefined);
  const pendingValidationPaneRatioPreserveRef = useRef(true);
  const appliedValidationChartSymbolRef = useRef("");
  const appliedValidationChartPeriodRef = useRef<string>("");
  const mountedCustomScriptStateKeyRef = useRef("");
  const latestCompiledScriptStateRef = useRef<
    ReturnType<typeof useCustomIndicatorWorkbenchEditorState>["compiledScriptState"]
  >(null);
  const refreshActiveScriptPreviewRef = useRef<
    (context?: CustomIndicatorScriptIssueContext) => void | Promise<void>
  >(() => undefined);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const indicatorTooltipFeatureClickHandlerRef = useRef<
    (payload: unknown) => void
  >(() => undefined);

  const reportCustomIndicatorError = useCallback(
    (error: unknown, context: "market-load", fallback?: string) => {
      console.error("[custom-indicator] market data load failed", {
        context,
        fallback,
        error,
      });
      const message = ui.customIndicatorDataLoadFailed;
      reportAppError(message, { fallbackMessage: message });
      return message;
    },
    [ui.customIndicatorDataLoadFailed],
  );
  const noopAppendConsoleLog = useCallback(() => undefined, []);

  const market = useCustomIndicatorWorkbenchMarketState({
    language,
    ui,
    customIndicatorValidationFacts,
    setCustomIndicatorReadModel,
    appendConsoleLog: noopAppendConsoleLog,
    reportCustomIndicatorError,
    resolveSamplePoolDisplayName,
  });
  const state = useCustomIndicatorWorkbenchState({
    customIndicatorSystemDefaults,
  });
  const editor = useCustomIndicatorWorkbenchEditorState({
    isActive,
    language,
    ui,
    resolvedMode: resolvedMode === "dark" ? "dark" : "light",
    defaultDefinition,
    activeValidationSymbol: market.activeValidationSymbol || VALIDATION_SYMBOL,
    marketRunContextKey: [
      market.activeValidationSymbol,
      market.effectiveValidationDisplayPeriod,
      market.marketLoadState,
      market.marketDataVersionToken,
    ].join(":"),
    indicatorTooltipFeatureColor,
    indicatorTooltipFeatureActiveColor,
    indicatorTooltipFeatureBackground,
    chartDataRef: market.chartDataRef,
    chartRef,
    chartContainerRef,
    requestValidationChartLayoutRef,
    mountedCustomScriptStateKeyRef,
    state,
  });

  useEffect(() => {
    latestCompiledScriptStateRef.current = editor.compiledScriptState;
    if (!isActive) {
      return;
    }
    setActiveCompiledScriptState(editor.compiledScriptState);
  }, [editor.compiledScriptState, isActive]);

  useEffect(() => {
    refreshActiveScriptPreviewRef.current = editor.refreshActiveScriptPreview;
  }, [editor.refreshActiveScriptPreview]);

  useEffect(() => {
    return () => clearActiveCompiledScriptState();
  }, []);

  useEffect(
    () => () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (isActive) {
      return;
    }
    panelResizeCleanupRef.current?.();
    panelResizeCleanupRef.current = null;
    editor.setIsWorkbenchResizing(false);
  }, [editor.setIsWorkbenchResizing, isActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const panel = mainPanelRef.current;
    if (!panel) {
      return;
    }
    let detachViewportChanges = () => {};
    let viewportFrameId = 0;
    const applyWorkbenchLayout = () => {
      editor.codeEditorViewRef.current?.requestMeasure();
      requestValidationChartLayoutRef.current(true);
    };
    const detachPanelResizeMeasurement = attachRafResizeMeasurement(
      panel,
      applyWorkbenchLayout,
    );
    let disposed = false;
    const handleViewportChange = () => {
      if (viewportFrameId) {
        return;
      }
      viewportFrameId = window.requestAnimationFrame(() => {
        viewportFrameId = 0;
        applyWorkbenchLayout();
      });
    };
    void subscribeDesktopViewportChanges(handleViewportChange).then((detach) => {
      if (disposed) {
        detach();
        return;
      }
      detachViewportChanges = detach;
    });
    applyWorkbenchLayout();
    return () => {
      disposed = true;
      if (viewportFrameId) {
        window.cancelAnimationFrame(viewportFrameId);
      }
      detachPanelResizeMeasurement();
      detachViewportChanges();
    };
  }, [editor.codeEditorViewRef, isActive]);

  useLayoutEffect(() => {
    if (!isActive) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      editor.codeEditorViewRef.current?.requestMeasure();
      requestValidationChartLayoutRef.current(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    editor.codeEditorViewRef,
    editor.isDiagnosticsDrawerOpen,
    editor.isInspectorCollapsed,
    isActive,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) {
      return;
    }
    const nextSymbol = market.activeValidationSymbol || VALIDATION_SYMBOL;
    const nextPeriod = market.effectiveValidationDisplayPeriod;
    if (appliedValidationChartPeriodRef.current !== nextPeriod) {
      chart.setPeriod(toKlinePeriod(nextPeriod));
      appliedValidationChartPeriodRef.current = nextPeriod;
    }
    if (appliedValidationChartSymbolRef.current !== nextSymbol) {
      chart.setSymbol(buildChartSymbolInfo(nextSymbol, market.chartDataRef.current));
      appliedValidationChartSymbolRef.current = nextSymbol;
    }
    chart.resetData();
    chart.setOffsetRightDistance(0);
    chart.scrollToRealTime(0);
    requestValidationChartLayoutRef.current(false);
  }, [
    market.activeValidationSymbol,
    market.chartDataRef,
    market.effectiveValidationDisplayPeriod,
    market.marketDataResetToken,
    validationChartReadyVersion,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container || !latestCompiledScriptStateRef.current) {
      return;
    }
    void refreshActiveScriptPreviewRef.current("script-restore");
  }, [market.marketDataVersionToken, validationChartReadyVersion]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !isActive) {
      return;
    }
    const runValidationChartInit = (container: HTMLDivElement): (() => void) | undefined => {
      const chart = init(container, {
        locale: resolveKlineLocale(language),
        timezone: "Asia/Shanghai",
        styles: createMainChartStyles(
          resolvedMode,
          priceColorMode as PriceColorMode,
          undefined,
          undefined,
          language,
        ) as any,
      });
      if (!chart) {
        return;
      }
      const initialSymbol = market.activeValidationSymbol || VALIDATION_SYMBOL;
      const initialPeriod = market.effectiveValidationDisplayPeriod;
      chart.setSymbol(buildChartSymbolInfo(initialSymbol, market.chartDataRef.current));
      appliedValidationChartSymbolRef.current = initialSymbol;
      chart.setPeriod(toKlinePeriod(initialPeriod));
      appliedValidationChartPeriodRef.current = initialPeriod;
      chart.setDataLoader({
        getBars: async ({ type, callback }) => {
          if (type === "init") {
            callback(
              market.chartDataRef.current,
              resolveValidationLoadMoreState(market.marketFrameMetaRef.current),
            );
            return;
          }
          if (type === "backward" || type === "forward") {
            const result = await market.loadMoreValidationBarsRef.current(type);
            callback(result.data, {
              backward: result.hasBackward,
              forward: result.hasForward,
            });
            return;
          }
          callback(
            market.chartDataRef.current,
            resolveValidationLoadMoreState(market.marketFrameMetaRef.current),
          );
        },
      });
      const validationPrefetchTimers = new Set<number>();
      const scheduleValidationPrefetch = (direction: "backward" | "forward") => {
        const timer = window.setTimeout(() => {
          validationPrefetchTimers.delete(timer);
          void market.prefetchValidationBarsRef.current(direction);
        }, 0);
        validationPrefetchTimers.add(timer);
      };
      const readVisibleRangeIndex = (
        range: Record<string, unknown> | undefined,
        primaryKey: "from" | "to",
        fallbackKey: "realFrom" | "realTo",
      ) => {
        const value = Number(range?.[primaryKey] ?? range?.[fallbackKey]);
        return Number.isFinite(value) ? Math.floor(value) : null;
      };
      const handleValidationVisibleRangeChange = () => {
        const currentMeta = market.marketFrameMetaRef.current;
        const dataLength = market.chartDataRef.current.length;
        if (!currentMeta || dataLength <= 0) {
          return;
        }
        const visibleRange = chart.getVisibleRange?.() as unknown as
          | Record<string, unknown>
          | undefined;
        const visibleFrom = readVisibleRangeIndex(visibleRange, "from", "realFrom");
        const visibleTo = readVisibleRangeIndex(visibleRange, "to", "realTo");
        if (
          visibleFrom !== null &&
          visibleFrom <= VALIDATION_PREFETCH_TRIGGER_BARS &&
          currentMeta.hasBackward
        ) {
          scheduleValidationPrefetch("backward");
        }
        if (
          visibleTo !== null &&
          visibleTo >= dataLength - 1 - VALIDATION_PREFETCH_TRIGGER_BARS &&
          currentMeta.hasForward
        ) {
          scheduleValidationPrefetch("forward");
        }
      };
      chart.subscribeAction("onZoom", handleValidationVisibleRangeChange);
      chart.subscribeAction("onVisibleRangeChange", handleValidationVisibleRangeChange);
      chart.setRightMinVisibleBarCount(3);
      chart.setOffsetRightDistance(0);
      chart.scrollToRealTime();
      mountVolumeIndicator(chart);
      applyVolumeIndicatorTooltipFeature(chart, volumeTooltipFeature);
      const latestCompiledScriptState = latestCompiledScriptStateRef.current;
      if (latestCompiledScriptState) {
        mountCustomScriptIndicator(chart, latestCompiledScriptState);
        mountedCustomScriptStateKeyRef.current = buildCompiledScriptMountKey(
          latestCompiledScriptState,
        );
      }
      chartRef.current = chart;
      const handleIndicatorTooltipFeatureClick = (payload?: unknown) => {
        indicatorTooltipFeatureClickHandlerRef.current(payload);
        const paneId =
          typeof (payload as { paneId?: unknown })?.paneId === "string"
            ? String((payload as { paneId?: string }).paneId).trim()
            : "";
        clearIndicatorTooltipFeatureActiveState(chart, paneId || null);
      };
      chart.subscribeAction(
        "onIndicatorTooltipFeatureClick",
        handleIndicatorTooltipFeatureClick,
      );
      const applyLayout = () => {
        chart.resize();
        applyPaneLayout(chart, container.clientHeight, {
          preserveCurrentRatio: pendingValidationPaneRatioPreserveRef.current,
        });
        pendingValidationPaneRatioPreserveRef.current = true;
      };
      const resizeObserverHandle = attachStableElementResizeObserver(
        container,
        applyLayout,
      );
      validationChartResizeHandleRef.current = resizeObserverHandle;
      requestValidationChartLayoutRef.current = (preserveCurrentRatio = true) => {
        pendingValidationPaneRatioPreserveRef.current = preserveCurrentRatio;
        resizeObserverHandle.force();
      };
      requestValidationChartLayoutRef.current(true);
      setValidationChartReadyVersion((current) => current + 1);
      return () => {
        resizeObserverHandle.disconnect();
        requestValidationChartLayoutRef.current = () => undefined;
        chart.unsubscribeAction(
          "onIndicatorTooltipFeatureClick",
          handleIndicatorTooltipFeatureClick,
        );
        chart.unsubscribeAction("onZoom", handleValidationVisibleRangeChange);
        chart.unsubscribeAction(
          "onVisibleRangeChange",
          handleValidationVisibleRangeChange,
        );
        validationPrefetchTimers.forEach((timer) => window.clearTimeout(timer));
        clearActiveCompiledScriptTooltipFeatures();
        chartRef.current = null;
        appliedValidationChartSymbolRef.current = "";
        appliedValidationChartPeriodRef.current = "";
        mountedCustomScriptStateKeyRef.current = "";
        try {
          dispose(chart);
        } catch {
          // ignore
        }
      };
    };
    return whenElementRenderable(container, () => runValidationChartInit(container));
  }, [
    isActive,
    language,
    market.chartDataRef,
    market.loadMoreValidationBarsRef,
    market.marketFrameMetaRef,
    market.prefetchValidationBarsRef,
    priceColorMode,
    resolvedMode,
    volumeTooltipFeature,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart) {
      return;
    }
    if (!editor.compiledScriptState) {
      if (mountedCustomScriptStateKeyRef.current) {
        unmountCustomScriptIndicator(chart);
        mountedCustomScriptStateKeyRef.current = "";
      }
      if (container) {
        applyPaneLayout(chart, container.clientHeight, {
          preserveCurrentRatio: false,
        });
        requestValidationChartLayoutRef.current(false);
      }
      return;
    }
    if (!container) {
      return;
    }
    const nextMountKey = buildCompiledScriptMountKey(editor.compiledScriptState);
    if (mountedCustomScriptStateKeyRef.current === nextMountKey) {
      return;
    }
    mountCustomScriptIndicator(chart, editor.compiledScriptState);
    mountedCustomScriptStateKeyRef.current = nextMountKey;
    applyPaneLayout(chart, container.clientHeight, {
      preserveCurrentRatio: false,
    });
    requestValidationChartLayoutRef.current(false);
  }, [editor.compiledScriptState]);

  useEffect(() => {
    indicatorTooltipFeatureClickHandlerRef.current = (payload: unknown) => {
      const featureId =
        typeof (payload as { feature?: { id?: unknown } })?.feature?.id ===
        "string"
          ? String((payload as { feature?: { id?: string } }).feature?.id)
          : "";
      const featureTarget = resolveCustomIndicatorTooltipFeatureTarget(featureId);
      if (!featureTarget) {
        return;
      }
      editor.setIsInspectorCollapsed(false);
      if (featureTarget === CUSTOM_INDICATOR_TOOLTIP_TARGET_SYSTEM_VOLUME) {
        const volumeTemplate =
          state.effectiveSystemTemplates.find(
            (template) => template.id === systemVolumeTemplateId,
          ) ?? null;
        if (!volumeTemplate) {
          return;
        }
        state.expandManagerGroup("system");
        void editor.loadSystemDefaultTemplate(volumeTemplate);
        return;
      }
      if (featureTarget === CUSTOM_INDICATOR_TOOLTIP_TARGET_ACTIVE_SCRIPT) {
        state.expandManagerGroup(
          state.activeIndicatorGroup === "custom" ? "custom" : "system",
        );
      }
    };
  }, [editor, state, systemVolumeTemplateId]);

  const clampWorkbenchPanelRatio = useCallback(
    (nextRatio: number) =>
      Math.min(MAX_WORKBENCH_PANEL_RATIO, Math.max(MIN_WORKBENCH_PANEL_RATIO, nextRatio)),
    [],
  );
  const handleWorkbenchResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      event.preventDefault();
      editor.setWorkbenchPanelRatio((current) =>
        clampWorkbenchPanelRatio(
          current + (event.key === "ArrowUp" ? 0.03 : -0.03),
        ),
      );
    },
    [clampWorkbenchPanelRatio, editor],
  );
  const handleWorkbenchResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isActive) {
        return;
      }
      const panel = mainPanelRef.current;
      if (!panel) {
        return;
      }
      const bounds = panel.getBoundingClientRect();
      const totalHeight = Math.max(
        bounds.height,
        PREVIEW_PANEL_MIN_HEIGHT + WORKBENCH_PANEL_MIN_HEIGHT,
      );
      const minWorkbenchHeight = Math.min(
        WORKBENCH_PANEL_MIN_HEIGHT,
        totalHeight - PREVIEW_PANEL_MIN_HEIGHT,
      );
      const maxWorkbenchHeight = Math.max(
        minWorkbenchHeight,
        totalHeight - PREVIEW_PANEL_MIN_HEIGHT,
      );
      const resolveRatio = (clientY: number) => {
        const nextWorkbenchHeight = Math.max(
          minWorkbenchHeight,
          Math.min(bounds.bottom - clientY, maxWorkbenchHeight),
        );
        return clampWorkbenchPanelRatio(nextWorkbenchHeight / totalHeight);
      };
      const handlePointerMove = (moveEvent: PointerEvent) => {
        editor.setWorkbenchPanelRatio(resolveRatio(moveEvent.clientY));
      };
      const detachResizeListeners = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
        if (panelResizeCleanupRef.current === detachResizeListeners) {
          panelResizeCleanupRef.current = null;
        }
      };
      const stopResizing = () => {
        editor.setIsWorkbenchResizing(false);
        detachResizeListeners();
      };
      event.preventDefault();
      panelResizeCleanupRef.current?.();
      editor.setIsWorkbenchResizing(true);
      editor.setWorkbenchPanelRatio(resolveRatio(event.clientY));
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
      panelResizeCleanupRef.current = detachResizeListeners;
    },
    [clampWorkbenchPanelRatio, editor, isActive],
  );

  const openIndicatorReferenceWindow = useCallback(() => {
    void api
      .openDesktopSecondaryWindow({
        kind: "INDICATOR_REFERENCE",
        title: ui.customIndicatorRulesTitle,
        payload: null,
      })
      .catch((error) => {
        console.error("[custom-indicator] reference window failed", error);
        reportAppError(ui.customIndicatorRulesTitle, {
          fallbackMessage: ui.customIndicatorRulesTitle,
        });
      });
  }, [ui.customIndicatorRulesTitle]);

  return (
    <CustomIndicatorWorkbenchLayout
      language={language}
      ui={ui}
      state={state}
      editor={editor}
      market={market}
      mainPanelRef={mainPanelRef}
      chartContainerRef={chartContainerRef}
      isWorkbenchResizing={editor.isWorkbenchResizing}
      handleWorkbenchResizeKeyDown={handleWorkbenchResizeKeyDown}
      handleWorkbenchResizeStart={handleWorkbenchResizeStart}
      openIndicatorReferenceWindow={openIndicatorReferenceWindow}
    />
  );
};
