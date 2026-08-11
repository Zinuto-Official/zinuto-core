// SPDX-License-Identifier: GPL-3.0-only

import type { ApiDesktopWorkspaceReadModel } from "@/api";
import type { DataTaskOperationProgress } from "@/domains/data-import/dataSourceTypes";
import type { DataConfigReadModelSourceStatus } from "@/workspaces/data/dataConfig/hallStatusReadModelAdapter";

type SummaryOperationProgressLike = {
  progressActive?: boolean;
  progressLabel?: string;
  progressPercent?: number | null;
  progressTone?: DataTaskOperationProgress["tone"];
};

export const resolveSummaryOperationProgress = (
  status: SummaryOperationProgressLike,
): DataTaskOperationProgress | null => {
  if (!status.progressActive || !status.progressLabel) {
    return null;
  }
  return {
    label: status.progressLabel,
    progressPercent:
      status.progressPercent === undefined ? null : status.progressPercent,
    active: true,
    tone: status.progressTone ?? "checking",
  };
};

const toPlainRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeSourceStatusSummaryFilter = (
  value: unknown,
): DataConfigReadModelSourceStatus["summaryFilter"] => {
  const text = String(value || "").trim();
  return text === "ALL" ||
    text === "DIRTY" ||
    text === "ERROR" ||
    text === "SYNCING"
    ? text
    : undefined;
};

const normalizeSourceStatusPrimaryActionId = (
  value: unknown,
): DataConfigReadModelSourceStatus["primaryActionId"] => {
  const text = String(value || "").trim();
  return text === "view-details" ||
    text === "retry-import" ||
    text === "rebind-folder" ||
    text === "import-data"
    ? text
    : undefined;
};

export const readDataSourceStatusFactsFromReadModel = (
  model: ApiDesktopWorkspaceReadModel | null,
): Record<string, DataConfigReadModelSourceStatus> => {
  const facts = toPlainRecord(model?.facts);
  const dataFacts = toPlainRecord(facts.data);
  const rawStatusById = toPlainRecord(dataFacts.sourceStatusById);
  const result: Record<string, DataConfigReadModelSourceStatus> = {};
  Object.entries(rawStatusById).forEach(([sourceIdRaw, value]) => {
    const sourceId = String(sourceIdRaw || "").trim();
    const row = toPlainRecord(value);
    const statusCode = String(row.statusCode || "").trim();
    if (!sourceId || !statusCode) {
      return;
    }
    const reasonCode = String(row.reasonCode || "").trim() || null;
    const priority = Number(row.priority);
    result[sourceId] = {
      statusCode,
      reasonCode,
      tone: String(row.tone || "").trim() || undefined,
      priority: Number.isFinite(priority)
        ? Math.max(0, Math.min(100, Math.floor(priority)))
        : undefined,
      summaryFilter: normalizeSourceStatusSummaryFilter(row.summaryFilter),
      primaryActionId: normalizeSourceStatusPrimaryActionId(
        row.primaryActionId,
      ),
      primaryActionEnabled:
        typeof row.primaryActionEnabled === "boolean"
          ? row.primaryActionEnabled
          : undefined,
      primaryActionReasonCode:
        String(row.primaryActionReasonCode || "").trim() || null,
    };
  });
  return result;
};
