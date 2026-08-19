#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureVerifiedDuckdbRuntime,
  verifiedDuckdbCargoEnvironment,
} from './duckdb-runtime-cache.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'apps', 'desktop', 'backtest-engine', 'Cargo.toml');

const runtime = await ensureVerifiedDuckdbRuntime();
const environment = verifiedDuckdbCargoEnvironment(runtime, {
  ...process.env,
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
});

for (const args of [
  ['clippy', '--manifest-path', MANIFEST_PATH, '--all-targets', '--all-features', '--', '-D', 'warnings'],
  ['test', '--manifest-path', MANIFEST_PATH],
]) {
  const result = spawnSync('cargo', args, {
    cwd: ROOT_DIR,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
