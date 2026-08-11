// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import type {
  Account,
  PriceMode,
  TrainingSummary,
} from "@/domains/training/types";
import type {
  ApiTrainingProjectSummary,
  ApiTrainingProjectDetail,
  ApiTrainingProjectArchiveFromSessionPayload,
  ApiTrainingProjectSettlementPreviewPayload,
  ApiTrainingProjectSettlementPreview,
  ApiTrainingStatsReport,
  ApiTrainingStatsSummary,
  ApiTrainingReviewWindow,
  ApiTrainingReviewBundlePayload,
} from "@/api/historyTypes";

export type * from "@/api/historyTypes";

export const HISTORY_REPLAY_MAX_WINDOW_BARS =
  DESKTOP_API_LIMITS.noteContextBarsMax;

type ApiReplayBarLike = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ApiReplaySnapshotRecord = Record<string, unknown> & {
  session?: Record<string, unknown>;
  fills?: Array<Record<string, unknown>>;
  cashAdjustments?: Array<Record<string, unknown>>;
};

type ApiReplayWindowMeta = {
  startRawIndex: number;
  endRawIndex: number;
  totalBars: number;
  hasBackward: boolean;
  hasForward: boolean;
  limited: boolean;
};

const clampReplayIndex = (value: unknown, min: number, max: number): number => {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, normalized));
};

const isReplayBarArray = (value: unknown): value is ApiReplayBarLike[] =>
  Array.isArray(value);

const resolveReplaySnapshotSession = (
  snapshot: unknown,
): Record<string, unknown> | null => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const session = (snapshot as ApiReplaySnapshotRecord).session;
  return session && typeof session === "object" && !Array.isArray(session)
    ? session
    : null;
};

const resolveReplayCursorIndex = (
  snapshot: unknown,
  fallbackIndex: number,
): number => {
  const session = resolveReplaySnapshotSession(snapshot);
  return session
    ? clampReplayIndex(session.cursor_index, 0, fallbackIndex)
    : fallbackIndex;
};

export const resolveReplayWindowRange = ({
  totalBars,
  cursorIndex,
  startIndex,
  maxBars = HISTORY_REPLAY_MAX_WINDOW_BARS,
}: {
  totalBars: number;
  cursorIndex?: number | null;
  startIndex?: number | null;
  maxBars?: number;
}): { startRawIndex: number; endRawIndex: number; limited: boolean } => {
  const normalizedTotal = Math.max(0, Math.floor(Number(totalBars) || 0));
  if (normalizedTotal <= 0) {
    return { startRawIndex: 0, endRawIndex: -1, limited: false };
  }
  const lastIndex = normalizedTotal - 1;
  const cursor = clampReplayIndex(cursorIndex, 0, lastIndex);
  const lowerBound = clampReplayIndex(startIndex, 0, cursor);
  const normalizedMaxBars = Math.max(1, Math.floor(Number(maxBars) || 1));
  const availableCount = lastIndex - lowerBound + 1;
  if (availableCount <= normalizedMaxBars) {
    return {
      startRawIndex: lowerBound,
      endRawIndex: lastIndex,
      limited: false,
    };
  }
  const targetForwardBars = Math.floor(normalizedMaxBars * 0.25);
  const forwardBars = Math.min(
    Math.max(0, lastIndex - cursor),
    Math.max(0, targetForwardBars),
  );
  let startRawIndex = Math.max(
    lowerBound,
    cursor - (normalizedMaxBars - forwardBars) + 1,
  );
  let endRawIndex = Math.min(lastIndex, startRawIndex + normalizedMaxBars - 1);
  if (cursor > endRawIndex) {
    endRawIndex = cursor;
    startRawIndex = Math.max(lowerBound, endRawIndex - normalizedMaxBars + 1);
  }
  return {
    startRawIndex,
    endRawIndex,
    limited: true,
  };
};

const resolveSnapshotIndexedValue = (
  value: unknown,
  windowStartRawIndex: number,
  maxWindowIndex: number,
): number =>
  clampReplayIndex(Number(value) - windowStartRawIndex, 0, maxWindowIndex);

const readBarIndexedField = (item: Record<string, unknown>): number => {
  const snake = Number(item.bar_index);
  if (Number.isFinite(snake)) {
    return Math.floor(snake);
  }
  const camel = Number(item.barIndex);
  return Number.isFinite(camel) ? Math.floor(camel) : Number.NaN;
};

