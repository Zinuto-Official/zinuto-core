// SPDX-License-Identifier: GPL-3.0-only

import {
  installTauriListenerWithRetry,
  runTauriUnlistenSafely,
  type TauriUnlistenFn,
} from "@/frontend-kernel/tauriEventCleanup";
import { isDesktopSecondaryWindowActionIdentityCurrent } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel";
import type { DesktopSecondaryWindowActionAck } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck";
import type { DesktopSecondaryWindowActionPayload } from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionProtocol";
import {
  isDesktopSecondaryWindowKind,
  type DesktopSecondaryWindowStatePayload,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import type { DesktopSecondaryWindowKind } from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import {
  isTauriRuntime,
  loadTauriEventModule,
} from "@/api/desktopNativeBridge";

type ReceivedActionPayload = Partial<DesktopSecondaryWindowActionPayload>;
type ActionAckPayload = DesktopSecondaryWindowActionAck & {
  kind: DesktopSecondaryWindowKind;
};

type ListenerRuntimeDependencies = {
  clearPending: (kind: DesktopSecondaryWindowKind) => void;
  emitState: (state: DesktopSecondaryWindowStatePayload) => Promise<void>;
  focusPending: (kind: DesktopSecondaryWindowKind) => Promise<void>;
  forgetWarm: (kind: DesktopSecondaryWindowKind) => void;
  getState: (
    kind: DesktopSecondaryWindowKind,
  ) => DesktopSecondaryWindowStatePayload | null;
  hasPending: (kind: DesktopSecondaryWindowKind) => boolean;
  markWarm: (kind: DesktopSecondaryWindowKind) => void;
  sendAck: (ack: ActionAckPayload) => Promise<void>;
  trimWarm: () => Promise<void>;
};

type ListenerPromise = Promise<TauriUnlistenFn>;
type EnsureListenerOptions = {
  install: () => ListenerPromise;
  listenerName: string;
  readPromise: () => ListenerPromise | null;
  writePromise: (promise: ListenerPromise | null) => void;
};

const READY_EVENT = "zinuto://desktop-secondary-window-ready";
const SHELL_READY_EVENT = "zinuto://desktop-secondary-window-shell-ready";
const ROUTE_READY_EVENT = "zinuto://desktop-secondary-window-route-ready";
const CONTENT_READY_EVENT = "zinuto://desktop-secondary-window-content-ready";
const ACTION_EVENT = "zinuto://desktop-secondary-window-action";
const LISTENER_REGISTRATION_DEADLINE_MS = 4_000;
const LISTENER_REGISTRATION_MAX_ATTEMPTS = 2;

export const createDesktopSecondaryWindowListenerRuntime = (
  dependencies: ListenerRuntimeDependencies,
) => {
  let readyListenerPromise: ListenerPromise | null = null;
  let shellReadyListenerPromise: ListenerPromise | null = null;
  let routeReadyListenerPromise: ListenerPromise | null = null;
  let contentReadyListenerPromise: ListenerPromise | null = null;
  let actionListenerPromise: ListenerPromise | null = null;
  const actionHandlers = new Set<
    (action: DesktopSecondaryWindowActionPayload) => void
  >();
  const shellReadyKinds = new Set<DesktopSecondaryWindowKind>();
  const routeReadyKinds = new Set<DesktopSecondaryWindowKind>();
  const contentReadyKinds = new Set<DesktopSecondaryWindowKind>();
  const contentReadyRevisionByKind = new Map<
    DesktopSecondaryWindowKind,
    number
  >();
  const unlistenFns: TauriUnlistenFn[] = [];

  const ensureListener = async ({
    install,
    listenerName,
    readPromise,
    writePromise,
  }: EnsureListenerOptions): Promise<void> => {
    let listenerPromise = readPromise();
    if (!listenerPromise) {
      let nextPromise: ListenerPromise;
      nextPromise = installTauriListenerWithRetry(
        install,
        listenerName,
        LISTENER_REGISTRATION_DEADLINE_MS,
        LISTENER_REGISTRATION_MAX_ATTEMPTS,
      ).catch((error) => {
        if (readPromise() === nextPromise) {
          writePromise(null);
        }
        console.error(
          "[desktop-secondary-window] listener registration failed",
          { listenerName, error },
        );
        throw error;
      });
      writePromise(nextPromise);
      void nextPromise.then(
        (unlisten) => {
          if (readPromise() !== nextPromise) {
            runTauriUnlistenSafely(unlisten);
            return;
          }
          unlistenFns.push(unlisten);
        },
        () => undefined,
      );
      listenerPromise = nextPromise;
    }
    await listenerPromise;
  };

  const ensureReadyListener = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    await ensureListener({
      listenerName: "READY",
      readPromise: () => readyListenerPromise,
      writePromise: (promise) => {
        readyListenerPromise = promise;
      },
      install: async () => {
        const eventModule = await loadTauriEventModule();
        return eventModule.listen<{ kind?: unknown }>(READY_EVENT, (event) => {
          const kind = String(event.payload?.kind || "").trim();
          if (!isDesktopSecondaryWindowKind(kind)) return;
          const state = dependencies.getState(kind);
          if (state) void dependencies.emitState(state).catch(() => undefined);
        });
      },
    });
  };

  const ensureActionListener = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    await ensureListener({
      listenerName: "ACTION",
      readPromise: () => actionListenerPromise,
      writePromise: (promise) => {
        actionListenerPromise = promise;
      },
      install: async () => {
        const eventModule = await loadTauriEventModule();
        return eventModule.listen<ReceivedActionPayload>(
          ACTION_EVENT,
          (event) => {
            const kind = event.payload?.kind;
            const action = String(event.payload?.action || "").trim();
            if (!isDesktopSecondaryWindowKind(kind) || !action) return;
            const currentState = dependencies.getState(kind);
            if (
              !isDesktopSecondaryWindowActionIdentityCurrent(
                event.payload,
                currentState,
              )
            ) {
              console.warn("[desktop-secondary-window] rejected stale action", {
                kind,
                action,
                reason: "ACTION_IDENTITY_MISMATCH",
              });
              if (String(event.payload?.requestId || "").trim()) {
                void dependencies
                  .sendAck({
                    kind,
                    action,
                    instanceId: String(event.payload?.instanceId || ""),
                    requestId: String(event.payload?.requestId || ""),
                    stateRevision: Number(event.payload?.stateRevision) || 0,
                    status: "REJECTED",
                    code: "STALE_REVISION",
                    reason: "ACTION_IDENTITY_MISMATCH",
                  })
                  .catch(() => undefined);
              }
              return;
            }
            if (action === "WINDOW_HIDDEN_FOR_REUSE") {
              dependencies.markWarm(kind);
              void dependencies.trimWarm().catch(() => undefined);
            } else if (action === "WINDOW_CLOSED") {
              dependencies.forgetWarm(kind);
              dependencies.clearPending(kind);
            }
            actionHandlers.forEach((handler) => {
              try {
                handler(event.payload as DesktopSecondaryWindowActionPayload);
              } catch (error) {
                console.error(
                  "[desktop-secondary-window] action handler failed",
                  error,
                );
              }
            });
          },
        );
      },
    });
  };

  const ensureShellReadyListener = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    await ensureListener({
      listenerName: "SHELL_READY",
      readPromise: () => shellReadyListenerPromise,
      writePromise: (promise) => {
        shellReadyListenerPromise = promise;
      },
      install: async () => {
        const eventModule = await loadTauriEventModule();
        return eventModule.listen<{ kind?: unknown }>(
          SHELL_READY_EVENT,
          (event) => {
            const kind = String(event.payload?.kind || "").trim();
            if (isDesktopSecondaryWindowKind(kind)) shellReadyKinds.add(kind);
          },
        );
      },
    });
  };

  const ensureRouteReadyListener = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    await ensureListener({
      listenerName: "ROUTE_READY",
      readPromise: () => routeReadyListenerPromise,
      writePromise: (promise) => {
        routeReadyListenerPromise = promise;
      },
      install: async () => {
        const eventModule = await loadTauriEventModule();
        return eventModule.listen<{ kind?: unknown }>(
          ROUTE_READY_EVENT,
          (event) => {
            const kind = String(event.payload?.kind || "").trim();
            if (isDesktopSecondaryWindowKind(kind)) routeReadyKinds.add(kind);
          },
        );
      },
    });
  };

  const ensureContentReadyListener = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    await ensureListener({
      listenerName: "CONTENT_READY",
      readPromise: () => contentReadyListenerPromise,
      writePromise: (promise) => {
        contentReadyListenerPromise = promise;
      },
      install: async () => {
        const eventModule = await loadTauriEventModule();
        return eventModule.listen<{ kind?: unknown; stateRevision?: unknown }>(
          CONTENT_READY_EVENT,
          (event) => {
            const kind = String(event.payload?.kind || "").trim();
            if (!isDesktopSecondaryWindowKind(kind)) return;
            const rawRevision = event.payload?.stateRevision;
            const revision =
              typeof rawRevision === "number" && Number.isFinite(rawRevision)
                ? rawRevision
                : null;
            const currentRevision =
              dependencies.getState(kind)?.revision ?? null;
            contentReadyKinds.add(kind);
            if (revision !== null && revision === currentRevision) {
              contentReadyRevisionByKind.set(kind, revision);
            }
            if (
              dependencies.hasPending(kind) &&
              revision !== null &&
              revision === currentRevision
            ) {
              void dependencies.focusPending(kind).catch(() => undefined);
            }
          },
        );
      },
    });
  };

  const dispose = (): void => {
    readyListenerPromise = null;
    shellReadyListenerPromise = null;
    routeReadyListenerPromise = null;
    contentReadyListenerPromise = null;
    actionListenerPromise = null;
    unlistenFns.forEach(runTauriUnlistenSafely);
    unlistenFns.length = 0;
    contentReadyRevisionByKind.clear();
  };

  const subscribeActions = (
    handler: (action: DesktopSecondaryWindowActionPayload) => void,
  ): (() => void) => {
    if (!isTauriRuntime()) return () => undefined;
    actionHandlers.add(handler);
    void ensureActionListener().catch(() => undefined);
    return () => actionHandlers.delete(handler);
  };

  return {
    contentReadyKinds,
    contentReadyRevisionByKind,
    dispose,
    ensureActionListener,
    ensureContentReadyListener,
    ensureReadyListener,
    ensureRouteReadyListener,
    ensureShellReadyListener,
    routeReadyKinds,
    shellReadyKinds,
    subscribeActions,
  };
};
