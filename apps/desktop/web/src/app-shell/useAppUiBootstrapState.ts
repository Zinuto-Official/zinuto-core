// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopCloseButtonAction } from "@/frontend-kernel/windowBehaviorTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { FontSizePreset, UiLanguage } from "@/frontend-kernel/typography";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { DEFAULT_TRADE_COLOR_THEME, isTradeColorThemeToken } from '@/ui/theme/visualColors';
import {
  getCurrentUiLanguage,
  getCurrentUiLanguageSource,
  setCurrentUiLanguage,
} from '@/frontend-kernel/i18n/localeState';
import { APP_UI_BASE_LANGUAGE, APP_UI_LANGUAGES } from '@/ui/config/uiConfig';
import type {
  SessionNameFormat,
  ThemeMode,
  TradeColorThemeToken,
  UiLanguagePreferenceSource,
  UiSettings
} from "@/frontend-kernel/appTypes";
import {
  DEFAULT_SESSION_NAME_FORMAT,
  SESSION_NAME_FORMAT_OPTIONS
} from '@/app-shell/appSessionNaming';
import type { PriceColorMode } from '@/domains/chart/display';
import { normalizeChartRenderMode, type ChartRenderMode } from '@/domains/chart/chartRenderMode';
import { resolveDesktopCloseButtonActionFromUiSettings } from '@/app-shell/desktopCloseBehavior';

type UseAppUiBootstrapStateResult = {
  persistedUi: UiSettings;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  hint: string;
  setHint: Dispatch<SetStateAction<string>>;
  language: UiLanguage;
  setLanguage: Dispatch<SetStateAction<UiLanguage>>;
  languageSource: UiLanguagePreferenceSource;
  setLanguageSource: Dispatch<SetStateAction<UiLanguagePreferenceSource>>;
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  priceColorMode: PriceColorMode;
  setPriceColorMode: Dispatch<SetStateAction<PriceColorMode>>;
  tradeColorTheme: TradeColorThemeToken;
  setTradeColorTheme: Dispatch<SetStateAction<TradeColorThemeToken>>;
  chartRenderMode: ChartRenderMode;
  setChartRenderMode: Dispatch<SetStateAction<ChartRenderMode>>;
  fontSizePreset: FontSizePreset;
  setFontSizePreset: Dispatch<SetStateAction<FontSizePreset>>;
  sessionNameFormat: SessionNameFormat;
  setSessionNameFormat: Dispatch<SetStateAction<SessionNameFormat>>;
  trainerDisplayPeriod: DisplayPeriodKey;
  setTrainerDisplayPeriod: Dispatch<SetStateAction<DisplayPeriodKey>>;
  showGlobalDecimals: boolean;
  setShowGlobalDecimals: Dispatch<SetStateAction<boolean>>;
  showDesktopHelpLauncher: boolean;
  setShowDesktopHelpLauncher: Dispatch<SetStateAction<boolean>>;
  showDrawingsAcrossPeriods: boolean;
  setShowDrawingsAcrossPeriods: Dispatch<SetStateAction<boolean>>;
  developerModeEnabled: boolean;
  setDeveloperModeEnabled: Dispatch<SetStateAction<boolean>>;
  desktopCloseButtonAction: DesktopCloseButtonAction;
  setDesktopCloseButtonAction: Dispatch<SetStateAction<DesktopCloseButtonAction>>;
  systemThemeMode: 'light' | 'dark';
  setSystemThemeMode: Dispatch<SetStateAction<'light' | 'dark'>>;
};

type UseAppUiBootstrapStateArgs = {
  initialHint: string;
  initialUiSettings: UiSettings;
};

const resolvePersistedLanguageSource = (
  source: unknown,
  language: unknown,
): UiLanguagePreferenceSource => {
  if (source === 'USER' || source === 'SYSTEM') {
    return source;
  }
  return language ? 'USER' : 'SYSTEM';
};

const useRecoverableBootstrapState = <T,>(
  initialValue: T,
): readonly [
  T,
  Dispatch<SetStateAction<T>>,
  (authoritativeValue: T) => void,
] => {
  const [value, setValue] = useState(initialValue);
  const locallyModifiedRef = useRef(false);
  const setTrackedValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    locallyModifiedRef.current = true;
    setValue(nextValue);
  }, []);
  const reconcileAuthoritativeValue = useCallback((authoritativeValue: T) => {
    if (!locallyModifiedRef.current) {
      setValue(authoritativeValue);
    }
  }, []);
  return [value, setTrackedValue, reconcileAuthoritativeValue] as const;
};

