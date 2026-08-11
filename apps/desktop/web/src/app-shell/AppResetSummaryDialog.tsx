// SPDX-License-Identifier: GPL-3.0-only

import { Button } from '@/ui/primitives/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/ui/primitives/tooltip';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { AppIcon, VendorIcon } from '@/assets/graphics';
import { formatMoney, formatRatio, formatSignedMoney } from '@/ui/formatting/format';
import type { ReactNode } from 'react';
import type { TrainingSummary } from '@/domains/training/types';
import { StandardModalFrame } from '@/ui/components';

type ReplayMetrics = {
  initialCapital: number;
  finalEquity: number;
  equityReturnRate: number;
};

export type AppResetSummaryPanelProps = {
  title: string;
  description: string;
  summary: TrainingSummary;
  replayMetrics: ReplayMetrics;
  withCountUnit: (count: string | number, unit: string) => string;
  withBuySellCount: (buyCount: string | number, sellCount: string | number) => string;
  curveContent: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  onCreateHistoryReviewNote?: () => void;
  createHistoryReviewNoteLabel?: string;
  isCreateHistoryReviewNoteDisabled?: boolean;
  isActionBlocked: boolean;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

const changeClass = (value: number) => (value > 0 ? 'up' : value < 0 ? 'down' : '');
const reverseChangeClass = (value: number) => (value > 0 ? 'down' : value < 0 ? 'up' : '');

export const AppResetSummaryPanel = ({
  title,
  description,
  summary,
  replayMetrics,
  withCountUnit,
  withBuySellCount,
  curveContent,
  onClose,
  onConfirm,
  onCreateHistoryReviewNote,
  createHistoryReviewNoteLabel,
  isCreateHistoryReviewNoteDisabled = false,
  isActionBlocked,
  tt,
  ttf
}: AppResetSummaryPanelProps) => {
  const cumulativePnlRateFromPnl = summary.initialAsset > 0 ? summary.totalPnl / summary.initialAsset : Number.NaN;
  const cumulativePnlRate = Number.isFinite(cumulativePnlRateFromPnl)
    ? cumulativePnlRateFromPnl
    : Number.isFinite(summary.assetReturnRate)
      ? summary.assetReturnRate
      : replayMetrics.equityReturnRate;
  const showCreateHistoryReviewNoteAction =
    typeof onCreateHistoryReviewNote === 'function' &&
    typeof createHistoryReviewNoteLabel === 'string' &&
    createHistoryReviewNoteLabel.trim().length > 0;
  const trimmedDescription = description.trim();
  const titleNode = trimmedDescription ? (
    <span className="training-summary-title-with-help">
      <span className="training-summary-title-text">{title}</span>
      <Tooltip delay={0}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="training-summary-title-help-trigger"
            aria-label={trimmedDescription}
          >
            <VendorIcon
              name="circleHelp"
              className="training-summary-title-help-icon"
              aria-hidden="true"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          showArrow
          className="training-summary-description-tooltip"
        >
          {trimmedDescription}
        </TooltipContent>
      </Tooltip>
    </span>
  ) : (
    title
  );

  return (
    <StandardModalFrame
      variant="workflow"
      footerMode={showCreateHistoryReviewNoteAction ? 'between' : 'end'}
      title={titleNode}
      actions={
        <>
          {showCreateHistoryReviewNoteAction ? (
            <Button
              variant="ghost"

              onClick={onCreateHistoryReviewNote}
              disabled={isActionBlocked || isCreateHistoryReviewNoteDisabled}
              title={createHistoryReviewNoteLabel}
              aria-label={createHistoryReviewNoteLabel}
            >
              <AppIcon name="actionAdd" aria-hidden="true" />
              <span>{createHistoryReviewNoteLabel}</span>
            </Button>
          ) : null}
          <div className="ui-standard-modal-action-group">
            <Button variant="ghost" onClick={onClose} disabled={isActionBlocked}>
              {tt('appText.cancel')}
            </Button>
            <Button variant="default" onClick={onConfirm} disabled={isActionBlocked}>
              {tt('appText.confirmEnd')}
            </Button>
          </div>
        </>
      }
    >
      <div className="summary-section">
        <div className="summary-section-title">{tt('appText.coreMetrics')}</div>
        <div className="summary-section-subtitle">
          {tt('appText.statisticalInterval')}
          {ttf('appText.value0Value14', [summary.startDate ?? tt('appText.message0367'), summary.endDate ?? tt('appText.message0367')])}
        </div>
        <div className="summary-grid summary-grid-3 training-summary-core-grid">
          <div className="summary-item">
            <span>{tt('appText.initialEquity')}</span>
            <strong>{formatMoney(replayMetrics.initialCapital)}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.return')}</span>
            <strong className={changeClass(replayMetrics.finalEquity - replayMetrics.initialCapital) || undefined}>
              {formatRatio(replayMetrics.equityReturnRate)}
            </strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.endingEquity')}</span>
            <strong className={changeClass(replayMetrics.finalEquity - replayMetrics.initialCapital) || undefined}>
              {formatMoney(replayMetrics.finalEquity)}
            </strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.durationDays')}</span>
            <strong>{withCountUnit(formatMoney(summary.durationDays, 0), tt('appText.days'))}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.buySellCount')}</span>
            <strong>{withBuySellCount(formatMoney(summary.buyCount, 0), formatMoney(summary.sellCount, 0))}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.total2')}</span>
            <strong>{withCountUnit(formatMoney(summary.totalTrades, 0), tt('appText.trades'))}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.cumulativeTurnover')}</span>
            <strong>{formatMoney(summary.investedAmount)}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.totalTradingCost')}</span>
            <strong>{formatMoney(summary.tradingCost)}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.totalProfitLoss')}</span>
            <strong className={changeClass(summary.totalPnl) || undefined}>{formatSignedMoney(summary.totalPnl)}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.cumulativePercent')}</span>
            <strong className={changeClass(cumulativePnlRate) || undefined}>{formatRatio(cumulativePnlRate)}</strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.maxDrawdownRate')}</span>
            <strong className={reverseChangeClass(Math.abs(summary.maxDrawdownRate)) || undefined}>
              {formatRatio(Math.abs(summary.maxDrawdownRate))}
            </strong>
          </div>
          <div className="summary-item">
            <span>{tt('appText.maxDrawdown')}</span>
            <strong className={reverseChangeClass(Math.abs(summary.maxDrawdownAmount)) || undefined}>
              {formatMoney(summary.maxDrawdownAmount)}
            </strong>
          </div>
        </div>
      </div>

      <div className="summary-section">
        <div className="summary-section-title">{tt('appText.totalAccount')}</div>
        <div className="summary-curves">
          <div className="summary-curve-card">
            <div className="summary-curve-title">{tt('appText.totalAccount')}</div>
            {curveContent}
          </div>
        </div>
      </div>
    </StandardModalFrame>
  );
};
