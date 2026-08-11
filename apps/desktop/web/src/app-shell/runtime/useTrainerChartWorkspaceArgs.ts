// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool, DrawLineType, DrawTool } from "@/domains/chart/drawingTypes";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { OverlayMode } from "klinecharts";
import { normalizeInput } from "@/frontend-kernel/valueFormat";
import type { BaseTimeframe, DisplayPeriodKey } from "@/domains/trainer/trainerTypes";
import type { UseTrainerChartWorkspaceSectionParams, TrainerUiLabels } from "@/domains/trainer/useTrainerChartWorkspaceSection";
import type { TrainerChartWorkspaceProps } from "@/domains/trainer/TrainerChartWorkspace";
import type { SignalIndicatorName } from "@/domains/indicators/core";

type TrainerChartWorkspaceSectionAdapterInput = {
  ui: TrainerUiLabels;
  tt: UseTrainerChartWorkspaceSectionParams["tt"];
  language: UiLanguage;
  isDrawingToolbarDisabled: boolean;
  isTrainingSymbolLocked: boolean;
  activeSamplePoolSelectValue: string;
  readonlySamplePoolText?: string | null;
  selectSamplePoolOption: (poolId: string) => void;
  trainerSamplePoolOptions: Array<{ id: string; name: string; symbolCount: number }>;
  samplePoolAllId: string;
  activeToolbarSymbolValue: string;
  readonlySymbolText?: string | null;
  selectSymbolOption: (symbol: string) => void;
  pickRandomSymbolOption: () => void;
  symbolSelectOptions: string[];
  symbolSelectLabels: Record<string, string>;
  hideSymbolIdentity?: boolean;
  hiddenSymbolLabel?: string;
  sessionId: string;
  isBusy: boolean;
  autoplayBarsPerSec: string;
  setAutoplayBarsPerSec: Dispatch<SetStateAction<string>>;
  isAutoplay: boolean;
  toggleAutoplay: () => void;
  hasProgressWarning: boolean;
  klineRemainingLine: string;
  anchorToolbarNode?: ReactNode;
  activeDrawTool: ActiveDrawTool;
  drawToolOptions: DrawTool[];
  drawToolLabels: Record<string, string>;
  drawTooltipByTool: Record<string, string>;
  handleDrawToolSelect: (tool: ActiveDrawTool) => void;
  drawColors: readonly string[];
  drawColor: string;
  setDrawColor: Dispatch<SetStateAction<string>>;
  drawLineWidth: number;
  setDrawLineWidth: Dispatch<SetStateAction<number>>;
  drawMagnet: OverlayMode;
  setDrawMagnet: (next: OverlayMode) => void;
  drawLineType: DrawLineType;
  setDrawLineType: (next: DrawLineType) => void;
  drawingCount: number;
  allDrawingsVisible: boolean;
  toggleAllDrawingVisible: () => void;
  clearDrawings: () => void;
  createTrainingRecordReplayNote: () => void;
  bindChartDomRef: (node: HTMLDivElement | null) => void;
  showChartSettingsModal: boolean;
  openChartSettingsModal: () => void;
  indicatorQuickMenu: TrainerChartWorkspaceProps["indicatorQuickMenu"];
  chartRenderMode: ChartRenderMode;
  setChartRenderMode: (mode: ChartRenderMode) => void;
  trainerPeriodOptions: DisplayPeriodKey[];
  trainerDisplayPeriod: DisplayPeriodKey;
  setTrainerDisplayPeriod: (period: DisplayPeriodKey) => void;
  getDisplayPeriodLabel: (period: DisplayPeriodKey, language: UiLanguage) => string;
  trainerBaseTimeframe: BaseTimeframe;
  showTrainerSubIndicators: boolean;
  setShowTrainerSubIndicators: Dispatch<SetStateAction<boolean>>;
  signalTopIndicator: SignalIndicatorName;
  setSignalTopIndicator: Dispatch<SetStateAction<SignalIndicatorName>>;
  signalTopIndicatorParams: number[];
  setSignalTopIndicatorParams: Dispatch<SetStateAction<number[]>>;
  signalBottomIndicator: SignalIndicatorName;
  setSignalBottomIndicator: Dispatch<SetStateAction<SignalIndicatorName>>;
  signalBottomIndicatorParams: number[];
  setSignalBottomIndicatorParams: Dispatch<SetStateAction<number[]>>;
  replayEmptyWatermarkText: TrainerChartWorkspaceProps["replayEmptyWatermarkText"];
  selectedBarChange: TrainerChartWorkspaceProps["selectedBarChange"];
  formatRatio: TrainerChartWorkspaceProps["formatRatio"];
  pnlClass: TrainerChartWorkspaceProps["pnlClass"];
  trainerChartChangeBubbleRight: number;
};

