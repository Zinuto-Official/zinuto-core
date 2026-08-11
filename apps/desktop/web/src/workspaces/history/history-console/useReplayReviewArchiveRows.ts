// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import { formatMessage } from "@zinuto/shared/i18n";
import { MARGIN_BUFFER_DANGER_RATE } from "@/workspaces/history/history-console/marginSafetyModel";
import {
  EMPTY_REVIEW_VALUE,
  formatCompactDateTime,
  formatDiagnosticNumber,
  formatSignedMoney,
  formatSignedRatio,
  resolvePnlTone,
  resolveReviewArchiveEnvironmentLine,
  resolveReviewRuleBadges,
  type ReplayReviewConsolePageProps,
} from "@/workspaces/history/history-console/ReplayReviewConsoleHelpers";
import type { ReplayReviewArchiveRow } from "@/workspaces/history/history-console/ReplayReviewArchiveSection";
import { formatReplayRatioMultiplier } from "@/workspaces/history/history-console/replayRatioPresentation";
import { useReplayReviewConsoleModel } from "@/workspaces/history/history-console/useReplayReviewConsoleModel";

type ReplayReviewConsoleModel = ReturnType<typeof useReplayReviewConsoleModel>;
type ReplayReviewSession =
  ReplayReviewConsoleModel["visibleSessionMetrics"][number];
type ArchiveFinancialDetailsById = NonNullable<
  ReplayReviewConsoleModel["reviewDiagnostics"]
>["archiveFinancialDetailsById"];