const rebaseReplaySnapshotForWindow = <TSnapshot>(
  snapshot: TSnapshot,
  windowStartRawIndex: number,
  windowEndRawIndex: number,
): TSnapshot => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return snapshot;
  }

  const snapshotRecord = snapshot as ApiReplaySnapshotRecord;
  const windowLength = Math.max(0, windowEndRawIndex - windowStartRawIndex + 1);
  const maxWindowIndex = Math.max(0, windowLength - 1);
  const session = resolveReplaySnapshotSession(snapshot);
  const nextSession = session
    ? {
        ...session,
        start_index: resolveSnapshotIndexedValue(
          session.start_index,
          windowStartRawIndex,
          maxWindowIndex,
        ),
        entry_index: resolveSnapshotIndexedValue(
          session.entry_index,
          windowStartRawIndex,
          maxWindowIndex,
        ),
        cursor_index: resolveSnapshotIndexedValue(
          session.cursor_index,
          windowStartRawIndex,
          maxWindowIndex,
        ),
      }
    : session;
  const nextFills = Array.isArray(snapshotRecord.fills)
    ? snapshotRecord.fills
        .filter((fill) => {
          const fillIndex = Math.floor(Number(fill.fill_index));
          return (
            Number.isFinite(fillIndex) &&
            fillIndex >= windowStartRawIndex &&
            fillIndex <= windowEndRawIndex
          );
        })
        .map((fill) => ({
          ...fill,
          fill_index: Math.floor(Number(fill.fill_index)) - windowStartRawIndex,
        }))
    : snapshotRecord.fills;
  const nextCashAdjustments = Array.isArray(snapshotRecord.cashAdjustments)
    ? snapshotRecord.cashAdjustments
        .filter((adjustment) => {
          const barIndex = readBarIndexedField(adjustment);
          return (
            Number.isFinite(barIndex) &&
            barIndex >= windowStartRawIndex &&
            barIndex <= windowEndRawIndex
          );
        })
        .map((adjustment) => {
          const nextIndex =
            readBarIndexedField(adjustment) - windowStartRawIndex;
          return {
            ...adjustment,
            bar_index: nextIndex,
            barIndex: nextIndex,
          };
        })
    : snapshotRecord.cashAdjustments;

  return {
    ...snapshotRecord,
    ...(nextSession ? { session: nextSession } : {}),
    ...(nextFills ? { fills: nextFills } : {}),
    ...(nextCashAdjustments ? { cashAdjustments: nextCashAdjustments } : {}),
  } as TSnapshot;
};

export const buildBoundedReplayBarsSnapshotWindow = <
  TBar extends ApiReplayBarLike,
  TSnapshot,
>(
  bars: TBar[],
  snapshot: TSnapshot,
  maxBars = HISTORY_REPLAY_MAX_WINDOW_BARS,
): {
  bars: TBar[];
  snapshot: TSnapshot;
  window: ApiReplayWindowMeta;
} | null => {
  if (!isReplayBarArray(bars) || bars.length <= 0) {
    return null;
  }
  const totalBars = bars.length;
  const lastIndex = totalBars - 1;
  const session = resolveReplaySnapshotSession(snapshot);
  const cursorIndex = resolveReplayCursorIndex(snapshot, lastIndex);
  const startIndex = session
    ? clampReplayIndex(session.start_index, 0, cursorIndex)
    : 0;
  const range = resolveReplayWindowRange({
    totalBars,
    cursorIndex,
    startIndex,
    maxBars,
  });
  if (range.endRawIndex < range.startRawIndex) {
    return null;
  }
  const windowBars =
    range.startRawIndex === 0 && range.endRawIndex === totalBars - 1
      ? bars
      : bars.slice(range.startRawIndex, range.endRawIndex + 1);
  if (!windowBars.length) {
    return null;
  }
  return {
    bars: windowBars,
    snapshot: rebaseReplaySnapshotForWindow(
      snapshot,
      range.startRawIndex,
      range.endRawIndex,
    ),
    window: {
      startRawIndex: range.startRawIndex,
      endRawIndex: range.endRawIndex,
      totalBars,
      hasBackward: false,
      hasForward: false,
      limited: range.limited || windowBars.length < totalBars,
    },
  };
};

const resolveReplayRecordBars = (
  record: Record<string, unknown>,
): ApiReplayBarLike[] | null => {
  if (isReplayBarArray(record.bars)) {
    return record.bars;
  }
  if (isReplayBarArray(record.previewBars)) {
    return record.previewBars;
  }
  return null;
};

export const constrainReplayArchiveRecordForFrontend = <
  TReplay extends Record<string, unknown> | null | undefined,
