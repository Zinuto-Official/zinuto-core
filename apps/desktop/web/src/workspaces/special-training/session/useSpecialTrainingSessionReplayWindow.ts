// SPDX-License-Identifier: GPL-3.0-only

import type {
  ReplayContextMetricTone,
  ReplayContextSummaryChip,
} from "@/frontend-kernel/replayContext";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useEffect, useMemo, useRef } from "react";
import {
  api,
  type OpenDesktopSecondaryWindowInput,
} from "@/api";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type {
  SessionReviewItem,
  SettlementResult,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  buildSpecialTrainingSessionReviewReplayProject,
  resolveSpecialTrainingSessionReviewReplayDisplayPeriod,
} from "@/workspaces/special-training/view-models/specialTrainingSessionReviewReplayProjectViewModel";
import { normalizeReplayDisplayPeriod } from "@/domains/chart/replayDisplayPeriod";

type SpecialTrainingSessionReplayWindowReviewChart = {
  trainerDisplayPeriod: DisplayPeriodKey;
  chartRenderMode: ChartRenderMode;
  onChartRenderModeChange: (mode: ChartRenderMode) => void;
  setTrainerDisplayPeriod: (period: DisplayPeriodKey) => void;
  trainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
};

type SpecialTrainingSessionReplayWindowMetricTone =
  | "positive"
  | "danger"
  | "warning"
  | "neutral";

type SpecialTrainingSessionReplayWindowMetric = {
  label: string;
  value: string;
  tone: ReplayContextMetricTone;
};

type SpecialTrainingSessionReplayWindowPayload = {
  title: string;
  meta: string;
  project: NonNullable<
    ReturnType<typeof buildSpecialTrainingSessionReviewReplayProject>
  >;
  displayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
  chartRenderMode: ChartRenderMode;
  metrics: SpecialTrainingSessionReplayWindowMetric[];
  showVolumePane: true;
  hideLastPriceLine: false;
};

type SpecialTrainingSessionReplayDisplayPeriodOverride = {
  questionId: string;
  openRequestId: number;
  period: DisplayPeriodKey;
};

const resolveSessionReplayWindowMetricTone = (
  tone: SpecialTrainingSessionReplayWindowMetricTone | undefined,
): SpecialTrainingSessionReplayWindowMetric["tone"] =>
  tone === "positive"
    ? "accent"
    : tone === "danger"
      ? "danger"
      : tone === "warning"
        ? "warning"
        : "flat";

