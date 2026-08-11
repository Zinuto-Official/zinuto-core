// SPDX-License-Identifier: GPL-3.0-only

import type { EChartsOption } from "echarts";
import { Button } from "@/ui/primitives/button";
import { SurfaceCard } from "@/ui/primitives/surface-card";
import { formatMessage } from "@zinuto/shared/i18n";
import {
  getTradingSettingsText,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { VendorIcon } from "@/assets/graphics";
import { getGlobalTypographyReferencePx } from "@/frontend-kernel/typography";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import {
  resolveCssTokenColor,
} from "@/workspaces/challenge-stats/charts/echartSurface";
import {
  type ReplayReviewArchiveBadgeTone,
} from "@/workspaces/history/history-console/ReplayReviewArchiveSection";
import { InlineInfoLabel } from "@/ui/components/InlineInfoLabel";
import {
  MARGIN_BUFFER_BREACH_RATE,
  MARGIN_BUFFER_DANGER_RATE,
  MARGIN_BUFFER_SAFE_RATE,
  type MarginSafetyPoint,
  type MarginSafetyViewModel,
  type MarginSafetyZone,
} from "@/workspaces/history/history-console/marginSafetyModel";
import type {
  ReplayReviewSessionMetric,
  ReplayReviewWindow,
} from "@/workspaces/history/history-console/types";
import {
  formatReplayRatioMultiplier,
  resolveReplayProfitFactorTone,
} from "@/workspaces/history/history-console/replayRatioPresentation";
import {
  average,
  clamp,
  DIAGNOSTIC_MONO_FONT_FAMILY,
  EMPTY_REVIEW_VALUE,
  formatDiagnosticNumber,
  formatSignedDiagnosticNumber,
  formatSignedRatio,
  normalizeNumber,
  resolvePnlTone,
  resolveReplayReviewTimeWindowRangeMs,
  type KpiCardViewModel,
  type ReplayReviewConsoleHistoryDeps,
  type ReviewContext,
  type ReviewHeroMetrics,
  type ReviewWindowSlice,
  type ToneKind,
  withAlpha,
} from "@/workspaces/history/history-console/ReplayReviewConsoleModel";

export * from "@/workspaces/history/history-console/ReplayReviewConsoleModel";

export { formatReplayRatioMultiplier as formatMultiplier };

export const resolveMarginSafetyTone = (bufferRate: number): ToneKind =>
  bufferRate <= MARGIN_BUFFER_DANGER_RATE ? "down" : "flat";

export const resolveMarginZoneLabel = (
  zone: MarginSafetyZone,
  ui: UiLabelEntry,
): string => {
  switch (zone) {
    case "SAFE":
      return ui.reviewMarginZoneSafe;
    case "CROWDED":
      return ui.reviewMarginZoneCrowded;
    case "DANGER":
      return ui.reviewMarginZoneDanger;
    case "BREACH":
      return ui.reviewMarginZoneBreach;
    default:
      return ui.reviewMarginZoneSafe;
  }
};

export const resolveReviewMarketPresetLabel = ({
  context,
  tradingSettingsText,
}: {
  context: ReviewContext;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
}): string => {
  const marketPresetLabels = tradingSettingsText.marketPresetLabels as Record<
    string,
    string
  >;
  const marketPresetId = String(context.marketPresetId || "").trim().toUpperCase();
  if (marketPresetId && marketPresetLabels[marketPresetId]) {
    return marketPresetLabels[marketPresetId];
  }
  const fallbackLabel = String(context.marketPresetLabel || "").trim();
  if (fallbackLabel) {
    return fallbackLabel;
  }
  return "";
};

export const resolveReviewEnvironmentLabel = ({
  context,
  language,
  tradingSettingsText,
}: {
  context: ReviewContext;
  language: AppUiLanguage;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
}): string => {
  const marketPresetLabel = resolveReviewMarketPresetLabel({
    context,
    tradingSettingsText,
  });
  if (marketPresetLabel) {
    return marketPresetLabel;
  }
  return [
    tradingSettingsText.assetClassLabels[context.assetClass],
    tradingSettingsText.tradeSettlementModeOptionLabels[context.tradeSettlementMode],
  ].join(` ${formatMessage(language, "common.symbol.middleDot")} `);
};

export const resolveReviewArchiveEnvironmentLine = ({
  context,
  ui,
  language,
  tradingSettingsText,
}: {
  context: ReviewContext;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
}): string => {
  const presetLabel =
    resolveReviewMarketPresetLabel({ context, tradingSettingsText }) ||
    tradingSettingsText.assetClassLabels[context.assetClass];
  const settlementLabel =
    tradingSettingsText.tradeSettlementModeOptionLabels[context.tradeSettlementMode];
  const longCapabilityLabel = context.allowLongMarginTrading
    ? tradingSettingsText.allowLongMarginTradingLabelByAssetClass[
        context.assetClass
      ]
    : !context.allowShortSelling
      ? ui.reviewRuleOnlyLong
      : "";
  const shortCapabilityLabel = context.allowShortSelling
    ? tradingSettingsText.allowShortSellingLabelByAssetClass[context.assetClass]
    : "";
  return formatDotJoinedText(language, [
    presetLabel,
    settlementLabel,
    longCapabilityLabel,
    shortCapabilityLabel,
  ]);
};

export const resolveReviewRuleBadges = ({
  context,
  ui,
  tradingSettingsText,
}: {
  context: ReviewContext;
  ui: UiLabelEntry;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
}): Array<{
  id: string;
  label: string;
  tone?: ReplayReviewArchiveBadgeTone;
}> => {
  const badges: Array<{
    id: string;
    label: string;
    tone?: ReplayReviewArchiveBadgeTone;
  }> = [
    {
      id: "settlement",
      label:
        tradingSettingsText.tradeSettlementModeOptionLabels[
          context.tradeSettlementMode
        ],
      tone: context.tradeSettlementMode === "T1" ? "secondary" : "outline",
    },
  ];

  badges.push({
    id: "direction",
    label: context.allowShortSelling ? ui.reviewRuleCanShort : ui.reviewRuleOnlyLong,
    tone: context.allowShortSelling ? "default" : "outline",
  });

  if (context.leverageMultiple > 1.05) {
    badges.push({
      id: "leverage",
      label: `${Math.round(context.leverageMultiple)}x`,
      tone: context.leverageMultiple >= 8 ? "destructive" : "secondary",
    });
  }

  if (context.usesMakerTaker) {
    badges.push({
      id: "maker-taker",
      label: ui.reviewRuleMakerTaker,
      tone: "outline",
    });
  }

  return badges;
};

export const buildReviewWindowSlice = ({
  candidateSessionsDesc,
  currentSessionsDesc,
  window,
  anchorMs,
}: {
  candidateSessionsDesc: ReplayReviewSessionMetric[];
  currentSessionsDesc: ReplayReviewSessionMetric[];
  window: ReplayReviewWindow;
  anchorMs: number;
}): ReviewWindowSlice => {
  if (window === "ALL") {
    return {
      currentSessionsDesc,
      previousSessionsDesc: [],
      canCompare: false,
    };
  }

  if (window === "LAST_10" || window === "LAST_50") {
    const count = window === "LAST_10" ? 10 : 50;
    const previousSessionsDesc = candidateSessionsDesc.slice(count, count * 2);
    return {
      currentSessionsDesc,
      previousSessionsDesc,
      canCompare: previousSessionsDesc.length === count,
    };
  }

  const rangeMs = resolveReplayReviewTimeWindowRangeMs(window);
  if (rangeMs === null) {
    return {
      currentSessionsDesc,
      previousSessionsDesc: [],
      canCompare: false,
    };
  }
  const currentStart = anchorMs - rangeMs;
  const previousStart = currentStart - rangeMs;
  const previousSessionsDesc = candidateSessionsDesc.filter((session) => {
    const sessionTs = normalizeNumber(session.projectTs);
    return sessionTs >= previousStart && sessionTs < currentStart;
  });
  return {
    currentSessionsDesc,
    previousSessionsDesc,
    canCompare: previousSessionsDesc.length > 0,
  };
};

export const buildKpiDeltaText = ({
  current,
  previous,
  formatter,
  compareLabel,
  emptyLabel,
}: {
  current: number | null;
  previous: number | null;
  formatter: (value: number) => string;
  compareLabel: string;
  emptyLabel: string;
}): string => {
  if (current === null || previous === null) {
    return emptyLabel;
  }
  return `${compareLabel} ${formatter(current - previous)}`;
};

export const buildOverviewCards = ({
  slice,
  history,
  ui,
  language,
  currentMetrics,
  previousMetrics,
}: {
  slice: ReviewWindowSlice;
  history: ReplayReviewConsoleHistoryDeps;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  currentMetrics: ReviewHeroMetrics | null;
  previousMetrics: ReviewHeroMetrics | null;
}): KpiCardViewModel[] => {
  const currentSessions = slice.currentSessionsDesc;
  const previousSessions = slice.previousSessionsDesc;
  const currentSessionCount = currentSessions.length;
  const previousSessionCount = previousSessions.length;
  const currentExpectancy = average(currentSessions.map((session) => session.returnRate));
  const currentProfitFactor = currentMetrics?.profitFactor ?? null;
  const currentProfitFactorState =
    currentMetrics?.profitFactorState ?? "NOT_AVAILABLE";
  const ratioNotAvailableLabel = formatMessage(
    language,
    "common.metric.notAvailable",
  );
  const currentMaxDrawdown =
    currentSessionCount > 0 && currentMetrics ? currentMetrics.maxDrawdownRate : null;
  const previousExpectancy = average(
    previousSessions.map((session) => session.returnRate),
  );
  const previousProfitFactor = previousMetrics?.profitFactor ?? null;
  const previousProfitFactorState =
    previousMetrics?.profitFactorState ?? "NOT_AVAILABLE";
  const previousMaxDrawdown =
    previousSessionCount > 0 && previousMetrics
      ? previousMetrics.maxDrawdownRate
      : null;
  const compareLabel = ui.reviewComparePreviousWindow;
  const emptyDelta = ui.reviewNoComparison;

  return [
    {
      key: "sessions",
      label: ui.statsTrainings,
      value: formatDiagnosticNumber(language, currentSessionCount, 0),
      tone:
        previousSessionCount > 0 && currentSessionCount > previousSessionCount
          ? "up"
          : previousSessionCount > 0 && currentSessionCount < previousSessionCount
            ? "down"
            : "flat",
      deltaText: slice.canCompare
        ? buildKpiDeltaText({
            current: currentSessionCount,
            previous: previousSessionCount,
            formatter: (value) => formatSignedDiagnosticNumber(language, value, 0),
            compareLabel,
            emptyLabel: emptyDelta,
          })
        : emptyDelta,
    },
    {
      key: "expectancy",
      label: ui.reviewAvgRoiPerSession,
      value:
        currentExpectancy === null
          ? EMPTY_REVIEW_VALUE
          : formatSignedRatio(currentExpectancy, history.formatRatio),
      tone: resolvePnlTone(currentExpectancy ?? 0),
      deltaText: slice.canCompare
        ? buildKpiDeltaText({
            current: currentExpectancy,
            previous: previousExpectancy,
            formatter: (value) => formatSignedRatio(value, history.formatRatio),
            compareLabel,
            emptyLabel: emptyDelta,
          })
        : emptyDelta,
    },
    {
      key: "profit-factor",
      label: ui.metricProfitLossRatio,
      value: formatReplayRatioMultiplier(
        currentProfitFactor,
        currentProfitFactorState,
        ratioNotAvailableLabel,
      ),
      tone: resolveReplayProfitFactorTone(
        currentProfitFactor,
        currentProfitFactorState,
      ),
      deltaText:
        slice.canCompare &&
        currentProfitFactorState === "FINITE" &&
        previousProfitFactorState === "FINITE"
        ? buildKpiDeltaText({
            current: currentProfitFactor,
            previous: previousProfitFactor,
            formatter: (value) =>
              `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}x`,
            compareLabel,
            emptyLabel: emptyDelta,
          })
        : emptyDelta,
    },
    {
      key: "max-drawdown",
      label: ui.metricMaxDrawdown,
      value:
        currentMaxDrawdown === null
          ? EMPTY_REVIEW_VALUE
          : history.formatRatio(currentMaxDrawdown),
      tone:
        currentMaxDrawdown === null
          ? "flat"
          : currentMaxDrawdown >= 0.22
            ? "down"
            : currentMaxDrawdown >= 0.12
              ? "flat"
              : "up",
      deltaText: slice.canCompare
        ? buildKpiDeltaText({
            current: currentMaxDrawdown,
            previous: previousMaxDrawdown,
            formatter: (value) => formatSignedRatio(value, history.formatRatio),
            compareLabel,
            emptyLabel: emptyDelta,
          })
        : emptyDelta,
    },
  ];
};

export const buildMarginSafetyOption = ({
  marginSafetyViewModel,
  history,
  language,
  ui,
}: {
  marginSafetyViewModel: MarginSafetyViewModel;
  history: ReplayReviewConsoleHistoryDeps;
  language: AppUiLanguage;
  ui: UiLabelEntry;
}): EChartsOption => {
  const marginSafetyPoints = marginSafetyViewModel.sessionSafetyPoints;
  const gridColor = withAlpha(resolveCssTokenColor("--visual-white"), 0.03);
  const textSecondary = resolveCssTokenColor("--text-t3");
  const safeColor = resolveCssTokenColor("--green");
  const crowdedColor = resolveCssTokenColor("--visual-warning-accent");
  const dangerColor = resolveCssTokenColor("--visual-danger-accent");
  const breachColor = resolveCssTokenColor("--visual-danger-solid");
  const accentColor = resolveCssTokenColor("--action-a1");
  const surfaceColor = resolveCssTokenColor("--surface-s1");
  const axisFontSize = getGlobalTypographyReferencePx("r2");
  const tooltipFontSize = getGlobalTypographyReferencePx("r1");
  const bufferRates = marginSafetyPoints.map((point) => point.minBufferRate);
  const rawMin = bufferRates.length ? Math.min(...bufferRates, -0.05) : -0.05;
  const rawMax = bufferRates.length
    ? Math.max(...bufferRates, MARGIN_BUFFER_SAFE_RATE + 0.1)
    : MARGIN_BUFFER_SAFE_RATE + 0.1;
  const yMin = clamp(Math.floor(rawMin * 10) / 10, -0.4, 0);
  const yMax = clamp(Math.ceil(rawMax * 10) / 10, 0.4, 1);
  const visibleAxisLabelStep = Math.max(
    1,
    Math.ceil(marginSafetyPoints.length / 14),
  );
  const dataZoomStartPoint =
    marginSafetyPoints[marginSafetyViewModel.focusWindow.startIndex];
  const dataZoomEndPoint =
    marginSafetyPoints[marginSafetyViewModel.focusWindow.endIndex];
  const dataZoom = marginSafetyViewModel.focusWindow.isDense
    ? [
        {
          type: "inside" as const,
          xAxisIndex: 0,
          filterMode: "none" as const,
          minValueSpan: 24,
          startValue: dataZoomStartPoint?.sequenceText,
          endValue: dataZoomEndPoint?.sequenceText,
        },
        {
          type: "slider" as const,
          xAxisIndex: 0,
          filterMode: "none" as const,
          minValueSpan: 24,
          height: 18,
          bottom: 8,
          showDetail: false,
          showDataShadow: false,
          brushSelect: false,
          borderColor: withAlpha(textSecondary, 0.14),
          fillerColor: withAlpha(accentColor, 0.16),
          backgroundColor: withAlpha(textSecondary, 0.04),
          handleStyle: {
            color: surfaceColor,
            borderColor: withAlpha(accentColor, 0.45),
          },
          moveHandleStyle: {
            color: withAlpha(accentColor, 0.4),
          },
          startValue: dataZoomStartPoint?.sequenceText,
          endValue: dataZoomEndPoint?.sequenceText,
        },
      ]
    : undefined;

  return {
    animationDuration: 240,
    dataZoom,
    grid: {
      top: 18,
      left: 72,
      right: 24,
      bottom: marginSafetyViewModel.focusWindow.isDense ? 58 : 34,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      borderWidth: 0,
      backgroundColor: surfaceColor,
      textStyle: {
        color: resolveCssTokenColor("--text-t1"),
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: tooltipFontSize,
      },
      formatter: (payload: unknown) => {
        const params = Array.isArray(payload) ? payload : [payload];
        const first = params[0] as { dataIndex?: number } | undefined;
        const dataIndex = Math.max(0, Math.floor(Number(first?.dataIndex) || 0));
        const point = marginSafetyPoints[dataIndex];
        if (!point) {
          return "";
        }
        return [
          `<div class="diagnostic-echart-tooltip-head">${point.sequenceText} ${formatMessage(language, "common.symbol.middleDot")} ${point.symbol}</div>`,
          `<div>${ui.reviewMarginSessionSequenceLabel}: ${point.sequenceText}</div>`,
          `<div>${ui.reviewMarginSafetyBufferLabel}: ${formatSignedRatio(point.minBufferRate, history.formatRatio)}</div>`,
          `<div>${ui.reviewMarginPeakPressureLabel}: ${history.formatRatio(point.peakPressureRate)}</div>`,
          `<div>${ui.reviewMarginRiskZoneLabel}: ${resolveMarginZoneLabel(point.zone, ui)}</div>`,
        ].join("");
      },
    },
    xAxis: {
      type: "category",
      data: marginSafetyPoints.map((point) => point.sequenceText),
      axisLabel: {
        color: textSecondary,
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: axisFontSize,
        hideOverlap: true,
        formatter: (_value: string, index: number) =>
          index === 0 ||
          index === marginSafetyPoints.length - 1 ||
          index % visibleAxisLabelStep === 0
            ? marginSafetyPoints[index]?.sequenceText ?? ""
            : "",
      },
      axisLine: {
        lineStyle: {
          color: withAlpha(textSecondary, 0.18),
        },
      },
      axisTick: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      splitNumber: 5,
      axisLabel: {
        color: textSecondary,
        fontFamily: DIAGNOSTIC_MONO_FONT_FAMILY(),
        fontSize: axisFontSize,
        formatter: (value: number) => history.formatRatio(value),
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
        name: ui.reviewMarginSafetyBufferLabel,
        type: "bar",
        barMaxWidth: 10,
        data: marginSafetyPoints.map((point) => ({
          value: point.minBufferRate,
          itemStyle: {
            color:
              point.zone === "SAFE"
                ? withAlpha(safeColor, 0.8)
                : point.zone === "CROWDED"
                  ? withAlpha(crowdedColor, 0.78)
                  : point.zone === "DANGER"
                    ? withAlpha(dangerColor, 0.78)
                    : withAlpha(breachColor, 0.9),
            borderColor: point.isRepresentative
              ? accentColor
              : point.zone === "SAFE"
                ? withAlpha(safeColor, 0.92)
                : point.zone === "CROWDED"
                  ? withAlpha(crowdedColor, 0.94)
                  : point.zone === "DANGER"
                    ? withAlpha(dangerColor, 0.96)
                    : withAlpha(breachColor, 0.96),
            borderWidth: point.isRepresentative ? 1.2 : 0.8,
            borderRadius: 4,
          },
        })),
        markArea: {
          silent: true,
          itemStyle: {
            borderWidth: 0,
          },
          data: [
            [
              {
                yAxis: yMin,
                itemStyle: {
                  color: withAlpha(breachColor, 0.1),
                },
              },
              { yAxis: MARGIN_BUFFER_BREACH_RATE },
            ],
            [
              {
                yAxis: MARGIN_BUFFER_BREACH_RATE,
                itemStyle: {
                  color: withAlpha(dangerColor, 0.05),
                },
              },
              { yAxis: MARGIN_BUFFER_DANGER_RATE },
            ],
            [
              {
                yAxis: MARGIN_BUFFER_DANGER_RATE,
                itemStyle: {
                  color: withAlpha(crowdedColor, 0.04),
                },
              },
              { yAxis: MARGIN_BUFFER_SAFE_RATE },
            ],
          ],
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: false,
          },
          lineStyle: {
            color: withAlpha(textSecondary, 0.3),
            width: 1,
            type: [4, 4],
          },
          data: [
            { yAxis: MARGIN_BUFFER_BREACH_RATE },
            { yAxis: MARGIN_BUFFER_DANGER_RATE },
            { yAxis: MARGIN_BUFFER_SAFE_RATE },
          ],
        },
      },
    ],
  };
};

