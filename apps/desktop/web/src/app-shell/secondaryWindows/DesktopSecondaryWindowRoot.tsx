// SPDX-License-Identifier: GPL-3.0-only

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  getDesktopSecondaryPopupDefinition,
} from "@/app-shell/popups/popupRegistry";
import {
  DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  closeCurrentDesktopSecondaryWindow,
  notifyDesktopSecondaryWindowContentReady,
  notifyDesktopSecondaryWindowReady,
  notifyDesktopSecondaryWindowRouteReady,
  notifyDesktopSecondaryWindowShellReady,
  sendDesktopSecondaryWindowRouteAction,
  subscribeDesktopSecondaryWindowReuseCloseRequest,
  subscribeDesktopSecondaryWindowState,
  type DesktopSecondaryWindowKind,
  type DesktopSecondaryWindowStatePayload,
  type DesktopSecondaryWindowVisualContext,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import {
  resolveDesktopSecondaryWindowKindFromLocation,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import { shouldAcceptDesktopSecondaryWindowState } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel";
import type {
  SecondaryWindowRouteComponent,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";
import { SecondaryWindowLoadingSkeleton } from "@/app-shell/secondaryWindows/SecondaryWindowLoadingSkeleton";
import {
  resolveTypographyScriptGroup,
  setGlobalTypographyContext,
  type FontSizePreset,
  type UiLanguage,
} from "@/frontend-kernel/typography";
import {
  DEFAULT_TRADE_COLOR_THEME,
  buildGlobalVisualCssVariables,
  isTradeColorThemeToken,
  setGlobalTradeColorTheme,
  type TradeColorThemeToken,
} from "@/ui/theme/visualColors";
import { setGlobalDecimalDisplay } from "@/ui/formatting/format";
import { setCurrentUiLanguage } from "@/frontend-kernel/i18n/localeState";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { APP_PORTAL_ROOT_ID } from "@/ui/primitives/portalContainer";
import { setGlobalPriceColorMode } from "@/domains/chart/priceColorModeState";
import { useWindowChromeDrag } from "@/app-shell/useWindowChromeDrag";
import { I18nProvider } from "@/frontend-kernel/i18n";
import { DesktopWindowChrome } from "@/ui/components/DesktopWindowChrome";
import { GRAPHIC_IMAGE_ASSET_URLS } from "@/assets/graphics";
import { readDesktopWindowChromePlatform } from "@/api";
import {
  ensureLocaleCatalog,
  isLocaleCatalogLoaded,
} from "@zinuto/shared/i18n";

type ThemeMode = "light" | "dark" | "system";
type ResolvedThemeMode = "light" | "dark";
type PriceColorMode = "RED_UP_GREEN_DOWN" | "GREEN_UP_RED_DOWN";
type SecondaryWindowPlatform = "macos" | "windows" | "unknown";
type LocaleWidthProfile = "compact" | "expanded";
const SECONDARY_WINDOW_DEPENDENCY_DEADLINE_MS = 4_000;

const settleSecondaryWindowDependencyWithin = <T,>(
  task: Promise<T>,
  dependency: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timerId = window.setTimeout(() => {
      reject(new Error(`SECONDARY_WINDOW_${dependency}_TIMEOUT`));
    }, SECONDARY_WINDOW_DEPENDENCY_DEADLINE_MS);
    task.then(
      (value) => {
        window.clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timerId);
        reject(error);
      },
    );
  });

export { resolveDesktopSecondaryWindowKindFromLocation };

const readInitialSecondaryWindowTheme = (): ResolvedThemeMode => {
  if (typeof window === "undefined") {
    return "light";
  }
  const params = new URLSearchParams(window.location.search);
  const queryTheme = params.get(DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM);
  if (queryTheme === "dark") {
    return "dark";
  }
  if (queryTheme === "light") {
    return "light";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const readInitialSecondaryWindowLanguage = (): UiLanguage => {
  if (typeof window === "undefined") {
    return "en";
  }
  const value = new URLSearchParams(window.location.search).get(
    DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  );
  return value === "zh-CN" ||
    value === "en" ||
    value === "ko" ||
    value === "ja" ||
    value === "es"
    ? value
    : "en";
};

const DEFAULT_SECONDARY_WINDOW_VISUAL_CONTEXT: DesktopSecondaryWindowVisualContext = {
  language: readInitialSecondaryWindowLanguage(),
  themeMode: "system",
  resolvedThemeMode: readInitialSecondaryWindowTheme(),
  fontSizePreset: "STANDARD",
  showGlobalDecimals: true,
  priceColorMode: "RED_UP_GREEN_DOWN",
  tradeColorTheme: DEFAULT_TRADE_COLOR_THEME,
};

const normalizeThemeMode = (value: unknown): ThemeMode =>
  value === "light" || value === "dark" || value === "system"
    ? value
    : "system";

const normalizePriceColorMode = (value: unknown): PriceColorMode =>
  value === "GREEN_UP_RED_DOWN" || value === "RED_UP_GREEN_DOWN"
    ? value
    : "RED_UP_GREEN_DOWN";

const normalizeTradeColorTheme = (value: unknown): TradeColorThemeToken =>
  isTradeColorThemeToken(value) ? value : DEFAULT_TRADE_COLOR_THEME;

const normalizeShowGlobalDecimals = (value: unknown): boolean =>
  typeof value === "boolean" ? value : true;

const normalizeFontSizePreset = (value: unknown): FontSizePreset =>
  value === "SMALL" || value === "STANDARD" || value === "LARGE"
    ? value
    : "STANDARD";

const normalizeLanguage = (value: unknown): UiLanguage => {
  if (
    value === "zh-CN" ||
    value === "en" ||
    value === "ko" ||
    value === "ja" ||
    value === "es"
  ) {
    return value;
  }
  return "en";
};

const normalizeResolvedThemeMode = (
  value: unknown,
  themeMode: ThemeMode,
): ResolvedThemeMode => {
  if (value === "light" || value === "dark") {
    return value;
  }
  if (themeMode === "light" || themeMode === "dark") {
    return themeMode;
  }
  return "light";
};

const resolveSecondaryWindowPlatform = (): SecondaryWindowPlatform => {
  return readDesktopWindowChromePlatform();
};

const resolveSecondaryLocaleWidthProfile = (
  language: UiLanguage,
): LocaleWidthProfile =>
  language === "zh-CN" || language === "ko" || language === "ja"
    ? "compact"
    : "expanded";

const useDesktopSecondaryWindowVisualState = (
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
) => {
  const normalizedVisualContext = useMemo(() => {
    const base = visualContext ?? DEFAULT_SECONDARY_WINDOW_VISUAL_CONTEXT;
    const themeMode = normalizeThemeMode(base.themeMode);
    return {
      language: normalizeLanguage(base.language),
      themeMode,
      resolvedThemeMode: normalizeResolvedThemeMode(
        base.resolvedThemeMode,
        themeMode,
      ),
      showGlobalDecimals: normalizeShowGlobalDecimals(base.showGlobalDecimals),
      priceColorMode: normalizePriceColorMode(base.priceColorMode),
      tradeColorTheme: normalizeTradeColorTheme(base.tradeColorTheme),
      fontSizePreset: normalizeFontSizePreset(base.fontSizePreset),
    };
  }, [visualContext]);
  const {
    language,
    themeMode,
    resolvedThemeMode,
    showGlobalDecimals,
    priceColorMode,
    tradeColorTheme,
    fontSizePreset,
  } = normalizedVisualContext;
  const typographySystem = useMemo(
    () =>
      setGlobalTypographyContext({
        language,
        fontSizePreset,
      }),
    [fontSizePreset, language],
  );
  const localeWidthProfile = useMemo(
    () => resolveSecondaryLocaleWidthProfile(language),
    [language],
  );
  const rootStyle = useMemo(
    () =>
      ({
        "--viewport-scale": "1.0000",
        ...typographySystem.cssVariables,
        ...buildGlobalVisualCssVariables(
          resolvedThemeMode,
          priceColorMode,
          tradeColorTheme,
        ),
      }) as CSSProperties,
    [priceColorMode, resolvedThemeMode, tradeColorTheme, typographySystem],
  );

  useEffect(() => {
    setGlobalTradeColorTheme(tradeColorTheme);
  }, [tradeColorTheme]);

  useEffect(() => {
    setGlobalPriceColorMode(priceColorMode);
  }, [priceColorMode]);

  useEffect(() => {
    setGlobalDecimalDisplay(showGlobalDecimals);
  }, [showGlobalDecimals]);

  return {
    language,
    themeMode,
    resolvedThemeMode,
    showGlobalDecimals,
    priceColorMode,
    tradeColorTheme,
    fontSizePreset,
    localeWidthProfile,
    rootStyle,
  };
};

const useDesktopSecondaryWindowState = (
  kind: DesktopSecondaryWindowKind,
) => {
  const [state, setState] =
    useState<DesktopSecondaryWindowStatePayload | null>(null);
  const acceptedStateRef =
    useRef<DesktopSecondaryWindowStatePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let readyRequestTimerId: number | null = null;
    const clearReadyRequestTimer = () => {
      if (readyRequestTimerId !== null) {
        window.clearInterval(readyRequestTimerId);
        readyRequestTimerId = null;
      }
    };
    const deadlineTimerId = window.setTimeout(() => {
      if (!disposed) {
        clearReadyRequestTimer();
        setStatus("error");
      }
    }, SECONDARY_WINDOW_DEPENDENCY_DEADLINE_MS);
    setStatus("loading");
    const requestParentState = () => {
      void notifyDesktopSecondaryWindowReady(kind).catch(() => undefined);
    };
    void subscribeDesktopSecondaryWindowState(kind, (nextState) => {
      if (
        !disposed &&
        shouldAcceptDesktopSecondaryWindowState(
          acceptedStateRef.current,
          nextState,
        )
      ) {
        acceptedStateRef.current = nextState;
        clearReadyRequestTimer();
        window.clearTimeout(deadlineTimerId);
        setState(nextState);
        setStatus("ready");
      }
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
        requestParentState();
        readyRequestTimerId = window.setInterval(requestParentState, 250);
      })
      .catch((error) => {
        console.error("[desktop-secondary-window] state listener failed", {
          kind,
          error,
        });
        if (!disposed) {
          window.clearTimeout(deadlineTimerId);
          setStatus("error");
        }
      });
    return () => {
      disposed = true;
      window.clearTimeout(deadlineTimerId);
      clearReadyRequestTimer();
      unlisten?.();
    };
  }, [attempt, kind]);

  return {
    state,
    status,
    retry: () => setAttempt((current) => current + 1),
  };
};

const useDesktopSecondaryWindowRoute = (
  kind: DesktopSecondaryWindowKind,
  state: DesktopSecondaryWindowStatePayload | null,
) => {
  const [RouteComponent, setRouteComponent] =
    useState<SecondaryWindowRouteComponent | null>(null);
  const [routeStatus, setRouteStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const definition = useMemo(
    () => getDesktopSecondaryPopupDefinition(kind),
    [kind],
  );
  const shouldWarmRouteWithoutState =
    definition.warmPolicy === "idle-route" ||
    definition.warmPolicy === "keep-alive";

  useEffect(() => {
    if (!state && !shouldWarmRouteWithoutState) {
      setRouteStatus("idle");
      return;
    }
    if (RouteComponent) {
      setRouteStatus("ready");
      return;
    }

    let disposed = false;
    setRouteStatus("loading");
    void (async () => {
      try {
        const [, routeModule] = await settleSecondaryWindowDependencyWithin(
          Promise.all([definition.cssLoader(), definition.loader()]),
          "ROUTE",
        );
        if (disposed) {
          return;
        }
        setRouteComponent(() => routeModule.default);
        setRouteStatus("ready");
        void notifyDesktopSecondaryWindowRouteReady(kind).catch(
          () => undefined,
        );
      } catch (error) {
        console.error("[desktop-secondary-window] route load failed", {
          kind,
          error,
        });
        if (!disposed) {
          setRouteStatus("error");
          if (state) {
            void notifyDesktopSecondaryWindowContentReady(
              kind,
              state.revision,
            ).catch(() => undefined);
          }
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [definition, kind, RouteComponent, shouldWarmRouteWithoutState, state]);

  return { RouteComponent, routeStatus };
};

const SecondaryWindowContentReadySignal = ({
  kind,
  stateRevision,
}: {
  kind: DesktopSecondaryWindowKind;
  stateRevision: number;
}) => {
  useEffect(() => {
    // A native-hidden WKWebView does not tick requestAnimationFrame and may
    // throttle timers. This effect already lives inside the route Suspense
    // boundary, so reaching it proves the current revision committed.
    void notifyDesktopSecondaryWindowContentReady(kind, stateRevision).catch(
      () => undefined,
    );
  }, [kind, stateRevision]);

  return null;
};

export const DesktopSecondaryWindowRoot = ({
  kind,
}: {
  kind: DesktopSecondaryWindowKind;
}) => {
  const {
    clearPendingWindowDrag,
    continueWindowDrag,
    startWindowDrag,
    toggleWindowMaximize,
  } = useWindowChromeDrag();
  const {
    state,
    status: stateStatus,
    retry: retryState,
  } = useDesktopSecondaryWindowState(kind);
  const latestStateRef = useRef<DesktopSecondaryWindowStatePayload | null>(null);
  const latestStatePayloadRef =
    useRef<DesktopSecondaryWindowStatePayload["payload"]>(null);
  useEffect(() => {
    latestStateRef.current = state;
    latestStatePayloadRef.current = state?.payload ?? null;
  }, [state]);
  const popupDefinition = useMemo(
    () => getDesktopSecondaryPopupDefinition(kind),
    [kind],
  );
  const visualState = useDesktopSecondaryWindowVisualState(
    state?.visualContext,
  );
  const [localeReadyLanguage, setLocaleReadyLanguage] = useState<UiLanguage | null>(
    () =>
      isLocaleCatalogLoaded(visualState.language)
        ? visualState.language
        : null,
  );
  const [localeStatus, setLocaleStatus] = useState<"loading" | "ready" | "error">(
    localeReadyLanguage === visualState.language ? "ready" : "loading",
  );
  useEffect(() => {
    let disposed = false;
    setLocaleStatus("loading");
    // A locale catalog is a large, cacheable dynamic import. On a cold
    // WebView, parsing it can legitimately exceed the route/state deadline;
    // turning that healthy in-flight load into a terminal error was the cause
    // of the first language switch requiring a manual retry.
    void ensureLocaleCatalog(visualState.language).then(
      () => {
        if (!disposed) {
          setLocaleReadyLanguage(visualState.language);
          setLocaleStatus("ready");
        }
      },
      (error) => {
        console.error("[desktop-secondary-window] locale load failed", {
          language: visualState.language,
          error,
        });
        if (!disposed) {
          setLocaleStatus("error");
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [visualState.language]);
  const isLocaleReady =
    localeStatus === "ready" && localeReadyLanguage === visualState.language;
  const renderedLanguage = isLocaleReady
    ? visualState.language
    : localeReadyLanguage ?? visualState.language;
  useEffect(() => {
    // Keep legacy global translators aligned with the catalog that is actually
    // rendered. This prevents a route still using a global translator from
    // emitting raw keys while a replacement catalog is in flight.
    setCurrentUiLanguage(renderedLanguage, { source: "USER", storage: null });
  }, [renderedLanguage]);
  const { RouteComponent, routeStatus } = useDesktopSecondaryWindowRoute(
    kind,
    state,
  );
  const platform = useMemo(resolveSecondaryWindowPlatform, []);
  const dependencyFailed =
    stateStatus === "error" || routeStatus === "error" || localeStatus === "error";
  const contentFallback = (
    <SecondaryWindowLoadingSkeleton
      kind={kind}
      state={state}
      status={dependencyFailed ? "error" : "loading"}
      onRetry={() => {
        if (stateStatus === "error") {
          retryState();
          return;
        }
        window.location.reload();
      }}
      onClose={() => {
        void closeCurrentDesktopSecondaryWindow();
      }}
    />
  );

  useEffect(() => {
    if (!dependencyFailed || !state) {
      return;
    }
    void notifyDesktopSecondaryWindowContentReady(kind, state.revision).catch(
      () => undefined,
    );
  }, [dependencyFailed, kind, state]);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-zinuto-secondary-window-kind",
      kind,
    );
    document.documentElement.setAttribute(
      "data-zinuto-secondary-window-platform",
      platform,
    );
    return () => {
      document.documentElement.removeAttribute(
        "data-zinuto-secondary-window-kind",
      );
      document.documentElement.removeAttribute(
        "data-zinuto-secondary-window-platform",
      );
      const latestState = latestStateRef.current;
      if (latestState) {
        void sendDesktopSecondaryWindowRouteAction(
          latestState,
          "WINDOW_CLOSED",
          latestStatePayloadRef.current,
        ).catch(() => undefined);
      }
    };
  }, [kind, platform]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void notifyDesktopSecondaryWindowShellReady(kind).catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [kind]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void subscribeDesktopSecondaryWindowReuseCloseRequest(
      () =>
        popupDefinition.warmPolicy === "keep-alive" &&
        Boolean(latestStateRef.current),
      () => latestStateRef.current,
    )
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [kind, popupDefinition.warmPolicy]);

  const rootClassName = [
    "app-root",
    "desktop-secondary-window-root",
    `theme-${visualState.resolvedThemeMode}`,
    visualState.priceColorMode === "GREEN_UP_RED_DOWN"
      ? "price-scheme-green-up"
      : "price-scheme-red-up",
    `font-size-${visualState.fontSizePreset.toLowerCase()}`,
    "layout-regular",
  ]
    .filter(Boolean)
    .join(" ");
  const customWindowChromeEnabled = platform === "windows";
  const windowTitle =
    state?.title?.trim() ||
    document.documentElement.dataset.zinutoDesktopProductName?.trim() ||
    "Zinuto Core";

  return (
    <ThemeProvider
      mode={visualState.themeMode}
      resolvedMode={visualState.resolvedThemeMode}
    >
      <I18nProvider locale={renderedLanguage}>
        <div
          className={rootClassName}
          style={visualState.rootStyle}
          lang={renderedLanguage}
          data-ui-language={renderedLanguage}
          data-script-group={resolveTypographyScriptGroup(renderedLanguage)}
          data-locale-width-profile={visualState.localeWidthProfile}
          data-zinuto-secondary-window-platform={platform}
          data-zinuto-secondary-window-route-status={routeStatus}
          data-zinuto-window-chrome={
            customWindowChromeEnabled ? "windows" : undefined
          }
          onMouseDownCapture={
            customWindowChromeEnabled ? undefined : startWindowDrag
          }
          onMouseMoveCapture={
            customWindowChromeEnabled ? undefined : continueWindowDrag
          }
          onMouseUpCapture={
            customWindowChromeEnabled ? undefined : clearPendingWindowDrag
          }
          onMouseLeave={
            customWindowChromeEnabled ? undefined : clearPendingWindowDrag
          }
          onDoubleClickCapture={
            customWindowChromeEnabled ? undefined : toggleWindowMaximize
          }
        >
          <DesktopWindowChrome
            dragHandlers={{
              onMouseDownCapture: startWindowDrag,
              onMouseMoveCapture: continueWindowDrag,
              onMouseUpCapture: clearPendingWindowDrag,
              onMouseLeave: clearPendingWindowDrag,
              onDoubleClickCapture: toggleWindowMaximize,
            }}
            logoAlt={windowTitle}
            logoSrc={GRAPHIC_IMAGE_ASSET_URLS.brandLogoRounded}
            theme={visualState.resolvedThemeMode}
            title={windowTitle}
            variant="secondary"
          />
          {!state ||
          !RouteComponent ||
          (!isLocaleReady && localeReadyLanguage === null) ||
          dependencyFailed ? (
            contentFallback
          ) : (
            <Suspense fallback={contentFallback}>
              <RouteComponent
                kind={kind}
                state={state}
                language={renderedLanguage}
                themeMode={visualState.resolvedThemeMode}
                showGlobalDecimals={visualState.showGlobalDecimals}
                priceColorMode={visualState.priceColorMode}
                tradeColorTheme={visualState.tradeColorTheme}
              />
              <SecondaryWindowContentReadySignal
                kind={kind}
                stateRevision={state.revision}
              />
            </Suspense>
          )}
          <div id={APP_PORTAL_ROOT_ID} className="app-portal-root" />
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
};
