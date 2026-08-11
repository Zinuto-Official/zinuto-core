// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import type {
  ReplayNoteColorToken as ApiReplayNoteColorToken,
  ReplayNoteScopeFilter as ApiReplayNoteScopeFilter,
} from "@zinuto/shared/replayNoteColors";
import type { ReplayNoteType as ApiReplayNoteType } from "@zinuto/shared/replayNoteBuilder";
import type {
  ReplayNoteAttachmentV1 as ApiReplayNoteAttachment,
  ReplayNoteDocumentV1 as ApiReplayNoteDocument,
} from "@zinuto/shared/replayNoteDocument";

export type {
  ApiReplayNoteColorToken,
  ApiReplayNoteAttachment,
  ApiReplayNoteDocument,
  ApiReplayNoteScopeFilter,
  ApiReplayNoteType,
};

export type ApiReplayNoteSource = {
  kind: string;
  id: string | null;
  label?: string;
};

export type ApiReplayNoteSummaryChip = {
  label?: string;
  value?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

export type ApiReplayNoteReferenceEntry = {
  noteId?: string;
  title?: string;
  type?: string;
  addedAt?: string;
  source?: Partial<ApiReplayNoteSource> | null;
  colorTokens?: ApiReplayNoteColorToken[];
  summaryChips?: ApiReplayNoteSummaryChip[];
};

export type ApiReplayNoteMeta = {
  schemaVersion?: number;
  templateId?: string;
  layout?: "DASHBOARD_REPLAY_REFLECTION" | "DOCUMENT_ONLY";
  reflectionSections?: Array<{
    key?: string;
    required?: boolean;
  }>;
  reflectionEntries?: Record<
    string,
    {
      value?: string;
      updatedAt?: string;
    }
  >;
  referenceEntries?: ApiReplayNoteReferenceEntry[];
};

export type ApiReplayNoteSummary = {
  id: string;
  title: string;
  type: ApiReplayNoteType;
  contentDocument?: ApiReplayNoteDocument;
  contentPreview?: string;
  contentLoaded?: boolean;
  trainingProjectId: string | null;
  contextDisplayPeriod?: string;
  createdAt: string;
  updatedAt: string;
  hasContextReplay: boolean;
  contextExpiredAt?: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  colorTokens?: ApiReplayNoteColorToken[];
  attachments?: ApiReplayNoteAttachment[];
  source?: ApiReplayNoteSource | null;
  meta?: ApiReplayNoteMeta | null;
  metaSummary?:
    | Pick<
        ApiReplayNoteMeta,
        "schemaVersion" | "templateId" | "layout" | "reflectionSections"
      >
    | null;
};

export type ApiReplayNoteDetail = ApiReplayNoteSummary & {
  contextReplay?: Record<string, unknown> | null;
};

export type ApiReplayNote = ApiReplayNoteDetail;

type ApiReplayNotePage = {
  items: ApiReplayNoteSummary[];
  nextCursor: string | null;
  total: number;
};

export type ApiRecentReplayNoteSummary = Pick<
  ApiReplayNoteSummary,
  "id" | "title" | "type" | "createdAt" | "updatedAt" | "colorTokens"
>;

const buildMetaSummary = (meta: ApiReplayNoteMeta | null | undefined) =>
  meta
    ? {
        schemaVersion: meta.schemaVersion,
        templateId: meta.templateId,
        layout: meta.layout,
        reflectionSections: meta.reflectionSections,
      }
    : meta === null
      ? null
      : undefined;

const buildReplayNoteRequestBody = <
  T extends {
    source?: ApiReplayNoteSource | null;
    meta?: ApiReplayNoteMeta | null;
  },
>(
  payload: T,
) => ({
  ...payload,
  ...(payload.source !== undefined
    ? {
        sourceKind: payload.source?.kind ?? null,
        sourceId: payload.source?.id ?? null,
      }
    : {}),
  metaSummary: buildMetaSummary(payload.meta),
});

export const createReplayNotesApi = (request: ApiRequester) => ({
  listReplayNotes: (
    limit = 60,
    cursor?: string,
    filters?: {
      keyword?: string;
      type?: ApiReplayNoteType;
      colorTokens?: ApiReplayNoteColorToken[];
      scope?: ApiReplayNoteScopeFilter;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(Math.max(1, Math.floor(limit))));
    if (cursor) {
      params.set("cursor", cursor);
    }
    if (filters?.keyword?.trim()) {
      params.set("keyword", filters.keyword.trim());
    }
    if (filters?.type) {
      params.set("type", filters.type);
    }
    if (Array.isArray(filters?.colorTokens) && filters.colorTokens.length) {
      params.set("colorTokens", filters.colorTokens.join(","));
    }
    if (filters?.scope) {
      params.set("scope", filters.scope);
    }
    return request<ApiReplayNotePage>(
      `/api/v1/replay-notes?${params.toString()}`,
      options,
    );
  },
  getReplayNote: (noteId: string, options?: ApiRequestOptions) =>
    request<ApiReplayNoteDetail>(
      `/api/v1/replay-notes/${encodeURIComponent(noteId)}`,
      options,
    ),
  listRecentReplayNotes: (limit = 2, options?: ApiRequestOptions) => {
    const params = new URLSearchParams();
    params.set("limit", String(Math.max(1, Math.floor(limit))));
    return request<ApiRecentReplayNoteSummary[]>(
      `/api/v1/replay-notes/recent?${params.toString()}`,
      options,
    );
  },
  createReplayNote: (
    payload: {
      id?: string;
      title?: string;
      type: ApiReplayNoteType;
      contentDocument: ApiReplayNoteDocument;
      attachments?: ApiReplayNoteAttachment[];
      colorTokens?: ApiReplayNoteColorToken[];
      contextReplay?: Record<string, unknown> | null;
      trainingProjectId?: string | null;
      contextDisplayPeriod?: string | null;
      contextSessionId?: string | null;
      contextCursorIndex?: number | null;
      source?: ApiReplayNoteSource | null;
      meta?: ApiReplayNoteMeta | null;
      createdAt?: string;
      updatedAt?: string;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiReplayNoteDetail>("/api/v1/replay-notes", {
      method: "POST",
      body: JSON.stringify(buildReplayNoteRequestBody(payload)),
      ...options,
    }),
  updateReplayNote: (
    noteId: string,
    payload: {
      title?: string;
      contentDocument?: ApiReplayNoteDocument;
      attachments?: ApiReplayNoteAttachment[];
      colorTokens?: ApiReplayNoteColorToken[];
      trainingProjectId?: string | null;
      contextDisplayPeriod?: string | null;
      contextReplay?: Record<string, unknown> | null;
      contextSessionId?: string | null;
      contextCursorIndex?: number | null;
      source?: ApiReplayNoteSource | null;
      meta?: ApiReplayNoteMeta | null;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiReplayNoteDetail>(`/api/v1/replay-notes/${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      body: JSON.stringify(buildReplayNoteRequestBody(payload)),
      ...options,
    }),
  deleteReplayNote: (noteId: string) =>
    request<{ deleted: number }>(
      `/api/v1/replay-notes/${encodeURIComponent(noteId)}`,
      {
        method: "DELETE",
      },
    ),
  clearReplayNotes: () =>
    request<{ deleted: number }>("/api/v1/replay-notes", {
      method: "DELETE",
    }),
  rebindTrainingRecordNotes: (fromBindingId: string, toBindingId: string) =>
    request<{ updated: number }>("/api/v1/replay-notes/rebind-training-project", {
      method: "POST",
      body: JSON.stringify({ fromBindingId, toBindingId }),
    }),
});
