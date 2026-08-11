// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import {
  type ChartSettingsModalFocusTarget,
  resolveChartSettingsModalFocusTarget,
} from "@/domains/indicators/runtime";

export const useRuntimeChartSettingsMenu = (input: {
  showChartSettingsModal: boolean;
  setShowChartSettingsModal: (visible: boolean) => void;
}) => {
  const [chartSettingsModalFocusTarget, setChartSettingsModalFocusTarget] =
    useState<ReturnType<typeof resolveChartSettingsModalFocusTarget>>(null);
  const [indicatorQuickMenuState, setIndicatorQuickMenuState] = useState<{
    indicatorId: string;
    target: ChartSettingsModalFocusTarget;
    anchorLeft: number;
    anchorTop: number;
  } | null>(null);
  const closeIndicatorQuickMenu = useCallback(() => {
    setIndicatorQuickMenuState(null);
  }, []);
  const openIndicatorQuickMenu = useCallback(
    (payload: {
      indicatorId: string;
      target: ChartSettingsModalFocusTarget;
      anchorLeft: number;
      anchorTop: number;
    }) => {
      setIndicatorQuickMenuState(payload);
    },
    [],
  );
  const openChartSettingsModal = useCallback(
    (indicatorId?: string) => {
      setChartSettingsModalFocusTarget(
        resolveChartSettingsModalFocusTarget(indicatorId),
      );
      closeIndicatorQuickMenu();
      input.setShowChartSettingsModal(true);
    },
    [closeIndicatorQuickMenu, input.setShowChartSettingsModal],
  );
  useEffect(() => {
    if (!input.showChartSettingsModal) {
      setChartSettingsModalFocusTarget(null);
    }
  }, [input.showChartSettingsModal]);
  return {
    chartSettingsModalFocusTarget,
    closeIndicatorQuickMenu,
    indicatorQuickMenuState,
    openChartSettingsModal,
    openIndicatorQuickMenu,
    setChartSettingsModalFocusTarget,
    setIndicatorQuickMenuState,
  };
};
