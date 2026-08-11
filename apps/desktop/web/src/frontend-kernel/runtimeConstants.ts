// SPDX-License-Identifier: GPL-3.0-only

import { frontendRuntimeLimits } from '@/frontend-kernel/runtimeLimits';

export const HISTORY_PROJECT_PAGE_SIZE = frontendRuntimeLimits.historyProjectPageSize;
export const REPLAY_NOTE_PAGE_SIZE = frontendRuntimeLimits.replayNotePageSize;
export const MAX_ARCHIVE_DRAWING_COUNT = frontendRuntimeLimits.maxArchiveDrawingCount;
export const MAX_ARCHIVE_TEXT_CHARS = frontendRuntimeLimits.maxArchiveTextChars;

export const LOCAL_POOL_CLEAR_PROGRESS_MIN_MS = 520;
export const LOCAL_POOL_IMPORT_PREVIEW_PROGRESS_MIN_MS = 420;
export const STORAGE_USAGE_REFRESH_MIN_MS = 420;
export const TRAINER_HOLD_SHORTCUT_REPEAT_DELAY_MS = 300;
export const TRAINER_HOLD_SHORTCUT_REPEAT_INTERVAL_MS = 350;

export const waitForDuration = async (ms: number): Promise<void> => {
  if (!(ms > 0)) {
    return;
  }
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

export const waitForNextAnimationFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
};

export const waitForPercentReach = async (getCurrent: () => number, target: number, timeoutMs = 2000): Promise<void> => {
  const normalizedTarget = Math.max(0, Math.min(100, Math.floor(Number(target) || 0)));
  const startAt = performance.now();
  while (getCurrent() < normalizedTarget) {
    if (performance.now() - startAt >= Math.max(0, timeoutMs)) {
      break;
    }
    // Keep UI responsive while waiting for 1% step progression.
    // eslint-disable-next-line no-await-in-loop
    await waitForDuration(20);
  }
};
