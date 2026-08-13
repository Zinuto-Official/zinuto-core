// SPDX-License-Identifier: GPL-3.0-only

import {
  createTauriUnlistenCleanup,
  settleTauriTaskWithinDeadline,
} from "@/frontend-kernel/tauriEventCleanup";
import {
  createDesktopSecondaryWindowStateEmitter,
  createDesktopSecondaryWindowStateStore,
  isDesktopSecondaryWindowActionIdentityCurrent,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel";
import {
  createDesktopSecondaryWindowActionRequestId,
  retryDesktopSecondaryWindowActionAckDelivery,
  waitForDesktopSecondaryWindowActionAck,
  type DesktopSecondaryWindowActionAck,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck";
import {
  DESKTOP_SECONDARY_WINDOW_KINDS,
  resolveDesktopSecondaryWindowGeometry,
  type DesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import {
  isDesktopSecondaryWindowKind,
  type DesktopSecondaryWindowStatePayload,
  type DesktopSecondaryWindowVisualContext,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import {
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  type DesktopSecondaryWindowActionPayload,
  type DesktopSecondaryWindowSyncPolicy,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionProtocol";
export {
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  isDesktopSecondaryWindowLifecycleAction,
  type DesktopSecondaryWindowActionPayload,
  type DesktopSecondaryWindowSyncMode,
  type DesktopSecondaryWindowSyncPolicy,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionProtocol";
import { GLOBAL_COLOR_ARCHITECTURE } from "@/ui/theme/visualColors";
import {
  isTauriRuntime,
  loadTauriCoreModule,
  loadTauriEventModule,
  loadTauriWebviewWindowModule,
  loadTauriWindowModule,
} from "@/api/desktopNativeBridge";
import {
  applyDesktopSecondaryWindowGeometry,
  positionDesktopOnboardingSidecar as positionDesktopOnboardingSidecarForLabel,
  positionDesktopSecondaryWindowAtMainCenter,
  resolveDesktopSecondaryWindowGeometryForCurrentMonitor,
  type DesktopOnboardingSidecarTargetRect,
} from "@/api/desktopSecondaryWindowGeometry";
import { createDesktopSecondaryWindowFocusRuntime } from "@/api/desktopSecondaryWindowFocusRuntime";
import { createDesktopSecondaryWindowListenerRuntime } from "@/api/desktopSecondaryWindowListeners";
import { buildDesktopSecondaryWindowUrl } from "@/api/desktopSecondaryWindowUrl";
import { readDesktopWindowChromePlatform } from "@/api/desktopWindowChrome";

export {
  resizeCurrentDesktopSecondaryWindowToGeometry,
  type DesktopOnboardingSidecarTargetRect,
} from "@/api/desktopSecondaryWindowGeometry";

export type DesktopSecondaryWindowActionAckPayload =
  DesktopSecondaryWindowActionAck & {
    kind: DesktopSecondaryWindowKind;
  };

export type OpenDesktopSecondaryWindowInput = {
  kind: DesktopSecondaryWindowKind;
  title: string;
  payload?: unknown;
};

const DESKTOP_SECONDARY_WINDOW_READY_EVENT =
  "zinuto://desktop-secondary-window-ready";
const DESKTOP_SECONDARY_WINDOW_SHELL_READY_EVENT =
  "zinuto://desktop-secondary-window-shell-ready";
const DESKTOP_SECONDARY_WINDOW_ROUTE_READY_EVENT =
  "zinuto://desktop-secondary-window-route-ready";
const DESKTOP_SECONDARY_WINDOW_CONTENT_READY_EVENT =
  "zinuto://desktop-secondary-window-content-ready";
const DESKTOP_SECONDARY_WINDOW_STATE_EVENT =
  "zinuto://desktop-secondary-window-state";
const DESKTOP_SECONDARY_WINDOW_ACTION_EVENT =
  "zinuto://desktop-secondary-window-action";
const DESKTOP_SECONDARY_WINDOW_ACTION_ACK_EVENT =
  "zinuto://desktop-secondary-window-action-ack";

const DESKTOP_SECONDARY_WINDOW_ACTION_ACK_TIMEOUT_MS = 5_000;

const DESKTOP_SECONDARY_WINDOW_BACKGROUND_COLOR = {
  light: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s1,
  dark: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1,
} as const;
const DESKTOP_SECONDARY_WINDOW_NATIVE_TITLE = "";

type DesktopSecondaryWindowNativeChromeTarget = {
  setTitle: (title: string) => Promise<void>;
};

const resolveDesktopSecondaryWindowInitialTheme = (
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
): DesktopSecondaryWindowVisualContext["resolvedThemeMode"] =>
  visualContext?.resolvedThemeMode === "dark" ? "dark" : "light";

const resolveDesktopSecondaryWindowBackgroundColor = (
  visualContext: DesktopSecondaryWindowVisualContext | null | undefined,
): string =>
  DESKTOP_SECONDARY_WINDOW_BACKGROUND_COLOR[
    resolveDesktopSecondaryWindowInitialTheme(visualContext)
  ];

const clearDesktopSecondaryWindowNativeChrome = async (
  windowRef: DesktopSecondaryWindowNativeChromeTarget,
): Promise<void> => {
  await windowRef
    .setTitle(DESKTOP_SECONDARY_WINDOW_NATIVE_TITLE)
    .catch(() => undefined);
};

const desktopSecondaryWindowStateStore = createDesktopSecondaryWindowStateStore<
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowVisualContext
>();
const desktopSecondaryWarmWindowLru = new Map<
  DesktopSecondaryWindowKind,
  number
>();
const DESKTOP_SECONDARY_WARM_WINDOW_LIMIT = 3;
const DESKTOP_SECONDARY_WARM_WINDOW_TTL_MS = 10 * 60 * 1000;
const DESKTOP_SECONDARY_HOST_MODULE_DEADLINE_MS = 4_000;
const DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS = 1_200;
const DESKTOP_SECONDARY_VISIBLE_READY_DEADLINE_MS = 8_000;
const DESKTOP_SECONDARY_VISIBLE_READY_POLL_MS = 80;

export const getDesktopSecondaryWindowLabel = (
  kind: DesktopSecondaryWindowKind,
): string => `workspace-${kind.toLowerCase().replaceAll("_", "-")}`;

const markDesktopSecondaryWarmWindow = (
  kind: DesktopSecondaryWindowKind,
): void => {
  desktopSecondaryWarmWindowLru.set(kind, Date.now());
};

const forgetDesktopSecondaryWarmWindow = (
  kind: DesktopSecondaryWindowKind,
): void => {
  desktopSecondaryWarmWindowLru.delete(kind);
};

const destroyDesktopSecondaryWindowByKind = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  const existingWindow = await getDesktopSecondaryWindowByLabel(kind);
  await existingWindow?.destroy().catch(() => undefined);
  forgetDesktopSecondaryWarmWindow(kind);
  desktopSecondaryWindowFocusRuntime.clearPending(kind);
};

const trimDesktopSecondaryWarmWindows = async (): Promise<void> => {
  if (!desktopSecondaryWarmWindowLru.size) {
    return;
  }
  const now = Date.now();
  const expiredKinds = Array.from(desktopSecondaryWarmWindowLru.entries())
    .filter(
      ([, touchedAt]) =>
        now - touchedAt >= DESKTOP_SECONDARY_WARM_WINDOW_TTL_MS,
    )
    .map(([kind]) => kind);
  for (const kind of expiredKinds) {
    await destroyDesktopSecondaryWindowByKind(kind);
  }

  const overflowKinds = Array.from(desktopSecondaryWarmWindowLru.entries())
    .sort((left, right) => left[1] - right[1])
    .slice(
      0,
      Math.max(
        0,
        desktopSecondaryWarmWindowLru.size -
          DESKTOP_SECONDARY_WARM_WINDOW_LIMIT,
      ),
    )
    .map(([kind]) => kind);
  for (const kind of overflowKinds) {
    await destroyDesktopSecondaryWindowByKind(kind);
  }
};

const getDesktopSecondaryWindowByLabel = async (
  kind: DesktopSecondaryWindowKind,
) => {
  const webviewWindowModule = await loadTauriWebviewWindowModule();
  const existingWindow = await webviewWindowModule.WebviewWindow.getByLabel(
    getDesktopSecondaryWindowLabel(kind),
  );
  return existingWindow ?? null;
};

const desktopSecondaryWindowFocusRuntime =
  createDesktopSecondaryWindowFocusRuntime({
    getWindowByKind: getDesktopSecondaryWindowByLabel,
    getRevision: (kind) =>
      desktopSecondaryWindowStateStore.get(kind)?.revision ?? null,
  });

export const isDesktopSecondaryWindowAlive = async (
  kind: DesktopSecondaryWindowKind,
): Promise<boolean> =>
  !isTauriRuntime() ||
  Boolean(await getDesktopSecondaryWindowByLabel(kind).catch(() => null));

export const positionDesktopOnboardingSidecar = async (
  targetRect: DesktopOnboardingSidecarTargetRect | null = null,
): Promise<void> =>
  positionDesktopOnboardingSidecarForLabel(
    getDesktopSecondaryWindowLabel,
    targetRect,
  );

const emitDesktopSecondaryWindowState = async (
  state: DesktopSecondaryWindowStatePayload,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo(
    getDesktopSecondaryWindowLabel(state.kind),
    DESKTOP_SECONDARY_WINDOW_STATE_EVENT,
    state,
  );
};

const emitCurrentDesktopSecondaryWindowState =
  createDesktopSecondaryWindowStateEmitter({
    isCurrent: (state) =>
      desktopSecondaryWindowStateStore.isCurrentState(state),
    emit: emitDesktopSecondaryWindowState,
  });

export const setDesktopSecondaryWindowVisualContext = (
  visualContext: DesktopSecondaryWindowVisualContext,
): void => {
  const updatedStates =
    desktopSecondaryWindowStateStore.setVisualContext(visualContext);
  updatedStates.forEach((state) => {
    if (desktopSecondaryWindowFocusRuntime.hasPending(state.kind)) {
      desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(
        state.kind,
        state.revision,
      );
    }
    void emitCurrentDesktopSecondaryWindowState(state).catch(() => undefined);
  });
};

export const getDesktopSecondaryWindowCurrentRevision = (
  kind: DesktopSecondaryWindowKind,
): number => desktopSecondaryWindowStateStore.get(kind)?.revision ?? 0;

const waitForDesktopSecondaryWindowVisibleReadyPoll = (
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason ??
          new DOMException(
            "DESKTOP_SECONDARY_WINDOW_VISIBLE_READY_ABORTED",
            "AbortError",
          ),
      );
      return;
    }
    let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const cleanup = () => {
      if (timerId !== undefined) {
        globalThis.clearTimeout(timerId);
      }
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(
        signal?.reason ??
          new DOMException(
            "DESKTOP_SECONDARY_WINDOW_VISIBLE_READY_ABORTED",
            "AbortError",
          ),
      );
    };
    timerId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, DESKTOP_SECONDARY_VISIBLE_READY_POLL_MS);
    signal?.addEventListener("abort", abort, { once: true });
  });

export const waitForDesktopSecondaryWindowVisibleReady = async (
  kind: DesktopSecondaryWindowKind,
  stateRevision: number,
  options: {
    followLatestRevision?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<number> => {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_TAURI_REQUIRED");
  }
  let expectedRevision = Math.floor(Number(stateRevision));
  if (!Number.isFinite(expectedRevision) || expectedRevision <= 0) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_REVISION_INVALID");
  }
  const timeoutMs = Math.max(
    1,
    Math.floor(
      Number(options.timeoutMs ?? DESKTOP_SECONDARY_VISIBLE_READY_DEADLINE_MS),
    ) || DESKTOP_SECONDARY_VISIBLE_READY_DEADLINE_MS,
  );
  const deadlineAt = Date.now() + timeoutMs;
  while (true) {
    if (options.signal?.aborted) {
      throw (
        options.signal.reason ??
        new DOMException(
          "DESKTOP_SECONDARY_WINDOW_VISIBLE_READY_ABORTED",
          "AbortError",
        )
      );
    }
    const currentRevision = getDesktopSecondaryWindowCurrentRevision(kind);
    if (currentRevision !== expectedRevision) {
      if (
        !options.followLatestRevision ||
        currentRevision <= expectedRevision
      ) {
        throw new Error("DESKTOP_SECONDARY_WINDOW_REVISION_STALE");
      }
      expectedRevision = currentRevision;
    }
    if (
      desktopSecondaryWindowShellReadyKinds.has(kind) &&
      desktopSecondaryWindowRouteReadyKinds.has(kind) &&
      desktopSecondaryWindowContentReadyRevisionByKind.get(kind) ===
        expectedRevision
    ) {
      const didShowAndFocus =
        await desktopSecondaryWindowFocusRuntime.settleFocusWithinDeadline(
          desktopSecondaryWindowFocusRuntime.focusByKind(kind),
          () => undefined,
        );
      if (didShowAndFocus) {
        const focusedCurrentRevision =
          getDesktopSecondaryWindowCurrentRevision(kind);
        if (focusedCurrentRevision === expectedRevision) {
          return expectedRevision;
        }
        if (
          options.followLatestRevision &&
          focusedCurrentRevision > expectedRevision
        ) {
          expectedRevision = focusedCurrentRevision;
          continue;
        }
        throw new Error("DESKTOP_SECONDARY_WINDOW_REVISION_STALE");
      }
    }
    if (Date.now() >= deadlineAt) {
      throw new Error("DESKTOP_SECONDARY_WINDOW_VISIBLE_READY_TIMEOUT");
    }
    await waitForDesktopSecondaryWindowVisibleReadyPoll(options.signal);
  }
};

const desktopSecondaryWindowListenerRuntime =
  createDesktopSecondaryWindowListenerRuntime({
    clearPending: desktopSecondaryWindowFocusRuntime.clearPending,
    emitState: emitCurrentDesktopSecondaryWindowState,
    focusPending: desktopSecondaryWindowFocusRuntime.focusPending,
    forgetWarm: forgetDesktopSecondaryWarmWindow,
    getState: (kind) => desktopSecondaryWindowStateStore.get(kind),
    hasPending: desktopSecondaryWindowFocusRuntime.hasPending,
    markWarm: markDesktopSecondaryWarmWindow,
    sendAck: (ack) => sendDesktopSecondaryWindowActionAck(ack),
    trimWarm: trimDesktopSecondaryWarmWindows,
  });

const {
  contentReadyKinds: desktopSecondaryWindowContentReadyKinds,
  contentReadyRevisionByKind: desktopSecondaryWindowContentReadyRevisionByKind,
  ensureActionListener: ensureDesktopSecondaryWindowActionListener,
  ensureContentReadyListener: ensureDesktopSecondaryWindowContentReadyListener,
  ensureReadyListener: ensureDesktopSecondaryWindowReadyListener,
  ensureRouteReadyListener: ensureDesktopSecondaryWindowRouteReadyListener,
  ensureShellReadyListener: ensureDesktopSecondaryWindowShellReadyListener,
  routeReadyKinds: desktopSecondaryWindowRouteReadyKinds,
  shellReadyKinds: desktopSecondaryWindowShellReadyKinds,
} = desktopSecondaryWindowListenerRuntime;

export const disposeDesktopSecondaryWindowListeners = (): void => {
  desktopSecondaryWindowListenerRuntime.dispose();
  desktopSecondaryWindowFocusRuntime.dispose();
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeunload",
    disposeDesktopSecondaryWindowListeners,
  );
}

