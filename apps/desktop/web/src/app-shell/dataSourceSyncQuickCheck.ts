// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiLocalDataSyncQuickCheck,
  CsvFolderStagingProgress,
  CsvFolderStagingResult,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  normalizeNativeImportDirectoryPath,
  normalizeNativeImportRelativePath,
} from '@/domains/data-import/nativeImportHelpers';

type CsvFolderMetadataFile = NonNullable<
  CsvFolderStagingResult['metadataManifest']
>['files'][number];

type StageCsvFolderForImport = (
  folderPath: string,
  tt: (key: AppTextKey) => string,
  sourceFolderBookmarkId: string,
  options: {
    mode: 'METADATA_ONLY' | 'SELECTIVE_DIGEST';
    relativePaths?: string[];
    onProgress?: (progress: CsvFolderStagingProgress) => void;
  },
) => Promise<CsvFolderStagingResult>;

type QuickCheckLocalDataSourceSyncByMetadata = (
  sourceId: string,
  payload: {
    sourceFolder?: string;
    files: CsvFolderMetadataFile[];
  },
) => Promise<ApiLocalDataSyncQuickCheck>;

const SHA256_DIGEST_REGEX = /^[0-9a-f]{64}$/i;

const isValidSha256Fingerprint = (value: unknown): boolean => {
  const normalized = String(value || '').trim();
  const digest = normalized.split(':').at(-1) ?? '';
  return SHA256_DIGEST_REGEX.test(digest);
};

export const mergeSelectiveDigestMetadataFiles = ({
  metadataFiles,
  digestedFiles,
  requiredRelativePaths,
}: {
  metadataFiles: CsvFolderMetadataFile[];
  digestedFiles: CsvFolderMetadataFile[];
  requiredRelativePaths: string[];
}): CsvFolderMetadataFile[] => {
  const requiredPathKeys = new Set(
    requiredRelativePaths.map((relativePath) =>
      normalizeNativeImportRelativePath(relativePath),
    ),
  );
  const digestByRelativePath = new Map(
    digestedFiles.map((file) => [
      normalizeNativeImportRelativePath(file.relativePath || ''),
      file,
    ]),
  );
  requiredPathKeys.forEach((relativePath) => {
    const digestFile = digestByRelativePath.get(relativePath);
    if (
      !relativePath
      || !digestFile
      || !isValidSha256Fingerprint(digestFile.fingerprint)
      || !Number.isFinite(Number(digestFile.size))
      || Number(digestFile.size) < 0
      || !Number.isFinite(Number(digestFile.mtimeMs))
      || Number(digestFile.mtimeMs) < 0
    ) {
      throw new Error('CSV_FILE_IMPORT_FAILED');
    }
  });

  const mergedPathKeys = new Set<string>();
  const mergedFiles = metadataFiles.map((file) => {
    const relativePath = normalizeNativeImportRelativePath(file.relativePath || '');
    if (!requiredPathKeys.has(relativePath)) {
      return file;
    }
    const digestFile = digestByRelativePath.get(relativePath);
    if (!digestFile) {
      throw new Error('CSV_FILE_IMPORT_FAILED');
    }
    mergedPathKeys.add(relativePath);
    return {
      ...file,
      size: digestFile.size,
      mtimeMs: digestFile.mtimeMs,
      fingerprint: String(digestFile.fingerprint || '').trim(),
    };
  });
  if (mergedPathKeys.size !== requiredPathKeys.size) {
    throw new Error('CSV_FILE_IMPORT_FAILED');
  }
  return mergedFiles;
};

export const resolveDataSourceSyncQuickCheckWithSelectiveDigest = async ({
  sourceId,
  sourceFolder,
  sourceFolderBookmarkId,
  tt,
  stageFolderForImport,
  quickCheckByMetadata,
  onProgress,
}: {
  sourceId: string;
  sourceFolder: string;
  sourceFolderBookmarkId: string;
  tt: (key: AppTextKey) => string;
  stageFolderForImport: StageCsvFolderForImport;
  quickCheckByMetadata: QuickCheckLocalDataSourceSyncByMetadata;
  onProgress?: (progress: CsvFolderStagingProgress) => void;
}): Promise<ApiLocalDataSyncQuickCheck> => {
  const normalizedSourceFolder = normalizeNativeImportDirectoryPath(sourceFolder);
  const normalizedBookmarkId = String(sourceFolderBookmarkId || '').trim();
  const stagedMetadata = await stageFolderForImport(
    normalizedSourceFolder,
    tt,
    normalizedBookmarkId,
    { mode: 'METADATA_ONLY', onProgress },
  );
  const metadataFiles = stagedMetadata.metadataManifest?.files ?? [];
  const effectiveSourceFolder =
    normalizeNativeImportDirectoryPath(
      stagedMetadata.sourceFolderPath || normalizedSourceFolder,
    ) || undefined;
  let quickCheck = await quickCheckByMetadata(sourceId, {
    sourceFolder: effectiveSourceFolder,
    files: metadataFiles,
  });
  if (quickCheck.fingerprintRequiredRelativePaths.length <= 0) {
    return quickCheck;
  }

  const digestedFiles = await stageFolderForImport(
    effectiveSourceFolder || normalizedSourceFolder,
    tt,
    normalizedBookmarkId,
    {
      mode: 'SELECTIVE_DIGEST',
      relativePaths: quickCheck.fingerprintRequiredRelativePaths,
      onProgress,
    },
  );
  quickCheck = await quickCheckByMetadata(sourceId, {
    sourceFolder: effectiveSourceFolder,
    files: mergeSelectiveDigestMetadataFiles({
      metadataFiles,
      digestedFiles: digestedFiles.metadataManifest?.files ?? [],
      requiredRelativePaths: quickCheck.fingerprintRequiredRelativePaths,
    }),
  });
  return quickCheck;
};
