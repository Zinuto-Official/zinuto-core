// SPDX-License-Identifier: GPL-3.0-only

import { useShallowStableObject } from '@/workspaces/useShallowStableObject';
import type { NotesPageProps } from '@/workspaces/notes/NotesPage';

type UseNotesWorkspacePagePropsArgs = NotesPageProps;

export const useNotesWorkspacePageProps = (
  args: UseNotesWorkspacePagePropsArgs,
): NotesPageProps => useShallowStableObject(args);
