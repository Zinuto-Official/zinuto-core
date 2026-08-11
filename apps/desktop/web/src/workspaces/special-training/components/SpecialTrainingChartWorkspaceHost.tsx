// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useEffect, useMemo } from "react";
import {
  TrainerChartWorkspace,
  type TrainerChartWorkspaceProps,
} from "@/domains/trainer/TrainerChartWorkspace";
import type { SpecialTrainingView } from "@/workspaces/special-training/domain/specialTrainingTypes";

type SpecialTrainingChartWorkspaceHostProps = {
  sharedTrainerChartWorkspaceProps: TrainerChartWorkspaceProps;
  activeQuestionEffectiveTrainingTimeframe: DisplayPeriodKey | null;
  activeQuestionSymbol: string | null | undefined;
  isPageActive: boolean;
  view: SpecialTrainingView;
};

export const SpecialTrainingChartWorkspaceHost = ({
  sharedTrainerChartWorkspaceProps,
  activeQuestionEffectiveTrainingTimeframe,
  activeQuestionSymbol,
  isPageActive,
  view,
}: SpecialTrainingChartWorkspaceHostProps) => {
  const {
    basePeriod,
    onPeriodChange,
    selectedPeriod,
  } = sharedTrainerChartWorkspaceProps;

  const specialTrainingRawDisplayPeriod = useMemo<DisplayPeriodKey>(() => {
    if (activeQuestionEffectiveTrainingTimeframe) {
      return activeQuestionEffectiveTrainingTimeframe;
    }
    return basePeriod as DisplayPeriodKey;
  }, [
    activeQuestionEffectiveTrainingTimeframe,
    basePeriod,
  ]);

  useEffect(() => {
    if (
      !isPageActive ||
      view !== "TRAINING" ||
      !activeQuestionSymbol ||
      selectedPeriod === specialTrainingRawDisplayPeriod
    ) {
      return;
    }
    onPeriodChange(specialTrainingRawDisplayPeriod);
  }, [
    activeQuestionSymbol,
    isPageActive,
    onPeriodChange,
    selectedPeriod,
    specialTrainingRawDisplayPeriod,
    view,
  ]);

  return (
    <TrainerChartWorkspace
      {...sharedTrainerChartWorkspaceProps}
      isDrawingToolbarDisabled={false}
      mainChartPanelSurface="flush"
      drawingToolbarSurface="flush"
      drawingToolbarDensity="slim"
      periodOptions={[specialTrainingRawDisplayPeriod]}
      selectedPeriod={specialTrainingRawDisplayPeriod}
      basePeriod={specialTrainingRawDisplayPeriod}
      replayEmptyWatermarkText={null}
      // Avoid exposing trainer-only controls on special training pages.
      topBar={undefined}
      showNoteAction={false}
    />
  );
};
