// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import {
  api,
} from "@/api";
import { isSpecialTrainingReplayNoteType, isReplaySnapshotNoteType } from "@/workspaces/notes/useReplayNotes";
import { ReplayNoteSnapshotChart } from "@/workspaces/notes/ReplayNoteSnapshotPreview";
import { buildReplayNoteSnapshotProjectSignature } from "@/workspaces/notes/replayNoteSnapshotPreviewModel";
import { formatMarketDateByLocale, toMarketDateParts } from "@zinuto/shared/marketTime";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import type { ReplayNoteEditorSecondaryPayload } from "@/workspaces/notes/ReplayNoteEditorWindowSurface";
import { normalizeChartRenderMode } from "@/domains/chart/chartRenderMode";
import {
  DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE,
  isDisplayPeriodKey,
} from "@/ui/config/uiConfig";
import { normalizeReplayNoteColorTokens } from "@zinuto/shared/replayNoteColors";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};


type ReplayNoteSnapshotProject = HistoryReplayChartViewProps["project"];
type RenderTrainingNoteSnapshotOptions = {
  chartBodyVisible?: boolean;
  toolbarLeadingContent?: HistoryReplayChartViewProps["toolbarLeadingContent"];
};
type ReplayNoteSnapshotFallbackView = {
  contextReplay: ReplayNote["contextReplay"];
  hideLastPriceLine: boolean;
  initialDisplayPeriod?: ReplayNote["contextDisplayPeriod"];
  noteId: string;
  noteType: ReplayNote["type"];
  project: ReplayNoteSnapshotProject;
};


const renderTrainingNoteSnapshotEmpty = (text: string) =>
  createElement(
    "div",
    { className: "empty-text history-preview-empty history-preview-watermark" },
    text,
  );