export const publishDesktopSecondaryWindowState = async ({
  kind,
  title,
  payload,
}: OpenDesktopSecondaryWindowInput): Promise<DesktopSecondaryWindowStatePayload> => {
  desktopSecondaryWindowContentReadyRevisionByKind.delete(kind);
  const state = desktopSecondaryWindowStateStore.publish({
    kind,
    title,
    payload,
  });
  if (desktopSecondaryWindowFocusRuntime.hasPending(kind)) {
    desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(
      kind,
      state.revision,
    );
  }
  await settleTauriTaskWithinDeadline(
    emitCurrentDesktopSecondaryWindowState(state),
    "SECONDARY_STATE_PUBLISH",
    DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
  ).catch(() => undefined);
  return desktopSecondaryWindowStateStore.get(kind) ?? state;
};

export const openDesktopSecondaryWindow = async ({
  kind,
  title,
  payload = null,
}: OpenDesktopSecondaryWindowInput): Promise<DesktopSecondaryWindowStatePayload> => {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_TAURI_REQUIRED");
  }
  const intent = desktopSecondaryWindowStateStore.beginOpen(kind);
  const openedState = desktopSecondaryWindowStateStore.publishForIntent(
    intent,
    {
      title,
      payload,
    },
  );
  if (!openedState) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_INTENT_REPLACED");
  }
  desktopSecondaryWindowContentReadyRevisionByKind.delete(kind);
  const [, [webviewWindowModule, windowModule]] = await Promise.all([
    Promise.all([
      ensureDesktopSecondaryWindowActionListener(),
      ensureDesktopSecondaryWindowReadyListener(),
      ensureDesktopSecondaryWindowShellReadyListener(),
      ensureDesktopSecondaryWindowRouteReadyListener(),
      ensureDesktopSecondaryWindowContentReadyListener(),
    ]),
    settleTauriTaskWithinDeadline(
      Promise.all([loadTauriWebviewWindowModule(), loadTauriWindowModule()]),
      "SECONDARY_HOST_MODULES",
      DESKTOP_SECONDARY_HOST_MODULE_DEADLINE_MS,
    ),
  ]);

  const label = getDesktopSecondaryWindowLabel(kind);
  const intentIsCurrent =
    desktopSecondaryWindowStateStore.isCurrentIntent(intent);
  const state = intentIsCurrent
    ? openedState
    : desktopSecondaryWindowStateStore.get(kind);
  if (!state) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_INTENT_REPLACED");
  }
  if (!intentIsCurrent && state.instanceId !== openedState.instanceId) {
    return state;
  }
  const requestedGeometry = resolveDesktopSecondaryWindowGeometry(
    kind,
    state.visualContext,
    { payload: state.payload },
  );
  const [existingWindow, geometry] = await Promise.all([
    settleTauriTaskWithinDeadline(
      webviewWindowModule.WebviewWindow.getByLabel(label),
      "SECONDARY_WINDOW_LOOKUP",
      DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
    ),
    resolveDesktopSecondaryWindowGeometryForCurrentMonitor(
      windowModule,
      requestedGeometry,
    ),
  ]);
  if (!desktopSecondaryWindowStateStore.isCurrentState(state)) {
    return desktopSecondaryWindowStateStore.get(kind) ?? state;
  }
  if (existingWindow) {
    const wasVisible = await existingWindow.isVisible().catch(() => false);
    if (!desktopSecondaryWindowStateStore.isCurrentState(state)) {
      return desktopSecondaryWindowStateStore.get(kind) ?? state;
    }
    await Promise.all([
      settleTauriTaskWithinDeadline(
        (async () => {
          await applyDesktopSecondaryWindowGeometry(
            existingWindow,
            windowModule,
            geometry,
          );
          await positionDesktopSecondaryWindowAtMainCenter(
            existingWindow,
            windowModule,
          );
        })(),
        "SECONDARY_WINDOW_GEOMETRY",
        DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
      ).catch(() => undefined),
      settleTauriTaskWithinDeadline(
        emitCurrentDesktopSecondaryWindowState(state),
        "SECONDARY_WINDOW_STATE_SYNC",
        DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
      ).catch(() => undefined),
      settleTauriTaskWithinDeadline(
        clearDesktopSecondaryWindowNativeChrome(existingWindow),
        "SECONDARY_WINDOW_CHROME",
        DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
      ).catch(() => undefined),
    ]);
    if (!desktopSecondaryWindowStateStore.isCurrentState(state)) {
      return desktopSecondaryWindowStateStore.get(kind) ?? state;
    }
    forgetDesktopSecondaryWarmWindow(kind);
    desktopSecondaryWindowFocusRuntime.markPending(kind);
    if (wasVisible) {
      const didFocus =
        await desktopSecondaryWindowFocusRuntime.settleFocusWithinDeadline(
          desktopSecondaryWindowFocusRuntime.focusWindow(existingWindow),
          () => desktopSecondaryWindowFocusRuntime.clearPending(kind),
        );
      if (!desktopSecondaryWindowStateStore.isCurrentState(state)) {
        return desktopSecondaryWindowStateStore.get(kind) ?? state;
      }
      if (didFocus) {
        desktopSecondaryWindowFocusRuntime.clearPending(kind);
      } else {
        desktopSecondaryWindowFocusRuntime.scheduleRetry(kind);
      }
      return state;
    }

    desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(
      kind,
      state.revision,
    );
    if (
      desktopSecondaryWindowContentReadyRevisionByKind.get(kind) ===
      state.revision
    ) {
      await desktopSecondaryWindowFocusRuntime.focusPending(kind);
    }
    return desktopSecondaryWindowStateStore.get(kind) ?? state;
  }

  desktopSecondaryWindowShellReadyKinds.delete(kind);
  desktopSecondaryWindowRouteReadyKinds.delete(kind);
  desktopSecondaryWindowContentReadyKinds.delete(kind);
  desktopSecondaryWindowContentReadyRevisionByKind.delete(kind);
  desktopSecondaryWindowFocusRuntime.markPending(kind);
  const useCustomWindowChrome =
    readDesktopWindowChromePlatform() === "windows";
  const webviewWindow = new webviewWindowModule.WebviewWindow(label, {
    url: buildDesktopSecondaryWindowUrl(kind, state.visualContext),
    title: DESKTOP_SECONDARY_WINDOW_NATIVE_TITLE,
    width: geometry.width,
    height: geometry.height,
    minWidth: geometry.minWidth,
    minHeight: geometry.minHeight,
    resizable: true,
    devtools: false,
    visible: false,
    focus: false,
    parent: "main",
    preventOverflow: { width: 24, height: 24 },
    skipTaskbar: true,
    decorations: !useCustomWindowChrome,
    shadow: true,
    ...(useCustomWindowChrome
      ? {}
      : {
          titleBarStyle: "overlay" as const,
          hiddenTitle: true,
          trafficLightPosition: new windowModule.LogicalPosition(16, 30),
        }),
    backgroundColor: resolveDesktopSecondaryWindowBackgroundColor(
      state.visualContext,
    ),
  });
  // Every secondary window remains hidden until its current state revision has
  // rendered; the deadline can expose only an actionable recovery surface.
  desktopSecondaryWindowFocusRuntime.scheduleContentFirstVisibilityDeadline(
    kind,
    state.revision,
  );

  void webviewWindow.once("tauri://created", () => {
    const currentState = desktopSecondaryWindowStateStore.get(kind);
    if (currentState?.instanceId !== state.instanceId) {
      return;
    }
    const ownerCenterTask = settleTauriTaskWithinDeadline(
      positionDesktopSecondaryWindowAtMainCenter(webviewWindow, windowModule),
      "SECONDARY_WINDOW_OWNER_CENTER",
      DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
    ).catch(() => undefined);
    desktopSecondaryWindowFocusRuntime.trackOwnerCenterTask(
      kind,
      ownerCenterTask,
    );
    void clearDesktopSecondaryWindowNativeChrome(webviewWindow).catch(
      () => undefined,
    );
    void emitCurrentDesktopSecondaryWindowState(currentState).catch(
      () => undefined,
    );
  });
  void webviewWindow.once("tauri://destroyed", () => {
    if (
      desktopSecondaryWindowStateStore.get(kind)?.instanceId !==
      state.instanceId
    ) {
      return;
    }
    desktopSecondaryWindowShellReadyKinds.delete(kind);
    desktopSecondaryWindowRouteReadyKinds.delete(kind);
    desktopSecondaryWindowContentReadyKinds.delete(kind);
    desktopSecondaryWindowContentReadyRevisionByKind.delete(kind);
    desktopSecondaryWindowStateStore.forget(kind, state.instanceId);
    forgetDesktopSecondaryWarmWindow(kind);
    desktopSecondaryWindowFocusRuntime.deleteOwnerCenterTask(kind);
    desktopSecondaryWindowFocusRuntime.clearPending(kind);
  });
  void webviewWindow.once("tauri://error", (event) => {
    if (
      desktopSecondaryWindowStateStore.get(kind)?.instanceId !==
      state.instanceId
    ) {
      return;
    }
    desktopSecondaryWindowFocusRuntime.clearPending(kind);
    desktopSecondaryWindowContentReadyRevisionByKind.delete(kind);
    desktopSecondaryWindowStateStore.forget(kind, state.instanceId);
    console.error("[desktop-secondary-window] create failed", {
      kind,
      label,
      error: event.payload,
    });
  });

  return desktopSecondaryWindowStateStore.get(kind) ?? state;
};

