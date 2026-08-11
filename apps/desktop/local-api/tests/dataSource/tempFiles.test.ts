// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createImportTempDirLeaseStore,
  createImportTempFileTools,
  createProtectedImportTempDirRemover,
  createProtectedImportTempFileRemover,
} from '../../src/application/dataSource/tempFiles.js';

const exists = async (filePath: string): Promise<boolean> =>
  fs.stat(filePath).then(() => true, () => false);

test('managed temp path normalization preserves legal trailing whitespace', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-temp-path-whitespace-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });
  const tools = createImportTempFileTools(
    uploadTempDir,
    (code) => new Error(code),
  );
  const exactPath = path.join(uploadTempDir, 'staged folder ', 'AAPL.csv ');

  assert.equal(tools.normalizeImportFilePath(exactPath), exactPath);
  assert.equal(tools.isManagedImportTempFilePath(exactPath), true);
  assert.equal(tools.normalizeImportFilePath('   '), '');
});

test('file cleanup waits for duplicate concurrent jobs started from the same preview plan', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-protected-temp-file-duplicate-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-duplicate-plan');
  const sharedFilePath = path.join(stagedRoot, 'AAPL.csv');
  await fs.mkdir(stagedRoot, { recursive: true });
  await fs.writeFile(sharedFilePath, 'date,open\n2024-01-01,1\n', 'utf8');

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => new Error(code),
  );
  let activeFilePaths = [sharedFilePath, sharedFilePath];
  const removeImportTempFilesByPath = createProtectedImportTempFileRemover({
    listActiveFilePathRows: () =>
      activeFilePaths.map((filePath) => ({ filePath })),
    listRetainedTempDirPaths: () => [],
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempFilesByPathUnchecked:
      tempFileTools.removeImportTempFilesByPath,
  });

  await removeImportTempFilesByPath([sharedFilePath]);
  assert.equal(await exists(sharedFilePath), true);

  activeFilePaths = [sharedFilePath];
  await removeImportTempFilesByPath([sharedFilePath]);
  assert.equal(await exists(sharedFilePath), true);

  activeFilePaths = [];
  await removeImportTempFilesByPath([sharedFilePath]);
  assert.equal(await exists(sharedFilePath), false);
});

test('file cleanup keeps overlapping FLAT and WITH_PARENT files while jobs or preview retain them', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-protected-temp-file-overlap-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-overlap');
  const overlappingFilePath = path.join(stagedRoot, 'group', 'AAPL.csv');
  const flatOnlyFilePath = path.join(stagedRoot, 'MSFT.csv');
  await fs.mkdir(path.dirname(overlappingFilePath), { recursive: true });
  await Promise.all([
    fs.writeFile(overlappingFilePath, 'date,open\n2024-01-01,1\n', 'utf8'),
    fs.writeFile(flatOnlyFilePath, 'date,open\n2024-01-01,1\n', 'utf8'),
  ]);

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => new Error(code),
  );
  let activeFilePaths = [overlappingFilePath];
  let retainedDirPaths = [stagedRoot];
  const removeImportTempFilesByPath = createProtectedImportTempFileRemover({
    listActiveFilePathRows: () =>
      activeFilePaths.map((filePath) => ({ filePath })),
    listRetainedTempDirPaths: () => retainedDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempFilesByPathUnchecked:
      tempFileTools.removeImportTempFilesByPath,
  });

  await removeImportTempFilesByPath([
    overlappingFilePath,
    flatOnlyFilePath,
  ]);
  assert.equal(await exists(overlappingFilePath), true);
  assert.equal(await exists(flatOnlyFilePath), true);

  retainedDirPaths = [];
  await removeImportTempFilesByPath([
    overlappingFilePath,
    flatOnlyFilePath,
  ]);
  assert.equal(await exists(overlappingFilePath), true);
  assert.equal(await exists(flatOnlyFilePath), false);

  activeFilePaths = [];
  await removeImportTempFilesByPath([overlappingFilePath]);
  assert.equal(await exists(overlappingFilePath), false);
});

test('shared staging root is removed only after preview and every sibling job release it', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-protected-temp-root-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-shared');
  const firstFilePath = path.join(stagedRoot, 'first.csv');
  const siblingFilePath = path.join(stagedRoot, 'sibling.csv');
  await fs.mkdir(stagedRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(firstFilePath, 'date,open\n2024-01-01,1\n', 'utf8'),
    fs.writeFile(siblingFilePath, 'date,open\n2024-01-01,1\n', 'utf8'),
  ]);

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => new Error(code),
  );
  let activeFilePaths = [siblingFilePath];
  let retainedDirPaths = [stagedRoot];
  const removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows: () =>
      activeFilePaths.map((filePath) => ({ filePath })),
    listRetainedTempDirPaths: () => retainedDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked:
      tempFileTools.removeImportTempDirsByPath,
  });

  await tempFileTools.removeImportTempFilesByPath([firstFilePath]);
  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal((await fs.stat(siblingFilePath)).isFile(), true);

  activeFilePaths = [];
  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal((await fs.stat(siblingFilePath)).isFile(), true);

  retainedDirPaths = [];
  await removeImportTempDirsByPath([stagedRoot]);
  await assert.rejects(() => fs.stat(stagedRoot), { code: 'ENOENT' });
});

test('staging-root leases are reference counted and block protected cleanup until the final release', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-protected-temp-lease-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-concurrent');
  const stagedFilePath = path.join(stagedRoot, 'AAPL.csv');
  await fs.mkdir(stagedRoot, { recursive: true });
  await fs.writeFile(stagedFilePath, 'date,open\n2024-01-01,1\n', 'utf8');

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => new Error(code),
  );
  const leaseStore = createImportTempDirLeaseStore({
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
  });
  const removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows: () => [],
    listRetainedTempDirPaths: () => [],
    listLeasedTempDirPaths: leaseStore.listLeasedTempDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked:
      tempFileTools.removeImportTempDirsByPath,
  });

  const releaseFirst = leaseStore.acquireImportTempDirLease([stagedRoot]);
  const releaseSecond = leaseStore.acquireImportTempDirLease([stagedFilePath]);

  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal(await exists(stagedFilePath), true);

  releaseFirst();
  releaseFirst();
  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal(await exists(stagedFilePath), true);

  releaseSecond();
  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal(await exists(stagedRoot), false);
});
