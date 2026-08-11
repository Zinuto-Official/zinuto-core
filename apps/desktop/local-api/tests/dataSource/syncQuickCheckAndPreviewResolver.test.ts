// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appError } from '../../src/kernel/appError.js';
import { createPreviewPlanImportResolver } from '../../src/application/dataSource/previewPlanResolver.js';
import { parseSymbolFromFileName } from '../../src/application/dataSource/sourceIdentity.js';
import { buildLocalDataSourceSyncQuickCheck } from '../../src/application/dataSource/syncQuickCheck.js';

const sha256 = (content: string): string =>
  createHash('sha256').update(content).digest('hex').toLowerCase();

const fingerprintFile = async (filePath: string): Promise<string> =>
  `sha256:${sha256(await fs.readFile(filePath, 'utf8'))}`;

const buildReadyQuickCheckSource = (id: string) => ({
  id,
  name: id,
  sourceFolder: `/tmp/${id}`,
  status: 'READY' as const,
  baseTimeframe: '1d' as const,
  importScopeStrategy: 'FLAT' as const,
  importScopeTopLevelSubfolder: '',
});

const buildImportedMeta = (symbol: string) => ({
  symbol,
  fileName: `${symbol}.csv`,
  filePath: `${symbol}.csv`,
  fileSize: 100,
  fileMtimeMs: 1704067200000,
  fileFingerprint: `sha256:${sha256(symbol)}`,
});

const buildQuickCheckFile = (symbol: string, overrides: {
  size?: number;
  mtimeMs?: number;
  fingerprint?: string;
} = {}) => ({
  relativePath: `${symbol}.csv`,
  originalname: `${symbol}.csv`,
  size: overrides.size ?? 100,
  mtimeMs: overrides.mtimeMs ?? 1704067200000,
  fingerprint: overrides.fingerprint ?? `sha256:${sha256(symbol)}`,
});

test('quick-check requires fingerprints when size + mtime metadata are unchanged', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-1',
      name: 'source-1',
      sourceFolder: '/tmp/source-1',
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
    },
    sourceFolder: '/tmp/source-1',
    files: [
      {
        relativePath: 'AAPL.csv',
        originalname: 'AAPL.csv',
        size: 120,
        mtimeMs: 1704067200000,
      },
    ],
    latestImportedFileMetaBySource: [
      {
        symbol: 'AAPL',
        fileSize: 120,
        fileMtimeMs: 1704067200000,
      },
    ],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_FINGERPRINT_REQUIRED');
  assert.deepEqual(quickCheck.changedSymbols, []);
  assert.deepEqual(quickCheck.changedRelativePaths, []);
  assert.deepEqual(quickCheck.snapshotSymbols, ['AAPL']);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, ['AAPL.csv']);
  assert.equal(quickCheck.estimatedChangedFiles, 1);
});

test('quick-check requires a fingerprint instead of treating an mtime-only change as content change', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-mtime-only'),
    sourceFolder: '/tmp/source-mtime-only',
    files: [{
      relativePath: 'AAPL.csv',
      originalname: 'AAPL.csv',
      size: 100,
      mtimeMs: 1704067300000,
    }],
    latestImportedFileMetaBySource: [buildImportedMeta('AAPL')],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_FINGERPRINT_REQUIRED');
  assert.deepEqual(quickCheck.changedRelativePaths, []);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, ['AAPL.csv']);
});

test('quick-check treats equal content as unchanged when mtime differs or is unavailable', () => {
  const imported = buildImportedMeta('AAPL');
  for (const mtimeMs of [1704067300000, 0]) {
    const quickCheck = buildLocalDataSourceSyncQuickCheck({
      source: buildReadyQuickCheckSource(`source-equal-content-${mtimeMs}`),
      files: [buildQuickCheckFile('AAPL', {
        mtimeMs,
        fingerprint: String(imported.fileFingerprint),
      })],
      latestImportedFileMetaBySource: [imported],
      parseSymbolFromFileName,
      checkedAt: '2026-04-10T00:00:00.000Z',
    });

    assert.equal(quickCheck.status, 'NO_CHANGES');
    assert.equal(quickCheck.reasonCode, 'NO_CHANGES');
    assert.deepEqual(quickCheck.changedRelativePaths, []);
    assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, []);
  }
});

