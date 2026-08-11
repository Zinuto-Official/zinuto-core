// SPDX-License-Identifier: GPL-3.0-only

import type { UiSettings } from "@/frontend-kernel/appTypes";
import type { NormalizedAppPreferences } from "@/app-shell/appPreferencesModel";

type RuntimePreferencesSnapshotReader = () => NormalizedAppPreferences;

let activeReader: RuntimePreferencesSnapshotReader | null = null;
let activeReaderToken: symbol | null = null;
let fallbackRuntimeBaseline: NormalizedAppPreferences | null = null;
let persistenceRebase: {
  authoritative: NormalizedAppPreferences;
  runtime: NormalizedAppPreferences;
} | null = null;

const RUNTIME_PREFERENCE_PERSISTENCE_RETRY_DELAYS_MS = [
  0,
  300,
  1_200,
  3_000,
] as const;

const waitForPersistenceRetry = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    const timeout = setTimeout(resolve, Math.max(0, delayMs));
    if (typeof timeout === "object") {
      timeout.unref?.();
    }
  });

export const persistRuntimePreferenceWithRetry = async <T>(
  operation: () => Promise<T>,
  retryDelaysMs: readonly number[] =
    RUNTIME_PREFERENCE_PERSISTENCE_RETRY_DELAYS_MS,
): Promise<T> => {
  let lastError: unknown = new Error("Preference persistence failed");
  for (const delayMs of retryDelaysMs.length ? retryDelaysMs : [0]) {
    if (delayMs > 0) {
      await waitForPersistenceRetry(delayMs);
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const valuesMatch = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const mergeLocallyChangedValue = (
  authoritative: unknown,
  baseline: unknown,
  current: unknown,
): { changed: boolean; value: unknown } => {
  if (valuesMatch(baseline, current)) {
    return { changed: false, value: authoritative };
  }
  if (isPlainRecord(baseline) && isPlainRecord(current)) {
    const merged: Record<string, unknown> = isPlainRecord(authoritative)
      ? { ...authoritative }
      : {};
    let changed = false;
    const candidateKeys = new Set([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);
    candidateKeys.forEach((key) => {
      const child = mergeLocallyChangedValue(
        isPlainRecord(authoritative) ? authoritative[key] : undefined,
        baseline[key],
        current[key],
      );
      changed ||= child.changed;
      if (child.value === undefined) {
        delete merged[key];
      } else {
        merged[key] = child.value;
      }
    });
    return { changed, value: merged };
  }
  return { changed: true, value: current };
};

const mergeLocallyChangedRecord = <T extends Record<string, unknown>>(
  authoritative: T,
  baseline: T,
  current: T,
): { changed: boolean; value: T } => {
  const merged = mergeLocallyChangedValue(authoritative, baseline, current);
  return {
    changed: merged.changed,
    value: (isPlainRecord(merged.value) ? merged.value : {}) as T,
  };
};

export const registerRuntimePreferencesSnapshotReader = (
  reader: RuntimePreferencesSnapshotReader,
): (() => void) => {
  const token = Symbol("runtime-preferences-reader");
  activeReaderToken = token;
  activeReader = reader;
  fallbackRuntimeBaseline = reader();
  return () => {
    if (activeReaderToken !== token) {
      return;
    }
    activeReaderToken = null;
    activeReader = null;
    fallbackRuntimeBaseline = null;
  };
};

export const mergeRecoveredRuntimePreferences = (
  authoritative: NormalizedAppPreferences,
): {
  hasRuntimeSnapshot: boolean;
  preferences: NormalizedAppPreferences;
  removedSymbolsChanged: boolean;
  runtimeSnapshot: NormalizedAppPreferences | null;
  uiSettingsChanged: boolean;
} => {
  if (!activeReader || !fallbackRuntimeBaseline) {
    return {
      hasRuntimeSnapshot: false,
      preferences: authoritative,
      removedSymbolsChanged: false,
      runtimeSnapshot: null,
      uiSettingsChanged: false,
    };
  }
  const current = activeReader();
  const uiSettings = mergeLocallyChangedRecord(
    authoritative.uiSettings as Record<string, unknown>,
    fallbackRuntimeBaseline.uiSettings as Record<string, unknown>,
    current.uiSettings as Record<string, unknown>,
  );
  const removedSymbols = mergeLocallyChangedRecord(
    authoritative.dataPoolRemovedSymbolsBySourceId,
    fallbackRuntimeBaseline.dataPoolRemovedSymbolsBySourceId,
    current.dataPoolRemovedSymbolsBySourceId,
  );
  return {
    hasRuntimeSnapshot: true,
    preferences: {
      uiSettings: uiSettings.value as UiSettings,
      dataPoolRemovedSymbolsBySourceId:
        removedSymbols.value as Record<string, string[]>,
    },
    removedSymbolsChanged: removedSymbols.changed,
    runtimeSnapshot: current,
    uiSettingsChanged: uiSettings.changed,
  };
};

export const establishRecoveredPreferencesPersistenceRebase = ({
  authoritative,
  runtime,
}: {
  authoritative: NormalizedAppPreferences;
  runtime: NormalizedAppPreferences | null;
}): void => {
  persistenceRebase = runtime ? { authoritative, runtime } : null;
};

export const prepareRuntimeUiSettingsPersistence = (
  current: UiSettings,
): UiSettings => {
  if (!persistenceRebase) {
    return current;
  }
  return mergeLocallyChangedRecord(
    persistenceRebase.authoritative.uiSettings as Record<string, unknown>,
    persistenceRebase.runtime.uiSettings as Record<string, unknown>,
    current as Record<string, unknown>,
  ).value as UiSettings;
};

export const commitRuntimeUiSettingsPersistence = ({
  current,
  persisted,
}: {
  current: UiSettings;
  persisted: UiSettings;
}): void => {
  if (!persistenceRebase) {
    return;
  }
  persistenceRebase = {
    authoritative: {
      ...persistenceRebase.authoritative,
      uiSettings: persisted,
    },
    runtime: {
      ...persistenceRebase.runtime,
      uiSettings: current,
    },
  };
};

export const prepareRuntimeRemovedSymbolsPersistence = (
  current: Record<string, string[]>,
): Record<string, string[]> => {
  if (!persistenceRebase) {
    return current;
  }
  return mergeLocallyChangedRecord(
    persistenceRebase.authoritative.dataPoolRemovedSymbolsBySourceId,
    persistenceRebase.runtime.dataPoolRemovedSymbolsBySourceId,
    current,
  ).value;
};

export const commitRuntimeRemovedSymbolsPersistence = ({
  current,
  persisted,
}: {
  current: Record<string, string[]>;
  persisted: Record<string, string[]>;
}): void => {
  if (!persistenceRebase) {
    return;
  }
  persistenceRebase = {
    authoritative: {
      ...persistenceRebase.authoritative,
      dataPoolRemovedSymbolsBySourceId: persisted,
    },
    runtime: {
      ...persistenceRebase.runtime,
      dataPoolRemovedSymbolsBySourceId: current,
    },
  };
};

export const resetRuntimePreferencesRecovery = (): void => {
  activeReaderToken = null;
  activeReader = null;
  fallbackRuntimeBaseline = null;
};

export const resetRuntimePreferencesPersistenceRebase = (): void => {
  persistenceRebase = null;
};
