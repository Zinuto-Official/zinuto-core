// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type Chart } from "klinecharts";
import { type PriceColorMode } from "@/domains/chart/display";
import {
  applyIndicatorStyles,
  INDICATOR_IDS,
  INDICATOR_PANES,
  isIndicatorNone,
  mountSignalIndicator,
  mountSignalIndicatorNonePlaceholder,
  mountVolumeIndicator,
} from "@/domains/indicators/runtime";
import { isSameNumericArray } from "@/domains/indicators/core";
import { isReplaySnapshotNoteType } from "@/workspaces/notes/useReplayNotes";
import { type SessionSnapshot } from "@/domains/training/types";

type UseRuntimeTrainerDrawingSyncEffectArgs = {
  activePage: string;
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  currentDisplayPeriodRef: MutableRefObject<DisplayPeriodKey>;
  syncDrawingStoreFromChart: (period: DisplayPeriodKey) => void;
  rebuildDrawingsByPeriod: (period: DisplayPeriodKey) => boolean;
  refreshDrawingMeta: () => void;
};

export const useRuntimeTrainerDrawingSyncEffect = ({
  activePage,
  chartReady,
  chartRef,
  currentDisplayPeriodRef,
  syncDrawingStoreFromChart,
  rebuildDrawingsByPeriod,
  refreshDrawingMeta,
}: UseRuntimeTrainerDrawingSyncEffectArgs) => {
  useEffect(() => {
    if (!chartReady || (activePage !== "TRAINER" && activePage !== "SPECIAL_TRAINING")) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const activePeriod = currentDisplayPeriodRef.current;
    syncDrawingStoreFromChart(activePeriod);
    rebuildDrawingsByPeriod(activePeriod);
    refreshDrawingMeta();
  }, [
    activePage,
    chartReady,
    currentDisplayPeriodRef,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
    syncDrawingStoreFromChart,
    chartRef,
  ]);
};

type UseRuntimeTrainerSignalIndicatorMountEffectArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  lastSignalIndicatorMountKeyRef: MutableRefObject<string>;
  signalTopIndicator: string;
  signalTopIndicatorParams: number[];
  setSignalTopIndicatorParams: Dispatch<SetStateAction<number[]>>;
  signalBottomIndicator: string;
  signalBottomIndicatorParams: number[];
  setSignalBottomIndicatorParams: Dispatch<SetStateAction<number[]>>;
  supportedIndicatorNameSet: Set<string>;
  customIndicatorProfileVersionToken: string;
  priceColorMode: PriceColorMode;
  adjustPaneHeights: () => void;
};

export const useRuntimeTrainerSignalIndicatorMountEffect = ({
  chartReady,
  chartRef,
  lastSignalIndicatorMountKeyRef,
  signalTopIndicator,
  signalTopIndicatorParams,
  setSignalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams,
  setSignalBottomIndicatorParams,
  supportedIndicatorNameSet,
  customIndicatorProfileVersionToken,
  priceColorMode,
  adjustPaneHeights,
}: UseRuntimeTrainerSignalIndicatorMountEffectArgs) => {
  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const signalIndicatorMountKey = [
      signalTopIndicator,
      signalTopIndicatorParams.join(","),
      supportedIndicatorNameSet.has(signalTopIndicator) ? "1" : "0",
      signalBottomIndicator,
      signalBottomIndicatorParams.join(","),
      supportedIndicatorNameSet.has(signalBottomIndicator) ? "1" : "0",
      customIndicatorProfileVersionToken,
    ].join("|");
    if (lastSignalIndicatorMountKeyRef.current === signalIndicatorMountKey) {
      return;
    }
    lastSignalIndicatorMountKeyRef.current = signalIndicatorMountKey;

    chart.removeIndicator({ paneId: INDICATOR_PANES.signalTop });
    chart.removeIndicator({ paneId: INDICATOR_PANES.signalBottom });

    if (!isIndicatorNone(signalTopIndicator) && supportedIndicatorNameSet.has(signalTopIndicator)) {
      const { mounted, resolvedParams } = mountSignalIndicator({
        chart,
        indicatorId: INDICATOR_IDS.signalTop,
        indicatorName: signalTopIndicator,
        calcParams: signalTopIndicatorParams,
        priceColorMode,
        panePreset: "trainerTop",
      });
      if (mounted && !isSameNumericArray(resolvedParams, signalTopIndicatorParams)) {
        setSignalTopIndicatorParams(resolvedParams);
      }
    } else if (signalTopIndicatorParams.length) {
      setSignalTopIndicatorParams([]);
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalTop,
        panePreset: "trainerTop",
      });
    } else {
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalTop,
        panePreset: "trainerTop",
      });
    }

    if (!isIndicatorNone(signalBottomIndicator) && supportedIndicatorNameSet.has(signalBottomIndicator)) {
      const { mounted, resolvedParams } = mountSignalIndicator({
        chart,
        indicatorId: INDICATOR_IDS.signalBottom,
        indicatorName: signalBottomIndicator,
        calcParams: signalBottomIndicatorParams,
        priceColorMode,
        panePreset: "trainerBottom",
      });
      if (mounted && !isSameNumericArray(resolvedParams, signalBottomIndicatorParams)) {
        setSignalBottomIndicatorParams(resolvedParams);
      }
    } else if (signalBottomIndicatorParams.length) {
      setSignalBottomIndicatorParams([]);
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalBottom,
        panePreset: "trainerBottom",
      });
    } else {
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalBottom,
        panePreset: "trainerBottom",
      });
    }

    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    chartReady,
    chartRef,
    customIndicatorProfileVersionToken,
    lastSignalIndicatorMountKeyRef,
    priceColorMode,
    setSignalBottomIndicatorParams,
    setSignalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    supportedIndicatorNameSet,
  ]);
};

