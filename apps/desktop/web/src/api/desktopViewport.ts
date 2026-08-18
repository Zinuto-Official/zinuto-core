// SPDX-License-Identifier: GPL-3.0-only

import {
  createTauriUnlistenCleanup,
  runTauriUnlistenSafely,
  type TauriUnlistenFn,
} from "@/frontend-kernel/tauriEventCleanup";
import {
  DESKTOP_MAIN_WINDOW_ZOOM_BASE,
  type DesktopWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import {
  isTauriRuntime,
  loadTauriCoreModule,
  loadTauriEventModule,
  loadTauriWebviewModule,
  loadTauriWindowModule,
} from "@/api/desktopNativeBridge";

let lastAppliedDesktopWebviewZoom: number | null = null;
let desktopWebviewZoomRequestRevision = 0;
let desktopWebviewZoomApplyQueue: Promise<void> = Promise.resolve();
let latestDesktopWebviewZoomRequest:
  | { kind: "apply"; base: DesktopWindowZoomBase }
  | { kind: "reset" }
  | null = null;
let mainWindowReadyToShowSent = false;
const DESKTOP_VIEWPORT_NATIVE_OPERATION_DEADLINE_MS = 1_500;

export type DesktopViewportLayoutMode = "normal" | "constrained" | "tight";

export type DesktopAppliedWebviewZoom = {
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
};

export type DesktopViewportBootstrapState = {
  logicalWidth: number;
  logicalHeight: number;
  zoomScale: number;
  cssViewportScale: number;
  layoutMode: DesktopViewportLayoutMode;
  source: "tauri" | "browser";
};

const settleDesktopViewportTaskWithin = <T>(
  task: Promise<T>,
  fallback: T,
  onLateSettlement: () => void,
  deadlineMs = DESKTOP_VIEWPORT_NATIVE_OPERATION_DEADLINE_MS,
): Promise<T> =>
  new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      timedOut = true;
      resolve(fallback);
    }, Math.max(0, deadlineMs));
    task.then(
      (value) => {
        if (settled) {
          if (timedOut) {
            onLateSettlement();
          }
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) {
          if (timedOut) {
            onLateSettlement();
          }
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

const reapplyLatestDesktopWebviewZoomRequest = (
  forceNativeApply = false,
): void => {
  const latestRequest = latestDesktopWebviewZoomRequest;
  if (!latestRequest) {
    return;
  }
  if (latestRequest.kind === "reset") {
    void resetDesktopWebviewZoom();
    return;
  }
  if (forceNativeApply) {
    // A stale setZoom call may settle after the latest request already updated
    // this cache. Clear it so the corrective request cannot incorrectly skip
    // the native write based on stale bookkeeping.
    lastAppliedDesktopWebviewZoom = null;
  }
  void applyDesktopWebviewZoom(latestRequest.base);
};

type DesktopViewportBootstrapOptions = {
  applyZoom?: boolean;
  retryCount?: number;
  retryDelayMs?: number;
};

let cachedMainDesktopViewportState: DesktopViewportBootstrapState | null = null;
let initialMainDesktopViewportBootstrapPromise:
  | Promise<DesktopViewportBootstrapState>
  | null = null;

const clampDesktopScale = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const normalizeDesktopWindowZoomBase = ({
  designWidth,
  designHeight,
  densityScale = 1,
  minScale = 0.56,
  maxScale = 1,
}: DesktopWindowZoomBase): Required<DesktopWindowZoomBase> => ({
  designWidth: Number.isFinite(designWidth) && designWidth > 0
    ? designWidth
    : 1560,
  designHeight: Number.isFinite(designHeight) && designHeight > 0
    ? designHeight
    : 980,
  densityScale:
    Number.isFinite(densityScale) && densityScale > 0 ? densityScale : 1,
  minScale,
  maxScale,
});

const resolveDesktopViewportScale = (
  base: DesktopWindowZoomBase,
  logicalWidth: number,
  logicalHeight: number,
): number => {
  const zoomBase = normalizeDesktopWindowZoomBase(base);
  return clampDesktopScale(
    Math.min(
      logicalWidth / zoomBase.designWidth,
      logicalHeight / zoomBase.designHeight,
    ) * zoomBase.densityScale,
    zoomBase.minScale,
    zoomBase.maxScale,
  );
};

export const resolveDesktopViewportLayoutMode = (
  width: number,
  height: number,
): DesktopViewportLayoutMode => {
  const isTight = width < 1240 || height < 760;
  const isConstrained = isTight || width < 1420 || height < 860;
  return isTight ? "tight" : isConstrained ? "constrained" : "normal";
};

export const resolveBrowserDesktopViewportScale = (
  base: DesktopWindowZoomBase = DESKTOP_MAIN_WINDOW_ZOOM_BASE,
  width = typeof window === "undefined" ? base.designWidth : window.innerWidth,
  height = typeof window === "undefined" ? base.designHeight : window.innerHeight,
): number => resolveDesktopViewportScale(base, width, height);

export const buildBrowserDesktopViewportState = (
  base: DesktopWindowZoomBase = DESKTOP_MAIN_WINDOW_ZOOM_BASE,
): DesktopViewportBootstrapState => {
  const zoomBase = normalizeDesktopWindowZoomBase(base);
  const logicalWidth =
    typeof window === "undefined" ? zoomBase.designWidth : window.innerWidth;
  const logicalHeight =
    typeof window === "undefined" ? zoomBase.designHeight : window.innerHeight;
  return {
    logicalWidth,
    logicalHeight,
    zoomScale: 1,
    cssViewportScale: resolveBrowserDesktopViewportScale(
      zoomBase,
      logicalWidth,
      logicalHeight,
    ),
    layoutMode: resolveDesktopViewportLayoutMode(logicalWidth, logicalHeight),
    source: "browser",
  };
};

const buildTauriDesktopViewportState = (
  viewport: DesktopAppliedWebviewZoom,
): DesktopViewportBootstrapState => ({
  logicalWidth: viewport.logicalWidth,
  logicalHeight: viewport.logicalHeight,
  zoomScale: viewport.scale,
  cssViewportScale: 1,
  layoutMode: resolveDesktopViewportLayoutMode(
    viewport.logicalWidth,
    viewport.logicalHeight,
  ),
  source: "tauri",
});

const waitForDesktopViewportRetry = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, delayMs);
  });

