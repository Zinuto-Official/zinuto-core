#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveDesktopCompositionPlan } from './desktop-command-utils.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), '../..');

export const FORBIDDEN_DESKTOP_RUNTIME_MARKERS = Object.freeze([
  'account-service',
  'officialAccount',
  'official_service',
  'official-session',
  'official_oauth',
  'client_presence',
  'supportContact',
  'Support development',
  'apple_auth_bridge',
  'apple_support_bridge',
  'StoreKit',
  'plugin:deep-link',
  'plugin:updater',
  'tauri-plugin-updater',
  '/v1/account',
  '/v1/auth',
  '/v1/billing',
  '/v1/payment',
  '/v1/support',
  '/v1/updates',
  'redemption',
  '/v1/subscription',
  'subscriptionTier',
  'subscriptionPlan',
  'subscriptionEntitlement',
  'supporterBadge',
  'feedbackEmail',
  'VITE_DESKTOP_FEEDBACK_EMAIL',
  'i18n-pages.html',
  'i18n-harness.html',
  'hot-interaction-perf.html',
  'workspace-navigation-continuity.html',
  'ui-catalog.html',
]);

const THIRD_PARTY_EXEMPTIONS = new Set([
  '/v1/account',
  '/v1/auth',
  '/v1/support',
  'redemption',
]);

const isThirdPartyContentMarkerExempt = (marker, relativePath) =>
  THIRD_PARTY_EXEMPTIONS.has(marker)
  && /^node_modules\/ccxt\//u.test(relativePath.replaceAll(path.sep, '/'));

export const walkDesktopRuntimeFiles = (runtimeRoot) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(runtimeRoot);
  return files.sort();
};

const MAX_MARKER_BYTES = Math.max(
  ...FORBIDDEN_DESKTOP_RUNTIME_MARKERS.map((marker) =>
    Buffer.byteLength(marker, 'utf8')),
);

const readChunks = (filePath, chunkBytes, onChunk) => {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(chunkBytes);
    let overlap = Buffer.alloc(0);
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, chunkBytes, null);
      if (bytesRead <= 0) {
        break;
      }
      const bytes = buffer.subarray(0, bytesRead);
      const searchable = overlap.length > 0 ? Buffer.concat([overlap, bytes]) : bytes;
      onChunk(searchable);
      const overlapBytes = Math.min(MAX_MARKER_BYTES - 1, searchable.length);
      overlap = Buffer.from(searchable.subarray(searchable.length - overlapBytes));
      if (bytesRead < chunkBytes) {
        break;
      }
    }
  } finally {
    fs.closeSync(descriptor);
  }
};

export const scanDesktopRuntimeTree = (runtimeRoot, { chunkBytes = 1024 * 1024 } = {}) => {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) {
    throw new Error('[desktop-runtime-scan] chunkBytes must be a positive safe integer');
  }
  if (!fs.existsSync(runtimeRoot) || !fs.lstatSync(runtimeRoot).isDirectory()) {
    throw new Error(`[desktop-runtime-scan] runtime tree is missing: ${runtimeRoot}`);
  }
  const files = walkDesktopRuntimeFiles(runtimeRoot);
  for (const filePath of files) {
    const relativePath = path.relative(runtimeRoot, filePath);
    const pathMarker = FORBIDDEN_DESKTOP_RUNTIME_MARKERS.find((marker) =>
      relativePath.includes(marker));
    if (pathMarker) {
      throw new Error(
        `[desktop-runtime-scan] forbidden path marker ${pathMarker} is bundled: ${relativePath}`,
      );
    }
    // Content-level scan for every bundled file, including large binaries and
    // LICENSE/NOTICE-named resources. Chunked reads keep memory bounded.
    let contentMarker = null;
    readChunks(filePath, chunkBytes, (chunk) => {
      if (contentMarker) {
        return;
      }
      contentMarker = FORBIDDEN_DESKTOP_RUNTIME_MARKERS.find(
        (marker) =>
          chunk.includes(Buffer.from(marker))
          && !isThirdPartyContentMarkerExempt(marker, relativePath),
      ) ?? null;
    });
    if (contentMarker) {
      throw new Error(
        `[desktop-runtime-scan] forbidden marker ${contentMarker} is bundled in ${relativePath}`,
      );
    }
  }
  return files.length;
};

export const parseDesktopRuntimeScanArguments = (args) => {
  if (args.length === 0) {
    throw new Error('[desktop-runtime-scan] at least one runtime tree is required');
  }
  for (const argument of args) {
    if (argument.startsWith('--')) {
      throw new Error(`[desktop-runtime-scan] unknown option: ${argument}`);
    }
  }
  return { targets: args };
};

const main = () => {
  const { targets } = parseDesktopRuntimeScanArguments(process.argv.slice(2));
  const composition = readActiveDesktopCompositionPlan();
  if (composition.distributionId !== 'community') {
    throw new Error('[desktop-runtime-scan] Core runtime must use the community composition');
  }
  let fileCount = 0;
  for (const target of targets) {
    fileCount += scanDesktopRuntimeTree(path.resolve(rootDir, target));
  }
  process.stdout.write(
    `[desktop-runtime-scan] passed (${fileCount} files across ${targets.length} runtime trees)\n`,
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
