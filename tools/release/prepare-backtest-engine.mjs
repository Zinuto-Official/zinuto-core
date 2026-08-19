#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureVerifiedDuckdbRuntime,
  verifiedDuckdbCargoEnvironment,
} from './duckdb-runtime-cache.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const ENGINE_NAME = process.platform === 'win32'
  ? 'zinuto-core-backtest-engine.exe'
  : 'zinuto-core-backtest-engine';
const ENGINE_MANIFEST_PATH = path.join(
  ROOT_DIR,
  'apps',
  'desktop',
  'backtest-engine',
  'Cargo.toml',
);
const DEFAULT_TARGET_DIR = path.join(
  ROOT_DIR,
  'apps',
  'desktop',
  'backtest-engine',
  'target',
);
const TARGET_DIR = process.env.CARGO_TARGET_DIR
  ? path.resolve(ROOT_DIR, process.env.CARGO_TARGET_DIR)
  : DEFAULT_TARGET_DIR;
const SOURCE_BIN_PATH = path.join(TARGET_DIR, 'release', ENGINE_NAME);
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'gen', 'backtest-engine');
const OUTPUT_BIN_PATH = path.join(OUTPUT_DIR, ENGINE_NAME);
const OUTPUT_DEPS_DIR = path.join(OUTPUT_DIR, 'deps');
const GENERATED_ENGINE_NAMES = ['zinuto-core-backtest-engine', 'zinuto-core-backtest-engine.exe'];
const DUCKDB_LIBRARY_NAMES = process.platform === 'win32'
  ? ['duckdb.dll', 'libduckdb.dll']
  : process.platform === 'darwin'
    ? ['libduckdb.dylib']
    : ['libduckdb.so'];
const OUTPUT_DUCKDB_LIBRARY_NAME = process.platform === 'win32'
  ? 'duckdb.dll'
  : DUCKDB_LIBRARY_NAMES[0];
const SHOULD_COPY_DUCKDB_RUNTIME_LIBRARY = process.platform !== 'darwin';
const MACOS_DUCKDB_BINDING_PACKAGE_NAMES = [
  'node-bindings-darwin-arm64',
  'node-bindings-darwin-x64',
];

const MACOS_DUCKDB_RPATHS = MACOS_DUCKDB_BINDING_PACKAGE_NAMES.flatMap((packageName) => [
  `@executable_path/../node_modules/@duckdb/${packageName}`,
  `@executable_path/../backend-runtime/node_modules/@duckdb/${packageName}`,
]);

const buildRustFlags = () => {
  const existing = String(process.env.RUSTFLAGS || '').trim();
  const macosRpathFlags = process.platform === 'darwin'
    ? MACOS_DUCKDB_RPATHS.map((rpath) => `-C link-arg=-Wl,-rpath,${rpath}`)
    : [];
  return [existing, ...macosRpathFlags].filter(Boolean).join(' ');
};

const runCargoBuild = (duckdbRuntime) => {
  const rustFlags = buildRustFlags();
  const env = verifiedDuckdbCargoEnvironment(duckdbRuntime, {
    ...process.env,
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
    ...(rustFlags ? { RUSTFLAGS: rustFlags } : {}),
  });
  const result = spawnSync(
    'cargo',
    ['build', '--release', '--manifest-path', ENGINE_MANIFEST_PATH],
    {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env,
    },
  );
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error(
      `[backtest-engine] Failed to launch cargo: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const duckdbRuntime = await ensureVerifiedDuckdbRuntime();
runCargoBuild(duckdbRuntime);

if (!fs.existsSync(SOURCE_BIN_PATH) || !fs.statSync(SOURCE_BIN_PATH).isFile()) {
  // eslint-disable-next-line no-console
  console.error(`[backtest-engine] Missing built engine binary: ${SOURCE_BIN_PATH}`);
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const generatedEngineName of GENERATED_ENGINE_NAMES) {
  fs.rmSync(path.join(OUTPUT_DIR, generatedEngineName), { force: true });
}
fs.rmSync(OUTPUT_DEPS_DIR, { recursive: true, force: true });
fs.copyFileSync(SOURCE_BIN_PATH, OUTPUT_BIN_PATH);
if (process.platform !== 'win32') {
  fs.chmodSync(OUTPUT_BIN_PATH, 0o755);
}

const duckDbRuntimeLibraryPath = SHOULD_COPY_DUCKDB_RUNTIME_LIBRARY
  ? duckdbRuntime.libraryPath
  : null;
if (duckDbRuntimeLibraryPath) {
  fs.mkdirSync(OUTPUT_DEPS_DIR, { recursive: true });
  fs.copyFileSync(
    duckDbRuntimeLibraryPath,
    path.join(OUTPUT_DEPS_DIR, OUTPUT_DUCKDB_LIBRARY_NAME),
  );
}

// eslint-disable-next-line no-console
console.log(`[backtest-engine] Prepared ${OUTPUT_BIN_PATH}`);