export const cacheMainDesktopViewportState = (
  state: DesktopViewportBootstrapState,
): DesktopViewportBootstrapState => {
  cachedMainDesktopViewportState = state;
  return state;
};

export const readMainDesktopViewportState =
  (): DesktopViewportBootstrapState =>
    cachedMainDesktopViewportState ?? buildBrowserDesktopViewportState();

export const applyDesktopWebviewZoom = async (
  base: DesktopWindowZoomBase,
): Promise<DesktopAppliedWebviewZoom | null> => {
  if (!isTauriRuntime()) {
    return null;
  }

  latestDesktopWebviewZoomRequest = { kind: "apply", base };
  const requestRevision = ++desktopWebviewZoomRequestRevision;
  const applyLatestViewport = async (): Promise<DesktopAppliedWebviewZoom | null> => {
    try {
      const viewport = await readDesktopWebviewViewport(base);
      if (!viewport || requestRevision !== desktopWebviewZoomRequestRevision) {
        return null;
      }
      const webviewMod = await loadTauriWebviewModule();
      if (requestRevision !== desktopWebviewZoomRequestRevision) {
        return null;
      }

      if (
        lastAppliedDesktopWebviewZoom === null ||
        Math.abs(lastAppliedDesktopWebviewZoom - viewport.scale) >= 0.001
      ) {
        await webviewMod.getCurrentWebview().setZoom(viewport.scale);
        if (requestRevision !== desktopWebviewZoomRequestRevision) {
          return null;
        }
        lastAppliedDesktopWebviewZoom = viewport.scale;
      }

      return viewport;
    } catch {
      return null;
    }
  };

  const runBoundedViewportApply = () =>
    settleDesktopViewportTaskWithin(
      applyLatestViewport(),
      null,
      () => {
        if (requestRevision !== desktopWebviewZoomRequestRevision) {
          reapplyLatestDesktopWebviewZoomRequest(true);
        }
      },
    );
  const request = desktopWebviewZoomApplyQueue.then(
    runBoundedViewportApply,
    runBoundedViewportApply,
  );
  desktopWebviewZoomApplyQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
};

