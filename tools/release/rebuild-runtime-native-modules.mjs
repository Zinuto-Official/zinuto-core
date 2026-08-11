#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const NODE_BIN_NAME = process.platform === 'win32' ? 'node.exe' : 'node';
const runtimeNode = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node', 'bin', NODE_BIN_NAME);
const runtimeNpmCli = path.join(
  ROOT_DIR,
  'apps', 'desktop', 'shell',
  'runtime',
  'node',
  'lib',
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js'
);
const prepareBackendRuntimeBundleScript = path.join(
  ROOT_DIR,
  'tools',
  'release',
  'prepare-backend-runtime-bundle.mjs'
);

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${path.dirname(runtimeNode)}:${process.env.PATH || ''}`,
      npm_config_build_from_source: 'true'
    },
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

run(runtimeNode, ['-v']);
run(runtimeNode, ['-p', 'process.versions.modules']);
run(runtimeNode, [
  runtimeNpmCli,
  'rebuild',
  'better-sqlite3',
  '--workspace=@zinuto/desktop-local-api',
  '--foreground-scripts'
]);

run(process.execPath, [prepareBackendRuntimeBundleScript]);

const verificationEntries = ['./apps/desktop/local-api/dist/infrastructure/db/database.js'];
const generatedRuntimeDatabaseEntry = './apps/desktop/shell/gen/backend-runtime/apps/desktop/local-api/dist/infrastructure/db/database.js';
if (
  fs.existsSync(
    path.join(
      ROOT_DIR,
      'apps',
      'desktop',
      'shell',
      'gen',
      'backend-runtime',
      'apps',
      'desktop',
      'local-api',
      'dist',
      'db',
      'database.js',
    ),
  )
) {
  verificationEntries.push(generatedRuntimeDatabaseEntry);
}

const verifyCode = `
const verificationEntries = ${JSON.stringify(verificationEntries)};
Promise.all(verificationEntries.map((entry) => import(entry)))
  .then(() => {
    console.log('[runtime-native] better-sqlite3 ABI verified with runtime Node');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

run(runtimeNode, ['-e', verifyCode]);