export const warmDesktopSecondaryWindow = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await Promise.all([
    ensureDesktopSecondaryWindowReadyListener(),
    ensureDesktopSecondaryWindowShellReadyListener(),
    ensureDesktopSecondaryWindowRouteReadyListener(),
    ensureDesktopSecondaryWindowContentReadyListener(),
  ]);

  const existingWindow = await getDesktopSecondaryWindowByLabel(kind);
  if (existingWindow) {
    const isVisible = await existingWindow.isVisible().catch(() => false);
    if (!isVisible) {
      markDesktopSecondaryWarmWindow(kind);
      void trimDesktopSecondaryWarmWindows().catch(() => undefined);
    }
  }
};
export const notifyDesktopSecondaryWindowReady = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo("main", DESKTOP_SECONDARY_WINDOW_READY_EVENT, {
    kind,
  });
};

export const notifyDesktopSecondaryWindowShellReady = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo("main", DESKTOP_SECONDARY_WINDOW_SHELL_READY_EVENT, {
    kind,
  });
};

export const notifyDesktopSecondaryWindowRouteReady = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo("main", DESKTOP_SECONDARY_WINDOW_ROUTE_READY_EVENT, {
    kind,
  });
};

export const notifyDesktopSecondaryWindowContentReady = async (
  kind: DesktopSecondaryWindowKind,
  stateRevision?: number,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo(
    "main",
    DESKTOP_SECONDARY_WINDOW_CONTENT_READY_EVENT,
    {
      kind,
      ...(typeof stateRevision === "number" && Number.isFinite(stateRevision)
        ? { stateRevision }
        : {}),
    },
  );
};

