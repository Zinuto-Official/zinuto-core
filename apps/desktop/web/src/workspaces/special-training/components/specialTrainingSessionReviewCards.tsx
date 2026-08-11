// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import { Button } from "@/ui/primitives/button";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import { VendorIcon } from "@/assets/graphics";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatFastDecisionCapitalAmount } from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import { formatRoundedSignedPercent } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  buildFastDecisionSparklineOption,
} from "@/workspaces/special-training/charts/specialTrainingChartOptions";
import { clamp, formatPercentFixed } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionSessionDirectionStat,
  FastDecisionSessionMetricTone,
  FastDecisionSessionReviewItem,
  RiskDisciplineSessionReviewItem,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

export const FastDecisionSessionMetricCard = ({
  label,
  value,
  subtitle,
  tone,
  progressRate,
}: {
  label: string;
  value?: string | null;
  subtitle?: string | null;
  tone: FastDecisionSessionMetricTone;
  progressRate?: number | null;
}) => {
  const progressPercent =
    progressRate === null || progressRate === undefined
      ? null
      : clamp(progressRate * 100, 0, 100);

  return (
    <article className={`special-training-session-metric-card is-${tone}`}>
      <span className="special-training-session-metric-label">{label}</span>
      <div className="special-training-session-metric-body">
        {value ? (
          <strong className="special-training-session-metric-value">
            {value}
          </strong>
        ) : null}
        {progressPercent !== null ? (
          <span
            className="special-training-session-metric-progress"
            aria-hidden="true"
          >
            <span style={{ width: `${progressPercent}%` }} />
          </span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="special-training-session-metric-subtitle">{subtitle}</p>
      ) : null}
    </article>
  );
};

export const FastDecisionDirectionAccuracyBar = ({
  item,
}: {
  item: FastDecisionSessionDirectionStat;
}) => {
  const accuracyPercent = clamp(item.accuracyRate * 100, 0, 100);
  const hasAttempts = item.attemptCount > 0;

  return (
    <div className="special-training-session-bias-row">
      <div className="special-training-session-bias-copy is-inline">
        <span>{item.label}</span>
        <strong>
          {item.correctCount}
          {tt("appText.message0697")}
          {item.attemptCount}
        </strong>
      </div>
      <div className="special-training-session-bias-track">
        {hasAttempts ? (
          <span
            className="special-training-session-bias-fill is-correct"
            style={{ width: `${accuracyPercent}%` }}
          />
        ) : (
          <span className="special-training-session-bias-empty" />
        )}
      </div>
      <span className={`special-training-session-bias-rate is-${item.tone}`}>
        {formatPercentFixed(item.accuracyRate, 0)}
      </span>
    </div>
  );
};

export const RiskDisciplineBehaviorBar = ({
  label,
  count,
  survivalRate,
  tone,
}: {
  label: string;
  count: number;
  survivalRate: number;
  tone: FastDecisionSessionMetricTone;
}) => {
  const survivalPercent = clamp(survivalRate * 100, 0, 100);
  const hasSamples = count > 0;

  return (
    <div className="special-training-session-bias-row">
      <div className="special-training-session-bias-copy">
        <span>{label}</span>
        <strong>{formatMoneyFixed(count, 0)}</strong>
      </div>
      <div className="special-training-session-bias-track">
        {hasSamples ? (
          <span
            className="special-training-session-bias-fill is-correct"
            style={{ width: `${survivalPercent}%` }}
          />
        ) : (
          <span className="special-training-session-bias-empty" />
        )}
      </div>
      <span className={`special-training-session-bias-rate is-${tone}`}>
        {formatPercentFixed(survivalRate, 0)}
      </span>
    </div>
  );
};

