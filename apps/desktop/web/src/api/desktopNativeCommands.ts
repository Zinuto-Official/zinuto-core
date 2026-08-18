// SPDX-License-Identifier: GPL-3.0-only

import { createApiError } from "@/api/error";
import { toBackendErrorMessage } from "@/api/backendErrorMessage";
import {
  readBridgeCommandErrorArgs,
  readBridgeCommandErrorCode,
} from "@/api/bridgeCommandErrors";
import {
  createTauriUnlistenCleanup,
  installTauriListenerWithinDeadline,
  runTauriUnlistenSafely,
  type TauriUnlistenFn,
} from "@/frontend-kernel/tauriEventCleanup";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME } from "@zinuto/shared/localImportMockSampleArchive";
import {
  isTauriRuntime,
  loadTauriCoreModule,
  loadTauriEventModule,
  loadTauriOpenerModule,
} from "@/api/desktopNativeBridge";

export type CsvFolderStagingMode =
  "FULL_COPY" | "METADATA_ONLY" | "SELECTIVE_DIGEST" | "SELECTIVE_COPY";

export type CsvFolderStagingResult = {
  stagedFolderPath: string;
  sourceFolderPath?: string;
  sourceFolderName: string;
  copiedFiles: number;
  copiedBytes: number;
  sourceFolderBookmarkId?: string;
  metadataManifest?: {
    files: Array<{
      relativePath: string;
      originalname: string;
      size: number;
      mtimeMs: number;
      fingerprint?: string;
    }>;
    totalFiles: number;
    totalBytes: number;
  };
};

export type CsvFolderStagingProgressPhase =
  "DISCOVERING" | "COPYING" | "DIGESTING" | "DONE";

export type CsvFolderStagingProgress = {
  progressRequestId: string;
  stageMode: CsvFolderStagingMode;
  phase: CsvFolderStagingProgressPhase;
  processedFiles: number;
  totalFiles: number | null;
  processedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
};

const CSV_FOLDER_STAGING_PROGRESS_EVENT =
  "zinuto://csv-folder-staging-progress";

const MARKET_DATA_ACQUISITION_TERMS_HOSTS = new Set([
  "github.com",
  "akshare.akfamily.xyz",
  "about.eastmoney.com",
  "www.binance.com",
  "developers.binance.com",
  "www.okx.com",
]);

export type NativeDesktopReleaseChannel = "community";

export const getNativeDesktopReleaseChannel =
  async (): Promise<NativeDesktopReleaseChannel | null> => {
    if (!isTauriRuntime()) {
      return null;
    }
    const mod = await loadTauriCoreModule();
    try {
      return await mod.invoke<NativeDesktopReleaseChannel>(
        "desktop_release_channel",
      );
    } catch (error) {
      throw toNativeCommandApiError(error);
    }
  };

