#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadNativeRuntimeAuthority,
  resolveNativeRuntimeDescriptor,
} from './native-runtime-authority.mjs';
import { downloadRuntimeArchive } from './native-runtime-download.mjs';
import {
  attestTrustedRuntimeDirectory,
  installVerifiedRuntimeArchive,
  validateRuntimeDirectory,
} from './native-runtime-transaction.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NODE_VERSION_FILE_PATH = path.join(ROOT_DIR, '.nvmrc');
const TARGET_RUNTIME_ROOT = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node');

const parseArgs = (args) => {
  let archivePath = '';
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      force = true;
    } else if (argument === '--archive') {
      archivePath = String(args[index + 1] ?? '').trim();
      index += 1;
    } else {
      throw new Error(`unknown native runtime ensure option: ${argument}`);
    }
  }
  return { archivePath: archivePath ? path.resolve(archivePath) : '', force };
};

let temporaryRoot = '';
try {
  const options = parseArgs(process.argv.slice(2));
  const authority = loadNativeRuntimeAuthority();
  const descriptor = resolveNativeRuntimeDescriptor({ authority });
  const requiredVersion = fs.readFileSync(NODE_VERSION_FILE_PATH, 'utf8').trim().replace(/^v/u, '');
  if (requiredVersion !== descriptor.releaseVersion) {
    throw new Error(`.nvmrc version ${requiredVersion || '(empty)'} is not bound to native runtime authority`);
  }
  if (!options.force) {
    try {
      const current = validateRuntimeDirectory({ runtimeRoot: TARGET_RUNTIME_ROOT, descriptor });
      console.log(`[native-runtime-ensure] verified runtime ready: ${current.binaryPath}`);
      process.exit(0);
    } catch {
      // A missing or invalid current runtime is never executed and proceeds to verified replacement.
    }
    try {
      const attested = attestTrustedRuntimeDirectory({
        runtimeRoot: TARGET_RUNTIME_ROOT,
        descriptor,
      });
      console.log(`[native-runtime-ensure] attested trusted runtime ready: ${attested.binaryPath}`);
      process.exit(0);
    } catch {
      // Only an identity-free exact trusted tree can be attested; every other state is replaced.
    }
  }
  let archivePath = options.archivePath;
  if (!archivePath) {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-native-runtime-'));
    fs.chmodSync(temporaryRoot, 0o700);
    archivePath = path.join(temporaryRoot, descriptor.archiveFileName);
    console.log(`[native-runtime-ensure] downloading verified archive ${descriptor.archiveUrl}`);
    await downloadRuntimeArchive({ descriptor, destinationPath: archivePath });
  }
  installVerifiedRuntimeArchive({ archivePath, descriptor, runtimeRoot: TARGET_RUNTIME_ROOT });
  console.log(`[native-runtime-ensure] verified runtime ready at ${TARGET_RUNTIME_ROOT}`);
} catch (error) {
  console.error(`[native-runtime-ensure] ${error instanceof Error ? error.message : 'failed'}`);
  process.exitCode = 1;
} finally {
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
