// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopSecondaryWindowKind } from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";

export type DesktopSecondaryWindowFocusTarget = {
  show: () => Promise<void>;
  unminimize: () => Promise<void>;
  setFocus: () => Promise<void>;
};

type FocusRuntimeDependencies = {
  getWindowByKind: (
    kind: DesktopSecondaryWindowKind,
  ) => Promise<DesktopSecondaryWindowFocusTarget | null>;
  getRevision: (kind: DesktopSecondaryWindowKind) => number | null;
};

const CONTENT_FIRST_VISIBILITY_DEADLINE_MS = 10_500;
const FOCUS_RETRY_WINDOW_MS = 2_000;
const FOCUS_RETRY_INTERVAL_MS = 160;
const FOCUS_OPERATION_DEADLINE_MS = 800;

const focusWindow = async (
  windowRef: DesktopSecondaryWindowFocusTarget,
): Promise<boolean> => {
  const didShow = await windowRef.show().then(
    () => true,
    () => false,
  );
  await windowRef.unminimize().catch(() => undefined);
  const didFocus = await windowRef.setFocus().then(
    () => true,
    () => false,
  );
  return didShow && didFocus;
};

const settleFocusWithinDeadline = (
  task: Promise<boolean>,
  onLateSuccess: () => void,
): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(false);
    }, FOCUS_OPERATION_DEADLINE_MS);
    task.then(
      (didFocus) => {
        if (settled) {
          if (didFocus) {
            onLateSuccess();
          }
          return;
        }
        settled = true;
        window.clearTimeout(timerId);
        resolve(didFocus);
      },
      () => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timerId);
        resolve(false);
      },
    );
  });

export const createDesktopSecondaryWindowFocusRuntime = ({
  getWindowByKind,
  getRevision,
}: FocusRuntimeDependencies) => {
  const pendingKinds = new Set<DesktopSecondaryWindowKind>();
  const visibilityDeadlineIds = new Map<DesktopSecondaryWindowKind, number>();
  const retryIds = new Map<DesktopSecondaryWindowKind, number>();
  const retryDeadlineAt = new Map<DesktopSecondaryWindowKind, number>();
  const attemptsInFlight = new Set<DesktopSecondaryWindowKind>();
  const ownerCenterTasks = new Map<DesktopSecondaryWindowKind, Promise<void>>();

  const clearVisibilityDeadline = (kind: DesktopSecondaryWindowKind): void => {
    const timerId = visibilityDeadlineIds.get(kind);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      visibilityDeadlineIds.delete(kind);
    }
  };

  const clearRetry = (kind: DesktopSecondaryWindowKind): void => {
    const timerId = retryIds.get(kind);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      retryIds.delete(kind);
    }
    retryDeadlineAt.delete(kind);
  };

  const clearPending = (kind: DesktopSecondaryWindowKind): void => {
    pendingKinds.delete(kind);
    clearVisibilityDeadline(kind);
    clearRetry(kind);
  };

  const focusByKind = async (
    kind: DesktopSecondaryWindowKind,
  ): Promise<boolean> => {
    try {
      const existingWindow = await getWindowByKind(kind);
      if (existingWindow) {
        return focusWindow(existingWindow);
      }
    } catch {
      // The bounded pending-focus retry owns transient native failures.
    }
    return false;
  };

  const scheduleRetry = (kind: DesktopSecondaryWindowKind): void => {
    if (!pendingKinds.has(kind) || retryIds.has(kind)) {
      return;
    }
    const now = Date.now();
    const deadlineAt = retryDeadlineAt.get(kind) ?? now + FOCUS_RETRY_WINDOW_MS;
    retryDeadlineAt.set(kind, deadlineAt);
    if (now >= deadlineAt) {
      retryDeadlineAt.delete(kind);
      console.warn("[desktop-secondary-window] bounded focus retry exhausted", {
        kind,
      });
      return;
    }
    const timerId = window.setTimeout(
      () => {
        retryIds.delete(kind);
        void focusPending(kind);
      },
      Math.min(FOCUS_RETRY_INTERVAL_MS, deadlineAt - now),
    );
    retryIds.set(kind, timerId);
  };

  const focusPending = async (
    kind: DesktopSecondaryWindowKind,
  ): Promise<void> => {
    if (!pendingKinds.has(kind) || attemptsInFlight.has(kind)) {
      return;
    }
    attemptsInFlight.add(kind);
    try {
      await ownerCenterTasks.get(kind)?.catch(() => undefined);
      if (!pendingKinds.has(kind)) {
        return;
      }
      const didFocus = await settleFocusWithinDeadline(focusByKind(kind), () =>
        clearPending(kind),
      );
      if (didFocus) {
        clearPending(kind);
        return;
      }
      scheduleRetry(kind);
    } finally {
      attemptsInFlight.delete(kind);
    }
  };

  const scheduleContentFirstVisibilityDeadline = (
    kind: DesktopSecondaryWindowKind,
    expectedRevision: number,
  ): void => {
    clearVisibilityDeadline(kind);
    const timerId = window.setTimeout(() => {
      visibilityDeadlineIds.delete(kind);
      if (!pendingKinds.has(kind)) {
        return;
      }
      const currentRevision = getRevision(kind);
      if (currentRevision !== expectedRevision) {
        if (currentRevision !== null) {
          scheduleContentFirstVisibilityDeadline(kind, currentRevision);
        }
        return;
      }
      console.warn(
        "[desktop-secondary-window] content readiness deadline exceeded; showing recovery surface",
        { kind },
      );
      void focusPending(kind);
    }, CONTENT_FIRST_VISIBILITY_DEADLINE_MS);
    visibilityDeadlineIds.set(kind, timerId);
  };

  const trackOwnerCenterTask = (
    kind: DesktopSecondaryWindowKind,
    task: Promise<void>,
  ): void => {
    ownerCenterTasks.set(kind, task);
    void task.finally(() => {
      if (ownerCenterTasks.get(kind) === task) {
        ownerCenterTasks.delete(kind);
      }
    });
  };

  const dispose = (): void => {
    visibilityDeadlineIds.forEach((timerId) => window.clearTimeout(timerId));
    visibilityDeadlineIds.clear();
    retryIds.forEach((timerId) => window.clearTimeout(timerId));
    retryIds.clear();
    retryDeadlineAt.clear();
    attemptsInFlight.clear();
    ownerCenterTasks.clear();
  };

  return {
    clearPending,
    deleteOwnerCenterTask: (kind: DesktopSecondaryWindowKind): void => {
      ownerCenterTasks.delete(kind);
    },
    dispose,
    focusByKind,
    focusPending,
    focusWindow,
    hasPending: (kind: DesktopSecondaryWindowKind): boolean =>
      pendingKinds.has(kind),
    markPending: (kind: DesktopSecondaryWindowKind): void => {
      pendingKinds.add(kind);
    },
    scheduleContentFirstVisibilityDeadline,
    scheduleRetry,
    settleFocusWithinDeadline,
    trackOwnerCenterTask,
  };
};
