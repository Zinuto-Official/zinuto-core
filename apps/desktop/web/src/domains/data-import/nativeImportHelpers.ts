// SPDX-License-Identifier: GPL-3.0-only

import { open as tauriDialogOpen } from "@tauri-apps/plugin-dialog";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import {
  cancelCsvFolderStagingNative,
  discardCsvFolderStagingNative,
  hasTauriRuntimeBridge,
  listenCsvFolderStagingProgress,
  stageCsvFolderForImportNative,
  toBackendErrorMessage,
  type CsvFolderStagingProgress,
  type CsvFolderStagingResult,
} from "@/api";

type Translate = (key: AppTextKey) => string;

const SUPPORTED_IMPORT_FILE_EXTENSIONS = new Set([
  "csv",
  "json",
  "parquet",
  "xlsx",
]);

let csvFolderStagingProgressRequestCounter = 0;

const createCsvFolderStagingProgressRequestId = (): string =>
  `csv-stage-${Date.now().toString(36)}-${(++csvFolderStagingProgressRequestCounter).toString(36)}`;

const csvFolderStagingAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("CSV_FOLDER_STAGING_ABORTED", "AbortError");

const throwIfCsvFolderStagingAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw csvFolderStagingAbortReason(signal);
  }
};

export const waitForCsvFolderStagingWithAbort = <T>(
  task: Promise<T>,
  signal: AbortSignal | undefined,
  onAbortedResult: (result: T) => void | Promise<void>,
  cancelNative?: () => void | Promise<void>,
): Promise<T> => {
  if (!signal) {
    return task;
  }
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    let settled = false;
    const onAbort = () => {
      if (settled || aborted) {
        return;
      }
      aborted = true;
      signal.removeEventListener("abort", onAbort);
      void Promise.resolve(onAbortNative()).catch(() => undefined);
      reject(csvFolderStagingAbortReason(signal));
    };
    const onAbortNative = cancelNative ?? (() => undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
    void task.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        if (aborted || signal.aborted) {
          void Promise.resolve(onAbortedResult(result)).catch(() => undefined);
          return;
        }
        settled = true;
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        if (!aborted) {
          settled = true;
          reject(error);
        }
      },
    );
  });
};

export const startCsvFolderStagingWithAbort = <T>(
  start: () => Promise<T>,
  signal: AbortSignal | undefined,
  onAbortedResult: (result: T) => void | Promise<void>,
  onAbort?: () => void | Promise<void>,
): Promise<T> => {
  throwIfCsvFolderStagingAborted(signal);
  return waitForCsvFolderStagingWithAbort(
    start(),
    signal,
    onAbortedResult,
    onAbort,
  );
};

const discardAbortedCsvFolderStagingResult = async (
  staged: CsvFolderStagingResult,
): Promise<void> => {
  const stagedFolderPath = normalizeNativeImportDirectoryPath(
    staged?.stagedFolderPath ?? "",
  );
  if (!stagedFolderPath) {
    return;
  }
  await discardCsvFolderStagingNative(stagedFolderPath).catch(() => undefined);
};

const readInvokeErrorCode = (error: unknown): string => {
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const errorCode = String(
      (error as { errorCode?: unknown }).errorCode ?? "",
    ).trim();
    if (errorCode) {
      return errorCode;
    }
  }
  if (error instanceof Error) {
    return String(error.message || "").trim();
  }
  if (typeof error === "string") {
    return error.trim();
  }
  return String(
    (error as { message?: unknown } | null | undefined)?.message ?? "",
  ).trim();
};

const readInvokeErrorArgs = (
  error: unknown,
): Record<string, unknown> | undefined => {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return undefined;
  }
  const errorArgs = (error as { errorArgs?: unknown }).errorArgs;
  if (!errorArgs || typeof errorArgs !== "object" || Array.isArray(errorArgs)) {
    return undefined;
  }
  return errorArgs as Record<string, unknown>;
};

const resolveStageFolderImportErrorMessage = (
  error: unknown,
  tt: Translate,
): string => {
  const code = readInvokeErrorCode(error);
  const errorArgs = readInvokeErrorArgs(error);
  switch (code) {
    case "CSV_FOLDER_BOOKMARK_INVALID":
    case "CSV_FOLDER_BOOKMARK_PATH_INVALID":
    case "CSV_FOLDER_BOOKMARK_ACCESS_DENIED":
    case "CSV_FOLDER_BOOKMARK_RESOLVE_FAILED":
      return tt("appText.folderPermissionExpiredReSelectOriginalFolder");
    default:
      return code
        ? toBackendErrorMessage(code, errorArgs, 400)
        : tt("appText.readFolder");
  }
};

export const normalizeNativeImportDirectoryPath = (
  selected: string,
): string => {
  const raw = String(selected ?? "");
  if (!raw.trim()) {
    return "";
  }
  const isWindowsNativePath =
    /^[A-Za-z]:[\\/]/u.test(raw) || /^\\\\/u.test(raw);
  const normalized = isWindowsNativePath ? raw.replace(/\\/g, "/") : raw;
  if (normalized === "/") {
    return "/";
  }
  if (/^[A-Za-z]:\/+$/u.test(normalized)) {
    return `${normalized.slice(0, 2)}/`;
  }
  return normalized.replace(/\/+$/u, "");
};

