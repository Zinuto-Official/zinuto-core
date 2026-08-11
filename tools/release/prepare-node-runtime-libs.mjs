#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNodeRuntimeLibsMetadata,
  resolveNodeRuntimeLibraryExtension,
} from './desktop-runtime-layout.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const RUNTIME_ROOT = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node');
const RUNTIME_LIB_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node', 'lib');
const RUNTIME_BIN_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node', 'bin');
const RUNTIME_BIN_NAME = process.platform === 'win32' ? 'node.exe' : 'node';
const RUNTIME_BIN_PATH = path.join(RUNTIME_BIN_DIR, RUNTIME_BIN_NAME);
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'gen', 'node-runtime-libs');
const OUTPUT_METADATA_PATH = path.join(
  ROOT_DIR,
  'apps', 'desktop', 'shell',
  'gen',
  'node-runtime-libs.metadata.json'
);
const RUNTIME_LIBRARY_EXTENSION = resolveNodeRuntimeLibraryExtension(process.platform);

if (!fs.existsSync(RUNTIME_BIN_PATH) || !fs.statSync(RUNTIME_BIN_PATH).isFile()) {
  // eslint-disable-next-line no-console
  console.error(
    [
      `[node-runtime-libs] Missing native Node runtime: ${RUNTIME_BIN_PATH}`,
      'Run first: npm run desktop:runtime:ensure',
    ].join('\n')
  );
  process.exit(1);
}

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const copiedNames = new Set();
for (const candidateDir of [RUNTIME_LIB_DIR, RUNTIME_BIN_DIR, RUNTIME_ROOT]) {
  if (!fs.existsSync(candidateDir) || !fs.statSync(candidateDir).isDirectory()) {
    continue;
  }
  for (const entry of fs.readdirSync(candidateDir)) {
    const sourcePath = path.join(candidateDir, entry);
    if (
      !fs.statSync(sourcePath).isFile() ||
      !entry.endsWith(RUNTIME_LIBRARY_EXTENSION) ||
      copiedNames.has(entry)
    ) {
      continue;
    }
    fs.cpSync(sourcePath, path.join(OUTPUT_DIR, entry), {
      force: true,
      dereference: true
    });
    copiedNames.add(entry);
  }
}

fs.writeFileSync(
  OUTPUT_METADATA_PATH,
  JSON.stringify(createNodeRuntimeLibsMetadata(process.platform), null, 2),
  'utf8'
);

// eslint-disable-next-line no-console
console.log(
  `[node-runtime-libs] prepared ${RUNTIME_LIBRARY_EXTENSION} bundle at ${OUTPUT_DIR}`
);
