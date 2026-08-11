// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { formatMoney } from "@/ui/formatting/format";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import {
  getSpecialTrainingPageContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import { getGlobalTypographyReferencePx } from "@/frontend-kernel/typography";
import { resolveValueAxisExtent } from "@/workspaces/challenge-stats/charts/valueAxis";
import { resolveCssTokenColor } from "@/workspaces/challenge-stats/charts/echartSurface";
import type { resolveChallengeStatsDashboardSnapshot } from "@/workspaces/challenge-stats/challengeStatsDashboardSnapshot";
import {
  FAST_DECISION_MAX_SECONDS,
  RISK_CURVE_MAX_SERIES,
  type FastDirectionSelection,
  type FastSessionMetric,
  type RiskBehaviorType,
  type RiskSessionMetric,
  type SessionWindowPreset,
  average,
  clampNumber,
  formatBarsValue,
  formatEdgeRatioText,
  formatPercentText,
  formatSecondsText,
  formatSignedPercentText,
  formatTemplate,
  resolveRiskCurveAxisExtents,
  snapAxisValue,
} from "@/workspaces/challenge-stats/challengeFusionDashboardModel";

type ChallengeFusionChartOptionsInput = {
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  dashboardInsights: ReturnType<
    typeof resolveChallengeStatsDashboardSnapshot
  >["dashboardInsights"];
  fastBiasStats: {
    longShare: number;
    shortShare: number;
  };
  fastSessions: FastSessionMetric[];
  isRiskMode: boolean;
  language: AppUiLanguage;
  percentSymbol: string;
  rangePreset: SessionWindowPreset;
  riskSessions: RiskSessionMetric[];
  executionEdgeRatioLabel: string;
};