export const subscribeDesktopSecondaryWindowState = async (
  kind: DesktopSecondaryWindowKind,
  handler: (state: DesktopSecondaryWindowStatePayload) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  const eventModule = await loadTauriEventModule();
  const unlisten = await eventModule.listen<DesktopSecondaryWindowStatePayload>(
    DESKTOP_SECONDARY_WINDOW_STATE_EVENT,
    (event) => {
      if (event.payload?.kind === kind) {
        handler(event.payload);
      }
    },
  );
  return createTauriUnlistenCleanup(unlisten);
};

export const sendDesktopSecondaryWindowAction = async (
  action: DesktopSecondaryWindowActionPayload,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await eventModule.emitTo(
    "main",
    DESKTOP_SECONDARY_WINDOW_ACTION_EVENT,
    action,
  );
};

export const sendDesktopSecondaryWindowRouteAction = async (
  state: DesktopSecondaryWindowStatePayload,
  action: string,
  payload?: unknown,
): Promise<void> =>
  sendDesktopSecondaryWindowAction({
    kind: state.kind,
    action,
    payload,
    instanceId: state.instanceId,
    requestId: createDesktopSecondaryWindowActionRequestId(),
    stateRevision: state.revision,
  });

const subscribeDesktopSecondaryWindowActionAcks = async (
  handler: (ack: DesktopSecondaryWindowActionAckPayload) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_SECONDARY_WINDOW_TAURI_REQUIRED");
  }
  const eventModule = await loadTauriEventModule();
  const unlisten =
    await eventModule.listen<DesktopSecondaryWindowActionAckPayload>(
      DESKTOP_SECONDARY_WINDOW_ACTION_ACK_EVENT,
      (event) => {
        const ack = event.payload;
        if (
          isDesktopSecondaryWindowKind(ack?.kind) &&
          String(ack?.action || "").trim() &&
          String(ack?.requestId || "").trim() &&
          (ack?.status === "ACCEPTED" || ack?.status === "REJECTED")
        ) {
          handler(ack);
        }
      },
    );
  return createTauriUnlistenCleanup(unlisten);
};

