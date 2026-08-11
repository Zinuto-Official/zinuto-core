#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(
  rootDir,
  'config',
  'open-source',
  'public-binary-assets.json',
);
const checkOnly = process.argv.includes('--check');
const extensions = new Set(['.gif', '.icns', '.ico', '.jpeg', '.jpg', '.png', '.webp']);
// Only inspect source-controlled asset locations. Local build and tool caches are
// intentionally ignored by Git and must not make the public-source review gate
// fail merely because they happen to contain upstream image files.
const skippedDirectories = new Set(['.cache', '.git', '.venv', 'dist', 'node_modules', 'target', 'vendor']);
const approvedReviewState = 'approved-for-community-source';
const allowedEntryKeys = new Set([
  'approvalRef',
  'bytes',
  'path',
  'purpose',
  'reviewState',
  'sha256',
]);

const toRepoPath = (absolutePath) =>
  path.relative(rootDir, absolutePath).split(path.sep).join('/');

const walk = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return skippedDirectories.has(entry.name) ? [] : walk(absolutePath);
      }
      return entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())
        ? [absolutePath]
        : [];
    });

const fail = (message) => {
  process.stderr.write(`[binary-assets] ${message}\n`);
  process.exit(1);
};

if (!fs.existsSync(outputPath)) {
  fail('manual allowlist is missing; create and review it before refreshing hashes');
}

const manifestText = fs.readFileSync(outputPath, 'utf8');
const manifest = JSON.parse(manifestText);
if (
  manifest?.schemaVersion !== 1
  || typeof manifest.policy !== 'string'
  || !Array.isArray(manifest.entries)
) {
  fail('manual allowlist must contain schemaVersion 1, policy, and entries');
}

const actualFiles = new Map(walk(rootDir).map((absolutePath) => [toRepoPath(absolutePath), absolutePath]));
const seenPaths = new Set();

for (const [index, entry] of manifest.entries.entries()) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`entry ${index} must be an object`);
  }
  const unexpectedKeys = Object.keys(entry).filter((key) => !allowedEntryKeys.has(key));
  if (unexpectedKeys.length > 0) {
    fail(`entry ${index} has unexpected fields: ${unexpectedKeys.join(', ')}`);
  }
  if (typeof entry.path !== 'string' || !entry.path) {
    fail(`entry ${index} is missing path`);
  }
  if (seenPaths.has(entry.path)) {
    fail(`duplicate manual allowlist path: ${entry.path}`);
  }
  seenPaths.add(entry.path);
  if (typeof entry.purpose !== 'string' || !entry.purpose.trim()) {
    fail(`${entry.path} is missing a manually reviewed purpose`);
  }
  if (entry.reviewState !== approvedReviewState) {
    fail(`${entry.path} must have reviewState ${approvedReviewState}`);
  }
  if (typeof entry.approvalRef !== 'string' || !entry.approvalRef.trim()) {
    fail(`${entry.path} is missing a manual approvalRef`);
  }
  if (!actualFiles.has(entry.path)) {
    fail(`stale entry ${entry.path}; remove it from the manual allowlist after review`);
  }
}

const unreviewedPaths = [...actualFiles.keys()].filter((relativePath) => !seenPaths.has(relativePath));
if (unreviewedPaths.length > 0) {
  fail(
    `unreviewed binary assets are present; add reviewed entries manually: ${unreviewedPaths.join(', ')}`,
  );
}

const entries = manifest.entries.map((entry) => {
  const content = fs.readFileSync(actualFiles.get(entry.path));
  return {
    ...entry,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.byteLength,
  };
});

const sortedPaths = entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
if (entries.some((entry, index) => entry.path !== sortedPaths[index])) {
  fail('manual allowlist entries must remain sorted by path');
}

const output = `${JSON.stringify({ ...manifest, entries }, null, 2)}\n`;

if (checkOnly) {
  if (manifestText !== output) {
    fail('hash or byte-size drift detected; review the changed assets, then run npm run binary-assets:refresh-hashes');
  }
  process.stdout.write(`[binary-assets] passed (${entries.length} manually approved images)\n`);
} else {
  fs.writeFileSync(outputPath, output);
  process.stdout.write(`[binary-assets] refreshed hashes for ${entries.length} manually approved images\n`);
}
