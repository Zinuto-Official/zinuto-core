// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import { useCallback, useEffect, useRef } from "react";
import { api } from "@/api";
import { formatMessage } from "@zinuto/shared/i18n";
import { resolveReplayDisplayPeriod } from "@/domains/chart/replayDisplayPeriod";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import type { ReplayReviewArchiveRow } from "@/workspaces/history/history-console/ReplayReviewArchiveSection";
import { ArchiveReplayDrawerPreview } from "@/workspaces/history/history-console/ReplayReviewReplayPresentation";
import type { ReplayReviewConsolePageProps } from "@/workspaces/history/history-console/ReplayReviewConsoleHelpers";
import type { useReplayReviewConsoleModel } from "@/workspaces/history/history-console/useReplayReviewConsoleModel";

type ReplayReviewSession = ReturnType<
  typeof useReplayReviewConsoleModel
>["visibleSessionMetrics"][number];

type ReplayReviewArchiveDetailWindowOptions = {
  archiveSessionById: ReadonlyMap<string, ReplayReviewSession>;
  history: ReplayReviewConsolePageProps["history"];
  isActive: boolean;
  language: ReplayReviewConsolePageProps["language"];
  onError: ReplayReviewConsolePageProps["onError"];
  ui: ReplayReviewConsolePageProps["ui"];
};

export const useReplayReviewArchiveDetailWindow = ({
  archiveSessionById,
  history,
  isActive,
  language,
  onError,
  ui,
}: ReplayReviewArchiveDetailWindowOptions) => {
  const archiveDetailWindowRevisionRef = useRef(0);

  const renderArchiveDetailPreview = useCallback(
    (row: ReplayReviewArchiveRow) => {
      const session = archiveSessionById.get(row.id);
      if (!session) {
        return null;
      }
      return (
        <ArchiveReplayDrawerPreview
          session={session}
          history={history}
          ui={ui}
          language={language}
          isActive
        />
      );
    },
    [archiveSessionById, history, language, ui],
  );

  const openArchiveDetailWindow = useCallback(
    async (row: ReplayReviewArchiveRow) => {
      const session = archiveSessionById.get(row.id);
      if (!session) {
        return;
      }
      let resolvedReplay =
        session.detail?.replay ?? session.project.replay ?? null;
      if (!resolvedReplay) {
        try {
          const detail = await api.getTrainingProject(session.project.id);
          if (
            detail.detailExpiredAt ||
            detail.replayHydrationStatus === "EXPIRED"
          ) {
            onError?.(formatMessage(language, "appText.historyDetailExpired"));
            return;
          }
          resolvedReplay = detail.replay ?? null;
        } catch {
          resolvedReplay = null;
        }
      }
      if (!resolvedReplay) {
        onError?.(
          session.project.detailExpiredAt ||
            session.project.replayHydrationStatus === "EXPIRED"
            ? formatMessage(language, "appText.historyDetailExpired")
            : ui.statsNoData,
        );
        return;
      }
      const replayDisplayPeriod = resolveReplayDisplayPeriod({
        replay: resolvedReplay as ArchivedReplayData,
        baseTimeframe: session.project.baseTimeframe,
      });
      void api
        .openDesktopSecondaryWindow({
          kind: "FREE_REPLAY_ARCHIVE_DETAIL",
          title: row.projectName || row.sequenceText,
          payload: {
            title: row.projectName || row.sequenceText,
            meta: formatDotJoinedText(language, [
              row.sequenceText,
              row.symbol,
              row.createdAtText,
            ]),
            project: {
              id: session.project.id,
              symbol: session.project.symbol,
              replay: resolvedReplay as NonNullable<
                HistoryReplayChartViewProps["project"]
              >["replay"],
            },
            displayPeriod: replayDisplayPeriod,
            trainerPeriodOptionsByBase: history.trainerPeriodOptionsByBase,
            initialDisplayPeriod: replayDisplayPeriod,
            chartRenderMode: history.chartRenderMode,
            showVolumePane: true,
            badges: row.ruleBadges.length
              ? row.ruleBadges.map((badge) => ({
                  label: badge.label,
                  tone: badge.tone,
                }))
              : [
                  {
                    label: row.environmentLabel,
                    tone: "outline" as const,
                  },
                ],
            metrics: row.financialItems.map((item) => ({
              label: item.label,
              value: item.value,
              tone: item.tone ?? "flat",
            })),
          },
        })
        .then((state) => {
          archiveDetailWindowRevisionRef.current = state.revision;
        })
        .catch(() => {
          archiveDetailWindowRevisionRef.current = 0;
        });
    },
    [
      archiveSessionById,
      history.chartRenderMode,
      history.trainerPeriodOptionsByBase,
      language,
      onError,
      ui.statsNoData,
    ],
  );

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (!isActive) {
          return;
        }
        if (message.kind !== "FREE_REPLAY_ARCHIVE_DETAIL") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            archiveDetailWindowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          archiveDetailWindowRevisionRef.current = 0;
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : {};
        if (message.action === "SET_DISPLAY_PERIOD") {
          const period = String(payload.period || "").trim();
          if (period) {
            history.setTrainerDisplayPeriod(period as DisplayPeriodKey);
          }
          return;
        }
        if (message.action === "SET_CHART_RENDER_MODE") {
          const mode = String(payload.mode || "").trim();
          if (mode) {
            history.setChartRenderMode(
              mode as Parameters<typeof history.setChartRenderMode>[0],
            );
          }
        }
      }),
    [history],
  );

  return { openArchiveDetailWindow, renderArchiveDetailPreview };
};
