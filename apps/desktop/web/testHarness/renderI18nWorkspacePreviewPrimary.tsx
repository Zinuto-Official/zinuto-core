// SPDX-License-Identifier: GPL-3.0-only

import React from "react";
import type { HistoryReplayChartBindings } from "../src/domains/chart/HistoryReplayChart";
import { AnchorNavigatorControl } from "../src/domains/trainer/AnchorNavigatorControl";
import { formatTrainerTradingQuantityText } from "../src/domains/trainer/trainerTradingAssetUi";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import { getDisplayPeriodLabel } from "../src/ui/config/uiConfig";
import {
  formatMoney,
  formatRatio,
  formatSignedMoney,
} from "../src/ui/formatting/format";
import {
  formatBuySellCountText,
  formatCountWithUnitText,
} from "../src/ui/formatting/i18nDisplay";
import {
  ChallengeFusionDashboard,
  type ChallengeFusionDashboardChartBindings,
} from "../src/workspaces/challenge-stats/ChallengeFusionDashboard";
import type { StatsFilterState } from "../src/workspaces/challenge-stats/statsFilters";
import { TrainingCommandCenterPage } from "../src/workspaces/command-center/TrainingCommandCenterPage";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";
import { SpecialTrainingPage } from "../src/workspaces/special-training/SpecialTrainingPage";
import { TrainerWorkspacePage } from "../src/workspaces/trainer/TrainerWorkspacePage";
import {
  PREVIEW_START_POINT_SYMBOL,
  PreviewTrainerStartPointDrawerToggle,
  buildOrderEstimate,
  getPreviewStartPointOverview,
  language,
  noop,
  noopAsync,
  noopAsyncResult,
  previewStartPointBars,
  requestedTheme,
  type PreviewPageId,
} from "./i18nWorkspacePreviewSupport";