export const normalizeNativeImportRelativePath = (selected: string): string => {
  const raw = String(selected ?? "");
  if (!raw.trim()) {
    return "";
  }
  return raw.replace(/^\/+/u, "");
};

const normalizeSelectedNativeDirectory = normalizeNativeImportDirectoryPath;

export const resolveNativeImportDirectoryName = (selected: string): string =>
  normalizeNativeImportDirectoryPath(selected)
    .split("/")
    .filter((part) => part.length > 0)
    .pop() ?? "";

const normalizePathFromFileUri = (uriValue: string): string => {
  const normalizedUri = String(uriValue || "");
  if (!normalizedUri.trim()) {
    return "";
  }
  try {
    const parsed = new URL(normalizedUri);
    if (parsed.protocol !== "file:") {
      return "";
    }
    const decodedPath = decodeURIComponent(parsed.pathname || "");
    if (!decodedPath) {
      return "";
    }
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }
    return decodedPath;
  } catch {
    return "";
  }
};

export const normalizeDroppedImportFolderPath = (rawPath: string): string => {
  const normalizedRawPath = String(rawPath ?? "");
  if (!normalizedRawPath.trim()) {
    return "";
  }
  let resolvedPath = normalizedRawPath;
  if (/^file:\/\//i.test(normalizedRawPath)) {
    try {
      const parsed = new URL(normalizedRawPath);
      const decodedPath = decodeURIComponent(parsed.pathname || "");
      if (decodedPath) {
        resolvedPath = /^\/[A-Za-z]:\//.test(decodedPath)
          ? decodedPath.slice(1)
          : decodedPath;
      }
    } catch {
      // Keep original path text when URI parsing fails.
    }
  }
  const normalized = normalizeSelectedNativeDirectory(resolvedPath);
  if (!normalized) {
    return "";
  }
  const pathSegments = normalized.split("/");
  const tail = pathSegments[pathSegments.length - 1] ?? "";
  const dotIndex = tail.lastIndexOf(".");
  if (dotIndex <= 0) {
    return normalized;
  }
  const extension = tail
    .slice(dotIndex + 1)
    .trim()
    .toLowerCase();
  if (!SUPPORTED_IMPORT_FILE_EXTENSIONS.has(extension)) {
    return normalized;
  }
  const dividerIndex = normalized.lastIndexOf("/");
  if (dividerIndex <= 0) {
    return "";
  }
  return normalized.slice(0, dividerIndex);
};

