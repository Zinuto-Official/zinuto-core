// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMonitorStateById, DataSourceSyncPrefsById, DataTaskOperationProgress, DataTaskOperationProgressTone } from "@/domains/data-import/dataSourceTypes";
import type {
  DataConfigSummaryFilterId,
  HallSectionItem,
} from "@/workspaces/data/dataConfig/model";

export type DataConfigCopy = {
  viewDetails: string;
  importTask: string;
  retry: string;
  syncing: string;
  syncingHint: string;
  errorsFailedHint: string;
  errorFailed: string;
  lightweightCheckFailed: string;
  changesDetected: string;
  confirmationRequired: string;
  previewBeforeSync: string;
  sync: string;
  estimatedChangedFiles: (value: string) => string;
  confirmationNeeded: string;
  autoSyncArmed: string;
  sourceFolderChanged: string;
  rebindRequired: string;
  rebindRequiredHint: string;
  rebindActionLabel: string;
  pendingChanges: string;
  checking: string;
  checkingHint: string;
  autoSyncEnabled: string;
  promptOnlyHint: string;
  syncedAuto: string;
  syncedAutoHint: string;
  noChangesHint: string;
  manualCheckHint: string;
  manualMode: string;
  readOnly: string;
  readOnlyHint: string;
  symbols: string;
  lastChecked: (value: string) => string;
};

export type SummaryFilterResolvedStatus = {
  statusTone: "ready" | "warning" | "danger" | "muted" | "checking";
  statusLabel: string;
  statusHint: string;
  summaryFilter: DataConfigSummaryFilterId;
  priority: number;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  lastCheckedLabel: string;
  footerNote: string;
  progressLabel?: string;
  progressPercent?: number | null;
  progressActive?: boolean;
  progressTone?: DataTaskOperationProgressTone;
};

export type DataConfigReadModelSourceStatus = {
  statusCode: string;
  reasonCode: string | null;
  tone?: string;
  priority?: number;
  summaryFilter?: DataConfigSummaryFilterId;
  primaryActionId?: "view-details" | "retry-import" | "rebind-folder" | "import-data";
  primaryActionEnabled?: boolean;
  primaryActionReasonCode?: string | null;
};

const resolveOperationProgressFields = (
  progress: DataTaskOperationProgress | null | undefined,
): Pick<
  SummaryFilterResolvedStatus,
  "progressActive" | "progressLabel" | "progressPercent" | "progressTone"
> => {
  if (!progress?.active) {
    return {};
  }
  return {
    progressActive: true,
    progressLabel: progress.label,
    progressPercent: progress.progressPercent,
    progressTone: progress.tone,
  };
};

const resolveReadModelSummaryFilter = (
  status: DataConfigReadModelSourceStatus | null | undefined,
  fallback: DataConfigSummaryFilterId,
): DataConfigSummaryFilterId => status?.summaryFilter ?? fallback;

const resolveReadModelPrimaryActionLabel = (
  status: DataConfigReadModelSourceStatus | null | undefined,
  fallback: string,
  dataConfigCopy: DataConfigCopy,
): string => {
  switch (status?.primaryActionId) {
    case "retry-import":
      return dataConfigCopy.retry;
    case "rebind-folder":
      return dataConfigCopy.rebindActionLabel;
    case "import-data":
      return dataConfigCopy.importTask;
    case "view-details":
      return dataConfigCopy.viewDetails;
    default:
      return fallback;
  }
};

const isReadModelPrimaryActionMutating = (
  status: DataConfigReadModelSourceStatus | null | undefined,
): boolean =>
  Boolean(status?.primaryActionId && status.primaryActionId !== "view-details");

const resolveReadModelPrimaryActionDisabled = ({
  status,
  fallbackDisabled,
  itemOperationBlocked,
}: {
  status: DataConfigReadModelSourceStatus | null | undefined;
  fallbackDisabled: boolean;
  itemOperationBlocked: boolean;
}): boolean => {
  if (!status) {
    return fallbackDisabled;
  }
  return (
    status.primaryActionEnabled === false ||
    (isReadModelPrimaryActionMutating(status) && itemOperationBlocked)
  );
};

