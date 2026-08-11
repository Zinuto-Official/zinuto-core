// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import { useCallback, useMemo } from 'react';
import type { AppTrainingRecordNoteModalProps } from '@/app-shell/AppTrainingRecordNoteModal';
import { formatMarketDateByLocale, toMarketDateParts } from '@zinuto/shared/marketTime';

type UseAppTrainingRecordNoteModalPropsArgs = {
  note: ReplayNote | null;
  language: AppTrainingRecordNoteModalProps['language'];
  defaultTitle: string;
  loadingLabel: string;
  completeLabel: string;
  cancelLabel: string;
  deleteLabel: string;
  createdAtLabel: string;
  colorLabel: string;
  isNewlyCreatedAtLocation: boolean;
  withLabelValue: (label: string, value: string) => string;
  onCompleteClose: () => void;
  onCancelNewlyCreatedNote: () => void;
  onRequestDelete: (noteId: string, noteTitle: string) => void;
  onTitleChange: AppTrainingRecordNoteModalProps['onTitleChange'];
  onTitleBlur: AppTrainingRecordNoteModalProps['onTitleBlur'];
  onContentDocumentChange: AppTrainingRecordNoteModalProps['onContentDocumentChange'];
  onColorTokensChange: AppTrainingRecordNoteModalProps['onColorTokensChange'];
  renderSnapshot: AppTrainingRecordNoteModalProps['renderSnapshot'];
};

export const useAppTrainingRecordNoteModalProps = ({
  note,
  language,
  defaultTitle,
  loadingLabel,
  completeLabel,
  cancelLabel,
  deleteLabel,
  createdAtLabel,
  colorLabel,
  isNewlyCreatedAtLocation,
  withLabelValue,
  onCompleteClose,
  onCancelNewlyCreatedNote,
  onRequestDelete,
  onTitleChange,
  onTitleBlur,
  onContentDocumentChange,
  onColorTokensChange,
  renderSnapshot,
}: UseAppTrainingRecordNoteModalPropsArgs): AppTrainingRecordNoteModalProps => {
  const formatTrainingNoteMetaTime = useCallback(
    (isoText: string) => {
      const dateParts = toMarketDateParts(isoText);
      const nowParts = toMarketDateParts(Date.now());
      if (!dateParts || !nowParts) {
        return '';
      }
      const isSameDay =
        dateParts.year === nowParts.year &&
        dateParts.month === nowParts.month &&
        dateParts.day === nowParts.day;
      if (isSameDay) {
        return (
          formatMarketDateByLocale(isoText, language, { hour: '2-digit', minute: '2-digit', hour12: false }) ||
          ''
        );
      }
      return formatMarketDateByLocale(isoText, language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    },
    [language]
  );

  const createdMetaText = useMemo(() => {
    if (!note) {
      return '';
    }
    return withLabelValue(createdAtLabel, formatTrainingNoteMetaTime(note.createdAt));
  }, [note, withLabelValue, createdAtLabel, formatTrainingNoteMetaTime]);

  const modalNote = useMemo(() => {
    if (!note) {
      return null;
    }
    const rawChips = Array.isArray(note.contextReplay?.noteSummary?.chips)
      ? note.contextReplay.noteSummary.chips
      : [];
    const summaryChips: ReplayContextSummaryChip[] = [];
    rawChips.forEach((chip) => {
      const label = String(chip?.label || '').trim();
      const value = String(chip?.value || '').trim();
      if (!label || !value) {
        return;
      }
      summaryChips.push({
        label,
        value,
        tone: chip?.tone,
      });
    });
    return {
      id: note.id,
      title: note.title,
      contentDocument: note.contentDocument,
      attachments: note.attachments ?? [],
      colorTokens: note.colorTokens ?? [],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      summaryChips,
    };
  }, [note]);

  const onComplete = useCallback(() => {
    onCompleteClose();
  }, [onCompleteClose]);

  const onCancel = useCallback(() => {
    if (isNewlyCreatedAtLocation) {
      onCancelNewlyCreatedNote();
      return;
    }
    onCompleteClose();
  }, [isNewlyCreatedAtLocation, onCancelNewlyCreatedNote, onCompleteClose]);

  const onRequestDeleteCurrentNote = useCallback(() => {
    if (!note) {
      return;
    }
    const noteTitle = String(note.title || '').trim() || defaultTitle;
    onRequestDelete(note.id, noteTitle);
  }, [defaultTitle, note, onRequestDelete]);

  return useMemo(
    () => ({
      note: modalNote,
      language,
      defaultTitle,
      createdMetaText,
      isNewlyCreatedAtLocation,
      colorLabel,
      loadingLabel,
      completeLabel,
      cancelLabel,
      deleteLabel,
      onClose: onCancel,
      onComplete,
      onCancel,
      onRequestDelete: onRequestDeleteCurrentNote,
      onTitleChange,
      onTitleBlur,
      onContentDocumentChange,
      onColorTokensChange,
      renderSnapshot,
    }),
    [
      modalNote,
      language,
      defaultTitle,
      createdMetaText,
      isNewlyCreatedAtLocation,
      colorLabel,
      loadingLabel,
      completeLabel,
      cancelLabel,
      deleteLabel,
      onComplete,
      onCancel,
      onRequestDeleteCurrentNote,
      onTitleChange,
      onTitleBlur,
      onContentDocumentChange,
      onColorTokensChange,
      renderSnapshot,
    ]
  );
};