export const useSpecialTrainingSessionReplayWindow = ({
  language,
  selectedSessionReviewIndex,
  selectedSessionReviewOpenRequestId,
  selectedSessionReviewItem,
  sessionSettlements,
  sessionSettlementReviewTitle,
  selectedSessionReviewSummaryChips,
  reviewSnapshotChart,
  closeSessionReviewDialog,
}: {
  language: AppUiLanguage;
  selectedSessionReviewIndex: number | null;
  selectedSessionReviewOpenRequestId: number;
  selectedSessionReviewItem: SessionReviewItem | null;
  sessionSettlements: SettlementResult[];
  sessionSettlementReviewTitle: string;
  selectedSessionReviewSummaryChips: ReplayContextSummaryChip[];
  reviewSnapshotChart: SpecialTrainingSessionReplayWindowReviewChart;
  closeSessionReviewDialog: () => void;
}) => {
  const sessionReplaySecondaryWindowOpenRef = useRef(false);
  const sessionReplaySecondaryWindowRevisionRef = useRef(0);
  const handledSessionReviewOpenRequestIdRef = useRef(0);
  const sessionReplayDisplayPeriodOverrideRef =
    useRef<SpecialTrainingSessionReplayDisplayPeriodOverride | null>(null);
  const sessionReviewReplayProject = useMemo(
    () =>
      buildSpecialTrainingSessionReviewReplayProject({
        selectedSessionReviewIndex,
        selectedSessionReviewItem,
        sessionSettlements,
      }),
    [
      selectedSessionReviewIndex,
      selectedSessionReviewItem,
      sessionSettlements,
    ],
  );
  const sessionReviewReplayDisplayPeriod = useMemo(() => {
    const override = sessionReplayDisplayPeriodOverrideRef.current;
    const preferredDisplayPeriod =
      selectedSessionReviewItem &&
      override?.questionId === selectedSessionReviewItem.questionId &&
      override.openRequestId === selectedSessionReviewOpenRequestId
        ? override.period
        : undefined;

    return resolveSpecialTrainingSessionReviewReplayDisplayPeriod({
      selectedSessionReviewItem,
      sessionReviewReplayProject,
      preferredDisplayPeriod,
      fallback: reviewSnapshotChart.trainerDisplayPeriod,
    });
  }, [
    reviewSnapshotChart.trainerDisplayPeriod,
    selectedSessionReviewItem,
    selectedSessionReviewOpenRequestId,
    sessionReviewReplayProject,
  ]);
  const sessionReviewReplayWindowPayload =
    useMemo<SpecialTrainingSessionReplayWindowPayload | null>(() => {
      if (!selectedSessionReviewItem || !sessionReviewReplayProject) {
        return null;
      }
      return {
        title: formatDotJoinedText(language, [
          selectedSessionReviewItem.questionLabel,
          `${selectedSessionReviewItem.symbol} ${selectedSessionReviewItem.timeframeLabel}`,
        ]),
        meta: sessionSettlementReviewTitle,
        project: sessionReviewReplayProject,
        displayPeriod: sessionReviewReplayDisplayPeriod,
        trainerPeriodOptionsByBase:
          reviewSnapshotChart.trainerPeriodOptionsByBase,
        chartRenderMode: reviewSnapshotChart.chartRenderMode,
        metrics: selectedSessionReviewSummaryChips.map((chip) => ({
          label: chip.label,
          value: chip.value,
          tone:
            chip.secondaryTone ?? resolveSessionReplayWindowMetricTone(chip.tone),
        })),
        showVolumePane: true,
        hideLastPriceLine: false,
      };
    }, [
      language,
      reviewSnapshotChart.chartRenderMode,
      reviewSnapshotChart.trainerPeriodOptionsByBase,
      selectedSessionReviewItem,
      selectedSessionReviewSummaryChips,
      sessionReviewReplayProject,
      sessionReviewReplayDisplayPeriod,
      sessionSettlementReviewTitle,
    ]);

  useEffect(() => {
    if (!selectedSessionReviewItem || !sessionReviewReplayWindowPayload) {
      if (sessionReplaySecondaryWindowOpenRef.current) {
        sessionReplaySecondaryWindowOpenRef.current = false;
        sessionReplaySecondaryWindowRevisionRef.current = 0;
        handledSessionReviewOpenRequestIdRef.current = 0;
        sessionReplayDisplayPeriodOverrideRef.current = null;
        void api
          .closeDesktopSecondaryWindow("CHALLENGE_SESSION_REPLAY")
          .catch(() => undefined);
      }
      return;
    }
    const input: OpenDesktopSecondaryWindowInput = {
      kind: "CHALLENGE_SESSION_REPLAY",
      title: sessionReviewReplayWindowPayload.title,
      payload: sessionReviewReplayWindowPayload,
    };
    const shouldEnsureWindowOpen =
      !sessionReplaySecondaryWindowOpenRef.current ||
      handledSessionReviewOpenRequestIdRef.current !==
        selectedSessionReviewOpenRequestId;
    if (shouldEnsureWindowOpen) {
      sessionReplaySecondaryWindowOpenRef.current = true;
      handledSessionReviewOpenRequestIdRef.current =
        selectedSessionReviewOpenRequestId;
      void api
        .openDesktopSecondaryWindow(input)
        .then((state) => {
          sessionReplaySecondaryWindowRevisionRef.current = state.revision;
        })
        .catch(() => {
          sessionReplaySecondaryWindowOpenRef.current = false;
          sessionReplaySecondaryWindowRevisionRef.current = 0;
          handledSessionReviewOpenRequestIdRef.current = 0;
        });
      return;
    }
    void api
      .publishDesktopSecondaryWindowState(input)
      .then((state) => {
        sessionReplaySecondaryWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        sessionReplaySecondaryWindowOpenRef.current = false;
        sessionReplaySecondaryWindowRevisionRef.current = 0;
        handledSessionReviewOpenRequestIdRef.current = 0;
      });
  }, [
    selectedSessionReviewItem,
    selectedSessionReviewOpenRequestId,
    sessionReviewReplayWindowPayload,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "CHALLENGE_SESSION_REPLAY") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            sessionReplaySecondaryWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload =
          message.payload && typeof message.payload === "object"
            ? (message.payload as Record<string, unknown>)
            : {};
        switch (message.action) {
          case "WINDOW_CLOSED":
          case "CLOSE":
            sessionReplaySecondaryWindowOpenRef.current = false;
            sessionReplaySecondaryWindowRevisionRef.current = 0;
            handledSessionReviewOpenRequestIdRef.current = 0;
            sessionReplayDisplayPeriodOverrideRef.current = null;
            closeSessionReviewDialog();
            break;
          case "SET_DISPLAY_PERIOD": {
            const period = normalizeReplayDisplayPeriod(payload.period);
            if (period) {
              if (selectedSessionReviewItem) {
                sessionReplayDisplayPeriodOverrideRef.current = {
                  questionId: selectedSessionReviewItem.questionId,
                  openRequestId: selectedSessionReviewOpenRequestId,
                  period,
                };
              }
              reviewSnapshotChart.setTrainerDisplayPeriod(period);
            }
            break;
          }
          case "SET_CHART_RENDER_MODE": {
            const mode = payload.mode;
            if (mode === "CANDLE" || mode === "LINE" || mode === "OHLC") {
              reviewSnapshotChart.onChartRenderModeChange(mode);
            }
            break;
          }
          default:
            break;
        }
      }),
    [
      closeSessionReviewDialog,
      reviewSnapshotChart,
      selectedSessionReviewItem,
      selectedSessionReviewOpenRequestId,
    ],
  );
};