test('quick-check treats size changes as exact changes without requesting a digest', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-size-change'),
    files: [{
      ...buildQuickCheckFile('AAPL'),
      size: 101,
      fingerprint: undefined,
    }],
    latestImportedFileMetaBySource: [buildImportedMeta('AAPL')],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedRelativePaths, ['AAPL.csv']);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, []);
});

test('quick-check establishes a new baseline when a legacy ledger has no fingerprint', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-legacy-ledger'),
    files: [buildQuickCheckFile('AAPL', { mtimeMs: 1704067300000 })],
    latestImportedFileMetaBySource: [{
      ...buildImportedMeta('AAPL'),
      fileFingerprint: null,
    }],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedRelativePaths, ['AAPL.csv']);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, []);
});

test('quick-check treats every valid new symbol as syncable without account limits', () => {
  const unlockedSymbols = Array.from({ length: 10 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-limit-only'),
    sourceFolder: '/tmp/source-limit-only',
    files: [
      ...unlockedSymbols.map((symbol) => buildQuickCheckFile(symbol)),
      buildQuickCheckFile('SYM11'),
    ],
    latestImportedFileMetaBySource: unlockedSymbols.map((symbol) =>
      buildImportedMeta(symbol)
    ),
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedSymbols, ['SYM11']);
  assert.deepEqual(quickCheck.changedRelativePaths, ['SYM11.csv']);
  assert.equal(quickCheck.estimatedChangedFiles, 1);
  assert.equal(quickCheck.symbolLimit.limitApplied, false);
  assert.deepEqual(quickCheck.symbolLimit.skippedSymbols, []);
});

test('quick-check keeps existing and new symbol changes without account clipping', () => {
  const unlockedSymbols = Array.from({ length: 10 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-limit-partial'),
    sourceFolder: '/tmp/source-limit-partial',
    files: [
      buildQuickCheckFile('SYM01', { size: 101 }),
      ...unlockedSymbols.slice(1).map((symbol) => buildQuickCheckFile(symbol)),
      buildQuickCheckFile('SYM11'),
    ],
    latestImportedFileMetaBySource: unlockedSymbols.map((symbol) =>
      buildImportedMeta(symbol)
    ),
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedSymbols, ['SYM01', 'SYM11']);
  assert.deepEqual(quickCheck.changedRelativePaths, ['SYM01.csv', 'SYM11.csv']);
  assert.equal(quickCheck.estimatedChangedFiles, 2);
  assert.deepEqual(quickCheck.symbolLimit.skippedSymbols, []);
  assert.equal(quickCheck.symbolLimit.skippedSymbolCount, 0);
});

test('quick-check allows a new symbol in a local source', () => {
  const unlockedSymbols = Array.from({ length: 9 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-limit-slot'),
    sourceFolder: '/tmp/source-limit-slot',
    files: [
      ...unlockedSymbols.map((symbol) => buildQuickCheckFile(symbol)),
      buildQuickCheckFile('SYM10'),
    ],
    latestImportedFileMetaBySource: unlockedSymbols.map((symbol) =>
      buildImportedMeta(symbol)
    ),
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedSymbols, ['SYM10']);
  assert.deepEqual(quickCheck.changedRelativePaths, ['SYM10.csv']);
  assert.equal(quickCheck.symbolLimit.skippedSymbolCount, 0);
});

test('quick-check keeps all changed symbols when symbol limit is unlimited', () => {
  const unlockedSymbols = Array.from({ length: 10 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-limit-unlimited'),
    sourceFolder: '/tmp/source-limit-unlimited',
    files: [
      ...unlockedSymbols.map((symbol) => buildQuickCheckFile(symbol)),
      buildQuickCheckFile('SYM11'),
    ],
    latestImportedFileMetaBySource: unlockedSymbols.map((symbol) =>
      buildImportedMeta(symbol)
    ),
    symbolLimitContext: {
      maxSymbols: null,
      unlockedSymbols: null,
    },
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedSymbols, ['SYM11']);
  assert.deepEqual(quickCheck.changedRelativePaths, ['SYM11.csv']);
  assert.equal(quickCheck.symbolLimit.limitApplied, false);
  assert.equal(quickCheck.symbolLimit.skippedSymbolCount, 0);
});

test('quick-check surfaces missingSymbolsRetained when current folder no longer contains a tracked symbol', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-2',
      name: 'source-2',
      sourceFolder: '/tmp/source-2',
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
    },
    sourceFolder: '/tmp/source-2',
    files: [
      {
        relativePath: 'AAPL.csv',
        originalname: 'AAPL.csv',
        size: 220,
        mtimeMs: 1704067200000,
        fingerprint: `sha256:${sha256('AAPL')}`,
      },
    ],
    latestImportedFileMetaBySource: [
      {
        symbol: 'AAPL',
        fileSize: 220,
        fileMtimeMs: 1704067200000,
        fileFingerprint: `sha256:${sha256('AAPL')}`,
      },
      {
        symbol: 'MSFT',
        fileSize: 320,
        fileMtimeMs: 1704067200000,
      },
    ],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'NO_CHANGES');
  assert.equal(quickCheck.reasonCode, 'NO_CHANGES');
  assert.equal(quickCheck.estimatedChangedFiles, 0);
  assert.equal(quickCheck.estimatedChangedSymbols, 0);
  assert.deepEqual(quickCheck.missingSymbolsRetained, ['MSFT']);
});

test('quick-check reports invalid-only metadata as unable to check instead of an update', () => {
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: buildReadyQuickCheckSource('source-invalid-only'),
    files: [{
      relativePath: 'invalid.csv',
      originalname: 'invalid.csv',
      size: 100,
      mtimeMs: 1704067200000,
    }],
    latestImportedFileMetaBySource: [],
    parseSymbolFromFileName: () => {
      throw new Error('invalid');
    },
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'UNABLE_TO_CHECK');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_INVALID_FILES');
  assert.equal(quickCheck.invalidFiles, 1);
  assert.equal(quickCheck.estimatedChangedFiles, 0);
  assert.equal(quickCheck.estimatedChangedSymbols, 0);
});

