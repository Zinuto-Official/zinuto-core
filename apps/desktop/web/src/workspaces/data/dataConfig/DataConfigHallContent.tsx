// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { AppIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import {
  PageSectionGroup,
  WorkspaceFrameShell,
  WorkspacePageShell,
} from "@/ui/components";
import { PortableDataSettingsLink } from "@/workspaces/settings/portableData/PortableDataSettingsLink";
import {
  resolveHallSectionStats,
  type CsvImportCardView,
  type HallSection,
  type HallSectionItem,
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";
import type { DataConfigWorkspaceSurfaceViewModel } from "@/workspaces/data/dataConfig/DataConfigWorkspaceSurfaceViewModel";
import { MarketDataAcquisitionTriggerSection } from "@/workspaces/data/dataConfig/MarketDataAcquisitionTriggerSection";
import "@/workspaces/data/dataConfig/data-config-management.css";

type DataConfigHallContentProps = {
  model: DataConfigWorkspaceSurfaceViewModel;
  importedHallSections: HallSection[];
  systemHallSections: HallSection[];
  hasImportedDataUpdates: boolean;
  renderImportPoolCard: (
    importCard: CsvImportCardView,
    key: string,
    titleOverride?: string,
  ) => ReactNode;
  renderReadyPoolCard: (
    pool: PoolSettingsRow,
    key: string,
    titleOverride?: string,
    importCard?: CsvImportCardView,
  ) => ReactNode;
  startLocalDataImportEntry: () => void;
  onDropZoneDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDropZoneDragOver: (event: DragEvent<HTMLElement>) => void;
  onDropZoneDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDropZoneDrop: (event: DragEvent<HTMLElement>) => void;
};

const rebuildSectionsWithItems = (
  sections: HallSection[],
  selectItems: (item: HallSectionItem) => HallSectionItem[],
): HallSection[] =>
  sections
    .map((section) => {
      const items = section.items.flatMap(selectItems);
      if (!items.length) {
        return null;
      }
      return {
        ...section,
        items,
        ...resolveHallSectionStats(items),
      };
    })
    .filter((section): section is HallSection => Boolean(section));

const toStableReadyItem = (
  item: HallSectionItem,
  poolSettingsById: Map<string, PoolSettingsRow>,
): HallSectionItem[] => {
  if (item.type === "READY") {
    return [item];
  }
  const sourceId = String(item.card.sourceId || "").trim();
  const stablePool =
    item.bridgedReadyPool ?? (sourceId ? poolSettingsById.get(sourceId) : null);
  if (!stablePool || stablePool.isSystem) {
    return [];
  }
  return [
    {
      id: item.id,
      type: "READY",
      pool: stablePool,
      compactTitle: item.compactTitle,
    },
  ];
};

export const DataConfigHallContent = ({
  model,
  importedHallSections,
  systemHallSections,
  hasImportedDataUpdates,
  renderImportPoolCard,
  renderReadyPoolCard,
  startLocalDataImportEntry,
  onDropZoneDragEnter,
  onDropZoneDragOver,
  onDropZoneDragLeave,
  onDropZoneDrop,
}: DataConfigHallContentProps) => {
  const {
    clearArmedAction,
    clearLocalPoolsActionKey,
    clearLocalPoolsArmed,
    csvImportCardViews,
    customSamplePoolsCount,
    dataConfigCopy,
    formatMoney,
    formatStorageBytes,
    hasClearablePools,
    isDestructiveOperationBlocked,
    isDropZoneActive,
    isGlobalOperationBlocked,
    isImportEntryBlocked,
    isNativeImportDragActive,
    isPreparingCsvImportPreview,
    language,
    marketDataStorageBytes,
    onClearLocalPools,
    openDetailPool,
    openDeviceTransferSettings,
    portableCopy,
    poolSettingsById,
    prioritizedRebindPools,
    renderPreparingCsvImportPreviewProgress,
    runDataSourceSyncQuickCheckSweep,
    setArmedKey,
    tt,
    ttLoose,
    ui,
    withLabelValue,
  } = model;

  const stableImportedSections = useMemo(() => {
    const seenPoolIds = new Set<string>();
    return rebuildSectionsWithItems(importedHallSections, (item) =>
      toStableReadyItem(item, poolSettingsById).filter((stableItem) => {
        if (stableItem.type !== "READY") {
          return false;
        }
        if (seenPoolIds.has(stableItem.pool.id)) {
          return false;
        }
        seenPoolIds.add(stableItem.pool.id);
        return true;
      }),
    );
  }, [importedHallSections, poolSettingsById]);
  const stableImportedItems = useMemo(
    () => stableImportedSections.flatMap((section) => section.items),
    [stableImportedSections],
  );
  const importedDataSummary = useMemo(
    () =>
      stableImportedItems.reduce(
        (summary, item) => {
          if (item.type === "READY") {
            summary.symbolCount += Math.max(
              0,
              Number(item.pool.symbolCount) || 0,
            );
            summary.storageBytes += Math.max(
              0,
              Number(item.pool.storageBytes) || 0,
            );
          }
          return summary;
        },
        { symbolCount: 0, storageBytes: 0 },
      ),
    [stableImportedItems],
  );
  const latestImportCardsBySourceId = useMemo(() => {
    const cardsBySourceId = new Map<string, CsvImportCardView>();
    csvImportCardViews.forEach((card) => {
      const sourceId = String(card.sourceId || "").trim();
      if (sourceId) {
        cardsBySourceId.set(sourceId, card);
      }
    });
    return cardsBySourceId;
  }, [csvImportCardViews]);
  const provisionalImportCards = useMemo(
    () =>
      csvImportCardViews.filter((card) => {
        const sourceId = String(card.sourceId || "").trim();
        if (card.phase === "DONE") {
          return false;
        }
        if (!sourceId) {
          return true;
        }
        return (
          latestImportCardsBySourceId.get(sourceId)?.id === card.id &&
          !poolSettingsById.has(sourceId)
        );
      }),
    [csvImportCardViews, latestImportCardsBySourceId, poolSettingsById],
  );

  const hasLocalSources =
    stableImportedItems.length > 0 || provisionalImportCards.length > 0;
  const [systemDataExpanded, setSystemDataExpanded] = useState(false);
  const shouldShowSystemData = !hasLocalSources || systemDataExpanded;
  const isDropZoneHighlighted = isDropZoneActive || isNativeImportDragActive;
  const preventLocalSourceMutationDuringClearReview = (
    event: DragEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const renderReadySourceList = (
    sections: HallSection[],
    className = "",
  ) => (
    <div className={`data-config-source-list ${className}`.trim()}>
      {sections.flatMap((section) =>
        section.items.map((item) =>
          item.type === "READY"
            ? renderReadyPoolCard(
                item.pool,
                item.id,
                item.compactTitle,
                latestImportCardsBySourceId.get(item.pool.id),
              )
            : null,
        ),
      )}
    </div>
  );
  const renderImportedSourceList = () => (
    <div className="data-config-source-list">
      {stableImportedSections.flatMap((section) =>
        section.items.map((item) =>
          item.type === "READY"
            ? renderReadyPoolCard(
                item.pool,
                item.id,
                item.compactTitle,
                latestImportCardsBySourceId.get(item.pool.id),
              )
            : null,
        ),
      )}
      {provisionalImportCards.map((card) =>
        renderImportPoolCard(
          card,
          String(card.sourceId || "").trim()
            ? `slot-${String(card.sourceId || "").trim()}`
            : `import-${card.id}`,
          card.poolName,
        ),
      )}
    </div>
  );
  const renderImportPrecheck = () =>
    isPreparingCsvImportPreview ? (
      <div className="data-config-precheck-inline">
        <span className="data-config-task-row-icon" aria-hidden="true">
          <AppIcon name="actionFolderImport" />
        </span>
        <span>
          <strong>{dataConfigCopy.importHeroTitle}</strong>
          {renderPreparingCsvImportPreviewProgress()}
        </span>
      </div>
    ) : null;

  const armClearLocalSources = () => {
    if (isDestructiveOperationBlocked || !hasClearablePools) {
      return;
    }
    setArmedKey(clearLocalPoolsActionKey);
  };

  const confirmClearLocalSources = () => {
    if (!clearLocalPoolsArmed || isDestructiveOperationBlocked) {
      return;
    }
    clearArmedAction();
    onClearLocalPools();
  };

  return (
    <WorkspacePageShell
      template="workflow"
      className={`settings-page data-config-page data-asset-page ${
        isDropZoneHighlighted ? "is-drop-active" : ""
      } ${isPreparingCsvImportPreview ? "is-previewing-import" : ""}`}
      bodyClassName="settings-page-content data-asset-page-body"
    >
      <WorkspaceFrameShell>
        <div className="data-asset-panel-slider is-hall-only data-config-single-panel">
          <section className="data-asset-panel data-asset-panel-hall">
            <PageSectionGroup
              className="data-config-page-sections"
              onDragEnter={
                clearLocalPoolsArmed
                  ? preventLocalSourceMutationDuringClearReview
                  : onDropZoneDragEnter
              }
              onDragOver={
                clearLocalPoolsArmed
                  ? preventLocalSourceMutationDuringClearReview
                  : onDropZoneDragOver
              }
              onDragLeave={
                clearLocalPoolsArmed
                  ? preventLocalSourceMutationDuringClearReview
                  : onDropZoneDragLeave
              }
              onDrop={
                clearLocalPoolsArmed
                  ? preventLocalSourceMutationDuringClearReview
                  : onDropZoneDrop
              }
            >
              <header className="data-config-page-toolbar">
                <div className="data-config-page-toolbar-copy">
                  <h1>{ui.dataConfigTitle}</h1>
                  {hasLocalSources ? (
                    <div className="data-config-source-group-metrics">
                      <span>
                        {withLabelValue(
                          dataConfigCopy.symbolCount,
                          formatMoney(importedDataSummary.symbolCount, 0),
                        )}
                      </span>
                      <span>
                        {withLabelValue(
                          dataConfigCopy.storageUsed,
                          formatStorageBytes(importedDataSummary.storageBytes),
                        )}
                      </span>
                      {hasImportedDataUpdates ? (
                        <span className="data-config-source-group-update">
                          <span
                            className="data-config-source-group-update-dot"
                            aria-hidden="true"
                          />
                          <span>{dataConfigCopy.importedDataUpdateNotice}</span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {hasLocalSources ? (
                  <div className="data-config-page-toolbar-actions">
                    <Button
                      type="button"
                      variant="default"
                      data-onboarding-target="LOCAL_IMPORT_ENTRY"
                      disabled={isImportEntryBlocked || clearLocalPoolsArmed}
                      onClick={startLocalDataImportEntry}
                    >
                      <AppIcon name="actionFolderImport" aria-hidden="true" />
                      <span>{dataConfigCopy.importHeroBrowseAction}</span>
                    </Button>
                    <MarketDataAcquisitionTriggerSection
                      isImportEntryBlocked={
                        isImportEntryBlocked || clearLocalPoolsArmed
                      }
                      presentation="toolbar"
                      tt={ttLoose}
                    />
                  </div>
                ) : null}
              </header>

              <div className="data-config-management-scroll">
                {!hasLocalSources ? (
                  <section
                    className={`data-config-add-decision ${
                      isDropZoneHighlighted ? "is-drop-active" : ""
                    } ${isPreparingCsvImportPreview ? "is-previewing" : ""}`}
                    data-no-drag="true"
                  >
                    <header className="data-config-add-decision-head">
                      <span className="data-config-import-hero-kicker">
                        {dataConfigCopy.importedDataEmptyTitle}
                      </span>
                      <h2>{ttLoose("appText.dataManagementAddDataTitle")}</h2>
                      <p>{ttLoose("appText.dataManagementAddDataHint")}</p>
                    </header>
                    {renderImportPrecheck()}
                    <div className="data-config-add-decision-options">
                      <Button
                        type="button"
                        variant="secondary"
                        className="data-config-add-choice data-config-add-choice-local"
                        data-onboarding-target="LOCAL_IMPORT_ENTRY"
                        disabled={isImportEntryBlocked}
                        onClick={startLocalDataImportEntry}
                      >
                        <span
                          className="data-config-add-choice-icon"
                          aria-hidden="true"
                        >
                          <AppIcon name="actionFolderImport" />
                        </span>
                        <span className="data-config-add-choice-copy">
                          <strong>{dataConfigCopy.importHeroTitle}</strong>
                          <span>{dataConfigCopy.importHeroDropTitle}</span>
                          <span className="data-config-add-choice-action">
                            {dataConfigCopy.importHeroBrowseAction}
                          </span>
                        </span>
                      </Button>
                      <MarketDataAcquisitionTriggerSection
                        isImportEntryBlocked={isImportEntryBlocked}
                        presentation="decision"
                        tt={ttLoose}
                      />
                    </div>
                  </section>
                ) : (
                  <section
                    className={`data-config-source-group data-config-source-group-imported ${
                      clearLocalPoolsArmed ? "is-clear-review-active" : ""
                    }`.trim()}
                  >
                    <header className="data-config-source-group-head">
                      <div className="data-config-source-group-copy">
                        <h2 className="data-config-source-group-title">
                          {dataConfigCopy.importedDataTitle}
                        </h2>
                        <span className="data-config-source-group-hint">
                          {ttLoose("appText.myImportedDataHint")}
                        </span>
                      </div>
                      <div className="data-config-source-group-actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            isGlobalOperationBlocked || clearLocalPoolsArmed
                          }
                          onClick={() => {
                            void runDataSourceSyncQuickCheckSweep({
                              force: true,
                              trigger: "USER",
                            });
                          }}
                        >
                          {dataConfigCopy.checkAllChanges}
                        </Button>
                        {clearLocalPoolsArmed ? null : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon-sm"
                                aria-label={tt("appText.moreActions")}
                                disabled={
                                  isDestructiveOperationBlocked ||
                                  !hasClearablePools
                                }
                              >
                                <AppIcon
                                  name="actionMoreVertical"
                                  aria-hidden="true"
                                />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="data-asset-card-menu-item is-danger"
                                onSelect={(event) => {
                                  event.preventDefault();
                                  armClearLocalSources();
                                }}
                              >
                                {tt("appText.clearLocalSamplePools")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </header>
                    {renderImportPrecheck()}
                    {clearLocalPoolsArmed ? (
                      <section
                        className="data-config-clear-review"
                        role="alert"
                        aria-live="polite"
                      >
                        <div className="data-config-clear-review-copy">
                          <strong>
                            {tt("appText.clearLocalSamplePoolsArmed")}
                          </strong>
                          <div className="data-config-clear-review-metrics">
                            <span>
                              {withLabelValue(
                                tt("appText.samplePool"),
                                formatMoney(customSamplePoolsCount, 0),
                              )}
                            </span>
                            <span>
                              {withLabelValue(
                                dataConfigCopy.symbolCount,
                                formatMoney(importedDataSummary.symbolCount, 0),
                              )}
                            </span>
                            <span>
                              {withLabelValue(
                                dataConfigCopy.storageUsed,
                                formatStorageBytes(
                                  Math.max(
                                    importedDataSummary.storageBytes,
                                    Number(marketDataStorageBytes) || 0,
                                  ),
                                ),
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="data-config-clear-review-actions">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={isDestructiveOperationBlocked}
                            onClick={confirmClearLocalSources}
                          >
                            {tt("appText.clearLocalSamplePools")}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={clearArmedAction}
                          >
                            {tt("appText.cancel2")}
                          </Button>
                        </div>
                      </section>
                    ) : null}
                    {prioritizedRebindPools.length > 0 ? (
                      <section className="portable-transfer-data-banner">
                        <div className="portable-transfer-data-banner-copy">
                          <strong>{portableCopy.rebindBannerTitle}</strong>
                          <p>{portableCopy.rebindBannerBody}</p>
                          <span>
                            {formatDotJoinedText(language, [
                              `${formatMoney(
                                prioritizedRebindPools.length,
                                0,
                              )} ${portableCopy.pendingRebindLabel}`,
                              prioritizedRebindPools[0]?.name || "",
                            ])}
                          </span>
                        </div>
                        <div className="portable-transfer-data-banner-actions">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const firstPool = prioritizedRebindPools[0];
                              if (firstPool) {
                                openDetailPool(firstPool.id);
                              }
                            }}
                          >
                            {portableCopy.rebindActionLabel}
                          </Button>
                          <PortableDataSettingsLink
                            language={language}
                            onOpenDeviceTransferSettings={
                              openDeviceTransferSettings
                            }
                          />
                        </div>
                      </section>
                    ) : null}
                    {renderImportedSourceList()}
                  </section>
                )}

                <section
                  className={`data-config-source-group data-config-source-group-system ${
                    shouldShowSystemData ? "is-expanded" : "is-collapsed"
                  }`}
                >
                  <header className="data-config-source-group-head">
                    <div className="data-config-source-group-copy">
                      <h2 className="data-config-source-group-title">
                        {dataConfigCopy.systemSamplesTitle}
                      </h2>
                      <span className="data-config-source-group-hint">
                        {ttLoose(
                          hasLocalSources
                            ? "appText.dataManagementSystemDataSecondaryHint"
                            : "appText.dataManagementSystemDataImmediateHint",
                        )}
                      </span>
                    </div>
                    {hasLocalSources ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={shouldShowSystemData}
                        onClick={() =>
                          setSystemDataExpanded((expanded) => !expanded)
                        }
                      >
                        {tt(
                          shouldShowSystemData
                            ? "appText.collapse"
                            : "appText.expand",
                        )}
                      </Button>
                    ) : null}
                  </header>
                  {shouldShowSystemData
                    ? renderReadySourceList(
                        systemHallSections,
                        "data-config-source-list-system",
                      )
                    : null}
                </section>
              </div>
            </PageSectionGroup>
          </section>
        </div>
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};
