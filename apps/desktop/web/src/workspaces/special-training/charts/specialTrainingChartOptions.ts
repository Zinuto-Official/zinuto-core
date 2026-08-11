// SPDX-License-Identifier: GPL-3.0-only

import type {
  FastDecisionCapitalReview,
  FastDecisionCapitalReviewPoint,
} from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import type { EChartsOption } from "echarts";
import { getGlobalTypographyReferencePx } from "@/frontend-kernel/typography";
import type { FastDecisionCapitalAnchorDisplayItem } from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import { clamp, toFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type { SessionReviewTradeMarker } from "@/workspaces/special-training/domain/specialTrainingTypes";
import { resolveFastDecisionCapitalCurveLayout } from "@/workspaces/special-training/fastDecisionCapitalChartLayout";

const withAlpha = (color: string, alpha: number): string => {
  const safeColor = String(color || "").trim();
  const safeAlpha = clamp(alpha, 0, 1);
  const rgbaFn = ["r", "g", "b", "a"].join("");
  if (!safeColor) {
    return `${rgbaFn}(255, 255, 255, ${safeAlpha})`;
  }
  const rgbMatch = safeColor.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
  );
  if (rgbMatch) {
    return `${rgbaFn}(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${safeAlpha})`;
  }
  const hexMatch = safeColor.match(/^#([\da-f]{6}|[\da-f]{3})$/i);
  if (hexMatch) {
    const value = hexMatch[1];
    const expanded =
      value.length === 3
        ? value
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : value;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    return `${rgbaFn}(${red}, ${green}, ${blue}, ${safeAlpha})`;
  }
  return safeColor;
};

export const resolveFastDecisionCapitalTone = (
  totalPnl: number,
): "up" | "down" | "flat" =>
  totalPnl > 1e-9 ? "up" : totalPnl < -1e-9 ? "down" : "flat";

const buildFastDecisionCapitalCurveSeries = (
  curve: FastDecisionCapitalReviewPoint[],
): Array<[number, number]> =>
  curve.map((point) => [point.orderIndex, point.asset]);

const fastDecisionCapitalAxisFormatter = (value: number | string): string => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "";
};

export const resolveFastDecisionCapitalAnchorTone = (
  item: FastDecisionCapitalAnchorDisplayItem,
): "up" | "down" | "final" => {
  const hasFinal = item.mergedKinds.includes("FINAL");
  const hasDrawdown = item.mergedKinds.includes("DRAWDOWN_TROUGH");
  const hasHighWater = item.mergedKinds.includes("HIGH_WATER_MARK");
  if (hasFinal) {
    return "final";
  }
  if (hasDrawdown) {
    return "down";
  }
  if (hasHighWater) {
    return "up";
  }
  return "final";
};