export const renderI18nWorkspacePreviewPrimary = (
  page: PreviewPageId,
  scope: Record<string, any>,
): React.ReactNode | undefined => {
  const {
    labels,
    previewSharedTrainerChartWorkspaceProps,
    previewSpecialTrainingSamplePools,
    previewTrainerSettingsPanel,
    sharedProps,
    specialTrainingContent,
    tradingSettingsText,
    trainerTradingAssetUi,
    tt,
    ttf,
  } = scope;
  switch (page) {
    case "COMMAND_CENTER":
      return (
        <TrainingCommandCenterPage
          eyebrow={labels.navGroupCommand}
          title={labels.navTrainingCommandCenter}
          heroSection={{
            title: labels.navTrainingCommandCenter,
            subtitle: labels.navSpecialTraining,
            cards: [
              {
                id: "strategy",
                title: labels.navTrainer,
                summary: labels.statsSubtitle,
                iconName: "navTrainer",
                metricLabel: labels.statsTrainings,
                metricValue: "128",
                primaryAction: {
                  label: labels.freeReplayStart,
                  tone: "primary",
                  iconName: "actionAdd",
                  onClick: noop,
                },
              },
              {
                id: "flash",
                title: labels.navSpecialTraining,
                summary: specialTrainingContent.challengeDashboardEmptyTitle,
                iconName: "navChallengeHall",
                metricLabel: labels.statsOverview,
                metricItems: [
                  {
                    id: "done",
                    value: "24",
                    label:
                      specialTrainingContent.challengeDashboardRecent10Label,
                  },
                  {
                    id: "left",
                    value: "6",
                    label: specialTrainingContent.questionBankRemainingLabel,
                  },
                ],
                metricValue: "24",
                primaryAction: {
                  label: specialTrainingContent.questionBankBuildButtonLabel,
                  tone: "tonal",
                  iconName: "actionArrowRight",
                  onClick: noop,
                },
              },
              {
                id: "crisis",
                title: labels.navChallengeStats,
                summary: labels.statsOverview,
                iconName: "navChallengeStats",
                metricLabel: labels.metricWinRate,
                metricValue: "61%",
                primaryAction: {
                  label: labels.statsRefresh,
                  tone: "tonal",
                  iconName: "actionArrowRight",
                  onClick: noop,
                },
              },
            ],
          }}
          utilitySection={{
            title: labels.navGroupTools,
            subtitle: labels.statsSubtitle,
            dataCenter: {
              title: labels.navDataConfig,
              subtitle: labels.dataConfigSubtitle,
              summaryLabel: labels.statsOverview,
              actionLabel: labels.readCsvFolder,
              summary: labels.dataConfigSubtitle,
              summaryItems: [
                { id: "pools", value: "4", label: labels.statsSamplePool },
                { id: "symbols", value: "128", label: labels.statsSymbol },
              ],
              onOpen: noop,
            },
            recentActivities: {
              title: labels.statsTrainings,
              moreActionLabel: labels.statsRefresh,
              onOpenMore: noop,
              emptyText: labels.statsNoData,
              emptyHintText: labels.statsSubtitle,
              items: [],
            },
          }}
        />
      );
    case "TRAINER": {
      return (
        <TrainerWorkspacePage
          trainerChartWorkspaceLayout={
            <div className="trainer-preview-chart card">
              {labels.chartSettings}
            </div>
          }
          ui={{
            endAllTraining: labels.endAllTraining,
            tradeSettings: labels.tradeSettings,
            nextBar: labels.nextBar,
            currentClose: labels.currentClose,
            nextOpen: labels.nextOpen,
          }}
          freeReplaySetup={
            {
              isPrepMode: true,
              dialogTitle: labels.freeReplayNew,
              dialogSubtitle: labels.freeReplayPrepSubtitle,
              modeLabel: labels.freeReplayNew,
              modeOptions: [
                {
                  value: "RANDOM",
                  label: labels.freeReplayModeRandom,
                  iconName: "navTrainer",
                },
                {
                  value: "FOCUSED",
                  label: labels.freeReplayModeFocused,
                  iconName: "navChallengeStats",
                },
              ],
              selectedMode: "RANDOM",
              onSelectMode: noop,
              summaryLabel: labels.freeReplayPrepSummaryLabel,
              summaryText: `${labels.randomPool} · ${tradingSettingsText.assetClassLabels.STOCK} · 1d`,
              startHelperText: labels.freeReplayPrepRandomHint,
              samplePoolLabel: labels.poolSettings,
              selectedSamplePool: {
                id: "system",
                label: labels.randomPool,
                symbolCount: 24,
              },
              symbolLabel: labels.symbol,
              symbolSearchPlaceholder: labels.freeReplaySymbolSearch,
              symbolSearchValue: "",
              onSymbolSearchChange: noop,
              startPointLabel: labels.freeReplayDirectedStart,
              startPointEmptyText: labels.freeReplayPrepAnchorRequired,
              startPointSummaryText: labels.freeReplayPrepAnchorRequired,
              blindBoxLabel: labels.freeReplayBlindBox,
              blindBoxActiveLabel: labels.freeReplayBlindBoxActive,
              emptyStateText: labels.freeReplayEmptyState,
              startLabel: labels.freeReplayStart,
              samplePoolOptions: [
                {
                  value: "system",
                  label: labels.randomPool,
                  symbolCount: 24,
                  assetClassLabel: tradingSettingsText.assetClassLabels.STOCK,
                  sourceBaseTimeframe: "1d",
                  minimumBaseTimeframeOptions: [
                    {
                      value: "1d",
                      label: getDisplayPeriodLabel("1d", language),
                    },
                  ],
                },
              ],
              selectedSamplePoolId: "system",
              onSelectSamplePool: noop,
              noSamplePoolLabel: labels.randomPoolEmpty,
              environmentDefaultTitle: labels.freeReplayEnvironmentDefaultTitle,
              selectedPoolDataTraits: [
                {
                  id: "assetClass",
                  label: labels.freeReplayAssetClass,
                  value: tradingSettingsText.assetClassLabels.STOCK,
                },
                {
                  id: "sourceTimeframe",
                  label: labels.freeReplayTimeframe,
                  value: "1d",
                },
              ],
              environmentAssetLabel: labels.freeReplayAssetClass,
              environmentAssetOptions: [
                {
                  value: "STOCK",
                  label: tradingSettingsText.assetClassLabels.STOCK,
                },
                {
                  value: "FUTURES",
                  label: tradingSettingsText.assetClassLabels.FUTURES,
                },
                {
                  value: "FOREX",
                  label: tradingSettingsText.assetClassLabels.FOREX,
                },
                {
                  value: "CRYPTO",
                  label: tradingSettingsText.assetClassLabels.CRYPTO,
                },
              ],
              selectedEnvironmentAssetClass: "STOCK",
              onSelectEnvironmentAssetClass: noop,
              environmentPresetLabel: labels.freeReplayEnvironmentPresetLabel,
              environmentPresetOptions: [
                {
                  value: "US_STOCK",
                  label: tradingSettingsText.marketPresetLabels.US_STOCK,
                },
              ],
              selectedEnvironmentPresetId: "US_STOCK",
              selectedEnvironmentPresetText:
                tradingSettingsText.marketPresetLabels.US_STOCK,
              onSelectEnvironmentPreset: noop,
              environmentRulesTitle: labels.freeReplayEnvironmentRulesTitle,
              environmentRuleCards: [
                {
                  id: "preset",
                  label: labels.freeReplayEnvironmentPresetLabel,
                  value: tradingSettingsText.marketPresetLabels.US_STOCK,
                },
                {
                  id: "asset",
                  label: labels.freeReplayAssetClass,
                  value: tradingSettingsText.assetClassLabels.STOCK,
                },
              ],
              persistEnvironmentToPoolLabel:
                labels.freeReplayEnvironmentSyncLabel,
              persistEnvironmentToPoolHint:
                labels.freeReplayEnvironmentSyncHint,
              persistEnvironmentToPool: false,
              onPersistEnvironmentToPoolChange: noop,
              minimumBaseTimeframeLabel: labels.freeReplayTimeframe,
              minimumBaseTimeframeOptions: [
                {
                  value: "1d",
                  label: getDisplayPeriodLabel("1d", language),
                },
              ],
              selectedMinimumBaseTimeframe: "1d",
              onSelectMinimumBaseTimeframe: noop,
              symbolOptions: [
                { value: "AAPL", label: "AAPL" },
                { value: "TSLA", label: "TSLA" },
              ],
              availableSymbolCount: 2,
              selectedSymbol: "AAPL",
              onSelectSymbol: noop,
              noSymbolLabel: labels.notSelected,
              blindBoxOptions: [
                { value: "SHOW", label: labels.freeReplayBlindBoxShow },
                { value: "HIDE", label: labels.freeReplayBlindBoxHide },
              ],
              blindBoxValue: "SHOW",
              onSelectBlindBox: noop,
              startDisabled: false,
              showEmptyStateText: false,
              startButtonIconName: "actionPlayPause",
              environmentTitle: labels.freeReplayEnvironmentTitle,
              environmentActionLabel: labels.freeReplayEnvironmentAction,
              environmentSummary: [
                {
                  label: labels.freeReplayEnvironmentPresetLabel,
                  value: tradingSettingsText.marketPresetLabels.US_STOCK,
                },
              ],
              onStart: noop,
              showResumeAction: true,
              resumeLabel: labels.freeReplayResumeLast,
              resumeDisabled: false,
              onResume: noop,
            } as never
          }
          tradingAssetUi={trainerTradingAssetUi}
          tradeLogBaseTimeframe="1d"
          tradingPresetEditor={{
            activeMarketPresetLabel:
              tradingSettingsText.marketPresetLabels.US_STOCK,
            trainerSettingsPanel: previewTrainerSettingsPanel,
            tradingSettingsText,
            autoSaveSignature: "preview",
            isAutoSaving: false,
            onAutoSave: noop,
          }}
          {...sharedProps}
          trainerHydrationState="READY"
          isBusy={false}
          isPreparingAction={false}
          trainingDays={12}
          trainingKlineCount={240}
          trainingKlineSourceProgressLine={`${getDisplayPeriodLabel(
            "1d",
            language,
          )} · ${ttf("appText.remainingValue0", [
            `468 ${tt("appText.bars")}`,
          ])}`}
          hasTrainingKlineProgressWarning={false}
          calendarSpanText="2026-03-01 ~ 2026-03-31"
          replaySpanText="240"
          securitiesTotal={128000}
          securitiesDelta={3400}
          positionMarketValue={64000}
          securitiesAccount={{ balance: 128000 }}
          currentPosition={{ qty: 200, unrealizedPnl: 1200, totalPnl: 3400 }}
          currentLeverageSummary={{
            isActive: false,
            isConfigured: true,
            allowLongMarginTrading: true,
            allowShortSelling: true,
            holdingStartDate: null,
            holdingEndDate: null,
            longFinancingFee: 0,
            cumulativeLongFinancingFee: 0,
            shortAmount: 0,
            shortFee: 0,
            cumulativeShortFee: 0,
            totalFee: 0,
            shortQty: 0,
            shortAmountRatio: 0,
            shortQtyRatio: 0,
          }}
          currentTradingFee={18}
          floatingRate={0.032}
          cumulativePnlRate={0.084}
          tradeCapacity={{
            availableCash: 54000,
            longBuyingPowerQty: 600,
            longBuyingPowerAmount: 74000,
            longFinancingAmount: 0,
            shortOpenCapacityQty: 300,
            shortOpenCapacityAmount: 36000,
            ratioBases: {
              buy: {
                kind: "LONG_BUYING_POWER",
                quantity: 600,
                amount: 74000,
              },
              sell: {
                kind: "SHORT_OPEN_CAPACITY",
                quantity: 300,
                amount: 36000,
              },
            },
          }}
          trainingDateRange="2026-03-01 ~ 2026-03-31"
          buyTradeInputMode="LOT"
          buyLotInput="2"
          buyAmountInput="24000"
          buyRatioInput="25"
          buyRatioPresetOptions={["10", "25", "50", "100"]}
          buyEstimate={buildOrderEstimate("BUY")}
          sellEstimate={buildOrderEstimate("SELL")}
          buyPriceMode="CUR_CLOSE"
          buyOrderDisabled={false}
          sellOrderDisabled={false}
          nextOpenUnavailable={false}
          tradeLogRows={[
            {
              sequence: "#01",
              fill: {
                id: "fill-1",
                side: "BUY",
                fill_time: "2026-03-18T09:30:00.000Z",
                fill_price: 123.45,
                fill_qty: 200,
                contract_multiplier: 1,
                fee: 8,
                tax: 0,
                slippage: 1.4,
              },
            },
          ]}
          tradeLogSideStats={{ buyCount: 1, sellCount: 0 }}
          formatMoney={formatMoney}
          formatRatio={formatRatio}
          formatSignedMoney={formatSignedMoney}
          formatTradingQuantityText={(quantity, kind = "ORDER") =>
            formatTrainerTradingQuantityText({
              language,
              quantity,
              tradeStep: 100,
              lotStepUnitLabel: tt("appText.lots2"),
              tradeQtyUnit: trainerTradingAssetUi.tradeQtyUnit,
              secondaryTradeQtyUnit:
                trainerTradingAssetUi.secondaryTradeQtyUnit,
              displayMode:
                kind === "POSITION"
                  ? trainerTradingAssetUi.positionQuantityDisplayMode
                  : trainerTradingAssetUi.orderQuantityDisplayMode,
            })
          }
          formatTradeLogQuantityText={(quantity) =>
            formatTrainerTradingQuantityText({
              language,
              quantity,
              tradeStep: 100,
              lotStepUnitLabel: tt("appText.lots2"),
              tradeQtyUnit: trainerTradingAssetUi.tradeQtyUnit,
              secondaryTradeQtyUnit:
                trainerTradingAssetUi.secondaryTradeQtyUnit,
              displayMode: trainerTradingAssetUi.orderQuantityDisplayMode,
            })
          }
          withCountUnit={(value, unit) =>
            formatCountWithUnitText(language, value, unit)
          }
          withBuySellCount={(buy, sell) =>
            formatBuySellCountText(
              language,
              tt("appText.buy4"),
              tt("appText.sell4"),
              buy,
              sell,
              tt("appText.times"),
            )
          }
          pnlClass={(value) => (value > 0 ? "up" : value < 0 ? "down" : "flat")}
          normalizeInput={(value) => value}
          setBuyTradeInputMode={noop}
          setBuyLotInput={noop}
          setBuyAmountInput={noop}
          setBuyRatioInput={noop}
          setBuyPriceMode={noop}
          stepNext={noopAsync}
          isStepNextDisabled={false}
          canUndo
          undoAvailableSteps={2}
          undoMaxSteps={5}
          lastUndoableAction="BUY"
          undo={noopAsync}
          placeOrder={noopAsync}
          openResetAllDialog={noopAsync}
        />
      );
    }
    case "TRAINER_START_POINT_DRAWER": {
      const previewAnchorIndex = 1139;
      const previewAnchorTs =
        previewStartPointBars[previewAnchorIndex]?.ts ?? null;
      return (
        <div
          className="desktop-main is-trainer"
          style={{ minHeight: "100vh", position: "relative" }}
        >
          <section className="desktop-secondary-window-panel desktop-secondary-window-start-point trainer-start-point-drawer">
            <header className="desktop-secondary-window-start-point-header">
              <div className="desktop-secondary-window-start-point-title-block">
                <h1>{tt("appText.trainingStart")}</h1>
                <p>{`${tt("appText.symbol")} · ${PREVIEW_START_POINT_SYMBOL}`}</p>
              </div>
            </header>
            <div className="trainer-start-point-drawer-panel">
              <AnchorNavigatorControl
                samplePoolId="preview-pool"
                instrumentId="preview-instrument"
                symbol={PREVIEW_START_POINT_SYMBOL}
                sourceTimeframe="1d"
                effectiveTimeframe="1d"
                language={language}
                themeMode={requestedTheme}
                currentTotalBars={previewStartPointBars.length}
                currentAnchorOverviewIndex={previewAnchorIndex}
                currentAnchorTs={previewAnchorTs}
                variant="embedded"
                commitMode="immediate"
                getOverviewRange={getPreviewStartPointOverview}
                onApplyAnchor={noopAsync}
                ui={{
                  startPoint: tt("appText.trainingStart"),
                  dateRange: tt("appText.dateTime"),
                  chartSettings: labels.chartSettings,
                }}
              />
            </div>
          </section>
        </div>
      );
    }
    case "TRAINER_START_POINT_DRAWER_TOGGLE":
      return (
        <PreviewTrainerStartPointDrawerToggle
          language={language}
          themeMode={requestedTheme}
          labels={labels}
        />
      );
    case "SPECIAL_TRAINING":
      return (
        <div>
          <div
            style={{
              position: "absolute",
              left: "-9999px",
              top: "0",
            }}
            data-i18n-slot="previewTitle"
            data-i18n-critical="true"
          >
            {labels.navSpecialTraining}
          </div>
          <SpecialTrainingPage
            language={language}
            ui={labels}
            enabledSamplePoolSymbols={["AAPL", "NVDA", "TSLA"]}
            enabledSamplePools={previewSpecialTrainingSamplePools}
            globalResetRevision={0}
            sharedTrainerChartWorkspaceProps={
              previewSharedTrainerChartWorkspaceProps
            }
            onShortcutBindingsChange={noop}
            onSyncChartQuestion={noop}
            onCreateChallengeReviewNote={noop}
            isPageActive
            onResumableSessionChange={noop}
            reviewSnapshotChart={
              {
                themeMode: requestedTheme,
                priceColorMode: "RED_UP_GREEN_DOWN",
                trainerDisplayPeriod: "1d" as never,
                chartRenderMode: "CANDLE",
                onChartRenderModeChange: noop,
                showChartSettingsModal: false,
                openChartSettingsModal: noop,
                setTrainerDisplayPeriod: noop,
                trainerPeriodOptionsByBase: {
                  "1d": ["1d"],
                } as never,
                bindings: {} as HistoryReplayChartBindings,
                createSystemMarkers: noop as never,
              } as never
            }
          />
        </div>
      );
    case "CHALLENGE_STATS":
      return (
        <ChallengeFusionDashboard
          language={language}
          ui={labels}
          report={null}
          isLoading={false}
          filters={
            {
              from: "",
              to: "",
              samplePoolId: "ALL",
              symbol: "ALL",
              timeframe: "ALL",
              tag: "",
              profitability: "ALL",
              comparePoolA: "",
              comparePoolB: "",
            } as StatsFilterState
          }
          setFilters={noop as never}
          setPendingFilters={noop as never}
          challengeModes={[
            {
              id: "fast-decision-training",
              title: labels.navSpecialTraining,
              summary: labels.statsSubtitle,
            },
            {
              id: "risk-discipline-training",
              title: labels.navChallengeStats,
              summary: labels.statsOverview,
            },
          ]}
          activeChallengeModeId="fast-decision-training"
          onSelectChallengeMode={noop}
          onRefresh={noop}
          onClearHistory={noopAsyncResult}
          resolvedFilterSamplePools={[]}
          chartBindings={null as ChallengeFusionDashboardChartBindings | null}
          desktopSecondaryWindows={
            {
              open: async () => ({
                kind: "CHALLENGE_STATS_REPLAY",
                title: "",
                payload: null,
                revision: 1,
              }),
              publish: async () => ({
                kind: "CHALLENGE_STATS_REPLAY",
                title: "",
                payload: null,
                revision: 1,
              }),
              subscribeActions: () => noop,
            } as never
          }
          onLoadChallengeDetail={async () => null}
        />
      );
    default:
      return undefined;
  }
};