export const sendDesktopSecondaryWindowActionAck = async (
  ack: DesktopSecondaryWindowActionAckPayload,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const eventModule = await loadTauriEventModule();
  await retryDesktopSecondaryWindowActionAckDelivery({
    send: () =>
      eventModule.emitTo(
        getDesktopSecondaryWindowLabel(ack.kind),
        DESKTOP_SECONDARY_WINDOW_ACTION_ACK_EVENT,
        ack,
      ),
  });
};

export const sendDesktopSecondaryWindowRouteActionWithAck = async (
  state: DesktopSecondaryWindowStatePayload,
  action: string,
  payload?: unknown,
  options?: { requestId?: string; timeoutMs?: number },
): Promise<DesktopSecondaryWindowActionAckPayload> => {
  const request = {
    kind: state.kind,
    action: String(action || "").trim(),
    instanceId: state.instanceId,
    requestId:
      String(options?.requestId || "").trim() ||
      createDesktopSecondaryWindowActionRequestId(),
    stateRevision: state.revision,
  };
  const ack = await waitForDesktopSecondaryWindowActionAck({
    request,
    subscribe: (handler) =>
      subscribeDesktopSecondaryWindowActionAcks((nextAck) => handler(nextAck)),
    send: () =>
      sendDesktopSecondaryWindowAction({
        ...request,
        payload,
      }),
    timeoutMs:
      Math.max(1, Math.floor(Number(options?.timeoutMs))) ||
      DESKTOP_SECONDARY_WINDOW_ACTION_ACK_TIMEOUT_MS,
  });
  return ack as DesktopSecondaryWindowActionAckPayload;
};

