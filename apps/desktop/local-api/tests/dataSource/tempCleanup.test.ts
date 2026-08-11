// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createImportTempCleanupTools } from '../../src/application/dataSource/tempCleanup.js';

const createCleanupTools = (input: {
  uploadTempDir: string;
  retainedDirPaths?: string[];
  leasedDirPaths?: string[];
  nowMs?: () => number;
  untrackedEntryGraceMs?: number;
}) =>
  createImportTempCleanupTools({
    uploadTempDir: input.uploadTempDir,
    countActiveJobs: () => 0,
    listAllFilePathRows: () => [],
    listActiveFilePathRows: () => [],
    listRetainedTempDirPaths: () => input.retainedDirPaths ?? [],
    listLeasedTempDirPaths: () => input.leasedDirPaths ?? [],
    readDistinctFilePaths: (rows) =>
      Array.from(
        new Set(
          rows
            .map((row) => String(row.filePath || '').trim())
            .filter((filePath) => Boolean(filePath))
            .map((filePath) => path.resolve(filePath)),
        ),
      ),
    readDistinctImportTempDirPaths: (filePaths) =>
      Array.from(
        new Set(
          filePaths
            .map((filePath) => String(filePath || '').trim())
            .filter((filePath) => Boolean(filePath))
            .map((filePath) => path.resolve(filePath)),
        ),
      ),
    removeImportTempFilesByPath: async (filePaths) => {
      await Promise.all(filePaths.map((filePath) => fs.unlink(filePath).catch(() => undefined)));
    },
    removeImportTempDirsByPath: async (dirPaths) => {
      await Promise.all(
        dirPaths.map((dirPath) =>
          fs.rm(dirPath, { recursive: true, force: true }).catch(() => undefined),
        ),
      );
    },
    nowMs: input.nowMs,
    untrackedEntryGraceMs: input.untrackedEntryGraceMs,
  });

const makeStagedDir = async (uploadTempDir: string, name: string): Promise<string> => {
  const dirPath = path.join(uploadTempDir, name);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, 'AAPL.csv'), 'date,open\n2024-01-01,1\n', 'utf8');
  return dirPath;
};

test('untracked import temp cleanup keeps retained preview staging directories', async (t) => {
  const uploadTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-temp-cleanup-retained-'));
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const retainedDir = await makeStagedDir(uploadTempDir, 'staged-retained');
  const oldDate = new Date(Date.now() - 60 * 60 * 1000);
  await fs.utimes(retainedDir, oldDate, oldDate);

  await createCleanupTools({
    uploadTempDir,
    retainedDirPaths: [retainedDir],
    nowMs: () => Date.now() + 2 * 60 * 60 * 1000,
    untrackedEntryGraceMs: 1,
  }).cleanupUntrackedImportUploadTempFiles();

  const retainedStat = await fs.stat(retainedDir);
  assert.equal(retainedStat.isDirectory(), true);
});

test('untracked import temp cleanup keeps in-flight leased staging directories', async (t) => {
  const uploadTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-temp-cleanup-leased-'));
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const leasedDir = await makeStagedDir(uploadTempDir, 'staged-leased');
  const oldDate = new Date(Date.now() - 60 * 60 * 1000);
  await fs.utimes(leasedDir, oldDate, oldDate);

  await createCleanupTools({
    uploadTempDir,
    leasedDirPaths: [leasedDir],
    nowMs: () => Date.now() + 2 * 60 * 60 * 1000,
    untrackedEntryGraceMs: 1,
  }).cleanupUntrackedImportUploadTempFiles();

  const leasedStat = await fs.stat(leasedDir);
  assert.equal(leasedStat.isDirectory(), true);
});

test('untracked import temp cleanup keeps recent staging directories', async (t) => {
  const uploadTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-temp-cleanup-recent-'));
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const recentDir = await makeStagedDir(uploadTempDir, 'staged-recent');

  await createCleanupTools({
    uploadTempDir,
    nowMs: () => Date.now(),
    untrackedEntryGraceMs: 30 * 60 * 1000,
  }).cleanupUntrackedImportUploadTempFiles();

  const recentStat = await fs.stat(recentDir);
  assert.equal(recentStat.isDirectory(), true);
});

test('untracked import temp cleanup removes old untracked staging directories', async (t) => {
  const uploadTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-temp-cleanup-old-'));
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const oldDir = await makeStagedDir(uploadTempDir, 'staged-old');
  const oldDate = new Date(Date.now() - 60 * 60 * 1000);
  await fs.utimes(oldDir, oldDate, oldDate);

  await createCleanupTools({
    uploadTempDir,
    nowMs: () => Date.now() + 2 * 60 * 60 * 1000,
    untrackedEntryGraceMs: 1,
  }).cleanupUntrackedImportUploadTempFiles();

  await assert.rejects(() => fs.stat(oldDir), { code: 'ENOENT' });
});
