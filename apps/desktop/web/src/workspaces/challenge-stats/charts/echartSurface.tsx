// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  AxisPointerComponent,
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

use([
  AxisPointerComponent,
  BarChart,
  BrushComponent,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  HeatmapChart,
  LegendComponent,
  LineChart,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  PieChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

type BrushPayload = {
  batch?: Array<{
    selected?: Array<{
      dataIndex?: number[];
    }>;
  }>;
};

type ClickPayload = {
  dataIndex?: number;
};

export type EChartSurfaceProps = {
  option: EChartsOption;
  className: string;
  isActive?: boolean;
  onBrushDataIndexChange?: (indexes: number[]) => void;
  onPointClick?: (dataIndex: number) => void;
  onPointHoverChange?: (dataIndex: number | null) => void;
};

type EChartTooltipOption = NonNullable<EChartsOption["tooltip"]>;
type EChartTooltipAppendTarget =
  | string
  | HTMLElement
  | ((chartContainer: HTMLElement) => HTMLElement | undefined | null);

export const normalizeBrushDataIndexes = (payload: unknown): number[] => {
  const casted = payload as BrushPayload;
  const result: number[] = [];
  const batch = Array.isArray(casted?.batch) ? casted.batch : [];
  for (const item of batch) {
    const selected = Array.isArray(item?.selected) ? item.selected : [];
    for (const selectedItem of selected) {
      const dataIndexes = Array.isArray(selectedItem?.dataIndex)
        ? selectedItem.dataIndex
        : [];
      for (const dataIndex of dataIndexes) {
        if (!Number.isFinite(dataIndex)) {
          continue;
        }
        result.push(Math.max(0, Math.floor(dataIndex)));
      }
    }
  }
  return Array.from(new Set(result));
};

const CANVAS_COLOR_VALUE_PATTERN =
  /^(#|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\(|color-mix\(|var\(|transparent\b|currentcolor\b)/i;

const normalizeCanvasSafeColor = (
  rawValue: string,
  scopeHost: Element | null,
): string => {
  const candidate = String(rawValue || "").trim();
  if (
    !candidate ||
    typeof document === "undefined" ||
    typeof document.createElement !== "function" ||
    !CANVAS_COLOR_VALUE_PATTERN.test(candidate)
  ) {
    return candidate;
  }

  const parentHost =
    scopeHost && typeof (scopeHost as Element).appendChild === "function"
      ? scopeHost
      : document.body ?? document.documentElement;
  if (!parentHost || typeof parentHost.appendChild !== "function") {
    return candidate;
  }

  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.color = candidate;
  parentHost.appendChild(probe);
  const normalized = getComputedStyle(probe).color.trim();
  probe.remove();
  return normalized || candidate;
};

export const resolveCssTokenColor = (tokenName: string): string => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "currentColor";
  }

  const candidateHosts: Element[] = [];
  if (typeof document.querySelectorAll === "function") {
    candidateHosts.push(
      ...Array.from(
        document.querySelectorAll(
          ".workspace-page, .app-root.theme-dark, .app-root.theme-light, .app-root",
        ),
      ),
    );
  } else {
    const themedHost = document.querySelector(
      ".app-root.theme-dark, .app-root.theme-light, .app-root",
    );
    if (themedHost) {
      candidateHosts.push(themedHost);
    }
  }
  if (document.documentElement) {
    candidateHosts.push(document.documentElement);
  }

  const seenHosts = new Set<Element>();
  for (const host of candidateHosts) {
    if (!host || seenHosts.has(host)) {
      continue;
    }
    seenHosts.add(host);
    const value = getComputedStyle(host).getPropertyValue(tokenName).trim();
    if (!value) {
      continue;
    }
    return normalizeCanvasSafeColor(value, host);
  }

  return "currentColor";
};

const normalizeEscapingTooltipOption = (
  tooltip: EChartTooltipOption,
): EChartTooltipOption => {
  const applyDefaults = (item: unknown) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    const typedItem = item as {
      appendTo?: EChartTooltipAppendTarget;
      confine?: boolean;
      renderMode?: "html" | "richText" | "auto";
    };
    return {
      ...typedItem,
      renderMode: typedItem.renderMode ?? "html",
      appendTo: typedItem.appendTo ?? "body",
      confine: false,
    };
  };

  if (Array.isArray(tooltip)) {
    return tooltip.map((item) => applyDefaults(item)) as EChartTooltipOption;
  }
  return applyDefaults(tooltip) as EChartTooltipOption;
};