>(
  replay: TReplay,
  maxBars = HISTORY_REPLAY_MAX_WINDOW_BARS,
): TReplay => {
  if (!replay || typeof replay !== "object" || Array.isArray(replay)) {
    return replay;
  }

  const bars = resolveReplayRecordBars(replay);
  if (!bars?.length) {
    return replay;
  }

  const bounded = buildBoundedReplayBarsSnapshotWindow(
    bars,
    replay.snapshot ?? null,
    maxBars,
  );
  if (!bounded) {
    return {
      ...replay,
      bars: [],
    } as TReplay;
  }

  const existingWindow =
    replay.barWindow && typeof replay.barWindow === "object"
      ? (replay.barWindow as Partial<ApiReplayWindowMeta>)
      : {};
  if (
    bounded.bars === bars &&
    !bounded.window.limited &&
    isReplayBarArray(replay.bars)
  ) {
    return replay;
  }

  return {
    ...replay,
    bars: bounded.bars,
    snapshot: bounded.snapshot,
    barWindow: {
      ...existingWindow,
      ...bounded.window,
    },
  } as TReplay;
};

export const constrainTrainingProjectReplayForFrontend = <
  TProject extends { replay?: Record<string, unknown> | null },
>(
  project: TProject,
): TProject => {
  const constrainedReplay = constrainReplayArchiveRecordForFrontend(
    project.replay,
  );
  return constrainedReplay === project.replay
    ? project
    : {
        ...project,
        replay: constrainedReplay ?? undefined,
      };
};

const constrainTrainingReviewBundleReplaysForFrontend = (
  bundle: ApiTrainingReviewBundlePayload,
): ApiTrainingReviewBundlePayload => ({
  ...bundle,
  report: {
    ...bundle.report,
    sessions: bundle.report.sessions.map((session) => ({
      ...session,
      project: constrainTrainingProjectReplayForFrontend(session.project),
      detail: session.detail
        ? constrainTrainingProjectReplayForFrontend(session.detail)
        : session.detail,
    })),
  },
});

