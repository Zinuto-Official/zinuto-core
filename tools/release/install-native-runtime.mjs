#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadNativeRuntimeAuthority,
  resolveNativeRuntimeDescriptor,
} from './native-runtime-authority.mjs';
import { installVerifiedRuntimeArchive } from './native-runtime-transaction.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_RUNTIME_ROOT = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'runtime', 'node');

const parseArchivePath = (args) => {
  let archivePath = '';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--archive') {
      archivePath = String(args[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    throw new Error(`unknown native runtime install option: ${argument}`);
  }
  if (!archivePath) {
    throw new Error('native runtime install requires --archive <verified Node distribution archive>');
  }
  return path.resolve(archivePath);
};

try {
  const archivePath = parseArchivePath(process.argv.slice(2));
  const authority = loadNativeRuntimeAuthority();
  const descriptor = resolveNativeRuntimeDescriptor({ authority });
  installVerifiedRuntimeArchive({
    archivePath,
    descriptor,
    runtimeRoot: TARGET_RUNTIME_ROOT,
  });
  console.log(`[native-runtime] verified runtime installed at: ${TARGET_RUNTIME_ROOT}`);
} catch (error) {
  console.error(`[native-runtime] ${error instanceof Error ? error.message : 'install failed'}`);
  process.exit(1);
}