export const OverviewKpiCard = ({
  card,
  isPending,
}: {
  card: KpiCardViewModel;
  isPending: boolean;
}) => (
  <div className="diagnostic-console-kpi-card diagnostic-console-kpi-card--plain">
    <div className="diagnostic-console-kpi-head">
      <div className="diagnostic-console-kpi-copy">
        <div className="diagnostic-console-kpi-label-row">
          <InlineInfoLabel
            label={card.label}
            tooltip={card.labelTooltip}
            critical
          />
        </div>
        <strong className={`tone-${card.tone}`}>{card.value}</strong>
        <div className="diagnostic-console-kpi-meta">
          <span className="diagnostic-console-kpi-context">{card.deltaText}</span>
        </div>
      </div>
      {isPending ? <DiagnosticPendingIndicator /> : null}
    </div>
  </div>
);

export const DiagnosticPendingIndicator = () => (
  <span className="diagnostic-console-pending-indicator" aria-hidden="true">
    <VendorIcon name="loaderCircle" className="size-3.5 animate-spin" />
  </span>
);

export const DiagnosticSkeletonLine = ({
  className = "",
}: {
  className?: string;
}) => (
  <div
    className={`diagnostic-console-skeleton-line ${className}`.trim()}
    aria-hidden="true"
  />
);