export const useAppUiBootstrapState = ({
  initialHint,
  initialUiSettings
}: UseAppUiBootstrapStateArgs): UseAppUiBootstrapStateResult => {
  const persistedUi = initialUiSettings;
  const persistedLanguage = persistedUi.language;
  const persistedLanguageSource = resolvePersistedLanguageSource(
    persistedUi.languageSource,
    persistedLanguage,
  );
  const resolvedLanguageSource = persistedLanguageSource === 'USER'
    ? 'USER'
    : getCurrentUiLanguageSource();
  const resolvedLanguage =
    persistedLanguageSource === 'USER' &&
    persistedLanguage &&
    APP_UI_LANGUAGES.includes(persistedLanguage)
      ? persistedLanguage
      : persistedLanguageSource === 'USER' && persistedLanguage
        ? APP_UI_BASE_LANGUAGE
        : getCurrentUiLanguage();
  const resolvedThemeMode: ThemeMode =
    persistedUi.themeMode === 'dark' ||
    persistedUi.themeMode === 'light' ||
    persistedUi.themeMode === 'system'
      ? persistedUi.themeMode
      : 'light';
  const resolvedPriceColorMode: PriceColorMode =
    persistedUi.priceColorMode === 'GREEN_UP_RED_DOWN' ||
    persistedUi.priceColorMode === 'RED_UP_GREEN_DOWN'
      ? persistedUi.priceColorMode
      : 'RED_UP_GREEN_DOWN';
  const resolvedTradeColorTheme = isTradeColorThemeToken(persistedUi.tradeColorTheme)
    ? persistedUi.tradeColorTheme
    : DEFAULT_TRADE_COLOR_THEME;
  const resolvedChartRenderMode = normalizeChartRenderMode(persistedUi.chartRenderMode);
  const resolvedFontSizePreset: FontSizePreset =
    persistedUi.fontSizePreset === 'SMALL' ||
    persistedUi.fontSizePreset === 'STANDARD' ||
    persistedUi.fontSizePreset === 'LARGE'
      ? persistedUi.fontSizePreset
      : 'STANDARD';
  const resolvedSessionNameFormat =
    persistedUi.sessionNameFormat &&
    SESSION_NAME_FORMAT_OPTIONS.includes(persistedUi.sessionNameFormat)
      ? persistedUi.sessionNameFormat
      : DEFAULT_SESSION_NAME_FORMAT;
  const resolvedTrainerDisplayPeriod: DisplayPeriodKey =
    persistedUi.trainerDisplayPeriod === '1m' ||
    persistedUi.trainerDisplayPeriod === '5m' ||
    persistedUi.trainerDisplayPeriod === '1h' ||
    persistedUi.trainerDisplayPeriod === '1d' ||
    persistedUi.trainerDisplayPeriod === '1w' ||
    persistedUi.trainerDisplayPeriod === '1month' ||
    persistedUi.trainerDisplayPeriod === '1year'
      ? persistedUi.trainerDisplayPeriod
      : '1d';
  const resolvedShowGlobalDecimals =
    typeof persistedUi.showGlobalDecimals === 'boolean'
      ? persistedUi.showGlobalDecimals
      : true;
  const resolvedShowDesktopHelpLauncher =
    typeof persistedUi.showDesktopHelpLauncher === 'boolean'
      ? persistedUi.showDesktopHelpLauncher
      : true;
  const resolvedShowDrawingsAcrossPeriods =
    typeof persistedUi.showDrawingsAcrossPeriods === 'boolean'
      ? persistedUi.showDrawingsAcrossPeriods
      : true;
  const resolvedDeveloperModeEnabled = persistedUi.developerModeEnabled === true;
  const resolvedDesktopCloseButtonAction =
    resolveDesktopCloseButtonActionFromUiSettings(persistedUi);

  const [error, setErrorState] = useState('');
  const errorRef = useRef('');
  const [hint, setHint] = useState(initialHint);
  const [language, setLanguage, reconcileLanguage] =
    useRecoverableBootstrapState<UiLanguage>(resolvedLanguage);
  const [languageSource, setLanguageSource, reconcileLanguageSource] =
    useRecoverableBootstrapState<UiLanguagePreferenceSource>(resolvedLanguageSource);
  const [themeMode, setThemeMode, reconcileThemeMode] =
    useRecoverableBootstrapState<ThemeMode>(resolvedThemeMode);
  const [priceColorMode, setPriceColorMode, reconcilePriceColorMode] =
    useRecoverableBootstrapState<PriceColorMode>(resolvedPriceColorMode);
  const [tradeColorTheme, setTradeColorTheme, reconcileTradeColorTheme] =
    useRecoverableBootstrapState<TradeColorThemeToken>(resolvedTradeColorTheme);
  const [chartRenderMode, setChartRenderMode, reconcileChartRenderMode] =
    useRecoverableBootstrapState<ChartRenderMode>(resolvedChartRenderMode);
  const [fontSizePreset, setFontSizePreset, reconcileFontSizePreset] =
    useRecoverableBootstrapState<FontSizePreset>(resolvedFontSizePreset);
  const [sessionNameFormat, setSessionNameFormat, reconcileSessionNameFormat] =
    useRecoverableBootstrapState<SessionNameFormat>(resolvedSessionNameFormat);
  const [trainerDisplayPeriod, setTrainerDisplayPeriod, reconcileTrainerDisplayPeriod] =
    useRecoverableBootstrapState<DisplayPeriodKey>(resolvedTrainerDisplayPeriod);
  const [showGlobalDecimals, setShowGlobalDecimals, reconcileShowGlobalDecimals] =
    useRecoverableBootstrapState<boolean>(resolvedShowGlobalDecimals);
  const [showDesktopHelpLauncher, setShowDesktopHelpLauncher, reconcileShowDesktopHelpLauncher] =
    useRecoverableBootstrapState<boolean>(resolvedShowDesktopHelpLauncher);
  const [showDrawingsAcrossPeriods, setShowDrawingsAcrossPeriods, reconcileShowDrawingsAcrossPeriods] =
    useRecoverableBootstrapState<boolean>(resolvedShowDrawingsAcrossPeriods);
  const [developerModeEnabled, setDeveloperModeEnabled, reconcileDeveloperModeEnabled] =
    useRecoverableBootstrapState<boolean>(resolvedDeveloperModeEnabled);
  const [desktopCloseButtonAction, setDesktopCloseButtonAction, reconcileDesktopCloseButtonAction] =
    useRecoverableBootstrapState<DesktopCloseButtonAction>(resolvedDesktopCloseButtonAction);
  const [systemThemeMode, setSystemThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setError = useCallback<Dispatch<SetStateAction<string>>>((value) => {
    const nextError =
      typeof value === 'function'
        ? String(value(errorRef.current) ?? '')
        : String(value ?? '');
    errorRef.current = nextError;
    setErrorState(nextError);
  }, []);

  useLayoutEffect(() => {
    reconcileLanguage(resolvedLanguage);
    reconcileLanguageSource(resolvedLanguageSource);
    reconcileThemeMode(resolvedThemeMode);
    reconcilePriceColorMode(resolvedPriceColorMode);
    reconcileTradeColorTheme(resolvedTradeColorTheme);
    reconcileChartRenderMode(resolvedChartRenderMode);
    reconcileFontSizePreset(resolvedFontSizePreset);
    reconcileSessionNameFormat(resolvedSessionNameFormat);
    reconcileTrainerDisplayPeriod(resolvedTrainerDisplayPeriod);
    reconcileShowGlobalDecimals(resolvedShowGlobalDecimals);
    reconcileShowDesktopHelpLauncher(resolvedShowDesktopHelpLauncher);
    reconcileShowDrawingsAcrossPeriods(resolvedShowDrawingsAcrossPeriods);
    reconcileDeveloperModeEnabled(resolvedDeveloperModeEnabled);
    reconcileDesktopCloseButtonAction(resolvedDesktopCloseButtonAction);
  }, [
    reconcileChartRenderMode,
    reconcileDesktopCloseButtonAction,
    reconcileDeveloperModeEnabled,
    reconcileFontSizePreset,
    reconcileLanguage,
    reconcileLanguageSource,
    reconcilePriceColorMode,
    reconcileSessionNameFormat,
    reconcileShowDesktopHelpLauncher,
    reconcileShowDrawingsAcrossPeriods,
    reconcileShowGlobalDecimals,
    reconcileThemeMode,
    reconcileTradeColorTheme,
    reconcileTrainerDisplayPeriod,
    resolvedChartRenderMode,
    resolvedDesktopCloseButtonAction,
    resolvedDeveloperModeEnabled,
    resolvedFontSizePreset,
    resolvedLanguage,
    resolvedLanguageSource,
    resolvedPriceColorMode,
    resolvedSessionNameFormat,
    resolvedShowDesktopHelpLauncher,
    resolvedShowDrawingsAcrossPeriods,
    resolvedShowGlobalDecimals,
    resolvedThemeMode,
    resolvedTradeColorTheme,
    resolvedTrainerDisplayPeriod,
  ]);

  useLayoutEffect(() => {
    setCurrentUiLanguage(language, { source: languageSource });
  }, [language, languageSource]);

  return {
    persistedUi,
    error,
    setError,
    hint,
    setHint,
    language,
    setLanguage,
    languageSource,
    setLanguageSource,
    themeMode,
    setThemeMode,
    priceColorMode,
    setPriceColorMode,
    tradeColorTheme,
    setTradeColorTheme,
    chartRenderMode,
    setChartRenderMode,
    fontSizePreset,
    setFontSizePreset,
    sessionNameFormat,
    setSessionNameFormat,
    trainerDisplayPeriod,
    setTrainerDisplayPeriod,
    showGlobalDecimals,
    setShowGlobalDecimals,
    showDesktopHelpLauncher,
    setShowDesktopHelpLauncher,
    showDrawingsAcrossPeriods,
    setShowDrawingsAcrossPeriods,
    developerModeEnabled,
    setDeveloperModeEnabled,
    desktopCloseButtonAction,
    setDesktopCloseButtonAction,
    systemThemeMode,
    setSystemThemeMode
  };
};