const readDesktopWebviewViewport = async (
  base: DesktopWindowZoomBase,
): Promise<DesktopAppliedWebviewZoom | null> => {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const windowMod = await loadTauriWindowModule();
    const currentWindow = windowMod.getCurrentWindow();
    const [physicalSize, scaleFactorRaw] = await Promise.all([
      currentWindow.innerSize(),
      currentWindow.scaleFactor(),
    ]);
    const scaleFactor =
      Number.isFinite(scaleFactorRaw) && scaleFactorRaw > 0
        ? scaleFactorRaw
        : 1;
    const logicalWidth =
      Math.max(0, Number(physicalSize.width) || 0) / scaleFactor;
    const logicalHeight =
      Math.max(0, Number(physicalSize.height) || 0) / scaleFactor;
    const nextScale = resolveDesktopViewportScale(
      base,
      logicalWidth,
      logicalHeight,
    );

    return {
      logicalWidth,
      logicalHeight,
      scale: nextScale,
    };
  } catch {
    return null;
  }
};

export const measureDesktopWebviewViewport = async (
  base: DesktopWindowZoomBase,
): Promise<DesktopAppliedWebviewZoom | null> => readDesktopWebviewViewport(base);

export const bootstrapMainDesktopViewport = async (
  base: DesktopWindowZoomBase = DESKTOP_MAIN_WINDOW_ZOOM_BASE,
  options: DesktopViewportBootstrapOptions = {},
): Promise<DesktopViewportBootstrapState> => {
  if (!isTauriRuntime()) {
    return cacheMainDesktopViewportState(buildBrowserDesktopViewportState(base));
  }

  const retryCount = Math.max(0, Math.floor(options.retryCount ?? 0));
  const retryDelayMs = Math.max(0, Math.floor(options.retryDelayMs ?? 16));
  const shouldApplyZoom = options.applyZoom ?? true;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const tauriViewport = shouldApplyZoom
      ? await applyDesktopWebviewZoom(base)
      : await measureDesktopWebviewViewport(base);
    if (tauriViewport) {
      return cacheMainDesktopViewportState(
        buildTauriDesktopViewportState(tauriViewport),
      );
    }
    if (attempt < retryCount) {
      await waitForDesktopViewportRetry(retryDelayMs);
    }
  }

  if (cachedMainDesktopViewportState) {
    return cachedMainDesktopViewportState;
  }
  return cacheMainDesktopViewportState(buildBrowserDesktopViewportState(base));
};

export const bootstrapInitialMainDesktopViewport =
  (): Promise<DesktopViewportBootstrapState> => {
    if (!initialMainDesktopViewportBootstrapPromise) {
      initialMainDesktopViewportBootstrapPromise =
        bootstrapMainDesktopViewport(DESKTOP_MAIN_WINDOW_ZOOM_BASE, {
          retryCount: 8,
          retryDelayMs: 24,
        });
    }
    return initialMainDesktopViewportBootstrapPromise;
  };

export const resetDesktopWebviewZoom = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  latestDesktopWebviewZoomRequest = { kind: "reset" };
  const requestRevision = ++desktopWebviewZoomRequestRevision;
  const resetLatestZoom = async (): Promise<void> => {
    try {
      const webviewMod = await loadTauriWebviewModule();
      if (requestRevision !== desktopWebviewZoomRequestRevision) {
        return;
      }
      await webviewMod.getCurrentWebview().setZoom(1);
      if (requestRevision === desktopWebviewZoomRequestRevision) {
        lastAppliedDesktopWebviewZoom = 1;
      }
    } catch {
      // Ignore zoom reset failures outside the active desktop runtime.
    }
  };
  const runBoundedZoomReset = () =>
    settleDesktopViewportTaskWithin(
      resetLatestZoom(),
      undefined,
      () => {
        if (requestRevision !== desktopWebviewZoomRequestRevision) {
          reapplyLatestDesktopWebviewZoomRequest(true);
        }
      },
    );
  const request = desktopWebviewZoomApplyQueue.then(
    runBoundedZoomReset,
    runBoundedZoomReset,
  );
  desktopWebviewZoomApplyQueue = request.then(
    () => undefined,
    () => undefined,
  );
  await request;
};

