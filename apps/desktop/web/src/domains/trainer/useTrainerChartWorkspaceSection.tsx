// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool, DrawLineType, DrawTool } from "@/domains/chart/drawingTypes";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { OverlayMode } from 'klinecharts';
import {
  resolveSubIndicatorToggleState,
  type SignalIndicatorName
} from '@/domains/indicators/core';
import { isIndicatorNone } from '@/domains/indicators/runtime';
import { tt as appTextTranslate } from '@/frontend-kernel/i18n/messageRuntime';
import {
  CHART_RENDER_MODE_GROUP_LABEL_BY_LANGUAGE,
  CHART_RENDER_MODE_LABELS_BY_LANGUAGE,
  INDICATOR_LABEL_BY_LANGUAGE,
  PERIOD_ORIGIN_PREFIX_BY_LANGUAGE,
  PERIOD_TITLE_BY_LANGUAGE,
  TRAINER_SHORTCUT_KEYS
} from '@/ui/config/uiConfig';
import { DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE } from '@/domains/chart/chartPeriods';
import type { BaseTimeframe, DisplayPeriodKey } from '@/domains/trainer/trainerTypes';
import { buildTrainerChartTopBar } from '@/domains/trainer/buildTrainerChartTopBar';
import { TrainerChartWorkspace, type TrainerChartWorkspaceProps } from '@/domains/trainer/TrainerChartWorkspace';

export type TrainerUiLabels = {
  random: string;
  randomPool: string;
  symbol: string;
  shortcutTitle: string;
  barsPerSec: string;
  pause: string;
  autoPlay: string;
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
  chartSettings: string;
};

export type UseTrainerChartWorkspaceSectionParams = {
  ui: TrainerUiLabels;
  tt: typeof appTextTranslate;
  language: UiLanguage;
  isDrawingToolbarDisabled: boolean;
  isTrainingSymbolLocked: boolean;
  activeSamplePoolSelectValue: string;
  readonlySamplePoolText?: string | null;
  selectSamplePoolOption: (poolId: string) => void;
  trainerSamplePoolOptions: Array<{ id: string; name: string; symbolCount: number }>;
  samplePoolAllId: string;
  noSamplePoolLabel: string;
  activeToolbarSymbolValue: string;
  readonlySymbolText?: string | null;
  selectSymbolOption: (symbol: string) => void;
  pickRandomSymbolOption: () => void;
  symbolSelectOptions: string[];
  symbolSelectLabels: Record<string, string>;
  noSymbolLabel: string;
  hideSymbolIdentity?: boolean;
  hiddenSymbolLabel?: string;
  sessionId: string;
  isBusy: boolean;
  autoplayBarsPerSec: string;
  onAutoplayBarsPerSecChange: (value: string) => void;
  isAutoplay: boolean;
  toggleAutoplay: () => void;
  hasProgressWarning: boolean;
  klineRemainingLine: string;
  anchorToolbarNode?: ReactNode;
  showRandomButton?: boolean;
  activeDrawTool: ActiveDrawTool;
  drawToolOptions: DrawTool[];
  drawToolLabels: Record<string, string>;
  drawTooltipByTool: Record<string, string>;
  onDrawToolSelect: (tool: ActiveDrawTool) => void;
  drawColors: readonly string[];
  drawColor: string;
  setDrawColor: (color: string) => void;
  drawLineWidth: number;
  setDrawLineWidth: (next: number) => void;
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
  indicatorQuickMenu: TrainerChartWorkspaceProps['indicatorQuickMenu'];
  openChartSettingsModal: () => void;
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
  replayEmptyWatermarkText: TrainerChartWorkspaceProps['replayEmptyWatermarkText'];
  selectedBarChange: TrainerChartWorkspaceProps['selectedBarChange'];
  formatRatio: TrainerChartWorkspaceProps['formatRatio'];
  pnlClass: TrainerChartWorkspaceProps['pnlClass'];
  trainerChartChangeBubbleRight: number;
};

