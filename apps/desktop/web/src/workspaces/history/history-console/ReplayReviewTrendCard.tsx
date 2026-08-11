// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import type {
  ApiTrainingReviewTrendFacts,
  ApiTrainingReviewTrendReasonKey,
} from "@/api";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from "@/frontend-kernel/typography";
import { useI18n } from "@/frontend-kernel/i18n/I18nProvider";
import {
  EChartSurface,
  resolveCssTokenColor,
} from "@/workspaces/challenge-stats/charts/echartSurface";
import { InlineInfoLabel } from "@/ui/components/InlineInfoLabel";
import type { ReplayReviewSessionMetric } from "@/workspaces/history/history-console/types";
import { formatReplayRatioMultiplier } from "@/workspaces/history/history-console/replayRatioPresentation";

type ToneKind = "up" | "down" | "flat";

type ReplayReviewTrendCardProps = {
  sessionsAsc: ReplayReviewSessionMetric[];
  highlightedSessionIds?: string[];
  trendFacts?: ApiTrainingReviewTrendFacts | null;
  ui: UiLabelEntry;
  formatRatio: (value: number) => string;
  onOpenSession: (sessionId: string) => void;
  statusAdornment?: ReactNode;
};

type TrendReasonLabelMap = Record<ApiTrainingReviewTrendReasonKey, string>;

type TrendTextBundle = {
  returnLabel: string;
  recentAverageLabel: (count: number) => string;
  anomalyReasonLabel: string;
  notAvailableLabel: string;
  reasonLabels: TrendReasonLabelMap;
};

type TrendAxisLabelMode = "date" | "dateTime" | "time";

const DIAGNOSTIC_MONO_FONT_FAMILY = (): string =>
  getGlobalTypographyFontFamily("mono");
const EMPTY_REVIEW_VALUE = "--";

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const withAlpha = (color: string, alpha: number): string => {
  const normalizedAlpha = clamp(alpha, 0, 1);
  const rgbMatch = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)/i,
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
  }
  const hexMatch = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!hexMatch) {
    return color;
  }
  const normalizedHex =
    hexMatch[1].length === 3
      ? hexMatch[1]
          .split("")
          .map((token) => `${token}${token}`)
          .join("")
      : hexMatch[1];
  const r = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const g = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const b = Number.parseInt(normalizedHex.slice(4, 6), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return color;
  }
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
};

const resolvePnlTone = (value: number): ToneKind => {
  if (value > 1e-9) {
    return "up";
  }
  if (value < -1e-9) {
    return "down";
  }
  return "flat";
};

const formatSignedRatio = (
  value: number,
  formatRatio: (value: number) => string,
): string => {
  const normalized = normalizeNumber(value);
  if (normalized > 0) {
    return `+${formatRatio(normalized)}`;
  }
  if (normalized < 0) {
    return `-${formatRatio(Math.abs(normalized))}`;
  }
  return formatRatio(0);
};

const formatTooltipDateTime = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) {
    return EMPTY_REVIEW_VALUE;
  }
  if (raw.length >= 16 && raw.includes("T")) {
    return `${raw.slice(0, 10)} ${raw.slice(11, 16)}`;
  }
  if (raw.length >= 16) {
    return raw.slice(0, 16);
  }
  return raw;
};

const extractAxisDateToken = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
};

const hasIntradayTime = (value: string): boolean => {
  const raw = String(value || "").trim();
  if (!raw) {
    return false;
  }
  if (raw.length >= 16 && raw.includes("T")) {
    return true;
  }
  return raw.length >= 16;
};

const resolveTrendAxisLabelMode = (
  timestamps: string[],
): TrendAxisLabelMode => {
  const validTimestamps = timestamps.filter((timestamp) =>
    String(timestamp || "").trim(),
  );
  if (!validTimestamps.some(hasIntradayTime)) {
    return "date";
  }
  const uniqueDayCount = new Set(
    validTimestamps.map((timestamp) => extractAxisDateToken(timestamp)),
  ).size;
  if (validTimestamps.length <= 8) {
    return uniqueDayCount <= 1 ? "time" : "dateTime";
  }
  if (validTimestamps.length <= 12 && uniqueDayCount <= 3) {
    return "dateTime";
  }
  return "date";
};

