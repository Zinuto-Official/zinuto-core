// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState, type ReactNode } from "react";
import { AppRootBootShell } from "@/app-shell/AppRootBootShell";
import {
  STARTUP_EXIT_DURATION_MS,
  isStartupMotionReduced,
  readStartupNowMs,
  readStartupSurfaceVisibleAtMs,
  resolveStartupExitSchedule,
  subscribeStartupSurfaceVisible,
} from "@/app-shell/boot/startupPresentation";

type StartupOverlayPhase = "visible" | "exiting" | "hidden";

export const StartupExitOverlay = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<StartupOverlayPhase>("visible");

  useEffect(() => {
    let disposed = false;
    let scheduled = false;
    let exitTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let hiddenTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let unsubscribe: () => void = () => undefined;
    const readyAtMs = readStartupNowMs();

    const clearTimer = (
      timer: ReturnType<typeof globalThis.setTimeout> | null,
    ) => {
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
    };

    const scheduleExit = (visibleAtMs: number) => {
      if (scheduled || disposed) {
        return;
      }
      scheduled = true;
      unsubscribe();

      const exitDurationMs = isStartupMotionReduced()
        ? 0
        : STARTUP_EXIT_DURATION_MS;
      const schedule = resolveStartupExitSchedule({
        exitDurationMs,
        readyAtMs,
        visibleAtMs,
      });
      const exitDelayMs = Math.max(0, schedule.exitAtMs - readStartupNowMs());

      const beginExit = () => {
        if (disposed) {
          return;
        }
        if (exitDurationMs === 0) {
          setPhase("hidden");
          return;
        }
        setPhase("exiting");
        hiddenTimer = globalThis.setTimeout(() => {
          if (!disposed) {
            setPhase("hidden");
          }
        }, exitDurationMs);
      };

      if (exitDelayMs === 0) {
        beginExit();
      } else {
        exitTimer = globalThis.setTimeout(beginExit, exitDelayMs);
      }
    };

    const visibleAtMs = readStartupSurfaceVisibleAtMs();
    if (visibleAtMs !== null) {
      scheduleExit(visibleAtMs);
    } else {
      unsubscribe = subscribeStartupSurfaceVisible(scheduleExit);
    }

    return () => {
      disposed = true;
      unsubscribe();
      clearTimer(exitTimer);
      clearTimer(hiddenTimer);
    };
  }, []);

  return (
    <>
      {children}
      {phase !== "hidden" ? (
        <AppRootBootShell
          presentationMode="overlay"
          presentationPhase={phase}
        />
      ) : null}
    </>
  );
};