const escapeTooltipHtml = (value: string): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const useChallengeFusionChartOptions = ({
  content,
  dashboardInsights,
  fastBiasStats,
  fastSessions,
  isRiskMode,
  language,
  percentSymbol,
  rangePreset,
  riskSessions,
  executionEdgeRatioLabel,
}: ChallengeFusionChartOptionsInput): {
  fastBiasOption: EChartsOption;
  fastScatterOption: EChartsOption;
  riskBehaviorOption: EChartsOption;
  riskCurveOption: EChartsOption;
} => {
  const pricePositiveColor = resolveCssTokenColor("--price-up-color");
  const priceNegativeColor = resolveCssTokenColor("--price-down-color");
  const activeAccentColor = isRiskMode
    ? pricePositiveColor
    : resolveCssTokenColor("--visual-warning-accent");
  const tradeBuyColor = resolveCssTokenColor("--trade-buy-color");
  const tradeSellColor = resolveCssTokenColor("--trade-sell-color");
  const mutedColor = resolveCssTokenColor("--text-subtle");
  const axisTextColor = resolveCssTokenColor("--text-subtle");
  const axisLineColor = resolveCssTokenColor("--line");
  const panelColor = resolveCssTokenColor("--panel");
  const tooltipFontSize = getGlobalTypographyReferencePx("r1");
  const selectionLabelMap: Record<FastDirectionSelection, string> = {
    LONG: content.decisionDirectionUpLabel,
    SHORT: content.decisionDirectionDownLabel,
    OBSERVE: content.decisionDirectionRangeLabel,
  };
  const behaviorLabelMap: Record<RiskBehaviorType, string> = {
    CUT_LOSS: content.challengeDashboardRiskBehaviorCutLabel,
    ADD_POSITION: content.challengeDashboardRiskBehaviorAddLabel,
    FREEZE: content.challengeDashboardRiskBehaviorFreezeLabel,
  };

  const fastScatterAxisExtents = useMemo(() => {
    const decisionSeconds = fastSessions.map((session) => session.decisionSeconds);
    const performanceValues = fastSessions.map(
      (session) => session.performanceRate * 100,
    );
    if (!decisionSeconds.length || !performanceValues.length) {
      return {
        xMin: 0,
        xMax: FAST_DECISION_MAX_SECONDS,
        yMin: -10,
        yMax: 10,
      };
    }
    const xExtent = resolveValueAxisExtent(decisionSeconds, {
      paddingTopRatio: 0.18,
      paddingBottomRatio: 0.08,
      preferZeroBoundary: true,
      paddingMode: "value",
    });
    const yExtent = resolveValueAxisExtent(performanceValues, {
      paddingTopRatio: 0.16,
      paddingBottomRatio: 0.16,
    });
    return {
      xMin: 0,
      xMax: Math.min(
        FAST_DECISION_MAX_SECONDS,
        Math.max(2, snapAxisValue(Math.max(0, xExtent.max), 0.5, "up")),
      ),
      yMin: snapAxisValue(yExtent.min, 5, "down"),
      yMax: snapAxisValue(yExtent.max, 5, "up"),
    };
  }, [fastSessions]);
  const fastScatterAverageDecisionSeconds = useMemo(
    () => average(fastSessions.map((session) => session.decisionSeconds)),
    [fastSessions],
  );

  const fastScatterOption = useMemo<EChartsOption>(() => ({
    animation: false,
    grid: {
      containLabel: true,
      left: 56,
      right: 18,
      top: 34,
      bottom: 34,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: panelColor,
      borderColor: axisLineColor,
      textStyle: { color: axisTextColor, fontSize: tooltipFontSize, fontWeight: 400 },
      formatter: (params: unknown) => {
        const casted = params as { dataIndex?: number };
        const point = fastSessions[Math.max(0, Math.floor(Number(casted.dataIndex) || 0))];
        if (!point) {
          return "";
        }
        return [
          formatDotJoinedText(language, [
            point.session.symbol,
            point.createdAtLabel || point.session.id,
          ]),
          `${content.challengeStatsFastAvgDecisionSecondsLabel}: ${formatSecondsText(
            language,
            point.decisionSeconds,
            content.fastArenaSecondUnitLabel,
          )}`,
          `${content.challengeMacroFastPerformanceAxisLabel}: ${formatSignedPercentText(point.performanceRate, 1)}`,
          `${executionEdgeRatioLabel}: ${formatEdgeRatioText(point.edgeRatio)}`,
          `${content.decisionSelectedLabel}: ${selectionLabelMap[point.selection]}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      min: fastScatterAxisExtents.xMin,
      max: fastScatterAxisExtents.xMax,
      name: content.challengeStatsFastAvgDecisionSecondsLabel,
      nameGap: 22,
      nameTextStyle: { color: axisTextColor },
      axisLabel: {
        color: axisTextColor,
        formatter: (value: number) => formatMoney(Number(value), 0),
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      splitLine: {
        lineStyle: {
          color: axisLineColor,
          opacity: 0.14,
          type: "dashed" as const,
        },
      },
    },
    yAxis: {
      type: "value",
      min: fastScatterAxisExtents.yMin,
      max: fastScatterAxisExtents.yMax,
      name: content.challengeMacroFastPerformanceAxisLabel,
      nameGap: 18,
      nameTextStyle: { color: axisTextColor },
      axisLabel: {
        color: axisTextColor,
        formatter: (value: number) =>
          `${formatMoney(Math.abs(Number(value)), 0)}${percentSymbol}${Number(value) < 0 ? "-" : ""}`,
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      splitLine: {
        lineStyle: {
          color: axisLineColor,
          opacity: 0.14,
          type: "dashed" as const,
        },
      },
    },
    series: [
      {
        type: "scatter",
        data: fastSessions.map((session) => ({
          value: [session.decisionSeconds, session.performanceRate * 100],
          symbolSize: clampNumber(8 + session.edgeRatio * 2, 8, 18),
          itemStyle: {
            color:
              session.performanceRate > 0
                ? pricePositiveColor
                : session.performanceRate < 0
                  ? priceNegativeColor
                  : mutedColor,
          },
        })),
        emphasis: {
          itemStyle: {
            borderColor: activeAccentColor,
            borderWidth: 2,
          },
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: true,
            position: "insideEndTop",
            color: axisTextColor,
            formatter: () => formatMoney(fastScatterAverageDecisionSeconds, 1),
          },
          lineStyle: {
            color: activeAccentColor,
            type: "dashed" as const,
            opacity: 0.3,
          },
          data:
            fastSessions.length > 0
              ? [{ xAxis: fastScatterAverageDecisionSeconds }]
              : [],
        },
      },
    ],
  }), [
    activeAccentColor,
    axisLineColor,
    axisTextColor,
    content.challengeMacroFastPerformanceAxisLabel,
    content.fastArenaSecondUnitLabel,
    content.challengeStatsFastAvgDecisionSecondsLabel,
    content.decisionSelectedLabel,
    executionEdgeRatioLabel,
    fastScatterAverageDecisionSeconds,
    fastScatterAxisExtents.xMax,
    fastScatterAxisExtents.xMin,
    fastScatterAxisExtents.yMax,
    fastScatterAxisExtents.yMin,
    fastSessions,
    language,
    mutedColor,
    panelColor,
    percentSymbol,
    priceNegativeColor,
    pricePositiveColor,
    selectionLabelMap,
    tooltipFontSize,
  ]);

  const fastBiasOption = useMemo<EChartsOption>(() => ({
    animation: false,
    grid: {
      containLabel: true,
      left: 28,
      right: 28,
      top: 24,
      bottom: 20,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: panelColor,
      borderColor: axisLineColor,
      textStyle: { color: axisTextColor, fontSize: tooltipFontSize, fontWeight: 400 },
    },
    xAxis: {
      type: "value",
      min: -100,
      max: 100,
      axisLabel: {
        color: axisTextColor,
        formatter: (value: number) =>
          `${formatMoney(Math.abs(Number(value)), 0)}${percentSymbol}`,
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      splitLine: {
        lineStyle: {
          color: axisLineColor,
          opacity: 0.12,
          type: "dashed" as const,
        },
      },
    },
    yAxis: {
      type: "category",
      data: [""],
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        name: content.decisionDirectionUpLabel,
        data: [
          {
            value: -(fastBiasStats.longShare * 100),
            itemStyle: { color: tradeBuyColor },
          },
        ],
        barWidth: 36,
        label: {
          show: true,
          position: "left",
          color: tradeBuyColor,
          formatter: () =>
            `${content.decisionDirectionUpLabel} ${formatPercentText(
              fastBiasStats.longShare,
              0,
            )}`,
        },
      },
      {
        type: "bar",
        name: content.decisionDirectionDownLabel,
        data: [
          {
            value: fastBiasStats.shortShare * 100,
            itemStyle: { color: tradeSellColor },
          },
        ],
        barWidth: 36,
        label: {
          show: true,
          position: "right",
          color: tradeSellColor,
          formatter: () =>
            `${content.decisionDirectionDownLabel} ${formatPercentText(
              fastBiasStats.shortShare,
              0,
            )}`,
        },
      },
    ],
  }), [
    axisLineColor,
    axisTextColor,
    content.decisionDirectionDownLabel,
    content.decisionDirectionUpLabel,
    fastBiasStats.longShare,
    fastBiasStats.shortShare,
    panelColor,
    percentSymbol,
    tradeBuyColor,
    tradeSellColor,
    tooltipFontSize,
  ]);

  const riskCurveSeries = useMemo(
    () =>
      riskSessions.slice(0, RISK_CURVE_MAX_SERIES).map((session) => {
        const firstPointX = session.curvePoints[0]?.[0] ?? 0;
        return {
          ...session,
          curvePoints: session.curvePoints.map(
            (point) => [Math.max(0, point[0] - firstPointX), point[1]] as [number, number],
          ),
        };
      }),
    [riskSessions],
  );

  const riskCurveExtents = useMemo(
    () => resolveRiskCurveAxisExtents(riskCurveSeries),
    [riskCurveSeries],
  );

  const riskCurveOption = useMemo<EChartsOption>(() => {
    const baseSeries = riskCurveSeries.map((session, index) => ({
      type: "line" as const,
      name: `${session.session.symbol} ${session.createdAtLabel}`,
      data: session.curvePoints,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: {
        color: activeAccentColor,
        width: index === 0 ? 2.6 : 1.8,
        opacity: clampNumber(0.95 - index * 0.08, 0.24, 0.95),
      },
      itemStyle: {
        color: activeAccentColor,
      },
      emphasis: {
        focus: "series" as const,
      },
    }));
    return {
      animation: false,
      grid: {
        containLabel: true,
        left: 56,
        right: 20,
        top: 32,
        bottom: 36,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: panelColor,
        borderColor: axisLineColor,
        textStyle: { color: axisTextColor, fontSize: tooltipFontSize, fontWeight: 400 },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const entries = items
            .map((item) => {
              const source = item as {
                axisValue?: number | string;
                seriesName?: string;
                marker?: string;
                value?: unknown;
                data?: unknown;
              };
              const tuple = Array.isArray(source.value)
                ? source.value
                : Array.isArray(source.data)
                  ? source.data
                  : null;
              const curveValue =
                tuple && Number.isFinite(Number(tuple[1])) ? Number(tuple[1]) : null;
              return {
                axisValue: source.axisValue,
                seriesName: String(source.seriesName || ""),
                marker: String(source.marker || ""),
                curveValue,
              };
            })
            .filter(
              (entry) =>
                entry.seriesName &&
                entry.seriesName !== content.riskDisciplineKnockoutLabel &&
                entry.curveValue !== null,
            )
            .sort((left, right) => (right.curveValue ?? 0) - (left.curveValue ?? 0));

          const axisValue = Number(entries[0]?.axisValue);
          const lines = entries.map((entry) => {
            const value = entry.curveValue ?? 0;
            const sign = value > 0 ? "+" : value < 0 ? "-" : "";
            const formattedValue = `${sign}${formatMoney(Math.abs(value), 1)}${percentSymbol}`;
            return `
              <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;">
                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                  ${entry.marker}
                  <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${escapeTooltipHtml(entry.seriesName)}
                  </span>
                </div>
                <span style="white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;">
                  ${formattedValue}
                </span>
              </div>
            `;
          });

          return `
            <div style="display:grid;gap:8px;min-width:360px;">
              <div style="font-weight:700;">
                ${escapeTooltipHtml(content.challengeDashboardRiskProgressAxisLabel)}：${escapeTooltipHtml(
                  formatTemplate(content.challengeDashboardRiskFirstActionBarsTemplate, [
                    formatBarsValue(Number.isFinite(axisValue) ? axisValue : 0),
                  ]),
                )}
              </div>
              <div style="display:grid;gap:4px;">
                ${lines.join("")}
              </div>
            </div>
          `;
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        name: content.challengeDashboardRiskProgressAxisLabel,
        nameGap: 22,
        nameTextStyle: { color: axisTextColor },
        axisLabel: {
          color: axisTextColor,
          formatter: (value: number) => formatMoney(Number(value), 0),
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: {
          lineStyle: {
            color: axisLineColor,
            opacity: 0.1,
            type: "dashed" as const,
          },
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        name: content.challengeDashboardRiskEquityAxisLabel,
        nameGap: 18,
        nameTextStyle: { color: axisTextColor },
        axisLabel: {
          color: axisTextColor,
          formatter: (value: number) => {
            const numeric = Number(value);
            const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
            return `${sign}${formatMoney(
              Math.abs(numeric),
              riskCurveExtents.labelDigits,
            )}${percentSymbol}`;
          },
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: {
          lineStyle: {
            color: axisLineColor,
            opacity: 0.1,
            type: "dashed" as const,
          },
        },
      },
      series: baseSeries,
    };
  }, [
    activeAccentColor,
    axisLineColor,
    axisTextColor,
    content.challengeDashboardRiskEquityAxisLabel,
    content.challengeDashboardRiskFirstActionBarsTemplate,
    content.challengeDashboardRiskProgressAxisLabel,
    content.riskDisciplineKnockoutLabel,
    panelColor,
    percentSymbol,
    riskCurveExtents.labelDigits,
    riskCurveSeries,
    tooltipFontSize,
  ]);

  const riskBehaviorStats = useMemo(() => {
    const riskDashboardInsights =
      dashboardInsights?.risk?.[rangePreset] ?? dashboardInsights?.risk?.ALL;
    if (riskDashboardInsights && riskDashboardInsights.sampleCount > 0) {
      return riskDashboardInsights.behaviorStats;
    }
    return {
      CUT_LOSS: { count: 0, survived: 0 },
      ADD_POSITION: { count: 0, survived: 0 },
      FREEZE: { count: 0, survived: 0 },
    };
  }, [dashboardInsights?.risk, rangePreset]);

  const riskBehaviorOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: {
      trigger: "item",
      backgroundColor: panelColor,
      borderColor: axisLineColor,
      textStyle: { color: axisTextColor, fontSize: tooltipFontSize, fontWeight: 400 },
      formatter: (params: unknown) => {
        const casted = params as { name?: string; value?: number };
        return `${casted.name || ""}<br/>${formatMoney(Number(casted.value) || 0, 0)}`;
      },
    },
    series: [
      {
        type: "pie",
        top: 8,
        bottom: 26,
        radius: ["36%", "64%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        labelLayout: {
          moveOverlap: "shiftY",
        },
        label: {
          color: axisTextColor,
          distanceToLabelLine: 4,
          formatter: (params: unknown) => {
            const casted = params as { name?: string; value?: number };
            return `${casted.name || ""}\n${formatMoney(
              Number(casted.value) || 0,
              0,
            )}`;
          },
        },
        labelLine: {
          length: 14,
          length2: 18,
        },
        data: [
          {
            value: riskBehaviorStats.CUT_LOSS.count,
            name: behaviorLabelMap.CUT_LOSS,
            itemStyle: { color: tradeSellColor },
          },
          {
            value: riskBehaviorStats.ADD_POSITION.count,
            name: behaviorLabelMap.ADD_POSITION,
            itemStyle: { color: tradeBuyColor },
          },
          {
            value: riskBehaviorStats.FREEZE.count,
            name: behaviorLabelMap.FREEZE,
            itemStyle: { color: mutedColor },
          },
        ],
      },
    ],
  }), [
    axisLineColor,
    axisTextColor,
    behaviorLabelMap.ADD_POSITION,
    behaviorLabelMap.CUT_LOSS,
    behaviorLabelMap.FREEZE,
    mutedColor,
    panelColor,
    riskBehaviorStats.ADD_POSITION.count,
    riskBehaviorStats.CUT_LOSS.count,
    riskBehaviorStats.FREEZE.count,
    tradeBuyColor,
    tradeSellColor,
    tooltipFontSize,
  ]);

  return {
    fastBiasOption,
    fastScatterOption,
    riskBehaviorOption,
    riskCurveOption,
  };
};
