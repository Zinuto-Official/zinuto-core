// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { createPreviewImportSessionStore } from '../../src/infrastructure/db/dataSource/previewSessionStore.js';

const DEFAULT_MAPPING = {
  timestampMode: 'SINGLE',
  date: 'trade_date',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: 'volume',
} as const;

test('preview sessions retain isolated per-file headers for confirmed mapping resolution', () => {
  const store = createPreviewImportSessionStore({
    ttlMs: 60_000,
    maxEntries: 2,
    nowMs: () => 1000,
    createToken: () => 'preview-token',
  });
  const headers = ['trade_date', 'open', 'high', 'low', 'close', 'volume'];
  const token = store.save({
    folderPath: '/tmp/staged-import',
    headers,
    plans: [
      {
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        symbolCount: 1,
        fileCount: 1,
        files: [
          {
            originalname: 'AAPL.csv',
            path: '/tmp/staged-import/AAPL.csv',
            size: 100,
            mtimeMs: 1000,
            symbol: 'AAPL',
            relativePath: 'AAPL.csv',
            detectedTimeframe: '1d',
            headers,
            mapping: DEFAULT_MAPPING,
          },
        ],
      },
    ],
  });

  headers[0] = 'mutated_before_resolve';
  const first = store.resolvePlan(token, 'plan-1');
  assert.deepEqual(first?.files[0]?.headers, [
    'trade_date',
    'open',
    'high',
    'low',
    'close',
    'volume',
  ]);

  first?.files[0]?.headers?.splice(0, 1, 'mutated_after_resolve');
  assert.equal(store.resolvePlan(token, 'plan-1')?.files[0]?.headers?.[0], 'trade_date');
});

test('preview sessions preserve exact staged paths and relative file names', () => {
  const store = createPreviewImportSessionStore({
    ttlMs: 60_000,
    maxEntries: 2,
    nowMs: () => 1000,
    createToken: () => 'preview-whitespace-token',
  });
  const folderPath = '/tmp/staged import ';
  const relativePath = ' group /AAPL .csv ';
  const filePath = `${folderPath}/${relativePath}`;
  const token = store.save({
    folderPath,
    plans: [{
      id: 'plan-whitespace',
      strategy: 'WITH_PARENT',
      baseTimeframe: '1d',
      topLevelSubfolder: ' group ',
      symbolCount: 1,
      fileCount: 1,
      files: [{
        originalname: relativePath,
        path: filePath,
        size: 100,
        mtimeMs: 1000,
        symbol: 'AAPL',
        relativePath,
        detectedTimeframe: '1d',
        mapping: DEFAULT_MAPPING,
      }],
    }],
  });

  const resolved = store.resolvePlan(token, 'plan-whitespace');
  assert.equal(resolved?.folderPath, folderPath);
  assert.equal(resolved?.topLevelSubfolder, ' group ');
  assert.equal(resolved?.files[0]?.path, filePath);
  assert.equal(resolved?.files[0]?.originalname, relativePath);
  assert.equal(resolved?.files[0]?.relativePath, relativePath);
  assert.deepEqual(store.listFolderPaths(), [folderPath]);
});

test('preview sessions preserve POSIX literal backslashes as filename characters', () => {
  const store = createPreviewImportSessionStore({
    ttlMs: 60_000,
    maxEntries: 2,
    nowMs: () => 1000,
    createToken: () => 'preview-backslash-token',
  });
  const folderPath = '/tmp/staged\\snapshot';
  const topLevelSubfolder = 'group\\west';
  const relativePath = `${topLevelSubfolder}/AAPL\\quote.csv`;
  const filePath = `${folderPath}/${relativePath}`;
  const token = store.save({
    folderPath,
    plans: [{
      id: 'plan-backslash',
      strategy: 'WITH_PARENT',
      baseTimeframe: '1d',
      topLevelSubfolder,
      symbolCount: 1,
      fileCount: 1,
      files: [{
        originalname: relativePath,
        path: filePath,
        size: 100,
        mtimeMs: 1000,
        symbol: 'AAPL',
        relativePath,
        detectedTimeframe: '1d',
        mapping: DEFAULT_MAPPING,
      }],
    }],
  });

  const resolved = store.resolvePlan(token, 'plan-backslash');
  assert.equal(resolved?.folderPath, folderPath);
  assert.equal(resolved?.topLevelSubfolder, topLevelSubfolder);
  assert.equal(resolved?.files[0]?.path, filePath);
  assert.equal(resolved?.files[0]?.originalname, relativePath);
  assert.equal(resolved?.files[0]?.relativePath, relativePath);
});
