// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from "react";
import { api } from "@/api";
import {
  createEmptyAppPreferencesSnapshot,
  normalizeAppPreferences,
  readCachedAppPreferencesSnapshot,
  writeCachedAppPreferencesSnapshot,
  type NormalizedAppPreferences,
} from "@/app-shell/appPreferencesModel";
import { AppRootBootShell } from "@/app-shell/AppRootBootShell";
import { AppRootRuntime } from "@/app-shell/runtime/AppRootRuntime";
import { StartupExitOverlay } from "@/app-shell/boot/StartupExitOverlay";
import {
  establishRecoveredPreferencesPersistenceRebase,
  mergeRecoveredRuntimePreferences,
  resetRuntimePreferencesPersistenceRebase,
  resetRuntimePreferencesRecovery,
} from "@/app-shell/runtimePreferencesRecovery";

// Preferences improve the first rendered state, but they must never hold the
// complete product surface behind bridge/runtime recovery for tens of seconds.
const APP_ROOT_BOOT_PREFERENCES_TIMEOUT_MS = 2_000;
const APP_ROOT_BOOT_PREFERENCES_RETRY_DELAYS_MS = [0] as const;
const APP_ROOT_BOOT_PREFERENCES_RECOVERY_RETRY_MS = 5_000;

type AppRootBootState =
  | { phase: "pending" }
  | {
      phase: "ready";
      preferences: NormalizedAppPreferences;
      preferencesLoadedFromRuntime: boolean;
    };

const buildFallbackBootPreferences = (): NormalizedAppPreferences =>
  readCachedAppPreferencesSnapshot() ?? createEmptyAppPreferencesSnapshot();

const suppressRuntimeFallbackOnboardingAutoStart = (
  preferences: NormalizedAppPreferences,
): NormalizedAppPreferences => ({
  ...preferences,
  uiSettings: {
    ...preferences.uiSettings,
    onboardingTourStatus: "DEFERRED",
  },
});

const buildRuntimeFailureFallbackBootPreferences =
  (): NormalizedAppPreferences =>
    suppressRuntimeFallbackOnboardingAutoStart(buildFallbackBootPreferences());

const waitForBootRetryDelay = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    if (typeof timeout === "object") {
      timeout.unref?.();
    }
  });

const loadRuntimeBootPreferences =
  async (): Promise<NormalizedAppPreferences> => {
    const preferences = await api.getAppPreferences({
      timeoutMs: APP_ROOT_BOOT_PREFERENCES_TIMEOUT_MS,
    });
    const normalized = normalizeAppPreferences(preferences);
    writeCachedAppPreferencesSnapshot(normalized);
    return normalized;
  };

export const AppRootBootstrap = () => {
  const [bootState, setBootState] = useState<AppRootBootState>({
    phase: "pending",
  });

  useEffect(() => {
    let disposed = false;
    resetRuntimePreferencesPersistenceRebase();

    const recoverRuntimePreferences = async (): Promise<void> => {
      while (!disposed) {
        await waitForBootRetryDelay(APP_ROOT_BOOT_PREFERENCES_RECOVERY_RETRY_MS);
        if (disposed) {
          return;
        }
        try {
          const normalized = await loadRuntimeBootPreferences();
          if (disposed) {
            return;
          }
          const recoveredPreferences = mergeRecoveredRuntimePreferences(
            normalized,
          );
          writeCachedAppPreferencesSnapshot(
            recoveredPreferences.preferences,
          );
          const recoveryWrites: Promise<unknown>[] = [];
          if (recoveredPreferences.uiSettingsChanged) {
            recoveryWrites.push(
              api.updateAppUiSettings(
                recoveredPreferences.preferences.uiSettings as Record<
                  string,
                  unknown
                >,
                { timeoutMs: APP_ROOT_BOOT_PREFERENCES_TIMEOUT_MS },
              ),
            );
          }
          if (recoveredPreferences.removedSymbolsChanged) {
            recoveryWrites.push(
              api.updateDataPoolRemovedSymbolsBySourceId(
                recoveredPreferences.preferences
                  .dataPoolRemovedSymbolsBySourceId,
                { timeoutMs: APP_ROOT_BOOT_PREFERENCES_TIMEOUT_MS },
              ),
            );
          }
          await Promise.all(recoveryWrites);
          if (disposed) {
            return;
          }
          establishRecoveredPreferencesPersistenceRebase({
            authoritative: recoveredPreferences.preferences,
            runtime: recoveredPreferences.runtimeSnapshot,
          });
          resetRuntimePreferencesRecovery();
          setBootState((current) => {
            if (
              current.phase === "ready" &&
              current.preferencesLoadedFromRuntime
            ) {
              return current;
            }
            return {
              phase: "ready",
              preferences:
                recoveredPreferences.hasRuntimeSnapshot &&
                current.phase === "ready"
                  ? current.preferences
                  : recoveredPreferences.preferences,
              preferencesLoadedFromRuntime: true,
            };
          });
          return;
        } catch {
          // Keep retrying in the background; cached preferences remain usable.
        }
      }
    };

    const loadWithStartupRetries = async (): Promise<void> => {
      for (const delayMs of APP_ROOT_BOOT_PREFERENCES_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await waitForBootRetryDelay(delayMs);
        }
        if (disposed) {
          return;
        }
        try {
          const normalized = await loadRuntimeBootPreferences();
          if (disposed) {
            return;
          }
          setBootState({
            phase: "ready",
            preferences: normalized,
            preferencesLoadedFromRuntime: true,
          });
          return;
        } catch {
          // Try the next bounded startup retry before falling back to cache.
        }
      }
      if (disposed) {
        return;
      }
      setBootState({
        phase: "ready",
        preferences: buildRuntimeFailureFallbackBootPreferences(),
        preferencesLoadedFromRuntime: false,
      });
      void recoverRuntimePreferences();
    };

    void loadWithStartupRetries();
    return () => {
      disposed = true;
    };
  }, []);

  if (bootState.phase === "pending") {
    return <AppRootBootShell />;
  }

  return (
    <StartupExitOverlay>
      <AppRootRuntime
        initialUiSettings={bootState.preferences.uiSettings}
        initialDataPoolRemovedSymbolsBySourceId={
          bootState.preferences.dataPoolRemovedSymbolsBySourceId
        }
        canPersistUiSettings={bootState.preferencesLoadedFromRuntime}
      />
    </StartupExitOverlay>
  );
};
