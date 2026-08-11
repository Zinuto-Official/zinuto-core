// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type {
  ApiLocalDataSyncQuickCheck,
  CsvFolderStagingProgress,
  CsvFolderStagingResult,
} from '../../src/api';
import {
  mergeSelectiveDigestMetadataFiles,
  resolveDataSourceSyncQuickCheckWithSelectiveDigest,
} from '../../src/app-shell/dataSourceSyncQuickCheck';

const DIGEST = 'a'.repeat(64);

const dataSourceSyncMonitorControllerSource = readFileSync(
  new URL(
    '../../src/app-shell/useDataSourceSyncMonitorController.ts',
    import.meta.url,
  ),
  'utf8',
);

const buildQuickCheck = (
  overrides: Partial<ApiLocalDataSyncQuickCheck> = {},
): ApiLocalDataSyncQuickCheck => ({
  sourceId: 'source-1',
  sourceName: 'source-1',
  sourceFolder: '/source',
  baseTimeframe: '1d',
  status: 'POTENTIAL_CHANGES',
  reasonCode: 'SYNC_QUICK_CHECK_FINGERPRINT_REQUIRED',
  checkedAt: '2026-04-10T00:00:00.000Z',
  estimatedChangedFiles: 1,
  estimatedChangedSymbols: 0,
  detectedFiles: 1,
  trackedFiles: 1,
  changedSymbols: [],
  changedRelativePaths: [],
  fingerprintRequiredRelativePaths: ['AAPL.csv'],
  missingSymbolsRetained: [],
  snapshotSymbols: ['AAPL'],
  invalidFiles: 0,
  symbolLimit: {
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols: [],
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  },
  ...overrides,
});

const metadataStagingResult = (fingerprint?: string): CsvFolderStagingResult => ({
  stagedFolderPath: '',
  sourceFolderPath: '/bound/source',
  sourceFolderName: 'source',
  copiedFiles: 0,
  copiedBytes: 0,
  metadataManifest: {
    totalFiles: 1,
    totalBytes: 120,
    files: [
      {
        relativePath: 'AAPL.csv',
        originalname: 'AAPL.csv',
        size: 120,
        mtimeMs: 1704067200000,
        fingerprint,
      },
    ],
  },
});

test('global data-source checks run only while data management is active', () => {
  const inactivePageGuards =
    dataSourceSyncMonitorControllerSource.match(
      /if \(activePage !== 'DATA'\)/g,
    ) ?? [];

  assert.ok(inactivePageGuards.length >= 2);
  assert.match(
    dataSourceSyncMonitorControllerSource,
    /activePage === 'DATA'[\s\S]*runDataSourceSyncQuickCheckSweep\(\{ force: true \}\)/,
  );
});

test('selective digest merge carries one verified size, mtime, and fingerprint snapshot', () => {
  const metadataFiles = [
    {
      relativePath: ' group\\west /AAPL.csv ',
      originalname: ' AAPL.csv ',
      size: 120,
      mtimeMs: 1704067200000,
    },
    {
      relativePath: 'MSFT.csv',
      originalname: 'MSFT.csv',
      size: 90,
      mtimeMs: 1704067100000,
    },
  ];
  const merged = mergeSelectiveDigestMetadataFiles({
    metadataFiles,
    digestedFiles: [
      {
        relativePath: ' group\\west /AAPL.csv ',
        originalname: 'AAPL.csv',
        size: 121,
        mtimeMs: 1704067300000,
        fingerprint: DIGEST,
      },
    ],
    requiredRelativePaths: [' group\\west /AAPL.csv '],
  });

  assert.deepEqual(merged, [
    {
      relativePath: ' group\\west /AAPL.csv ',
      originalname: ' AAPL.csv ',
      size: 121,
      mtimeMs: 1704067300000,
      fingerprint: DIGEST,
    },
    metadataFiles[1],
  ]);
});

