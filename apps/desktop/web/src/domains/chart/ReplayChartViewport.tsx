// SPDX-License-Identifier: GPL-3.0-only

import { type CSSProperties, type ReactNode, type Ref } from "react";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { cn } from "@/ui/cn";
import { AppIcon } from "@/assets/graphics";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import {
  CHART_RENDER_MODES,
  type ChartRenderMode,
} from "@/domains/chart/chartRenderMode";
import {
  getDisplayPeriodShortLabel,
  isDisplayPeriodKey,
  type ChartRenderModeLabelMap,
} from "@/ui/config/uiConfig";

const CHART_RENDER_MODE_ICON_NAME: Record<
  ChartRenderMode,
  "chartTypeCandle" | "chartTypeLine" | "chartTypeOhlc"
> = {
  CANDLE: "chartTypeCandle",
  LINE: "chartTypeLine",
  OHLC: "chartTypeOhlc",
};

type ReplayChartIndicatorQuickMenuOption = {
  key: string;
  label: string;
  disabled?: boolean;
};

type ReplayChartIndicatorQuickMenuGroup = {
  key: string;
  label: string;
  options: ReplayChartIndicatorQuickMenuOption[];
};

export type ReplayChartIndicatorQuickMenu = {
  open: boolean;
  anchorLeft: number;
  anchorTop: number;
  currentValue: string;
  noneOption?: ReplayChartIndicatorQuickMenuOption | null;
  options?: ReplayChartIndicatorQuickMenuOption[];
  groups?: ReplayChartIndicatorQuickMenuGroup[];
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
};

export type ReplayChartToolbarContentProps = {
  periodTitle: string;
  periodOptions: readonly string[];
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  getPeriodLabel: (period: string) => string;
  periodOriginPrefix: string;
  basePeriod: string;
  klineRemainingLine?: string;
  hasProgressWarning?: boolean;
  showPeriodSourceMeta?: boolean;
  indicatorLabel: string;
  showPeriodSwitch?: boolean;
  showChartRenderModeSwitch?: boolean;
  chartRenderMode?: ChartRenderMode;
  onChartRenderModeChange?: (mode: ChartRenderMode) => void;
  chartRenderModeLabels?: ChartRenderModeLabelMap;
  chartRenderModeGroupLabel?: string;
  showIndicatorButton?: boolean;
  isIndicatorButtonActive?: boolean;
  indicatorQuickMenu?: ReplayChartIndicatorQuickMenu | null;
  onOpenChartSettings?: () => void;
  showSubIndicatorToggle?: boolean;
  hasAnySubIndicator?: boolean;
  showSubIndicators?: boolean;
  onToggleSubIndicators?: () => void;
  subIndicatorToggleTitle?: string;
  toolbarClassName?: string;
  toolbarLeadingContent?: ReactNode;
  canvasWrapClassName?: string;
  canvasClassName?: string;
  watermarkText?: string | null;
  changeBubbleText?: string | null;
  changeBubbleTitle?: string;
  changeBubbleClassName?: string;
  changeBubbleStyle?: CSSProperties;
  changeBubblePlacement?: "float" | "origin-left" | "toolbar-left" | "toolbar-right";
};

const getChartPeriodButtonLabel = (period: string): string =>
  isDisplayPeriodKey(period) ? getDisplayPeriodShortLabel(period) : period;

type ReplayChartViewportProps = ReplayChartToolbarContentProps & {
  chartDomRef: Ref<HTMLDivElement>;
  showToolbar?: boolean;
  canvasWrapClassName?: string;
  canvasClassName?: string;
  watermarkText?: string | null;
};

