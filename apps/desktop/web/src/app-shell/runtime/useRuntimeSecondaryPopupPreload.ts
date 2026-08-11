// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from "react";
import { preloadDesktopSecondaryPopupRoute } from "@/app-shell/popups/popupRegistry";

export const useRuntimeSecondaryPopupPreload = () => {
  useEffect(() => {
    let cancelled = false;
    const stagedPreloadTimers: number[] = [];
    const scheduleStagedPreload = (
      delayMs: number,
      preload: () => void,
    ) => {
      const timerId = window.setTimeout(() => {
        if (!cancelled) {
          preload();
        }
      }, delayMs);
      stagedPreloadTimers.push(timerId);
    };
    const runPreload = () => {
      if (cancelled) {
        return;
      }
      scheduleStagedPreload(360, () => {
        void preloadDesktopSecondaryPopupRoute("FREE_REPLAY_REPLAY").catch(
          () => undefined,
        );
      });
      scheduleStagedPreload(900, () => {
        void preloadDesktopSecondaryPopupRoute("REPLAY_NOTE_EDITOR").catch(
          () => undefined,
        );
      });
    };
    const requestIdle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : null;
    const cancelIdle =
      typeof window.cancelIdleCallback === "function"
        ? window.cancelIdleCallback.bind(window)
        : null;
    if (requestIdle && cancelIdle) {
      const idleId = requestIdle(runPreload, { timeout: 3000 });
      return () => {
        cancelled = true;
        stagedPreloadTimers.forEach((timerId) => window.clearTimeout(timerId));
        cancelIdle(idleId);
      };
    }
    const timeoutId = window.setTimeout(runPreload, 1800);
    return () => {
      cancelled = true;
      stagedPreloadTimers.forEach((timerId) => window.clearTimeout(timerId));
      window.clearTimeout(timeoutId);
    };
  }, []);
};