test('selective digest merge fails closed when a requested snapshot is missing', () => {
  assert.throws(
    () =>
      mergeSelectiveDigestMetadataFiles({
        metadataFiles: metadataStagingResult().metadataManifest?.files ?? [],
        digestedFiles: [],
        requiredRelativePaths: ['AAPL.csv'],
      }),
    /CSV_FILE_IMPORT_FAILED/,
  );
  assert.throws(
    () =>
      mergeSelectiveDigestMetadataFiles({
        metadataFiles: metadataStagingResult().metadataManifest?.files ?? [],
        digestedFiles:
          metadataStagingResult('not-a-sha256-digest').metadataManifest?.files
          ?? [],
        requiredRelativePaths: ['AAPL.csv'],
      }),
    /CSV_FILE_IMPORT_FAILED/,
  );
});

test('resolveDataSourceSyncQuickCheckWithSelectiveDigest reruns quick-check with selective fingerprints', async () => {
  const stageCalls: Array<{
    folderPath: string;
    bookmarkId: string;
    mode: string;
    relativePaths: string[];
  }> = [];
  const quickCheckCalls: Array<{
    sourceFolder?: string;
    files: Array<{ relativePath: string; fingerprint?: string }>;
  }> = [];

  const quickCheck = await resolveDataSourceSyncQuickCheckWithSelectiveDigest({
    sourceId: 'source-1',
    sourceFolder: '/source',
    sourceFolderBookmarkId: 'bookmark-1',
    tt: (key) => key,
    stageFolderForImport: async (folderPath, _tt, bookmarkId, options) => {
      stageCalls.push({
        folderPath,
        bookmarkId,
        mode: options.mode,
        relativePaths: options.relativePaths ?? [],
      });
      return options.mode === 'SELECTIVE_DIGEST'
        ? metadataStagingResult(DIGEST)
        : metadataStagingResult();
    },
    quickCheckByMetadata: async (_sourceId, payload) => {
      quickCheckCalls.push(payload);
      if (quickCheckCalls.length === 1) {
        assert.equal(payload.files[0]?.fingerprint, undefined);
        return buildQuickCheck();
      }
      assert.equal(payload.files[0]?.fingerprint, DIGEST);
      return buildQuickCheck({
        status: 'NO_CHANGES',
        reasonCode: 'NO_CHANGES',
        estimatedChangedFiles: 0,
        fingerprintRequiredRelativePaths: [],
      });
    },
  });

  assert.equal(quickCheck.status, 'NO_CHANGES');
  assert.deepEqual(stageCalls, [
    {
      folderPath: '/source',
      bookmarkId: 'bookmark-1',
      mode: 'METADATA_ONLY',
      relativePaths: [],
    },
    {
      folderPath: '/bound/source',
      bookmarkId: 'bookmark-1',
      mode: 'SELECTIVE_DIGEST',
      relativePaths: ['AAPL.csv'],
    },
  ]);
  assert.equal(quickCheckCalls.length, 2);
  assert.equal(quickCheckCalls[0]?.sourceFolder, '/bound/source');
  assert.equal(quickCheckCalls[1]?.sourceFolder, '/bound/source');
});

test('resolveDataSourceSyncQuickCheckWithSelectiveDigest forwards metadata and digest progress callbacks', async () => {
  const progressEvents: CsvFolderStagingProgress[] = [];
  const createProgress = (
    mode: CsvFolderStagingProgress['stageMode'],
    progressPercent: number | null,
  ): CsvFolderStagingProgress => ({
    progressRequestId: `progress-${mode}`,
    stageMode: mode,
    phase: progressPercent === 100 ? 'DONE' : 'DIGESTING',
    processedFiles: progressPercent === null ? 0 : 1,
    totalFiles: progressPercent === null ? null : 1,
    processedBytes: 0,
    totalBytes: null,
    progressPercent,
  });

  await resolveDataSourceSyncQuickCheckWithSelectiveDigest({
    sourceId: 'source-1',
    sourceFolder: '/source',
    sourceFolderBookmarkId: 'bookmark-1',
    tt: (key) => key,
    stageFolderForImport: async (folderPath, _tt, _bookmarkId, options) => {
      options.onProgress?.(createProgress(options.mode, options.mode === 'METADATA_ONLY' ? 25 : 100));
      return options.mode === 'SELECTIVE_DIGEST'
        ? metadataStagingResult(DIGEST)
        : {
            ...metadataStagingResult(),
            sourceFolderPath: folderPath,
          };
    },
    quickCheckByMetadata: async (_sourceId, payload) =>
      payload.files.some((file) => file.fingerprint)
        ? buildQuickCheck({
            status: 'NO_CHANGES',
            reasonCode: 'NO_CHANGES',
            estimatedChangedFiles: 0,
            fingerprintRequiredRelativePaths: [],
          })
        : buildQuickCheck(),
    onProgress: (progress) => {
      progressEvents.push(progress);
    },
  });

  assert.deepEqual(
    progressEvents.map((event) => [event.stageMode, event.progressPercent]),
    [
      ['METADATA_ONLY', 25],
      ['SELECTIVE_DIGEST', 100],
    ],
  );
});