export const notifyDesktopMainWindowReadyToShow = async (): Promise<void> => {
  if (!isTauriRuntime() || mainWindowReadyToShowSent) {
    return;
  }

  mainWindowReadyToShowSent = true;
  try {
    const coreModule = await loadTauriCoreModule();
    await coreModule.invoke("main_window_ready_to_show");
  } catch (error) {
    mainWindowReadyToShowSent = false;
    throw error;
  }
};

export type DesktopMainWindowCloseRequestEvent = {
  requestId: string;
};

export const subscribeDesktopMainWindowCloseRequested = async (
  handler: (event: DesktopMainWindowCloseRequestEvent) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  const eventModule = await loadTauriEventModule();
  const unlisten = await eventModule.listen<{ requestId?: unknown }>(
    "zinuto://v1/desktop-main-window-close-requested",
    (event) => {
      const requestId = String(event.payload?.requestId ?? "").trim();
      if (requestId) {
        handler({ requestId });
      }
    },
  );
  return createTauriUnlistenCleanup(unlisten);
};

export const subscribeDesktopViewportChanges = async (
  onChange: () => void,
): Promise<() => void> => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const notify = () => {
    onChange();
  };

  let disposed = false;
  let browserResizeAttached = false;
  let unlistenWindowResize: TauriUnlistenFn | null = null;
  let unlistenScaleChange: TauriUnlistenFn | null = null;

  const attachBrowserResizeFallback = () => {
    if (disposed || browserResizeAttached) {
      return;
    }
    browserResizeAttached = true;
    window.addEventListener("resize", notify);
  };

  const listenerRegistrationDeadlineAt =
    Date.now() + DESKTOP_VIEWPORT_NATIVE_OPERATION_DEADLINE_MS;
  const registerNativeListenerWithinDeadline = (
    task: Promise<TauriUnlistenFn>,
  ): Promise<TauriUnlistenFn | null> =>
    new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(null);
      }, Math.max(0, listenerRegistrationDeadlineAt - Date.now()));
      task.then(
        (unlisten) => {
          if (settled) {
            runTauriUnlistenSafely(unlisten);
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          resolve(unlisten);
        },
        () => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          resolve(null);
        },
      );
    });

  // Browser resize is the guaranteed path and must be live before any native
  // module or listener registration can stall. Native events remain useful for
  // scale-factor changes that do not produce a browser resize.
  attachBrowserResizeFallback();

  if (isTauriRuntime()) {
    try {
      const windowMod = await settleDesktopViewportTaskWithin(
        loadTauriWindowModule(),
        null,
        () => undefined,
        listenerRegistrationDeadlineAt - Date.now(),
      );
      if (!windowMod || Date.now() >= listenerRegistrationDeadlineAt) {
        return () => {
          disposed = true;
          if (browserResizeAttached) {
            window.removeEventListener("resize", notify);
          }
        };
      }
      const currentWindow = windowMod.getCurrentWindow();
      const [nextWindowResizeUnlisten, nextScaleChangeUnlisten] =
        await Promise.all([
          registerNativeListenerWithinDeadline(
            currentWindow.onResized(() => {
              notify();
            }),
          ),
          registerNativeListenerWithinDeadline(
            currentWindow.onScaleChanged(() => {
              notify();
            }),
          ),
        ]);
      if (!disposed) {
        unlistenWindowResize = nextWindowResizeUnlisten;
        unlistenScaleChange = nextScaleChangeUnlisten;
      } else {
        runTauriUnlistenSafely(nextWindowResizeUnlisten);
        runTauriUnlistenSafely(nextScaleChangeUnlisten);
      }
    } catch {
      // The browser listener installed above remains authoritative.
    }
  }

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (browserResizeAttached) {
      window.removeEventListener("resize", notify);
    }
    runTauriUnlistenSafely(unlistenWindowResize);
    runTauriUnlistenSafely(unlistenScaleChange);
  };
};