export const useRuntimeReplayNoteEditorHost = (scope: RuntimeHookScope) => {
const { activeReplayNoteEditorNoteId, activeTrainingRecordNote, activeTrainingRecordNoteId, activeTrainingRecordProject, buildTrainingRecordProjectFromNote, cancelActiveTrainingRecordNote, chartRenderMode, closeActiveTrainingRecordNote, commitReplayNoteTitle, createSystemMarkers, deleteReplayNoteById, effectiveThemeMode, isActiveTrainingRecordNoteNewlyCreated, language, showGlobalDecimals, priceColorMode, tradeColorTheme, replayNotes, replayNotesRef, setActiveReplayNoteEditorNoteId, setChartRenderMode, setError, trainerPeriodOptionsByBase, tt, updateReplayNoteColorTokens, updateReplayNoteContent, updateReplayNoteContextDisplayPeriod, updateReplayNoteTitle, withLabelValue, historyReplayChartBindings } = scope;
const {
  replayNoteSnapshotHydrationStateById: replayNoteSnapshotHydrationStateByIdRaw,
  retryReplayNoteSnapshotDetail: retryReplayNoteSnapshotDetailRaw,
} = scope as RuntimeHookScope & {
  replayNoteSnapshotHydrationStateById?: unknown;
  retryReplayNoteSnapshotDetail?: unknown;
};
const replayNoteSnapshotHydrationStateById =
  replayNoteSnapshotHydrationStateByIdRaw &&
  typeof replayNoteSnapshotHydrationStateByIdRaw === "object" &&
  !Array.isArray(replayNoteSnapshotHydrationStateByIdRaw)
    ? (replayNoteSnapshotHydrationStateByIdRaw as Record<
        string,
        { status?: "idle" | "loading" | "error" | "ready"; retryCount?: number }
      >)
    : {};
const retryReplayNoteSnapshotDetail =
  typeof retryReplayNoteSnapshotDetailRaw === "function"
    ? (retryReplayNoteSnapshotDetailRaw as (noteId: string) => void)
    : () => undefined;

const REPLAY_NOTE_SNAPSHOT_PROJECT_CACHE_MAX = 6;

const replayNoteSnapshotProjectCacheRef = useRef(
    new Map<
      string,
      {
        contextReplay: ReplayNote["contextReplay"];
        projectBuilder: unknown;
        projectSignature: string;
        project: ReplayNoteSnapshotProject;
      }
    >(),
  );
  useEffect(() => {
    replayNoteSnapshotProjectCacheRef.current.clear();
  }, [buildTrainingRecordProjectFromNote]);
  const resolveTrainingRecordProjectFromNote = useCallback(
    (note: ReplayNote): ReplayNoteSnapshotProject => {
      const isActiveNote = activeTrainingRecordNote?.id === note.id;
      const cached = replayNoteSnapshotProjectCacheRef.current.get(note.id);
      if (
        !isActiveNote &&
        cached &&
        cached.contextReplay === note.contextReplay &&
        cached.projectBuilder === buildTrainingRecordProjectFromNote
      ) {
        return cached.project;
      }
      const project =
        isActiveNote
          ? activeTrainingRecordProject
          : buildTrainingRecordProjectFromNote(note);
      const projectSignature = buildReplayNoteSnapshotProjectSignature(project);
      if (
        isActiveNote &&
        cached &&
        cached.contextReplay === note.contextReplay &&
        cached.projectBuilder === buildTrainingRecordProjectFromNote &&
        cached.projectSignature === projectSignature
      ) {
        return cached.project;
      }
      replayNoteSnapshotProjectCacheRef.current.delete(note.id);
      replayNoteSnapshotProjectCacheRef.current.set(note.id, {
        contextReplay: note.contextReplay,
        projectBuilder: buildTrainingRecordProjectFromNote,
        projectSignature,
        project,
      });
      while (
        replayNoteSnapshotProjectCacheRef.current.size >
        REPLAY_NOTE_SNAPSHOT_PROJECT_CACHE_MAX
      ) {
        const oldestKey = replayNoteSnapshotProjectCacheRef.current.keys().next()
          .value;
        if (!oldestKey) {
          break;
        }
        replayNoteSnapshotProjectCacheRef.current.delete(oldestKey);
      }
      return project;
    },
    [
      activeTrainingRecordNote?.id,
      activeTrainingRecordProject,
      buildTrainingRecordProjectFromNote,
    ],
  );
const replayNoteSnapshotFallbackViewRef =
  useRef<ReplayNoteSnapshotFallbackView | null>(null);
const renderTrainingNoteSnapshot = useCallback(
    (noteId: string, options: RenderTrainingNoteSnapshotOptions = {}) => {
      const snapshotViewOptions = {
        chartBodyVisible: options.chartBodyVisible ?? true,
        toolbarLeadingContent: options.toolbarLeadingContent ?? null,
      };
      const note =
        replayNotesRef.current.find(
          (item) => item.id === noteId && isReplaySnapshotNoteType(item.type),
        ) ?? null;
      if (!note) {
        return renderTrainingNoteSnapshotEmpty(tt("appText.previewHistoricalQuotes"));
      }
      if (note.contextExpiredAt) {
        return createElement(ReplayNoteSnapshotChart, {
          ...snapshotViewOptions,
          bindings: historyReplayChartBindings,
          chartRenderMode,
          contextReplay: null,
          createSystemMarkers,
          emptyLabel: tt("appText.trainingSnapshotExpired"),
          hideLastPriceLine: isSpecialTrainingReplayNoteType(note.type),
          initialDisplayPeriod: note.contextDisplayPeriod,
          language,
          noteId: note.id,
          noteType: note.type,
          onChartRenderModeChange: setChartRenderMode,
          onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
          overlay: null,
          showGlobalDecimals,
          priceColorMode,
          tradeColorTheme,
          project: null,
          themeMode: effectiveThemeMode,
          trainerPeriodOptionsByBase,
        });
      }
      const hydrationStatus =
        replayNoteSnapshotHydrationStateById[note.id]?.status ?? "idle";
      const fallbackView = replayNoteSnapshotFallbackViewRef.current;
      const hideLastPriceLine = isSpecialTrainingReplayNoteType(note.type);
      if (note.hasContextReplay && !note.contextReplay && hydrationStatus === "error") {
        return createElement(ReplayNoteSnapshotChart, {
          ...snapshotViewOptions,
          bindings: historyReplayChartBindings,
          chartRenderMode,
          contextReplay: fallbackView?.contextReplay ?? null,
          createSystemMarkers,
          emptyLabel: tt("appText.previewHistoricalQuotes"),
          hideLastPriceLine: fallbackView?.hideLastPriceLine ?? hideLastPriceLine,
          initialDisplayPeriod:
            fallbackView?.initialDisplayPeriod ?? note.contextDisplayPeriod,
          language,
          noteId: fallbackView?.noteId ?? note.id,
          noteType: fallbackView?.noteType ?? note.type,
          onChartRenderModeChange: setChartRenderMode,
          onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
          overlay: {
            mode: "error",
            heading: tt("appText.readNotes"),
            onRetry: () => retryReplayNoteSnapshotDetail(note.id),
            retryLabel: tt("appText.retry"),
          },
          showGlobalDecimals,
          priceColorMode,
          tradeColorTheme,
          project: fallbackView?.project ?? null,
          themeMode: effectiveThemeMode,
          trainerPeriodOptionsByBase,
        });
      }
      if (note.hasContextReplay && !note.contextReplay) {
        return createElement(ReplayNoteSnapshotChart, {
          ...snapshotViewOptions,
          bindings: historyReplayChartBindings,
          chartRenderMode,
          contextReplay: fallbackView?.contextReplay ?? null,
          createSystemMarkers,
          emptyLabel: tt("appText.previewHistoricalQuotes"),
          hideLastPriceLine: fallbackView?.hideLastPriceLine ?? hideLastPriceLine,
          initialDisplayPeriod:
            fallbackView?.initialDisplayPeriod ?? note.contextDisplayPeriod,
          language,
          noteId: fallbackView?.noteId ?? note.id,
          noteType: fallbackView?.noteType ?? note.type,
          onChartRenderModeChange: setChartRenderMode,
          onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
          overlay: {
            mode: "loading",
            heading: tt("appText.loadingTrainingSnapshot"),
            body:
              note.title ||
              DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language],
          },
          showGlobalDecimals,
          priceColorMode,
          tradeColorTheme,
          project: fallbackView?.project ?? null,
          themeMode: effectiveThemeMode,
          trainerPeriodOptionsByBase,
        });
      }
      if (!note.contextReplay) {
        return createElement(ReplayNoteSnapshotChart, {
          ...snapshotViewOptions,
          bindings: historyReplayChartBindings,
          chartRenderMode,
          contextReplay: null,
          createSystemMarkers,
          emptyLabel: tt("appText.noteDoesTrainingSnapshotAttached"),
          hideLastPriceLine,
          initialDisplayPeriod: note.contextDisplayPeriod,
          language,
          noteId: note.id,
          noteType: note.type,
          onChartRenderModeChange: setChartRenderMode,
          onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
          overlay: null,
          showGlobalDecimals,
          priceColorMode,
          tradeColorTheme,
          project: null,
          themeMode: effectiveThemeMode,
          trainerPeriodOptionsByBase,
        });
      }
      const project = resolveTrainingRecordProjectFromNote(note);
      if (!project) {
        return createElement(ReplayNoteSnapshotChart, {
          ...snapshotViewOptions,
          bindings: historyReplayChartBindings,
          chartRenderMode,
          contextReplay: null,
          createSystemMarkers,
          emptyLabel: tt("appText.previewHistoricalQuotes"),
          hideLastPriceLine,
          initialDisplayPeriod: note.contextDisplayPeriod,
          language,
          noteId: note.id,
          noteType: note.type,
          onChartRenderModeChange: setChartRenderMode,
          onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
          overlay: null,
          showGlobalDecimals,
          priceColorMode,
          tradeColorTheme,
          project: null,
          themeMode: effectiveThemeMode,
          trainerPeriodOptionsByBase,
        });
      }
      replayNoteSnapshotFallbackViewRef.current = {
        contextReplay: note.contextReplay,
        hideLastPriceLine,
        initialDisplayPeriod: note.contextDisplayPeriod,
        noteId: note.id,
        noteType: note.type,
        project,
      };
      return createElement(ReplayNoteSnapshotChart, {
        ...snapshotViewOptions,
        bindings: historyReplayChartBindings,
        chartRenderMode,
        contextReplay: note.contextReplay,
        createSystemMarkers,
        emptyLabel: tt("appText.previewHistoricalQuotes"),
        hideLastPriceLine,
        initialDisplayPeriod: note.contextDisplayPeriod,
        language,
        noteId: note.id,
        noteType: note.type,
        onChartRenderModeChange: setChartRenderMode,
        onDisplayPeriodChange: updateReplayNoteContextDisplayPeriod,
        overlay: null,
        showGlobalDecimals,
        priceColorMode,
        tradeColorTheme,
        project,
        themeMode: effectiveThemeMode,
        trainerPeriodOptionsByBase,
      });
    },
    [
      chartRenderMode,
      createSystemMarkers,
      effectiveThemeMode,
      historyReplayChartBindings,
      language,
      priceColorMode,
      replayNoteSnapshotHydrationStateById,
      replayNotesRef,
      resolveTrainingRecordProjectFromNote,
      retryReplayNoteSnapshotDetail,
      setChartRenderMode,
      tt,
      trainerPeriodOptionsByBase,
      updateReplayNoteContextDisplayPeriod,
      language,
    ],
  );