export const createTrainingHistoryApi = (request: ApiRequester) => ({
  getTrainingSummary: (
    symbol?: string,
    timeframe?: "1m" | "5m" | "1h" | "1d",
    finalizePriceMode?: PriceMode,
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    if (symbol) {
      params.set("symbol", symbol);
    }
    if (timeframe) {
      params.set("timeframe", timeframe);
    }
    if (finalizePriceMode) {
      params.set("finalizePriceMode", finalizePriceMode);
    }
    const query = params.toString();
    return request<TrainingSummary>(
      `/api/v1/training/summary${query ? `?${query}` : ""}`,
      options,
    );
  },
  resetAllTraining: (
    finalizePriceMode?: PriceMode,
    options?: ApiRequestOptions,
  ) =>
    request<{
      clearedSessions: number;
      accounts: Account[];
      summary: TrainingSummary;
    }>("/api/v1/training/reset-all", {
      method: "POST",
      body: JSON.stringify(finalizePriceMode ? { finalizePriceMode } : {}),
      ...options,
    }),
  resetSymbolTraining: (
    symbol: string,
    timeframe?: "1m" | "5m" | "1h" | "1d",
    finalizePriceMode?: PriceMode,
    options?: ApiRequestOptions,
  ) =>
    request<{
      symbol: string;
      clearedSessions: number;
      accounts: Account[];
      summary: TrainingSummary;
    }>("/api/v1/training/reset-symbol", {
      method: "POST",
      body: JSON.stringify(
        finalizePriceMode
          ? { symbol, timeframe, finalizePriceMode }
          : timeframe
            ? { symbol, timeframe }
            : { symbol },
      ),
      ...options,
    }),
  listTrainingProjects: (
    limit = 60,
    cursor?: string,
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(Math.max(1, Math.floor(limit))));
    if (cursor) {
      params.set("cursor", cursor);
    }
    return request<ApiTrainingProjectPage>(
      `/api/v1/training/projects?${params.toString()}`,
      options,
    );
  },
  getTrainingProject: (projectId: string, options?: ApiRequestOptions) =>
    request<ApiTrainingProjectDetail>(
      `/api/v1/training/projects/${encodeURIComponent(projectId)}`,
      options,
    ).then(constrainTrainingProjectReplayForFrontend),
  getTrainingStats: (
    filters?: {
      from?: string;
      to?: string;
      samplePoolId?: string;
      symbol?: string;
      timeframe?: string;
      tag?: string;
      profitability?: "ALL" | "PROFIT" | "LOSS";
      comparePoolA?: string;
      comparePoolB?: string;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.samplePoolId) params.set("samplePoolId", filters.samplePoolId);
    if (filters?.symbol) params.set("symbol", filters.symbol);
    if (filters?.timeframe) params.set("timeframe", filters.timeframe);
    if (filters?.tag) params.set("tag", filters.tag);
    if (filters?.profitability)
      params.set("profitability", filters.profitability);
    if (filters?.comparePoolA) params.set("comparePoolA", filters.comparePoolA);
    if (filters?.comparePoolB) params.set("comparePoolB", filters.comparePoolB);
    const query = params.toString();
    return request<ApiTrainingStatsReport>(
      `/api/v1/training/stats${query ? `?${query}` : ""}`,
      options,
    );
  },
  getTrainingStatsSummary: (
    filters?: {
      from?: string;
      to?: string;
      samplePoolId?: string;
      symbol?: string;
      timeframe?: string;
      tag?: string;
      profitability?: "ALL" | "PROFIT" | "LOSS";
      comparePoolA?: string;
      comparePoolB?: string;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.samplePoolId) params.set("samplePoolId", filters.samplePoolId);
    if (filters?.symbol) params.set("symbol", filters.symbol);
    if (filters?.timeframe) params.set("timeframe", filters.timeframe);
    if (filters?.tag) params.set("tag", filters.tag);
    if (filters?.profitability)
      params.set("profitability", filters.profitability);
    if (filters?.comparePoolA) params.set("comparePoolA", filters.comparePoolA);
    if (filters?.comparePoolB) params.set("comparePoolB", filters.comparePoolB);
    const query = params.toString();
    return request<ApiTrainingStatsSummary>(
      `/api/v1/training/stats/summary${query ? `?${query}` : ""}`,
      options,
    );
  },
  getTrainingReviewConsoleBundle: (
    payload: {
      projectIds: string[];
      window?: ApiTrainingReviewWindow;
      anchorMs?: number;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiTrainingReviewBundlePayload>(
      "/api/v1/training/review-console/bundle",
      {
        method: "POST",
        body: JSON.stringify({
          projectIds: Array.isArray(payload?.projectIds)
            ? payload.projectIds
            : [],
          window:
            typeof payload?.window === "string" ? payload.window : undefined,
          anchorMs: Number.isFinite(Number(payload?.anchorMs))
            ? Math.floor(Number(payload?.anchorMs))
            : undefined,
        }),
        ...options,
      },
    ).then(constrainTrainingReviewBundleReplaysForFrontend),
  archiveTrainingProjectFromSession: (
    payload: ApiTrainingProjectArchiveFromSessionPayload,
  ) =>
    request<ApiTrainingProjectDetail>(
      "/api/v1/training/projects/archive-session",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ).then(constrainTrainingProjectReplayForFrontend),
  previewTrainingProjectSettlementFromSession: (
    payload: ApiTrainingProjectSettlementPreviewPayload,
  ) =>
    request<ApiTrainingProjectSettlementPreview>(
      "/api/v1/training/projects/archive-session/preview",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  getTrainingResetDialogReadModel: (payload: {
    summary?: Record<string, unknown> | null;
    settlementMode?: "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET";
    terminationReasonCode?: string | null;
  }) =>
    request<{
      metrics: {
        initialCapital: number;
        finalEquity: number;
        equityReturnRate: number;
      };
      terminationReason: { reasonCode: string | null; messageKey: string };
      settlementMode: "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET";
      forcedLiquidationCount: number;
      forcedLiquidationSellCount: number;
      forcedLiquidationBuyCount: number;
      hasForcedLiquidation: boolean;
    }>("/api/v1/training/reset-dialog/read-model", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  renameTrainingProject: (projectId: string, name: string) =>
    request<ApiTrainingProjectDetail>(
      `/api/v1/training/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    ).then(constrainTrainingProjectReplayForFrontend),
  deleteTrainingProject: (projectId: string) =>
    request<{ deleted: number }>(
      `/api/v1/training/projects/${encodeURIComponent(projectId)}`,
      {
        method: "DELETE",
      },
    ),
  deleteTrainingProjects: (projectIds: string[]) =>
    request<{ deleted: number }>("/api/v1/training/projects/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: projectIds }),
    }),
  clearTrainingProjects: () =>
    request<{ deleted: number }>("/api/v1/training/projects/clear-all", {
      method: "POST",
    }),
});

type ApiTrainingProjectPage = {
  items: ApiTrainingProjectSummary[];
  nextCursor: string | null;
};