export const OverviewKpiSkeletonCard = () => (
  <div className="diagnostic-console-kpi-card diagnostic-console-kpi-card--plain diagnostic-console-skeleton-card">
    <div className="diagnostic-console-kpi-head">
      <div className="diagnostic-console-kpi-copy">
        <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--label" />
        <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--metric" />
        <div className="diagnostic-console-kpi-meta">
          <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--meta" />
        </div>
      </div>
    </div>
  </div>
);

export const ReplayReviewOverviewSkeleton = () => (
  <div className="diagnostic-console-panel diagnostic-console-panel--overview">
    <section className="diagnostic-console-section diagnostic-console-section--overview-kpis">
      <div className="diagnostic-console-kpi-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <OverviewKpiSkeletonCard key={`overview-kpi-skeleton-${index}`} />
        ))}
      </div>
    </section>

    <section className="diagnostic-console-section diagnostic-console-overview-main-grid">
      <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-overview-grid-card diagnostic-console-skeleton-card">
        <div className="diagnostic-console-chart-head">
          <div className="diagnostic-console-skeleton-copy">
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--title" />
          </div>
        </div>
        <div className="diagnostic-console-skeleton-table">
          <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--table-head" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`overview-matrix-row-skeleton-${index}`}
              className="diagnostic-console-skeleton-table-row"
            >
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-title" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-value" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-value" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-value" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-value" />
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-overview-grid-card diagnostic-console-chart-card-main diagnostic-console-skeleton-card">
        <div className="diagnostic-console-chart-head">
          <div className="diagnostic-console-skeleton-copy">
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--title" />
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--subtitle" />
          </div>
        </div>
        <div className="diagnostic-console-inline-metric-strip diagnostic-console-trend-summary-strip">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`overview-trend-metric-skeleton-${index}`}
              className="diagnostic-console-inline-metric"
            >
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--label" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--inline-metric" />
            </div>
          ))}
        </div>
        <div className="diagnostic-console-skeleton-chart" aria-hidden="true" />
      </SurfaceCard>
    </section>
  </div>
);

