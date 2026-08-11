// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';
import { api } from '@/api';
import type { ApiTrainingProjectDetail } from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { TrainingProject } from '@/frontend-kernel/appTypes';
import { INPUT_LIMITS, trimAndLimitInputText } from '@zinuto/shared/input-limits';
import type { Dispatch, SetStateAction } from 'react';

type UseHistoryProjectCrudControllerArgs = {
  editingProjectId: string;
  editingProjectName: string;
  setEditingProjectId: Dispatch<SetStateAction<string>>;
  setEditingProjectName: Dispatch<SetStateAction<string>>;
  setTrainingProjects: Dispatch<SetStateAction<TrainingProject[]>>;
  setHistoryProjectsNextCursor: Dispatch<SetStateAction<string | null>>;
  mapApiTrainingProjectToLocal: (project: ApiTrainingProjectDetail) => TrainingProject;
  markHistoryProjectLoaded: (projectId: string) => void;
  unmarkHistoryProjectLoaded: (projectId: string) => void;
  clearLoadedHistoryProjectIds: () => void;
  upsertTrainingProjectInState: (project: TrainingProject) => void;
  onProjectsChanged?: (options: {
    reason: "rename" | "delete" | "clear";
    projectIds?: string[];
  }) => void | Promise<void>;
  setError: (message: string) => void;
  tt: (key: AppTextKey) => string;
};

export const useHistoryProjectCrudController = ({
  editingProjectId,
  editingProjectName,
  setEditingProjectId,
  setEditingProjectName,
  setTrainingProjects,
  setHistoryProjectsNextCursor,
  mapApiTrainingProjectToLocal,
  markHistoryProjectLoaded,
  unmarkHistoryProjectLoaded,
  clearLoadedHistoryProjectIds,
  upsertTrainingProjectInState,
  onProjectsChanged,
  setError,
  tt
}: UseHistoryProjectCrudControllerArgs) => {
  const startRenameTrainingProject = useCallback(
    (project: TrainingProject) => {
      setEditingProjectId(project.id);
      setEditingProjectName(project.name);
    },
    [setEditingProjectId, setEditingProjectName]
  );

  const cancelRenameTrainingProject = useCallback(() => {
    setEditingProjectId('');
    setEditingProjectName('');
  }, [setEditingProjectId, setEditingProjectName]);

  const saveRenameTrainingProject = useCallback(() => {
    if (!editingProjectId) {
      return;
    }
    const nextName = trimAndLimitInputText(
      editingProjectName,
      INPUT_LIMITS.trainingProjectNameChars
    );
    if (!nextName) {
      setEditingProjectId('');
      setEditingProjectName('');
      return;
    }
    const projectId = editingProjectId;
    setEditingProjectId('');
    setEditingProjectName('');
    void (async () => {
      try {
        const saved = mapApiTrainingProjectToLocal(await api.renameTrainingProject(projectId, nextName));
        markHistoryProjectLoaded(saved.id);
        upsertTrainingProjectInState(saved);
        await onProjectsChanged?.({
          reason: 'rename',
          projectIds: [saved.id],
        });
      } catch (err) {
        setError(tt('appText.renameHistoryTraining'));
      }
    })();
  }, [
    editingProjectId,
    editingProjectName,
    mapApiTrainingProjectToLocal,
    markHistoryProjectLoaded,
    onProjectsChanged,
    setEditingProjectId,
    setEditingProjectName,
    setError,
    tt,
    upsertTrainingProjectInState
  ]);

  const deleteTrainingProjects = useCallback(
    (projectIds: string[]) => {
      const normalizedProjectIds = Array.from(
        new Set(
          projectIds
            .map((projectId) => String(projectId ?? '').trim())
            .filter(Boolean)
        )
      );
      if (!normalizedProjectIds.length) {
        return;
      }
      void (async () => {
        try {
          await api.deleteTrainingProjects(normalizedProjectIds);
          const deletedIdSet = new Set(normalizedProjectIds);
          normalizedProjectIds.forEach((projectId) => {
            unmarkHistoryProjectLoaded(projectId);
          });
          setTrainingProjects((current) => current.filter((item) => !deletedIdSet.has(item.id)));
          if (editingProjectId && deletedIdSet.has(editingProjectId)) {
            setEditingProjectId('');
            setEditingProjectName('');
          }
          await onProjectsChanged?.({
            reason: 'delete',
            projectIds: normalizedProjectIds,
          });
        } catch (err) {
          setError(tt('appText.deleteHistoricalTraining'));
        }
      })();
    },
    [
      editingProjectId,
      setEditingProjectId,
      setEditingProjectName,
      setError,
      setTrainingProjects,
      tt,
      onProjectsChanged,
      unmarkHistoryProjectLoaded
    ]
  );

  const deleteTrainingProject = useCallback(
    (projectId: string) => {
      deleteTrainingProjects([projectId]);
    },
    [deleteTrainingProjects]
  );

  const clearAllTrainingProjects = useCallback(() => {
    void (async () => {
      try {
        await api.clearTrainingProjects();
        clearLoadedHistoryProjectIds();
        setTrainingProjects([]);
        setHistoryProjectsNextCursor(null);
        setEditingProjectId('');
        setEditingProjectName('');
        await onProjectsChanged?.({ reason: 'clear' });
      } catch (err) {
        setError(tt('appText.clearingHistoryTraining'));
      }
    })();
  }, [
    clearLoadedHistoryProjectIds,
    onProjectsChanged,
    setEditingProjectId,
    setEditingProjectName,
    setError,
    setHistoryProjectsNextCursor,
    setTrainingProjects,
    tt
  ]);

  return {
    startRenameTrainingProject,
    cancelRenameTrainingProject,
    saveRenameTrainingProject,
    deleteTrainingProject,
    deleteTrainingProjects,
    clearAllTrainingProjects
  };
};
