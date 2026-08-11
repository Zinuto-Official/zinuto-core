// SPDX-License-Identifier: GPL-3.0-only

import type { FontSizePreset } from "@/frontend-kernel/typography";
import "@/styles/index.css";
import {
  Component,
  createElement,
  type CSSProperties,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/ui/primitives/button';
import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import {
  DEFAULT_TRADE_COLOR_THEME,
  buildGlobalVisualCssVariables,
} from '@/ui/theme/visualColors';
import { buildTypographyCssVariables } from '@/frontend-kernel/typography';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { ensureLocaleCatalog } from '@zinuto/shared/i18n';
import {
  api,
  bootstrapInitialMainDesktopViewport,
  hasTauriRuntimeBridge,
  notifyDesktopMainWindowReadyToShow,
} from '@/api';
import { installDesktopInteractionPolicy } from '@/ui/desktopInteractionPolicy';
import { formatDotJoinedText } from '@/ui/formatting/i18nDisplay';
import { AppRootBootShell } from '@/app-shell/AppRootBootShell';
import {
  RetryableLazyModuleSurface,
  type RetryableLazyModuleError,
} from '@/frontend-kernel/RetryableLazyModuleSurface';
import {
  startNativeBackendStartupStatusWatcher,
} from '@/app-shell/nativeBackendStartupGate';
import { markStartupSurfaceVisible } from '@/app-shell/boot/startupPresentation';

type MainAppBootProps = Record<string, never>;

const loadMainAppBoot = async (): Promise<{
  default: ComponentType<MainAppBootProps>;
}> => {
  const module = await import("@/app-shell/MainAppBoot");
  return { default: module.MainAppBoot };
};

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  debugText: string | null;
  hasError: boolean;
};

const buildFatalDebugText = (error: unknown, componentStack = ''): string =>
  [
    error instanceof Error ? error.stack || error.message : String(error),
    componentStack,
  ]
    .filter(Boolean)
    .join('\n\n');

const RESIZE_OBSERVER_LOOP_ERROR_MESSAGES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);

const getErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};

const isResizeObserverLoopError = (value: unknown): boolean =>
  RESIZE_OBSERVER_LOOP_ERROR_MESSAGES.has(getErrorMessage(value).trim());

const isResizeObserverLoopErrorEvent = (event: ErrorEvent): boolean =>
  isResizeObserverLoopError(event.error) ||
  isResizeObserverLoopError(event.message);

