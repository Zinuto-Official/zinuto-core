// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-market-storage-files-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const marketDbPath = path.join(
  tempDataDir,
  'data',
  'market',
  'zinuto.market.duckdb',
);
const {
  cleanupMarketDbBackupArtifacts,
  recoverMarketDbBackupIfCanonicalMissing,
  removeMarketStorageFiles,
  replaceMarketDatabaseFile,
} = await import(
  '../../src/infrastructure/db/marketDatabase/storageFiles.js'
);
const { resetMarketDbContext } = await import(
  '../../src/infrastructure/db/marketDatabase/connection.js'
);

test.after(async () => {
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await fs.promises.rm(path.dirname(marketDbPath), {
    recursive: true,
    force: true,
  });
  await fs.promises.mkdir(path.dirname(marketDbPath), { recursive: true });
});

test('failed compact installation restores the original market database', async () => {
  const missingReplacementPath = path.join(tempDataDir, 'missing-compact.duckdb');
  const backupPath = `${marketDbPath}.bak-install-failure`;
  await fs.promises.writeFile(marketDbPath, 'original-market-database');

  await assert.rejects(
    replaceMarketDatabaseFile({
      replacementPath: missingReplacementPath,
      backupPath,
    }),
    /ENOENT/u,
  );

  assert.equal(
    await fs.promises.readFile(marketDbPath, 'utf8'),
    'original-market-database',
  );
  assert.equal(fs.existsSync(backupPath), false);
});

test('failed compact installation retains the backup when restoration also fails', async () => {
  const backupPath = `${marketDbPath}.bak-restore-failure`;
  const existingPaths = new Set([marketDbPath]);
  const removedPaths: string[] = [];
  let renameCount = 0;

  await assert.rejects(
    replaceMarketDatabaseFile({
      replacementPath: path.join(tempDataDir, 'compact.duckdb'),
      backupPath,
      operations: {
        exists: (filePath) => existingPaths.has(filePath),
        remove: async (filePath) => {
          removedPaths.push(filePath);
          existingPaths.delete(filePath);
        },
        rename: async (sourcePath, targetPath) => {
          renameCount += 1;
          if (renameCount === 1) {
            existingPaths.delete(sourcePath);
            existingPaths.add(targetPath);
            return;
          }
          throw new Error(renameCount === 2 ? 'install failed' : 'restore failed');
        },
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /backup retained/u);
      return true;
    },
  );

  assert.deepEqual(removedPaths, [backupPath]);
  assert.equal(existingPaths.has(backupPath), true);
  assert.equal(existingPaths.has(marketDbPath), false);
});

test('startup cleanup restores the newest backup when the canonical database is absent', async () => {
  const olderBackup = `${marketDbPath}.bak-older`;
  const newerBackup = `${marketDbPath}.bak-newer`;
  await fs.promises.writeFile(olderBackup, 'older');
  await fs.promises.writeFile(newerBackup, 'newer');
  await fs.promises.utimes(olderBackup, new Date(1_000), new Date(1_000));
  await fs.promises.utimes(newerBackup, new Date(2_000), new Date(2_000));

  await recoverMarketDbBackupIfCanonicalMissing();

  assert.equal(await fs.promises.readFile(marketDbPath, 'utf8'), 'newer');
  assert.equal(fs.existsSync(olderBackup), false);
  assert.equal(fs.existsSync(newerBackup), false);
});

test('explicit artifact cleanup deletes backups without restoring cleared storage', async () => {
  const backupPath = `${marketDbPath}.bak-explicit-clear`;
  await fs.promises.writeFile(backupPath, 'must-not-return');

  await cleanupMarketDbBackupArtifacts();

  assert.equal(fs.existsSync(backupPath), false);
  assert.equal(fs.existsSync(marketDbPath), false);
});

test('physical market storage removal reports a retained canonical path', async () => {
  await fs.promises.mkdir(marketDbPath);

  await assert.rejects(removeMarketStorageFiles());
  assert.equal(fs.existsSync(marketDbPath), true);
});

test('market database reset propagates a physical storage removal failure', async () => {
  await fs.promises.mkdir(marketDbPath);

  await assert.rejects(
    resetMarketDbContext({
      removeStorageFiles: true,
      cleanupArtifacts: true,
    }),
  );
  assert.equal(fs.existsSync(marketDbPath), true);
});
