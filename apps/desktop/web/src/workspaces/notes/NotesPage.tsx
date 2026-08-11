// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/notes.css";

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import { memo, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/ui/primitives/context-menu";
import { SearchInput } from "@/ui/primitives/search-input";
import { useArmedAction } from "@/ui/hooks/useArmedAction";
import { tt, type AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { AppIcon, VendorIcon } from "@/assets/graphics";
import {
  NotesDetailPanel,
  PageSidebarLayout,
  WorkspaceFrameShell,
  WorkspacePageShell,
  WorkspaceTopBar,
} from "@/ui/components";
import { PlainTabBar } from "@/ui/components/PlainTabBar";
import { toMarketDateParts } from "@zinuto/shared/marketTime";
import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import ReplayNoteEditor from "@/workspaces/notes/ReplayNoteEditor";
import { NoteColorToggleRow, NotesColorDot } from "@/workspaces/notes/NotesPagePrimitives";
import type { NotesPageScopeFilter } from "@/workspaces/notes/useNotesPageController";
import { isReplaySnapshotNoteType } from "@/workspaces/notes/useReplayNotes";
import { buildReplayNotePresentation } from "@/workspaces/notes/notePresentation";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import { useNotesWorkspaceReadModelFacts } from "@/domains/notes/notesWorkspaceReadModelFacts";
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";

export type NotesPageNote = ReplayNote;

export type NotesTrainingNoteSnapshotRenderOptions = {
  chartBodyVisible?: boolean;
  toolbarLeadingContent?: ReactNode;
};

export type NotesPageProps = {
  isActive?: boolean;
  language: AppUiLanguage;
  defaultReplayNoteTitle: string;
  initialComposeNoteId?: string | null;
  replayNotesKeyword: string;
  onReplayNotesKeywordChange: (keyword: string) => void;
  activeScopeFilter: NotesPageScopeFilter;
  onSelectActiveScopeFilter: (scope: NotesPageScopeFilter) => void;
  selectedColorTokens: ReplayNoteColorToken[];
  onSelectColorTokens: (tokens: ReplayNoteColorToken[]) => void;
  collectionNotes: NotesPageNote[];
  collectionTotal: number;
  collectionNextCursor: string | null;
  isCollectionLoading: boolean;
  isCollectionLoadingMore: boolean;
  onLoadMoreCollectionNotes: () => void;
  selectedReplayNote: NotesPageNote | null;
  onSelectReplayNoteId: (noteId: string) => void;
  onRequestReplayNoteDelete: (noteId: string, noteTitle: string) => void;
  onCreateCustomReplayNote: () => Promise<string | null>;
  onUpdateReplayNoteTitle: (noteId: string, title: string) => void;
  onCommitReplayNoteTitle: (noteId: string, title: string) => void;
  onUpdateReplayNoteColorTokens: (
    noteId: string,
    colorTokens: ReplayNoteColorToken[],
  ) => void;
  renderTrainingNoteSnapshot: (
    noteId: string,
    options?: NotesTrainingNoteSnapshotRenderOptions,
  ) => ReactNode;
  onUpdateReplayNoteContent: (
    noteId: string,
    document: ReplayNoteDocumentV1,
    attachments?: ReplayNoteAttachmentV1[],
  ) => void;
  formatReplayNoteTime: (isoText: string) => string;
  formatMoney: (value: number, fractionDigits?: number) => string;
};

const NOTE_SCOPE_ITEMS: Array<{ key: NotesPageScopeFilter; labelKey: AppTextKey }> = [
  { key: "ALL", labelKey: "appText.notesScopeAll" },
  { key: "FREE_REPLAY", labelKey: "appText.notesScopeTraining" },
  { key: "CHALLENGE", labelKey: "appText.notesScopeSpecial" },
  { key: "CUSTOM", labelKey: "appText.notesScopeCustom" },
];

const formatNoteDate = (isoText: string): string => {
  const parts = toMarketDateParts(isoText);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : isoText.slice(0, 10);
};

const resolveDeleteNoteActionKey = (noteId: string): string => `note:${noteId}`;

const NotesDetailLoadingBlock = ({ className }: { className?: string }) => (
  <div
    className={`notes-detail-loading-block ${className ?? ""}`.trim()}
    aria-hidden="true"
  />
);

const NotesDetailLoadingStatus = ({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) => (
  <div className="notes-detail-loading-status">
    <VendorIcon name="loaderCircle" className="size-4 animate-spin" />
    <div className="notes-detail-loading-status-copy">
      <strong>{heading}</strong>
      <span>{body}</span>
    </div>
  </div>
);

const NotesEditorLoadingState = ({
  heading,
  body,
  showStatus = true,
}: {
  heading: string;
  body: string;
  showStatus?: boolean;
}) => {
  const accessibilityProps = showStatus
    ? ({
        role: "status",
        "aria-live": "polite",
      } as const)
    : {};
  return (
    <section
      className="notes-detail-loading-shell notes-detail-loading-shell--editor"
      {...accessibilityProps}
    >
      <div className="notes-detail-loading-editor-copy" aria-hidden="true">
        <NotesDetailLoadingBlock className="is-title" />
        <NotesDetailLoadingBlock className="is-body" />
        <NotesDetailLoadingBlock className="is-body" />
        <NotesDetailLoadingBlock className="is-body is-medium" />
        <NotesDetailLoadingBlock className="is-body is-short" />
        <NotesDetailLoadingBlock className="is-body" />
      </div>
      {showStatus ? (
        <NotesDetailLoadingStatus heading={heading} body={body} />
      ) : null}
    </section>
  );
};

const NoteColorDots = ({ tokens }: { tokens?: ReplayNoteColorToken[] }) => {
  const safeTokens = Array.isArray(tokens) ? tokens : [];
  if (!safeTokens.length) {
    return <span className="notes-note-row-empty-colors" />;
  }
  return (
    <span className="notes-note-row-colors">
      {safeTokens.map((token) => (
        <NotesColorDot key={token} colorToken={token} />
      ))}
    </span>
  );
};

type NotesListRowProps = {
  note: NotesPageNote;
  active: boolean;
  language: AppUiLanguage;
  defaultReplayNoteTitle: string;
  onSelectReplayNoteId: (noteId: string) => void;
  onRequestReplayNoteDelete: (noteId: string, noteTitle: string) => void;
};

const NotesListRow = memo(
  ({
    note,
    active,
    language,
    defaultReplayNoteTitle,
    onSelectReplayNoteId,
    onRequestReplayNoteDelete,
  }: NotesListRowProps) => {
    const [isContextDeleteArmed, setIsContextDeleteArmed] = useState(false);
    const presentation = buildReplayNotePresentation({
      language,
      noteType: note.type,
      source: note.source,
      contextDisplayPeriod: note.contextDisplayPeriod,
      t: tt,
    });
    const subtitle = formatDotJoinedText(language, [
      presentation.descriptorLabel,
      formatNoteDate(note.updatedAt),
    ]);
    return (
      <ContextMenu
        onOpenChange={(open) => {
          if (!open) {
            setIsContextDeleteArmed(false);
          }
        }}
      >
        <ContextMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={`notes-note-row ${active ? "is-active" : ""}`}
            onClick={() => onSelectReplayNoteId(note.id)}
            onContextMenu={() => onSelectReplayNoteId(note.id)}
          >
            <span className="notes-note-row-main">
              <span className="notes-note-row-topline">
                <span className="notes-note-row-title">
                  {note.title || defaultReplayNoteTitle}
                </span>
                <NoteColorDots tokens={note.colorTokens} />
              </span>
              <span className="notes-note-row-subline">
                <span className="notes-note-row-subtitle">{subtitle}</span>
                <span className="notes-note-row-badge is-accent">
                  <span className="notes-note-row-badge-label">
                    {presentation.typeLabel}
                  </span>
                </span>
              </span>
            </span>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="is-danger"
            onSelect={(event) => {
              if (isContextDeleteArmed) {
                onRequestReplayNoteDelete(note.id, note.title);
                return;
              }
              event.preventDefault();
              setIsContextDeleteArmed(true);
            }}
          >
            {isContextDeleteArmed
              ? tt("appText.confirmDelete")
              : tt("appText.delete2")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);
NotesListRow.displayName = "NotesListRow";

export const NotesPage = ({
  isActive = true,
  language,
  defaultReplayNoteTitle,
  replayNotesKeyword,
  onReplayNotesKeywordChange,
  activeScopeFilter,
  onSelectActiveScopeFilter,
  selectedColorTokens,
  onSelectColorTokens,
  collectionNotes,
  collectionTotal,
  collectionNextCursor,
  isCollectionLoading,
  isCollectionLoadingMore,
  onLoadMoreCollectionNotes,
  selectedReplayNote,
  onSelectReplayNoteId,
  onRequestReplayNoteDelete,
  onCreateCustomReplayNote,
  onUpdateReplayNoteTitle,
  onCommitReplayNoteTitle,
  onUpdateReplayNoteColorTokens,
  renderTrainingNoteSnapshot,
  onUpdateReplayNoteContent,
  formatReplayNoteTime,
}: NotesPageProps) => {
  const {
    buildBlurClearHandler,
    clearArmedAction,
    isActionArmed,
    setArmedKey,
  } = useArmedAction<string>();
  const [collapsedChartNoteIds, setCollapsedChartNoteIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const scopeItems = useMemo(
    () =>
      NOTE_SCOPE_ITEMS.map((item) => ({
        key: item.key,
        label: tt(item.labelKey),
      })),
    [],
  );
  const notesReadModelRefreshKey = useMemo(
    () =>
      JSON.stringify({
        collectionTotal,
        collectionCount: collectionNotes.length,
        selectedNoteId: selectedReplayNote?.id ?? "",
        keyword: replayNotesKeyword.trim(),
        scope: activeScopeFilter,
        colorTokens: selectedColorTokens,
      }),
    [
      activeScopeFilter,
      collectionNotes.length,
      collectionTotal,
      replayNotesKeyword,
      selectedColorTokens,
      selectedReplayNote?.id,
    ],
  );
  const notesReadModelQuery = useMemo(
    () => ({
      keyword: replayNotesKeyword.trim() || undefined,
      scope: activeScopeFilter,
      colorTokens: selectedColorTokens,
    }),
    [activeScopeFilter, replayNotesKeyword, selectedColorTokens],
  );
  const notesReadModelFacts = useNotesWorkspaceReadModelFacts(
    isActive,
    notesReadModelRefreshKey,
    notesReadModelQuery,
  );
  const displayedCollectionTotal = notesReadModelFacts.totalNotes;
  const createNoteEnabled = notesReadModelFacts.cta.createNote.enabled;
  const shouldShowCollectionEmptyState =
    !collectionNotes.length &&
    !isCollectionLoading &&
    notesReadModelFacts.emptyState.statusCode === "EMPTY";
  const shouldShowLoadMoreCollection =
    Boolean(collectionNextCursor) &&
    notesReadModelFacts.cta.loadMore.enabled;

  const selectedPresentation = selectedReplayNote
    ? buildReplayNotePresentation({
        language,
        noteType: selectedReplayNote.type,
        source: selectedReplayNote.source,
        contextDisplayPeriod: selectedReplayNote.contextDisplayPeriod,
        t: tt,
      })
    : null;
  const selectedReplayNoteTitle =
    selectedReplayNote?.title || defaultReplayNoteTitle;
  const selectedReplayNoteHasSnapshotChart = Boolean(
    selectedReplayNote && isReplaySnapshotNoteType(selectedReplayNote.type),
  );
  const selectedReplayNoteChartExpanded = Boolean(
    selectedReplayNote &&
      selectedReplayNoteHasSnapshotChart &&
      !collapsedChartNoteIds.has(selectedReplayNote.id),
  );
  const isSelectedReplayNoteSnapshotLoading = Boolean(
    selectedReplayNote &&
      isReplaySnapshotNoteType(selectedReplayNote.type) &&
      !selectedReplayNote.contextExpiredAt &&
      selectedReplayNote.hasContextReplay &&
      !selectedReplayNote.contextReplay,
  );

  const handleCreateCustomReplayNote = async () => {
    if (!createNoteEnabled) {
      return;
    }
    const noteId = await onCreateCustomReplayNote();
    if (noteId) {
      onSelectReplayNoteId(noteId);
    }
  };

  const handleSelectedReplayNoteChartToggle = () => {
    if (!selectedReplayNote) {
      return;
    }
    const noteId = selectedReplayNote.id;
    setCollapsedChartNoteIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const handleSelectedReplayNoteDelete = () => {
    if (!selectedReplayNote) {
      return;
    }
    const deleteActionKey = resolveDeleteNoteActionKey(selectedReplayNote.id);
    if (isActionArmed(deleteActionKey)) {
      clearArmedAction();
      onRequestReplayNoteDelete(selectedReplayNote.id, selectedReplayNote.title);
      return;
    }
    setArmedKey(deleteActionKey);
  };

  return (
    <WorkspacePageShell
      template="split-detail"
      className="history-page notes-page notes-curation-page"
      bodyClassName="notes-page-body"
      header={
        <WorkspaceTopBar
          className="notes-topbar"
          rail={
            <div className="notes-topbar-content">
              <SearchInput
                className="notes-topbar-search"
                value={replayNotesKeyword}
                maxLength={INPUT_LIMITS.searchQueryChars}
                onChange={(event) => onReplayNotesKeywordChange(event.target.value)}
                placeholder={tt("appText.searchNotes")}
                aria-label={tt("appText.searchNotes")}
              />
              <div className="notes-topbar-filter-row">
                <PlainTabBar
                  className="notes-scope-filter-bar"
                  itemClassName="notes-scope-filter-item"
                  value={activeScopeFilter}
                  items={scopeItems}
                  onChange={onSelectActiveScopeFilter}
                  ariaLabel={tt("appText.matchingType")}
                />
                <div className="notes-inline-color-filter">
                  <NoteColorToggleRow
                    value={selectedColorTokens}
                    onChange={onSelectColorTokens}
                    ariaLabel={tt("appText.color")}
                  />
                </div>
              </div>
            </div>
          }
          tools={
            <Button
              type="button"
              variant="secondary"
              disabled={!createNoteEnabled}
              onClick={() => void handleCreateCustomReplayNote()}
            >
              <VendorIcon name="plus" />
              {tt("appText.addNote")}
            </Button>
          }
        />
      }
    >
      <WorkspaceFrameShell data-onboarding-target="TOOLS_NOTES">
        <PageSidebarLayout
          className="notes-curation-layout"
          divider="subtle"
          sidebar={
            <div className="notes-list-shell">
            <div className="notes-list-head">
              <span>{tt("appText.notes")}</span>
              <span>{displayedCollectionTotal}</span>
            </div>
            <div className="notes-list">
              {collectionNotes.map((note) => {
                const active = selectedReplayNote?.id === note.id;
                return (
                  <NotesListRow
                    key={note.id}
                    note={note}
                    active={active}
                    language={language}
                    defaultReplayNoteTitle={defaultReplayNoteTitle}
                    onSelectReplayNoteId={onSelectReplayNoteId}
                    onRequestReplayNoteDelete={onRequestReplayNoteDelete}
                  />
                );
              })}
              {shouldShowCollectionEmptyState ? (
                <div className="notes-empty-state">{tt("appText.notesYet")}</div>
              ) : null}
              {shouldShowLoadMoreCollection ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isCollectionLoadingMore}
                  onClick={onLoadMoreCollectionNotes}
                >
                  {isCollectionLoadingMore ? tt("appText.loading") : tt("appText.loadMore")}
                </Button>
              ) : null}
            </div>
            </div>
          }
          content={
            selectedReplayNote ? (
              <NotesDetailPanel
                className="notes-preview-panel"
                headerHidden
                chartPreview={
                  selectedReplayNoteHasSnapshotChart
                    ? renderTrainingNoteSnapshot(selectedReplayNote.id, {
                        chartBodyVisible: selectedReplayNoteChartExpanded,
                        toolbarLeadingContent: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="notes-market-chart-eye-button"
                            aria-label={
                              selectedReplayNoteChartExpanded
                                ? tt("appText.closeMarketChart")
                                : tt("appText.expandMarketChart")
                            }
                            title={
                              selectedReplayNoteChartExpanded
                                ? tt("appText.closeMarketChart")
                                : tt("appText.expandMarketChart")
                            }
                            aria-pressed={selectedReplayNoteChartExpanded}
                            onClick={handleSelectedReplayNoteChartToggle}
                          >
                            <VendorIcon
                              name={
                                selectedReplayNoteChartExpanded
                                  ? "eye"
                                  : "eyeOff"
                              }
                              className="size-3.5"
                            />
                          </Button>
                        ),
                      })
                    : null
                }
              >
                <div className="notes-detail-stack is-compose-mode">
                  <div className="notes-detail-title-wrap">
                    <div className="notes-detail-title-text">
                      <Input
                        className="notes-title-inline-input"
                        value={selectedReplayNote.title}
                        placeholder={defaultReplayNoteTitle}
                        maxLength={INPUT_LIMITS.noteTitleChars}
                        onChange={(event) =>
                          onUpdateReplayNoteTitle(
                            selectedReplayNote.id,
                            event.target.value,
                          )
                        }
                        onBlur={(event) =>
                          onCommitReplayNoteTitle(
                            selectedReplayNote.id,
                            event.currentTarget.value,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <div className="notes-editor-meta-row">
                        {formatDotJoinedText(language, [
                          selectedPresentation?.typeLabel,
                          selectedPresentation?.descriptorLabel,
                          formatReplayNoteTime(selectedReplayNote.updatedAt),
                        ])}
                      </div>
                    </div>
                    <div className="notes-detail-toolbar">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`notes-detail-toolbar-btn danger ${
                          isActionArmed(
                            resolveDeleteNoteActionKey(selectedReplayNote.id),
                          )
                            ? "is-armed"
                            : ""
                        }`}
                        onBlurCapture={buildBlurClearHandler(
                          resolveDeleteNoteActionKey(selectedReplayNote.id),
                        )}
                        onClick={handleSelectedReplayNoteDelete}
                      >
                        <AppIcon name="actionDelete" className="size-3.5" />
                        {isActionArmed(
                          resolveDeleteNoteActionKey(selectedReplayNote.id),
                        )
                          ? tt("appText.confirmDelete")
                          : tt("appText.delete2")}
                      </Button>
                    </div>
                  </div>
                  {selectedReplayNote.contentLoaded ? (
                    <ReplayNoteEditor
                      key={`${selectedReplayNote.id}-detail`}
                      noteId={selectedReplayNote.id}
                      initialDocument={selectedReplayNote.contentDocument}
                      attachments={selectedReplayNote.attachments ?? []}
                      language={language}
                      onContentDocumentChange={onUpdateReplayNoteContent}
                      className="replay-note-editor-host"
                      toolbarEndContent={
                        <NoteColorToggleRow
                          value={selectedReplayNote.colorTokens ?? []}
                          onChange={(tokens) =>
                            onUpdateReplayNoteColorTokens(
                              selectedReplayNote.id,
                              tokens,
                            )
                          }
                          ariaLabel={tt("appText.color")}
                        />
                      }
                    />
                  ) : (
                    <NotesEditorLoadingState
                      heading={tt("appText.noteContentLoading")}
                      body={selectedReplayNoteTitle}
                      showStatus={!isSelectedReplayNoteSnapshotLoading}
                    />
                  )}
                </div>
              </NotesDetailPanel>
            ) : (
              isCollectionLoading ? (
                <NotesDetailPanel className="notes-preview-panel" headerHidden>
                  <div className="notes-detail-stack is-compose-mode">
                    <NotesEditorLoadingState
                      heading={tt("appText.loadingNotes")}
                      body={tt("appText.notes")}
                    />
                  </div>
                </NotesDetailPanel>
              ) : (
                <div className="notes-empty-state notes-detail-empty-state">
                  {tt("appText.createSelectNoteLeft")}
                </div>
              )
            )
          }
        />
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};

export default NotesPage;