const installResizeObserverLoopErrorGuard = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.addEventListener(
    'error',
    (event) => {
      if (!isResizeObserverLoopErrorEvent(event)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
};

const resolveFallbackThemeMode = (): 'light' | 'dark' => {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (
      root.classList.contains('theme-dark') ||
      root.getAttribute('data-theme') === 'dark'
    ) {
      return 'dark';
    }
    if (
      root.classList.contains('theme-light') ||
      root.getAttribute('data-theme') === 'light'
    ) {
      return 'light';
    }
    if (root.dataset.zinutoInitialTheme === 'dark') {
      return 'dark';
    }
    if (root.dataset.zinutoInitialTheme === 'light') {
      return 'light';
    }
  }
  return 'light';
};

const resolveFallbackFontSizePreset = (): FontSizePreset => {
  if (typeof document === 'undefined') {
    return 'STANDARD';
  }
  const classTargets = [
    document.documentElement,
    document.body,
    document.querySelector('.app-root'),
  ];
  if (classTargets.some((target) => target?.classList.contains('font-size-small'))) {
    return 'SMALL';
  }
  if (classTargets.some((target) => target?.classList.contains('font-size-large'))) {
    return 'LARGE';
  }
  return 'STANDARD';
};

const buildFatalFallbackStyle = (): CSSProperties => {
  const themeMode = resolveFallbackThemeMode();
  const theme = GLOBAL_COLOR_ARCHITECTURE[themeMode];
  return {
    ...buildTypographyCssVariables({
      language: getCurrentUiLanguage(),
      fontSizePreset: resolveFallbackFontSizePreset(),
    }),
    ...buildGlobalVisualCssVariables(
      themeMode,
      'RED_UP_GREEN_DOWN',
      DEFAULT_TRADE_COLOR_THEME,
    ),
    minHeight: '100vh',
    background:
      `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${theme.actions.a1} 10%, transparent) 0%, transparent 48%), ${theme.surfaces.s1}`,
    color: theme.text.t1,
    padding: '24px',
    fontFamily: 'var(--ff-ui)',
    display: 'grid',
    gap: '16px',
    alignContent: 'start',
  };
};

class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = {
    debugText: null,
    hasError: false,
  };

  private _cleanup?: () => void;

  componentDidMount() {
    if (typeof window === 'undefined') {
      return;
    }
    const onWindowError = (event: ErrorEvent) => {
      if (isResizeObserverLoopErrorEvent(event)) {
        event.preventDefault();
        return;
      }
      const errorText =
        event.error instanceof Error
          ? event.error.stack || event.error.message
          : String(event.message || 'Unknown window error');
      // Errors outside React are not proof that the mounted application tree is
      // unusable. Keep the current surface interactive and preserve diagnostics;
      // render failures are still handled by componentDidCatch below.
      console.error('[zinuto-frontend-window-error]', errorText);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorText =
        event.reason instanceof Error
          ? event.reason.stack || event.reason.message
          : String(event.reason || 'Unknown unhandled rejection');
      console.error('[zinuto-frontend-unhandled-rejection]', errorText);
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    this._cleanup = () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }

  componentWillUnmount() {
    this._cleanup?.();
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const debugText = import.meta.env.DEV
      ? buildFatalDebugText(error, info.componentStack || '')
      : null;
    this.setState((currentState) => {
      if (currentState.hasError) {
        return null;
      }
      return { debugText, hasError: true };
    });
    console.error(
      '[zinuto-frontend-fatal]',
      debugText || (error instanceof Error ? error.message : String(error)),
    );
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const fallbackThemeMode = resolveFallbackThemeMode();
    const fallbackTheme = GLOBAL_COLOR_ARCHITECTURE[fallbackThemeMode];
    return createElement(
      'div',
      {
        className: `app-root theme-${fallbackThemeMode}`,
        style: {
          ...buildFatalFallbackStyle(),
        },
      },
      createElement(
        'strong',
        {
          style: {
            fontSize: 'var(--ty-r5)',
            fontFamily: 'var(--ff-display)',
            lineHeight: 'var(--ty-leading-title)',
            letterSpacing: 'var(--ty-tracking-title)',
          },
        },
        tt('common.status.loadFailed'),
      ),
      createElement(
        Button,
        {
          className: 'w-fit',
          onClick: () => {
            window.location.reload();
          },
          type: 'button',
        },
        tt('appText.retry'),
      ),
      import.meta.env.DEV && this.state.debugText
        ? createElement(
            'pre',
            {
              style: {
                whiteSpace: 'pre-wrap',
                margin: 0,
                padding: '16px',
                borderRadius: '12px',
                background: `color-mix(in srgb, ${fallbackTheme.surfaces.s2} 92%, ${fallbackTheme.surfaces.s1})`,
                border: `1px solid color-mix(in srgb, ${fallbackTheme.surfaces.s4} 82%, transparent)`,
                fontFamily: 'var(--ff-mono)',
                fontSize: 'var(--ty-r2)',
                lineHeight: 'var(--ty-leading-body)',
              },
            },
            this.state.debugText,
          )
        : null,
    );
  }
}

const bootstrapDesktopViewport = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }
  await bootstrapInitialMainDesktopViewport();
};

const waitForAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });

const waitForAppRootElement = async (timeoutMs = 2_000): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (!document.querySelector('.app-root') && Date.now() < deadline) {
    await waitForAnimationFrame();
  }
};

const notifyMainWindowReadyAfterStableBootPaint = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }
  await waitForAppRootElement();
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  // The rendered surface is already stable at this point. Do not make the
  // startup overlay depend on a native window acknowledgement: a delayed or
  // lost invoke response must not leave a usable app covered forever.
  markStartupSurfaceVisible();
  await settleStartupTaskWithin(
    'main window ready notification',
    notifyDesktopMainWindowReadyToShow(),
  );
};