export const useTrainerChartWorkspaceSectionArgs = ({
  ui,
  tt,
  language,
  isDrawingToolbarDisabled,
  isTrainingSymbolLocked,
  activeSamplePoolSelectValue,
  readonlySamplePoolText,
  selectSamplePoolOption,
  trainerSamplePoolOptions,
  samplePoolAllId,
  activeToolbarSymbolValue,
  readonlySymbolText,
  selectSymbolOption,
  pickRandomSymbolOption,
  symbolSelectOptions,
  symbolSelectLabels,
  hideSymbolIdentity,
  hiddenSymbolLabel,
  sessionId,
  isBusy,
  autoplayBarsPerSec,
  setAutoplayBarsPerSec,
  isAutoplay,
  toggleAutoplay,
  hasProgressWarning,
  klineRemainingLine,
  anchorToolbarNode,
  activeDrawTool,
  drawToolOptions,
  drawToolLabels,
  drawTooltipByTool,
  handleDrawToolSelect,
  drawColors,
  drawColor,
  setDrawColor,
  drawLineWidth,
  setDrawLineWidth,
  drawMagnet,
  setDrawMagnet,
  drawLineType,
  setDrawLineType,
  drawingCount,
  allDrawingsVisible,
  toggleAllDrawingVisible,
  clearDrawings,
  createTrainingRecordReplayNote,
  bindChartDomRef,
  showChartSettingsModal,
  openChartSettingsModal,
  indicatorQuickMenu,
  chartRenderMode,
  setChartRenderMode,
  trainerPeriodOptions,
  trainerDisplayPeriod,
  setTrainerDisplayPeriod,
  getDisplayPeriodLabel,
  trainerBaseTimeframe,
  showTrainerSubIndicators,
  setShowTrainerSubIndicators,
  signalTopIndicator,
  setSignalTopIndicator,
  signalTopIndicatorParams,
  setSignalTopIndicatorParams,
  signalBottomIndicator,
  setSignalBottomIndicator,
  signalBottomIndicatorParams,
  setSignalBottomIndicatorParams,
  replayEmptyWatermarkText,
  selectedBarChange,
  formatRatio,
  pnlClass,
  trainerChartChangeBubbleRight,
}: TrainerChartWorkspaceSectionAdapterInput): UseTrainerChartWorkspaceSectionParams => {
  const onAutoplayBarsPerSecChange = useCallback(
    (next: string) => setAutoplayBarsPerSec(normalizeInput(next)),
    [setAutoplayBarsPerSec],
  );

  return useMemo(
    () => ({
      ui,
      tt,
      language,
      isDrawingToolbarDisabled,
      isTrainingSymbolLocked,
      activeSamplePoolSelectValue,
      readonlySamplePoolText,
      selectSamplePoolOption,
      trainerSamplePoolOptions,
      samplePoolAllId,
      noSamplePoolLabel: tt("appText.matchingSamplePool"),
      activeToolbarSymbolValue,
      readonlySymbolText,
      selectSymbolOption,
      pickRandomSymbolOption,
      symbolSelectOptions,
      symbolSelectLabels,
      noSymbolLabel: tt("appText.matchingSymbol"),
      hideSymbolIdentity,
      hiddenSymbolLabel,
      sessionId,
      isBusy,
      autoplayBarsPerSec,
      onAutoplayBarsPerSecChange,
      isAutoplay,
      toggleAutoplay,
      hasProgressWarning,
      klineRemainingLine,
      anchorToolbarNode,
      showRandomButton: false,
      activeDrawTool,
      drawToolOptions,
      drawToolLabels,
      drawTooltipByTool,
      onDrawToolSelect: handleDrawToolSelect,
      drawColors,
      drawColor,
      setDrawColor,
      drawLineWidth,
      setDrawLineWidth,
      drawMagnet,
      setDrawMagnet,
      drawLineType,
      setDrawLineType,
      drawingCount,
      allDrawingsVisible,
      toggleAllDrawingVisible,
      clearDrawings,
      createTrainingRecordReplayNote,
      bindChartDomRef,
      showChartSettingsModal,
      indicatorQuickMenu,
      openChartSettingsModal,
      chartRenderMode,
      setChartRenderMode,
      trainerPeriodOptions,
      trainerDisplayPeriod,
      setTrainerDisplayPeriod,
      getDisplayPeriodLabel,
      trainerBaseTimeframe,
      showTrainerSubIndicators,
      setShowTrainerSubIndicators,
      signalTopIndicator,
      setSignalTopIndicator,
      signalTopIndicatorParams,
      setSignalTopIndicatorParams,
      signalBottomIndicator,
      setSignalBottomIndicator,
      signalBottomIndicatorParams,
      setSignalBottomIndicatorParams,
      replayEmptyWatermarkText,
      selectedBarChange,
      formatRatio,
      pnlClass,
      trainerChartChangeBubbleRight,
    }),
    [
      ui,
      tt,
      language,
      isDrawingToolbarDisabled,
      isTrainingSymbolLocked,
      activeSamplePoolSelectValue,
      readonlySamplePoolText,
      selectSamplePoolOption,
      trainerSamplePoolOptions,
      samplePoolAllId,
      activeToolbarSymbolValue,
      readonlySymbolText,
      selectSymbolOption,
      pickRandomSymbolOption,
      symbolSelectOptions,
      symbolSelectLabels,
      hideSymbolIdentity,
      hiddenSymbolLabel,
      sessionId,
      isBusy,
      autoplayBarsPerSec,
      isAutoplay,
      toggleAutoplay,
      hasProgressWarning,
      klineRemainingLine,
      anchorToolbarNode,
      activeDrawTool,
      drawToolOptions,
      drawToolLabels,
      drawTooltipByTool,
      handleDrawToolSelect,
      drawColors,
      drawColor,
      setDrawColor,
      drawLineWidth,
      setDrawLineWidth,
      drawMagnet,
      setDrawMagnet,
      drawLineType,
      setDrawLineType,
      drawingCount,
      allDrawingsVisible,
      toggleAllDrawingVisible,
      clearDrawings,
      createTrainingRecordReplayNote,
      bindChartDomRef,
      showChartSettingsModal,
      indicatorQuickMenu,
      openChartSettingsModal,
      chartRenderMode,
      setChartRenderMode,
      trainerPeriodOptions,
      trainerDisplayPeriod,
      setTrainerDisplayPeriod,
      getDisplayPeriodLabel,
      trainerBaseTimeframe,
      showTrainerSubIndicators,
      setShowTrainerSubIndicators,
      signalTopIndicator,
      setSignalTopIndicator,
      signalTopIndicatorParams,
      setSignalTopIndicatorParams,
      signalBottomIndicator,
      setSignalBottomIndicator,
      signalBottomIndicatorParams,
      setSignalBottomIndicatorParams,
      replayEmptyWatermarkText,
      selectedBarChange,
      formatRatio,
      pnlClass,
      trainerChartChangeBubbleRight,
      onAutoplayBarsPerSecChange,
    ],
  );
};
