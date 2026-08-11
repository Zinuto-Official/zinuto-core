#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(webRoot, 'dist');
const communityProductName = 'Zinuto Core';
const requiredFiles = ['index.html', 'secondary-window.html'];
const forbiddenHarnessFiles = [
  'i18n-pages.html',
  'i18n-harness.html',
  'hot-interaction-perf.html',
  'workspace-navigation-continuity.html',
  'ui-catalog.html',
];
for (const fileName of requiredFiles) {
  const source = fs.readFileSync(path.join(distDir, fileName), 'utf8');
  const isMainWindow = fileName === 'index.html';
  const expectedTitle = fileName === 'index.html'
    ? '<title></title>'
    : `<title>${communityProductName}</title>`;
  if (
    !source.includes(expectedTitle)
    || !source.includes('aria-label="Loading..."')
    || !source.includes(`aria-label="Retry loading ${communityProductName}"`)
    || !source.includes(`${communityProductName}</strong>`)
    || source.includes('zinuto-preboot__skeleton')
    || (
      isMainWindow
      && (
        !source.includes('data-zinuto-startup-surface')
        || !source.includes('zinuto-startup__logo-image')
        || !source.includes('zinuto.themeMode.boot.v1')
        || source.includes('zinuto-startup__market')
        || source.includes('zinuto-startup__logo-sheen')
      )
    )
  ) {
    throw new Error(`[desktop-brand-build] ${fileName} does not contain the community product identity`);
  }
}

for (const fileName of forbiddenHarnessFiles) {
  if (fs.existsSync(path.join(distDir, fileName))) {
    throw new Error(`[desktop-brand-build] test harness leaked into production output: ${fileName}`);
  }
}

process.stdout.write(`[desktop-brand-build] verified ${communityProductName}\n`);
