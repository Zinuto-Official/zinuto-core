// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import { Button } from "@/ui/primitives/button";
import { Slider } from "@/ui/primitives/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { AppIcon, DrawToolIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import {
  ChartTopBar,
  DrawingToolbar,
  MainChartPanel,
} from "@/ui/components";
import {
  ReplayChartViewport,
  ReplayChartToolbarContent,
  type ReplayChartIndicatorQuickMenu,
} from "@/domains/chart/ReplayChartViewport";
import type { ChartRenderModeLabelMap } from "@/ui/config/uiConfig";

type DrawMagnetMode = "weak_magnet" | "strong_magnet";
type DrawLineType = "solid" | "dashed";

type TrainerChartWorkspaceTopBar = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
};

type TrainerChartWorkspaceLabels = {
  color: string;
  thickness: string;
  magnet: string;
  weak: string;
  strong: string;
  lineType: string;
  solid: string;
  dashed: string;
  hideAll: string;
  showAll: string;
  deleteAll: string;
  addNote: string;
  chartSettings: string;
  indicator: string;
  periodTitle: string;
  periodOriginPrefix: string;
  changeTooltip: string;
};

export type TrainerChartWorkspaceProps = {
  topBar?: TrainerChartWorkspaceTopBar;
  topBarSurface?: "card" | "flush";
  isDrawingToolbarDisabled?: boolean;
  drawingToolbarSurface?: "card" | "flush";
  drawingToolbarDensity?: "default" | "compact" | "slim";
  activeDrawTool: string;
  drawToolOptions: readonly string[];
  drawToolLabels: Readonly<Record<string, string>>;
  drawTooltipByTool: Readonly<Record<string, string>>;
  onDrawToolSelect: (tool: string) => void;
  drawColors: readonly string[];
  drawColor: string;
  onDrawColorChange: (color: string) => void;
  drawLineWidth: number;
  onDrawLineWidthChange: (width: number) => void;
  drawMagnet: string;
  onDrawMagnetChange: (mode: DrawMagnetMode) => void;
  drawLineType: DrawLineType;
  onDrawLineTypeChange: (lineType: DrawLineType) => void;
  drawingCount: number;
  allDrawingsVisible: boolean;
  onToggleAllDrawingsVisible: () => void;
  onClearDrawings: () => void;
  onCreateNote: () => void;
  showNoteAction?: boolean;
  chartDomRef: Ref<HTMLDivElement>;
  showChartSettingsModal: boolean;
  mainChartPanelSurface?: "card" | "flush";
  indicatorQuickMenu?: ReplayChartIndicatorQuickMenu | null;
  onOpenChartSettingsModal: () => void;
  chartRenderMode: ChartRenderMode;
  onChartRenderModeChange: (mode: ChartRenderMode) => void;
  chartRenderModeLabels: ChartRenderModeLabelMap;
  chartRenderModeGroupLabel: string;
  periodOptions: readonly string[];
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  getPeriodLabel: (period: string) => string;
  basePeriod: string;
  klineRemainingLine?: string;
  hasProgressWarning?: boolean;
  showPeriodSourceMeta?: boolean;
  showSubIndicatorToggle?: boolean;
  hasAnySubIndicator?: boolean;
  showSubIndicators?: boolean;
  onToggleSubIndicators?: () => void;
  subIndicatorToggleTitle?: string;
  replayEmptyWatermarkText?: string | null;
  selectedBarChange?: { ratio: number } | null;
  formatRatio: (value: number) => string;
  pnlClass: (value: number) => string;
  chartChangeBubbleRight: number;
  labels: TrainerChartWorkspaceLabels;
};

type ToolbarTooltipButtonProps = Omit<
  ComponentPropsWithoutRef<typeof TooltipTrigger>,
  "children"
> & {
  children: ReactNode;
  tooltip: ReactNode;
};

const ToolbarTooltipButton = ({
  children,
  className,
  tooltip,
  ...props
}: ToolbarTooltipButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="default" className={className} {...props}>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent
      side="right"
      sideOffset={8}
      className="quick-hover-tooltip-content"
      showArrow={false}
    >
      {tooltip}
    </TooltipContent>
  </Tooltip>
);