const parseDroppedPathTextBlock = (rawText: string): string => {
  const candidates = String(rawText || "")
    .split(/\r?\n|\0/)
    .filter(
      (part) => part.trim().length > 0 && !part.trimStart().startsWith("#"),
    );
  for (const candidate of candidates) {
    const fromUriPath = normalizePathFromFileUri(candidate);
    const normalized = normalizeDroppedImportFolderPath(
      fromUriPath || candidate,
    );
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

type DroppedFileLike = File & {
  path?: string;
};

export const resolveDroppedCsvFolderPath = (
  dataTransfer: DataTransfer,
): string => {
  const itemList = Array.from(dataTransfer.items ?? []);
  for (const item of itemList) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile() as DroppedFileLike | null;
    if (!file) {
      continue;
    }
    const fromItemPath = normalizeDroppedImportFolderPath(file.path ?? "");
    if (fromItemPath) {
      return fromItemPath;
    }
  }
  const files = Array.from(dataTransfer.files ?? []) as DroppedFileLike[];
  for (const file of files) {
    const fromFilePath = normalizeDroppedImportFolderPath(file.path ?? "");
    if (fromFilePath) {
      return fromFilePath;
    }
  }
  for (const type of Array.from(dataTransfer.types ?? [])) {
    const rawData = String(dataTransfer.getData(type) || "");
    if (!rawData.trim()) {
      continue;
    }
    const parsedPath = parseDroppedPathTextBlock(rawData);
    if (parsedPath) {
      return parsedPath;
    }
  }
  return "";
};

export const chooseNativeDirectory = async ({
  defaultPath = "",
  tt,
  resolveUnknownErrorMessage,
}: {
  defaultPath?: string;
  tt: Translate;
  resolveUnknownErrorMessage: (error: unknown, fallback: string) => string;
}): Promise<string> => {
  try {
    const selected = await tauriDialogOpen({
      directory: true,
      multiple: false,
      defaultPath: defaultPath || undefined,
      fileAccessMode: "scoped",
    });
    if (!selected) {
      return "";
    }
    const normalizedSelected = selected as string | string[] | null;
    if (typeof normalizedSelected === "string") {
      return normalizeSelectedNativeDirectory(normalizedSelected);
    }
    if (Array.isArray(normalizedSelected)) {
      const first = normalizedSelected.find(
        (item) => typeof item === "string" && item.trim(),
      );
      return first ? normalizeSelectedNativeDirectory(first) : "";
    }
    return "";
  } catch (error) {
    const details = resolveUnknownErrorMessage(error, "").trim();
    throw new Error(
      details
        ? `${tt("appText.readFolder")} (${details})`
        : tt("appText.readFolder"),
    );
  }
};

export const stageCsvFolderForImport = async (
  folderPath: string,
  tt: Translate,
  sourceFolderBookmarkId = "",
  options?: {
    mode?:
      "FULL_COPY" | "METADATA_ONLY" | "SELECTIVE_DIGEST" | "SELECTIVE_COPY";
    relativePaths?: string[];
    onProgress?: (progress: CsvFolderStagingProgress) => void;
    signal?: AbortSignal;
  },
): Promise<CsvFolderStagingResult> => {
  const normalizedFolderPath = normalizeSelectedNativeDirectory(folderPath);
  const normalizedBookmarkId = String(sourceFolderBookmarkId || "").trim();
  const sourceFolderNameFallback =
    resolveNativeImportDirectoryName(normalizedFolderPath);
  const hasTauriRuntime = hasTauriRuntimeBridge(window);
  if (!hasTauriRuntime) {
    throw new Error(tt("appText.request"));
  }

  try {
    throwIfCsvFolderStagingAborted(options?.signal);
    const progressRequestId = createCsvFolderStagingProgressRequestId();
    const unlistenProgress = await listenCsvFolderStagingProgress(
      progressRequestId,
      (progress) => {
        if (!options?.signal?.aborted) {
          options?.onProgress?.(progress);
        }
      },
    );
    let staged: CsvFolderStagingResult;
    try {
      staged = await startCsvFolderStagingWithAbort(
        () =>
          stageCsvFolderForImportNative({
            folderPath: normalizedFolderPath,
            sourceFolderBookmarkId: normalizedBookmarkId || undefined,
            progressRequestId,
            cancellationRequestId: options?.signal
              ? progressRequestId
              : undefined,
            stageMode:
              options?.mode === "METADATA_ONLY"
                ? "METADATA_ONLY"
                : options?.mode === "SELECTIVE_DIGEST"
                  ? "SELECTIVE_DIGEST"
                  : options?.mode === "SELECTIVE_COPY"
                    ? "SELECTIVE_COPY"
                    : "FULL_COPY",
            relativePaths: Array.isArray(options?.relativePaths)
              ? Array.from(
                  new Set(
                    options?.relativePaths
                      .map((item) =>
                        normalizeNativeImportRelativePath(String(item ?? "")),
                      )
                      .filter((item) => item.length > 0),
                  ),
                )
              : undefined,
          }),
        options?.signal,
        discardAbortedCsvFolderStagingResult,
        () => cancelCsvFolderStagingNative(progressRequestId),
      );
      if (options?.signal?.aborted) {
        await discardAbortedCsvFolderStagingResult(staged);
        throw csvFolderStagingAbortReason(options.signal);
      }
    } finally {
      unlistenProgress();
    }
    return {
      stagedFolderPath: normalizeSelectedNativeDirectory(
        staged?.stagedFolderPath ?? "",
      ),
      sourceFolderPath:
        normalizeSelectedNativeDirectory(staged?.sourceFolderPath ?? "") ||
        normalizedFolderPath,
      sourceFolderName:
        String(staged?.sourceFolderName ?? "").trim() ||
        sourceFolderNameFallback,
      copiedFiles: Math.max(0, Number(staged?.copiedFiles) || 0),
      copiedBytes: Math.max(0, Number(staged?.copiedBytes) || 0),
      sourceFolderBookmarkId:
        String(staged?.sourceFolderBookmarkId ?? "").trim() ||
        normalizedBookmarkId ||
        undefined,
      metadataManifest: staged?.metadataManifest
        ? {
            files: Array.isArray(staged.metadataManifest.files)
              ? staged.metadataManifest.files
                  .map((file) => ({
                    relativePath: normalizeNativeImportRelativePath(
                      file?.relativePath ?? "",
                    ),
                    originalname: normalizeNativeImportRelativePath(
                      file?.originalname ?? "",
                    ),
                    size: Math.max(0, Number(file?.size) || 0),
                    mtimeMs: Math.max(0, Number(file?.mtimeMs) || 0),
                    fingerprint:
                      String(file?.fingerprint ?? "").trim() || undefined,
                  }))
                  .filter((file) => Boolean(file.relativePath))
              : [],
            totalFiles: Math.max(
              0,
              Number(staged.metadataManifest.totalFiles) || 0,
            ),
            totalBytes: Math.max(
              0,
              Number(staged.metadataManifest.totalBytes) || 0,
            ),
          }
        : undefined,
    };
  } catch (error) {
    if (options?.signal?.aborted) {
      throw csvFolderStagingAbortReason(options.signal);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error(resolveStageFolderImportErrorMessage(error, tt));
  }
};