test('resolveDataSourceSyncQuickCheckWithSelectiveDigest skips digest when metadata is already decisive', async () => {
  const stageModes: string[] = [];
  const quickCheck = await resolveDataSourceSyncQuickCheckWithSelectiveDigest({
    sourceId: 'source-1',
    sourceFolder: '/source',
    sourceFolderBookmarkId: '',
    tt: (key) => key,
    stageFolderForImport: async (_folderPath, _tt, _bookmarkId, options) => {
      stageModes.push(options.mode);
      return metadataStagingResult('sha256:same');
    },
    quickCheckByMetadata: async () =>
      buildQuickCheck({
        status: 'NO_CHANGES',
        reasonCode: 'NO_CHANGES',
        estimatedChangedFiles: 0,
        fingerprintRequiredRelativePaths: [],
      }),
  });

  assert.equal(quickCheck.status, 'NO_CHANGES');
  assert.deepEqual(stageModes, ['METADATA_ONLY']);
});

test('resolveDataSourceSyncQuickCheckWithSelectiveDigest preserves whitespace paths for digest identity', async () => {
  const sourceFolder = '/bound/source ';
  const relativePath = ' group /AAPL .csv ';
  const stageCalls: Array<{ folderPath: string; relativePaths: string[] }> = [];
  const quickCheckPayloads: Array<{
    sourceFolder?: string;
    files: Array<{ relativePath: string; fingerprint?: string }>;
  }> = [];
  let quickCheckCall = 0;

  const result = await resolveDataSourceSyncQuickCheckWithSelectiveDigest({
    sourceId: 'source-1',
    sourceFolder,
    sourceFolderBookmarkId: 'bookmark-1',
    tt: (key) => key,
    stageFolderForImport: async (folderPath, _tt, _bookmarkId, options) => {
      stageCalls.push({
        folderPath,
        relativePaths: options.relativePaths ?? [],
      });
      return {
        stagedFolderPath: '',
        sourceFolderPath: sourceFolder,
        sourceFolderName: 'source ',
        copiedFiles: 0,
        copiedBytes: 0,
        metadataManifest: {
          totalFiles: 1,
          totalBytes: 120,
          files: [{
            relativePath,
            originalname: 'AAPL .csv ',
            size: 120,
            mtimeMs: 1704067200000,
            fingerprint:
              options.mode === 'SELECTIVE_DIGEST' ? DIGEST : undefined,
          }],
        },
      };
    },
    quickCheckByMetadata: async (_sourceId, payload) => {
      quickCheckPayloads.push(payload);
      quickCheckCall += 1;
      return quickCheckCall === 1
        ? buildQuickCheck({
            sourceFolder,
            fingerprintRequiredRelativePaths: [relativePath],
          })
        : buildQuickCheck({
            sourceFolder,
            status: 'POTENTIAL_CHANGES',
            changedRelativePaths: [relativePath],
            fingerprintRequiredRelativePaths: [],
          });
    },
  });

  assert.deepEqual(stageCalls, [
    { folderPath: sourceFolder, relativePaths: [] },
    { folderPath: sourceFolder, relativePaths: [relativePath] },
  ]);
  assert.equal(quickCheckPayloads[1]?.sourceFolder, sourceFolder);
  assert.equal(quickCheckPayloads[1]?.files[0]?.relativePath, relativePath);
  assert.equal(quickCheckPayloads[1]?.files[0]?.fingerprint, DIGEST);
  assert.deepEqual(result.changedRelativePaths, [relativePath]);
});