export const useTrainerChartWorkspaceSection = ({
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
  noSamplePoolLabel,
  activeToolbarSymbolValue,
  readonlySymbolText,
  selectSymbolOption,
  pickRandomSymbolOption,
  symbolSelectOptions,
  symbolSelectLabels,
  noSymbolLabel,
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
  showRandomButton,
  activeDrawTool,
  drawToolOptions,
  drawToolLabels,
  drawTooltipByTool,
  onDrawToolSelect,
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
  trainerChartChangeBubbleRight
}: UseTrainerChartWorkspaceSectionParams) => {
  const trainerChartTopBar = buildTrainerChartTopBar({
    isTrainingSymbolLocked,
    ui: {
      random: ui.random,
      randomPool: ui.randomPool,
      symbol: ui.symbol,
      barsPerSec: ui.barsPerSec,
      pause: ui.pause,
      autoPlay: ui.autoPlay
    },
    activeSamplePoolSelectValue,
    readonlySamplePoolText,
    selectSamplePoolOption,
    trainerSamplePoolOptions,
    samplePoolAllId,
    noSamplePoolLabel,
    activeToolbarSymbolValue,
    readonlySymbolText,
    selectSymbolOption,
    onPickRandomSymbol: pickRandomSymbolOption,
    symbolSelectOptions,
    symbolSelectLabels,
    noSymbolLabel,
    hideSymbolIdentity,
    hiddenSymbolLabel,
    sessionId,
    isBusy,
    autoplayBarsPerSec,
    onAutoplayBarsPerSecChange,
    isAutoplay,
    onToggleAutoplay: toggleAutoplay,
    anchorToolbarNode,
    showRandomButton
  });

  const hasTrainerAnySubIndicator = !isIndicatorNone(signalTopIndicator) || !isIndicatorNone(signalBottomIndicator);
  const trainerSubIndicatorToggleTitle = `${showTrainerSubIndicators ? tt('appText.hide') : tt('appText.show')} ${tt('appText.figure1')} ${tt('appText.message0940')} ${tt('appText.figure2')}`;
  const trainerAddNoteShortcutTooltip = `${tt('appText.addNote')} ${tt('appText.message0940')} ${TRAINER_SHORTCUT_KEYS.addNote.toUpperCase()}`;
  const trainerBaseDisplayPeriod = DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE[trainerBaseTimeframe];
  const trainerKlineSourceProgressLine = klineRemainingLine;
  const handleToggleTrainerSubIndicators = useCallback(() => {
    const next = resolveSubIndicatorToggleState({
      showSubIndicators: showTrainerSubIndicators,
      signalTopIndicator,
      signalTopIndicatorParams,
      signalBottomIndicator,
      signalBottomIndicatorParams
    });
    setShowTrainerSubIndicators(next.showSubIndicators);
    setSignalTopIndicator(next.signalTopIndicator);
    setSignalTopIndicatorParams(next.signalTopIndicatorParams);
    setSignalBottomIndicator(next.signalBottomIndicator);
    setSignalBottomIndicatorParams(next.signalBottomIndicatorParams);
  }, [
    setShowTrainerSubIndicators,
    setSignalBottomIndicator,
    setSignalBottomIndicatorParams,
    setSignalTopIndicator,
    setSignalTopIndicatorParams,
    showTrainerSubIndicators,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams
  ]);

  const sharedTrainerChartWorkspaceProps: Omit<TrainerChartWorkspaceProps, 'topBar'> = {
    isDrawingToolbarDisabled,
    activeDrawTool,
    drawToolOptions,
    drawToolLabels,
    drawTooltipByTool,
    onDrawToolSelect,
    drawColors,
    drawColor,
    onDrawColorChange: (color: string) => setDrawColor(color),
    drawLineWidth,
    onDrawLineWidthChange: setDrawLineWidth,
    drawMagnet,
    onDrawMagnetChange: setDrawMagnet,
    drawLineType,
    onDrawLineTypeChange: setDrawLineType,
    drawingCount,
    allDrawingsVisible,
    onToggleAllDrawingsVisible: toggleAllDrawingVisible,
    onClearDrawings: clearDrawings,
    onCreateNote: createTrainingRecordReplayNote,
    chartDomRef: bindChartDomRef,
    showChartSettingsModal,
    indicatorQuickMenu,
    onOpenChartSettingsModal: openChartSettingsModal,
    chartRenderMode,
    onChartRenderModeChange: setChartRenderMode,
    chartRenderModeLabels: CHART_RENDER_MODE_LABELS_BY_LANGUAGE[language],
    chartRenderModeGroupLabel: CHART_RENDER_MODE_GROUP_LABEL_BY_LANGUAGE[language],
    periodOptions: trainerPeriodOptions,
    selectedPeriod: trainerDisplayPeriod,
    onPeriodChange: (period: string) => setTrainerDisplayPeriod(period as DisplayPeriodKey),
    getPeriodLabel: (period: string) => getDisplayPeriodLabel(period as DisplayPeriodKey, language),
    basePeriod: trainerBaseDisplayPeriod,
    klineRemainingLine,
    hasProgressWarning,
    showSubIndicatorToggle: true,
    hasAnySubIndicator: hasTrainerAnySubIndicator,
    showSubIndicators: showTrainerSubIndicators,
    onToggleSubIndicators: handleToggleTrainerSubIndicators,
    subIndicatorToggleTitle: trainerSubIndicatorToggleTitle,
    replayEmptyWatermarkText,
    selectedBarChange,
    formatRatio,
    pnlClass,
    chartChangeBubbleRight: trainerChartChangeBubbleRight,
    labels: {
      color: ui.color,
      thickness: ui.thickness,
      magnet: ui.magnet,
      weak: ui.weak,
      strong: ui.strong,
      lineType: ui.lineType,
      solid: ui.solid,
      dashed: ui.dashed,
      hideAll: ui.hideAll,
      showAll: ui.showAll,
      deleteAll: ui.deleteAll,
      addNote: trainerAddNoteShortcutTooltip,
      chartSettings: ui.chartSettings,
      indicator: INDICATOR_LABEL_BY_LANGUAGE[language],
      periodTitle: PERIOD_TITLE_BY_LANGUAGE[language],
      periodOriginPrefix: PERIOD_ORIGIN_PREFIX_BY_LANGUAGE[language],
      changeTooltip: tt('appText.barChange')
    }
  };

  const trainerChartWorkspaceLayout = useMemo(
    () => (
      <TrainerChartWorkspace
        {...sharedTrainerChartWorkspaceProps}
        topBar={trainerChartTopBar}
        topBarSurface="flush"
        showPeriodSourceMeta={false}
        mainChartPanelSurface="flush"
        drawingToolbarSurface="flush"
        drawingToolbarDensity="compact"
      />
    ),
    [sharedTrainerChartWorkspaceProps, trainerChartTopBar]
  );

  return {
    sharedTrainerChartWorkspaceProps,
    trainerChartTopBar,
    trainerKlineSourceProgressLine,
    trainerChartWorkspaceLayout
  };
};