export const restartDesktopApp = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    throw new Error(tt("appText.request"));
  }
  const mod = await loadTauriCoreModule();
  try {
    await mod.invoke<void>("desktop_app_restart");
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export type DesktopCloseRequestAction =
  | "CANCEL"
  | "QUIT"
  | "MINIMIZE_TO_TRAY";

type DesktopCloseLifecycleCommand =
  | "desktop_main_window_close_handler_status"
  | "desktop_main_window_close_request_ack"
  | "desktop_main_window_close_request_keepalive"
  | "desktop_main_window_close_request_resolve";

const invokeDesktopCloseLifecycleCommand = async (
  command: DesktopCloseLifecycleCommand,
  payload: Record<string, unknown>,
): Promise<void> => {
  if (!isTauriRuntime()) {
    throw new Error(tt("appText.request"));
  }
  const mod = await loadTauriCoreModule();
  try {
    switch (command) {
      case "desktop_main_window_close_handler_status":
        await mod.invoke<void>("desktop_main_window_close_handler_status", payload);
        break;
      case "desktop_main_window_close_request_ack":
        await mod.invoke<void>("desktop_main_window_close_request_ack", payload);
        break;
      case "desktop_main_window_close_request_keepalive":
        await mod.invoke<void>("desktop_main_window_close_request_keepalive", payload);
        break;
      case "desktop_main_window_close_request_resolve":
        await mod.invoke<void>("desktop_main_window_close_request_resolve", payload);
        break;
    }
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const setDesktopMainWindowCloseHandlerStatus = async (
  active: boolean,
): Promise<void> =>
  invokeDesktopCloseLifecycleCommand(
    "desktop_main_window_close_handler_status",
    { active },
  );

export const acknowledgeDesktopMainWindowCloseRequest = async (
  requestId: string,
): Promise<void> =>
  invokeDesktopCloseLifecycleCommand(
    "desktop_main_window_close_request_ack",
    { requestId },
  );

export const keepaliveDesktopMainWindowCloseRequest = async (
  requestId: string,
): Promise<void> =>
  invokeDesktopCloseLifecycleCommand(
    "desktop_main_window_close_request_keepalive",
    { requestId },
  );

export const resolveDesktopMainWindowCloseRequest = async (
  requestId: string,
  action: DesktopCloseRequestAction,
): Promise<void> =>
  invokeDesktopCloseLifecycleCommand(
    "desktop_main_window_close_request_resolve",
    { action, requestId },
  );

export type CustomIndicatorAiConversionGuideSaveResult =
  | "SAVED"
  | "CANCELLED";

export const saveCustomIndicatorAiConversionGuide = async (payload: {
  language: string;
  content: string;
}): Promise<CustomIndicatorAiConversionGuideSaveResult | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  const mod = await loadTauriCoreModule();
  try {
    return await mod.invoke<CustomIndicatorAiConversionGuideSaveResult>(
      "save_custom_indicator_ai_conversion_guide",
      payload,
    );
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const openMarketDataAcquisitionTermsUrl = async (
  url: string,
): Promise<void> => {
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(String(url || "").trim());
  } catch {
    parsedUrl = null;
  }
  if (
    !parsedUrl ||
    parsedUrl.protocol.toLowerCase() !== "https:" ||
    !MARKET_DATA_ACQUISITION_TERMS_HOSTS.has(parsedUrl.hostname.toLowerCase())
  ) {
    throw createApiError(
      "Market data project and terms URLs must use an approved HTTPS host.",
      "MARKET_DATA_TERMS_URL_BLOCKED",
      { urlHost: parsedUrl?.hostname ?? null },
      403,
    );
  }
  const mod = await loadTauriOpenerModule();
  await mod.openUrl(parsedUrl.href);
};

export type DesktopMenuCommand =
  | "OPEN_SETTINGS"
  | "NEW_FREE_REPLAY"
  | "OPEN_MARKET_DATA_IMPORT"
  | "OPEN_COMMAND_CENTER"
  | "OPEN_FREE_REPLAY"
  | "OPEN_DATA"
  | "OPEN_KEYBOARD_SHORTCUTS";

const DESKTOP_MENU_COMMAND_EVENT = "zinuto://desktop-menu-command";
const DESKTOP_UI_LANGUAGE_EVENT = "zinuto://desktop-ui-language";
const DESKTOP_UI_LANGUAGES = new Set(["en", "zh-CN", "ja", "ko", "es"]);
const DESKTOP_MENU_COMMANDS = new Set<string>([
  "OPEN_SETTINGS",
  "NEW_FREE_REPLAY",
  "OPEN_MARKET_DATA_IMPORT",
  "OPEN_COMMAND_CENTER",
  "OPEN_FREE_REPLAY",
  "OPEN_DATA",
  "OPEN_KEYBOARD_SHORTCUTS",
]);

const isDesktopMenuCommand = (value: string): value is DesktopMenuCommand =>
  DESKTOP_MENU_COMMANDS.has(value);

export const syncNativeDesktopUiLanguage = async (
  language: string,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  const normalizedLanguage = DESKTOP_UI_LANGUAGES.has(language)
    ? language
    : "en";
  const eventModule = await loadTauriEventModule();
  await eventModule.emit(DESKTOP_UI_LANGUAGE_EVENT, {
    language: normalizedLanguage,
  });
};

export const subscribeToDesktopMenuCommands = (
  handler: (command: DesktopMenuCommand) => void,
): (() => void) => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  let disposed = false;
  let unlisten: TauriUnlistenFn | null = null;
  void loadTauriEventModule()
    .then((eventModule) =>
      eventModule.listen<{ command?: unknown }>(
        DESKTOP_MENU_COMMAND_EVENT,
        (event) => {
          const command = String(event.payload?.command || "").trim();
          if (isDesktopMenuCommand(command)) {
            handler(command);
          }
        },
      ),
    )
    .then((nextUnlisten) => {
      if (disposed) {
        runTauriUnlistenSafely(nextUnlisten);
        return;
      }
      unlisten = nextUnlisten;
    })
    .catch(() => {
      // Native menus are unavailable outside the active desktop shell.
    });

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    runTauriUnlistenSafely(unlisten);
  };
};

const toNativeCommandApiError = (error: unknown): Error => {
  const errorCode = readBridgeCommandErrorCode(error);
  const errorArgs = readBridgeCommandErrorArgs(error);
  if (errorCode) {
    return createApiError(
      toBackendErrorMessage(errorCode, errorArgs, 400),
      errorCode,
      errorArgs,
      400,
    );
  }
  return error instanceof Error ? error : new Error(tt("appText.request"));
};

export const pickPortableExportTargetPath = async (
  defaultPath = `trading-practice-data-${new Date().toISOString().slice(0, 10)}.otp-package`,
): Promise<string | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  const dialogMod = await import("@tauri-apps/plugin-dialog");
  const targetPath = await dialogMod.save({
    defaultPath,
    filters: [
      {
        name: "Portable Data Package",
        extensions: ["otp-package"],
      },
    ],
  });
  return typeof targetPath === "string" && targetPath.trim()
    ? targetPath.trim()
    : null;
};

