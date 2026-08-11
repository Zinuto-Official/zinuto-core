// SPDX-License-Identifier: GPL-3.0-only

import { isAppError } from "../../kernel/appError.js";
import { resolveSupportedImportFileFormat } from "./supportedFileFormats.js";

export type CsvImportProgressEvent = {
  fileName: string;
  symbol: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  isCompleted: boolean;
  fileProgressPercent?: number;
};

export const normalizeFileProgressPercent = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

export const emitProgressEvent = (
  onProgress: ((event: CsvImportProgressEvent) => void) | undefined,
  payload: CsvImportProgressEvent,
): void => {
  onProgress?.({
    ...payload,
    fileProgressPercent: normalizeFileProgressPercent(
      payload.isCompleted ? 100 : (payload.fileProgressPercent ?? 0),
    ),
  });
};

export type ProgressTickerStop = ((finalPercent?: number) => void) & {
  getError: () => unknown | null;
};

export const createProgressTicker = (
  onTick: (nextPercent: number) => void,
  startPercent: number,
  maxPercent: number,
  stepPercent = 2,
  intervalMs = 100,
): ProgressTickerStop => {
  let currentPercent = normalizeFileProgressPercent(startPercent);
  const upperBoundPercent = normalizeFileProgressPercent(
    Math.max(currentPercent, maxPercent),
  );
  let timer: ReturnType<typeof setInterval> | null = null;
  let tickError: unknown = null;
  const clearTicker = (): void => {
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };
  const runTick = (nextPercent: number): void => {
    if (tickError) {
      return;
    }
    try {
      onTick(nextPercent);
    } catch (error) {
      tickError = error;
      clearTicker();
    }
  };
  if (currentPercent < upperBoundPercent) {
    timer = setInterval(
      () => {
        currentPercent = Math.min(
          upperBoundPercent,
          currentPercent + Math.max(1, Math.floor(stepPercent)),
        );
        runTick(currentPercent);
        if (currentPercent >= upperBoundPercent || tickError) {
          clearTicker();
        }
      },
      Math.max(50, Math.floor(intervalMs)),
    );
  }
  const stopTicker = ((finalPercent?: number) => {
    clearTicker();
    if (finalPercent === undefined) {
      return;
    }
    if (tickError) {
      throw tickError;
    }
    const normalizedFinalPercent = normalizeFileProgressPercent(finalPercent);
    if (normalizedFinalPercent > currentPercent) {
      currentPercent = normalizedFinalPercent;
      runTick(currentPercent);
    }
    if (tickError) {
      throw tickError;
    }
  }) as ProgressTickerStop;
  stopTicker.getError = () => tickError;
  return stopTicker;
};

export const stopProgressTickerForImport = (
  stopTicker: ProgressTickerStop,
  finalPercent?: number,
): void => {
  stopTicker(finalPercent);
  const error = stopTicker.getError();
  if (error) {
    throw error;
  }
};

type ImportFileDescriptor = { originalname: string; path: string };

export const resolveMaterializeChunkSize = (
  files: ImportFileDescriptor[],
  offset: number,
  requestedBatchSizeRaw: unknown,
): number => {
  const remaining = Math.max(0, files.length - offset);
  if (remaining <= 0) {
    return 0;
  }
  const requestedBatchSize = Math.max(
    1,
    Math.floor(Number(requestedBatchSizeRaw) || 0),
  );
  const maxChunkSize = Math.min(requestedBatchSize, remaining);
  const firstFile = files[offset];
  const firstFormat = resolveSupportedImportFileFormat(
    firstFile?.originalname || firstFile?.path || "",
  );
  if (firstFormat === "xlsx") {
    return 1;
  }

  let chunkSize = 0;
  while (chunkSize < maxChunkSize) {
    const file = files[offset + chunkSize];
    const format = resolveSupportedImportFileFormat(
      file?.originalname || file?.path || "",
    );
    if (format === "xlsx") {
      break;
    }
    chunkSize += 1;
  }
  return Math.max(1, chunkSize);
};

const IMPORT_ERROR_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const toCsvImportErrorCode = (error: unknown): string => {
  if (isAppError(error)) {
    return error.code;
  }
  if (error && typeof error === "object") {
    const code = String((error as { code?: unknown }).code ?? "").trim();
    if (IMPORT_ERROR_CODE_REGEX.test(code)) {
      return code;
    }
  }
  if (error instanceof Error) {
    const messageCode = String(error.message || "").trim();
    if (IMPORT_ERROR_CODE_REGEX.test(messageCode)) {
      return messageCode;
    }
  }
  console.error(
    "[zinuto-import] file import failed with unexpected error shape",
    { errorType: error instanceof Error ? error.name : typeof error },
  );
  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else {
    console.error(error);
  }
  return "CSV_FILE_IMPORT_FAILED";
};