type UseRuntimeTrainerVolumeIndicatorVisibilityEffectArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  showVolumePane: boolean;
  priceColorMode: PriceColorMode;
  adjustPaneHeights: () => void;
};

export const useRuntimeTrainerVolumeIndicatorVisibilityEffect = ({
  chartReady,
  chartRef,
  showVolumePane,
  priceColorMode,
  adjustPaneHeights,
}: UseRuntimeTrainerVolumeIndicatorVisibilityEffectArgs) => {
  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.removeIndicator({ id: INDICATOR_IDS.volumeMain });
    if (showVolumePane) {
      mountVolumeIndicator({
        chart,
        indicatorId: INDICATOR_IDS.volumeMain,
        height: 110,
        minHeight: 78,
      });
    }
    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.volumeMain, name: "VOL", enabled: showVolumePane },
    ]);
    adjustPaneHeights();
  }, [adjustPaneHeights, chartReady, chartRef, priceColorMode, showVolumePane]);
};

type UseRuntimeTrainerSignalIndicatorVisibilityEffectArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  showTrainerSubIndicators: boolean;
  showVolumePane: boolean;
  signalTopIndicator: string;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: string;
  signalBottomIndicatorParams: number[];
  supportedIndicatorNameSet: Set<string>;
  priceColorMode: PriceColorMode;
  adjustPaneHeights: () => void;
};

export const useRuntimeTrainerSignalIndicatorVisibilityEffect = ({
  chartReady,
  chartRef,
  showTrainerSubIndicators,
  showVolumePane,
  signalTopIndicator,
  signalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams,
  supportedIndicatorNameSet,
  priceColorMode,
  adjustPaneHeights,
}: UseRuntimeTrainerSignalIndicatorVisibilityEffectArgs) => {
  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.removeIndicator({ paneId: INDICATOR_PANES.signalTop });
    chart.removeIndicator({ paneId: INDICATOR_PANES.signalBottom });

    if (showTrainerSubIndicators) {
      if (!isIndicatorNone(signalTopIndicator) && supportedIndicatorNameSet.has(signalTopIndicator)) {
        mountSignalIndicator({
          chart,
          indicatorId: INDICATOR_IDS.signalTop,
          indicatorName: signalTopIndicator,
          calcParams: signalTopIndicatorParams,
          priceColorMode,
          panePreset: "trainerTop",
        });
      } else {
        mountSignalIndicatorNonePlaceholder({
          chart,
          indicatorId: INDICATOR_IDS.signalTop,
          panePreset: "trainerTop",
        });
      }
      if (!isIndicatorNone(signalBottomIndicator) && supportedIndicatorNameSet.has(signalBottomIndicator)) {
        mountSignalIndicator({
          chart,
          indicatorId: INDICATOR_IDS.signalBottom,
          indicatorName: signalBottomIndicator,
          calcParams: signalBottomIndicatorParams,
          priceColorMode,
          panePreset: "trainerBottom",
        });
      } else {
        mountSignalIndicatorNonePlaceholder({
          chart,
          indicatorId: INDICATOR_IDS.signalBottom,
          panePreset: "trainerBottom",
        });
      }
    } else {
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalTop,
        panePreset: "trainerTop",
      });
      mountSignalIndicatorNonePlaceholder({
        chart,
        indicatorId: INDICATOR_IDS.signalBottom,
        panePreset: "trainerBottom",
      });
    }

    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.volumeMain, name: "VOL", enabled: showVolumePane },
      {
        id: INDICATOR_IDS.signalTop,
        name: signalTopIndicator,
        enabled:
          showTrainerSubIndicators &&
          !isIndicatorNone(signalTopIndicator) &&
          supportedIndicatorNameSet.has(signalTopIndicator),
        enableChartSettingsTooltip: true,
      },
      {
        id: INDICATOR_IDS.signalBottom,
        name: signalBottomIndicator,
        enabled:
          showTrainerSubIndicators &&
          !isIndicatorNone(signalBottomIndicator) &&
          supportedIndicatorNameSet.has(signalBottomIndicator),
        enableChartSettingsTooltip: true,
      },
    ]);
    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    chartReady,
    chartRef,
    priceColorMode,
    showVolumePane,
    showTrainerSubIndicators,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    supportedIndicatorNameSet,
  ]);
};

type ReplaySnapshotNoteLike = {
  id: string;
  title?: string;
  updatedAt: string;
  type: string;
  trainingProjectId?: string | null;
  hasContextReplay?: boolean;
  contextExpiredAt?: string | null;
  contextSessionId?: string | null;
  contextCursorIndex?: number | null;
};

