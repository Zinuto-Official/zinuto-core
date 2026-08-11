// SPDX-License-Identifier: GPL-3.0-only

import {
  createDetachedIndicatorPaneAxis,
  resolveDetachedIndicatorPaneMinHeight,
} from "@/domains/indicators/runtime";
import { resolveIndicatorRuntimeSpec } from "@/domains/indicators/customProfileRegistry";
import {
  registerIndicator,
  type Chart,
  type KLineData,
  type TooltipFeatureStyle,
} from "klinecharts";
import type { BaseTimeframe } from "@/domains/trainer/trainerTypes";
import {
  appendRenderInstructionRangeRows,
  buildCompiledIndicatorFigure,
  buildCompiledIndicatorRenderRangeFigures,
  buildCompiledIndicatorTooltipDataSource,
} from "@/domains/custom-indicator/indicator/chartPresentation";
import { applyMountedIndicatorDisplayPrecision } from "@/domains/indicators/precision";
import {
  buildCompiledIndicatorDrawCallback,
  type IndicatorRenderExtendData,
} from "@/domains/custom-indicator/indicator/renderAdapter";
import {
  getActiveCompiledScriptState,
  getActiveCompiledScriptTooltipFeatures,
  reportCompiledIndicatorRenderIssues,
  setActiveCompiledScriptState,
} from "@/domains/custom-indicator/indicator/compiledIndicatorRenderState";
import { buildCustomIndicatorRuntimeCacheKey } from "@/domains/custom-indicator/indicator/runtimeCacheKey";
import {
  formatRuntimeErrorMessage,
  type CompiledScriptState,
  type ScriptIssueItem,
} from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type {
  CompiledIndicator,
  IndicatorExecutionResult,
  IndicatorParameterDefinition,
} from "@/domains/custom-indicator/indicator/types";
import { normalizeValidationInstrumentSymbol } from "@/workspaces/custom-indicator/validationInstrumentSelection";

export { toKlinePeriod } from "@/domains/chart/chartPeriods";

export const VALIDATION_SYMBOL = "AAPL";

const CUSTOM_VOLUME_INDICATOR_ID = "custom-indicator-system-vol";
const CUSTOM_SCRIPT_INDICATOR_ID = "custom-indicator-system-script";
const CUSTOM_VOLUME_PANE_ID = "volume_pane";
export const CUSTOM_SCRIPT_PANE_ID = "custom_indicator_script_pane";
const CUSTOM_SCRIPT_TARGET_HEIGHT = 240;
const CUSTOM_VOLUME_TARGET_HEIGHT = 60;
const CUSTOM_SCRIPT_MIN_HEIGHT = 86;
const CUSTOM_VOLUME_MIN_HEIGHT = 24;
const CANDLE_MIN_HEIGHT = 140;
const KLINE_CANDLE_PANE_ID = "candle_pane";
const KLINE_X_AXIS_PANE_ID = "x_axis_pane";
const KLINE_X_AXIS_FALLBACK_HEIGHT = 28;
const KLINE_SEPARATOR_FALLBACK_SIZE = 1;
const CUSTOM_SCRIPT_TEMPLATE_NAME = "__ZINUTO_CUSTOM_FORMULA_PREVIEW__";

export const DEFAULT_WORKBENCH_PANEL_RATIO = 0.44;
export const MIN_WORKBENCH_PANEL_RATIO = 0.34;
export const MAX_WORKBENCH_PANEL_RATIO = 0.62;
export const PREVIEW_PANEL_MIN_HEIGHT = 260;
export const WORKBENCH_PANEL_MIN_HEIGHT = 300;

export const buildCompiledScriptMountKey = (
  state: CompiledScriptState,
): string =>
  [
    state.templateName,
    state.displayName,
    state.compiled.definition.source,
    state.calcParams.join(","),
    state.compiled.outputKeys.join(","),
  ].join("|");

