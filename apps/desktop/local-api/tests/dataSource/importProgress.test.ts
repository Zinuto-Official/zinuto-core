// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveImportBatchSize,
  resolveImportInitialBatchFiles,
} from '../../src/application/dataSource/importProgress.js';

const MB = 1024 * 1024;

test('import batch sizing keeps the initial batch small for fast visible progress', () => {
  assert.equal(resolveImportInitialBatchFiles(1), 8);
  assert.equal(resolveImportInitialBatchFiles(4), 12);
  assert.equal(resolveImportInitialBatchFiles(8), 24);
});

test('import batch sizing raises steady-state csv/json/parquet throughput cap', () => {
  const files = Array.from({ length: 80 }, () => ({ fileSize: 1 * MB }));
  assert.equal(resolveImportBatchSize(files, 8), 80);
});

test('import batch sizing stops before the 512MB steady-state byte target', () => {
  const files = Array.from({ length: 10 }, () => ({ fileSize: 64 * MB }));
  assert.equal(resolveImportBatchSize(files, 8), 8);
});

test('import batch sizing still admits one oversized file', () => {
  assert.equal(resolveImportBatchSize([{ fileSize: 512 * MB }, { fileSize: 1 * MB }], 8), 1);
});