export const buildFastDecisionCapitalCurveOption = (value: {
  review: FastDecisionCapitalReview;
  lineColor: string;
  areaColor: string;
  flatColor: string;
  finalColor: string;
  anchorItems: FastDecisionCapitalAnchorDisplayItem[];
}): EChartsOption | null => {
  const mainSeries = buildFastDecisionCapitalCurveSeries(value.review.curve);
  const layout = resolveFastDecisionCapitalCurveLayout(value.review);
  if (mainSeries.length < 2 || !layout) {
    return null;
  }
  const tone = resolveFastDecisionCapitalTone(value.review.totalPnl);
  const mainColor =
    tone === "up"
      ? value.lineColor
      : tone === "down"
        ? value.areaColor
        : value.flatColor;
  const baselineColor = withAlpha(value.flatColor, 0.24);
  const axisLabelColor = withAlpha(value.flatColor, 0.62);
  const axisLineColor = withAlpha(value.flatColor, 0.18);
  const splitLineColor = withAlpha(value.flatColor, 0.12);
  const axisLabelFontSize = getGlobalTypographyReferencePx("r1");
  const anchorMarkerSeries =
    value.anchorItems.length > 0
      ? [
          {
            type: "scatter" as const,
            data: value.anchorItems.map((item) => {
              const anchorTone = resolveFastDecisionCapitalAnchorTone(item);
              const accentColor =
                anchorTone === "up"
                  ? value.lineColor
                  : anchorTone === "down"
                    ? value.areaColor
                    : value.finalColor;
              return {
                name: item.title,
                value: [item.orderIndex, item.asset],
                symbol: "circle",
                symbolSize: 10,
                itemStyle: {
                  color: accentColor,
                  borderColor: withAlpha(value.flatColor, 0.88),
                  borderWidth: 2,
                  shadowBlur: 10,
                  shadowColor: withAlpha(accentColor, 0.28),
                },
              };
            }),
            silent: true,
            clip: false,
            z: 6,
            tooltip: { show: false },
          },
        ]
      : [];

  return {
    animation: false,
    tooltip: {
      show: false,
    },
    grid: { ...layout.grid, containLabel: false },
    xAxis: {
      type: "value",
      min: 0,
      max: layout.maxX,
      interval: layout.xInterval,
      splitNumber: Math.max(2, Math.round(layout.maxX / layout.xInterval)),
      axisLabel: {
        color: axisLabelColor,
        fontSize: axisLabelFontSize,
        margin: 4,
        formatter: fastDecisionCapitalAxisFormatter,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: axisLineColor,
          width: 1,
        },
      },
      axisTick: {
        show: true,
        length: 3,
        lineStyle: {
          color: axisLineColor,
          width: 1,
        },
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      min: layout.minY,
      max: layout.maxY,
      splitNumber: layout.ySplitNumber,
      scale: true,
      axisLabel: {
        color: axisLabelColor,
        fontSize: axisLabelFontSize,
        inside: true,
        showMinLabel: false,
        align: "left",
        verticalAlign: "top",
        margin: 4,
        padding: [3, 0, 0, 5],
        formatter: fastDecisionCapitalAxisFormatter,
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: splitLineColor,
          width: 1,
        },
      },
    },
    series: [
      {
        type: "line" as const,
        data: [
          [0, value.review.initialAsset],
          [layout.maxX, value.review.initialAsset],
        ],
        showSymbol: false,
        smooth: false,
        silent: true,
        lineStyle: {
          color: baselineColor,
          width: 1.25,
        },
        areaStyle: {
          opacity: 0,
        },
        z: 1,
      },
      {
        type: "line" as const,
        data: mainSeries,
        smooth: 0.18,
        showSymbol: false,
        lineStyle: {
          color: mainColor,
          width: 3,
        },
        areaStyle: {
          color: withAlpha(mainColor, 0.12),
        },
      },
      ...anchorMarkerSeries,
    ] as EChartsOption["series"],
  };
};

export const buildSessionReviewSparklineWindow = (
  values: Array<number | null | undefined>,
  anchorIndex: number,
  endIndex?: number,
): {
  sparkline: number[];
  markerOffset: number;
  windowStartIndex: number;
} => {
  const safeValues = values.filter((value): value is number => Number.isFinite(value));
  if (!safeValues.length) {
    return {
      sparkline: [],
      markerOffset: 0,
      windowStartIndex: 0,
    };
  }

  const safeEndIndex = clamp(
    Number.isFinite(endIndex) ? Math.floor(endIndex as number) : safeValues.length - 1,
    0,
    safeValues.length - 1,
  );
  const safeAnchorIndex = clamp(
    Math.floor(toFiniteNumber(anchorIndex) || 0),
    0,
    safeEndIndex,
  );
  const trailingBars = Math.max(0, safeEndIndex - safeAnchorIndex);
  const desiredLeadingBars = Math.max(0, Math.round((trailingBars + 1) / 3));
  const windowStart = clamp(
    safeAnchorIndex - desiredLeadingBars,
    0,
    safeAnchorIndex,
  );
  const sparkline = safeValues.slice(windowStart, safeEndIndex + 1);
  const markerOffset = Math.max(
    0,
    Math.min(
      Math.max(0, sparkline.length - 0.5),
      safeAnchorIndex - windowStart + 0.5,
    ),
  );

  return {
    sparkline,
    markerOffset,
    windowStartIndex: windowStart,
  };
};