export const isCurrentDesktopSecondaryWindowAction = (
  action: DesktopSecondaryWindowActionPayload,
  currentRevision: number | null | undefined,
  policy: DesktopSecondaryWindowSyncPolicy = DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES[
    action.kind
  ],
): boolean => {
  void policy;
  const currentState = desktopSecondaryWindowStateStore.get(action.kind);
  return (
    currentState?.revision === currentRevision &&
    isDesktopSecondaryWindowActionIdentityCurrent(action, currentState)
  );
};

export const notifyDesktopSecondaryWindowHiddenForReuse = async (
  state: DesktopSecondaryWindowStatePayload,
): Promise<void> =>
  sendDesktopSecondaryWindowRouteAction(state, "WINDOW_HIDDEN_FOR_REUSE");

export const notifyDesktopSecondaryWindowDispose = async (
  state: DesktopSecondaryWindowStatePayload,
): Promise<void> =>
  sendDesktopSecondaryWindowRouteAction(state, "WINDOW_CLOSED");

export const subscribeDesktopSecondaryWindowReuseCloseRequest = async (
  shouldReuse: () => boolean,
  readState: () => DesktopSecondaryWindowStatePayload | null,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  const windowModule = await loadTauriWindowModule();
  const currentWindow = windowModule.getCurrentWindow();
  const unlisten = await currentWindow.onCloseRequested(async (event) => {
    if (!shouldReuse()) {
      const state = readState();
      if (state) {
        await notifyDesktopSecondaryWindowDispose(state).catch(() => undefined);
      }
      return;
    }
    event.preventDefault();
    await currentWindow.hide().catch(() => undefined);
    const state = readState();
    if (state) {
      await notifyDesktopSecondaryWindowHiddenForReuse(state).catch(
        () => undefined,
      );
    }
  });
  return createTauriUnlistenCleanup(unlisten);
};

