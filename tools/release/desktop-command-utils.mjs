#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildDesktopCompositionWebEnvironment,
  readDesktopComposition,
  resolveDesktopComposition,
} from './desktop-composition.mjs';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
export const DESKTOP_SHELL_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell');
export const RELEASE_TARGET_DIR = path.join(DESKTOP_SHELL_DIR, 'target', 'release');
export const BUNDLE_DIR = path.join(RELEASE_TARGET_DIR, 'bundle');
export const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
export const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
export const nodeCommand =
  process.execPath || (process.platform === 'win32' ? 'node.exe' : 'node');

export const ACTIVE_DESKTOP_COMPOSITION_INPUT_PATH = path.join(
  ROOT_DIR,
  'config',
  'brand',
  'active.json',
);
export const ACTIVE_DESKTOP_COMPOSITION_PLAN_PATH = path.join(
  ROOT_DIR,
  'config',
  'brand',
  'active-composition.json',
);
export const DESKTOP_COMPOSITION_PLAN_ENV = 'ZINUTO_DESKTOP_COMPOSITION_PLAN';

const isResolvedDesktopComposition = (value) => (
  value
  && typeof value === 'object'
  && value.protocolVersion === 1
  && value.brand
  && value.tauri
);

export const buildBrandWebEnvironment = (composition) =>
  buildDesktopCompositionWebEnvironment(
    isResolvedDesktopComposition(composition)
      ? composition
      : resolveDesktopComposition(composition),
  );

export const readActiveDesktopCompositionPlan = ({
  env = process.env,
  activeInputPath = ACTIVE_DESKTOP_COMPOSITION_INPUT_PATH,
} = {}) => {
  const configuredPlanPath = String(env[DESKTOP_COMPOSITION_PLAN_ENV] ?? '').trim();
  if (configuredPlanPath) {
    throw new Error('Core does not accept an external desktop composition plan');
  }
  return readDesktopComposition(activeInputPath);
};

const shouldUseWindowsCommandShell = (command) =>
  process.platform === 'win32' && /\.(cmd|bat)$/i.test(path.basename(String(command || '')));

const quoteWindowsCommandArg = (value) => {
  const text = String(value ?? '');
  if (!text.length) {
    return '""';
  }
  if (!/[\s"&()<>^|]/.test(text)) {
    return text;
  }
  return `"${text.replace(/(["^&|<>()])/g, '^$1')}"`;
};

const resolveCommandInvocation = (command, args) => {
  if (!shouldUseWindowsCommandShell(command)) {
    return { command, args };
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: [
      '/d',
      '/s',
      '/c',
      [quoteWindowsCommandArg(command), ...args.map((arg) => quoteWindowsCommandArg(arg))].join(' '),
    ],
  };
};

export const isTruthyEnvFlag = (value) =>
  matchesNormalizedEnvFlag(value, ['1', 'true', 'yes', 'on']);

const matchesNormalizedEnvFlag = (value, allowedValues) =>
  allowedValues.includes(String(value || '').trim().toLowerCase());

const prependPathEntries = (pathValue, entries) => {
  const currentEntries = String(pathValue || '')
    .split(path.delimiter)
    .filter((entry) => Boolean(entry));
  const mergedEntries = [...entries, ...currentEntries].filter(
    (entry, index, values) => values.indexOf(entry) === index,
  );
  return mergedEntries.join(path.delimiter);
};

const parseMacosDiskImageInfo = () => {
  const info = spawnSync('hdiutil', ['info', '-plist'], {
    encoding: 'utf8',
  });
  if (info.status !== 0 || !info.stdout) {
    return [];
  }
  const converted = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], {
    input: info.stdout,
    encoding: 'utf8',
  });
  if (converted.status !== 0 || !converted.stdout) {
    return [];
  }
  try {
    const parsed = JSON.parse(converted.stdout);
    return Array.isArray(parsed.images) ? parsed.images : [];
  } catch {
    return [];
  }
};

