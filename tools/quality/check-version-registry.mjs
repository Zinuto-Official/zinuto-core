// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const readText = (relativePath) =>
  fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');

const readJson = (relativePath) => JSON.parse(readText(relativePath));

const failures = [];

const fail = (message) => {
  failures.push(message);
};

const extractStringConst = (relativePath, name) => {
  const source = readText(relativePath);
  const pattern = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*["']([^"']+)["']`,
    'u',
  );
  const match = source.match(pattern);
  if (!match?.[1]) {
    fail(`${relativePath} must export ${name}.`);
    return '';
  }
  return match[1];
};

const softwareVersion = extractStringConst(
  'packages/shared/src/versionRegistry.ts',
  'ZINUTO_SOFTWARE_VERSION',
);

for (const relativePath of [
  'package.json',
  'apps/desktop/web/package.json',
  'apps/desktop/local-api/package.json',
  'packages/shared/package.json',
]) {
  const actual = String(readJson(relativePath).version ?? '').trim();
  if (actual !== softwareVersion) {
    fail(`${relativePath} version ${actual || '(empty)'} must match ${softwareVersion}.`);
  }
}

const tauriVersion = String(readJson('apps/desktop/shell/tauri.conf.json').version ?? '').trim();
if (tauriVersion !== softwareVersion) {
  fail(`apps/desktop/shell/tauri.conf.json version ${tauriVersion || '(empty)'} must match ${softwareVersion}.`);
}

const publicReleaseNoteLocales = ['en', 'zh-CN', 'ja', 'ko', 'es'];
const desktopReleaseNotes = readJson('packages/shared/src/desktopReleaseNotes.json');
const desktopReleaseNotesVersion = String(desktopReleaseNotes.version ?? '').trim();
if (desktopReleaseNotesVersion !== softwareVersion) {
  fail(`packages/shared/src/desktopReleaseNotes.json version ${desktopReleaseNotesVersion || '(empty)'} must match ${softwareVersion}.`);
}
const desktopReleaseNotesPublishedAt = String(desktopReleaseNotes.publishedAt ?? '').trim();
if (!desktopReleaseNotesPublishedAt || Number.isNaN(Date.parse(desktopReleaseNotesPublishedAt))) {
  fail('packages/shared/src/desktopReleaseNotes.json publishedAt must be a valid ISO timestamp.');
}
const desktopReleaseHighlights = desktopReleaseNotes.releaseHighlights ?? {};
for (const locale of publicReleaseNoteLocales) {
  const entries = desktopReleaseHighlights[locale];
  if (
    !Array.isArray(entries) ||
    entries.map((entry) => String(entry ?? '').trim()).filter(Boolean).length === 0
  ) {
    fail(`packages/shared/src/desktopReleaseNotes.json releaseHighlights.${locale} must contain at least one non-empty item.`);
  }
}
const sharedExports = readJson('packages/shared/package.json').exports ?? {};
if (!sharedExports['./versionRegistry']) {
  fail('packages/shared/package.json must export ./versionRegistry.');
}
if (!sharedExports['./desktopReleaseNotes']) {
  fail('packages/shared/package.json must export ./desktopReleaseNotes.');
}

const versionRegistrySource = readText('packages/shared/src/versionRegistry.ts');
const semanticCodeMatches = [
  ...versionRegistrySource.matchAll(/\b(app|data|market|rules|runtime|api):\s*["']([^"']+)["']/gu),
];
const semanticCodes = new Map(
  semanticCodeMatches.map((match) => [match[1], match[2]]),
);
for (const [key, domain] of [
  ['app', 'APP'],
  ['data', 'DATA'],
  ['market', 'MARKET'],
  ['rules', 'RULES'],
  ['runtime', 'RUNTIME'],
]) {
  const value = semanticCodes.get(key);
  if (!value || !new RegExp(`^${domain} \\d{4}Q[1-4]\\.\\d+$`, 'u').test(value)) {
    fail(`ZINUTO_SEMANTIC_VERSION_CODES.${key} must use ${domain} YYYYQn.r format.`);
  }
}
const apiSemanticCode = semanticCodes.get('api');
if (!apiSemanticCode || !/^API v\d+$/u.test(apiSemanticCode)) {
  fail('ZINUTO_SEMANTIC_VERSION_CODES.api must use API vN format.');
}

const DISPLAY_VERSION_SOURCE_DIRECTORIES = [
  'apps/desktop/local-api/src',
  'apps/desktop/web/src',
  'apps/desktop/shell/src',
  'packages/shared/src',
];

const collectDisplayVersionSourceFiles = () => {
  const files = [];
  for (const directory of DISPLAY_VERSION_SOURCE_DIRECTORIES) {
    const root = path.join(ROOT_DIR, directory);
    if (!fs.existsSync(root)) {
      continue;
    }
    const pending = [root];
    while (pending.length) {
      const current = pending.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
        } else if (entry.isFile() && /\.(ts|tsx|js|rs)$/u.test(entry.name)) {
          files.push(entryPath);
        }
      }
    }
  }
  return files.sort();
};

for (const filePath of collectDisplayVersionSourceFiles()) {
  const relativePath = path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(/\bdisplayVersion:\s*["']([^"']+)["']/gu)) {
    const displayVersion = match[1];
    if (displayVersion.includes(' / ')) {
      fail(`${relativePath} displayVersion must not join details with slash: ${displayVersion}`);
    }
    if (/backend-bundle:|system-market-seed|[a-f0-9]{16,}/iu.test(displayVersion)) {
      fail(`${relativePath} displayVersion must not expose raw technical ids: ${displayVersion}`);
    }
  }
}

const wikiSeedVersion = extractStringConst(
  'apps/desktop/local-api/src/infrastructure/db/systemSeedBars.ts',
  'SYSTEM_WIKI_EOD_SEED_VERSION',
);
const fxSeedVersion = extractStringConst(
  'apps/desktop/local-api/src/infrastructure/db/systemSeedBars.ts',
  'SYSTEM_FX_1M_2025Q1_SEED_VERSION',
);
const aggregateSeedVersion = extractStringConst(
  'apps/desktop/local-api/src/infrastructure/db/systemSeedBars.ts',
  'SYSTEM_BARS_SEED_VERSION',
);

const wikiManifestVersion = String(
  readJson('apps/desktop/local-api/src/infrastructure/assets/system-market-seed/wiki-eod-100/manifest.json').version ?? '',
).trim();
if (wikiManifestVersion !== wikiSeedVersion) {
  fail(`WIKI seed manifest ${wikiManifestVersion || '(empty)'} must match ${wikiSeedVersion}.`);
}

const fxManifestVersion = String(
  readJson('apps/desktop/local-api/src/infrastructure/assets/system-market-seed/histdata-fx-1m-2025q1/manifest.json').version ?? '',
).trim();
if (fxManifestVersion !== fxSeedVersion) {
  fail(`FX seed manifest ${fxManifestVersion || '(empty)'} must match ${fxSeedVersion}.`);
}

if (!aggregateSeedVersion.includes('system-market-seed')) {
  fail('SYSTEM_BARS_SEED_VERSION must remain the aggregate system-market-seed version.');
}

const runtimeSchemaVersion = String(
  readJson('contracts/runtime-response-schemas.v1.json').version ?? '',
).trim();
if (runtimeSchemaVersion !== 'v1') {
  fail(`contracts/runtime-response-schemas.v1.json version ${runtimeSchemaVersion || '(empty)'} must be v1.`);
}

const nativeBridgeSchemaVersion = String(
  readJson('contracts/native-bridge/native-bridge.v1.json').schemaVersion ?? '',
).trim();
if (nativeBridgeSchemaVersion !== 'zinuto-native-bridge-v1') {
  fail(`contracts/native-bridge/native-bridge.v1.json schemaVersion ${nativeBridgeSchemaVersion || '(empty)'} must be zinuto-native-bridge-v1.`);
}

if (failures.length) {
  console.error('[version-registry] Version registry check failed:');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('[version-registry] Version registry check passed.');
