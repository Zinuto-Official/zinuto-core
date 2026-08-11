// SPDX-License-Identifier: GPL-3.0-only

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { IMPORT_LIMITS, INPUT_LIMITS } from "@zinuto/shared/input-limits";
import type { PreviewImportPlanRecord } from "../ports/infrastructure/db/dataSource/previewSessionStore.js";
import {
  normalizeMaxImportSymbols,
  selectCandidatesForSourceSymbolAccess,
} from "./symbolLimit.js";
import { convertNativeImportPathToWirePath } from '../../domain/dataSource/importPathSemantics.js';
import type {
  LocalDataImportSymbolLimit,
  StartLocalDataImportInput,
} from "./types.js";
import {
  classifyImportedFileContentVersion,
  extractImportFileFingerprintDigest,
} from './importedFileVersion.js';

type ExistingImportedFileMetaRow = {
  instrumentId?: string | null;
  symbol: string;
  fileName?: string | null;
  filePath?: string | null;
  fileSize: number | null;
  fileMtimeMs: number | null;
  fileFingerprint: string | null;
};

type ResolveImportFilesFromPreviewPlanResult = {
  files: StartLocalDataImportInput["files"];
  tempDirPaths: string[];
  sourceFolder: string;
  snapshotSymbols: string[];
  sourceTotalFiles: number;
  symbolLimit: LocalDataImportSymbolLimit;
};

type PreviewPlanResolverAppErrorArgs = Record<
  string,
  string | number | boolean | null
>;

type CreatePreviewPlanImportResolverArgs = {
  normalizeImportFilePath: (filePathRaw: string) => string;
  assertManagedImportTempPath: (filePath: string) => void;
  parseSymbolFromFileName: (fileName: string) => string;
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  normalizeFileSize: (value: unknown) => number;
  previewStore: {
    resolvePlan: (
      previewToken: string,
      previewPlanId: string,
    ) => (PreviewImportPlanRecord & { folderPath?: string }) | null;
  };
  listLatestImportedFileMetaBySource: (
    sourceId: string,
  ) => ExistingImportedFileMetaRow[];
  hashCompareConcurrency: number;
  buildImportFileFingerprint?: (filePath: string) => Promise<string>;
  appError: (
    code: string,
    args?: PreviewPlanResolverAppErrorArgs,
    status?: number,
  ) => Error;
};

const mapWithConcurrencyLimit = async <T, R>(
  items: T[],
  concurrencyLimitRaw: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const concurrencyLimit = Math.max(
    1,
    Math.floor(Number(concurrencyLimitRaw) || 0),
  );
  if (!items.length) {
    return [];
  }
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrencyLimit, items.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const normalizeFileMtimeMs = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const normalizeFileFingerprint = (value: unknown): string =>
  String(value || "").trim();

const preserveNonWhitespaceText = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

const buildSourceFileIdentityKey = (
  input: {
    filePath?: unknown;
    fileName?: unknown;
    symbol?: unknown;
  },
): string =>
  preserveNonWhitespaceText(input.fileName)
    || convertNativeImportPathToWirePath(preserveNonWhitespaceText(input.filePath))
    || String(input.symbol ?? '').trim().toUpperCase();

const assertCandidateSymbolUniqueness = (
  candidates: Array<{
    symbol: string;
    originalname: string;
  }>,
  appError: CreatePreviewPlanImportResolverArgs["appError"],
): void => {
  const firstFileBySymbol = new Map<string, { originalname: string }>();
  candidates.forEach((candidate) => {
    const symbol = String(candidate.symbol || "").trim().toUpperCase();
    if (!symbol) {
      return;
    }
    const existing = firstFileBySymbol.get(symbol);
    if (existing) {
      throw appError("LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL", {
        symbol,
        fileName: candidate.originalname,
        duplicateFileName: existing.originalname,
      });
    }
    firstFileBySymbol.set(symbol, {
      originalname: candidate.originalname,
    });
  });
};

const uniqueSymbolsInOrder = (
  candidates: Array<{ symbol: string }>,
): string[] => {
  const seen = new Set<string>();
  const symbols: string[] = [];
  candidates.forEach((candidate) => {
    const symbol = String(candidate.symbol || "").trim().toUpperCase();
    if (!symbol || seen.has(symbol)) {
      return;
    }
    seen.add(symbol);
    symbols.push(symbol);
  });
  return symbols;
};

const buildImportFileFingerprint = async (filePath: string): Promise<string> => {
  const reader = createReadStream(filePath);
  const hash = createHash("sha256");
  try {
    for await (const chunk of reader) {
      hash.update(chunk);
    }
  } finally {
    reader.destroy();
  }
  return hash.digest("hex").toLowerCase();
};

const isMissingFileError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = String((error as { code?: unknown }).code || "").trim();
  return code === "ENOENT" || code === "ENOTDIR";
};