export const useReplayReviewArchiveRows = ({
  archiveFinancialDetailsById,
  history,
  language,
  linkedRepresentativeIdSet,
  linkedSessionsDesc,
  tradingSettingsText,
  ui,
}: {
  archiveFinancialDetailsById: ArchiveFinancialDetailsById;
  history: ReplayReviewConsolePageProps["history"];
  language: ReplayReviewConsolePageProps["language"];
  linkedRepresentativeIdSet: ReadonlySet<string>;
  linkedSessionsDesc: ReplayReviewSession[];
  tradingSettingsText: ReturnType<
    typeof import("@/ui/config/uiConfig").getTradingSettingsText
  >;
  ui: ReplayReviewConsolePageProps["ui"];
}) => {
  const archiveRows = useMemo<ReplayReviewArchiveRow[]>(
    () =>
      linkedSessionsDesc.map((session, index) => {
        const detail = archiveFinancialDetailsById[session.id];
        const context = detail?.context ?? {
          marketPresetId: session.environment.marketPresetId,
          marketPresetLabel: session.environment.marketPresetId,
          assetClass: session.environment.assetClass,
          tradeSettlementMode: session.environment.tradeSettlementMode,
          allowLongMarginTrading: session.environment.allowLongMarginTrading,
          allowShortSelling: session.environment.allowShortSelling,
          leverageMultiple: session.environment.leverageMultiple,
          usesMakerTaker: session.environment.usesMakerTaker,
          ruleBadges: [],
        };
        const environmentLabel = resolveReviewArchiveEnvironmentLine({
          context,
          ui,
          language,
          tradingSettingsText,
        });
        const ruleBadges = resolveReviewRuleBadges({
          context,
          ui,
          tradingSettingsText,
        });
        const financialItems: ReplayReviewArchiveRow["financialItems"] = [
          {
            id: "gross",
            label: ui.historyGrossPnl,
            value: detail
              ? formatSignedMoney(detail.grossPnl, history.formatMoney)
              : EMPTY_REVIEW_VALUE,
            tone: detail ? resolvePnlTone(detail.grossPnl) : "flat",
          },
          {
            id: "net",
            label: ui.metricTotalPnl,
            value: detail
              ? formatSignedMoney(detail.netPnl, history.formatMoney)
              : EMPTY_REVIEW_VALUE,
            tone: detail ? resolvePnlTone(detail.netPnl) : "flat",
          },
          {
            id: "slippage-cost",
            label: ui.reviewSlippageCostLabel,
            value: detail
              ? history.formatMoney(detail.slippageCost)
              : EMPTY_REVIEW_VALUE,
            tone: detail && detail.slippageCost > 0 ? "down" : "flat",
          },
          {
            id: "fee-cost",
            label: ui.reviewFeeAndTaxCostLabel,
            value: detail
              ? history.formatMoney(detail.feeAndTaxCost)
              : EMPTY_REVIEW_VALUE,
            tone: detail && detail.feeAndTaxCost > 0 ? "down" : "flat",
          },
          {
            id: "funding-cost",
            label: ui.reviewFundingOrBorrowCostLabel,
            value: detail
              ? history.formatMoney(detail.fundingOrBorrowCost)
              : EMPTY_REVIEW_VALUE,
            tone: detail && detail.fundingOrBorrowCost > 0 ? "down" : "flat",
          },
          {
            id: "margin",
            label: ui.reviewMarginWarnLabel,
            value: detail
              ? formatSignedRatio(
                  detail.marginDiagnostics.minBufferRate,
                  history.formatRatio,
                )
              : EMPTY_REVIEW_VALUE,
            tone:
              detail &&
              detail.marginDiagnostics.minBufferRate <=
                MARGIN_BUFFER_DANGER_RATE
                ? "down"
                : "flat",
          },
        ];
        return {
          id: session.id,
          sequenceText: `#${index + 1}`,
          projectName: session.project.name,
          createdAtText: formatCompactDateTime(
            session.project.createdAt || session.project.updatedAt,
          ),
          symbol: session.project.symbol,
          environmentLabel,
          environmentMetaText: undefined,
          timeframeText: session.project.baseTimeframe,
          tradeCountText: formatDiagnosticNumber(
            language,
            session.analytics.closedTrades,
            0,
          ),
          returnRateText: formatSignedRatio(
            session.returnRate,
            history.formatRatio,
          ),
          returnTone: resolvePnlTone(session.returnRate),
          profitFactorText: formatReplayRatioMultiplier(
            session.sessionProfitFactor,
            session.sessionProfitFactorState,
            formatMessage(language, "common.metric.notAvailable"),
          ),
          ruleBadges,
          rowBadges: linkedRepresentativeIdSet.has(session.id)
            ? [
                {
                  id: "representative",
                  label: ui.reviewRepresentativeBadge,
                  tone: "secondary",
                },
              ]
            : [],
          financialItems,
        };
      }),
    [
      archiveFinancialDetailsById,
      history.formatMoney,
      history.formatRatio,
      language,
      linkedRepresentativeIdSet,
      linkedSessionsDesc,
      tradingSettingsText,
      ui,
    ],
  );

  const archiveSessionById = useMemo(
    () =>
      new Map(
        linkedSessionsDesc.map((session) => [session.id, session] as const),
      ),
    [linkedSessionsDesc],
  );

  const archiveSectionLabels = useMemo(
    () => ({
      selectedCountText: (count: number) =>
        `${formatMessage(language, "uiLabels.ui.selectedFiles")} ${formatDiagnosticNumber(
          language,
          count,
          0,
        )}`,
      clearSelected: ui.clearSelected,
      deleteSelected: ui.deleteSelected,
      clearHistory: ui.clearHistory,
      emptyState: ui.statsNoData,
      columns: {
        sessionAndTime: ui.reviewHistoryTrainingDate,
        symbolAndEnvironment: ui.reviewHistoryAssetPeriod,
        timeframe: ui.statsTimeframe,
        trades: ui.metricTotalTrades,
        totalReturnRate: ui.metricTotalReturnRate,
        profitFactor: ui.reviewHistoryProfitFactor,
        details: ui.reviewDetailAction,
        delete: formatMessage(language, "common.action.delete"),
      },
      detailAction: ui.reviewDetailAction,
      financialBreakdownTitle: ui.reviewFinancialBreakdownTitle,
      ruleBadgesTitle: ui.reviewRulesContextTitle,
    }),
    [language, ui],
  );

  return { archiveRows, archiveSectionLabels, archiveSessionById };
};
