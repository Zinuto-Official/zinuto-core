// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import { useArmedAction } from "@/ui/hooks/useArmedAction";
import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { cn } from "@/ui/cn";
import ReplayNoteEditor from "@/workspaces/notes/ReplayNoteEditor";
import { NoteColorToggleRow } from "@/workspaces/notes/NotesPagePrimitives";
import type { ReplayNoteType } from "@/workspaces/notes/replayNoteTypes";

export type ReplayNoteEditorWindowNote = {
  id: string;
  type: ReplayNoteType;
  title: string;
  contentDocument: ReplayNoteDocumentV1;
  attachments?: ReplayNoteAttachmentV1[];
  createdAt: string;
  updatedAt: string;
  colorTokens?: ReplayNoteColorToken[];
  summaryChips?: ReplayContextSummaryChip[];
};

export type ReplayNoteEditorSnapshotPayload =
  | {
      kind: "CHART";
      project: HistoryReplayChartViewProps["project"];
      trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
      initialDisplayPeriod?: DisplayPeriodKey;
      chartRenderMode?: ChartRenderMode;
      hideLastPriceLine?: boolean;
    }
  | {
      kind: "LOADING";
      label: string;
      body?: string;
    }
  | {
      kind: "ERROR";
      label: string;
      retryLabel: string;
    }
  | {
      kind: "PLACEHOLDER";
      label: string;
    };

export type ReplayNoteEditorSecondaryPayload = {
  note: ReplayNoteEditorWindowNote;
  defaultTitle: string;
  createdMetaText: string;
  isNewlyCreatedAtLocation: boolean;
  colorLabel: string;
  completeLabel: string;
  cancelLabel: string;
  deleteLabel: string;
  snapshot: ReplayNoteEditorSnapshotPayload | null;
};

type ReplayNoteEditorWindowSurfaceProps = {
  note: ReplayNoteEditorWindowNote | null;
  language: AppUiLanguage;
  defaultTitle: string;
  createdMetaText: string;
  isNewlyCreatedAtLocation: boolean;
  colorLabel: string;
  completeLabel: string;
  cancelLabel: string;
  deleteLabel: string;
  snapshot?: ReactNode;
  className?: string;
  onComplete: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
  onTitleChange: (noteId: string, nextTitle: string) => void;
  onTitleBlur: (noteId: string, title: string) => void;
  onContentDocumentChange: (
    noteId: string,
    document: ReplayNoteDocumentV1,
    attachments?: ReplayNoteAttachmentV1[],
  ) => void;
  onColorTokensChange: (
    noteId: string,
    colorTokens: ReplayNoteColorToken[],
  ) => void;
};

export const ReplayNoteEditorWindowSurface = ({
  note,
  language,
  defaultTitle,
  createdMetaText,
  isNewlyCreatedAtLocation,
  colorLabel,
  completeLabel,
  cancelLabel,
  deleteLabel,
  snapshot = null,
  className,
  onComplete,
  onCancel,
  onRequestDelete,
  onTitleChange,
  onTitleBlur,
  onContentDocumentChange,
  onColorTokensChange,
}: ReplayNoteEditorWindowSurfaceProps) => {
  const deleteActionKey = "delete-note" as const;
  const { buildBlurClearHandler, clearArmedAction, isActionArmed, setArmedKey } =
    useArmedAction<typeof deleteActionKey>();
  const deleteArmed = isActionArmed(deleteActionKey);
  const hasSnapshot = Boolean(snapshot);

  return (
    <div className={cn("note-editor-modal-shell training-note-modal", className)}>
      {note ? (
        <>
          <div className="note-editor-modal-header flex flex-col gap-2">
            <div className="note-editor-modal-title text-left text-r5 text-text-primary">
              <Input
                className="notes-title-inline-input training-note-title-input training-note-title-head-input"
                value={note.title}
                placeholder={defaultTitle}
                maxLength={INPUT_LIMITS.noteTitleChars}
                onChange={(event) => onTitleChange(note.id, event.target.value)}
                onBlur={(event) =>
                  onTitleBlur(note.id, event.currentTarget.value)
                }
              />
            </div>
            <div className="note-editor-modal-meta mt-1 text-left text-r1 text-text-tertiary">
              <div className="training-note-editor-meta-block">
                {note.summaryChips?.length ? (
                  <div className="training-note-summary-chip-row">
                    {note.summaryChips.map((chip, index) => (
                      <span
                        key={`${chip.label}-${chip.value}-${index}`}
                        className={`training-note-summary-chip is-${chip.tone ?? "neutral"}`}
                      >
                        <strong>{chip.label}</strong>
                        <span>{chip.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="notes-editor-meta-row training-note-editor-meta-row">
                  <span>{createdMetaText}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="note-editor-modal-content">
            <div className="training-note-modal-body" data-autoshrink-ignore="true">
              <div className="training-note-modal-main">
                <div className="notes-editor-layout training-note-editor-layout">
                  <div
                    className={`notes-editor-body training-note-editor-body ${
                      hasSnapshot ? "has-training-snapshot" : "no-training-snapshot"
                    }`}
                  >
                    {hasSnapshot ? (
                      <div className="training-note-editor-snapshot-wrap">
                        {snapshot}
                      </div>
                    ) : null}
                    <div className="training-note-editor-wrap" data-no-modal-drag="true">
                      <ReplayNoteEditor
                        key={note.id}
                        noteId={note.id}
                        initialDocument={note.contentDocument}
                        attachments={note.attachments ?? []}
                        language={language}
                        onContentDocumentChange={onContentDocumentChange}
                        className="replay-note-editor-host training-note-editor-host"
                        toolbarEndContent={
                          <NoteColorToggleRow
                            value={note.colorTokens ?? []}
                            onChange={(tokens) =>
                              onColorTokensChange(note.id, tokens)
                            }
                            ariaLabel={colorLabel}
                          />
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="note-editor-modal-footer">
            <div className="training-note-modal-actions">
              <div
                className="training-note-modal-actions-left"
                onBlurCapture={buildBlurClearHandler(deleteActionKey)}
              >
                {isNewlyCreatedAtLocation ? (
                  <Button variant="ghost" onClick={onCancel}>
                    {cancelLabel}
                  </Button>
                ) : (
                  <Button
                    variant={deleteArmed ? "destructive" : "ghost"}
                    onClick={() => {
                      if (deleteArmed) {
                        clearArmedAction();
                        onRequestDelete();
                        return;
                      }
                      setArmedKey(deleteActionKey);
                    }}
                  >
                    {deleteLabel}
                  </Button>
                )}
              </div>
              <div className="training-note-modal-actions-right">
                <Button variant="secondary" onClick={onComplete}>
                  {completeLabel}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
