#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import {
  ROOT_DIR,
  buildDesktopEnv,
  removeDesktopBundleOutputs,
  runTauriCli,
} from './desktop-command-utils.mjs';
import { readActiveDesktopComposition } from './desktop-composition.mjs';

const [mode = '', ...extraArgs] = process.argv.slice(2);
if (mode !== 'dev' && mode !== 'build') {
  throw new Error(`Unsupported community desktop mode "${mode}". Use dev or build.`);
}

const composition = readActiveDesktopComposition();
if (composition.distributionId !== 'community') {
  throw new Error('The public desktop wrapper only builds the community composition.');
}

const env = buildDesktopEnv({
  ZINUTO_TAURI_BUILD_MODE: mode,
});
delete env.ZINUTO_DESKTOP_COMPOSITION_PLAN;

if (mode === 'build') {
  removeDesktopBundleOutputs();
}

runTauriCli(mode, extraArgs, {
  env,
  label: `Running community desktop ${mode}`,
});
