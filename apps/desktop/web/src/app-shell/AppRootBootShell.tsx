// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState, type CSSProperties } from "react";
import { readMainDesktopViewportState } from "@/api";
import {
  createEmptyAppPreferencesSnapshot,
  readCachedAppPreferencesSnapshot,
  readCachedAppThemeMode,
  resolveAppStartupTheme,
  type NormalizedAppPreferences,
} from "@/app-shell/appPreferencesModel";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { getCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import {
  buildTypographyCssVariables,
  type FontSizePreset,
} from "@/frontend-kernel/typography";
import {
  DEFAULT_TRADE_COLOR_THEME,
  GLOBAL_COLOR_ARCHITECTURE,
  buildGlobalVisualCssVariables,
} from "@/ui/theme/visualColors";
import { Button } from "@/ui/primitives/button";
import {
  readStartupNowMs,
  readStartupSurfaceVisibleAtMs,
  resolveStartupStageMessageId,
  calculateStartupCopyRevealDelayMs,
  subscribeStartupSurfaceVisible,
} from "@/app-shell/boot/startupPresentation";

const COMMUNITY_STARTUP_PRODUCT_NAME = "Zinuto Core";

const buildFallbackBootPreferences = (): NormalizedAppPreferences =>
  readCachedAppPreferencesSnapshot() ?? createEmptyAppPreferencesSnapshot();

const resolveSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const resolveBootLoadingTheme = (
  preferences: NormalizedAppPreferences,
): "light" | "dark" => {
  if (typeof document !== "undefined") {
    const initialTheme = document.documentElement.dataset.zinutoInitialTheme;
    if (initialTheme === "dark" || initialTheme === "light") {
      return initialTheme;
    }
  }
  return resolveAppStartupTheme({
    systemTheme: resolveSystemTheme(),
    themeMode:
      readCachedAppThemeMode() ?? preferences.uiSettings.themeMode,
  });
};

const resolveBootFontSizePreset = (
  preferences: NormalizedAppPreferences,
): FontSizePreset => {
  const value = preferences.uiSettings.fontSizePreset;
  return value === "SMALL" || value === "LARGE" ? value : "STANDARD";
};

const buildBootLoadingVisualState = () => {
  const preferences = buildFallbackBootPreferences();
  const viewport = readMainDesktopViewportState();
  return {
    theme: resolveBootLoadingTheme(preferences),
    fontSizePreset: resolveBootFontSizePreset(preferences),
    viewportLayoutMode: viewport.layoutMode,
    viewportScale: viewport.cssViewportScale,
  };
};

const buildBootLoadingStyle = ({
  fontSizePreset,
  theme,
  viewportScale,
}: ReturnType<typeof buildBootLoadingVisualState>): CSSProperties =>
  ({
    "--viewport-scale": viewportScale.toFixed(4),
    ...buildTypographyCssVariables({
      language: getCurrentUiLanguage(),
      fontSizePreset,
    }),
    ...buildGlobalVisualCssVariables(
      theme,
      "RED_UP_GREEN_DOWN",
      DEFAULT_TRADE_COLOR_THEME,
    ),
    backgroundColor: GLOBAL_COLOR_ARCHITECTURE[theme].surfaces.s5,
    color: GLOBAL_COLOR_ARCHITECTURE[theme].text.t1,
    colorScheme: theme,
  }) as CSSProperties;

const readStartupProductName = (): string => {
  if (typeof document === "undefined") {
    return COMMUNITY_STARTUP_PRODUCT_NAME;
  }
  return (
    document.documentElement.dataset.zinutoDesktopProductName?.trim() ||
    COMMUNITY_STARTUP_PRODUCT_NAME
  );
};

const useStartupStatusVisible = (forceVisible: boolean): boolean => {
  const [visible, setVisible] = useState(forceVisible);

  useEffect(() => {
    if (forceVisible) {
      setVisible(true);
      return () => undefined;
    }

    let revealTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let unsubscribe: () => void = () => undefined;
    const scheduleReveal = (visibleAtMs: number) => {
      const delayMs = calculateStartupCopyRevealDelayMs({
        nowMs: readStartupNowMs(),
        visibleAtMs,
      });
      if (delayMs === 0) {
        setVisible(true);
        return;
      }
      revealTimer = globalThis.setTimeout(() => setVisible(true), delayMs);
    };

    const visibleAtMs = readStartupSurfaceVisibleAtMs();
    if (visibleAtMs === null) {
      unsubscribe = subscribeStartupSurfaceVisible(scheduleReveal);
    } else {
      scheduleReveal(visibleAtMs);
    }

    return () => {
      unsubscribe();
      if (revealTimer !== null) {
        globalThis.clearTimeout(revealTimer);
      }
    };
  }, [forceVisible]);

  return visible;
};

export type AppRootStartupFailure = {
  actionLabel: string;
  body?: string | null;
  diagnostic?: string | null;
  onAction: () => void | Promise<void>;
  title: string;
};

export const AppRootBootShell = ({
  failure = null,
  nativeBackendStage = null,
  presentationMode = "root",
  presentationPhase = "visible",
}: {
  failure?: AppRootStartupFailure | null;
  nativeBackendStage?: string | null;
  presentationMode?: "root" | "overlay";
  presentationPhase?: "visible" | "exiting";
}) => {
  const bootVisualState = buildBootLoadingVisualState();
  const { fontSizePreset, theme, viewportLayoutMode } = bootVisualState;
  const normalizedBackendStage = String(nativeBackendStage ?? "").trim();
  const loadingMessage = tt(
    resolveStartupStageMessageId(normalizedBackendStage),
  );
  const productName = readStartupProductName();
  const isFailure = failure !== null;
  const statusVisible = useStartupStatusVisible(isFailure);
  const [actionPending, setActionPending] = useState(false);
  const classNames = [
    presentationMode === "root" ? "app-root" : "",
    "zinuto-startup",
    `theme-${theme}`,
    `price-scheme-red-up`,
    `font-size-${fontSizePreset.toLowerCase()}`,
    `layout-${viewportLayoutMode}`,
    presentationMode === "overlay" ? "is-overlay" : "",
    presentationPhase === "exiting" ? "is-exiting" : "",
  ].filter(Boolean);

  const runFailureAction = () => {
    if (!failure || actionPending) {
      return;
    }
    const failureAction = failure.onAction;
    setActionPending(true);
    void Promise.resolve()
      .then(() => failureAction())
      .finally(() => {
        setActionPending(false);
      });
  };

  return (
    <div
      className={classNames.join(" ")}
      data-zinuto-startup-copy-visible={statusVisible ? "true" : "false"}
      data-zinuto-startup-state={isFailure ? "failed" : "loading"}
      data-zinuto-startup-surface
      style={buildBootLoadingStyle(bootVisualState)}
    >
      <div className="zinuto-startup__content">
        <div aria-hidden="true" className="zinuto-startup__logo-frame">
          <span className="zinuto-startup__logo-image" />
        </div>
        <strong
          className="zinuto-startup__brand"
          data-zinuto-startup-product
        >
          {productName}
        </strong>
        <div
          aria-busy={failure ? "false" : "true"}
          aria-label={failure ? undefined : loadingMessage}
          aria-live={failure ? "assertive" : "polite"}
          className="zinuto-startup__status"
          data-native-backend-startup-stage={
            !failure && normalizedBackendStage
              ? normalizedBackendStage
              : undefined
          }
          role={failure ? "alert" : "status"}
        >
          <p
            aria-hidden={isFailure || !statusVisible ? true : undefined}
            className="zinuto-startup__message"
            hidden={isFailure}
          >
            {loadingMessage}
          </p>
          <h1 className="zinuto-startup__failure-title" hidden={!failure}>
            {failure?.title}
          </h1>
          <p
            className="zinuto-startup__failure-body"
            hidden={!failure?.body}
          >
            {failure?.body}
          </p>
        </div>
        <code className="zinuto-startup__diagnostic" hidden={!failure?.diagnostic}>
          {failure?.diagnostic}
        </code>
        <div aria-hidden="true" className="zinuto-startup__progress" />
        <Button
          className="zinuto-startup__retry"
          disabled={actionPending}
          hidden={!failure}
          onClick={runFailureAction}
          type="button"
          variant="secondary"
        >
          {failure?.actionLabel}
        </Button>
      </div>
    </div>
  );
};