export const ReplayChartToolbarContent = ({
  periodOptions,
  selectedPeriod,
  onPeriodChange,
  getPeriodLabel,
  periodOriginPrefix,
  basePeriod,
  klineRemainingLine,
  hasProgressWarning = false,
  showPeriodSourceMeta = true,
  indicatorLabel,
  showPeriodSwitch = true,
  showChartRenderModeSwitch = true,
  chartRenderMode = "CANDLE",
  onChartRenderModeChange,
  chartRenderModeLabels,
  chartRenderModeGroupLabel,
  showIndicatorButton = true,
  isIndicatorButtonActive = false,
  onOpenChartSettings,
  showSubIndicatorToggle = false,
  showSubIndicators = false,
  onToggleSubIndicators,
  subIndicatorToggleTitle,
  toolbarLeadingContent,
  changeBubbleText,
  changeBubbleTitle,
  changeBubbleClassName,
  changeBubblePlacement = "float",
}: ReplayChartToolbarContentProps) => {
  const canOpenChartSettings = typeof onOpenChartSettings === "function";
  const canSwitchChartRenderMode =
    showChartRenderModeSwitch &&
    Boolean(chartRenderModeLabels) &&
    typeof onChartRenderModeChange === "function";
  const resolvedChartRenderModeGroupLabel =
    chartRenderModeGroupLabel || indicatorLabel;
  const currentChartRenderModeLabel =
    chartRenderModeLabels?.[chartRenderMode] ?? chartRenderMode;
  const chartRenderModeTooltip = `${resolvedChartRenderModeGroupLabel} (${currentChartRenderModeLabel})`;

  return (
    <>
      {toolbarLeadingContent ? (
        <div className="chart-period-toolbar-leading">
          {toolbarLeadingContent}
        </div>
      ) : null}
      {changeBubbleText && changeBubblePlacement === "toolbar-left" ? (
        <span
          className={cn(
            "chart-change-float chart-change-inline chart-change-inline-left",
            changeBubbleClassName,
          )}
          title={changeBubbleTitle}
        >
          {changeBubbleText}
        </span>
      ) : null}
      {canSwitchChartRenderMode ? (
        <div
          className="chart-render-mode-switch"
          role="group"
          aria-label={resolvedChartRenderModeGroupLabel}
        >
          <Tooltip delay={500}>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    className={cn(
                      "chart-period-indicator chart-render-mode-trigger",
                    )}
                    aria-label={chartRenderModeTooltip}
                  >
                    <span className="chart-render-mode-trigger-icon-wrap">
                      <AppIcon
                        name={CHART_RENDER_MODE_ICON_NAME[chartRenderMode]}
                      />
                      <span
                        className="chart-render-mode-caret"
                        aria-hidden="true"
                      />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="chart-render-mode-menu"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {CHART_RENDER_MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode}
                    className={cn(
                      "chart-render-mode-menu-item",
                      chartRenderMode === mode ? "is-active" : "",
                    )}
                    onSelect={() => onChartRenderModeChange?.(mode)}
                  >
                    <AppIcon
                      name={CHART_RENDER_MODE_ICON_NAME[mode]}
                      className="chart-render-mode-menu-item-icon"
                    />
                    <span>{chartRenderModeLabels?.[mode] ?? mode}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent
              side="bottom"
              sideOffset={8}
              className="quick-hover-tooltip-content chart-render-mode-tooltip"
              showArrow={false}
            >
              {chartRenderModeTooltip}
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      {showIndicatorButton ? (
        <Button
          type="button"
          className={`chart-period-indicator ${isIndicatorButtonActive ? "period-proxy-active" : ""}`}
          onClick={() => onOpenChartSettings?.()}
          disabled={!canOpenChartSettings}
          title={indicatorLabel}
          aria-label={indicatorLabel}
        >
          <AppIcon name="navCustomIndicator" />
          <span>{indicatorLabel}</span>
        </Button>
      ) : null}
      {showPeriodSwitch
        ? periodOptions.map((period) => {
            const periodLabel = getPeriodLabel(period);
            return (
              <Button
                key={period}
                type="button"
                variant="inline"
                size="sm"
                className="chart-period-btn"
                aria-label={periodLabel}
                title={periodLabel}
                aria-pressed={selectedPeriod === period}
                onClick={() => onPeriodChange(period)}
              >
                {getChartPeriodButtonLabel(period)}
              </Button>
            );
          })
        : null}
      {showSubIndicatorToggle ||
      (changeBubbleText && changeBubblePlacement === "origin-left") ||
      showPeriodSourceMeta ? (
        <div className="chart-period-origin-wrap">
          {showSubIndicatorToggle ? (
            <Tooltip delay={0}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  className={`chart-period-indicator chart-period-sub-indicator-toggle chart-period-sub-indicator-toggle-origin ${
                    showSubIndicators ? "is-visible" : "is-hidden"
                  }`}
                  onClick={() => onToggleSubIndicators?.()}
                  disabled={typeof onToggleSubIndicators !== "function"}
                  aria-label={subIndicatorToggleTitle}
                >
                  <AppIcon
                    name={showSubIndicators ? "subIndicatorsOn" : "subIndicatorsOff"}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>
                {subIndicatorToggleTitle}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {changeBubbleText && changeBubblePlacement === "origin-left" ? (
            <span
              className={cn(
                "chart-change-float chart-change-inline",
                changeBubbleClassName,
              )}
              title={changeBubbleTitle}
            >
              {changeBubbleText}
            </span>
          ) : null}
          {showPeriodSourceMeta ? (
            <span className="chart-period-origin">
              {periodOriginPrefix}
              {tt("appText.message0696")} {getPeriodLabel(basePeriod)}
            </span>
          ) : null}
          {showPeriodSourceMeta && klineRemainingLine ? (
            <span
              className={`chart-period-remaining-inline ${hasProgressWarning ? "progress-warning" : ""}`}
              title={klineRemainingLine}
            >
              {klineRemainingLine}
            </span>
          ) : null}
        </div>
      ) : null}
      {changeBubbleText && changeBubblePlacement === "toolbar-right" ? (
        <span
          className={cn(
            "chart-change-float chart-change-inline chart-change-inline-right",
            changeBubbleClassName,
          )}
          title={changeBubbleTitle}
        >
          {changeBubbleText}
        </span>
      ) : null}
    </>
  );
};

export const ReplayChartViewport = ({
  chartDomRef,
  periodTitle,
  periodOptions,
  selectedPeriod,
  onPeriodChange,
  getPeriodLabel,
  periodOriginPrefix,
  basePeriod,
  klineRemainingLine,
  hasProgressWarning = false,
  showPeriodSourceMeta = true,
  indicatorLabel,
  showPeriodSwitch = true,
  showChartRenderModeSwitch = true,
  chartRenderMode = "CANDLE",
  onChartRenderModeChange,
  chartRenderModeLabels,
  chartRenderModeGroupLabel,
  showIndicatorButton = true,
  isIndicatorButtonActive = false,
  indicatorQuickMenu,
  onOpenChartSettings,
  showSubIndicatorToggle = false,
  hasAnySubIndicator = false,
  showSubIndicators = false,
  onToggleSubIndicators,
  subIndicatorToggleTitle,
  toolbarClassName,
  toolbarLeadingContent,
  showToolbar = true,
  canvasWrapClassName,
  canvasClassName,
  watermarkText,
  changeBubbleText,
  changeBubbleTitle,
  changeBubbleClassName,
  changeBubbleStyle,
  changeBubblePlacement = "float",
}: ReplayChartViewportProps) => {
  return (
    <>
      {showToolbar ? (
        <div
          className={cn("chart-period-toolbar", toolbarClassName)}
          role="group"
          aria-label={periodTitle}
        >
          <ReplayChartToolbarContent
            periodTitle={periodTitle}
            periodOptions={periodOptions}
            selectedPeriod={selectedPeriod}
            onPeriodChange={onPeriodChange}
            getPeriodLabel={getPeriodLabel}
            periodOriginPrefix={periodOriginPrefix}
            basePeriod={basePeriod}
            klineRemainingLine={klineRemainingLine}
            hasProgressWarning={hasProgressWarning}
            showPeriodSourceMeta={showPeriodSourceMeta}
            indicatorLabel={indicatorLabel}
            showPeriodSwitch={showPeriodSwitch}
            showChartRenderModeSwitch={showChartRenderModeSwitch}
            chartRenderMode={chartRenderMode}
            onChartRenderModeChange={onChartRenderModeChange}
            chartRenderModeLabels={chartRenderModeLabels}
            chartRenderModeGroupLabel={chartRenderModeGroupLabel}
            showIndicatorButton={showIndicatorButton}
            isIndicatorButtonActive={isIndicatorButtonActive}
            indicatorQuickMenu={indicatorQuickMenu}
            onOpenChartSettings={onOpenChartSettings}
            showSubIndicatorToggle={showSubIndicatorToggle}
            hasAnySubIndicator={hasAnySubIndicator}
            showSubIndicators={showSubIndicators}
            onToggleSubIndicators={onToggleSubIndicators}
            subIndicatorToggleTitle={subIndicatorToggleTitle}
            toolbarLeadingContent={toolbarLeadingContent}
            changeBubbleText={changeBubbleText}
            changeBubbleTitle={changeBubbleTitle}
            changeBubbleClassName={changeBubbleClassName}
            changeBubbleStyle={changeBubbleStyle}
            changeBubblePlacement={changeBubblePlacement}
          />
        </div>
      ) : null}

      <div className={cn("chart-canvas-wrap", canvasWrapClassName)}>
        {indicatorQuickMenu ? (
          <DropdownMenu
            open={indicatorQuickMenu.open}
            onOpenChange={indicatorQuickMenu.onOpenChange}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-hidden="true"
                tabIndex={-1}
                className="chart-indicator-quick-menu-anchor"
                style={
                  {
                    left: `${indicatorQuickMenu.anchorLeft}px`,
                    top: `${indicatorQuickMenu.anchorTop}px`,
                  } as CSSProperties
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={6}
              collisionPadding={12}
              className="chart-indicator-quick-menu"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <div className="chart-indicator-quick-menu-shell">
                <div className="chart-indicator-quick-menu-panel">
                  {indicatorQuickMenu.noneOption ? (
                    <>
                      <DropdownMenuItem
                        className={cn(
                          "chart-render-mode-menu-item",
                          indicatorQuickMenu.currentValue ===
                            indicatorQuickMenu.noneOption.key
                            ? "is-active"
                            : "",
                        )}
                        onSelect={() =>
                          indicatorQuickMenu.onSelect(
                            indicatorQuickMenu.noneOption?.key ?? "",
                          )
                        }
                      >
                        <span>{indicatorQuickMenu.noneOption.label}</span>
                      </DropdownMenuItem>
                      {(
                        (indicatorQuickMenu.options?.length ?? 0) > 0 ||
                        (indicatorQuickMenu.groups?.length ?? 0) > 0
                      ) ? (
                        <DropdownMenuSeparator className="chart-indicator-quick-menu-separator" />
                      ) : null}
                    </>
                  ) : null}
                  {(indicatorQuickMenu.options ?? []).map((option) => (
                      <DropdownMenuItem
                      key={option.key}
                      className={cn(
                        "chart-render-mode-menu-item",
                        option.disabled ? "is-disabled" : "",
                        indicatorQuickMenu.currentValue === option.key
                          ? "is-active"
                          : "",
                      )}
                      disabled={option.disabled}
                      onSelect={() => indicatorQuickMenu.onSelect(option.key)}
                    >
                      <span>{option.label}</span>
                    </DropdownMenuItem>
                  ))}
                  {(indicatorQuickMenu.groups ?? []).map((group, groupIndex) => (
                    <div
                      key={group.key}
                      className="chart-indicator-quick-menu-group"
                    >
                      {groupIndex > 0 ||
                      (indicatorQuickMenu.options?.length ?? 0) > 0 ? (
                        <DropdownMenuSeparator className="chart-indicator-quick-menu-separator" />
                      ) : null}
                      <DropdownMenuLabel className="chart-indicator-quick-menu-label">
                        {group.label}
                      </DropdownMenuLabel>
                      {group.options.map((option) => (
                        <DropdownMenuItem
                          key={`${group.key}-${option.key}`}
                          className={cn(
                            "chart-render-mode-menu-item",
                            option.disabled ? "is-disabled" : "",
                            indicatorQuickMenu.currentValue === option.key
                              ? "is-active"
                              : "",
                          )}
                          disabled={option.disabled}
                          onSelect={() => indicatorQuickMenu.onSelect(option.key)}
                        >
                          <span>{option.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <div
          className={cn("chart-canvas", canvasClassName)}
          ref={chartDomRef}
        />
        {watermarkText ? (
          <div className="trainer-empty-watermark history-preview-watermark">
            {watermarkText}
          </div>
        ) : null}
        {changeBubbleText && changeBubblePlacement === "float" ? (
          <div
            className={cn("chart-change-float", changeBubbleClassName)}
            title={changeBubbleTitle}
            style={changeBubbleStyle}
          >
            {changeBubbleText}
          </div>
        ) : null}
      </div>
    </>
  );
};
