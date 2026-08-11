// SPDX-License-Identifier: GPL-3.0-only

import type {
  DataTaskOperationProgress,
} from "@/domains/data-import/dataSourceTypes";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { Input } from "@/ui/primitives/input";
import {
  isActiveLocalDataImportCard,
  normalizeImportSourceId,
} from "@/domains/data-import/importActivity";
import {
  formatCountWithUnitText,
  formatDotJoinedText,
} from "@/ui/formatting/i18nDisplay";
import {
  AppIcon,
} from "@/assets/graphics";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import {
  FeatureLockLabel,
} from "@/ui/components";
import {
  resolveTimeSpanText,
  type CsvImportCardView,
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";
import { useDataConfigHallViewModel } from "@/workspaces/data/dataConfig/useDataConfigHallViewModel";
import {
  resolveSummaryOperationProgress,
} from "@/workspaces/data/dataConfig/dataConfigWorkspaceReadModelUi";
import type { DataConfigWorkspaceSurfaceViewModel } from "@/workspaces/data/dataConfig/DataConfigWorkspaceSurfaceViewModel";

type DataConfigPoolCardRenderersInput = {
  model: DataConfigWorkspaceSurfaceViewModel;
  getCardElementRef: (
    key: string,
  ) => ((node: HTMLElement | null) => void) | undefined;
  resolveSummaryFilterForItem: ReturnType<typeof useDataConfigHallViewModel>["resolveSummaryFilterForItem"];
};

const resolveSourceFolderTail = (sourceFolder: string): string => {
  const segments = String(sourceFolder || "")
    .trim()
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.slice(-2).join("/");
};

const focusPoolNameInputAfterMenuClose = (
  input: HTMLInputElement | null,
): void => {
  if (!input) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (input.isConnected) {
      input.focus({ preventScroll: true });
    }
  });
};