export const TrainerChartWorkspace = ({
  topBar,
  topBarSurface = "card",
  isDrawingToolbarDisabled = false,
  drawingToolbarSurface = "card",
  drawingToolbarDensity = "default",
  activeDrawTool,
  drawToolOptions,
  drawToolLabels,
  drawTooltipByTool,
  onDrawToolSelect,
  drawColors,
  drawColor,
  onDrawColorChange,
  drawLineWidth,
  onDrawLineWidthChange,
  drawMagnet,
  onDrawMagnetChange,
  drawLineType,
  onDrawLineTypeChange,
  drawingCount,
  allDrawingsVisible,
  onToggleAllDrawingsVisible,
  onClearDrawings,
  onCreateNote,
  showNoteAction = true,
  chartDomRef,
  showChartSettingsModal,
  mainChartPanelSurface = "card",
  indicatorQuickMenu,
  onOpenChartSettingsModal,
  chartRenderMode,
  onChartRenderModeChange,
  chartRenderModeLabels,
  chartRenderModeGroupLabel,
  periodOptions,
  selectedPeriod,
  onPeriodChange,
  getPeriodLabel,
  basePeriod,
  klineRemainingLine,
  hasProgressWarning = false,
  showPeriodSourceMeta = true,
  showSubIndicatorToggle = false,
  hasAnySubIndicator = false,
  showSubIndicators = false,
  onToggleSubIndicators,
  subIndicatorToggleTitle,
  replayEmptyWatermarkText,
  selectedBarChange,
  formatRatio,
  pnlClass,
  chartChangeBubbleRight,
  labels,
}: TrainerChartWorkspaceProps) => {
  const isStrongMagnet = drawMagnet === "strong_magnet";
  const mergeToolbarIntoTopBar = Boolean(topBar) && topBarSurface === "flush";
  const drawLineWidthFillPercent = Math.min(
    100,
    Math.max(0, ((drawLineWidth - 1) / 5) * 100),
  );
  const drawToolbarToolRowCount = Math.max(drawToolOptions.length + 1, 1);
  const drawToolbarStyle = {
    "--dt-tool-primary-count": String(Math.max(drawToolOptions.length, 1)),
    "--dt-tools-rows": `${drawToolbarToolRowCount}fr`,
    "--dt-config-rows": "4fr",
    "--dt-actions-rows": "2fr",
    "--dt-note-rows": "1fr",
  } as CSSProperties;
  const inlineChartToolbar = mergeToolbarIntoTopBar ? (
    <div
      className="trainer-inline-chart-toolbar"
      role="group"
      aria-label={labels.periodTitle}
    >
      <ReplayChartToolbarContent
        periodTitle={labels.periodTitle}
        periodOptions={periodOptions}
        selectedPeriod={selectedPeriod}
        onPeriodChange={onPeriodChange}
        getPeriodLabel={getPeriodLabel}
        periodOriginPrefix={labels.periodOriginPrefix}
        basePeriod={basePeriod}
        klineRemainingLine={klineRemainingLine}
        hasProgressWarning={hasProgressWarning}
        showPeriodSourceMeta={showPeriodSourceMeta}
        indicatorLabel={labels.indicator}
        chartRenderMode={chartRenderMode}
        onChartRenderModeChange={onChartRenderModeChange}
        chartRenderModeLabels={chartRenderModeLabels}
        chartRenderModeGroupLabel={chartRenderModeGroupLabel}
        indicatorQuickMenu={indicatorQuickMenu}
        onOpenChartSettings={onOpenChartSettingsModal}
        showSubIndicatorToggle={showSubIndicatorToggle}
        hasAnySubIndicator={hasAnySubIndicator}
        showSubIndicators={showSubIndicators}
        onToggleSubIndicators={onToggleSubIndicators}
        subIndicatorToggleTitle={subIndicatorToggleTitle}
      />
    </div>
  ) : null;

  return (
    <div
      className={`trainer-chart-workspace ${topBar ? "has-topbar" : "no-topbar"}`}
    >
      {topBar ? (
        <ChartTopBar
          className={topBar.className}
          left={mergeToolbarIntoTopBar ? inlineChartToolbar : topBar.left}
          center={topBar.center}
          right={topBar.right}
          surface={topBarSurface}
        />
      ) : null}
      <div
        className="chart-layout"
        data-drawing-density={drawingToolbarDensity}
      >
        <DrawingToolbar
          className="draw-toolbar"
          disabled={isDrawingToolbarDisabled}
          style={drawToolbarStyle}
          surface={drawingToolbarSurface}
          density={drawingToolbarDensity}
          tools={
            <>
              <div className="draw-tool-cursor-row">
                <ToolbarTooltipButton
                  onClick={() => onDrawToolSelect("cursor")}
                  className={`draw-tool-icon-btn ${activeDrawTool === "cursor" ? "active" : ""}`}
                  aria-label={drawTooltipByTool.cursor ?? drawToolLabels.cursor}
                  type="button"
                  disabled={isDrawingToolbarDisabled}
                  tooltip={drawTooltipByTool.cursor ?? drawToolLabels.cursor}
                >
                  <DrawToolIcon tool="cursor" />
                </ToolbarTooltipButton>
              </div>
              <div className="draw-tool-primary-grid">
                {drawToolOptions.map((tool) => {
                  const tooltip =
                    drawTooltipByTool[tool] ?? drawToolLabels[tool] ?? tool;
                  return (
                    <ToolbarTooltipButton
                      key={tool}
                      onClick={() => onDrawToolSelect(tool)}
                      className={`draw-tool-icon-btn ${activeDrawTool === tool ? "active" : ""}`}
                      aria-label={tooltip}
                      type="button"
                      disabled={isDrawingToolbarDisabled}
                      tooltip={tooltip}
                    >
                      <DrawToolIcon tool={tool} />
                    </ToolbarTooltipButton>
                  );
                })}
              </div>
            </>
          }
          controls={
            <>
              <div className="tool-divider controls-divider" />
              <div className="tool-cell tool-cell-color">
                <span className="tool-label">{labels.color}</span>
                <div className="color-row">
                  {drawColors.map((color) => (
                    <Button
                      key={color}
                      className={`color-dot ${drawColor === color ? "active" : ""}`}
                      style={{ background: color }}
                      onClick={() => onDrawColorChange(color)}
                      disabled={isDrawingToolbarDisabled}
                    />
                  ))}
                </div>
              </div>
              <div className="tool-cell tool-cell-line-type">
                <span className="tool-label">{labels.lineType}</span>
                <div className="draw-seg-switch">
                  <ToolbarTooltipButton
                    onClick={() => onDrawLineTypeChange("solid")}
                    className={`ui-option-strip-item ${drawLineType === "solid" ? "is-active" : ""}`}
                    aria-label={labels.solid}
                    type="button"
                    disabled={isDrawingToolbarDisabled}
                    tooltip={labels.solid}
                  >
                    <AppIcon
                      name="lineSolid"
                      className="line-type-icon"
                    />
                  </ToolbarTooltipButton>
                  <ToolbarTooltipButton
                    onClick={() => onDrawLineTypeChange("dashed")}
                    className={`ui-option-strip-item ${drawLineType === "dashed" ? "is-active" : ""}`}
                    aria-label={labels.dashed}
                    type="button"
                    disabled={isDrawingToolbarDisabled}
                    tooltip={labels.dashed}
                  >
                    <AppIcon
                      name="lineDashed"
                      className="line-type-icon"
                    />
                  </ToolbarTooltipButton>
                </div>
              </div>
              <div className="tool-cell tool-cell-thickness">
                <span className="tool-label">{labels.thickness}</span>
                <Slider
                  className="draw-line-width-range"
                  min={1}
                  max={6}
                  step={1}
                  value={drawLineWidth}
                  disabled={isDrawingToolbarDisabled}
                  style={
                    {
                      "--draw-range-fill": `${drawLineWidthFillPercent}%`,
                      "--ui-slider-fill": `${drawLineWidthFillPercent}%`,
                    } as CSSProperties
                  }
                  onChange={(event) =>
                    onDrawLineWidthChange(Number(event.target.value))
                  }
                />
              </div>
              <div className="tool-cell tool-cell-magnet">
                <span className="tool-label">{labels.magnet}</span>
                <div className="draw-seg-switch draw-magnet-switch">
                  <ToolbarTooltipButton
                    onClick={() =>
                      onDrawMagnetChange(
                        isStrongMagnet ? "weak_magnet" : "strong_magnet",
                      )
                    }
                    className={`ui-option-strip-item draw-magnet-toggle-btn ${isStrongMagnet ? "is-active" : ""}`}
                    aria-label={labels.magnet}
                    type="button"
                    disabled={isDrawingToolbarDisabled}
                    tooltip={labels.magnet}
                  >
                    <AppIcon
                      name="magnet"
                      className="line-type-icon draw-magnet-icon"
                    />
                  </ToolbarTooltipButton>
                </div>
              </div>
            </>
          }
          actions={
            <>
              <div className="tool-divider actions-divider" />
              <div className="draw-toolbar-danger-actions">
                <ToolbarTooltipButton
                  onClick={() => {
                    if (!drawingCount) {
                      return;
                    }
                    onToggleAllDrawingsVisible();
                  }}
                  className={cn(
                    "draw-toolbar-action-btn",
                    !drawingCount || isDrawingToolbarDisabled
                      ? "is-disabled"
                      : "",
                  )}
                  type="button"
                  aria-label={
                    allDrawingsVisible ? labels.hideAll : labels.showAll
                  }
                  aria-disabled={
                    !drawingCount || isDrawingToolbarDisabled
                  }
                  disabled={isDrawingToolbarDisabled}
                  tooltip={allDrawingsVisible ? labels.hideAll : labels.showAll}
                >
                  <AppIcon
                    name={
                      allDrawingsVisible
                        ? "actionHidden"
                        : "actionVisible"
                    }
                    className="line-type-icon"
                  />
                </ToolbarTooltipButton>
                <ToolbarTooltipButton
                  onClick={onClearDrawings}
                  className="draw-toolbar-action-btn danger"
                  type="button"
                  aria-label={labels.deleteAll}
                  disabled={isDrawingToolbarDisabled}
                  tooltip={labels.deleteAll}
                >
                  <AppIcon name="actionDelete" className="line-type-icon" />
                </ToolbarTooltipButton>
              </div>
            </>
          }
          note={
            showNoteAction ? (
              <div className="draw-toolbar-bottom">
                <div className="tool-divider note-divider" />
                <ToolbarTooltipButton
                  onClick={onCreateNote}
                  className="draw-note-create-btn draw-toolbar-action-btn"
                  type="button"
                  aria-label={labels.addNote}
                  disabled={isDrawingToolbarDisabled}
                  tooltip={labels.addNote}
                >
                  <AppIcon name="drawNote" />
                </ToolbarTooltipButton>
              </div>
            ) : undefined
          }
        />

        <MainChartPanel
          className={cn(
            "chart-panel",
            mergeToolbarIntoTopBar ? "chart-panel-canvas-only" : "",
          )}
          surface={mainChartPanelSurface}
        >
          <ReplayChartViewport
            chartDomRef={chartDomRef}
            periodTitle={labels.periodTitle}
            chartRenderMode={chartRenderMode}
            onChartRenderModeChange={onChartRenderModeChange}
            chartRenderModeLabels={chartRenderModeLabels}
            chartRenderModeGroupLabel={chartRenderModeGroupLabel}
            periodOptions={periodOptions}
            selectedPeriod={selectedPeriod}
            onPeriodChange={onPeriodChange}
            getPeriodLabel={getPeriodLabel}
            periodOriginPrefix={labels.periodOriginPrefix}
            basePeriod={basePeriod}
            klineRemainingLine={klineRemainingLine}
            hasProgressWarning={hasProgressWarning}
            showPeriodSourceMeta={showPeriodSourceMeta}
            indicatorLabel={labels.indicator}
            showIndicatorButton
            isIndicatorButtonActive={showChartSettingsModal}
            indicatorQuickMenu={indicatorQuickMenu}
            onOpenChartSettings={onOpenChartSettingsModal}
            showSubIndicatorToggle={showSubIndicatorToggle}
            hasAnySubIndicator={hasAnySubIndicator}
            showSubIndicators={showSubIndicators}
            onToggleSubIndicators={onToggleSubIndicators}
            subIndicatorToggleTitle={subIndicatorToggleTitle}
            showToolbar={!mergeToolbarIntoTopBar}
            watermarkText={replayEmptyWatermarkText}
            changeBubbleText={
              selectedBarChange ? formatRatio(selectedBarChange.ratio) : null
            }
            changeBubbleClassName={
              selectedBarChange ? pnlClass(selectedBarChange.ratio) : undefined
            }
            changeBubbleStyle={
              selectedBarChange
                ? { right: `${chartChangeBubbleRight}px` }
                : undefined
            }
            changeBubbleTitle={labels.changeTooltip}
          />
        </MainChartPanel>
      </div>
    </div>
  );
};