const renderBackendStartupFailure = (status: {
  stage?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) => {
  const diagnostic = formatDotJoinedText(getCurrentUiLanguage(), [
    status.stage || 'unknown',
    status.errorCode || status.errorMessage || 'BACKEND_NOT_READY',
  ]);
  getAppRoot().render(
    createElement(AppRootBootShell, {
      failure: {
        actionLabel: tt('appText.retry'),
        body: tt('appText.desktopStartupFailedBody'),
        diagnostic,
        onAction: () => api.restartDesktopApp(),
        title: tt('appText.desktopStartupFailedTitle'),
      },
    }),
  );
};

let appRoot: ReturnType<typeof createRoot> | null = null;
let renderedBackendStartupStage: string | null = null;
let renderedMainApp = false;

const getAppRoot = () => {
  if (!appRoot) {
    appRoot = createRoot(document.getElementById('root')!);
  }
  return appRoot;
};

const renderBackendStartupPending = (stage = ''): void => {
  const normalizedStage = stage.trim();
  if (renderedBackendStartupStage === normalizedStage) {
    return;
  }
  renderedBackendStartupStage = normalizedStage;
  getAppRoot().render(
    createElement(AppRootBootShell, {
      nativeBackendStage: normalizedStage || null,
    }),
  );
};

const NATIVE_BACKEND_STATUS_READ_DEADLINE_MS = 2_000;

const readNativeBackendStartupPreflightWithinDeadline = async () => {
  let timeoutId = 0;
  try {
    return await Promise.race([
      api.getNativeBackendStartupPreflightStatus().catch(() => null),
      new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve(null),
          NATIVE_BACKEND_STATUS_READ_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};

let disposeNativeBackendStartupWatcher: (() => void) | null = null;

const watchNativeBackendStartupPreflight = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  disposeNativeBackendStartupWatcher?.();
  const watcher = startNativeBackendStartupStatusWatcher({
    listenStatus: api.subscribeToNativeBackendStartupPreflightStatus,
    onFailed: renderBackendStartupFailure,
    onPending: renderBackendStartupPending,
    onReady: renderApp,
    readStatus: readNativeBackendStartupPreflightWithinDeadline,
  });
  const dispose = (): void => {
    watcher.dispose();
    window.removeEventListener('beforeunload', dispose);
    if (disposeNativeBackendStartupWatcher === dispose) {
      disposeNativeBackendStartupWatcher = null;
    }
  };
  disposeNativeBackendStartupWatcher = dispose;
  window.addEventListener('beforeunload', dispose, { once: true });
  void watcher.initialRead.catch(() => undefined);
};

const renderApp = () => {
  if (renderedMainApp) {
    return;
  }
  renderedMainApp = true;
  renderedBackendStartupStage = null;
  getAppRoot().render(
    createElement(
      RootErrorBoundary,
      null,
      createElement(
        RetryableLazyModuleSurface<MainAppBootProps>,
        {
          componentProps: {},
          fallback: createElement(AppRootBootShell),
          loader: loadMainAppBoot,
          moduleName: 'MAIN_APP_BOOT',
          renderError: ({ retry }: RetryableLazyModuleError) =>
            createElement(AppRootBootShell, {
              failure: {
                actionLabel: tt('appText.retry'),
                body: tt('appText.desktopStartupFailedBody'),
                onAction: retry,
                title: tt('common.status.loadFailed'),
              },
            }),
        },
      ),
    ),
  );
};

const STARTUP_TASK_DEADLINE_MS = 1_500;

const settleStartupTaskWithin = async (
  label: string,
  task: Promise<unknown>,
): Promise<void> => {
  let timeoutId = 0;
  const settledTask = task.catch((error) => {
    console.warn(`[zinuto-startup] ${label} failed; continuing with fallback`, error);
  });
  await Promise.race([
    settledTask,
    new Promise<void>((resolve) => {
      timeoutId = window.setTimeout(() => {
        console.warn(`[zinuto-startup] ${label} exceeded startup deadline`);
        resolve();
      }, STARTUP_TASK_DEADLINE_MS);
    }),
  ]);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }
};

const startApp = async (): Promise<void> => {
  installDesktopInteractionPolicy(document, {
    allowGlobalTextSelection: import.meta.env.DEV,
  });
  await Promise.all([
    settleStartupTaskWithin('viewport bootstrap', bootstrapDesktopViewport()),
    settleStartupTaskWithin(
      'locale bootstrap',
      ensureLocaleCatalog(getCurrentUiLanguage()),
    ),
  ]);
  if (!hasTauriRuntimeBridge(window)) {
    renderApp();
  } else {
    renderBackendStartupPending();
    watchNativeBackendStartupPreflight();
  }
  void notifyMainWindowReadyAfterStableBootPaint().catch(() => undefined);
};

installResizeObserverLoopErrorGuard();
void startApp();