export const ReplayReviewBehaviorSkeleton = () => (
  <div className="diagnostic-console-panel diagnostic-console-panel--behavior">
    <SurfaceCard className="diagnostic-console-chart-card diagnostic-console-behavior-card diagnostic-console-behavior-card--margin diagnostic-console-behavior-card--margin-full diagnostic-console-skeleton-card">
      <div className="diagnostic-console-chart-head">
        <div className="diagnostic-console-skeleton-copy">
          <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--title" />
          <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--subtitle" />
        </div>
      </div>
      <div className="diagnostic-console-inline-metric-strip diagnostic-console-inline-metric-strip--margin-full">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`behavior-metric-skeleton-${index}`}
            className="diagnostic-console-inline-metric"
          >
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--label" />
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--inline-metric" />
          </div>
        ))}
      </div>
      <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--body" />
      <div className="diagnostic-console-skeleton-chip-row">
        {Array.from({ length: 4 }).map((_, index) => (
          <DiagnosticSkeletonLine
            key={`behavior-chip-skeleton-${index}`}
            className="diagnostic-console-skeleton-line--chip"
          />
        ))}
      </div>
      <div className="diagnostic-console-skeleton-chart diagnostic-console-skeleton-chart--short" aria-hidden="true" />
      <div className="diagnostic-console-skeleton-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`behavior-list-skeleton-${index}`}
            className="diagnostic-console-skeleton-list-row"
          >
            <div className="diagnostic-console-skeleton-copy">
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--row-title" />
              <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--subtitle" />
            </div>
            <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--button" />
          </div>
        ))}
      </div>
    </SurfaceCard>
  </div>
);