type ResolveHallSummaryStatusParams = {
  dataConfigCopy: DataConfigCopy;
  dataSourceSyncMonitorStateById: DataSourceSyncMonitorStateById;
  dataSourceSyncPrefsById: DataSourceSyncPrefsById;
  formatLocalizedDateTime: (value: string | null) => string;
  formatMoney: (value: number, digits?: number) => string;
  itemOperationBlocked: boolean;
  item: HallSectionItem;
  readModelSourceStatusById?: Record<string, DataConfigReadModelSourceStatus>;
  tt: (key: string) => string;
};

export const resolveHallSummaryStatus = ({
  dataConfigCopy,
  dataSourceSyncMonitorStateById,
  dataSourceSyncPrefsById,
  formatLocalizedDateTime,
  formatMoney,
  itemOperationBlocked,
  item,
  readModelSourceStatusById,
  tt,
}: ResolveHallSummaryStatusParams): SummaryFilterResolvedStatus => {
  if (item.type === "IMPORT") {
    const linkedPool = item.bridgedReadyPool;
    const canRetry =
      item.card.phase === "FAILED" &&
      linkedPool &&
      !linkedPool.isSystem &&
      !linkedPool.sourceLocked &&
      !itemOperationBlocked;
    return {
      statusTone:
        item.card.phase === "FAILED"
          ? "danger"
          : item.card.phase === "FINALIZING"
            ? "checking"
            : "warning",
      statusLabel:
        item.card.phase === "FAILED"
          ? dataConfigCopy.errorFailed
          : dataConfigCopy.syncing,
      statusHint:
        item.card.phase === "FAILED"
          ? (item.card.errorMessage || dataConfigCopy.errorsFailedHint).trim()
          : item.card.progressLabelText,
      summaryFilter: item.card.phase === "FAILED" ? "ERROR" : "SYNCING",
      priority: item.card.phase === "FAILED" ? 0 : 3,
      primaryActionLabel: canRetry
        ? dataConfigCopy.retry
        : dataConfigCopy.viewDetails,
      primaryActionDisabled: !canRetry && !linkedPool,
      lastCheckedLabel: dataConfigCopy.lastChecked("--"),
      footerNote:
        item.card.phase === "FAILED"
          ? dataConfigCopy.errorsFailedHint
          : item.card.shouldShowCompactProgress && item.card.compactEffectText
            ? item.card.compactEffectText
            : item.card.compactSizeSummaryText || dataConfigCopy.syncingHint,
      progressLabel:
        item.card.phase === "FAILED"
          ? undefined
          : item.card.phase === "FINALIZING"
            ? item.card.compactProgressLabelText
            : item.card.progressLabelText,
      progressPercent:
        item.card.phase === "FAILED"
          ? undefined
          : item.card.phase === "FINALIZING"
            ? item.card.compactProgressDisplayPercent
            : item.card.importProgressPercent,
      progressActive: item.card.phase !== "FAILED" && item.card.phase !== "DONE",
      progressTone: "syncing",
    };
  }

  const monitor =
    dataSourceSyncMonitorStateById[String(item.pool.id || "").trim()] ?? null;
  const readModelSourceStatus =
    readModelSourceStatusById?.[String(item.pool.id || "").trim()] ?? null;
  const readModelStatusCode = String(
    readModelSourceStatus?.statusCode || "",
  ).trim();
  const syncMode =
    dataSourceSyncPrefsById[String(item.pool.id || "").trim()]?.mode ?? "PROMPT";
  const checkedAtText = monitor?.checkedAt
    ? formatLocalizedDateTime(monitor.checkedAt)
    : "--";
  if (
    readModelStatusCode === "READ_ONLY" ||
    (!readModelSourceStatus && (item.pool.isSystem || item.pool.sourceLocked))
  ) {
    return {
      statusTone: "muted",
      statusLabel: dataConfigCopy.readOnly,
      statusHint: dataConfigCopy.readOnlyHint,
      summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "ALL"),
      priority: readModelSourceStatus?.priority ?? 6,
      primaryActionLabel: resolveReadModelPrimaryActionLabel(
        readModelSourceStatus,
        dataConfigCopy.viewDetails,
        dataConfigCopy,
      ),
      primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
        status: readModelSourceStatus,
        fallbackDisabled: false,
        itemOperationBlocked,
      }),
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.readOnlyHint,
    };
  }
  if (
    readModelStatusCode === "REBIND_REQUIRED" ||
    (!readModelSourceStatus && item.pool.requiresSourceFolderRebind)
  ) {
    return {
      statusTone: "warning",
      statusLabel: dataConfigCopy.rebindRequired,
      statusHint: dataConfigCopy.rebindRequiredHint,
      summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "DIRTY"),
      priority: readModelSourceStatus?.priority ?? 1,
      primaryActionLabel: resolveReadModelPrimaryActionLabel(
        readModelSourceStatus,
        dataConfigCopy.rebindActionLabel,
        dataConfigCopy,
      ),
      primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
        status: readModelSourceStatus,
        fallbackDisabled: itemOperationBlocked,
        itemOperationBlocked,
      }),
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.rebindRequiredHint,
    };
  }
  if (
    readModelStatusCode === "FAILED" ||
    (!readModelSourceStatus && item.pool.status === "FAILED")
  ) {
    return {
      statusTone: "danger",
      statusLabel: dataConfigCopy.errorFailed,
      statusHint: dataConfigCopy.errorsFailedHint,
      summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "ERROR"),
      priority: readModelSourceStatus?.priority ?? 0,
      primaryActionLabel: resolveReadModelPrimaryActionLabel(
        readModelSourceStatus,
        dataConfigCopy.retry,
        dataConfigCopy,
      ),
      primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
        status: readModelSourceStatus,
        fallbackDisabled: itemOperationBlocked,
        itemOperationBlocked,
      }),
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.errorsFailedHint,
    };
  }
  if (readModelStatusCode === "IMPORTING") {
    return {
      statusTone: "checking",
      statusLabel: dataConfigCopy.syncing,
      statusHint: dataConfigCopy.syncingHint,
      summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "SYNCING"),
      priority: readModelSourceStatus?.priority ?? 3,
      primaryActionLabel: resolveReadModelPrimaryActionLabel(
        readModelSourceStatus,
        dataConfigCopy.viewDetails,
        dataConfigCopy,
      ),
      primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
        status: readModelSourceStatus,
        fallbackDisabled: false,
        itemOperationBlocked,
      }),
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.syncingHint,
    };
  }
  if (readModelStatusCode === "EMPTY") {
    return {
      statusTone: "warning",
      statusLabel: dataConfigCopy.importTask,
      statusHint: dataConfigCopy.noChangesHint,
      summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "ALL"),
      priority: readModelSourceStatus?.priority ?? 4,
      primaryActionLabel: resolveReadModelPrimaryActionLabel(
        readModelSourceStatus,
        dataConfigCopy.importTask,
        dataConfigCopy,
      ),
      primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
        status: readModelSourceStatus,
        fallbackDisabled: itemOperationBlocked,
        itemOperationBlocked,
      }),
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.manualCheckHint,
    };
  }
  if (monitor?.status === "ERROR") {
    return {
      statusTone: "danger",
      statusLabel: dataConfigCopy.errorFailed,
      statusHint: monitor.lastError || dataConfigCopy.lightweightCheckFailed,
      summaryFilter: "ERROR",
      priority: 0,
      primaryActionLabel: dataConfigCopy.retry,
      primaryActionDisabled: itemOperationBlocked,
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.promptOnlyHint,
      ...resolveOperationProgressFields(monitor.operationProgress),
    };
  }
  if (monitor?.status === "NEEDS_CONFIRMATION") {
    const baseFooter =
      monitor.estimatedChangedFiles > 0
        ? dataConfigCopy.estimatedChangedFiles(
            formatMoney(monitor.estimatedChangedFiles, 0),
          )
        : dataConfigCopy.confirmationNeeded;
    return {
      statusTone: "warning",
      statusLabel: dataConfigCopy.changesDetected,
      statusHint:
        syncMode === "AUTO"
          ? dataConfigCopy.confirmationRequired
          : dataConfigCopy.previewBeforeSync,
      summaryFilter: "DIRTY",
      priority: 1,
      primaryActionLabel: dataConfigCopy.sync,
      primaryActionDisabled: itemOperationBlocked,
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: baseFooter,
      ...resolveOperationProgressFields(monitor.operationProgress),
    };
  }
  if (monitor?.status === "DIRTY") {
    const baseFooter =
      monitor.estimatedChangedFiles > 0
        ? dataConfigCopy.estimatedChangedFiles(
            formatMoney(monitor.estimatedChangedFiles, 0),
          )
        : dataConfigCopy.pendingChanges;
    return {
      statusTone: "warning",
      statusLabel: dataConfigCopy.changesDetected,
      statusHint:
        syncMode === "AUTO"
          ? dataConfigCopy.autoSyncArmed
          : dataConfigCopy.sourceFolderChanged,
      summaryFilter: "DIRTY",
      priority: 2,
      primaryActionLabel: dataConfigCopy.sync,
      primaryActionDisabled: itemOperationBlocked,
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: baseFooter,
      ...resolveOperationProgressFields(monitor.operationProgress),
    };
  }
  if (monitor?.status === "SYNCING") {
    return {
      statusTone: "checking",
      statusLabel: dataConfigCopy.syncing,
      statusHint: dataConfigCopy.syncingHint,
      summaryFilter: "SYNCING",
      priority: 3,
      primaryActionLabel: dataConfigCopy.viewDetails,
      primaryActionDisabled: false,
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote: dataConfigCopy.syncingHint,
      ...resolveOperationProgressFields(monitor.operationProgress),
    };
  }
  if (monitor?.status === "CHECKING") {
    return {
      statusTone: "checking",
      statusLabel: dataConfigCopy.checking,
      statusHint: dataConfigCopy.checkingHint,
      summaryFilter: "ALL",
      priority: 4,
      primaryActionLabel: dataConfigCopy.viewDetails,
      primaryActionDisabled: false,
      lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
      footerNote:
        syncMode === "AUTO"
          ? dataConfigCopy.autoSyncEnabled
          : syncMode === "MANUAL"
            ? dataConfigCopy.manualCheckHint
            : dataConfigCopy.promptOnlyHint,
      ...resolveOperationProgressFields(monitor.operationProgress),
    };
  }
  return {
    statusTone: "ready",
    statusLabel:
      syncMode === "AUTO"
        ? dataConfigCopy.syncedAuto
        : syncMode === "MANUAL"
          ? dataConfigCopy.manualMode
          : tt("appText.statusEnabled"),
    statusHint:
      syncMode === "AUTO"
        ? dataConfigCopy.syncedAutoHint
        : syncMode === "MANUAL"
          ? dataConfigCopy.manualCheckHint
          : dataConfigCopy.noChangesHint,
    summaryFilter: resolveReadModelSummaryFilter(readModelSourceStatus, "ALL"),
    priority: readModelSourceStatus?.priority ?? 5,
    primaryActionLabel: resolveReadModelPrimaryActionLabel(
      readModelSourceStatus,
      dataConfigCopy.viewDetails,
      dataConfigCopy,
    ),
    primaryActionDisabled: resolveReadModelPrimaryActionDisabled({
      status: readModelSourceStatus,
      fallbackDisabled: false,
      itemOperationBlocked,
    }),
    lastCheckedLabel: dataConfigCopy.lastChecked(checkedAtText),
    footerNote:
      syncMode === "AUTO"
        ? dataConfigCopy.autoSyncEnabled
        : dataConfigCopy.manualCheckHint,
  };
};