test('quick-check can clear ambiguous same-size+mtime candidates after fingerprint confirmation', () => {
  const fingerprint = sha256(`date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`);
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-3',
      name: 'source-3',
      sourceFolder: '/tmp/source-3',
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
    },
    sourceFolder: '/tmp/source-3',
    files: [
      {
        relativePath: 'AAPL.csv',
        originalname: 'AAPL.csv',
        size: 120,
        mtimeMs: 1704067200000,
        fingerprint: `sha256:${fingerprint}`,
      },
    ],
    latestImportedFileMetaBySource: [
      {
        symbol: 'AAPL',
        fileSize: 120,
        fileMtimeMs: 1704067200000,
        fileFingerprint: `sha256:${fingerprint}`,
      },
    ],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'NO_CHANGES');
  assert.deepEqual(quickCheck.changedRelativePaths, []);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, []);
});

test('quick-check detects changed fingerprints when size + mtime metadata are unchanged', () => {
  const importedFingerprint = sha256(`date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`);
  const currentFingerprint = sha256(`date,open,high,low,close,volume
2024-01-01,2,3,1,2.5,200
`);
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-4',
      name: 'source-4',
      sourceFolder: '/tmp/source-4',
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
    },
    sourceFolder: '/tmp/source-4',
    files: [
      {
        relativePath: 'AAPL.csv',
        originalname: 'AAPL.csv',
        size: 120,
        mtimeMs: 1704067200000,
        fingerprint: `sha256:${currentFingerprint}`,
      },
    ],
    latestImportedFileMetaBySource: [
      {
        symbol: 'AAPL',
        fileSize: 120,
        fileMtimeMs: 1704067200000,
        fileFingerprint: `sha256:${importedFingerprint}`,
      },
    ],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.status, 'POTENTIAL_CHANGES');
  assert.equal(quickCheck.reasonCode, 'SYNC_QUICK_CHECK_POTENTIAL_CHANGES');
  assert.deepEqual(quickCheck.changedSymbols, ['AAPL']);
  assert.deepEqual(quickCheck.changedRelativePaths, ['AAPL.csv']);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, []);
});

test('quick-check preserves whitespace paths in file identity and scope matching', () => {
  const sourceFolder = '/tmp/source folder ';
  const relativePath = ' group /AAPL.csv ';
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-whitespace',
      name: 'source-whitespace',
      sourceFolder,
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: ' group ',
    },
    sourceFolder,
    files: [{
      relativePath,
      originalname: 'AAPL.csv ',
      size: 120,
      mtimeMs: 1704067200000,
    }],
    latestImportedFileMetaBySource: [{
      symbol: 'AAPL',
      fileName: 'AAPL.csv ',
      filePath: relativePath,
      fileSize: 120,
      fileMtimeMs: 1704067200000,
    }],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.sourceFolder, sourceFolder);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, [relativePath]);
  assert.deepEqual(quickCheck.snapshotSymbols, ['AAPL']);
});

