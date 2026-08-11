#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const NODE_VERSION_FILE = path.join(ROOT_DIR, '.nvmrc');

const expectedVersion = (() => {
  try {
    return fs.readFileSync(NODE_VERSION_FILE, 'utf8').trim().replace(/^v/u, '');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[node-version] Failed to read required version from ${NODE_VERSION_FILE} (${error instanceof Error ? error.message : 'unknown'})`
    );
    process.exit(1);
  }
})();

if (!expectedVersion) {
  // eslint-disable-next-line no-console
  console.error(`[node-version] Required Node version file is empty: ${NODE_VERSION_FILE}`);
  process.exit(1);
}

const actualVersion = process.version.replace(/^v/u, '');

const parseVersion = (value) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/u);
  if (!match) {
    return null;
  }
  return match.slice(1).map(Number);
};

const minimum = parseVersion(expectedVersion);
const actual = parseVersion(actualVersion);
const isSupported =
  minimum !== null
  && actual !== null
  && actual[0] === minimum[0]
  && (
    actual[1] > minimum[1]
    || (actual[1] === minimum[1] && actual[2] >= minimum[2])
  );

if (!isSupported) {
  // eslint-disable-next-line no-console
  console.error(
    [
      `[node-version] Expected Node >=${expectedVersion} <${minimum ? minimum[0] + 1 : 25}, but current process is ${process.version}.`,
      'Switch the shell first so install / test / runtime validation use the same ABI baseline.'
    ].join('\n')
  );
  process.exit(1);
}
