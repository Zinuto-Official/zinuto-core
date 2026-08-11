// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test(
  'large Parquet preview exits cleanly under the default native concurrency',
  { timeout: 120_000 },
  async () => {
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const childPath = path.join(
      testDirectory,
      'fixtures',
      'parquetPreviewStressChild.ts',
    );
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', childPath],
      {
        cwd: path.resolve(testDirectory, '../..'),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });

    assert.equal(
      result.signal,
      null,
      `Parquet preview child terminated by ${result.signal ?? 'no signal'}: ${stderr}`,
    );
    assert.equal(
      result.code,
      0,
      `Parquet preview child exited ${result.code}: ${stderr}`,
    );
    assert.deepEqual(JSON.parse(stdout), {
      totalFiles: 1600,
      validFiles: 1600,
      invalidFiles: 0,
      detectedTimeframe: '1d',
      confirmablePlans: 1,
    });
  },
);
