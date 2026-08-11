// SPDX-License-Identifier: GPL-3.0-only

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/primitives/context-menu";
import { Input } from "@/ui/primitives/input";
import { SurfaceCard } from "@/ui/primitives/surface-card";
import { useI18n } from "@/frontend-kernel/i18n";
import { useArmedAction } from "@/ui/hooks/useArmedAction";
import { AppIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";
import { InlineInfoLabel } from "@/ui/components/InlineInfoLabel";

export type ReplayReviewArchiveTone = "up" | "down" | "flat";
export type ReplayReviewArchiveBadgeTone =
  | "default"
  | "secondary"
  | "outline"
  | "destructive";

export type ReplayReviewArchiveRuleBadge = {
  id: string;
  label: string;
  tone?: ReplayReviewArchiveBadgeTone;
};

export type ReplayReviewArchiveFinancialItem = {
  id: string;
  label: string;
  labelTooltip?: string;
  value: string;
  tone?: ReplayReviewArchiveTone;
};

export type ReplayReviewArchiveRow = {
  id: string;
  sequenceText: string;
  projectName: string;
  createdAtText: string;
  symbol: string;
  environmentLabel: string;
  environmentMetaText?: string;
  timeframeText: string;
  tradeCountText: string;
  returnRateText: string;
  returnTone: ReplayReviewArchiveTone;
  profitFactorText: string;
  ruleBadges: ReplayReviewArchiveRuleBadge[];
  rowBadges: ReplayReviewArchiveRuleBadge[];
  financialItems: ReplayReviewArchiveFinancialItem[];
};

export type ReplayReviewArchiveSectionLabels = {
  selectedCountText: (count: number) => string;
  clearSelected: string;
  deleteSelected: string;
  clearHistory: string;
  emptyState: string;
  columns: {
    sessionAndTime: string;
    symbolAndEnvironment: string;
    timeframe: string;
    trades: string;
    totalReturnRate: string;
    profitFactor: string;
    details: string;
    delete: string;
  };
  detailAction: string;
  financialBreakdownTitle: string;
  ruleBadgesTitle: string;
};

type ReplayReviewArchiveSectionProps = {
  rows: ReplayReviewArchiveRow[];
  labels: ReplayReviewArchiveSectionLabels;
  selectedRowIds: string[];
  onSelectedRowIdsChange: (next: string[]) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onDeleteAll: () => void;
  canDeleteAll?: boolean;
  editingRowId?: string;
  editingRowName?: string;
  onStartRenameRow?: (rowId: string) => void;
  onEditingRowNameChange?: (value: string) => void;
  onSaveRenameRow?: () => void;
  onCancelRenameRow?: () => void;
  detailMode?: "inline" | "window" | "both";
  renderDetailPreview?: (row: ReplayReviewArchiveRow) => ReactNode;
  onOpenDetailWindow?: (row: ReplayReviewArchiveRow) => void;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
  statusAdornment?: ReactNode;
};

const resolveToneClassName = (tone: ReplayReviewArchiveTone): string => {
  if (tone === "up") {
    return "text-[color:var(--price-up-color)]";
  }
  if (tone === "down") {
    return "text-[color:var(--price-down-color)]";
  }
  return "text-[color:var(--text-subtle)]";
};

const resolveBadgeVariant = (
  tone: ReplayReviewArchiveBadgeTone | undefined,
): ReplayReviewArchiveBadgeTone => tone ?? "outline";

const ReplayReviewArchiveDetailBody = ({
  row,
  labels,
  detailPreview,
}: {
  row: ReplayReviewArchiveRow;
  labels: ReplayReviewArchiveSectionLabels;
  detailPreview?: ReactNode;
}) => (
  <div className="grid gap-3">
    {detailPreview ? <div>{detailPreview}</div> : null}

    <SurfaceCard className="rounded-xl p-4">
      <div className="grid gap-2">
        <div className="text-r1 text-[color:var(--text-subtle)]">
          {labels.ruleBadgesTitle}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.ruleBadges.length ? (
            row.ruleBadges.map((badge) => (
              <Badge
                key={badge.id}
                variant={resolveBadgeVariant(badge.tone)}
                className="h-6 px-2.5"
              >
                {badge.label}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="h-6 px-2.5">
              {row.environmentLabel}
            </Badge>
          )}
        </div>
      </div>
    </SurfaceCard>

    <SurfaceCard className="rounded-xl p-4">
      <div className="grid gap-2.5">
        <div className="text-r1 text-[color:var(--text-subtle)]">
          {labels.financialBreakdownTitle}
        </div>
        {row.financialItems.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {row.financialItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-2.5 py-2"
              >
                <div className="text-r1 text-[color:var(--text-subtle)]">
                  <InlineInfoLabel
                    label={item.label}
                    tooltip={item.labelTooltip}
                    critical
                  />
                </div>
                <div
                  className={cn(
                    "mt-1 text-r2 font-semibold",
                    resolveToneClassName(item.tone ?? "flat"),
                  )}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-r1 text-[color:var(--text-subtle)]">
            {labels.emptyState}
          </div>
        )}
      </div>
    </SurfaceCard>
  </div>
);

export const ReplayReviewArchiveSection = ({
  rows,
  labels,
  selectedRowIds,
  onSelectedRowIdsChange,
  onDeleteRows,
  onDeleteAll,
  canDeleteAll = true,
  editingRowId = "",
  editingRowName = "",
  onStartRenameRow,
  onEditingRowNameChange,
  onSaveRenameRow,
  onCancelRenameRow,
  detailMode = "both",
  renderDetailPreview,
  onOpenDetailWindow,
  canLoadMore = false,
  isLoadingMore = false,
  onLoadMore,
  className,
  statusAdornment,
}: ReplayReviewArchiveSectionProps) => {
  const { t } = useI18n();
  const middleDot = t("common.symbol.middleDot");
  const {
    buildBlurClearHandler,
    clearArmedAction,
    isActionArmed,
    setArmedKey,
  } = useArmedAction<string>();
  const [expandedRowId, setExpandedRowId] = useState("");
  const confirmDeleteLabel = t("appText.confirmDelete");
  const loadMoreLabel = t("appText.loadMore");
  const loadingLabel = t("appText.loading");

  const selectedIdSet = useMemo(
    () => new Set(selectedRowIds),
    [selectedRowIds],
  );
  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIdSet.has(row.id));
  const hasSelectedRows = selectedRowIds.length > 0;
  const deleteSelectedKey = "selected";
  const deleteAllKey = "all";

  useEffect(() => {
    if (hasSelectedRows) {
      return;
    }
    clearArmedAction();
  }, [clearArmedAction, hasSelectedRows]);

  const toggleRowSelection = (rowId: string, checked: boolean) => {
    if (checked) {
      if (selectedIdSet.has(rowId)) {
        return;
      }
      onSelectedRowIdsChange([...selectedRowIds, rowId]);
      return;
    }
    onSelectedRowIdsChange(selectedRowIds.filter((id) => id !== rowId));
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      onSelectedRowIdsChange([]);
      return;
    }
    onSelectedRowIdsChange(rows.map((row) => row.id));
  };

  const openDetails = (rowId: string) => {
    if (detailMode === "inline") {
      setExpandedRowId((current) => (current === rowId ? "" : rowId));
      return;
    }
    const row = rows.find((item) => item.id === rowId) ?? null;
    if (detailMode === "window") {
      if (row) {
        onOpenDetailWindow?.(row);
      }
      return;
    }
    setExpandedRowId((current) => (current === rowId ? "" : rowId));
    if (row) {
      onOpenDetailWindow?.(row);
    }
  };

  const showInlineDetails = detailMode === "inline" || detailMode === "both";

  return (
    <section className={cn("diagnostic-console-archive-section", className)}>
      <div className="diagnostic-console-section-head">
        <div className="diagnostic-console-section-controls diagnostic-console-section-controls--archive">
          <div className="diagnostic-console-archive-actions">
            {hasSelectedRows ? (
              <span className="diagnostic-console-archive-selection-text">
                {labels.selectedCountText(selectedRowIds.length)}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="inline"
              disabled={!hasSelectedRows}
              onClick={() => onSelectedRowIdsChange([])}
            >
              {labels.clearSelected}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructiveGhost"
              disabled={!hasSelectedRows}
              onBlurCapture={buildBlurClearHandler(deleteSelectedKey)}
              onClick={() => {
                if (!hasSelectedRows) {
                  return;
                }
                if (isActionArmed(deleteSelectedKey)) {
                  clearArmedAction();
                  onDeleteRows(selectedRowIds);
                  return;
                }
                setArmedKey(deleteSelectedKey);
              }}
            >
              <AppIcon name="actionDelete" className="size-3.5" />
              {isActionArmed(deleteSelectedKey)
                ? confirmDeleteLabel
                : labels.deleteSelected}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructiveGhost"
              disabled={!canDeleteAll}
              onBlurCapture={buildBlurClearHandler(deleteAllKey)}
              onClick={() => {
                if (!canDeleteAll) {
                  return;
                }
                if (isActionArmed(deleteAllKey)) {
                  clearArmedAction();
                  onDeleteAll();
                  return;
                }
                setArmedKey(deleteAllKey);
              }}
            >
              <AppIcon name="actionDelete" className="size-3.5" />
              {isActionArmed(deleteAllKey)
                ? confirmDeleteLabel
                : labels.clearHistory}
            </Button>
          </div>
        </div>
        {statusAdornment}
      </div>

      <div className="diagnostic-console-table-wrap diagnostic-console-table-scroll diagnostic-console-archive-table-shell">
        <table className="diagnostic-console-table diagnostic-console-archive-table">
          <thead>
            <tr>
              <th className="diagnostic-console-table-select-cell">
                <Checkbox
                  className="diagnostic-console-table-checkbox"
                  checked={allSelected}
                  disabled={!rows.length}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
              </th>
              <th>{labels.columns.sessionAndTime}</th>
              <th>{labels.columns.symbolAndEnvironment}</th>
              <th>{labels.columns.timeframe}</th>
              <th>{labels.columns.trades}</th>
              <th>{labels.columns.totalReturnRate}</th>
              <th>{labels.columns.profitFactor}</th>
              <th>{labels.columns.details}</th>
              <th>{labels.columns.delete}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const rowSelected = selectedIdSet.has(row.id);
                const rowExpanded = expandedRowId === row.id;
                const canDeleteSelectedFromRow =
                  rowSelected && selectedRowIds.length > 1;
                const isEditingRow = editingRowId === row.id;
                const rowDeleteKey = `row:${row.id}`;
                const rowDeleteArmed = isActionArmed(rowDeleteKey);
                return (
                  <Fragment key={row.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <tr
                          className={cn(
                            "diagnostic-console-archive-row align-top",
                            rowSelected && "is-selected",
                          )}
                          onContextMenu={() => {
                            if (!rowSelected) {
                              onSelectedRowIdsChange([row.id]);
                            }
                          }}
                        >
                      <td className="diagnostic-console-table-select-cell">
                        <Checkbox
                          className="diagnostic-console-table-checkbox"
                          checked={rowSelected}
                          onChange={(event) =>
                            toggleRowSelection(row.id, event.target.checked)
                          }
                        />
                      </td>
                      <td>
                        <div className="diagnostic-console-stack-cell diagnostic-console-archive-session-cell">
                          {isEditingRow ? (
                            <Input
                              autoFocus
                              className="diagnostic-console-archive-rename-input"
                              value={editingRowName}
                              maxLength={INPUT_LIMITS.trainingProjectNameChars}
                              onContextMenu={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                onEditingRowNameChange?.(event.target.value)
                              }
                              onBlur={() => onSaveRenameRow?.()}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  onSaveRenameRow?.();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  onCancelRenameRow?.();
                                }
                              }}
                            />
                          ) : (
                            <strong>{row.projectName || row.sequenceText}</strong>
                          )}
                          <span>
                            {row.sequenceText} {middleDot} {row.createdAtText}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="diagnostic-console-stack-cell diagnostic-console-archive-symbol-cell">
                          <strong>{row.symbol}</strong>
                          <span className="diagnostic-console-archive-environment-label">
                            {row.environmentLabel}
                          </span>
                          {row.environmentMetaText ? (
                            <span className="diagnostic-console-archive-meta-text">
                              {row.environmentMetaText}
                            </span>
                          ) : null}
                          {row.rowBadges.length ? (
                            <div
                              className="diagnostic-console-archive-tags"
                              aria-label={labels.ruleBadgesTitle}
                            >
                              {row.rowBadges.map((badge, index) => (
                                <Fragment key={`${row.id}-${badge.id}`}>
                                  {index > 0 ? (
                                    <span className="diagnostic-console-archive-tag-separator">
                                      {middleDot}
                                    </span>
                                  ) : null}
                                  <span
                                    className={cn(
                                      "diagnostic-console-archive-tag-text",
                                      badge.tone === "destructive" &&
                                        "diagnostic-console-archive-tag-text-danger",
                                      badge.tone === "secondary" &&
                                        "diagnostic-console-archive-tag-text-accent",
                                    )}
                                  >
                                    {badge.label}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className="diagnostic-console-table-metric diagnostic-console-archive-meta-metric">
                          {row.timeframeText}
                        </span>
                      </td>
                      <td>
                        <span className="diagnostic-console-table-metric diagnostic-console-archive-meta-metric">
                          {row.tradeCountText}
                        </span>
                      </td>
                      <td>
                        <strong
                          className={`diagnostic-console-archive-return tone-${row.returnTone}`}
                        >
                          {row.returnRateText}
                        </strong>
                      </td>
                      <td>
                        <span className="diagnostic-console-table-metric diagnostic-console-archive-profit-factor">
                          {row.profitFactorText}
                        </span>
                      </td>
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant="inline"
                          className="diagnostic-console-row-action"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetails(row.id);
                          }}
                        >
                          {labels.detailAction}
                          <AppIcon
                            name="actionArrowRight"
                            className="size-3.5"
                          />
                        </Button>
                      </td>
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructiveInline"
                          className="diagnostic-console-row-delete"
                          onBlurCapture={buildBlurClearHandler(rowDeleteKey)}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (rowDeleteArmed) {
                              clearArmedAction();
                              onDeleteRows([row.id]);
                              return;
                            }
                            setArmedKey(rowDeleteKey);
                          }}
                        >
                          <AppIcon name="actionDelete" className="size-3.5" />
                          {rowDeleteArmed
                            ? confirmDeleteLabel
                            : labels.columns.delete}
                        </Button>
                      </td>
                        </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent
                        className="diagnostic-console-archive-row-menu"
                        onCloseAutoFocus={(event) => {
                          event.preventDefault();
                        }}
                      >
                        <ContextMenuItem onSelect={() => openDetails(row.id)}>
                          {labels.detailAction}
                        </ContextMenuItem>
                        {onStartRenameRow ? (
                          <ContextMenuItem
                            onSelect={() => onStartRenameRow(row.id)}
                          >
                            {t("appText.rename")}
                          </ContextMenuItem>
                        ) : null}
                        <ContextMenuSeparator />
                        {canDeleteSelectedFromRow ? (
                          <ContextMenuItem
                            className="is-danger"
                            onSelect={() => {
                              setArmedKey(deleteSelectedKey);
                            }}
                          >
                            {labels.deleteSelected}
                          </ContextMenuItem>
                        ) : null}
                        <ContextMenuItem
                          className="is-danger"
                          onSelect={() => {
                            onSelectedRowIdsChange([row.id]);
                            setArmedKey(`row:${row.id}`);
                          }}
                        >
                          {labels.columns.delete}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>

                    {showInlineDetails && rowExpanded ? (
                      <tr>
                        <td className="p-4" colSpan={9}>
                          <ReplayReviewArchiveDetailBody
                            row={row}
                            labels={labels}
                            detailPreview={renderDetailPreview?.(row)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td
                  className="diagnostic-console-table-empty-cell"
                  colSpan={9}
                >
                  {labels.emptyState}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canLoadMore ? (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="inline"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? loadingLabel : loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
};