export const FastDecisionReviewCard = ({
  item,
  reviewIndex,
  upColor,
  downColor,
  flatColor,
  markerDotColor,
  onOpen,
}: {
  item: FastDecisionSessionReviewItem;
  reviewIndex: number;
  upColor: string;
  downColor: string;
  flatColor: string;
  markerDotColor: string;
  onOpen: (reviewIndex: number) => void;
}) => {
  const sparklineColor =
    item.marketTone === "up"
      ? upColor
      : item.marketTone === "down"
        ? downColor
        : flatColor;
  const sparklineMarkerDotSize = item.marketTone === "flat" ? 7.5 : 9;
  const sparklineMarkerDotShadowBlur = item.marketTone === "flat" ? 8 : 10;
  const sparklineOption = useMemo(
    () =>
      buildFastDecisionSparklineOption(
        item.sparkline,
        sparklineColor,
        item.sparklineDecisionBoundaryOffset,
        markerDotColor,
        sparklineMarkerDotSize,
        sparklineMarkerDotShadowBlur,
      ),
    [
      markerDotColor,
      item.sparkline,
      item.sparklineDecisionBoundaryOffset,
      sparklineMarkerDotShadowBlur,
      sparklineMarkerDotSize,
      sparklineColor,
    ],
  );
  const statusIconName =
    item.tone === "pass"
      ? "check"
      : item.tone === "miss"
        ? "alertTriangle"
        : "x";

  return (
    <Button
      type="button"
      variant="ghost"
      className={`special-training-session-review-card is-${item.tone}`}
      onClick={() => onOpen(reviewIndex)}
    >
      <div className="special-training-session-review-head">
        <strong>{item.questionLabel}</strong>
        <span>{item.decisionTimeLabel}</span>
      </div>
      <div className="special-training-session-review-market">
        <div className="special-training-session-review-market-copy">
          <span>{item.symbol}</span>
          <span>{item.timeframeLabel}</span>
        </div>
        {sparklineOption ? (
          <EChartSurface
            option={sparklineOption}
            className="special-training-session-review-sparkline"
          />
        ) : null}
      </div>
      <div className="special-training-session-review-status">
        <span
          className={`special-training-session-review-badge is-${item.tone}`}
        >
          <VendorIcon name={statusIconName} aria-hidden="true" />
        </span>
        <div className="special-training-session-review-lines">
          <strong
            className={`special-training-session-review-verdict is-${item.tone}`}
          >
            {item.verdictLabel}
          </strong>
          {item.fastReview ? (
            <span className="special-training-session-review-capital">
              {formatFastDecisionCapitalAmount(item.fastReview.finalAsset)}
              {" / "}
              {formatRoundedSignedPercent(item.fastReview.returnRate)}
            </span>
          ) : null}
        </div>
      </div>
    </Button>
  );
};

export const RiskDisciplineReviewCard = ({
  item,
  reviewIndex,
  lineColor,
  upColor,
  downColor,
  markerDotColor,
  onOpen,
}: {
  item: RiskDisciplineSessionReviewItem;
  reviewIndex: number;
  lineColor: string;
  upColor: string;
  downColor: string;
  markerDotColor: string;
  onOpen: (reviewIndex: number) => void;
}) => {
  const sparklineOption = useMemo(
    () =>
      buildFastDecisionSparklineOption(
        item.sparkline,
        lineColor,
        item.sparklineDecisionBoundaryOffset,
        markerDotColor,
        8,
        8,
        {
          tradeMarkers: item.tradeMarkers,
          buyMarkerColor: upColor,
          sellMarkerColor: downColor,
          pinDecisionMarkerToRatio: 0.25,
        },
      ),
    [
      item.tradeMarkers,
      item.sparkline,
      item.sparklineDecisionBoundaryOffset,
      lineColor,
      markerDotColor,
      downColor,
      upColor,
    ],
  );
  const statusIconName =
    item.tone === "pass"
      ? "check"
      : item.tone === "miss"
        ? "alertTriangle"
        : "x";

  return (
    <Button
      type="button"
      variant="ghost"
      className={`special-training-session-review-card is-${item.tone}`}
      onClick={() => onOpen(reviewIndex)}
    >
      <div className="special-training-session-review-head">
        <strong>{item.questionLabel}</strong>
        <span>{item.gradeLabel}</span>
      </div>
      <div className="special-training-session-review-market">
        <div className="special-training-session-review-market-copy">
          <span>{item.symbol}</span>
          <span>{item.timeframeLabel}</span>
        </div>
        {sparklineOption ? (
          <EChartSurface
            option={sparklineOption}
            className="special-training-session-review-sparkline"
          />
        ) : null}
      </div>
      <div className="special-training-session-review-status">
        <span
          className={`special-training-session-review-badge is-${item.tone}`}
        >
          <VendorIcon name={statusIconName} aria-hidden="true" />
        </span>
        <div className="special-training-session-review-lines">
          <strong
            className={`special-training-session-review-verdict is-${item.tone}`}
          >
            {item.verdictLabel}
          </strong>
        </div>
      </div>
    </Button>
  );
};