const formatAxisDate = (
  value: string,
  mode: TrendAxisLabelMode = "date",
): string => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length >= 16 && raw.includes("T")) {
    if (mode === "time") {
      return raw.slice(11, 16);
    }
    if (mode === "dateTime") {
      return `${raw.slice(5, 10)}\n${raw.slice(11, 16)}`;
    }
    return raw.slice(5, 10);
  }
  if (raw.length >= 16) {
    if (mode === "time") {
      return raw.slice(11, 16);
    }
    if (mode === "dateTime") {
      return `${raw.slice(5, 10)}\n${raw.slice(11, 16)}`;
    }
    return raw.slice(5, 10);
  }
  if (raw.length >= 10) {
    return raw.slice(5, 10);
  }
  return raw;
};

const resolveSessionTimestamp = (session: ReplayReviewSessionMetric): string =>
  session.project.createdAt || session.project.updatedAt || "";

const buildVisibleAxisLabelIndexes = (count: number): Set<number> => {
  const indexes = new Set<number>();
  if (count <= 0) {
    return indexes;
  }
  if (count <= 6) {
    for (let index = 0; index < count; index += 1) {
      indexes.add(index);
    }
    return indexes;
  }
  const maxLabels = 5;
  const step = Math.max(1, Math.ceil((count - 1) / (maxLabels - 1)));
  for (let index = 0; index < count; index += step) {
    indexes.add(index);
  }
  indexes.add(0);
  indexes.add(count - 1);
  return indexes;
};

const resolveTrendReasonLabel = (
  reasonLabels: TrendReasonLabelMap,
  reasonKey: ApiTrainingReviewTrendReasonKey,
): string => reasonLabels[reasonKey];

const readTrendPointBySessionId = (
  trendFacts: ApiTrainingReviewTrendFacts | null | undefined,
): Map<string, ApiTrainingReviewTrendFacts["points"][number]> =>
  new Map((trendFacts?.points ?? []).map((point) => [point.sessionId, point]));