const CUSTOM_PANE_RATIO = Object.freeze({
  candle: 0.5,
  volume: 0.1,
  script: 0.4,
});
const CUSTOM_PANE_RATIO_COMPACT = Object.freeze({
  candle: 0.62,
  volume: 0.1,
  script: 0.28,
});
const CUSTOM_PANE_RATIO_MEDIUM = Object.freeze({
  candle: 0.56,
  volume: 0.1,
  script: 0.34,
});

const WORKBENCH_RUNTIME_RESULT_CACHE = new Map<string, IndicatorExecutionResult>();

const reportRenderMessages = (issues: ScriptIssueItem[]) => {
  reportCompiledIndicatorRenderIssues(issues);
};

export const buildInstrumentIdentityKey = (
  symbol: string,
  baseTimeframe: BaseTimeframe,
): string =>
  `${String(baseTimeframe || "").trim().toLowerCase()}::${normalizeValidationInstrumentSymbol(symbol)}`;

export const normalizeKey = (value: string): string => value.trim().toUpperCase();
export const normalizeIndicatorDisplayName = (value: string): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "CUSTOM";
  }
  return trimmed;
};

export const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase();
};

export const parameterInputMapsEqual = (
  definitions: readonly IndicatorParameterDefinition[],
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean =>
  definitions.every((parameter) => {
    const key = String(parameter.name || "").trim().toUpperCase();
    return String(left[key] ?? "").trim() === String(right[key] ?? "").trim();
  });

const buildWorkbenchRuntimeCacheKey = (
  compiled: CompiledIndicator,
  bars: ReturnType<typeof toRuntimeBars>,
  overrides: Record<string, number>,
): string => buildCustomIndicatorRuntimeCacheKey(compiled, bars, overrides);

export const rememberWorkbenchRuntimeResult = (
  compiled: CompiledIndicator,
  bars: ReturnType<typeof toRuntimeBars>,
  overrides: Record<string, number>,
  result: IndicatorExecutionResult,
) => {
  WORKBENCH_RUNTIME_RESULT_CACHE.set(
    buildWorkbenchRuntimeCacheKey(compiled, bars, overrides),
    result,
  );
};

export const readWorkbenchRuntimeResult = (
  compiled: CompiledIndicator,
  bars: ReturnType<typeof toRuntimeBars>,
  overrides: Record<string, number>,
): IndicatorExecutionResult | null =>
  WORKBENCH_RUNTIME_RESULT_CACHE.get(
    buildWorkbenchRuntimeCacheKey(compiled, bars, overrides),
  ) ?? null;

export const toRuntimeBars = (dataList: KLineData[]) =>
  dataList.map((item, index) => ({
    time: Number.isFinite(item.timestamp as number)
      ? Number(item.timestamp)
      : Date.now() + index * 60_000,
    open: Number.isFinite(item.open as number) ? Number(item.open) : Number.NaN,
    high: Number.isFinite(item.high as number) ? Number(item.high) : Number.NaN,
    low: Number.isFinite(item.low as number) ? Number(item.low) : Number.NaN,
    close: Number.isFinite(item.close as number)
      ? Number(item.close)
      : Number.NaN,
    volume: Number.isFinite(item.volume as number)
      ? Number(item.volume)
      : Number.NaN,
  }));

const toIndicatorRows = (
  compiled: CompiledIndicator,
  runtimeOutputs: Record<string, number[]>,
  length: number,
): Record<string, number | null>[] =>
  Array.from({ length }).map((_item, index) => {
    const row: Record<string, number | null> = {};
    compiled.outputKeys.forEach((key) => {
      const value = runtimeOutputs[key]?.[index];
      row[key] = Number.isFinite(value) ? Number(value) : null;
    });
    return row;
  });

const toEmptyRows = (
  outputKeys: string[],
  length: number,
): Record<string, number | null>[] =>
  Array.from({ length }).map(() => {
    const row: Record<string, number | null> = {};
    outputKeys.forEach((key) => {
      row[key] = null;
    });
    return row;
  });

export const toParameterOverrides = (
  compiled: CompiledIndicator,
  calcParams: number[],
): Record<string, number> => {
  const overrides: Record<string, number> = {};
  compiled.definition.parameters.forEach((parameter, index) => {
    const value = Number(calcParams[index]);
    if (Number.isFinite(value)) {
      overrides[normalizeKey(parameter.name)] = value;
    }
  });
  return overrides;
};

export const applyVolumeIndicatorTooltipFeature = (
  chart: Chart,
  feature: TooltipFeatureStyle,
) => {
  const runtimeSpec = resolveIndicatorRuntimeSpec("VOL", []);
  try {
    chart.overrideIndicator({
      id: CUSTOM_VOLUME_INDICATOR_ID,
      name: runtimeSpec.runtimeName,
      styles: {
        tooltip: {
          title: {
            show: false,
            showName: false,
            showParams: false,
          },
          features: [feature],
        },
      },
    } as any);
  } catch {
    // Ignore style overrides when the indicator is not mounted yet.
  }
};

export const ensureCustomScriptIndicatorTemplateRegistered = (
  displayName: string,
) => {
  registerIndicator<Record<string, number | null>, number, IndicatorRenderExtendData>({
    name: CUSTOM_SCRIPT_TEMPLATE_NAME,
    shortName: normalizeIndicatorDisplayName(displayName),
    calcParams: [1],
    precision: 3,
    createTooltipDataSource: (params) => {
      const activeState = getActiveCompiledScriptState<CompiledScriptState>();
      if (!activeState) {
        return {
          name: "",
          calcParamsText: "",
          legends: [],
          features: [],
        };
      }
      const dataSource = buildCompiledIndicatorTooltipDataSource(
        activeState.compiled,
      )(params);
      return {
        ...dataSource,
        name: "",
        calcParamsText: "",
        features: getActiveCompiledScriptTooltipFeatures(),
      };
    },
    figures: [],
    regenerateFigures: () => {
      const activeState = getActiveCompiledScriptState<CompiledScriptState>();
      if (!activeState) {
        return [];
      }
      return activeState.compiled.definition.outputs
        .map((outputDef) => buildCompiledIndicatorFigure(outputDef))
        .filter((figure): figure is NonNullable<typeof figure> => Boolean(figure))
        .concat(buildCompiledIndicatorRenderRangeFigures());
    },
    draw: buildCompiledIndicatorDrawCallback(),
    calc: (dataList, indicator) => {
      const activeState = getActiveCompiledScriptState<CompiledScriptState>();
      if (!activeState) {
        reportRenderMessages([]);
        indicator.extendData = { renderInstructions: [] };
        return [];
      }

      const rawCalcParams = Array.isArray(indicator.calcParams)
        ? indicator.calcParams.map((item) => Number(item))
        : [];
      const overrides = toParameterOverrides(
        activeState.compiled,
        rawCalcParams,
      );

      const runtimeBars = toRuntimeBars(dataList);
      const runtimeResult = readWorkbenchRuntimeResult(
        activeState.compiled,
        runtimeBars,
        overrides,
      );
      if (!runtimeResult) {
        indicator.extendData = { renderInstructions: [] };
        return toEmptyRows(activeState.compiled.outputKeys, dataList.length);
      }
      indicator.extendData = {
        renderInstructions: runtimeResult.renderInstructions,
      };

      if (!runtimeResult.ok) {
        reportRenderMessages(
          runtimeResult.errors.map((error) =>
            formatRuntimeErrorMessage(
              error,
              activeState.compiled.definition.source,
            ),
          ),
        );
        return toEmptyRows(activeState.compiled.outputKeys, dataList.length);
      }

      reportRenderMessages([]);
      return appendRenderInstructionRangeRows(
        toIndicatorRows(
          activeState.compiled,
          runtimeResult.outputs,
          dataList.length,
        ),
        runtimeResult.renderInstructions,
      );
    },
  });
};

export const mountVolumeIndicator = (chart: Chart) => {
  const runtimeSpec = resolveIndicatorRuntimeSpec("VOL", []);
  chart.removeIndicator({ id: CUSTOM_VOLUME_INDICATOR_ID });
  chart.createIndicator(
    {
      id: CUSTOM_VOLUME_INDICATOR_ID,
      name: runtimeSpec.runtimeName,
      calcParams: runtimeSpec.calcParams,
      precision: 0,
    },
    {
      isStack: false,
      pane: {
        id: CUSTOM_VOLUME_PANE_ID,
        height: CUSTOM_VOLUME_TARGET_HEIGHT,
        minHeight: resolveDetachedIndicatorPaneMinHeight(
          CUSTOM_VOLUME_MIN_HEIGHT,
        ),
        dragEnabled: true
      }
    }
  );
};

export const mountCustomScriptIndicator = (
  chart: Chart,
  state: CompiledScriptState,
) => {
  setActiveCompiledScriptState(state);
  const previousScriptPaneHeightRaw = Number(
    chart.getSize(CUSTOM_SCRIPT_PANE_ID)?.height,
  );
  const nextScriptPaneHeight =
    Number.isFinite(previousScriptPaneHeightRaw) &&
    previousScriptPaneHeightRaw > 0
      ? Math.round(previousScriptPaneHeightRaw)
      : CUSTOM_SCRIPT_TARGET_HEIGHT;
  ensureCustomScriptIndicatorTemplateRegistered(state.displayName);
  chart.removeIndicator({ id: CUSTOM_SCRIPT_INDICATOR_ID });
  chart.createIndicator(
    {
      id: CUSTOM_SCRIPT_INDICATOR_ID,
      name: state.templateName,
      calcParams: [...state.calcParams],
      precision: 3,
    },
    {
      isStack: false,
      pane: {
        id: CUSTOM_SCRIPT_PANE_ID,
        height: nextScriptPaneHeight,
        minHeight: Math.min(
          resolveDetachedIndicatorPaneMinHeight(CUSTOM_SCRIPT_MIN_HEIGHT),
          nextScriptPaneHeight,
        ),
        dragEnabled: true
      }
    }
  );
  applyMountedIndicatorDisplayPrecision(chart, CUSTOM_SCRIPT_INDICATOR_ID);
};

export const unmountCustomScriptIndicator = (chart: Chart) => {
  setActiveCompiledScriptState(null);
  chart.removeIndicator({ id: CUSTOM_SCRIPT_INDICATOR_ID });
};

const resolveIndicatorPaneId = (
  chart: Chart,
  indicatorId: string,
  fallbackPaneId: string,
): string => {
  const mountedIndicator = chart.getIndicators({ id: indicatorId })[0] as
    | { paneId?: unknown }
    | undefined;
  const paneId =
    typeof mountedIndicator?.paneId === "string"
      ? mountedIndicator.paneId.trim()
      : "";
  return paneId.length > 0 ? paneId : fallbackPaneId;
};

const hasPane = (chart: Chart, paneId: string): boolean => {
  if (!paneId) {
    return false;
  }
  const paneOptions = chart.getPaneOptions(paneId);
  if (paneOptions && !Array.isArray(paneOptions)) {
    return true;
  }
  const paneHeightRaw = Number(chart.getSize(paneId)?.height);
  return Number.isFinite(paneHeightRaw) && paneHeightRaw > 0;
};

export const applyPaneLayout = (
  chart: Chart,
  containerHeight: number,
  options?: { preserveCurrentRatio?: boolean },
) => {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) {
    return;
  }
  const preserveCurrentRatio = options?.preserveCurrentRatio === true;
  const volumePaneId = resolveIndicatorPaneId(
    chart,
    CUSTOM_VOLUME_INDICATOR_ID,
    CUSTOM_VOLUME_PANE_ID,
  );
  const scriptPaneId = resolveIndicatorPaneId(
    chart,
    CUSTOM_SCRIPT_INDICATOR_ID,
    CUSTOM_SCRIPT_PANE_ID,
  );
  const paneOptions = chart.getPaneOptions();
  const paneList = Array.isArray(paneOptions) ? paneOptions : [];
  const paneIds = paneList
    .map((pane) => (typeof pane.id === "string" ? pane.id.trim() : ""))
    .filter((id): id is string => id.length > 0);
  const hasVolumePane =
    hasPane(chart, volumePaneId) || paneIds.includes(volumePaneId);
  const hasScriptPane =
    hasPane(chart, scriptPaneId) || paneIds.includes(scriptPaneId);
  const excludedPaneIds = new Set<string>([
    volumePaneId,
    scriptPaneId,
    KLINE_X_AXIS_PANE_ID,
  ]);
  const candlePaneId =
    (hasPane(chart, KLINE_CANDLE_PANE_ID) ? KLINE_CANDLE_PANE_ID : null) ??
    paneIds.find((id) => id === KLINE_CANDLE_PANE_ID) ??
    paneIds.find((id) => id.includes("candle")) ??
    paneIds.find((id) => !excludedPaneIds.has(id)) ??
    KLINE_CANDLE_PANE_ID;
  const paneCount = 1 + Number(hasVolumePane) + Number(hasScriptPane);
  const xAxisHeightRaw = Number(chart.getSize(KLINE_X_AXIS_PANE_ID)?.height);
  const xAxisHeight =
    Number.isFinite(xAxisHeightRaw) && xAxisHeightRaw > 0
      ? xAxisHeightRaw
      : KLINE_X_AXIS_FALLBACK_HEIGHT;
  const separatorRaw = Number(
    (chart.getStyles() as { separator?: { size?: number } }).separator?.size,
  );
  const separatorSize =
    Number.isFinite(separatorRaw) && separatorRaw >= 0
      ? separatorRaw
      : KLINE_SEPARATOR_FALLBACK_SIZE;
  const drawableHeight = Math.max(
    1,
    Math.round(
      containerHeight -
        xAxisHeight -
        Math.max(0, paneCount - 1) * separatorSize,
    ),
  );

  const currentCandleHeightRaw = Number(chart.getSize(candlePaneId)?.height);
  const currentVolumeHeightRaw = hasVolumePane
    ? Number(chart.getSize(volumePaneId)?.height)
    : 0;
  const currentScriptHeightRaw = hasScriptPane
    ? Number(chart.getSize(scriptPaneId)?.height)
    : 0;
  const currentHeightsValid =
    Number.isFinite(currentCandleHeightRaw) &&
    currentCandleHeightRaw > 0 &&
    (!hasVolumePane ||
      (Number.isFinite(currentVolumeHeightRaw) &&
        currentVolumeHeightRaw > 0)) &&
    (!hasScriptPane ||
      (Number.isFinite(currentScriptHeightRaw) && currentScriptHeightRaw > 0));
  const currentTotalHeight = currentHeightsValid
    ? currentCandleHeightRaw +
      (hasVolumePane ? currentVolumeHeightRaw : 0) +
      (hasScriptPane ? currentScriptHeightRaw : 0)
    : 0;
  const currentCoverageRatio =
    currentTotalHeight > 0
      ? currentTotalHeight / Math.max(1, drawableHeight)
      : 0;

  const ratioPreset =
    drawableHeight <= 280
      ? CUSTOM_PANE_RATIO_COMPACT
      : drawableHeight <= 380
        ? CUSTOM_PANE_RATIO_MEDIUM
        : CUSTOM_PANE_RATIO;
  const presetWeightCandle = ratioPreset.candle;
  const presetWeightVolume = hasVolumePane ? ratioPreset.volume : 0;
  const presetWeightScript = hasScriptPane ? ratioPreset.script : 0;
  const dynamicWeightCandle =
    currentHeightsValid && currentTotalHeight > 0
      ? currentCandleHeightRaw / currentTotalHeight
      : 0;
  const dynamicWeightVolume =
    hasVolumePane && currentHeightsValid && currentTotalHeight > 0
      ? currentVolumeHeightRaw / currentTotalHeight
      : 0;
  const dynamicWeightScript =
    hasScriptPane && currentHeightsValid && currentTotalHeight > 0
      ? currentScriptHeightRaw / currentTotalHeight
      : 0;
  const dynamicRatioValid =
    currentHeightsValid &&
    currentCoverageRatio > 0.52 &&
    currentCoverageRatio < 1.35 &&
    dynamicWeightCandle >= 0.26 &&
    dynamicWeightCandle <= 0.9 &&
    (!hasVolumePane || dynamicWeightVolume >= 0.05) &&
    (!hasScriptPane || dynamicWeightScript >= 0.12);
  const useDynamicRatio = preserveCurrentRatio && dynamicRatioValid;
  const weightCandle = useDynamicRatio
    ? dynamicWeightCandle
    : presetWeightCandle;
  const weightVolume = useDynamicRatio
    ? dynamicWeightVolume
    : presetWeightVolume;
  const weightScript = useDynamicRatio
    ? dynamicWeightScript
    : presetWeightScript;
  const totalWeight = Math.max(
    0.0001,
    weightCandle + weightVolume + weightScript,
  );

  let candleHeight = Math.max(
    1,
    Math.round((drawableHeight * weightCandle) / totalWeight),
  );
  let volumeHeight = hasVolumePane
    ? Math.max(1, Math.round((drawableHeight * weightVolume) / totalWeight))
    : 0;
  let customHeight = hasScriptPane
    ? Math.max(1, drawableHeight - candleHeight - volumeHeight)
    : 0;

  const minVolumeHeight = hasVolumePane
    ? Math.min(
        CUSTOM_VOLUME_MIN_HEIGHT,
        Math.max(16, Math.floor(drawableHeight * 0.08)),
      )
    : 0;
  const minScriptHeight = hasScriptPane
    ? Math.min(
        CUSTOM_SCRIPT_MIN_HEIGHT,
        Math.max(54, Math.floor(drawableHeight * 0.22)),
      )
    : 0;
  const minCandleHeight = Math.min(
    CANDLE_MIN_HEIGHT,
    Math.max(
      72,
      Math.floor(
        drawableHeight *
          (drawableHeight <= 280 ? 0.58 : drawableHeight <= 380 ? 0.54 : 0.5),
      ),
    ),
  );

  if (hasVolumePane && volumeHeight < minVolumeHeight) {
    const need = minVolumeHeight - volumeHeight;
    volumeHeight += need;
    candleHeight = Math.max(1, candleHeight - need);
  }
  if (hasScriptPane && customHeight < minScriptHeight) {
    const need = minScriptHeight - customHeight;
    customHeight += need;
    candleHeight = Math.max(1, candleHeight - need);
  }
  if (candleHeight < minCandleHeight) {
    let need = minCandleHeight - candleHeight;
    if (hasScriptPane && customHeight > minScriptHeight) {
      const take = Math.min(need, customHeight - minScriptHeight);
      customHeight -= take;
      need -= take;
    }
    if (need > 0 && hasVolumePane && volumeHeight > minVolumeHeight) {
      const take = Math.min(need, volumeHeight - minVolumeHeight);
      volumeHeight -= take;
      need -= take;
    }
    candleHeight = Math.max(1, drawableHeight - volumeHeight - customHeight);
  }

  const remainder =
    drawableHeight - (candleHeight + volumeHeight + customHeight);
  if (remainder !== 0) {
    candleHeight = Math.max(1, candleHeight + remainder);
  }

  if (hasScriptPane) {
    chart.setPaneOptions({
      id: scriptPaneId,
      state: "normal",
      height: customHeight,
      minHeight: Math.min(
        resolveDetachedIndicatorPaneMinHeight(
          minScriptHeight || CUSTOM_SCRIPT_MIN_HEIGHT,
        ),
        customHeight,
      ),
      dragEnabled: true,
      axis: createDetachedIndicatorPaneAxis(true),
    });
  }

  if (hasVolumePane) {
    chart.setPaneOptions({
      id: volumePaneId,
      state: "normal",
      height: volumeHeight,
      minHeight: Math.min(
        resolveDetachedIndicatorPaneMinHeight(
          minVolumeHeight || CUSTOM_VOLUME_MIN_HEIGHT,
        ),
        volumeHeight,
      ),
      dragEnabled: true,
      axis: createDetachedIndicatorPaneAxis(),
    });
  }

  chart.setPaneOptions({
    id: candlePaneId,
    state: "normal",
    height: candleHeight,
    minHeight: Math.min(minCandleHeight, candleHeight),
    dragEnabled: true,
  });
};