type UseRuntimeSystemMarkerSignaturesArgs = {
  snapshot: SessionSnapshot | null;
  replayNotes: ReplaySnapshotNoteLike[];
  currentTrainingProjectId?: string | null;
  currentTrainingPoolId: string;
  tradeAmountIncludesFees: boolean;
  tradeMarkerDensityRatio: number;
};

const normalizeMarkerSignatureText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeMarkerSignatureCursor = (value: unknown): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? String(Math.max(0, Math.floor(numeric)))
    : "";
};

export const buildReplayNotesMarkerRenderVersion = ({
  replayNotes,
  currentSessionId,
  currentTrainingProjectId,
}: {
  replayNotes: readonly ReplaySnapshotNoteLike[];
  currentSessionId?: string | null;
  currentTrainingProjectId?: string | null;
}): string => {
  const normalizedSessionId = normalizeMarkerSignatureText(currentSessionId);
  const normalizedTrainingProjectId = normalizeMarkerSignatureText(
    currentTrainingProjectId,
  );
  const noteSignatures = (Array.isArray(replayNotes) ? replayNotes : [])
    .filter((note) => {
      if (!note || !isReplaySnapshotNoteType(note.type)) {
        return false;
      }
      const noteBinding = normalizeMarkerSignatureText(note.trainingProjectId);
      const noteSessionId = normalizeMarkerSignatureText(note.contextSessionId);
      if (
        noteBinding &&
        normalizedTrainingProjectId &&
        noteBinding === normalizedTrainingProjectId
      ) {
        return true;
      }
      if (noteBinding && normalizedSessionId && noteBinding === normalizedSessionId) {
        return true;
      }
      if (noteSessionId && normalizedSessionId && noteSessionId === normalizedSessionId) {
        return true;
      }
      return false;
    })
    .map((note) =>
      [
        normalizeMarkerSignatureText(note.id),
        normalizeMarkerSignatureText(note.type),
        normalizeMarkerSignatureText(note.trainingProjectId),
        normalizeMarkerSignatureText(note.contextSessionId),
        normalizeMarkerSignatureCursor(note.contextCursorIndex),
        note.hasContextReplay ? "1" : "0",
        normalizeMarkerSignatureText(note.contextExpiredAt),
        normalizeMarkerSignatureText(note.title),
        normalizeMarkerSignatureText(note.updatedAt),
      ].join(":"),
    )
    .sort();
  return `${noteSignatures.length}|${noteSignatures.join("||")}`;
};

export const useRuntimeSystemMarkerSignatures = ({
  snapshot,
  replayNotes,
  currentTrainingProjectId,
  currentTrainingPoolId,
  tradeAmountIncludesFees,
  tradeMarkerDensityRatio,
}: UseRuntimeSystemMarkerSignaturesArgs) => {
  const replayNotesRenderVersion = useMemo(() => {
    const currentSessionId =
      typeof snapshot?.session.id === "string" ? snapshot.session.id : "";
    return buildReplayNotesMarkerRenderVersion({
      replayNotes,
      currentSessionId,
      currentTrainingProjectId,
    });
  }, [currentTrainingProjectId, replayNotes, snapshot?.session.id]);

  const systemMarkerHeavySignature = useMemo(() => {
    if (!snapshot) {
      return "";
    }
    const fillsTotalRaw = Number(snapshot.fillsTotal);
    const fillsTotal =
      Number.isFinite(fillsTotalRaw) && fillsTotalRaw >= 0
        ? Math.floor(fillsTotalRaw)
        : Math.max(0, snapshot.fills.length);
    const latestFill =
      snapshot.fills.length > 0 ? snapshot.fills[snapshot.fills.length - 1] : null;
    const densitySignature = Number.isFinite(Number(tradeMarkerDensityRatio))
      ? Number(tradeMarkerDensityRatio).toFixed(4)
      : "0.0000";
    return [
      snapshot.session.id,
      fillsTotal,
      latestFill?.id ?? "",
      latestFill ? `${latestFill.fill_index}|${latestFill.created_at}` : "",
      currentTrainingProjectId ?? "",
      currentTrainingPoolId,
      tradeAmountIncludesFees ? "1" : "0",
      densitySignature,
      replayNotesRenderVersion,
    ].join("|");
  }, [
    currentTrainingProjectId,
    currentTrainingPoolId,
    replayNotesRenderVersion,
    snapshot,
    tradeAmountIncludesFees,
    tradeMarkerDensityRatio,
  ]);

  const systemMarkerPositionSignature = useMemo(() => {
    if (!snapshot) {
      return "";
    }
    const position =
      snapshot.positions.find((item) => item.symbol === snapshot.session.symbol) ??
      null;
    return [
      snapshot.session.id,
      snapshot.session.symbol,
      snapshot.session.cursor_index,
      position?.qty ?? 0,
      position?.avgCost ?? 0,
    ].join("|");
  }, [snapshot]);

  return {
    systemMarkerHeavySignature,
    systemMarkerPositionSignature,
  };
};
