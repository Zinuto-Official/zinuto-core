#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import {
  ROOT_DIR,
  buildDesktopEnv,
  nodeCommand,
  npmCommand,
  readActiveDesktopCompositionPlan,
  runCommand,
} from './desktop-command-utils.mjs';

const composition = readActiveDesktopCompositionPlan();
const buildProfileLabel = composition.distributionId;
const env = buildDesktopEnv({
  ZINUTO_TAURI_BUILD_MODE: 'dev',
});

const run = (command, args, label) =>
  runCommand(command, args, label, {
    cwd: ROOT_DIR,
    env,
    logPrefix: `${buildProfileLabel}-dev`,
  });

run(nodeCommand, ['./tools/release/check-node-version.mjs'], 'Checking Node version');
run(nodeCommand, ['./tools/release/ensure-native-runtime.mjs'], 'Ensuring bundled Node runtime');
run(npmCommand, ['run', 'build', '--workspace=@zinuto/shared'], 'Building shared workspace');
run(
  npmCommand,
  ['run', 'build', '--workspace=@zinuto/desktop-local-api'],
  'Building desktop local API',
);
run(
  npmCommand,
  ['run', 'akshare-sidecar:build', '--workspace=@zinuto/desktop-local-api'],
  'Building locked AKTools/AKShare sidecar',
);
run(
  npmCommand,
  ['run', 'finance-datareader-sidecar:build', '--workspace=@zinuto/desktop-local-api'],
  'Building locked FinanceDataReader sidecar',
);
run(
  nodeCommand,
  ['./tools/release/prepare-backtest-engine.mjs'],
  'Preparing backtest engine',
);
run(
  nodeCommand,
  ['./tools/release/prepare-node-runtime-libs.mjs'],
  'Preparing Node runtime libraries',
);
run(
  nodeCommand,
  ['./tools/release/prepare-backend-runtime-bundle.mjs'],
  'Preparing isolated local runtime bundle',
);
run(
  nodeCommand,
  [
    './tools/release/validate-native-runtime.mjs',
    '--mode',
    'dev',
  ],
  `Validating ${buildProfileLabel} runtime bundle`,
);