test('quick-check preserves POSIX literal backslashes in scope and reader identity', () => {
  const sourceFolder = '/tmp/source\\folder';
  const topLevelSubfolder = 'group\\west';
  const relativePath = `${topLevelSubfolder}/AAPL.csv`;
  const quickCheck = buildLocalDataSourceSyncQuickCheck({
    source: {
      id: 'source-backslash',
      name: 'source-backslash',
      sourceFolder,
      status: 'READY',
      baseTimeframe: '1d',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: topLevelSubfolder,
    },
    sourceFolder,
    files: [{
      relativePath,
      originalname: 'AAPL.csv',
      size: 120,
      mtimeMs: 1704067200000,
    }],
    latestImportedFileMetaBySource: [{
      symbol: 'AAPL',
      fileName: 'AAPL.csv',
      filePath: relativePath,
      fileSize: 120,
      fileMtimeMs: 1704067200000,
    }],
    parseSymbolFromFileName,
    checkedAt: '2026-04-10T00:00:00.000Z',
  });

  assert.equal(quickCheck.sourceFolder, sourceFolder);
  assert.deepEqual(quickCheck.fingerprintRequiredRelativePaths, [relativePath]);
  assert.deepEqual(quickCheck.snapshotSymbols, ['AAPL']);
});

test('preview-plan resolver can detect fingerprint changes even when size + mtime metadata are unchanged', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  const currentContent = `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`;
  const legacyContent = `date,open,high,low,close,volume
2024-01-01,9,9,9,9,900
`;
  await fs.writeFile(filePath, currentContent, 'utf8');
  const stat = await fs.stat(filePath);
  const previewFingerprint = await fingerprintFile(filePath);

  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: (previewToken, previewPlanId) => {
        if (previewToken !== 'preview-token' || previewPlanId !== 'plan-1') {
          return null;
        }
        return {
          id: 'plan-1',
          strategy: 'FLAT',
          baseTimeframe: '1d',
          topLevelSubfolder: '',
          folderPath: tempRoot,
          symbolCount: 1,
          fileCount: 1,
          files: [
            {
              originalname: 'AAPL_1d.csv',
              path: filePath,
              size: Math.floor(stat.size),
              mtimeMs: Math.floor(stat.mtimeMs),
              fingerprint: previewFingerprint,
              symbol: 'AAPL',
              relativePath: 'AAPL_1d.csv',
              detectedTimeframe: '1d',
            },
          ],
        };
      },
    },
    listLatestImportedFileMetaBySource: (_sourceId) => [
      {
        symbol: 'AAPL',
        fileSize: Math.floor(stat.size),
        fileMtimeMs: Math.floor(stat.mtimeMs),
        fileFingerprint: `sha256:${sha256(legacyContent)}`,
      },
    ],
    hashCompareConcurrency: 2,
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    'source-1'
  );

  assert.equal(resolved.files.length, 1);
  assert.equal(resolved.files[0]?.symbol, 'AAPL');
  assert.deepEqual(resolved.snapshotSymbols, ['AAPL']);
  assert.equal(resolved.sourceTotalFiles, 1);
});

test('preview-plan resolver skips equal content despite staged path and mtime changes', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-touch-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  const content = `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`;
  await fs.writeFile(filePath, content, 'utf8');
  const stat = await fs.stat(filePath);
  const previewFingerprint = await fingerprintFile(filePath);

  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-touch',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: 1,
        fileCount: 1,
        files: [{
          originalname: 'AAPL_1d.csv',
          path: filePath,
          size: Math.floor(stat.size),
          mtimeMs: Math.floor(stat.mtimeMs),
          fingerprint: previewFingerprint,
          symbol: 'AAPL',
          relativePath: 'AAPL_1d.csv',
          detectedTimeframe: '1d',
        }],
      }),
    },
    listLatestImportedFileMetaBySource: () => [{
      symbol: 'AAPL',
      fileName: 'AAPL_1d.csv',
      filePath: '/deleted/staging-copy/AAPL_1d.csv',
      fileSize: Math.floor(stat.size),
      fileMtimeMs: Math.max(1, Math.floor(stat.mtimeMs) - 60_000),
      fileFingerprint: previewFingerprint,
    }],
    hashCompareConcurrency: 2,
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-touch',
    '',
    'source-touch',
  );

  assert.deepEqual(resolved.files, []);
  assert.deepEqual(resolved.snapshotSymbols, ['AAPL']);
  assert.equal(resolved.sourceTotalFiles, 1);
});