export const pickLocalImportMockSampleArchiveTargetPath = async (
  defaultPath = LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
): Promise<string | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  const dialogMod = await import("@tauri-apps/plugin-dialog");
  const targetPath = await dialogMod.save({
    defaultPath,
    filters: [
      {
        name: "Zip",
        extensions: ["zip"],
      },
    ],
  });
  return typeof targetPath === "string" && targetPath.trim()
    ? targetPath.trim()
    : null;
};

export type MarketDataAcquisitionFolderGrant = {
  grantId: string;
  displayPath: string;
};

export type MarketDataAcquisitionCommitResult = {
  finalPath: string;
  sourceFolderBookmarkId: string | null;
  copiedFiles: number;
  copiedBytes: number;
};

export const pickMarketDataAcquisitionFolderPath = async (
  rememberedPath?: string,
): Promise<string | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  const dialogMod = await import("@tauri-apps/plugin-dialog");
  let defaultPath = String(rememberedPath || "").trim() || undefined;
  if (!defaultPath) {
    try {
      const pathMod = await import("@tauri-apps/api/path");
      defaultPath = await pathMod.downloadDir();
    } catch {
      defaultPath = undefined;
    }
  }
  const selected = await dialogMod.open({
    defaultPath,
    directory: true,
    multiple: false,
    recursive: true,
    canCreateDirectories: true,
    fileAccessMode: "scoped",
  });
  return typeof selected === "string" && selected.trim()
    ? selected.trim()
    : null;
};