export const buildFastDecisionSparklineOption = (
  values: number[],
  color: string,
  decisionBoundaryOffset: number,
  markerDotColor: string,
  markerDotSize: number,
  markerDotShadowBlur: number,
  options?: {
    showDecisionMarker?: boolean;
    tradeMarkers?: SessionReviewTradeMarker[];
    buyMarkerColor?: string;
    sellMarkerColor?: string;
    pinDecisionMarkerToRatio?: number;
  },
): EChartsOption | null => {
  if (values.length < 2) {
    return null;
  }
  const markPointData: Array<{
    name: string;
    coord: [number, number];
    symbol: "circle";
    symbolSize: number;
    itemStyle: {
      color: string;
      borderColor: string;
      borderWidth: number;
      shadowBlur: number;
      shadowColor?: string;
    };
  }> = [];
  let decisionMarkerData: {
    name: string;
    coord: [number, number];
    symbol: "circle";
    symbolSize: number;
    itemStyle: {
      color: string;
      borderColor: string;
      borderWidth: number;
      shadowBlur: number;
      shadowColor?: string;
    };
  } | null = null;
  const clampedDecisionBoundaryOffset = clamp(
    decisionBoundaryOffset,
    0,
    Math.max(0, values.length - 0.5),
  );
  const decisionMarkerIndex = clamp(
    Math.floor(clampedDecisionBoundaryOffset),
    0,
    Math.max(0, values.length - 1),
  );
  const pinnedDecisionMarkerRatio = Number.isFinite(
    options?.pinDecisionMarkerToRatio,
  )
    ? clamp(options?.pinDecisionMarkerToRatio ?? 0, 0, 1)
    : null;
  const maxDisplayX = Math.max(0, values.length - 1);
  const decisionMarkerDisplayX =
    pinnedDecisionMarkerRatio === null
      ? decisionMarkerIndex
      : maxDisplayX * pinnedDecisionMarkerRatio;
  const resolveDisplayX = (index: number): number => {
    const safeIndex = clamp(index, 0, maxDisplayX);
    if (pinnedDecisionMarkerRatio === null || maxDisplayX <= 0) {
      return safeIndex;
    }
    if (decisionMarkerIndex <= 0) {
      return (
        decisionMarkerDisplayX +
        (safeIndex / maxDisplayX) * (maxDisplayX - decisionMarkerDisplayX)
      );
    }
    if (decisionMarkerIndex >= maxDisplayX) {
      return (safeIndex / maxDisplayX) * decisionMarkerDisplayX;
    }
    if (safeIndex <= decisionMarkerIndex) {
      return (safeIndex / decisionMarkerIndex) * decisionMarkerDisplayX;
    }
    return (
      decisionMarkerDisplayX +
      ((safeIndex - decisionMarkerIndex) /
        Math.max(1, maxDisplayX - decisionMarkerIndex)) *
        (maxDisplayX - decisionMarkerDisplayX)
    );
  };
  const decisionMarkerValue = toFiniteNumber(values[decisionMarkerIndex]);
  if (options?.showDecisionMarker !== false && Number.isFinite(decisionMarkerValue)) {
    decisionMarkerData = {
      name: "decision",
      coord: [resolveDisplayX(decisionMarkerIndex), decisionMarkerValue],
      symbol: "circle",
      symbolSize: markerDotSize,
      itemStyle: {
        color: markerDotColor,
        borderColor: color,
        borderWidth: 2,
        shadowBlur: markerDotShadowBlur,
        shadowColor: markerDotColor,
      },
    };
  }
  (options?.tradeMarkers ?? []).forEach((marker) => {
    const markerValue = toFiniteNumber(marker.value);
    if (!Number.isFinite(markerValue)) {
      return;
    }
    const markerIndex = clamp(
      Math.floor(toFiniteNumber(marker.offset) || 0),
      0,
      Math.max(0, values.length - 1),
    );
    const markerColor =
      marker.side === "BUY"
        ? options?.buyMarkerColor ?? markerDotColor
        : options?.sellMarkerColor ?? markerDotColor;
    markPointData.push({
      name: `${marker.side.toLowerCase()}-${markerIndex}`,
      coord: [resolveDisplayX(markerIndex), markerValue],
      symbol: "circle",
      symbolSize: 6,
      itemStyle: {
        color: markerColor,
        borderColor: markerColor,
        borderWidth: 1,
        shadowBlur: 0,
      },
    });
  });
  if (decisionMarkerData) {
    markPointData.push(decisionMarkerData);
  }
  const lineData = values.map(
    (value, index) => [resolveDisplayX(index), value] as [number, number],
  );
  return {
    animation: false,
    grid: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    tooltip: {
      show: false,
    },
    xAxis: {
      type: "value",
      show: false,
      min: 0,
      max: maxDisplayX,
    },
    yAxis: {
      type: "value",
      show: false,
      scale: true,
    },
    series: [
      {
        type: "line",
        data: lineData,
        smooth: 0.35,
        showSymbol: false,
        lineStyle: {
          color,
          width: 2,
          opacity: 0.92,
        },
        areaStyle: {
          color,
          opacity: 0.14,
        },
        markPoint:
          markPointData.length > 0
            ? {
                silent: true,
                label: { show: false },
                data: markPointData,
              }
            : undefined,
      },
    ],
  };
};