test('preview-plan resolver reports missing staged files as import file missing errors', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-missing-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const missingPath = path.join(tempRoot, 'AAPL_1d.csv');
  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: 1,
        fileCount: 1,
        files: [
          {
            originalname: 'AAPL_1d.csv',
            path: missingPath,
            size: 120,
            mtimeMs: 1704067200000,
            symbol: 'AAPL',
            relativePath: 'AAPL_1d.csv',
            detectedTimeframe: '1d',
          },
        ],
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    appError,
  });

  await assert.rejects(
    () =>
      resolver.resolveImportFilesFromPreviewPlan(
        'preview-token',
        'plan-1',
      ),
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'CSV_FILE_MISSING' &&
      (error as { args?: { filePath?: string } }).args?.filePath === missingPath,
  );
});

test('preview-plan resolver rejects staged files changed after preview', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-stale-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  const originalContent = `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`;
  const sameSizeChangedContent = `date,open,high,low,close,volume
2024-01-01,2,3,1.5,2.5,200
`;
  assert.equal(sameSizeChangedContent.length, originalContent.length);
  await fs.writeFile(filePath, originalContent, 'utf8');
  const planFile = {
    originalname: 'AAPL_1d.csv',
    path: filePath,
    size: 0,
    mtimeMs: 0,
    fingerprint: '',
    symbol: 'AAPL',
    relativePath: 'AAPL_1d.csv',
    detectedTimeframe: '1d' as const,
  };
  const capturePlanFile = async (): Promise<void> => {
    const stat = await fs.stat(filePath);
    planFile.size = Math.floor(stat.size);
    planFile.mtimeMs = Math.floor(stat.mtimeMs);
    planFile.fingerprint = await fingerprintFile(filePath);
  };
  await capturePlanFile();

  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: () => [tempRoot],
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: 1,
        fileCount: 1,
        files: [{ ...planFile }],
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 1,
    appError,
  });
  const rejectsStalePreview = (error: unknown): boolean =>
    error instanceof Error &&
    (error as { code?: string }).code === 'LOCAL_DATA_IMPORT_PREVIEW_EXPIRED';

  await fs.appendFile(filePath, '2024-01-02,1,2,0.5,1.5,100\n', 'utf8');
  await assert.rejects(
    () => resolver.resolveImportFilesFromPreviewPlan('preview-token', 'plan-1'),
    rejectsStalePreview,
  );

  await fs.writeFile(filePath, originalContent, 'utf8');
  await capturePlanFile();
  const snapshotStat = await fs.stat(filePath);
  await fs.writeFile(filePath, sameSizeChangedContent, 'utf8');
  await fs.utimes(filePath, snapshotStat.atimeMs / 1000, snapshotStat.mtimeMs / 1000);
  const changedStat = await fs.stat(filePath);
  assert.equal(Math.floor(changedStat.size), planFile.size);
  assert.equal(Math.floor(changedStat.mtimeMs), planFile.mtimeMs);
  await assert.rejects(
    () => resolver.resolveImportFilesFromPreviewPlan('preview-token', 'plan-1'),
    rejectsStalePreview,
  );
});

