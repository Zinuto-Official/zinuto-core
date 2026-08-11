#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK,
} from '../quality/architecture-guard-config.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const SHELL_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'shell');
const RELEASE_DIR = path.join(SHELL_DIR, 'target', 'release');
const NSIS_BUNDLE_DIR = path.join(RELEASE_DIR, 'bundle', 'nsis');
const GENERATED_NSIS_SCRIPT_PATH = path.join(RELEASE_DIR, 'nsis', 'x64', 'installer.nsi');
const WINDOWS_NSIS_HOOK_PATH = path.join(SHELL_DIR, REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK);
const GENERATED_RUNTIME_LIBS_DIR = path.join(SHELL_DIR, 'gen', 'node-runtime-libs');
const UNINSTALL_REGISTRY_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Zinuto Core`;
const SMOKE_INSTALL_PREFIX = 'open-trading-practice-install-smoke-';

const REQUIRED_INSTALLED_FILES = [
  'Zinuto Core.exe',
  'runtime-manifest.json',
  'apps/desktop/local-api/package.json',
  'apps/desktop/local-api/dist/runtime/index.js',
  'node_modules/express/package.json',
  'node_modules/better-sqlite3/package.json',
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'node_modules/@duckdb/node-api/package.json',
  'node_modules/@duckdb/node-bindings-win32-x64/duckdb.node',
  'backtest-engine/open-trading-practice-backtest-engine.exe',
  'backtest-engine/deps/duckdb.dll',
  'node-runtime/node.exe',
];

const REQUIRED_HOOK_FRAGMENTS = [
  'NSIS_HOOK_PREINSTALL',
  'NSIS_HOOK_PREUNINSTALL',
  'gen\\runtime-manifest.json',
  'gen\\backend-runtime\\apps',
  'gen\\backend-runtime\\node_modules',
  'gen\\backtest-engine',
  'runtime\\node\\bin\\node.exe',
];

const normalizeForDisplay = (targetPath) =>
  path.relative(ROOT_DIR, targetPath).replaceAll(path.sep, '/');

const ensureFileExists = (targetPath, label) => {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
};

const ensureDirectoryExists = (targetPath, label) => {
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
};

const readText = (targetPath, label) => {
  ensureFileExists(targetPath, label);
  return fs.readFileSync(targetPath, 'utf8');
};

const runCommand = (command, args, label, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error) {
    throw new Error(
      `Failed to launch ${label}: ${
        result.error instanceof Error ? result.error.message : 'unknown error'
      }`,
    );
  }
  if (result.status !== 0) {
    const output = [result.stderr, result.stdout]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n');
    throw new Error(
      [
        `${label} failed with exit code ${String(result.status ?? 'unknown')}.`,
        output,
      ].filter(Boolean).join('\n'),
    );
  }
  return result;
};

const stripOuterQuotes = (value) =>
  String(value || '')
    .trim()
    .replace(/^"+|"+$/gu, '')
    .trim();

const readRegisteredInstallLocation = () => {
  const result = spawnSync(
    'reg.exe',
    ['query', UNINSTALL_REGISTRY_KEY, '/v', 'InstallLocation'],
    {
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    return '';
  }
  const line = String(result.stdout || '')
    .split(/\r?\n/u)
    .find((entry) => /\bInstallLocation\b/u.test(entry));
  const match = /\bInstallLocation\s+REG_\w+\s+(.+)$/u.exec(line || '');
  return stripOuterQuotes(match?.[1] || '');
};

const isSmokeInstallPath = (targetPath) => {
  if (!targetPath) {
    return false;
  }
  const resolved = path.resolve(targetPath);
  const resolvedTemp = path.resolve(os.tmpdir());
  return (
    resolved.startsWith(`${resolvedTemp}${path.sep}`) &&
    path.basename(resolved).startsWith(SMOKE_INSTALL_PREFIX)
  );
};

const cleanupSmokeInstall = (installDir) => {
  if (!isSmokeInstallPath(installDir)) {
    return;
  }

  const uninstallerPath = path.join(installDir, 'uninstall.exe');
  if (fs.existsSync(uninstallerPath) && fs.statSync(uninstallerPath).isFile()) {
    spawnSync(uninstallerPath, ['/S'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  const registeredInstallLocation = readRegisteredInstallLocation();
  if (isSmokeInstallPath(registeredInstallLocation)) {
    spawnSync('reg.exe', ['delete', UNINSTALL_REGISTRY_KEY, '/f'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  try {
    fs.rmSync(installDir, {
      recursive: true,
      force: true,
      maxRetries: 60,
      retryDelay: 250,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[windows-installer] temp install cleanup warning: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const findLatestNsisInstaller = () => {
  ensureDirectoryExists(NSIS_BUNDLE_DIR, 'Windows NSIS bundle directory');
  const installers = fs
    .readdirSync(NSIS_BUNDLE_DIR)
    .filter((entry) => /-setup\.exe$/iu.test(entry))
    .map((entry) => path.join(NSIS_BUNDLE_DIR, entry))
    .filter((entryPath) => fs.statSync(entryPath).isFile())
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (installers.length === 0) {
    throw new Error(`No NSIS setup executable found in ${NSIS_BUNDLE_DIR}`);
  }
  return installers[0];
};

const validateNsisHookWiring = () => {
  const hookText = readText(WINDOWS_NSIS_HOOK_PATH, 'Windows NSIS runtime resource hook');
  REQUIRED_HOOK_FRAGMENTS.forEach((fragment) => {
    if (!hookText.includes(fragment)) {
      throw new Error(
        `Windows NSIS runtime resource hook is missing "${fragment}": ${WINDOWS_NSIS_HOOK_PATH}`,
      );
    }
  });

  const generatedNsisScript = readText(GENERATED_NSIS_SCRIPT_PATH, 'generated NSIS installer script');
  if (!generatedNsisScript.includes(path.basename(REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK))) {
    throw new Error(
      `Generated NSIS script does not include ${REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK}: ${GENERATED_NSIS_SCRIPT_PATH}`,
    );
  }
  if (!generatedNsisScript.includes('NSIS_HOOK_PREINSTALL')) {
    throw new Error(
      `Generated NSIS script does not call NSIS_HOOK_PREINSTALL: ${GENERATED_NSIS_SCRIPT_PATH}`,
    );
  }
};

const collectFilesRecursive = (rootPath) => {
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [];
  }
  const files = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        return;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    });
  }
  return files.sort();
};

const validateInstalledRuntimeLibs = (installDir) => {
  const runtimeLibFiles = collectFilesRecursive(GENERATED_RUNTIME_LIBS_DIR);
  runtimeLibFiles.forEach((sourcePath) => {
    const relativePath = path.relative(GENERATED_RUNTIME_LIBS_DIR, sourcePath);
    const installedPath = path.join(installDir, 'node-runtime', relativePath);
    ensureFileExists(installedPath, `installed runtime library ${relativePath}`);
  });
};

const validateInstalledFiles = (installDir) => {
  REQUIRED_INSTALLED_FILES.forEach((relativePath) => {
    ensureFileExists(
      path.join(installDir, ...relativePath.split('/')),
      `installed ${relativePath}`,
    );
  });
  validateInstalledRuntimeLibs(installDir);
};

const validateInstalledRuntimeExecution = (installDir) => {
  const nodePath = path.join(installDir, 'node-runtime', 'node.exe');
  const script = `
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.prepare('SELECT 1 AS ok').get();
db.close();
(async () => {
  const { DuckDBInstance } = require('@duckdb/node-api');
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  const result = await connection.runAndReadAll('SELECT 1 AS ok');
  const rows = result.getRows();
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0][0] !== 1) {
    throw new Error('unexpected DuckDB smoke query result');
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
`;
  runCommand(nodePath, ['-e', script], 'installed packaged runtime dependency smoke', {
    cwd: installDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
};

const runInstallSmoke = (installerPath) => {
  const existingInstallLocation = readRegisteredInstallLocation();
  if (isSmokeInstallPath(existingInstallLocation)) {
    cleanupSmokeInstall(existingInstallLocation);
  } else if (existingInstallLocation) {
    // eslint-disable-next-line no-console
    console.warn(
      [
        '[windows-installer] Existing Zinuto Core install registration detected; skipping temp install smoke to avoid modifying a real install.',
        `InstallLocation=${existingInstallLocation}`,
        'Generated NSIS script and hook wiring were still validated.',
      ].join('\n'),
    );
    return;
  }

  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), SMOKE_INSTALL_PREFIX));
  try {
    runCommand(installerPath, ['/S', `/D=${installDir}`], 'Windows NSIS temp install smoke');
    validateInstalledFiles(installDir);
    validateInstalledRuntimeExecution(installDir);
  } finally {
    cleanupSmokeInstall(installDir);
  }
};

if (process.platform !== 'win32') {
  // eslint-disable-next-line no-console
  console.log('[windows-installer] skipped: Windows NSIS installer validation only runs on Windows.');
  process.exit(0);
}

try {
  validateNsisHookWiring();
  const installerPath = findLatestNsisInstaller();
  runInstallSmoke(installerPath);
  // eslint-disable-next-line no-console
  console.log(
    `[windows-installer] validated NSIS installer runtime resources (${normalizeForDisplay(installerPath)})`,
  );
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    `[windows-installer] validation failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
