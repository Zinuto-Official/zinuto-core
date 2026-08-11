// SPDX-License-Identifier: GPL-3.0-only

import { AppIcon } from "@/assets/graphics";
import { TrainerTradeLogStrip } from "@/domains/trainer/TrainerTradeLogStrip";
import { markTrainerHotInteractionInput } from "@/domains/trainer/trainerPerfTrace";
import {
  TradingOrderTicket,
  WorkbenchRailSection,
} from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/ui/primitives/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import {
  TrainerAccountSettingsInlinePanel,
} from "@/workspaces/trainer/TrainerAccountSettingsInlinePanel";
import {
  TrainerMarketPresetInlinePanel,
  type TrainerMarketPresetPanelMode,
} from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";
import type {
  OrderPriceMode,
  TrainerPositionMetricProps,
  TrainerWorkspacePageProps,
} from "@/workspaces/trainer/trainerWorkspaceSurfaceTypes";
import type { ReactNode } from "react";

const POSITION_METRIC_EMPTY_META = "\u00a0";

const hasPositionMetricMeta = (meta: ReactNode | undefined): boolean =>
  meta !== undefined && meta !== null && meta !== false && meta !== "";

const TrainerPositionMetric = ({
  label,
  value,
  meta,
  className,
  valueClassName,
  metaClassName,
}: TrainerPositionMetricProps) => {
  const hasMeta = hasPositionMetricMeta(meta);
  const resolvedClassName = [
    "position-item",
    "trainer-position-metric",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const resolvedValueClassName = ["position-value", valueClassName]
    .filter(Boolean)
    .join(" ");
  const resolvedMetaClassName = [
    "position-metric-meta",
    metaClassName,
    hasMeta ? "" : "is-empty",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={resolvedClassName}>
      <span
        className="position-label"
        data-i18n-slot="metricLabel"
        data-i18n-critical="true"
      >
        {label}
      </span>
      <span className={resolvedValueClassName} data-i18n-slot="metricValue">
        {value}
      </span>
      <span
        className={resolvedMetaClassName}
        aria-hidden={hasMeta ? undefined : true}
      >
        {hasMeta ? meta : POSITION_METRIC_EMPTY_META}
      </span>
    </div>
  );
};

type TrainerWorkspaceLiveSurfaceProps = {
  pageProps: TrainerWorkspacePageProps;
  noneLabel: string;
  buyActionLabel: string;
  sellActionLabel: string;
  tradeLogBuySellStats: {
    buyText: string;
    sellText: string;
    separator: string;
  };
  marketPresetMenuMode: TrainerMarketPresetPanelMode | null;
  isAccountSettingsMenuOpen: boolean;
  setIsAccountSettingsMenuOpen: (nextOpen: boolean) => void;
  openMarketPresetOverviewDialog: () => void;
  longMarketPresetPanelId: string;
  shortMarketPresetPanelId: string;
  accountSettingsPanelId: string;
  handleMarketPresetMenuOpenChange: (
    mode: TrainerMarketPresetPanelMode,
    nextOpen: boolean,
  ) => void;
  longCapacityLabel: string;
  longCapacityValue: string;
  shortCapacityLabel: string;
  shortCapacityValue: string;
  showShortOpenCapacityMenu: boolean;
  shortFeeLabel: string;
  shortFeeValue: string;
  hasCarryCost: boolean;
  availableFundsValue: number;
  positionQtyValue: number;
  floatingPnlValue: number;
  floatingPnlText: string;
  floatingPnlRatioText: string;
  cumulativePnlText: string;
  cumulativePnlRatioText: string;
  buyExecutionBreakdownText: string;
  sellExecutionBreakdownText: string;
  disableEndAllTrainingAction: boolean;
  hydrationBusy: boolean;
  trainerHydrationOverlayLabel: string;
  tradingRulesActionLabel: string;
  buyOrderButtonLabel: string;
  sellOrderButtonLabel: string;
  buyOrderButtonClassName: string;
  sellOrderButtonClassName: string;
  referencePriceModeLabel: string;
  activeReferenceOrderPrice: number;
  handleSelectReferencePriceMode: (nextMode: OrderPriceMode) => void;
  undoButtonTitle: string;
  calendarSpanLabel: string;
  replaySpanLabel: string;
};

export const TrainerWorkspaceLiveSurface = ({
  pageProps,
  noneLabel,
  buyActionLabel,
  sellActionLabel,
  tradeLogBuySellStats,
  marketPresetMenuMode,
  isAccountSettingsMenuOpen,
  setIsAccountSettingsMenuOpen,
  openMarketPresetOverviewDialog,
  longMarketPresetPanelId,
  shortMarketPresetPanelId,
  accountSettingsPanelId,
  handleMarketPresetMenuOpenChange,
  longCapacityLabel,
  longCapacityValue,
  shortCapacityLabel,
  shortCapacityValue,
  showShortOpenCapacityMenu,
  shortFeeLabel,
  shortFeeValue,
  hasCarryCost,
  availableFundsValue,
  positionQtyValue,
  floatingPnlValue,
  floatingPnlText,
  floatingPnlRatioText,
  cumulativePnlText,
  cumulativePnlRatioText,
  buyExecutionBreakdownText,
  sellExecutionBreakdownText,
  disableEndAllTrainingAction,
  hydrationBusy,
  trainerHydrationOverlayLabel,
  tradingRulesActionLabel,
  buyOrderButtonLabel,
  sellOrderButtonLabel,
  buyOrderButtonClassName,
  sellOrderButtonClassName,
  referencePriceModeLabel,
  activeReferenceOrderPrice,
  handleSelectReferencePriceMode,
  undoButtonTitle,
  calendarSpanLabel,
  replaySpanLabel,
}: TrainerWorkspaceLiveSurfaceProps) => {
  const {
    trainerChartWorkspaceLayout,
    ui,
    tradingAssetUi,
    tradeLogBaseTimeframe,
    tradeLogTimeZone,
    tradingPresetEditor,
    tt,
    trainingKlineSourceProgressLine,
    hasTrainingKlineProgressWarning,
    securitiesTotal,
    securitiesDelta,
    positionMarketValue,
    securitiesAccount,
    currentTradingFee,
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    buyRatioPresetOptions,
    buyEstimate,
    sellEstimate,
    buyPriceMode,
    buyOrderDisabled,
    sellOrderDisabled,
    nextOpenUnavailable,
    tradeLogRows,
    formatMoney,
    formatTradingQuantityText,
    formatTradeLogQuantityText,
    pnlClass,
    normalizeInput,
    setBuyTradeInputMode,
    setBuyLotInput,
    setBuyAmountInput,
    setBuyRatioInput,
    stepNext,
    isStepNextDisabled,
    undoAvailableSteps,
    undoMaxSteps,
    undo,
    placeOrder,
    openResetAllDialog,
    calendarSpanText,
    replaySpanText,
    trainingDateRange,
  } = pageProps;

  return (
    <div className="app-shell">
      <section className="left-panel card">
        <div className="trainer-market-layout">
          <div className="trainer-market-layout-chart">
            <div
              className="trainer-market-layout-chart-shell"
              aria-busy={hydrationBusy}
            >
              {trainerChartWorkspaceLayout}
              {hydrationBusy ? (
                <div
                  className="trainer-hydration-overlay"
                  role="status"
                  aria-live="polite"
                  aria-label={trainerHydrationOverlayLabel}
                >
                  <div className="trainer-hydration-overlay-card">
                    <div className="trainer-hydration-overlay-shimmer is-title" aria-hidden="true" />
                    <div className="trainer-hydration-overlay-shimmer is-body" aria-hidden="true" />
                    <div className="trainer-hydration-overlay-shimmer is-body is-short" aria-hidden="true" />
                    <div className="trainer-hydration-overlay-label">
                      {trainerHydrationOverlayLabel}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <TrainerTradeLogStrip
            emptyText={tt("appText.transactionYet")}
            timeFallbackText={noneLabel}
            buyLabel={buyActionLabel}
            sellLabel={sellActionLabel}
            buyStatsText={tradeLogBuySellStats.buyText}
            sellStatsText={tradeLogBuySellStats.sellText}
            statsSeparatorText={tradeLogBuySellStats.separator}
            rows={tradeLogRows}
            baseTimeframe={tradeLogBaseTimeframe}
            timeZone={tradeLogTimeZone}
            formatMoney={formatMoney}
            formatTradeLogQuantityText={formatTradeLogQuantityText}
            surface="flush"
          />
        </div>
      </section>

      <section className="right-panel card right-panel-no-head">
        <div className="right-panel-body trainer-live-rail-body">
          <div className="trainer-right-panel-fit-content is-live">
            <fieldset
              className="trainer-live-rail-fieldset"
              aria-busy={hydrationBusy}
            >
              <div className="trainer-live-rail-header is-actions-only">
                <div className="trainer-live-rail-header-actions">
                  {trainingKlineSourceProgressLine ? (
                    <span
                      className={`trainer-live-source-progress ${
                        hasTrainingKlineProgressWarning ? "progress-warning" : ""
                      }`}
                      title={trainingKlineSourceProgressLine}
                    >
                      {trainingKlineSourceProgressLine}
                    </span>
                  ) : null}
                  <Button
                    className="trainer-live-end-training-button"
                    variant="secondary"
                    onClick={() => void openResetAllDialog()}
                    disabled={disableEndAllTrainingAction}
                    loading={pageProps.isPreparingAction}
                    loadingLabel={ui.endAllTraining}
                  >
                    {ui.endAllTraining}
                  </Button>
                </div>
              </div>

              <WorkbenchRailSection
                className="trainer-live-rail-section trainer-live-position-section"
                surface="flush"
                title={
                  <span data-i18n-slot="cardTitle" data-i18n-critical="true">
                    {tt("trainer.position.cardTitle")}
                  </span>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="position-market-preset-trigger"
                      onClick={openMarketPresetOverviewDialog}
                      aria-haspopup="dialog"
                      aria-label={tradingRulesActionLabel}
                    >
                      <span
                        className="position-market-preset-trigger-label"
                        data-i18n-slot="buttonLabel"
                        data-i18n-critical="true"
                      >
                        {tradingRulesActionLabel}
                      </span>
                    </Button>
                    <DropdownMenu
                      modal={false}
                      open={isAccountSettingsMenuOpen}
                      onOpenChange={(nextOpen) => {
                        if (nextOpen) {
                          handleMarketPresetMenuOpenChange("LONG", false);
                          handleMarketPresetMenuOpenChange("SHORT", false);
                        }
                        setIsAccountSettingsMenuOpen(nextOpen);
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              className={`position-account-settings-trigger trainer-live-account-settings-trigger ${
                                isAccountSettingsMenuOpen ? "is-active" : ""
                              }`}
                              aria-label={tt("trainer.position.accountSettings")}
                              aria-expanded={isAccountSettingsMenuOpen}
                              aria-controls={accountSettingsPanelId}
                            >
                              <AppIcon
                                name="actionWallet"
                                className="position-account-settings-icon"
                                aria-hidden="true"
                              />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          sideOffset={8}
                          className="quick-hover-tooltip-content"
                          showArrow={false}
                        >
                          {tt("trainer.position.accountSettings")}
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent
                        className="position-buying-power-menu"
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        collisionPadding={12}
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                        <div
                          className="position-buying-power-menu-shell"
                          onKeyDown={(event) => {
                            if (event.key !== "Escape") {
                              event.stopPropagation();
                            }
                          }}
                        >
                          <TrainerAccountSettingsInlinePanel
                            active={isAccountSettingsMenuOpen}
                            editor={tradingPresetEditor}
                            tt={tt}
                            panelId={accountSettingsPanelId}
                            className="position-buying-power-menu-panel"
                          />
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                }
              >
                <div className="trainer-position-metric-grid">
                  <TrainerPositionMetric
                    className="trainer-position-metric-card trainer-position-metric-card--hero"
                    label={tt("trainer.position.totalAsset")}
                    value={formatMoney(securitiesTotal)}
                    valueClassName={`position-value-summary trainer-position-hero-value ${pnlClass(securitiesDelta)}`}
                  />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card trainer-position-metric-card--hero trainer-position-metric-card--accent-meta"
                    label={tt("trainer.position.cumulativePnl")}
                    value={cumulativePnlText}
                    valueClassName={`trainer-position-hero-value ${pnlClass(securitiesDelta)}`}
                    meta={cumulativePnlRatioText}
                    metaClassName={`position-sub position-sub-pnl ${pnlClass(securitiesDelta)}`}
                  />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card"
                    label={tt("trainer.position.availableCash")}
                    value={formatMoney(availableFundsValue)}
                  />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card"
                    label={tradingAssetUi.positionValueLabel}
                    value={formatMoney(positionMarketValue)}
                  />
                  <DropdownMenu
                    modal={false}
                    open={marketPresetMenuMode === "LONG"}
                    onOpenChange={(nextOpen) =>
                      handleMarketPresetMenuOpenChange("LONG", nextOpen)
                    }
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className={`position-item trainer-position-metric trainer-position-metric-card position-buying-power-trigger position-buying-power-item ${
                          marketPresetMenuMode === "LONG" ? "is-active" : ""
                        }`}
                        aria-label={`${longCapacityLabel} ${longCapacityValue}`}
                        title={`${longCapacityLabel} ${longCapacityValue}`}
                        aria-expanded={marketPresetMenuMode === "LONG"}
                        aria-controls={longMarketPresetPanelId}
                      >
                        <span className="position-buying-power-label">
                          {longCapacityLabel}
                        </span>
                        <span className="position-buying-power-value">
                          {longCapacityValue}
                        </span>
                        <span
                          className="position-metric-meta is-empty"
                          aria-hidden="true"
                        >
                          {POSITION_METRIC_EMPTY_META}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="position-buying-power-menu"
                      align="start"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={12}
                      onCloseAutoFocus={(event) => event.preventDefault()}
                    >
                      <div
                        className="position-buying-power-menu-shell"
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") {
                            event.stopPropagation();
                          }
                        }}
                      >
                        <TrainerMarketPresetInlinePanel
                          mode="LONG"
                          editor={tradingPresetEditor}
                          panelId={longMarketPresetPanelId}
                          className="position-buying-power-menu-panel"
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {showShortOpenCapacityMenu ? (
                    <DropdownMenu
                      modal={false}
                      open={marketPresetMenuMode === "SHORT"}
                      onOpenChange={(nextOpen) =>
                        handleMarketPresetMenuOpenChange("SHORT", nextOpen)
                      }
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className={`position-item trainer-position-metric trainer-position-metric-card position-buying-power-trigger position-buying-power-item is-end ${
                            marketPresetMenuMode === "SHORT" ? "is-active" : ""
                          }`}
                          aria-label={`${shortCapacityLabel} ${shortCapacityValue}`}
                          title={`${shortCapacityLabel} ${shortCapacityValue}`}
                          aria-expanded={marketPresetMenuMode === "SHORT"}
                          aria-controls={shortMarketPresetPanelId}
                        >
                          <span className="position-buying-power-label">
                            {shortCapacityLabel}
                          </span>
                          <span className="position-buying-power-value">
                            {shortCapacityValue}
                          </span>
                          <span
                            className="position-metric-meta is-empty"
                            aria-hidden="true"
                          >
                            {POSITION_METRIC_EMPTY_META}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="position-buying-power-menu"
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        collisionPadding={12}
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                        <div
                          className="position-buying-power-menu-shell"
                          onKeyDown={(event) => {
                            if (event.key !== "Escape") {
                              event.stopPropagation();
                            }
                          }}
                        >
                          <TrainerMarketPresetInlinePanel
                            mode="SHORT"
                            editor={tradingPresetEditor}
                            panelId={shortMarketPresetPanelId}
                            className="position-buying-power-menu-panel"
                          />
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div
                      className="position-item trainer-position-metric trainer-position-metric-card position-buying-power-item is-end"
                      aria-label={`${shortCapacityLabel} ${shortCapacityValue}`}
                      title={`${shortCapacityLabel} ${shortCapacityValue}`}
                    >
                      <span className="position-buying-power-label">
                        {shortCapacityLabel}
                      </span>
                      <span className="position-buying-power-value">
                        {shortCapacityValue}
                      </span>
                      <span
                        className="position-metric-meta is-empty"
                        aria-hidden="true"
                      >
                        {POSITION_METRIC_EMPTY_META}
                      </span>
                    </div>
                  )}
                  <div className="trainer-position-grid-divider" aria-hidden="true" />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card"
                    label={tradingAssetUi.positionQtyLabel}
                    value={formatTradingQuantityText(positionQtyValue, "POSITION")}
                  />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card trainer-position-metric-card--accent-meta"
                    label={tt("trainer.position.floatingPnl")}
                    value={floatingPnlText}
                    valueClassName={pnlClass(floatingPnlValue)}
                    meta={floatingPnlRatioText}
                    metaClassName={`position-sub position-sub-pnl ${pnlClass(floatingPnlValue)}`}
                  />
                  <TrainerPositionMetric
                    className="trainer-position-metric-card trainer-position-cost-item"
                    label={tt("trainer.position.fees")}
                    value={formatMoney(currentTradingFee)}
                  />
                  <TrainerPositionMetric
                    className={`trainer-position-metric-card trainer-position-cost-item trainer-position-carry-cost-item${hasCarryCost ? "" : " is-zero"}`}
                    label={shortFeeLabel}
                    value={shortFeeValue}
                  />
                  <div className="trainer-position-grid-divider" aria-hidden="true" />
                  <div className="position-summary-footer-item trainer-position-footer-item">
                    <span className="position-summary-footer-label">
                      {calendarSpanLabel}
                    </span>
                    <span className="position-summary-footer-value">
                      {calendarSpanText}
                    </span>
                  </div>
                  <div className="position-summary-footer-item trainer-position-footer-item">
                    <span className="position-summary-footer-label">
                      {replaySpanLabel}
                    </span>
                    <span className="position-summary-footer-value">
                      {replaySpanText}
                    </span>
                  </div>
                  <span className="position-summary-footer-range">
                    {trainingDateRange}
                  </span>
                </div>
              </WorkbenchRailSection>

              <WorkbenchRailSection
                className="trainer-live-rail-section trainer-live-order-section"
                surface="flush"
              >
                <TradingOrderTicket
                  className="trainer-live-order-card"
                  dataAutoshrinkIgnore
                  inputMode={buyTradeInputMode}
                  onInputModeChange={(value) => {
                    if (value === "LOT" || value === "AMOUNT" || value === "RATIO") {
                      setBuyTradeInputMode(value);
                    }
                  }}
                  quantityModeLabel={tradingAssetUi.quantityModeLabel}
                  amountModeLabel={tradingAssetUi.amountModeLabel}
                  ratioModeLabel={tt("appText.ratio")}
                  lotInput={buyLotInput}
                  onLotInputChange={setBuyLotInput}
                  quantityInputPlaceholder={tradingAssetUi.quantityInputPlaceholder}
                  quantityInputUnit={tradingAssetUi.quantityInputUnit}
                  amountInput={buyAmountInput}
                  onAmountInputChange={setBuyAmountInput}
                  amountInputPlaceholder={tradingAssetUi.amountInputPlaceholder}
                  amountInputUnit={securitiesAccount?.currency || "CNY"}
                  ratioInput={buyRatioInput}
                  onRatioInputChange={setBuyRatioInput}
                  ratioPresetOptions={buyRatioPresetOptions}
                  percentSymbol={tt("common.symbol.percent")}
                  normalizeInput={normalizeInput}
                  referenceLabel={tt("appText.fillPrice")}
                  referenceValue={
                    activeReferenceOrderPrice > 0
                      ? formatMoney(activeReferenceOrderPrice, 3)
                      : noneLabel
                  }
                  referencePriceModeLabel={referencePriceModeLabel}
                  priceMode={buyPriceMode}
                  onPriceModeChange={handleSelectReferencePriceMode}
                  currentCloseLabel={ui.currentClose}
                  nextOpenLabel={ui.nextOpen}
                  nextOpenUnavailable={nextOpenUnavailable}
                  buyEstimate={{
                    quantityLabel: tt("appText.estBuy"),
                    quantityValue: formatTradingQuantityText(buyEstimate.qty),
                    cashLabel: tt("appText.estimatedSpend"),
                    cashValue: formatMoney(buyEstimate.cashEffect),
                    executionBreakdown: buyExecutionBreakdownText,
                    disabled: buyOrderDisabled,
                  }}
                  sellEstimate={{
                    quantityLabel: tt("appText.estSell"),
                    quantityValue: formatTradingQuantityText(sellEstimate.qty),
                    cashLabel: tt("appText.estimatedProceeds"),
                    cashValue: formatMoney(sellEstimate.cashEffect),
                    executionBreakdown: sellExecutionBreakdownText,
                    disabled: sellOrderDisabled,
                  }}
                  buyAction={{
                    tone: "buy",
                    buttonClassName: buyOrderButtonClassName,
                    disabled: buyOrderDisabled,
                    onPointerDown: () =>
                      markTrainerHotInteractionInput("BUY", "pointerdown"),
                    onClick: () => void placeOrder("BUY"),
                    title: buyOrderButtonLabel,
                    ariaLabel: buyOrderButtonLabel,
                    label: buyOrderButtonLabel,
                  }}
                  sellAction={{
                    tone: "sell",
                    buttonClassName: sellOrderButtonClassName,
                    disabled: sellOrderDisabled,
                    onPointerDown: () =>
                      markTrainerHotInteractionInput("SELL", "pointerdown"),
                    onClick: () => void placeOrder("SELL"),
                    title: sellOrderButtonLabel,
                    ariaLabel: sellOrderButtonLabel,
                    label: sellOrderButtonLabel,
                  }}
                  nextAction={{
                    tone: "next",
                    buttonClassName: "trade-next-action",
                    disabled: isStepNextDisabled,
                    onPointerDown: () =>
                      markTrainerHotInteractionInput("STEP", "pointerdown"),
                    onClick: () => void stepNext(),
                    label: (
                      <span className="trade-next-action-copy">
                        <AppIcon
                          name="actionFastForward"
                          className="trade-next-action-icon"
                          aria-hidden="true"
                        />
                        <span>{ui.nextBar}</span>
                      </span>
                    ),
                  }}
                  undoAction={{
                    tone: "ghost",
                    buttonClassName: "trade-undo-action",
                    disabled: false,
                    onClick: () => void undo(),
                    title: undoButtonTitle,
                    ariaLabel: undoButtonTitle,
                    label: (
                      <span className="trade-undo-action-copy">
                        <span>{tt("appText.undo")}</span>
                        <span className="trade-undo-action-count">
                          {`${undoAvailableSteps}/${undoMaxSteps}`}
                        </span>
                      </span>
                    ),
                  }}
                />
              </WorkbenchRailSection>
            </fieldset>
          </div>
        </div>
      </section>
    </div>
  );
};
