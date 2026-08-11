// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

type UseUiSettingsSyncParams<TSettings, TLanguage extends string> = {
  language: TLanguage;
  appTitle?: string;
  resolveAppTitle?: () => string;
  onLanguageChange?: (language: TLanguage) => void;
  buildSettings: () => TSettings;
  persistSettings: (settings: TSettings) => Promise<unknown> | unknown;
  isGlobalResetInProgressRef: MutableRefObject<boolean>;
  debounceMs?: number;
  enabled?: boolean;
};

type UseUiSettingsSyncResult = {
  cancelPendingUiSettingsPersist: () => void;
};

export const useUiSettingsSync = <TSettings, TLanguage extends string>({
  language,
  appTitle,
  resolveAppTitle,
  onLanguageChange,
  buildSettings,
  persistSettings,
  isGlobalResetInProgressRef,
  debounceMs = 180,
  enabled = true
}: UseUiSettingsSyncParams<TSettings, TLanguage>): UseUiSettingsSyncResult => {
  const persistTimerRef = useRef<number | null>(null);
  const lastPersistedSettingsJsonRef = useRef('');
  const hasSettingsBaselineRef = useRef(false);
  const wasEnabledRef = useRef(enabled);

  const cancelPendingUiSettingsPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    onLanguageChange?.(language);
  }, [language, onLanguageChange]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const nextTitle = resolveAppTitle ? resolveAppTitle() : appTitle;
      if (typeof nextTitle === 'string' && nextTitle.length > 0) {
        document.title = nextTitle;
      }
    }
  }, [appTitle, language, resolveAppTitle]);

  useEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      cancelPendingUiSettingsPersist();
      return;
    }
    if (isGlobalResetInProgressRef.current) {
      cancelPendingUiSettingsPersist();
      return;
    }
    const settings = buildSettings();
    const nextSettingsJson = JSON.stringify(settings);
    if (!hasSettingsBaselineRef.current || !wasEnabledRef.current) {
      hasSettingsBaselineRef.current = true;
      wasEnabledRef.current = true;
      lastPersistedSettingsJsonRef.current = nextSettingsJson;
      return;
    }
    if (nextSettingsJson === lastPersistedSettingsJsonRef.current) {
      return;
    }
    cancelPendingUiSettingsPersist();
    const timerId = window.setTimeout(() => {
      Promise.resolve(persistSettings(settings))
        .then(() => {
          lastPersistedSettingsJsonRef.current = nextSettingsJson;
        })
        .catch(() => null)
        .finally(() => {
          if (persistTimerRef.current === timerId) {
            persistTimerRef.current = null;
          }
        });
    }, Math.max(0, debounceMs));
    persistTimerRef.current = timerId;
    return () => {
      if (persistTimerRef.current === timerId) {
        window.clearTimeout(timerId);
        if (persistTimerRef.current === timerId) {
          persistTimerRef.current = null;
        }
      }
    };
  }, [
    buildSettings,
    cancelPendingUiSettingsPersist,
    debounceMs,
    enabled,
    isGlobalResetInProgressRef,
    persistSettings
  ]);

  return { cancelPendingUiSettingsPersist };
};