const buildTrendChartOption = ({
  sessionsAsc,
  highlightedSessionIds,
  trendFacts,
  formatRatio,
  texts,
  ui,
}: {
  sessionsAsc: ReplayReviewSessionMetric[];
  highlightedSessionIds: string[];
  trendFacts: ApiTrainingReviewTrendFacts | null;
  formatRatio: (value: number) => string;
  texts: TrendTextBundle;
  ui: UiLabelEntry;
}): EChartsOption => {
  const gridColor = withAlpha(resolveCssTokenColor("--visual-white"), 0.03);
  const axisLineColor = withAlpha(resolveCssTokenColor("--visual-white"), 0.08);
  const textSecondary = resolveCssTokenColor("--text-t3");
  const textPrimary = resolveCssTokenColor("--text-t1");
  const positiveColor = resolveCssTokenColor("--price-up-color");
  const negativeColor = resolveCssTokenColor("--price-down-color");
  const accentColor = resolveCssTokenColor("--action-a1");
  const surfaceColor = resolveCssTokenColor("--surface-s1");
  const dangerColor = resolveCssTokenColor("--visual-danger-solid");
  const trendPointBySessionId = readTrendPointBySessionId(trendFacts);
  const trendPoints = sessionsAsc.map(
    (session) => trendPointBySessionId.get(session.id) ?? null,
  );
  const recentAverageLabel = texts.recentAverageLabel(
    Math.max(1, trendFacts?.recentWindowSize ?? 1),
  );
  const timestamps = sessionsAsc.map((session) => resolveSessionTimestamp(session));
  const axisLabelMode = resolveTrendAxisLabelMode(timestamps);
  const useMultiLineAxisLabels = axisLabelMode === "dateTime";
  const rollingExpectancy = trendPoints.map(
    (point, index) => point?.rollingAverage ?? sessionsAsc[index]?.returnRate ?? 0,
  );
  const rollingWindowCounts = trendPoints.map(
    (point) => Math.max(1, point?.rollingWindowSize ?? 1),
  );
  const highlightedIdSet = new Set(highlightedSessionIds);
  const visibleLabelIndexes = buildVisibleAxisLabelIndexes(sessionsAsc.length);
  const axisFontSize = getGlobalTypographyReferencePx("r2");
  const tooltipFontSize = getGlobalTypographyReferencePx("r1");

  return {
    animationDuration: 220,
    grid: {
      containLabel: true,
      left: 16,
      right: 24,
      top: 16,
      bottom: useMultiLineAxisLabels ? 48 : 34,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: withAlpha(accentColor, 0.12),
        },
      },
      borderWidth: 0,
      backgroundColor: surfaceColor,
      textStyle: {
        color: textPrimary,
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: tooltipFontSize,
      },
      formatter: (payload: unknown) => {
        const params = Array.isArray(payload) ? payload : [payload];
        const candidate = params[0] as { dataIndex?: number } | undefined;
        const dataIndex = Math.max(0, Math.floor(Number(candidate?.dataIndex) || 0));
        const session = sessionsAsc[dataIndex];
        if (!session) {
          return "";
        }
        const windowSize = rollingWindowCounts[dataIndex] ?? 1;
        const rollingAverageLabel = texts.recentAverageLabel(windowSize);
        const trendPoint = trendPointBySessionId.get(session.id);
        const reasonLabel = resolveTrendReasonLabel(
          texts.reasonLabels,
          trendPoint?.reasonKey ?? "representative",
        );
        return [
          `<div class="diagnostic-echart-tooltip-head">#${dataIndex + 1} · ${session.project.symbol}</div>`,
          `<div>${formatTooltipDateTime(resolveSessionTimestamp(session))}</div>`,
          `<div style="height: 8px"></div>`,
          `<div>${texts.returnLabel}: ${formatSignedRatio(session.returnRate, formatRatio)}</div>`,
          `<div>${rollingAverageLabel}: ${formatSignedRatio(rollingExpectancy[dataIndex] ?? 0, formatRatio)}</div>`,
          `<div>${ui.metricProfitLossRatio}: ${formatReplayRatioMultiplier(
            session.sessionProfitFactor,
            session.sessionProfitFactorState,
            texts.notAvailableLabel,
          )}</div>`,
          `<div>${ui.metricMaxDrawdown}: ${formatRatio(session.maxDrawdownRate)}</div>`,
          `<div style="height: 8px"></div>`,
          `<div>${texts.anomalyReasonLabel}: ${reasonLabel}</div>`,
        ].join("");
      },
    },
    xAxis: {
      type: "category",
      data: timestamps,
      axisLabel: {
        color: textSecondary,
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: axisFontSize,
        lineHeight: useMultiLineAxisLabels
          ? Math.round(axisFontSize * 1.35)
          : undefined,
        margin: useMultiLineAxisLabels ? 14 : 10,
        hideOverlap: true,
        formatter: (_value: string, index: number) =>
          visibleLabelIndexes.has(index)
            ? formatAxisDate(timestamps[index] ?? "", axisLabelMode)
            : "",
      },
      axisTick: {
        show: false,
      },
      axisLine: {
        lineStyle: {
          color: axisLineColor,
        },
      },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLabel: {
        color: textSecondary,
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: axisFontSize,
        margin: 12,
        formatter: (value: number) => formatRatio(value),
      },
      splitLine: {
        lineStyle: {
          color: gridColor,
          type: "solid",
        },
      },
      axisLine: {
        show: false,
      },
    },
    series: [
      {
        name: texts.returnLabel,
        type: "bar",
        barMaxWidth: 16,
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: false,
          },
          lineStyle: {
            color: withAlpha(textSecondary, 0.35),
            width: 1,
            type: [4, 4],
          },
          data: [{ yAxis: 0 }],
        },
        data: sessionsAsc.map((session) => {
          const isHighlighted = highlightedIdSet.has(session.id);
          const baseColor =
            session.returnRate >= 0
              ? withAlpha(positiveColor, 0.82)
              : withAlpha(negativeColor, 0.82);
          return {
            value: session.returnRate,
            itemStyle: {
              color: baseColor,
              borderColor: isHighlighted
                ? withAlpha(accentColor, 0.48)
                : "transparent",
              borderWidth: isHighlighted ? 1 : 0,
            },
          };
        }),
      },
      {
        name: recentAverageLabel,
        type: "line",
        symbol: "circle",
        showSymbol: sessionsAsc.length <= 18,
        symbolSize: 6,
        smooth: 0.28,
        lineStyle: {
          width: 1.6,
          color: accentColor,
        },
        itemStyle: {
          color: accentColor,
        },
        data: rollingExpectancy.map((value) => ({
          value,
          symbolSize: sessionsAsc.length <= 18 ? 6 : 0,
        })),
      },
      {
        name: texts.anomalyReasonLabel,
        type: "line",
        symbol: "diamond",
        showSymbol: true,
        symbolSize: 10,
        lineStyle: {
          opacity: 0,
        },
        itemStyle: {
          color: surfaceColor,
          borderColor: dangerColor,
          borderWidth: 1.6,
        },
        emphasis: {
          scale: 1.3,
        },
        data: sessionsAsc.map((session) =>
          trendPointBySessionId.get(session.id)?.isAnomaly === true
            ? {
                value: session.returnRate,
                symbolSize: 10,
                itemStyle: {
                  color: surfaceColor,
                  borderColor: dangerColor,
                  borderWidth: 1.6,
                },
              }
            : {
                value: null,
                symbolSize: 0,
              },
        ),
        tooltip: {
          show: false,
        },
        z: 5,
      },
    ],
  };
};

