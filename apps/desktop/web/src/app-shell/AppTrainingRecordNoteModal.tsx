// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import ReplayNoteEditor from '@/workspaces/notes/ReplayNoteEditor';
import { NoteColorToggleRow } from '@/workspaces/notes/NotesPagePrimitives';
import { useArmedAction } from '@/ui/hooks/useArmedAction';
import { NoteEditorModal } from '@/ui/components';
import type { AppUiLanguage } from '@/ui/config/uiConfig';
import type { ReplayNoteColorToken } from '@zinuto/shared/replayNoteColors';
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';

type TrainingRecordNoteView = {
  id: string;
  title: string;
  contentDocument: ReplayNoteDocumentV1;
  attachments?: ReplayNoteAttachmentV1[];
  createdAt: string;
  updatedAt: string;
  colorTokens?: ReplayNoteColorToken[];
  summaryChips?: ReplayContextSummaryChip[];
};

export type AppTrainingRecordNoteModalProps = {
  note: TrainingRecordNoteView | null;
  language: AppUiLanguage;
  defaultTitle: string;
  createdMetaText: string;
  isNewlyCreatedAtLocation: boolean;
  colorLabel: string;
  loadingLabel: string;
  completeLabel: string;
  cancelLabel: string;
  deleteLabel: string;
  onClose: () => void;
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
  renderSnapshot: (noteId: string) => ReactNode;
};

export const AppTrainingRecordNoteModal = ({
  note,
  language,
  defaultTitle,
  createdMetaText,
  isNewlyCreatedAtLocation,
  colorLabel,
  completeLabel,
  cancelLabel,
  deleteLabel,
  onClose,
  onComplete,
  onCancel,
  onRequestDelete,
  onTitleChange,
  onTitleBlur,
  onContentDocumentChange,
  onColorTokensChange,
  renderSnapshot
}: AppTrainingRecordNoteModalProps) => {
  const deleteActionKey = 'delete-note' as const;
  const { buildBlurClearHandler, clearArmedAction, isActionArmed, setArmedKey } =
    useArmedAction<typeof deleteActionKey>();
  const deleteArmed = isActionArmed(deleteActionKey);

  return (
    <NoteEditorModal
      open={Boolean(note)}
      onClose={() => {
        clearArmedAction();
        onClose();
      }}
      className="training-note-modal"
      title={
        note ? (
          <Input
            className="notes-title-inline-input training-note-title-input training-note-title-head-input"
            value={note.title}
            placeholder={defaultTitle}
            maxLength={INPUT_LIMITS.noteTitleChars}
            onChange={(event) => onTitleChange(note.id, event.target.value)}
            onBlur={(event) => onTitleBlur(note.id, event.currentTarget.value)}
          />
        ) : (
          ''
        )
      }
      meta={
        note ? (
          <div className="training-note-editor-meta-block">
            {note.summaryChips?.length ? (
              <div className="training-note-summary-chip-row">
                {note.summaryChips.map((chip, index) => (
                  <span
                    key={`${chip.label}-${chip.value}-${index}`}
                    className={`training-note-summary-chip is-${chip.tone ?? 'neutral'}`}
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
        ) : null
      }
      chartPreview={null}
      footer={
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
      }
    >
      {note ? (
        <div className="training-note-modal-body" data-autoshrink-ignore="true">
          <div className="training-note-modal-main">
            <div className="notes-editor-layout training-note-editor-layout">
              <div className="notes-editor-body training-note-editor-body has-training-snapshot">
                <div className="training-note-editor-snapshot-wrap">{renderSnapshot(note.id)}</div>
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
      ) : null}
    </NoteEditorModal>
  );
};
