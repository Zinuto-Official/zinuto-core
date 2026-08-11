// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiDesktopWorkspaceReadModel,
  type ApiHistoryReviewConsoleQuery,
} from "@/api";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { formatMessage } from "@zinuto/shared/i18n";

export type HistoryReadModelDateRangeFacts = {
  statusCode: string;
  reasonCode: string | null;
  rawRange: string;
  startDate: string | null;
  endDate: string | null;
};

export type HistoryReadModelCompactStats = {
  initialCapital: number;
  finalEquity: number;
  equityReturnRate: number;
  drawdownRate: number;
  drawdownAmount: number;
  dateRange: HistoryReadModelDateRangeFacts;
};

export type HistoryReadModelProjectFacts = {
  id: string;
  replayNoteCount: number;
  replayNoteCountStatusCode: string;
  compactStats: HistoryReadModelCompactStats | null;
};

export type HistoryPoolFilterOption = {
  id: string;
  name: string;
};

export type HistoryReviewReadModelFacts = {
  statusCode: string;
  reasonCode: string | null;
  projectFactsById: ReadonlyMap<string, HistoryReadModelProjectFacts>;
  filteredProjectIds: readonly string[];
  filteredProjectCount: number;
  poolFilterOptions: HistoryPoolFilterOption[];
  selectedProjectId: string | null;
  selectedProjectSessionId: string | null;
};

const EMPTY_HISTORY_REVIEW_FACTS: HistoryReviewReadModelFacts = {
  statusCode: "PENDING",
  reasonCode: null,
  projectFactsById: new Map(),
  filteredProjectIds: [],
  filteredProjectCount: 0,
  poolFilterOptions: [],
  selectedProjectId: null,
  selectedProjectSessionId: null,
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const normalizeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const readDateRangeFacts = (value: unknown): HistoryReadModelDateRangeFacts => {
  const record = toRecord(value);
  return {
    statusCode: String(record.statusCode ?? "EMPTY"),
    reasonCode: normalizeOptionalText(record.reasonCode),
    rawRange: typeof record.rawRange === "string" ? record.rawRange : "",
    startDate: normalizeOptionalText(record.startDate),
    endDate: normalizeOptionalText(record.endDate),
  };
};

const readCompactStats = (
  value: unknown,
): HistoryReadModelCompactStats | null => {
  const record = toRecord(value);
  if (!Object.keys(record).length) {
    return null;
  }
  return {
    initialCapital: normalizeNumber(record.initialCapital),
    finalEquity: normalizeNumber(record.finalEquity),
    equityReturnRate: normalizeNumber(record.equityReturnRate),
    drawdownRate: normalizeNumber(record.drawdownRate),
    drawdownAmount: normalizeNumber(record.drawdownAmount),
    dateRange: readDateRangeFacts(record.dateRange),
  };
};

const readProjectFacts = (value: unknown): HistoryReadModelProjectFacts | null => {
  const record = toRecord(value);
  const id = normalizeOptionalText(record.id);
  if (!id) {
    return null;
  }
  return {
    id,
    replayNoteCount: normalizeNumber(record.replayNoteCount),
    replayNoteCountStatusCode: String(
      record.replayNoteCountStatusCode ?? "EMPTY",
    ),
    compactStats: readCompactStats(record.compactStats),
  };
};

const readPoolFilterOptions = (value: unknown): HistoryPoolFilterOption[] => {
  return toArray(value).map((item) => {
    const record = toRecord(item);
    return {
      id: String(record.id ?? ""),
      name: String(record.name ?? ""),
    };
  }).filter((item) => Boolean(item.id));
};

const readHistoryReviewFacts = (
  model: ApiDesktopWorkspaceReadModel | null,
): HistoryReviewReadModelFacts => {
  if (!model) {
    return EMPTY_HISTORY_REVIEW_FACTS;
  }
  const facts = toRecord(model.facts);
  const rawProjectFactsById = toRecord(facts.projectFactsById);
  const projectFactsById = new Map<string, HistoryReadModelProjectFacts>();
  Object.values(rawProjectFactsById).forEach((value) => {
    const projectFacts = readProjectFacts(value);
    if (projectFacts) {
      projectFactsById.set(projectFacts.id, projectFacts);
    }
  });
  return {
    statusCode: model.statusCode,
    reasonCode: model.reasonCode,
    projectFactsById,
    filteredProjectIds: toArray(facts.filteredProjectIds).map(String).filter(Boolean),
    filteredProjectCount: normalizeNumber(facts.filteredProjectCount),
    poolFilterOptions: readPoolFilterOptions(facts.poolFilterOptions),
    selectedProjectId: normalizeOptionalText(facts.selectedProjectId),
    selectedProjectSessionId: normalizeOptionalText(facts.selectedProjectSessionId),
  };
};

export const useHistoryReviewReadModelFacts = (
  refreshKey: string,
  query?: ApiHistoryReviewConsoleQuery,
): HistoryReviewReadModelFacts => {
  const [model, setModel] = useState<ApiDesktopWorkspaceReadModel | null>(null);
  useEffect(() => {
    const abortController = new AbortController();
    api
      .getWorkspaceReadModel("history-review-console", {
        signal: abortController.signal,
        historyQuery: query,
      })
      .then((nextModel) => {
        if (!abortController.signal.aborted) {
          setModel(nextModel);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setModel(null);
        }
      });
    return () => {
      abortController.abort();
    };
  }, [refreshKey, query?.keyword, query?.profitFilter, query?.samplePoolFilter, query?.samplePoolAllId, query?.samplePoolUnknownId]);

  return useMemo(() => readHistoryReviewFacts(model), [model]);
};

export const formatHistoryDateRangeFacts = (
  language: AppUiLanguage,
  facts: HistoryReadModelDateRangeFacts,
): string => {
  if (facts.statusCode !== "READY") {
    return formatMessage(language, "app.dateRange.empty");
  }
  const emptyDate = formatMessage(language, "common.placeholder.none");
  return formatMessage(language, "app.dateRange.between", {
    start: facts.startDate || emptyDate,
    end: facts.endDate || emptyDate,
  });
};
