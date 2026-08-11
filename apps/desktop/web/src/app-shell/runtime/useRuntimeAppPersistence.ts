// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { api } from "@/api";
import { useUiSettingsSync } from "@/app-shell/useUiSettingsSync";
import {
  normalizeStringArrayRecord,
  writeCachedAppThemeMode,
  writeCachedAppUiSettingsSnapshot,
  writeCachedRemovedSymbolsSnapshot,
} from "@/app-shell/appPreferencesModel";
import {
  commitRuntimeRemovedSymbolsPersistence,
  commitRuntimeUiSettingsPersistence,
  persistRuntimePreferenceWithRetry,
  prepareRuntimeRemovedSymbolsPersistence,
  prepareRuntimeUiSettingsPersistence,
  registerRuntimePreferencesSnapshotReader,
} from "@/app-shell/runtimePreferencesRecovery";
import {
  type ThemeMode,
  type UiLanguagePreferenceSource,
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { setCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import { type AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from "react";

type UseRuntimeAppPersistenceArgs = {
  language: UiLanguage;
  languageSource: UiLanguagePreferenceSource;
  themeMode: ThemeMode;
  tt: (key: AppTextKey) => string;
  buildUiSettings: () => UiSettings;
  dataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  isGlobalResetInProgressRef: MutableRefObject<boolean>;
  canPersistUiSettings: boolean;
  persistInitialUiSettings: boolean;
};

export const useRuntimeAppPersistence = ({
  language,
  languageSource,
  themeMode,
  tt,
  buildUiSettings,
  dataPoolRemovedSymbolsBySourceId,
  isGlobalResetInProgressRef,
  canPersistUiSettings,
  persistInitialUiSettings,
}: UseRuntimeAppPersistenceArgs) => {
  const dataPoolRemovedSymbolsPersistTimerRef = useRef<number | null>(null);
  const dataPoolRemovedSymbolsRetryTimerRef = useRef<number | null>(null);
  const dataPoolRemovedSymbolsPersistQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const latestRemovedSymbolsRetryRef = useRef<{
    normalized: Record<string, string[]>;
    serialized: string;
  } | null>(null);
  const persistRemovedSymbolsRef = useRef<
    (
      normalized: Record<string, string[]>,
      serialized: string,
    ) => Promise<void>
  >(async () => undefined);
  const dataPoolRemovedSymbolsPersistJsonRef = useRef(
    JSON.stringify(dataPoolRemovedSymbolsBySourceId),
  );
  const didPersistInitialUiSettingsRef = useRef(false);
  const shouldPersistRecoveredUiBaselineRef = useRef(!canPersistUiSettings);
  const shouldPersistRecoveredRemovedSymbolsBaselineRef = useRef(
    !canPersistUiSettings,
  );
  const uiSettingsPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uiSettingsRetryTimerRef = useRef<number | null>(null);
  const latestUiSettingsRetryRef = useRef<UiSettings | null>(null);
  const persistUiSettingsRef = useRef<
    (settings: UiSettings) => Promise<unknown>
  >(async () => undefined);
  const runtimePreferencesSnapshotReaderRef = useRef(() => ({
    uiSettings: buildUiSettings(),
    dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
      dataPoolRemovedSymbolsBySourceId,
    ),
  }));
  runtimePreferencesSnapshotReaderRef.current = () => ({
    uiSettings: buildUiSettings(),
    dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
      dataPoolRemovedSymbolsBySourceId,
    ),
  });
  useLayoutEffect(() => {
    writeCachedAppThemeMode(themeMode);
  }, [themeMode]);
  const scheduleUiSettingsRetry = useCallback(() => {
    if (uiSettingsRetryTimerRef.current !== null) {
      return;
    }
    uiSettingsRetryTimerRef.current = window.setTimeout(() => {
      uiSettingsRetryTimerRef.current = null;
      const latestSettings = latestUiSettingsRetryRef.current;
      if (!latestSettings || isGlobalResetInProgressRef.current) {
        return;
      }
      void persistUiSettingsRef.current(latestSettings).catch(() => undefined);
    }, 5_000);
  }, [isGlobalResetInProgressRef]);
  const persistUiSettings = useCallback(
    (settings: UiSettings) => {
      latestUiSettingsRetryRef.current = settings;
      const task = uiSettingsPersistQueueRef.current.then(async () => {
        const persistedSettings = prepareRuntimeUiSettingsPersistence(settings);
        const result = await persistRuntimePreferenceWithRetry(() =>
          api.updateAppUiSettings(
            persistedSettings as Record<string, unknown>,
          ),
        );
        commitRuntimeUiSettingsPersistence({
          current: settings,
          persisted: persistedSettings,
        });
        writeCachedAppUiSettingsSnapshot(persistedSettings);
        shouldPersistRecoveredUiBaselineRef.current = false;
        return result;
      });
      uiSettingsPersistQueueRef.current = task.then(
        () => undefined,
        () => undefined,
      );
      void task.then(
        () => {
          if (latestUiSettingsRetryRef.current === settings) {
            latestUiSettingsRetryRef.current = null;
          }
          if (uiSettingsRetryTimerRef.current !== null) {
            window.clearTimeout(uiSettingsRetryTimerRef.current);
            uiSettingsRetryTimerRef.current = null;
          }
        },
        () => {
          scheduleUiSettingsRetry();
        },
      );
      return task;
    },
    [scheduleUiSettingsRetry],
  );
  persistUiSettingsRef.current = persistUiSettings;
  const scheduleRemovedSymbolsRetry = useCallback(() => {
    if (dataPoolRemovedSymbolsRetryTimerRef.current !== null) {
      return;
    }
    dataPoolRemovedSymbolsRetryTimerRef.current = window.setTimeout(() => {
      dataPoolRemovedSymbolsRetryTimerRef.current = null;
      const latest = latestRemovedSymbolsRetryRef.current;
      if (!latest || isGlobalResetInProgressRef.current) {
        return;
      }
      void persistRemovedSymbolsRef.current(
        latest.normalized,
        latest.serialized,
      ).catch(() => undefined);
    }, 5_000);
  }, [isGlobalResetInProgressRef]);
  const persistRemovedSymbols = useCallback(
    (normalized: Record<string, string[]>, serialized: string) => {
      const retrySnapshot = { normalized, serialized };
      latestRemovedSymbolsRetryRef.current = retrySnapshot;
      const task = dataPoolRemovedSymbolsPersistQueueRef.current.then(
        async () => {
          const persistedRemovedSymbols =
            prepareRuntimeRemovedSymbolsPersistence(normalized);
          await persistRuntimePreferenceWithRetry(() =>
            api.updateDataPoolRemovedSymbolsBySourceId(
              persistedRemovedSymbols,
            ),
          );
          commitRuntimeRemovedSymbolsPersistence({
            current: normalized,
            persisted: persistedRemovedSymbols,
          });
          dataPoolRemovedSymbolsPersistJsonRef.current = serialized;
          writeCachedRemovedSymbolsSnapshot(persistedRemovedSymbols);
          shouldPersistRecoveredRemovedSymbolsBaselineRef.current = false;
        },
      );
      dataPoolRemovedSymbolsPersistQueueRef.current = task.then(
        () => undefined,
        () => undefined,
      );
      void task.then(
        () => {
          if (latestRemovedSymbolsRetryRef.current === retrySnapshot) {
            latestRemovedSymbolsRetryRef.current = null;
          }
          if (dataPoolRemovedSymbolsRetryTimerRef.current !== null) {
            window.clearTimeout(dataPoolRemovedSymbolsRetryTimerRef.current);
            dataPoolRemovedSymbolsRetryTimerRef.current = null;
          }
        },
        () => {
          scheduleRemovedSymbolsRetry();
        },
      );
      return task;
    },
    [scheduleRemovedSymbolsRetry],
  );
  persistRemovedSymbolsRef.current = persistRemovedSymbols;
  const syncCurrentLanguage = useCallback(
    (nextLanguage: UiLanguage) => {
      setCurrentUiLanguage(nextLanguage, { source: languageSource });
    },
    [languageSource],
  );

  const resolveAppTitle = useCallback(
    () => tt("appText.zinutoLineReplayTrading"),
    [tt],
  );

  const { cancelPendingUiSettingsPersist } =
    useUiSettingsSync<UiSettings, UiLanguage>({
      language,
      resolveAppTitle,
      onLanguageChange: syncCurrentLanguage,
      buildSettings: buildUiSettings,
      persistSettings: persistUiSettings,
      isGlobalResetInProgressRef,
      enabled: canPersistUiSettings,
    });

  useEffect(
    () => registerRuntimePreferencesSnapshotReader(
      () => runtimePreferencesSnapshotReaderRef.current(),
    ),
    [],
  );

  useEffect(() => () => {
    if (uiSettingsRetryTimerRef.current !== null) {
      window.clearTimeout(uiSettingsRetryTimerRef.current);
    }
    if (dataPoolRemovedSymbolsRetryTimerRef.current !== null) {
      window.clearTimeout(dataPoolRemovedSymbolsRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (
      !canPersistUiSettings ||
      (!persistInitialUiSettings &&
        !shouldPersistRecoveredUiBaselineRef.current) ||
      didPersistInitialUiSettingsRef.current ||
      isGlobalResetInProgressRef.current
    ) {
      return;
    }
    didPersistInitialUiSettingsRef.current = true;
    void Promise.resolve(persistUiSettings(buildUiSettings())).catch(() => null);
  }, [
    buildUiSettings,
    canPersistUiSettings,
    isGlobalResetInProgressRef,
    persistInitialUiSettings,
    persistUiSettings,
  ]);

  useEffect(() => {
    if (!canPersistUiSettings || isGlobalResetInProgressRef.current) {
      if (dataPoolRemovedSymbolsPersistTimerRef.current !== null) {
        window.clearTimeout(dataPoolRemovedSymbolsPersistTimerRef.current);
        dataPoolRemovedSymbolsPersistTimerRef.current = null;
      }
      if (isGlobalResetInProgressRef.current) {
        latestUiSettingsRetryRef.current = null;
        latestRemovedSymbolsRetryRef.current = null;
        if (uiSettingsRetryTimerRef.current !== null) {
          window.clearTimeout(uiSettingsRetryTimerRef.current);
          uiSettingsRetryTimerRef.current = null;
        }
        if (dataPoolRemovedSymbolsRetryTimerRef.current !== null) {
          window.clearTimeout(dataPoolRemovedSymbolsRetryTimerRef.current);
          dataPoolRemovedSymbolsRetryTimerRef.current = null;
        }
      }
      return;
    }
    const normalizedRemovedSymbols = normalizeStringArrayRecord(
      dataPoolRemovedSymbolsBySourceId,
    );
    const nextJson = JSON.stringify(normalizedRemovedSymbols);
    if (
      nextJson === dataPoolRemovedSymbolsPersistJsonRef.current &&
      !shouldPersistRecoveredRemovedSymbolsBaselineRef.current
    ) {
      return;
    }
    if (dataPoolRemovedSymbolsPersistTimerRef.current !== null) {
      window.clearTimeout(dataPoolRemovedSymbolsPersistTimerRef.current);
    }
    const timerId = window.setTimeout(() => {
      const task = persistRemovedSymbols(normalizedRemovedSymbols, nextJson);
      void task
        .catch(() => null)
        .finally(() => {
          if (dataPoolRemovedSymbolsPersistTimerRef.current === timerId) {
            dataPoolRemovedSymbolsPersistTimerRef.current = null;
          }
        });
    }, 180);
    dataPoolRemovedSymbolsPersistTimerRef.current = timerId;
    return () => {
      if (dataPoolRemovedSymbolsPersistTimerRef.current === timerId) {
        window.clearTimeout(timerId);
        dataPoolRemovedSymbolsPersistTimerRef.current = null;
      }
    };
  }, [
    canPersistUiSettings,
    dataPoolRemovedSymbolsBySourceId,
    isGlobalResetInProgressRef,
    persistRemovedSymbols,
  ]);

  return {
    cancelPendingUiSettingsPersist,
  };
};