export const createDataConfigPoolCardRenderers = ({
  model,
  getCardElementRef,
  resolveSummaryFilterForItem,
}: DataConfigPoolCardRenderersInput) => {
  const {
    baseTimeframeLabels,
    beginCardReorder,
    cancelRenameSamplePool,
    clearLocalPoolsArmed,
    controlCsvImportCardJob,
    csvImportCardControlAction,
    dataConfigCopy,
    dataSourceSyncMonitorStateById,
    deletingSamplePoolId,
    dragOverPoolId,
    draggingPoolId,
    editingSamplePoolId,
    editingSamplePoolName,
    formatLocalizedDateTime,
    formatMoney,
    formatPercentDisplay,
    formatStorageBytes,
    isCardReorderBlocked,
    isClearingLocalDataSources,
    isDestructiveOperationBlocked,
    isGlobalOperationBlocked,
    isSourceOperationBlocked,
    joinWithMiddleDot,
    language,
    normalizedClearingLocalDataSourcesProgressPercent,
    normalizedDeletingProgressPercent,
    openDetailPool,
    poolSettingsById,
    preparingLocalDataSourceSyncPreview,
    readModelSourceStatusById,
    removeCustomPool,
    removedSymbolsByPool,
    renderDataTaskProgressRail,
    runDataSourceSyncQuickCheckSweep,
    saveRenameSamplePool,
    setEditingSamplePoolName,
    startRenameSamplePool,
    suppressNextCardClickRef,
    syncSamplePoolWithSourceFolder,
    tt,
    ttf,
    withLabelValue,
  } = model;
  const renderReadyPoolCard = (
    pool: PoolSettingsRow,
    key: string,
    titleOverride?: string,
    importCard?: CsvImportCardView,
  ) => {
    const isDeletingPool = deletingSamplePoolId === pool.id;
    const isActiveImport = isActiveLocalDataImportCard(importCard);
    const isCompletedImport =
      importCard?.phase === "DONE" && pool.status !== "FAILED";
    const hasPoolSymbols = Math.max(0, Number(pool.symbolCount) || 0) > 0;
    const isPoolReadyForTraining =
      pool.status === "READY" &&
      hasPoolSymbols &&
      !isDeletingPool &&
      (!pool.sourceLocked || pool.unlockedSymbols.length > 0);
    const effectivePoolEnabled = isPoolReadyForTraining && pool.selected;
    const isPoolParticipatingInTraining = pool.isSystem
      ? effectivePoolEnabled
      : isPoolReadyForTraining;
    const disabledCard =
      pool.status !== "READY" || !hasPoolSymbols || isDeletingPool;
    const isLocalClearReview = clearLocalPoolsArmed && !pool.isSystem;
    const editingSamplePoolNameCharacterCountText = ttf(
      "appText.inputCharacterCountValue0Value1",
      [
        String(editingSamplePoolName.length),
        String(INPUT_LIMITS.samplePoolNameChars),
      ],
    );
    const canDragReorder =
      !pool.isSystem &&
      !disabledCard &&
      !isCardReorderBlocked &&
      !isLocalClearReview;
    const isDragging = draggingPoolId === pool.id;
    const isDragOver = dragOverPoolId === pool.id && draggingPoolId !== pool.id;
    const removedSymbolCount = Math.max(
      0,
      Number(removedSymbolsByPool[pool.id]?.length || 0),
    );
    const hasLocalSymbolRemoval = removedSymbolCount > 0;
    const isPoolOperationBlocked =
      isLocalClearReview || isSourceOperationBlocked(pool.id);
    const cardTags = [baseTimeframeLabels[pool.baseTimeframe], pool.timeZone];
    const summaryLabel = dataConfigCopy.symbols;
    const symbolCountValue = formatMoney(pool.symbolCount, 0);
    const barCountValue = formatMoney(pool.barCount, 0);
    const storageValue = formatStorageBytes(
      Math.max(0, Number(pool.storageBytes) || 0),
    );
    const visibleSymbols = Array.from(
      new Set(
        pool.symbols
          .map((symbol) => String(symbol || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 2);
    const hiddenSymbolCount = Math.max(
      0,
      Math.max(0, Number(pool.symbolCount) || 0) - visibleSymbols.length,
    );
    const symbolPreview = formatDotJoinedText(language, visibleSymbols);
    const sourceFolderTail = resolveSourceFolderTail(pool.sourceFolder);
    const lastSyncedSummary = withLabelValue(
      tt("appText.lastSync"),
      formatLocalizedDateTime(pool.lastSyncedAt),
    );
    const poolScopeSummary = joinWithMiddleDot(cardTags);
    const timeRangeSummary = resolveTimeSpanText(
      pool.timeStartTs,
      pool.timeEndTs,
      "--",
      (startLabel, endLabel) => `${startLabel} — ${endLabel}`,
    );
    const canOpenPool = pool.status === "READY" && !isDeletingPool;
    const openReadyPoolDetails = () => {
      if (suppressNextCardClickRef.current) {
        suppressNextCardClickRef.current = false;
        return;
      }
      openDetailPool(pool.id);
    };
    const shouldIgnoreReadyPoolCardNavigation = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(
        target.closest(
          'button, input, select, textarea, a, [role="button"], [role="menuitem"], [data-no-card-navigation="true"]',
        ),
      );
    const deletingProgressLabel = ttf("appText.progressValue0Value1", [
      formatMoney(normalizedDeletingProgressPercent, 0),
      "100",
    ]);
    const baseResolvedStatus = resolveSummaryFilterForItem({
      id: key,
      type: "READY",
      pool,
      compactTitle: titleOverride || pool.name,
    });
    const readModelStatusCode = String(
      readModelSourceStatusById[pool.id]?.statusCode || "",
    ).trim();
    const monitorEntry = dataSourceSyncMonitorStateById[pool.id];
    const completedImportNeedsStateCleanup =
      isCompletedImport &&
      (pool.status === "IMPORTING" ||
        readModelStatusCode === "IMPORTING" ||
        (monitorEntry?.status === "SYNCING" &&
          !monitorEntry.operationProgress?.active));
    const resolvedStatus = isActiveImport
      ? {
          ...baseResolvedStatus,
          statusTone: "checking" as const,
          statusLabel: tt("appText.statusBuilding"),
          statusHint: importCard?.progressLabelText || dataConfigCopy.syncingHint,
          summaryFilter: "SYNCING" as const,
          priority: 3,
          footerNote:
            importCard?.compactEffectText ||
            importCard?.compactSizeSummaryText ||
            dataConfigCopy.syncingHint,
          progressLabel:
            importCard?.phase === "FINALIZING"
              ? importCard.compactProgressLabelText
              : importCard?.progressLabelText,
          progressPercent:
            importCard?.phase === "FINALIZING"
              ? importCard.compactProgressDisplayPercent
              : importCard?.importProgressPercent,
          progressActive: true,
          progressTone: "syncing" as const,
        }
      : completedImportNeedsStateCleanup
        ? {
            ...baseResolvedStatus,
            statusTone: "ready" as const,
            statusLabel: tt("appText.statusEnabled"),
            statusHint: "",
            summaryFilter: "ALL" as const,
            priority: 5,
            footerNote: lastSyncedSummary,
            progressLabel: undefined,
            progressPercent: undefined,
            progressActive: false,
            progressTone: undefined,
          }
        : baseResolvedStatus;
    const preparingSyncProgress =
      preparingLocalDataSourceSyncPreview?.sourceId === pool.id
        ? preparingLocalDataSourceSyncPreview.operationProgress
        : null;
    const clearingProgress =
      isClearingLocalDataSources && !pool.isSystem
        ? {
            label: tt("appText.clearLocalSamplePools"),
            progressPercent: normalizedClearingLocalDataSourcesProgressPercent,
            active: true,
            tone: "danger",
          } satisfies DataTaskOperationProgress
        : null;
    const activeSourceOperationProgress =
      (isActiveImport
        ? ({
            label:
              resolvedStatus.progressLabel || dataConfigCopy.syncing,
            progressPercent:
              resolvedStatus.progressPercent === undefined
                ? null
                : resolvedStatus.progressPercent,
            active: true,
            tone: "syncing",
          } satisfies DataTaskOperationProgress)
        : null) ??
      clearingProgress ??
      preparingSyncProgress ??
      resolveSummaryOperationProgress(resolvedStatus);
    const primaryMetaLine =
      String(resolvedStatus.statusHint || "").trim() ||
      String(resolvedStatus.footerNote || "").trim() ||
      String(resolvedStatus.lastCheckedLabel || "").trim();
    const hasDistinctLastSyncedSummary =
      Boolean(lastSyncedSummary) && primaryMetaLine !== lastSyncedSummary;
    const shouldOpenPoolFromPrimaryAction =
      pool.isSystem ||
      resolvedStatus.primaryActionLabel === dataConfigCopy.viewDetails;
    const primaryActionLabel = pool.isSystem
      ? dataConfigCopy.viewDetails
      : resolvedStatus.primaryActionLabel;
    const runPrimarySourceAction = () => {
      void syncSamplePoolWithSourceFolder(pool.id, {
        hasLocalSymbolRemoval,
        removedSymbolCount,
        poolName: pool.name,
        sourceFolderUsageMode: "BOUND_SOURCE",
      });
    };
    const readyPoolActionMenu = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="data-asset-card-menu-trigger"
            aria-label={tt("appText.moreActions")}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="data-asset-card-menu-dots" aria-hidden="true">
              <AppIcon name="actionMoreVertical" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="data-asset-card-menu-content"
          align="end"
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            const renameInput = document.querySelector<HTMLInputElement>(
              ".data-asset-card-name-input",
            );
            if (!renameInput) {
              return;
            }
            event.preventDefault();
            focusPoolNameInputAfterMenuClose(renameInput);
          }}
        >
          <DropdownMenuItem
            className="data-asset-card-menu-item"
            disabled={isDeletingPool || isLocalClearReview}
            onSelect={() => {
              startRenameSamplePool(pool.id, pool.name);
            }}
          >
            <span className="data-asset-card-menu-item-label">
              {tt("appText.rename")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="data-asset-card-menu-item"
            disabled={
              isGlobalOperationBlocked ||
              isLocalClearReview ||
              pool.isSystem ||
              pool.sourceLocked
            }
            onSelect={() => {
              void runDataSourceSyncQuickCheckSweep({
                force: true,
                trigger: "USER",
              });
            }}
          >
            <span className="data-asset-card-menu-item-label">
              {dataConfigCopy.checkAllChanges}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="data-asset-card-menu-item"
            disabled={
              isPoolOperationBlocked ||
              isDeletingPool ||
              pool.isSystem ||
              pool.sourceLocked
            }
            onSelect={() => {
              void syncSamplePoolWithSourceFolder(pool.id, {
                hasLocalSymbolRemoval,
                removedSymbolCount,
                poolName: pool.name,
                sourceFolderUsageMode: "ONE_OFF",
              });
            }}
          >
            <span className="data-asset-card-menu-item-label">
              {tt("appText.supplementAnotherFolder")}
            </span>
          </DropdownMenuItem>
          {pool.isSystem ? null : (
            <DropdownMenuItem
              className="data-asset-card-menu-item is-danger"
              disabled={isPoolOperationBlocked}
              onSelect={() => {
                void removeCustomPool(pool.id);
              }}
            >
              <span className="data-asset-card-menu-item-label">
                {tt("appText.delete2")}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

    return (
      <article
        key={key}
        ref={getCardElementRef(key)}
        className={`data-asset-card data-asset-card-ready data-config-source-row is-status-${resolvedStatus.statusTone} ${isPoolParticipatingInTraining ? "is-enabled" : "is-disabled"} ${disabledCard ? "is-not-ready" : ""} ${isDeletingPool ? "is-deleting" : ""} ${isLocalClearReview ? "is-clear-review" : ""} ${canDragReorder ? "is-draggable" : ""} ${isDragging ? "is-dragging" : ""} ${isDragOver ? "is-drag-over" : ""}`}
        data-no-drag="true"
        data-pool-card-id={pool.id}
        data-card-navigable={canOpenPool ? "true" : undefined}
        tabIndex={canOpenPool ? 0 : undefined}
        onClick={(event) => {
          if (
            !canOpenPool ||
            event.defaultPrevented ||
            shouldIgnoreReadyPoolCardNavigation(event.target)
          ) {
            return;
          }
          openReadyPoolDetails();
        }}
        onKeyDown={(event) => {
          if (
            !canOpenPool ||
            (event.key !== "Enter" && event.key !== " ") ||
            event.defaultPrevented ||
            shouldIgnoreReadyPoolCardNavigation(event.target)
          ) {
            return;
          }
          event.preventDefault();
          openReadyPoolDetails();
        }}
      >
            <div className="data-asset-card-folder-tab">
              <div className="data-asset-card-title-wrap">
                <span className="data-asset-card-title-icon" aria-hidden="true">
                  <AppIcon name="actionFolderImport" />
                </span>
                {editingSamplePoolId === pool.id ? (
                  <div
                    className="data-asset-card-title-edit"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="data-asset-card-name-field">
                      <Input
                        ref={focusPoolNameInputAfterMenuClose}
                        className="data-asset-card-name-input"
                        aria-describedby={`data-config-sample-pool-name-count-${pool.id}`}
                        aria-label={`${tt("appText.samplePoolName")} ${editingSamplePoolNameCharacterCountText}`}
                        value={editingSamplePoolName}
                        maxLength={INPUT_LIMITS.samplePoolNameChars}
                        onContextMenu={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setEditingSamplePoolName(event.target.value)
                        }
                        onBlur={saveRenameSamplePool}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveRenameSamplePool();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameSamplePool();
                          }
                        }}
                      />
                      <span
                        id={`data-config-sample-pool-name-count-${pool.id}`}
                        className="data-asset-card-name-count"
                        role="status"
                      >
                        {editingSamplePoolNameCharacterCountText}
                      </span>
                    </span>
                  </div>
                ) : (
                  <FeatureLockLabel locked={pool.sourceLocked}>
                    <span className="data-asset-card-title">
                      {titleOverride || pool.name}
                    </span>
                  </FeatureLockLabel>
                )}
                {canDragReorder ? (
                  <span
                    className="data-config-source-card-drag-handle"
                    data-card-reorder-handle="true"
                    data-no-card-navigation="true"
                    aria-hidden="true"
                    onPointerDown={(event) => {
                      beginCardReorder(event, pool.id, pool.baseTimeframe);
                    }}
                  />
                ) : null}
                {hasLocalSymbolRemoval ? (
                  <span className="data-asset-card-change-tag">
                    {tt("appText.locallyRemoved")}
                  </span>
                ) : null}
              </div>
              <div className="data-config-source-card-identity-meta">
                <span
                  className={`data-asset-status-chip data-asset-card-status-tab is-${resolvedStatus.statusTone}`}
                  title={resolvedStatus.statusLabel}
                >
                  <span className="data-asset-status-dot" aria-hidden="true" />
                  <span className="data-asset-card-status-text">
                    {resolvedStatus.statusLabel}
                  </span>
                </span>
                {symbolPreview ? (
                  <span
                    className="data-config-source-card-symbol-preview"
                    title={formatCountWithUnitText(
                      language,
                      symbolCountValue,
                      summaryLabel,
                    )}
                  >
                    {symbolPreview}
                    {hiddenSymbolCount > 0 ? ` +${hiddenSymbolCount}` : ""}
                  </span>
                ) : null}
                <span
                  className="data-config-source-card-path"
                  title={pool.sourceFolder || "--"}
                >
                  <span>{dataConfigCopy.sourceFolder}</span>
                  <strong>{sourceFolderTail || "--"}</strong>
                </span>
              </div>
              {readyPoolActionMenu}
            </div>

            <div className="data-asset-card-content data-config-source-card-content">
              <div className="data-config-source-card-coverage-band">
                <div
                  className="data-config-source-card-coverage-primary"
                  title={timeRangeSummary}
                >
                  <span>{tt("appText.timeRange")}</span>
                  <strong>{timeRangeSummary}</strong>
                </div>
                <div className="data-config-source-card-coverage-facts">
                  <span
                    className="data-config-source-card-coverage-fact is-period"
                    data-onboarding-target="LOCAL_IMPORT_TIME_ZONE"
                    title={poolScopeSummary}
                  >
                    <span>{tt("appText.period")}</span>
                    <strong>{poolScopeSummary}</strong>
                  </span>
                  <span className="data-config-source-card-coverage-fact">
                    <span>{summaryLabel}</span>
                    <strong>{symbolCountValue}</strong>
                  </span>
                  <span className="data-config-source-card-coverage-fact">
                    <span>{tt("appText.lineCount")}</span>
                    <strong>{barCountValue}</strong>
                  </span>
                  <span className="data-config-source-card-coverage-fact">
                    <span>{dataConfigCopy.storageUsed}</span>
                    <strong>{storageValue}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="data-asset-card-foot data-asset-card-foot-ready">
              <div className="data-config-source-card-operation">
                {isDeletingPool ? (
                  <div className="data-asset-card-progress-panel">
                  <div className="data-asset-import-phase">
                    {tt("appText.delete2")}
                  </div>
                  <div className="data-asset-import-progress-track">
                    <span
                      style={{ width: `${normalizedDeletingProgressPercent}%` }}
                    />
                  </div>
                  <div className="data-asset-import-progress-meta">
                    <span>{deletingProgressLabel}</span>
                    <span>
                      {formatPercentDisplay(
                        normalizedDeletingProgressPercent,
                        0,
                      )}
                    </span>
                  </div>
                  </div>
                ) : activeSourceOperationProgress ? (
                  <div className="data-asset-card-progress-panel data-asset-card-progress-panel-inline">
                    {renderDataTaskProgressRail(activeSourceOperationProgress)}
                  </div>
                ) : (
                  <div className="data-config-source-card-operation-summary">
                    <span title={primaryMetaLine}>{primaryMetaLine}</span>
                    {hasDistinctLastSyncedSummary ? (
                      <span title={lastSyncedSummary}>{lastSyncedSummary}</span>
                    ) : null}
                  </div>
                )}
              </div>
              {isDeletingPool ? null : (
                <div className="data-asset-card-actions">
                  {isActiveImport ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        !importCard?.jobId ||
                        importCard.cancelRequested ||
                        Boolean(csvImportCardControlAction)
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (importCard) {
                          void controlCsvImportCardJob(importCard.id, "CANCEL");
                        }
                      }}
                    >
                      {tt("appText.cancelBuild")}
                    </Button>
                  ) : null}
                  {!isActiveImport && !shouldOpenPoolFromPrimaryAction ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="data-asset-card-action"
                      data-action-emphasis="primary"
                      disabled={
                        isPoolOperationBlocked ||
                        resolvedStatus.primaryActionDisabled
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        runPrimarySourceAction();
                      }}
                    >
                      {primaryActionLabel}
                    </Button>
                  ) : canOpenPool ? (
                    <span
                      className="data-config-source-card-detail-affordance"
                      aria-hidden="true"
                    >
                      <span>{dataConfigCopy.viewDetails}</span>
                      <AppIcon name="actionChevronRight" />
                    </span>
                  ) : null}
                </div>
              )}
            </div>
      </article>
    );
  };

  const renderImportPoolCard = (
    importCard: CsvImportCardView,
    key: string,
    titleOverride?: string,
  ) => {
    const importSourceId = normalizeImportSourceId(importCard.sourceId);
    const linkedPool = importSourceId
      ? (poolSettingsById.get(importSourceId) ?? null)
      : null;
    const isFailedImportCard = importCard.phase === "FAILED";
    const isDeletingImportPool =
      Boolean(importSourceId) && deletingSamplePoolId === importSourceId;
    const isImportDeleteBlocked =
      !importSourceId ||
      isDestructiveOperationBlocked ||
      clearLocalPoolsArmed ||
      isSourceOperationBlocked(importSourceId);
    const isImportClearReview = clearLocalPoolsArmed;
    const deletingProgressLabel = ttf("appText.progressValue0Value1", [
      formatMoney(normalizedDeletingProgressPercent, 0),
      "100",
    ]);
    const importStatusTone =
      isFailedImportCard
        ? "danger"
        : importCard.phase === "DONE"
          ? "ready"
          : "pending";
    const importStatusLabel =
      isFailedImportCard
        ? tt("appText.statusBuild")
        : importCard.phase === "DONE"
          ? tt("appText.statusEnabled")
          : tt("appText.statusBuilding");
    return (
      <article
        key={key}
        ref={getCardElementRef(key)}
        className={`data-asset-card data-asset-card-import data-config-source-row data-config-source-row-import ${importCard.phase === "FAILED" ? "is-failed is-status-danger" : "is-status-checking"} ${isImportClearReview ? "is-clear-review" : ""}`}
        data-pool-card-id={importSourceId || importCard.id}
        data-no-drag="true"
      >
        <div className="data-asset-card-folder-tab">
          <div className="data-asset-card-title-wrap">
            <span className="data-asset-card-title-icon" aria-hidden="true">
              <AppIcon name="actionFolderImport" />
            </span>
            <span className="data-asset-card-title">
              {titleOverride ||
                importCard.poolName ||
                tt("appText.unnamedFolder")}
            </span>
          </div>
        </div>

        <div className="data-asset-card-head">
          <span
            className={`data-asset-status-chip data-asset-card-status-tab is-${importStatusTone}`}
            title={importStatusLabel}
          >
            <span className="data-asset-status-dot" aria-hidden="true" />
            <span className="data-asset-card-status-text">
              {importStatusLabel}
            </span>
          </span>
        </div>

        <div className="data-asset-card-content">
          <div className="data-asset-card-summary">
            <span className="data-asset-card-summary-label">
              {dataConfigCopy.importTask}
            </span>
            <strong className="data-asset-card-summary-value">
              {formatMoney(importCard.totalFiles, 0)}
            </strong>
            <span className="data-asset-card-summary-scope">
              {baseTimeframeLabels[importCard.baseTimeframe]}
            </span>
            <div className="data-asset-card-summary-lines">
              <span
                className="data-asset-card-meta-line data-asset-card-meta-line-progress"
                title={importCard.progressLabelText}
              >
                {importCard.progressLabelText}
              </span>
              <span
                className="data-asset-card-meta-line data-asset-card-meta-line-source"
                title={importCard.sourceFolder}
              >
                {importCard.compactSizeSummaryText || importCard.sourceFolder}
              </span>
              {importCard.skippedRowsLabelText ? (
                <span
                  className="data-asset-card-meta-line data-asset-card-meta-line-skipped"
                  title={importCard.skippedRowsLabelText}
                >
                  {importCard.skippedRowsLabelText}
                </span>
              ) : null}
              {importCard.errorMessage ? (
                <span
                  className="data-asset-card-meta-line data-asset-card-meta-line-error"
                  title={importCard.errorMessage}
                >
                  {importCard.errorMessage}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="data-asset-card-foot data-asset-card-foot-import">
          {isFailedImportCard && isDeletingImportPool ? (
            <div className="data-asset-card-progress-panel">
              <div className="data-asset-import-phase">
                {tt("appText.delete2")}
              </div>
              <div className="data-asset-import-progress-track">
                <span
                  style={{ width: `${normalizedDeletingProgressPercent}%` }}
                />
              </div>
              <div className="data-asset-import-progress-meta">
                <span>{deletingProgressLabel}</span>
                <span>
                  {formatPercentDisplay(normalizedDeletingProgressPercent, 0)}
                </span>
              </div>
            </div>
          ) : isFailedImportCard ? (
            <div className="data-asset-card-actions data-asset-card-actions-flat-row">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="data-asset-card-action"
                data-action-emphasis="primary"
                disabled={isImportClearReview}
                onClick={() => {
                  if (linkedPool) {
                    void syncSamplePoolWithSourceFolder(linkedPool.id, {
                      poolName: linkedPool.name,
                      sourceFolderUsageMode: "BOUND_SOURCE",
                    });
                  }
                }}
              >
                {dataConfigCopy.retry}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="data-asset-card-action"
                disabled={isImportDeleteBlocked}
                onClick={() => {
                  if (!importSourceId) {
                    return;
                  }
                  void removeCustomPool(importSourceId);
                }}
              >
                {tt("appText.delete2")}
              </Button>
            </div>
          ) : (
            <>
              <div className="data-asset-import-progress">
                <div className="data-asset-import-progress-track">
                  <span
                    style={{ width: `${importCard.importProgressPercent}%` }}
                  />
                </div>
                <div className="data-asset-import-progress-meta">
                  <span
                    className="data-asset-import-progress-label"
                    title={importCard.progressLabelText}
                  >
                    {importCard.progressLabelText}
                  </span>
                  <span className="data-asset-import-progress-value">
                    {formatPercentDisplay(importCard.importProgressPercent, 0)}
                  </span>
                </div>
              </div>
              <div className="data-asset-card-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    !importCard.jobId ||
                    importCard.cancelRequested ||
                    importCard.phase === "DONE" ||
                    Boolean(csvImportCardControlAction)
                  }
                  onClick={() => {
                    void controlCsvImportCardJob(importCard.id, "CANCEL");
                  }}
                >
                  {tt("appText.cancelBuild")}
                </Button>
              </div>
            </>
          )}
        </div>
      </article>
    );
  };

  return { renderImportPoolCard, renderReadyPoolCard };
};