test('preview-plan resolver hashes only ambiguous same-size+mtime candidates', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-hash-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const changedPath = path.join(tempRoot, 'AAPL_1d.csv');
  const samePath = path.join(tempRoot, 'MSFT_1d.csv');
  await fs.writeFile(
    changedPath,
    `date,open,high,low,close,volume
2024-01-01,2,3,1,2.5,200
`,
    'utf8'
  );
  await fs.writeFile(
    samePath,
    `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
    'utf8'
  );
  const changedStat = await fs.stat(changedPath);
  const sameStat = await fs.stat(samePath);
  const changedPreviewFingerprint = await fingerprintFile(changedPath);
  const samePreviewFingerprint = await fingerprintFile(samePath);
  const sameContent = await fs.readFile(samePath, 'utf8');

  let hashCalls = 0;
  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: 2,
        fileCount: 2,
        files: [
          {
            originalname: 'AAPL_1d.csv',
            path: changedPath,
            size: Math.floor(changedStat.size),
            mtimeMs: Math.floor(changedStat.mtimeMs),
            fingerprint: changedPreviewFingerprint,
            symbol: 'AAPL',
            relativePath: 'AAPL_1d.csv',
            detectedTimeframe: '1d',
          },
          {
            originalname: 'MSFT_1d.csv',
            path: samePath,
            size: Math.floor(sameStat.size),
            mtimeMs: Math.floor(sameStat.mtimeMs),
            fingerprint: samePreviewFingerprint,
            symbol: 'MSFT',
            relativePath: 'MSFT_1d.csv',
            detectedTimeframe: '1d',
          },
        ],
      }),
    },
    listLatestImportedFileMetaBySource: () => [
      {
        symbol: 'AAPL',
        fileSize: Math.floor(changedStat.size) + 1,
        fileMtimeMs: Math.floor(changedStat.mtimeMs),
        fileFingerprint: `sha256:${sha256('previous-aapl')}`,
      },
      {
        symbol: 'MSFT',
        fileSize: Math.floor(sameStat.size),
        fileMtimeMs: Math.floor(sameStat.mtimeMs),
        fileFingerprint: `sha256:${sha256(sameContent)}`,
      },
    ],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (filePath) => {
      hashCalls += 1;
      return sha256(await fs.readFile(filePath, 'utf8'));
    },
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    'source-1'
  );

  assert.equal(resolved.files.length, 1);
  assert.equal(resolved.files[0]?.symbol, 'AAPL');
  assert.equal(hashCalls, 2);
});

test('preview-plan resolver keeps all valid local symbols before hashing', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-limit-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const symbols = Array.from({ length: 12 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const planFiles = await Promise.all(
    symbols.map(async (symbol) => {
      const fileName = `${symbol}.csv`;
      const filePath = path.join(tempRoot, fileName);
      await fs.writeFile(
        filePath,
        `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
        'utf8'
      );
      const stat = await fs.stat(filePath);
      return {
        originalname: fileName,
        path: filePath,
        size: Math.floor(stat.size),
        mtimeMs: Math.floor(stat.mtimeMs),
        fingerprint: await fingerprintFile(filePath),
        symbol,
        relativePath: fileName,
        detectedTimeframe: '1d' as const,
      };
    })
  );

  let hashCalls = 0;
  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        snapshotSymbols: symbols,
        sourceTotalFiles: symbols.length,
        symbolCount: symbols.length,
        fileCount: symbols.length,
        files: planFiles,
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (filePath) => {
      hashCalls += 1;
      return sha256(await fs.readFile(filePath, 'utf8'));
    },
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    '',
    null
  );

  assert.deepEqual(
    resolved.files.map((file) => file.symbol),
    symbols,
  );
  assert.deepEqual(resolved.snapshotSymbols, symbols);
  assert.equal(resolved.sourceTotalFiles, symbols.length);
  assert.equal(hashCalls, symbols.length);
});

test('preview-plan resolver accepts a changed local symbol without an account unlock set', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-locked-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const filePath = path.join(tempRoot, 'SYM11.csv');
  await fs.writeFile(
    filePath,
    `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
    'utf8'
  );
  const stat = await fs.stat(filePath);
  const previewFingerprint = await fingerprintFile(filePath);
  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: 1,
        fileCount: 1,
        files: [
          {
            originalname: 'SYM11.csv',
            path: filePath,
            size: Math.floor(stat.size),
            mtimeMs: Math.floor(stat.mtimeMs),
            fingerprint: previewFingerprint,
            symbol: 'SYM11',
            relativePath: 'SYM11.csv',
            detectedTimeframe: '1d',
          },
        ],
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (targetPath) =>
      sha256(await fs.readFile(targetPath, 'utf8')),
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    'source-1',
    null,
  );
  assert.deepEqual(resolved.files.map((file) => file.symbol), ['SYM11']);
  assert.equal(resolved.symbolLimit.limitApplied, false);
});

test('preview-plan resolver allows all new local source sync symbols', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-slots-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const changedSymbols = Array.from({ length: 6 }, (_, index) =>
    `SYM${String(index + 6).padStart(2, '0')}`
  );
  const planFiles = await Promise.all(
    changedSymbols.map(async (symbol) => {
      const fileName = `${symbol}.csv`;
      const filePath = path.join(tempRoot, fileName);
      await fs.writeFile(
        filePath,
        `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
        'utf8'
      );
      const stat = await fs.stat(filePath);
      return {
        originalname: fileName,
        path: filePath,
        size: Math.floor(stat.size),
        mtimeMs: Math.floor(stat.mtimeMs),
        fingerprint: await fingerprintFile(filePath),
        symbol,
        relativePath: fileName,
        detectedTimeframe: '1d' as const,
      };
    })
  );
  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        symbolCount: changedSymbols.length,
        fileCount: changedSymbols.length,
        files: planFiles,
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (targetPath) =>
      sha256(await fs.readFile(targetPath, 'utf8')),
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    'source-1',
    null,
  );

  assert.deepEqual(
    resolved.files.map((file) => file.symbol),
    changedSymbols,
  );
  assert.deepEqual(resolved.snapshotSymbols, changedSymbols);
  assert.equal(resolved.sourceTotalFiles, changedSymbols.length);
});