const TrendInlineMetric = ({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: ToneKind;
}) => (
  <div className="diagnostic-console-inline-metric">
    <InlineInfoLabel label={label} critical />
    <strong className={`tone-${tone}`}>{value}</strong>
  </div>
);

export const ReplayReviewTrendCard = ({
  sessionsAsc,
  highlightedSessionIds = [],
  trendFacts = null,
  ui,
  formatRatio,
  onOpenSession,
  statusAdornment,
}: ReplayReviewTrendCardProps) => {
  const { t, formatNumber } = useI18n();
  const trendReasonLabels = useMemo<TrendReasonLabelMap>(
    () => ({
      criticalFailure: t("uiLabels.ui.reviewTimelineReasonCriticalFailure"),
      deepDrawdown: t("uiLabels.ui.reviewTimelineReasonDeepDrawdown"),
      weakReturn: t("uiLabels.ui.reviewTimelineReasonWeakReturn"),
      representative: t("uiLabels.ui.reviewTimelineReasonRepresentative"),
    }),
    [t],
  );
  const trendTexts = useMemo<TrendTextBundle>(
    () => ({
      returnLabel: t("uiLabels.ui.reviewTimelineSingleSessionReturn"),
      recentAverageLabel: (count) =>
        t("uiLabels.ui.reviewTimelineRecentAverageTemplate", { count }),
      anomalyReasonLabel: t("uiLabels.ui.reviewTimelineReasonLabel"),
      notAvailableLabel: t("common.metric.notAvailable"),
      reasonLabels: trendReasonLabels,
    }),
    [t, trendReasonLabels],
  );
  const recentAverageLabel = trendTexts.recentAverageLabel(
    Math.max(1, trendFacts?.recentWindowSize ?? 1),
  );
  const recentPositiveLabel = t("uiLabels.ui.reviewTimelinePositiveShareTemplate", {
    count: Math.max(1, trendFacts?.recentWindowSize ?? 1),
  });
  const trendTitle = t("uiLabels.ui.reviewTimelineTitle");
  const anomalyCountLabel = t("uiLabels.ui.reviewTimelineAnomalyCount");
  const chartOption = useMemo(
    () =>
      buildTrendChartOption({
        sessionsAsc,
        highlightedSessionIds,
        trendFacts,
        formatRatio,
        texts: trendTexts,
        ui,
      }),
    [
      formatRatio,
      highlightedSessionIds,
      sessionsAsc,
      trendFacts,
      trendTexts,
      ui,
    ],
  );

  return (
    <>
      <div className="diagnostic-console-chart-head">
        <div>
          <h3 data-i18n-critical="true">{trendTitle}</h3>
        </div>
        {statusAdornment}
      </div>

      {sessionsAsc.length <= 0 ? (
        <div className="diagnostic-console-empty-state">
          <span>{ui.reviewTimelineNeedMoreData}</span>
        </div>
      ) : (
        <div className="diagnostic-console-trend-card">
          <div className="diagnostic-console-inline-metric-strip diagnostic-console-trend-summary-strip">
            <TrendInlineMetric
              label={recentAverageLabel}
              value={formatSignedRatio(trendFacts?.recentAverage ?? 0, formatRatio)}
              tone={resolvePnlTone(trendFacts?.recentAverage ?? 0)}
            />
            <TrendInlineMetric
              label={recentPositiveLabel}
              value={formatRatio(trendFacts?.positiveShare ?? 0)}
              tone={
                (trendFacts?.positiveShare ?? 0) >= 0.6
                  ? "up"
                  : (trendFacts?.positiveShare ?? 0) <= 0.4
                    ? "down"
                    : "flat"
              }
            />
            <TrendInlineMetric
              label={anomalyCountLabel}
              value={formatNumber(trendFacts?.anomalyCount ?? 0, {
                maximumFractionDigits: 0,
              })}
              tone={(trendFacts?.anomalyCount ?? 0) > 0 ? "down" : "flat"}
            />
          </div>

          <EChartSurface
            option={chartOption}
            className="diagnostic-console-chart diagnostic-console-chart-mainline diagnostic-console-trend-chart"
            onPointClick={(dataIndex) => {
              const session = sessionsAsc[dataIndex];
              if (!session) {
                return;
              }
              onOpenSession(session.id);
            }}
          />
        </div>
      )}
    </>
  );
};