useEffect(() => {
    const normalizedNoteId = String(activeTrainingRecordNoteId || "").trim();
    if (normalizedNoteId) {
      setActiveReplayNoteEditorNoteId(normalizedNoteId);
    }
  }, [activeTrainingRecordNoteId]);

  const activeReplayNoteEditorNote = useMemo(
    () =>
      activeReplayNoteEditorNoteId
        ? replayNotes.find((note) => note.id === activeReplayNoteEditorNoteId) ??
          null
        : null,
    [activeReplayNoteEditorNoteId, replayNotes],
  );

  const formatReplayNoteEditorMetaTime = useCallback(
    (isoText: string) => {
      const dateParts = toMarketDateParts(isoText);
      const nowParts = toMarketDateParts(Date.now());
      if (!dateParts || !nowParts) {
        return "";
      }
      const isSameDay =
        dateParts.year === nowParts.year &&
        dateParts.month === nowParts.month &&
        dateParts.day === nowParts.day;
      if (isSameDay) {
        return (
          formatMarketDateByLocale(isoText, language, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }) || ""
        );
      }
      return (
        formatMarketDateByLocale(isoText, language, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }) || ""
      );
    },
    [language],
  );

  const replayNoteEditorPayload = useMemo<ReplayNoteEditorSecondaryPayload | null>(() => {
    const note = activeReplayNoteEditorNote;
    if (!note) {
      return null;
    }
    const rawChips = Array.isArray(note.contextReplay?.noteSummary?.chips)
      ? note.contextReplay.noteSummary.chips
      : [];
    const summaryChips = rawChips
      .map((chip) => {
        const label = String(chip?.label || "").trim();
        const value = String(chip?.value || "").trim();
        if (!label || !value) {
          return null;
        }
        return {
          label,
          value,
          tone: chip?.tone,
        };
      })
      .filter((chip): chip is NonNullable<typeof chip> => Boolean(chip));
    const snapshot = (() => {
      if (!isReplaySnapshotNoteType(note.type)) {
        return null;
      }
      const fallbackTitle =
        note.title || DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language];
      const hydrationStatus =
        replayNoteSnapshotHydrationStateById[note.id]?.status ?? "idle";
      if (note.contextExpiredAt) {
        return {
          kind: "PLACEHOLDER" as const,
          label: tt("appText.trainingSnapshotExpired"),
        };
      }
      if (note.hasContextReplay && !note.contextReplay && hydrationStatus === "error") {
        return {
          kind: "ERROR" as const,
          label: tt("appText.readNotes"),
          retryLabel: tt("appText.retry"),
        };
      }
      if (note.hasContextReplay && !note.contextReplay) {
        return {
          kind: "LOADING" as const,
          label: tt("appText.loadingTrainingSnapshot"),
          body: fallbackTitle,
        };
      }
      if (!note.contextReplay) {
        return {
          kind: "PLACEHOLDER" as const,
          label: tt("appText.noteDoesTrainingSnapshotAttached"),
        };
      }
      const project = resolveTrainingRecordProjectFromNote(note);
      if (!project) {
        return {
          kind: "PLACEHOLDER" as const,
          label: tt("appText.previewHistoricalQuotes"),
        };
      }
      return {
        kind: "CHART" as const,
        project,
        trainerPeriodOptionsByBase,
        initialDisplayPeriod: note.contextDisplayPeriod,
        chartRenderMode,
        hideLastPriceLine: isSpecialTrainingReplayNoteType(note.type),
      };
    })();

    return {
      note: {
        id: note.id,
        type: note.type,
        title: note.title,
        contentDocument: note.contentDocument,
        attachments: note.attachments ?? [],
        colorTokens: note.colorTokens ?? [],
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        summaryChips,
      },
      defaultTitle: DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language],
      createdMetaText: withLabelValue(
        tt("appText.created"),
        formatReplayNoteEditorMetaTime(note.createdAt),
      ),
      isNewlyCreatedAtLocation:
        isReplaySnapshotNoteType(note.type) &&
        activeTrainingRecordNoteId === note.id &&
        isActiveTrainingRecordNoteNewlyCreated,
      colorLabel: tt("appText.color"),
      completeLabel: tt("appText.done"),
      cancelLabel: tt("appText.cancel"),
      deleteLabel: tt("appText.delete2"),
      snapshot,
    };
  }, [
    activeReplayNoteEditorNote,
    activeTrainingRecordNoteId,
    chartRenderMode,
    formatReplayNoteEditorMetaTime,
    isActiveTrainingRecordNoteNewlyCreated,
    language,
    replayNoteSnapshotHydrationStateById,
    resolveTrainingRecordProjectFromNote,
    trainerPeriodOptionsByBase,
    tt,
    withLabelValue,
  ]);

  const completeReplayNoteEditor = useCallback(
    (noteId?: string | null) => {
      const normalizedNoteId = String(noteId || activeReplayNoteEditorNoteId || "").trim();
      const note =
        replayNotesRef.current.find((item) => item.id === normalizedNoteId) ??
        null;
      if (note && isReplaySnapshotNoteType(note.type)) {
        closeActiveTrainingRecordNote();
      }
      setActiveReplayNoteEditorNoteId((current) =>
        current === normalizedNoteId || !normalizedNoteId ? "" : current,
      );
    },
    [
      activeReplayNoteEditorNoteId,
      closeActiveTrainingRecordNote,
      replayNotesRef,
    ],
  );

  const cancelReplayNoteEditor = useCallback(
    (noteId?: string | null) => {
      const normalizedNoteId = String(noteId || activeReplayNoteEditorNoteId || "").trim();
      const note =
        replayNotesRef.current.find((item) => item.id === normalizedNoteId) ??
        null;
      if (
        note &&
        isReplaySnapshotNoteType(note.type) &&
        activeTrainingRecordNoteId === normalizedNoteId &&
        isActiveTrainingRecordNoteNewlyCreated
      ) {
        cancelActiveTrainingRecordNote();
      } else if (note && isReplaySnapshotNoteType(note.type)) {
        closeActiveTrainingRecordNote();
      }
      setActiveReplayNoteEditorNoteId((current) =>
        current === normalizedNoteId || !normalizedNoteId ? "" : current,
      );
    },
    [
      activeReplayNoteEditorNoteId,
      activeTrainingRecordNoteId,
      cancelActiveTrainingRecordNote,
      closeActiveTrainingRecordNote,
      isActiveTrainingRecordNoteNewlyCreated,
      replayNotesRef,
    ],
  );

  useEffect(() => {
    if (activeReplayNoteEditorNoteId && !activeReplayNoteEditorNote) {
      setActiveReplayNoteEditorNoteId("");
    }
  }, [activeReplayNoteEditorNote, activeReplayNoteEditorNoteId]);

  const replayNoteEditorWindowOpenedRef = useRef(false);
  const replayNoteEditorWindowRevisionRef = useRef(0);
  useEffect(() => {
    if (!replayNoteEditorPayload) {
      replayNoteEditorWindowOpenedRef.current = false;
      replayNoteEditorWindowRevisionRef.current = 0;
      void api.closeDesktopSecondaryWindow("REPLAY_NOTE_EDITOR").catch(() => undefined);
      return;
    }
    const input = {
      kind: "REPLAY_NOTE_EDITOR" as const,
      title:
        replayNoteEditorPayload.note.title ||
        replayNoteEditorPayload.defaultTitle,
      payload: replayNoteEditorPayload,
    };
    if (!replayNoteEditorWindowOpenedRef.current) {
      replayNoteEditorWindowOpenedRef.current = true;
      void api
        .openDesktopSecondaryWindow(input)
        .then((state) => {
          replayNoteEditorWindowRevisionRef.current = state.revision;
        })
        .catch((error) => {
          replayNoteEditorWindowOpenedRef.current = false;
          replayNoteEditorWindowRevisionRef.current = 0;
          console.error("[desktop-secondary-window] replay note editor failed", error);
          setError(tt("appText.createNote"));
        });
      return;
    }
    void api
      .publishDesktopSecondaryWindowState(input)
      .then((state) => {
        replayNoteEditorWindowRevisionRef.current = state.revision;
      })
      .catch((error) => {
        replayNoteEditorWindowOpenedRef.current = false;
        replayNoteEditorWindowRevisionRef.current = 0;
        console.error("[desktop-secondary-window] replay note editor sync failed", error);
        setError(tt("appText.createNote"));
      });
  }, [replayNoteEditorPayload, setError, tt]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "REPLAY_NOTE_EDITOR") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            replayNoteEditorWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : {};
        const actionNoteId = String(
          payload.noteId || activeReplayNoteEditorNoteId || "",
        ).trim();
        switch (message.action) {
          case "SET_TITLE":
            if (actionNoteId) {
              updateReplayNoteTitle(actionNoteId, String(payload.title ?? ""));
            }
            break;
          case "COMMIT_TITLE":
            if (actionNoteId) {
              commitReplayNoteTitle(
                actionNoteId,
                typeof payload.title === "string" ? payload.title : undefined,
              );
            }
            break;
          case "SET_CONTENT_DOCUMENT":
            if (actionNoteId) {
              updateReplayNoteContent(
                actionNoteId,
                payload.contentDocument as never,
                Array.isArray(payload.attachments) ? payload.attachments as never : [],
              );
            }
            break;
          case "SET_COLOR_TOKENS":
            if (actionNoteId) {
              updateReplayNoteColorTokens(
                actionNoteId,
                normalizeReplayNoteColorTokens(payload.colorTokens),
              );
            }
            break;
          case "SET_DISPLAY_PERIOD":
            if (actionNoteId && isDisplayPeriodKey(payload.period)) {
              updateReplayNoteContextDisplayPeriod(actionNoteId, payload.period);
            }
            break;
          case "SET_CHART_RENDER_MODE":
            setChartRenderMode(normalizeChartRenderMode(payload.mode));
            break;
          case "RETRY_SNAPSHOT":
            if (actionNoteId) {
              retryReplayNoteSnapshotDetail(actionNoteId);
            }
            break;
          case "DELETE":
            if (actionNoteId) {
              setActiveReplayNoteEditorNoteId((current) =>
                current === actionNoteId ? "" : current,
              );
              void deleteReplayNoteById(actionNoteId).catch(() => {
                setError(tt("appText.deleteNote"));
              });
            }
            break;
          case "COMPLETE":
            completeReplayNoteEditor(actionNoteId);
            break;
          case "CANCEL":
          case "WINDOW_CLOSED":
          case "WINDOW_HIDDEN_FOR_REUSE":
            replayNoteEditorWindowOpenedRef.current = false;
            replayNoteEditorWindowRevisionRef.current = 0;
            cancelReplayNoteEditor(actionNoteId);
            break;
          default:
            break;
        }
      }),
    [
      activeReplayNoteEditorNoteId,
      cancelReplayNoteEditor,
      commitReplayNoteTitle,
      completeReplayNoteEditor,
      deleteReplayNoteById,
      retryReplayNoteSnapshotDetail,
      setChartRenderMode,
      setError,
      tt,
      updateReplayNoteColorTokens,
      updateReplayNoteContent,
      updateReplayNoteContextDisplayPeriod,
      updateReplayNoteTitle,
    ],
  );
  return { renderTrainingNoteSnapshot, activeReplayNoteEditorNote, formatReplayNoteEditorMetaTime, replayNoteEditorPayload, completeReplayNoteEditor, cancelReplayNoteEditor, replayNoteEditorWindowOpenedRef };
};