export const closeCurrentDesktopSecondaryWindow = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    const windowModule = await loadTauriWindowModule();
    await windowModule.getCurrentWindow().close();
  } catch {
    // Closing a secondary window is a best-effort UI command.
  }
};

export const closeDesktopSecondaryWindow = async (
  kind: DesktopSecondaryWindowKind,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    const existingWindow = await getDesktopSecondaryWindowByLabel(kind);
    await existingWindow?.close();
  } catch {
    // Closing a secondary window is a best-effort UI command.
  }
};

export const hideDesktopAppToTray = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const windowModule = await loadTauriWindowModule();
  for (const kind of DESKTOP_SECONDARY_WINDOW_KINDS) {
    const existingWindow = await getDesktopSecondaryWindowByLabel(kind);
    if (!existingWindow) {
      continue;
    }
    // A window can still be native-hidden while its current revision loads.
    // Cancelling pending visibility first prevents content-ready from reopening
    // it after the user has hidden the whole app.
    desktopSecondaryWindowFocusRuntime.clearPending(kind);
    const isVisible = await existingWindow.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }
    await existingWindow.hide().catch(() => undefined);
    markDesktopSecondaryWarmWindow(kind);
    const state = desktopSecondaryWindowStateStore.get(kind);
    if (state) {
      await notifyDesktopSecondaryWindowHiddenForReuse(state).catch(
        () => undefined,
      );
    }
  }
  await windowModule
    .getCurrentWindow()
    .hide()
    .catch(() => undefined);
};

export const quitDesktopApp = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const mod = await loadTauriCoreModule();
  await mod.invoke<void>("desktop_app_quit");
};

export const subscribeDesktopSecondaryWindowActions = (
  handler: (action: DesktopSecondaryWindowActionPayload) => void,
): (() => void) =>
  desktopSecondaryWindowListenerRuntime.subscribeActions(handler);