export const createPreviewPlanImportResolver = ({
  normalizeImportFilePath,
  assertManagedImportTempPath,
  parseSymbolFromFileName,
  readDistinctImportTempDirPaths,
  normalizeFileSize,
  previewStore,
  listLatestImportedFileMetaBySource,
  hashCompareConcurrency,
  buildImportFileFingerprint: buildImportFileFingerprintOverride,
  appError,
}: CreatePreviewPlanImportResolverArgs) => {
  const resolveFileFingerprint =
    buildImportFileFingerprintOverride ?? buildImportFileFingerprint;
  const resolveCandidateFileFingerprint = async (
    candidate: { path: string },
  ): Promise<string> => {
    try {
      return await resolveFileFingerprint(candidate.path);
    } catch (error) {
      if (isMissingFileError(error)) {
        throw appError("CSV_FILE_MISSING", { filePath: candidate.path });
      }
      throw error;
    }
  };
  const resolveImportFilesFromPreviewPlan = async (
    previewTokenRaw: string,
    previewPlanIdRaw: string,
    preferredSourceFolderRaw = "",
    sourceIdRaw = "",
    maxSymbolsRaw: number | null = null,
    unlockedSourceSymbolsRaw?: readonly string[] | null,
  ): Promise<ResolveImportFilesFromPreviewPlanResult> => {
    const previewToken = String(previewTokenRaw || "").trim();
    const previewPlanId = String(previewPlanIdRaw || "").trim();
    const sourceId = String(sourceIdRaw || "").trim();
    const maxImportSymbols = normalizeMaxImportSymbols(maxSymbolsRaw);
    if (!previewToken || !previewPlanId) {
      throw appError("INVALID_PARAMS");
    }
    const plan = previewStore.resolvePlan(previewToken, previewPlanId);
    const tempDirPaths = readDistinctImportTempDirPaths(
      (plan?.files ?? []).map((file) => preserveNonWhitespaceText(file.path)),
    );
    if (!plan || !plan.files.length) {
      throw appError("LOCAL_DATA_IMPORT_PREVIEW_EXPIRED");
    }

    const files: StartLocalDataImportInput["files"] = [];
    const snapshotSymbols: string[] = [];
    const candidateFiles: Array<{
      originalname: string;
      path: string;
      size: number;
      symbol: string;
      mtimeMs: number;
      previewFingerprint: string;
      fileIdentityKey: string;
      mapping?: StartLocalDataImportInput["mapping"];
    }> = [];
    for (const file of plan.files) {
      const normalizedPath = normalizeImportFilePath(file.path);
      if (!normalizedPath) {
        continue;
      }
      assertManagedImportTempPath(normalizedPath);
      const normalizedName =
        preserveNonWhitespaceText(file.originalname) ||
        normalizedPath.split('/').pop() ||
        '';
      const symbol =
        String(file.symbol || "").trim().toUpperCase() ||
        parseSymbolFromFileName(normalizedName);
      const fileIdentityKey = buildSourceFileIdentityKey({
        filePath: normalizedPath,
        fileName: normalizedName,
        symbol,
      });
      if (!symbol || !fileIdentityKey) {
        continue;
      }
      snapshotSymbols.push(symbol);
      candidateFiles.push({
        originalname: normalizedName,
        path: normalizedPath,
        size: normalizeFileSize(file.size),
        symbol,
        mtimeMs: normalizeFileMtimeMs(file.mtimeMs),
        previewFingerprint: normalizeFileFingerprint(file.fingerprint),
        fileIdentityKey,
        mapping: file.mapping ? { ...file.mapping } : undefined,
      });
    }
    if (!candidateFiles.length) {
      throw appError("UPLOAD_FILES_REQUIRED");
    }
    assertCandidateSymbolUniqueness(candidateFiles, appError);
    if (candidateFiles.length > IMPORT_LIMITS.maxFiles) {
      throw appError("LOCAL_DATA_IMPORT_LIMIT_EXCEEDED", {
        limit: "files",
        max: IMPORT_LIMITS.maxFiles,
      });
    }
    const selectedCandidates = selectCandidatesForSourceSymbolAccess(
      candidateFiles,
      maxImportSymbols,
      unlockedSourceSymbolsRaw,
    );
    const importCandidateFiles = selectedCandidates.candidates;
    if (!importCandidateFiles.length) {
      throw appError("UPLOAD_FILES_REQUIRED");
    }
    const invalidCandidate = importCandidateFiles.find((file) => (
      file.path.length > INPUT_LIMITS.pathChars ||
      file.originalname.length > INPUT_LIMITS.relativePathChars ||
      file.symbol.length > INPUT_LIMITS.symbolChars
    ));
    if (invalidCandidate) {
      throw appError("LOCAL_DATA_IMPORT_LIMIT_EXCEEDED", {
        limit: "file",
        max: IMPORT_LIMITS.maxSingleFileBytes,
      });
    }

    const candidatesWithCurrentStat = await mapWithConcurrencyLimit(
      importCandidateFiles,
      hashCompareConcurrency,
      async (candidate) => {
        let stat: Awaited<ReturnType<typeof fs.stat>>;
        try {
          stat = await fs.stat(candidate.path);
        } catch (error) {
          if (isMissingFileError(error)) {
            throw appError("CSV_FILE_MISSING", { filePath: candidate.path });
          }
          throw error;
        }
        if (!stat.isFile()) {
          throw appError("CSV_FILE_MISSING", { filePath: candidate.path });
        }
        const currentSize = normalizeFileSize(stat.size);
        const currentMtimeMs = normalizeFileMtimeMs(stat.mtimeMs);
        if (
          currentSize !== candidate.size ||
          currentMtimeMs !== candidate.mtimeMs
        ) {
          throw appError("LOCAL_DATA_IMPORT_PREVIEW_EXPIRED", {
            filePath: candidate.path,
          });
        }
        return {
          ...candidate,
          size: currentSize,
          mtimeMs: currentMtimeMs,
        };
      },
    );
    const oversizedCandidate = candidatesWithCurrentStat.find(
      (candidate) => candidate.size > IMPORT_LIMITS.maxSingleFileBytes,
    );
    if (oversizedCandidate) {
      throw appError("LOCAL_DATA_IMPORT_LIMIT_EXCEEDED", {
        limit: "file",
        max: IMPORT_LIMITS.maxSingleFileBytes,
      });
    }
    const totalCandidateBytes = candidatesWithCurrentStat.reduce(
      (sum, file) => sum + file.size,
      0,
    );
    if (totalCandidateBytes > IMPORT_LIMITS.maxTotalBytes) {
      throw appError("LOCAL_DATA_IMPORT_LIMIT_EXCEEDED", {
        limit: "totalBytes",
        max: IMPORT_LIMITS.maxTotalBytes,
      });
    }

    const verifiedCandidates = await mapWithConcurrencyLimit(
      candidatesWithCurrentStat,
      hashCompareConcurrency,
      async (candidate) => {
        const previewDigest =
          extractImportFileFingerprintDigest(candidate.previewFingerprint);
        if (!previewDigest) {
          throw appError("LOCAL_DATA_IMPORT_PREVIEW_EXPIRED", {
            filePath: candidate.path,
          });
        }
        const currentFingerprint = await resolveCandidateFileFingerprint(candidate);
        let afterStat: Awaited<ReturnType<typeof fs.stat>>;
        try {
          afterStat = await fs.stat(candidate.path);
        } catch (error) {
          if (isMissingFileError(error)) {
            throw appError("CSV_FILE_MISSING", { filePath: candidate.path });
          }
          throw error;
        }
        const afterSize = normalizeFileSize(afterStat.size);
        const afterMtimeMs = normalizeFileMtimeMs(afterStat.mtimeMs);
        const currentDigest =
          extractImportFileFingerprintDigest(currentFingerprint);
        if (
          !afterStat.isFile() ||
          afterSize !== candidate.size ||
          afterMtimeMs !== candidate.mtimeMs ||
          !currentDigest ||
          currentDigest !== previewDigest
        ) {
          throw appError("LOCAL_DATA_IMPORT_PREVIEW_EXPIRED", {
            filePath: candidate.path,
          });
        }
        return {
          ...candidate,
          fingerprint: currentDigest,
        };
      },
    );

    const latestImportedFileMetaByFileIdentity = new Map<
      string,
      ExistingImportedFileMetaRow
    >();
    if (sourceId) {
      listLatestImportedFileMetaBySource(sourceId).forEach((item) => {
        const fileIdentityKey = buildSourceFileIdentityKey(item);
        if (!fileIdentityKey || latestImportedFileMetaByFileIdentity.has(fileIdentityKey)) {
          return;
        }
        latestImportedFileMetaByFileIdentity.set(fileIdentityKey, item);
      });
    }

    const latestImportedFileMetaBySymbol = new Map<
      string,
      ExistingImportedFileMetaRow
    >();
    if (sourceId) {
      listLatestImportedFileMetaBySource(sourceId).forEach((item) => {
        const symbol = String(item.symbol || "").trim().toUpperCase();
        if (!symbol || latestImportedFileMetaBySymbol.has(symbol)) {
          return;
        }
        latestImportedFileMetaBySymbol.set(symbol, item);
      });
    }

    verifiedCandidates.forEach((candidate) => {
      const existing =
        latestImportedFileMetaByFileIdentity.get(candidate.fileIdentityKey) ??
        latestImportedFileMetaBySymbol.get(candidate.symbol);
      if (
        existing
        && classifyImportedFileContentVersion({
          incomingSize: candidate.size,
          incomingFingerprint: candidate.fingerprint,
          existingSize: normalizeFileSize(existing.fileSize),
          existingFingerprint: existing.fileFingerprint,
        }) === 'UNCHANGED'
      ) {
        return;
      }
      files.push({
        originalname: candidate.originalname,
        path: candidate.path,
        size: candidate.size,
        symbol: candidate.symbol,
        mtimeMs: candidate.mtimeMs,
        fingerprint: candidate.fingerprint,
        mapping: candidate.mapping ? { ...candidate.mapping } : undefined,
      });
    });

    const resolvedSnapshotSymbols =
      maxImportSymbols !== null
        ? uniqueSymbolsInOrder(importCandidateFiles)
        : Array.isArray(plan.snapshotSymbols) && plan.snapshotSymbols.length > 0
          ? Array.from(
              new Set(
                plan.snapshotSymbols
                  .map((item) => String(item || '').trim().toUpperCase())
                  .filter((item) => Boolean(item))
              )
            ).sort((left, right) => left.localeCompare(right, 'en'))
          : Array.from(new Set(snapshotSymbols)).sort((left, right) =>
              left.localeCompare(right, 'en'),
            );
    const resolvedSourceTotalFiles =
      maxImportSymbols !== null
        ? importCandidateFiles.length
        : Math.max(
            0,
            Math.floor(Number(plan.sourceTotalFiles ?? candidateFiles.length) || 0),
            candidateFiles.length,
          );

    return {
      files,
      tempDirPaths,
      sourceFolder:
        preserveNonWhitespaceText(preferredSourceFolderRaw) ||
        preserveNonWhitespaceText(plan.folderPath),
      snapshotSymbols: resolvedSnapshotSymbols,
      sourceTotalFiles: resolvedSourceTotalFiles,
      symbolLimit: selectedCandidates.symbolLimit,
    };
  };

  return {
    resolveImportFilesFromPreviewPlan,
  };
};
