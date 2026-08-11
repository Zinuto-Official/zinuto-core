// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/popup-note-editor.css";
import "@/styles/popup-replay.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeCurrentDesktopSecondaryWindow,
  sendDesktopSecondaryWindowRouteAction,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import { useArchivedSystemMarkerRenderer } from "@/domains/chart/useArchivedSystemMarkerRenderer";
import { useHistoryReplayChartBindings } from "@/domains/chart/useHistoryReplayChartBindings";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import {
  ReplayNoteEditorWindowSurface,
  ReplayNoteEditorSecondaryPayload,
} from "@/workspaces/notes/ReplayNoteEditorWindowSurface";
import { ReplayNoteSnapshotChart } from "@/workspaces/notes/ReplayNoteSnapshotPreview";
import { buildReplayNoteSnapshotProjectSignature } from "@/workspaces/notes/replayNoteSnapshotPreviewModel";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

const isReplayNoteEditorPayload = (
  value: unknown,
): value is ReplayNoteEditorSecondaryPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as ReplayNoteEditorSecondaryPayload).note) &&
  typeof (value as ReplayNoteEditorSecondaryPayload).defaultTitle === "string";

const toRouteSignature = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
};

const SecondaryNoteEditorRoute = ({
  state,
  language,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
}: SecondaryWindowRouteProps) => {
  const bindings = useHistoryReplayChartBindings();
  const createSystemMarkers = useArchivedSystemMarkerRenderer(language);
  const payload = isReplayNoteEditorPayload(state.payload)
    ? state.payload
    : null;
  const activeNoteId = payload?.note.id ?? "";
  const chartSnapshot =
    payload?.snapshot?.kind === "CHART" ? payload.snapshot : null;
  const snapshotKind = payload?.snapshot?.kind ?? null;
  const snapshotProjectSignature = chartSnapshot
    ? buildReplayNoteSnapshotProjectSignature(chartSnapshot.project)
    : "none";
  const snapshotInitialDisplayPeriod = chartSnapshot?.initialDisplayPeriod;
  const snapshotChartRenderMode = chartSnapshot?.chartRenderMode;
  const emptyTrainerPeriodOptions = useMemo(
    () => ({}) as HistoryReplayChartViewProps["trainerPeriodOptionsByBase"],
    [],
  );
  const periodOptionsSignature = chartSnapshot
    ? toRouteSignature(chartSnapshot.trainerPeriodOptionsByBase)
    : "none";
  const stableProjectRef = useRef<{
    noteId: string;
    signature: string;
    project: HistoryReplayChartViewProps["project"];
  } | null>(null);
  if (
    snapshotKind === "CHART" &&
    (
      !stableProjectRef.current ||
      stableProjectRef.current.noteId !== activeNoteId ||
      stableProjectRef.current.signature !== snapshotProjectSignature
    )
  ) {
    stableProjectRef.current = {
      noteId: activeNoteId,
      signature: snapshotProjectSignature,
      project: chartSnapshot?.project ?? null,
    };
  }
  const stableTrainerPeriodOptionsRef = useRef<{
    noteId: string;
    signature: string;
    options: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  } | null>(null);
  if (
    snapshotKind === "CHART" &&
    (
      !stableTrainerPeriodOptionsRef.current ||
      stableTrainerPeriodOptionsRef.current.noteId !== activeNoteId ||
      stableTrainerPeriodOptionsRef.current.signature !== periodOptionsSignature
    )
  ) {
    stableTrainerPeriodOptionsRef.current = {
      noteId: activeNoteId,
      signature: periodOptionsSignature,
      options: chartSnapshot?.trainerPeriodOptionsByBase ?? emptyTrainerPeriodOptions,
    };
  }
  const stableProject =
    stableProjectRef.current?.noteId === activeNoteId
      ? stableProjectRef.current.project
      : null;
  const stableTrainerPeriodOptions =
    stableTrainerPeriodOptionsRef.current?.noteId === activeNoteId
      ? stableTrainerPeriodOptionsRef.current.options
      : emptyTrainerPeriodOptions;
  const [displayPeriod, setDisplayPeriod] =
    useState<HistoryReplayChartViewProps["displayPeriod"]>(undefined);
  const [chartRenderMode, setChartRenderMode] =
    useState<HistoryReplayChartViewProps["chartRenderMode"]>(undefined);
  const sendRouteAction = useCallback(
    (action: string, nextPayload?: unknown): Promise<void> => {
      if (!activeNoteId) {
        return Promise.resolve();
      }
      return sendDesktopSecondaryWindowRouteAction(
        state,
        action,
        {
          noteId: activeNoteId,
          ...(nextPayload && typeof nextPayload === "object"
            ? (nextPayload as Record<string, unknown>)
            : nextPayload === undefined
              ? {}
            : { value: nextPayload }),
        },
      );
    },
    [activeNoteId, state],
  );
  const emit = useCallback(
    (action: string, nextPayload?: unknown) => {
      void sendRouteAction(action, nextPayload).catch(() => undefined);
    },
    [sendRouteAction],
  );
  const closeAfterRouteAction = useCallback(
    (action: string, nextPayload?: unknown) => {
      void sendRouteAction(action, nextPayload)
        .then(() => {
          void closeCurrentDesktopSecondaryWindow();
        })
        .catch(() => undefined);
    },
    [sendRouteAction],
  );
  const handleDisplayPeriodChange = useCallback(
    (noteId: string, period: NonNullable<HistoryReplayChartViewProps["displayPeriod"]>) => {
      setDisplayPeriod(period);
      emit("SET_DISPLAY_PERIOD", { noteId, period });
    },
    [emit],
  );
  const handleChartRenderModeChange = useCallback(
    (mode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>) => {
      setChartRenderMode(mode);
      emit("SET_CHART_RENDER_MODE", { mode });
    },
    [emit],
  );

  useEffect(() => {
    if (snapshotKind === "PLACEHOLDER") {
      setDisplayPeriod(undefined);
      setChartRenderMode(undefined);
      return;
    }
    if (snapshotKind === "CHART") {
      setDisplayPeriod(snapshotInitialDisplayPeriod);
      setChartRenderMode(snapshotChartRenderMode);
    }
  }, [
    activeNoteId,
    snapshotChartRenderMode,
    snapshotInitialDisplayPeriod,
    snapshotKind,
    snapshotProjectSignature,
  ]);

  if (!payload) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const snapshotNode =
    payload.snapshot?.kind === "CHART" ||
    payload.snapshot?.kind === "LOADING" ||
    payload.snapshot?.kind === "ERROR" ||
    payload.snapshot?.kind === "PLACEHOLDER" ? (
      <ReplayNoteSnapshotChart
        noteId={payload.note.id}
        noteType={payload.note.type}
        contextReplay={stableProject?.replay ?? null}
        project={
          payload.snapshot.kind === "PLACEHOLDER" ? null : stableProject
        }
        themeMode={themeMode}
        showGlobalDecimals={showGlobalDecimals}
        priceColorMode={priceColorMode}
        tradeColorTheme={tradeColorTheme}
        createSystemMarkers={createSystemMarkers}
        language={language}
        chartRenderMode={chartRenderMode}
        onChartRenderModeChange={handleChartRenderModeChange}
        trainerPeriodOptionsByBase={stableTrainerPeriodOptions}
        bindings={bindings}
        initialDisplayPeriod={
          payload.snapshot.kind === "CHART"
            ? payload.snapshot.initialDisplayPeriod
            : displayPeriod
        }
        displayPeriod={displayPeriod}
        onDisplayPeriodChange={handleDisplayPeriodChange}
        hideLastPriceLine={Boolean(
          payload.snapshot.kind === "CHART"
            ? payload.snapshot.hideLastPriceLine
            : payload.note.type === "CHALLENGE",
        )}
        emptyLabel={
          payload.snapshot.kind === "PLACEHOLDER"
            ? payload.snapshot.label
            : ""
        }
        overlay={
          payload.snapshot.kind === "LOADING"
            ? {
                mode: "loading",
                heading: payload.snapshot.label,
                body: payload.snapshot.body,
              }
            : payload.snapshot.kind === "ERROR"
              ? {
                  mode: "error",
                  heading: payload.snapshot.label,
                  retryLabel: payload.snapshot.retryLabel,
                  onRetry: () => emit("RETRY_SNAPSHOT", { noteId: payload.note.id }),
                }
              : null
        }
      />
    ) : null;

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-note-editor">
      <ReplayNoteEditorWindowSurface
        note={payload.note}
        language={language}
        defaultTitle={payload.defaultTitle}
        createdMetaText={payload.createdMetaText}
        isNewlyCreatedAtLocation={payload.isNewlyCreatedAtLocation}
        colorLabel={payload.colorLabel}
        completeLabel={payload.completeLabel}
        cancelLabel={payload.cancelLabel}
        deleteLabel={payload.deleteLabel}
        snapshot={snapshotNode}
        onTitleChange={(noteId, title) => emit("SET_TITLE", { noteId, title })}
        onTitleBlur={(noteId, title) => emit("COMMIT_TITLE", { noteId, title })}
        onContentDocumentChange={(noteId, contentDocument, attachments) =>
          emit("SET_CONTENT_DOCUMENT", { noteId, contentDocument, attachments })
        }
        onColorTokensChange={(noteId, colorTokens) =>
          emit("SET_COLOR_TOKENS", { noteId, colorTokens })
        }
        onComplete={() => {
          closeAfterRouteAction("COMPLETE");
        }}
        onCancel={() => {
          closeAfterRouteAction("CANCEL");
        }}
        onRequestDelete={() => {
          closeAfterRouteAction("DELETE");
        }}
      />
    </section>
  );
};

export default SecondaryNoteEditorRoute;