const normalizeChartOption = (option: EChartsOption): EChartsOption => {
  if (!option.tooltip) {
    return option;
  }
  return {
    ...option,
    tooltip: normalizeEscapingTooltipOption(option.tooltip),
  };
};

export const EChartSurface = ({
  option,
  className,
  isActive = true,
  onBrushDataIndexChange,
  onPointClick,
  onPointHoverChange,
}: EChartSurfaceProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const onBrushDataIndexChangeRef = useRef<
    EChartSurfaceProps["onBrushDataIndexChange"]
  >(onBrushDataIndexChange);
  const onPointClickRef =
    useRef<EChartSurfaceProps["onPointClick"]>(onPointClick);
  const onPointHoverChangeRef =
    useRef<EChartSurfaceProps["onPointHoverChange"]>(onPointHoverChange);
  const scheduleResizeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onBrushDataIndexChangeRef.current = onBrushDataIndexChange;
  }, [onBrushDataIndexChange]);

  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  useEffect(() => {
    onPointHoverChangeRef.current = onPointHoverChange;
  }, [onPointHoverChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const chart = init(host);
    chartRef.current = chart;
    let rafResizeId = 0;
    let lastWidth = -1;
    let lastHeight = -1;

    const resizeChart = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }
      if (width === lastWidth && height === lastHeight) {
        return;
      }
      lastWidth = width;
      lastHeight = height;
      chart.resize({
        width,
        height,
      });
    };

    const scheduleResize = () => {
      if (rafResizeId) {
        cancelAnimationFrame(rafResizeId);
      }
      rafResizeId = requestAnimationFrame(() => {
        resizeChart();
      });
    };
    scheduleResizeRef.current = scheduleResize;

    const handleBrush = (payload: unknown) => {
      const onBrush = onBrushDataIndexChangeRef.current;
      if (!onBrush) {
        return;
      }
      onBrush(normalizeBrushDataIndexes(payload));
    };

    const handleClick = (payload: unknown) => {
      const onPoint = onPointClickRef.current;
      if (!onPoint) {
        return;
      }
      const casted = payload as ClickPayload;
      const indexRaw = Number(casted?.dataIndex);
      if (!Number.isFinite(indexRaw)) {
        return;
      }
      onPoint(Math.max(0, Math.floor(indexRaw)));
    };

    const handleHover = (payload: unknown) => {
      const onHover = onPointHoverChangeRef.current;
      if (!onHover) {
        return;
      }
      const casted = payload as ClickPayload;
      const indexRaw = Number(casted?.dataIndex);
      if (!Number.isFinite(indexRaw)) {
        onHover(null);
        return;
      }
      onHover(Math.max(0, Math.floor(indexRaw)));
    };

    const handleGlobalOut = () => {
      onPointHoverChangeRef.current?.(null);
    };

    chart.on("brushSelected", handleBrush);
    chart.on("click", handleClick);
    chart.on("mousemove", handleHover);
    chart.on("globalout", handleGlobalOut);

    const resizeObserver = new ResizeObserver(() => {
      scheduleResize();
    });
    resizeObserver.observe(host);

    scheduleResize();

    return () => {
      if (rafResizeId) {
        cancelAnimationFrame(rafResizeId);
      }
      scheduleResizeRef.current = () => undefined;
      resizeObserver.disconnect();
      chart.off("brushSelected", handleBrush);
      chart.off("click", handleClick);
      chart.off("mousemove", handleHover);
      chart.off("globalout", handleGlobalOut);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleWindowResize = () => {
      scheduleResizeRef.current();
    };
    window.addEventListener("resize", handleWindowResize);
    scheduleResizeRef.current();
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [isActive]);

  const pendingOptionRef = useRef<EChartsOption | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    if (!isActive) {
      pendingOptionRef.current = option;
      return;
    }
    const nextOption = pendingOptionRef.current ?? option;
    pendingOptionRef.current = null;
    chart.setOption(normalizeChartOption(nextOption), {
      notMerge: true,
      lazyUpdate: true,
    });
    scheduleResizeRef.current();
  }, [isActive, option]);

  return <div className={className} ref={hostRef} />;
};