test('preview-plan resolver keeps all symbols when the import symbol limit is unlimited', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-unlimited-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const symbols = Array.from({ length: 12 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const planFiles = await Promise.all(
    symbols.map(async (symbol) => {
      const fileName = `${symbol}.csv`;
      const filePath = path.join(tempRoot, fileName);
      await fs.writeFile(
        filePath,
        `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
        'utf8'
      );
      const stat = await fs.stat(filePath);
      return {
        originalname: fileName,
        path: filePath,
        size: Math.floor(stat.size),
        mtimeMs: Math.floor(stat.mtimeMs),
        fingerprint: await fingerprintFile(filePath),
        symbol,
        relativePath: fileName,
        detectedTimeframe: '1d' as const,
      };
    })
  );

  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        snapshotSymbols: symbols,
        sourceTotalFiles: symbols.length,
        symbolCount: symbols.length,
        fileCount: symbols.length,
        files: planFiles,
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (filePath) =>
      sha256(await fs.readFile(filePath, 'utf8')),
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    '',
    null
  );

  assert.deepEqual(
    resolved.files.map((file) => file.symbol),
    symbols,
  );
  assert.deepEqual(resolved.snapshotSymbols, symbols);
  assert.equal(resolved.sourceTotalFiles, symbols.length);
});

test('preview-plan resolver returns every selected symbol with no account clipping', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-preview-resolver-symbol-limit-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const symbols = Array.from({ length: 12 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const planFiles = await Promise.all(
    symbols.map(async (symbol) => {
      const fileName = `${symbol}.csv`;
      const filePath = path.join(tempRoot, fileName);
      await fs.writeFile(
        filePath,
        `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
`,
        'utf8'
      );
      const stat = await fs.stat(filePath);
      return {
        originalname: fileName,
        path: filePath,
        size: Math.floor(stat.size),
        mtimeMs: Math.floor(stat.mtimeMs),
        fingerprint: await fingerprintFile(filePath),
        symbol,
        relativePath: fileName,
        detectedTimeframe: '1d' as const,
      };
    })
  );

  const resolver = createPreviewPlanImportResolver({
    normalizeImportFilePath: (rawPath) => path.resolve(String(rawPath || '').trim()),
    assertManagedImportTempPath: (_filePath) => undefined,
    parseSymbolFromFileName,
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(new Set((Array.isArray(filePaths) ? filePaths : []).map((item) => path.dirname(item)))),
    normalizeFileSize: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    previewStore: {
      resolvePlan: () => ({
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        folderPath: tempRoot,
        snapshotSymbols: symbols,
        sourceTotalFiles: symbols.length,
        symbolCount: symbols.length,
        fileCount: symbols.length,
        files: planFiles,
      }),
    },
    listLatestImportedFileMetaBySource: () => [],
    hashCompareConcurrency: 2,
    buildImportFileFingerprint: async (filePath) =>
      sha256(await fs.readFile(filePath, 'utf8')),
    appError,
  });

  const resolved = await resolver.resolveImportFilesFromPreviewPlan(
    'preview-token',
    'plan-1',
    '',
    '',
    null
  );

  assert.deepEqual(
    resolved.files.map((file) => file.symbol),
    symbols,
  );
  assert.deepEqual(resolved.symbolLimit, {
    limitApplied: false,
    maxSymbols: null,
    selectedSymbols: symbols,
    skippedSymbols: [],
    skippedSymbolCount: 0,
    reason: null,
  });
});