const cleanupMacosDmgWorkImages = () => {
  if (process.platform !== 'darwin') {
    return;
  }
  const bundleRoot = `${path.resolve(BUNDLE_DIR)}${path.sep}`;
  const images = parseMacosDiskImageInfo();
  for (const image of images) {
    const imagePath = String(image?.['image-path'] || '').trim();
    if (
      !imagePath ||
      !path.resolve(imagePath).startsWith(bundleRoot) ||
      !path.basename(imagePath).startsWith('rw.')
    ) {
      continue;
    }
    const entities = Array.isArray(image?.['system-entities'])
      ? image['system-entities']
      : [];
    const devEntries = entities
      .map((entity) => String(entity?.['dev-entry'] || '').trim())
      .filter(Boolean);
    for (const devEntry of devEntries) {
      const detached = spawnSync('hdiutil', ['detach', devEntry], {
        stdio: 'ignore',
      });
      if (detached.status === 0) {
        break;
      }
    }
    fs.rmSync(imagePath, { force: true });
  }
};

export const removeDesktopBundleOutputs = () => {
  cleanupMacosDmgWorkImages();
  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
};

export const buildDesktopEnv = (extraEnv = {}) => {
  const brandEnvironment = buildDesktopCompositionWebEnvironment(
    readActiveDesktopCompositionPlan({ env: { ...process.env, ...extraEnv } }),
  );
  const env = {
    ...process.env,
    ...extraEnv,
    ...brandEnvironment,
  };

  if (process.platform === 'darwin') {
    const rustupPathCandidates = [
      '/opt/homebrew/opt/rustup/bin',
      '/usr/local/opt/rustup/bin',
    ].filter((candidatePath) => {
      try {
        return fs.statSync(candidatePath).isDirectory();
      } catch {
        return false;
      }
    });

    if (rustupPathCandidates.length) {
      env.PATH = prependPathEntries(env.PATH, rustupPathCandidates);
    }
  }

  return env;
};

const formatCommand = (command, args) =>
  [command, ...args.map((arg) => JSON.stringify(arg))].join(' ');

export const runCommand = (
  command,
  args,
  label,
  {
    allowedExitStatuses = [],
    cwd = ROOT_DIR,
    env = process.env,
    stdio = 'inherit',
    encoding,
    logPrefix = 'desktop',
  } = {},
) => {
  // eslint-disable-next-line no-console
  console.log(`[${logPrefix}] ${label}`);
  const invocation = resolveCommandInvocation(command, args);

  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    stdio,
    ...(encoding ? { encoding } : {}),
  });

  if (result.error) {
    throw new Error(
      `Failed to launch ${formatCommand(invocation.command, invocation.args)}: ${
        result.error instanceof Error ? result.error.message : 'unknown error'
      }`,
    );
  }

  if (result.status !== 0 && !allowedExitStatuses.includes(result.status)) {
    throw new Error(
      `Command failed (${result.status || 1}): ${formatCommand(invocation.command, invocation.args)}`,
    );
  }

  return result;
};

const resolveLocalTauriCliScriptPath = () => {
  const candidatePath = path.join(
    ROOT_DIR,
    'node_modules',
    '@tauri-apps',
    'cli',
    'tauri.js',
  );

  try {
    if (fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  } catch {
    // fall back to npx below
  }

  return null;
};

export const runTauriCli = (
  subcommand,
  args,
  {
    cwd = DESKTOP_SHELL_DIR,
    env = process.env,
    label = `Running tauri ${subcommand}`,
  } = {},
) => {
  const localCliScriptPath = resolveLocalTauriCliScriptPath();
  if (localCliScriptPath) {
    return runCommand(nodeCommand, [localCliScriptPath, subcommand, ...args], label, {
      cwd,
      env,
      logPrefix: 'tauri-cli',
    });
  }

  return runCommand(npxCommand, ['tauri', subcommand, ...args], label, {
    cwd,
    env,
    logPrefix: 'tauri-cli',
  });
};