export const authorizeMarketDataAcquisitionFolder = async (payload: {
  folderPath: string;
  existingGrantId?: string;
}): Promise<MarketDataAcquisitionFolderGrant> => {
  if (!isTauriRuntime()) {
    throw createApiError(
      toBackendErrorMessage("TAURI_RUNTIME_UNAVAILABLE", undefined, 400),
      "TAURI_RUNTIME_UNAVAILABLE",
      undefined,
      400,
    );
  }
  const mod = await loadTauriCoreModule();
  try {
    return await mod.invoke<MarketDataAcquisitionFolderGrant>(
      "authorize_market_data_acquisition_folder",
      payload,
    );
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const commitMarketDataAcquisitionOutput = async (payload: {
  grantId: string;
  jobId: string;
  manifestSha256: string;
}): Promise<MarketDataAcquisitionCommitResult> => {
  if (!isTauriRuntime()) {
    throw createApiError(
      toBackendErrorMessage("TAURI_RUNTIME_UNAVAILABLE", undefined, 400),
      "TAURI_RUNTIME_UNAVAILABLE",
      undefined,
      400,
    );
  }
  const mod = await loadTauriCoreModule();
  try {
    return await mod.invoke<MarketDataAcquisitionCommitResult>(
      "commit_market_data_acquisition_output",
      payload,
    );
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const openLocalPath = async (path: string): Promise<void> => {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || !isTauriRuntime()) {
    return;
  }
  const mod = await loadTauriOpenerModule();
  await mod.openPath(normalizedPath);
};

export const pickPortableImportPackagePath = async (): Promise<
  string | null
> => {
  if (!isTauriRuntime()) {
    return null;
  }
  const dialogMod = await import("@tauri-apps/plugin-dialog");
  const selected = await dialogMod.open({
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Portable Data Package",
        extensions: ["otp-package"],
      },
    ],
  });
  return typeof selected === "string" && selected.trim()
    ? selected.trim()
    : null;
};

const normalizeCsvFolderStagingMode = (
  value: unknown,
): CsvFolderStagingMode => {
  const raw = String(value ?? "").trim();
  return raw === "METADATA_ONLY" ||
    raw === "SELECTIVE_DIGEST" ||
    raw === "SELECTIVE_COPY"
    ? raw
    : "FULL_COPY";
};

const normalizeCsvFolderStagingProgressPhase = (
  value: unknown,
): CsvFolderStagingProgressPhase => {
  const raw = String(value ?? "").trim();
  return raw === "COPYING" || raw === "DIGESTING" || raw === "DONE"
    ? raw
    : "DISCOVERING";
};

const toNonNegativeFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
};

const toOptionalNonNegativeFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.min(100, numeric);
};

const normalizeCsvFolderStagingProgress = (
  value: unknown,
): CsvFolderStagingProgress | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const progressRequestId = String(record.progressRequestId ?? "").trim();
  if (!progressRequestId) {
    return null;
  }
  return {
    progressRequestId,
    stageMode: normalizeCsvFolderStagingMode(record.stageMode),
    phase: normalizeCsvFolderStagingProgressPhase(record.phase),
    processedFiles: Math.floor(
      toNonNegativeFiniteNumber(record.processedFiles),
    ),
    totalFiles:
      record.totalFiles === null || record.totalFiles === undefined
        ? null
        : Math.floor(toNonNegativeFiniteNumber(record.totalFiles)),
    processedBytes: Math.floor(
      toNonNegativeFiniteNumber(record.processedBytes),
    ),
    totalBytes:
      record.totalBytes === null || record.totalBytes === undefined
        ? null
        : Math.floor(toNonNegativeFiniteNumber(record.totalBytes)),
    progressPercent: toOptionalNonNegativeFiniteNumber(record.progressPercent),
  };
};

export const listenCsvFolderStagingProgress = async (
  progressRequestId: string,
  handler: (progress: CsvFolderStagingProgress) => void,
): Promise<() => void> => {
  const normalizedProgressRequestId = String(progressRequestId || "").trim();
  if (!normalizedProgressRequestId || !isTauriRuntime()) {
    return () => undefined;
  }
  const eventModule = await loadTauriEventModule();
  const unlisten = await eventModule.listen<unknown>(
    CSV_FOLDER_STAGING_PROGRESS_EVENT,
    (event) => {
      const progress = normalizeCsvFolderStagingProgress(event.payload);
      if (progress?.progressRequestId === normalizedProgressRequestId) {
        handler(progress);
      }
    },
  );
  return createTauriUnlistenCleanup(unlisten);
};

