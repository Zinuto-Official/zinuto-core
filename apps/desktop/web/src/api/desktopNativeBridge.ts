// SPDX-License-Identifier: GPL-3.0-only

type TauriRuntimeBridgeLike = {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
};

export type BackendBridgeResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

export const hasTauriRuntimeBridge = (value?: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const bridge = value as TauriRuntimeBridgeLike;
  return typeof bridge.__TAURI_INTERNALS__?.invoke === "function";
};

export const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return hasTauriRuntimeBridge(window);
};

let tauriCoreModulePromise: Promise<
  typeof import("@tauri-apps/api/core")
> | null = null;
let tauriAppModulePromise: Promise<
  typeof import("@tauri-apps/api/app")
> | null = null;
let tauriWindowModulePromise: Promise<
  typeof import("@tauri-apps/api/window")
> | null = null;
let tauriWebviewModulePromise: Promise<
  typeof import("@tauri-apps/api/webview")
> | null = null;
let tauriWebviewWindowModulePromise: Promise<
  typeof import("@tauri-apps/api/webviewWindow")
> | null = null;
let tauriEventModulePromise: Promise<
  typeof import("@tauri-apps/api/event")
> | null = null;
let tauriOpenerModulePromise: Promise<
  typeof import("@tauri-apps/plugin-opener")
> | null = null;
let tauriBridgeRequestCounter = 0;

export const loadTauriCoreModule = (): Promise<
  typeof import("@tauri-apps/api/core")
> => (tauriCoreModulePromise ??= import("@tauri-apps/api/core"));
export const loadTauriAppModule = (): Promise<typeof import("@tauri-apps/api/app")> =>
  (tauriAppModulePromise ??= import("@tauri-apps/api/app"));
export const loadTauriWindowModule = (): Promise<
  typeof import("@tauri-apps/api/window")
> => (tauriWindowModulePromise ??= import("@tauri-apps/api/window"));
export const loadTauriWebviewModule = (): Promise<
  typeof import("@tauri-apps/api/webview")
> => (tauriWebviewModulePromise ??= import("@tauri-apps/api/webview"));
export const loadTauriWebviewWindowModule = (): Promise<
  typeof import("@tauri-apps/api/webviewWindow")
> =>
  (tauriWebviewWindowModulePromise ??= import("@tauri-apps/api/webviewWindow"));
export const loadTauriEventModule = (): Promise<
  typeof import("@tauri-apps/api/event")
> => (tauriEventModulePromise ??= import("@tauri-apps/api/event"));
export const loadTauriOpenerModule = (): Promise<
  typeof import("@tauri-apps/plugin-opener")
> => (tauriOpenerModulePromise ??= import("@tauri-apps/plugin-opener"));
const createTauriBridgeRequestId = (): string =>
  `bridge-${Date.now().toString(36)}-${(++tauriBridgeRequestCounter).toString(36)}`;

export const invokeBackendBridge = async (
  payload: {
    method: string;
    path: string;
    body?: string | null;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
  signal?: AbortSignal,
): Promise<BackendBridgeResponse> => {
  const mod = await loadTauriCoreModule();
  if (!signal) {
    return mod.invoke<BackendBridgeResponse>("backend_http_request", payload);
  }
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const requestId = createTauriBridgeRequestId();
  const requestPromise = mod.invoke<BackendBridgeResponse>(
    "backend_http_request",
    {
      ...payload,
      requestId,
    },
  );

  return new Promise<BackendBridgeResponse>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      void mod
        .invoke("backend_http_request", {
          method: payload.method,
          path: payload.path,
          cancelRequestId: requestId,
        })
        .catch(() => undefined);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    requestPromise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
};
