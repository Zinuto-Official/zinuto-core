// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(path.join(SCRIPT_DIR, '..'));
const WORKSPACE_ROOT = path.resolve(FRONTEND_ROOT, '../../..');
const COLOR_CENTER_PATH = path.join(FRONTEND_ROOT, 'src', 'ui', 'theme', 'visual', 'colorCenter.json');
const SPECIAL_TRAINING_ASSET_DIR = path.join(
  FRONTEND_ROOT,
  'src',
  'assets',
  'graphics',
  'assets',
  'special-training'
);
const ANDROID_ICON_XML_PATH = path.join(
  WORKSPACE_ROOT,
  'apps',
  'desktop',
  'shell',
  'icons',
  'android',
  'values',
  'ic_launcher_background.xml'
);
const GENERATED_MARKER = 'generated-from-color-center';
const GENERATED_NOTE = `<!-- ${GENERATED_MARKER}: apps/desktop/web/scripts/sync-color-assets.mjs -->`;
const GENERATED_NOTE_LINE = new RegExp(
  `^\\s*<!--\\s*${GENERATED_MARKER}:[^>]+-->\\s*$`,
  'gm'
);

const colorCenter = JSON.parse(fs.readFileSync(COLOR_CENTER_PATH, 'utf8'));

const resolveToken = (id) => {
  const entry = colorCenter.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`Unknown color center token: ${id}`);
  }
  return entry.light;
};

const SPECIAL_TRAINING_REPLACEMENTS = new Map([
  ['#2962FF', resolveToken('AS1-SpecialTrainingPrimary')],
  ['#089981', resolveToken('AS2-SpecialTrainingUp')],
  ['#F23645', resolveToken('AS3-SpecialTrainingDown')],
  ['#F59E0B', resolveToken('AS4-SpecialTrainingWarning')]
]);

const stripGeneratedMarker = (source) =>
  source
    .replace(GENERATED_NOTE_LINE, '')
    .replace(/\n{2,}/g, '\n');

const applyLiteralReplacements = (source, replacements) => {
  let next = source;
  replacements.forEach((replacement, target) => {
    next = next.replaceAll(target, replacement);
  });
  return next;
};

const dropLeadingBlankLine = (lines) => {
  if (lines[0]?.trim() === '') {
    return lines.slice(1);
  }
  return lines;
};

const syncSvgFile = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const withoutMarker = stripGeneratedMarker(source).trim();
  const normalized = applyLiteralReplacements(withoutMarker, SPECIAL_TRAINING_REPLACEMENTS);
  const lines = normalized.split(/\r?\n/);
  const nextLines = [lines[0], `  ${GENERATED_NOTE}`, ...dropLeadingBlankLine(lines.slice(1))];
  fs.writeFileSync(filePath, `${nextLines.join('\n')}\n`);
};

const syncAndroidIconXml = () => {
  const source = fs.readFileSync(ANDROID_ICON_XML_PATH, 'utf8');
  const withoutMarker = stripGeneratedMarker(source).trim();
  const normalized = withoutMarker
    .replace(/#fff\b/gi, resolveToken('AS5-AndroidLauncherBackground'))
    .replace(/#ffffff\b/gi, resolveToken('AS5-AndroidLauncherBackground'));
  const lines = normalized.split(/\r?\n/);
  const resourcesIndex = lines.findIndex((line) => line.includes('<resources'));
  if (resourcesIndex === -1) {
    throw new Error(`Expected <resources> root in ${ANDROID_ICON_XML_PATH}`);
  }
  const bodyLines = dropLeadingBlankLine(lines.slice(resourcesIndex + 1));
  const nextLines = [...lines.slice(0, resourcesIndex + 1), `  ${GENERATED_NOTE}`, ...bodyLines];
  fs.writeFileSync(ANDROID_ICON_XML_PATH, `${nextLines.join('\n')}\n`);
};

const syncSpecialTrainingAssets = () => {
  if (!fs.existsSync(SPECIAL_TRAINING_ASSET_DIR)) {
    return;
  }
  const files = fs.readdirSync(SPECIAL_TRAINING_ASSET_DIR)
    .filter((name) => name.endsWith('.svg'))
    .map((name) => path.join(SPECIAL_TRAINING_ASSET_DIR, name));
  files.forEach(syncSvgFile);
};

syncSpecialTrainingAssets();
syncAndroidIconXml();

console.log('[sync-color-assets] synced special-training SVG assets and Android launcher XML from color center.');