export const ReplayReviewArchiveSkeleton = () => (
  <div className="diagnostic-console-panel diagnostic-console-panel--archive">
    <section className="diagnostic-console-logs diagnostic-console-table-panel">
      <section className="diagnostic-console-archive-section">
        <div className="diagnostic-console-section-head">
          <div className="diagnostic-console-section-controls diagnostic-console-section-controls--archive">
            <div className="diagnostic-console-archive-actions">
              {Array.from({ length: 3 }).map((_, index) => (
                <DiagnosticSkeletonLine
                  key={`archive-toolbar-skeleton-${index}`}
                  className="diagnostic-console-skeleton-line--toolbar"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="diagnostic-console-table-wrap diagnostic-console-table-scroll diagnostic-console-archive-table-shell diagnostic-console-skeleton-table-shell">
          <table className="diagnostic-console-table diagnostic-console-archive-table">
            <thead>
              <tr>
                {Array.from({ length: 9 }).map((_, index) => (
                  <th key={`archive-head-skeleton-${index}`}>
                    <DiagnosticSkeletonLine className="diagnostic-console-skeleton-line--table-head" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }).map((_, rowIndex) => (
                <tr key={`archive-row-skeleton-${rowIndex}`}>
                  {Array.from({ length: 9 }).map((_, columnIndex) => (
                    <td key={`archive-cell-skeleton-${rowIndex}-${columnIndex}`}>
                      <DiagnosticSkeletonLine
                        className={
                          columnIndex <= 1
                            ? "diagnostic-console-skeleton-line--row-title"
                            : "diagnostic-console-skeleton-line--row-value"
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </div>
);

export const BehaviorCompactMetric = ({
  label,
  labelTooltip,
  value,
  tone = "flat",
}: {
  label: string;
  labelTooltip?: string;
  value: string;
  tone?: ToneKind;
}) => (
  <div className="diagnostic-console-inline-metric">
    <InlineInfoLabel label={label} tooltip={labelTooltip} critical />
    <strong className={`tone-${tone}`}>{value}</strong>
  </div>
);

export const MarginZoneDistribution = ({
  viewModel,
  ui,
  history,
  language,
}: {
  viewModel: MarginSafetyViewModel;
  ui: UiLabelEntry;
  history: ReplayReviewConsoleHistoryDeps;
  language: AppUiLanguage;
}) => (
  <div className="diagnostic-console-margin-zone-distribution">
    <div className="diagnostic-console-margin-zone-bar" aria-hidden="true">
      {viewModel.zoneSummaries
        .filter((summary) => summary.count > 0)
        .map((summary) => (
          <span
            key={`margin-zone-bar-${summary.zone}`}
            className={`diagnostic-console-margin-zone-bar-segment zone-${summary.zone.toLowerCase()}`}
            style={{ width: `${Math.max(summary.share * 100, 2)}%` }}
          />
        ))}
    </div>
    <div className="diagnostic-console-margin-zone-legend">
      {viewModel.zoneSummaries.map((summary) => (
        <span
          key={`margin-zone-summary-${summary.zone}`}
          className={`diagnostic-console-margin-zone-pill zone-${summary.zone.toLowerCase()}`}
        >
          <span>{resolveMarginZoneLabel(summary.zone, ui)}</span>
          <strong>{formatDiagnosticNumber(language, summary.count, 0)}</strong>
          <em>{history.formatRatio(summary.share)}</em>
        </span>
      ))}
    </div>
  </div>
);

export const MarginWorstSessionList = ({
  points,
  ui,
  history,
  onOpenSession,
}: {
  points: MarginSafetyPoint[];
  ui: UiLabelEntry;
  history: ReplayReviewConsoleHistoryDeps;
  onOpenSession: (sessionId: string) => void;
}) => {
  if (!points.length) {
    return null;
  }
  return (
    <div className="diagnostic-console-margin-session-section">
      <div className="diagnostic-console-margin-session-head">
        <strong>{ui.reviewMarginWorstSessionsTitle}</strong>
      </div>
      <div className="diagnostic-console-margin-session-list">
        {points.map((point) => (
          <div
            key={`margin-worst-session-${point.sessionId}`}
            className="diagnostic-console-margin-session-row"
          >
            <div className="diagnostic-console-margin-session-copy">
              <strong>{point.sequenceText}</strong>
              <span>{point.symbol}</span>
              <span
                className={`diagnostic-console-margin-zone-badge zone-${point.zone.toLowerCase()}`}
              >
                {resolveMarginZoneLabel(point.zone, ui)}
              </span>
            </div>
            <div className="diagnostic-console-margin-session-actions">
              <strong className={`tone-${resolveMarginSafetyTone(point.minBufferRate)}`}>
                {formatSignedRatio(point.minBufferRate, history.formatRatio)}
              </strong>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="diagnostic-console-margin-session-replay-action"
                onClick={() => onOpenSession(point.sessionId)}
              >
                {ui.reviewMarginReplayActionLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export {
  ArchiveReplayDrawerPreview,
  ReplayDialogContent,
} from "@/workspaces/history/history-console/ReplayReviewReplayPresentation";