export const stageCsvFolderForImportNative = async (payload: {
  folderPath: string;
  sourceFolderBookmarkId?: string;
  stageMode: CsvFolderStagingMode;
  relativePaths?: string[];
  progressRequestId?: string;
  cancellationRequestId?: string;
}): Promise<CsvFolderStagingResult> => {
  if (!isTauriRuntime()) {
    throw createApiError(
      toBackendErrorMessage("TAURI_RUNTIME_UNAVAILABLE", undefined, 400),
      "TAURI_RUNTIME_UNAVAILABLE",
      undefined,
      400,
    );
  }
  const mod = await loadTauriCoreModule();
  try {
    return await mod.invoke<CsvFolderStagingResult>(
      "stage_csv_folder_for_import",
      payload,
    );
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const cancelCsvFolderStagingNative = async (
  cancellationRequestId: string,
): Promise<void> => {
  if (!isTauriRuntime()) {
    throw createApiError(
      toBackendErrorMessage("TAURI_RUNTIME_UNAVAILABLE", undefined, 400),
      "TAURI_RUNTIME_UNAVAILABLE",
      undefined,
      400,
    );
  }
  const mod = await loadTauriCoreModule();
  try {
    await mod.invoke<void>("cancel_csv_folder_staging", {
      cancellationRequestId: String(cancellationRequestId || ""),
    });
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export const discardCsvFolderStagingNative = async (
  stagedFolderPath: string,
): Promise<void> => {
  if (!isTauriRuntime()) {
    throw createApiError(
      toBackendErrorMessage("TAURI_RUNTIME_UNAVAILABLE", undefined, 400),
      "TAURI_RUNTIME_UNAVAILABLE",
      undefined,
      400,
    );
  }
  const mod = await loadTauriCoreModule();
  try {
    await mod.invoke<void>("discard_csv_folder_staging", {
      stagedFolderPath: String(stagedFolderPath || "").trim(),
    });
  } catch (error) {
    throw toNativeCommandApiError(error);
  }
};

export type NativeBackendStartupPreflightStatus = {
  state: "PENDING" | "READY" | "FAILED";
  stage: string;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAtMs: number;
};

const BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1 =
  "zinuto://v1/backend-startup-preflight-status";
const BACKEND_STARTUP_PREFLIGHT_LISTENER_DEADLINE_MS = 2_000;

const normalizeNativeBackendStartupPreflightStatus = (
  value: unknown,
): NativeBackendStartupPreflightStatus | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const state =
    typeof record.state === "string" ? record.state.trim().toUpperCase() : "";
  const stage = typeof record.stage === "string" ? record.stage.trim() : "";
  const checkedAtMs = record.checkedAtMs;
  const errorCode = record.errorCode;
  const errorMessage = record.errorMessage;
  if (
    (state !== "PENDING" && state !== "READY" && state !== "FAILED") ||
    !stage ||
    typeof checkedAtMs !== "number" ||
    !Number.isFinite(checkedAtMs) ||
    checkedAtMs < 0 ||
    (errorCode !== null &&
      errorCode !== undefined &&
      typeof errorCode !== "string") ||
    (errorMessage !== null &&
      errorMessage !== undefined &&
      typeof errorMessage !== "string")
  ) {
    return null;
  }
  const optionalString = (input: string | null | undefined): string | null =>
    input?.trim() || null;
  return {
    checkedAtMs,
    errorCode: optionalString(errorCode),
    errorMessage: optionalString(errorMessage),
    stage,
    state,
  };
};

export const subscribeToNativeBackendStartupPreflightStatus = async (
  handler: (status: NativeBackendStartupPreflightStatus) => void,
): Promise<() => void> => {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  const unlisten = await installTauriListenerWithinDeadline(
    async () => {
      const eventModule = await loadTauriEventModule();
      return eventModule.listen<unknown>(
        BACKEND_STARTUP_PREFLIGHT_STATUS_EVENT_V1,
        (event) => {
          const status = normalizeNativeBackendStartupPreflightStatus(
            event.payload,
          );
          if (status) {
            handler(status);
          }
        },
      );
    },
    "BACKEND_STARTUP_PREFLIGHT_STATUS_V1",
    BACKEND_STARTUP_PREFLIGHT_LISTENER_DEADLINE_MS,
  );
  return createTauriUnlistenCleanup(unlisten);
};

export const getNativeBackendStartupPreflightStatus =
  async (): Promise<NativeBackendStartupPreflightStatus | null> => {
    if (!isTauriRuntime()) {
      return null;
    }
    const mod = await loadTauriCoreModule();
    try {
      return await mod.invoke<NativeBackendStartupPreflightStatus>(
        "backend_startup_preflight_status",
      );
    } catch (error) {
      throw toNativeCommandApiError(error);
    }
  };
