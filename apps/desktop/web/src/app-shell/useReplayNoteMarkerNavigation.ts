// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { isReplaySnapshotNoteType } from '@/workspaces/notes/useReplayNotes';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';

type ChartNoteHover = {
  title: string;
  pageX: number;
  pageY: number;
} | null;

type UseReplayNoteMarkerNavigationArgs = {
  replayNotes: ReplayNote[];
  setChartNoteHover: Dispatch<SetStateAction<ChartNoteHover>>;
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  setActivePage: Dispatch<SetStateAction<WorkspacePage>>;
};

export const useReplayNoteMarkerNavigation = ({
  replayNotes,
  setChartNoteHover,
  setSelectedReplayNoteId,
  setActiveTrainingRecordNoteId,
  setActivePage
}: UseReplayNoteMarkerNavigationArgs) =>
  useCallback(
    (noteId: string) => {
      if (!noteId) {
        return;
      }
      const target = replayNotes.find((item) => item.id === noteId) ?? null;
      if (!target) {
        return;
      }
      setChartNoteHover((current) => (current ? null : current));
      setSelectedReplayNoteId(noteId);
      if (isReplaySnapshotNoteType(target.type)) {
        setActiveTrainingRecordNoteId(noteId);
        return;
      }
      setActivePage('NOTES');
    },
    [replayNotes, setActivePage, setActiveTrainingRecordNoteId, setChartNoteHover, setSelectedReplayNoteId]
  );
