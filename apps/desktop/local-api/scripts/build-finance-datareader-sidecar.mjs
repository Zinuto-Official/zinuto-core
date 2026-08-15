#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveFinanceDataReaderSidecarPackageLayout,
  stageFinanceDataReaderSidecarPackageInput,
} from '../../../../tools/release/market-data-acquisition-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(backendDir, '../../..');
const projectDir = path.join(backendDir, 'sidecars', 'finance-datareader');
const registryPath = path.join(
  repositoryDir,
  'config',
  'open-source',
  'market-data-connectors.v1.json',
);
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const connector = registry.providers?.find(
  (entry) => entry?.id === 'financedatareader',
);
if (registry.schemaVersion !== 1 || !connector || connector.sidecar?.id !== 'financedatareader') {
  throw new Error('FINANCEDATAREADER_SIDECAR_REGISTRY_INVALID');
}
const resolveRepositoryFile = (relativePath, errorCode) => {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error(errorCode);
  }
  const resolved = path.resolve(repositoryDir, relativePath);
  const repositoryRelative = path.relative(repositoryDir, resolved);
  if (repositoryRelative.startsWith('..') || path.isAbsolute(repositoryRelative)) {
    throw new Error(errorCode);
  }
  return resolved;
};
const sha256File = (filePath) =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const lockFile = resolveRepositoryFile(
  connector.dependencyLock?.file,
  'FINANCEDATAREADER_SIDECAR_LOCK_PATH_INVALID',
);
const projectFile = resolveRepositoryFile(
  connector.projectFile?.file,
  'FINANCEDATAREADER_SIDECAR_PROJECT_PATH_INVALID',
);
const connectorVersionsFile = path.join(projectDir, 'connector-versions.json');
const pythonVersionFile = path.join(projectDir, '.python-version');
if (
  lockFile !== path.join(projectDir, 'uv.lock') ||
  sha256File(lockFile) !== connector.dependencyLock?.sha256 ||
  projectFile !== path.join(projectDir, 'pyproject.toml') ||
  sha256File(projectFile) !== connector.projectFile?.sha256 ||
  fs.readFileSync(pythonVersionFile, 'utf8').trim() !== connector.sidecar.python
) {
  throw new Error('FINANCEDATAREADER_SIDECAR_LOCK_OR_PROJECT_HASH_INVALID');
}
const connectorVersions = JSON.parse(fs.readFileSync(connectorVersionsFile, 'utf8'));
if (
  connectorVersions?.schemaVersion !== 1 ||
  connectorVersions?.financedatareader !== connector.version
) {
  throw new Error('FINANCEDATAREADER_SIDECAR_VERSION_MANIFEST_INVALID');
}
const targetId = `${process.platform}-${process.arch}`;
const outputRoot = path.join(repositoryDir, '.cache', 'finance-datareader-sidecar', targetId);
const buildRoot = path.join(
  repositoryDir,
  '.cache',
  'finance-datareader-sidecar',
  'build',
  targetId,
);
const generatedRoot = path.join(repositoryDir, 'apps', 'desktop', 'shell', 'gen');
const packageLayout = resolveFinanceDataReaderSidecarPackageLayout({
  generatedRoot,
  nodePlatform: process.platform,
  nodeArch: process.arch,
});
if (packageLayout.targetId !== targetId) {
  throw new Error('FINANCEDATAREADER_SIDECAR_TARGET_INVALID');
}
const pythonVersion = connector.sidecar.python;
const requiredUvVersion = '0.11.8';
const uvVersion = execFileSync('uv', ['--version'], { encoding: 'utf8' }).trim();
if (!uvVersion.startsWith(`uv ${requiredUvVersion}`)) {
  throw new Error(`FINANCEDATAREADER_SIDECAR_UV_VERSION_INVALID:${uvVersion}`);
}
const environmentRoot = path.join(buildRoot, 'venv');
const uvEnvironment = { ...process.env, UV_PROJECT_ENVIRONMENT: environmentRoot };

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.rmSync(buildRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
process.once('exit', () => {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.rmSync(buildRoot, { recursive: true, force: true });
});

execFileSync('uv', ['sync', '--python', pythonVersion, '--frozen', '--project', projectDir], {
  cwd: repositoryDir,
  env: uvEnvironment,
  stdio: 'inherit',
});
if (process.argv.includes('--sync-only')) {
  process.stdout.write(`${JSON.stringify({ pythonVersion, projectDir })}\n`);
  process.exit(0);
}
execFileSync(
  'uv',
  [
    'run',
    '--python',
    pythonVersion,
    '--frozen',
    '--project',
    projectDir,
    'python',
    path.join(projectDir, 'worker_test.py'),
  ],
  { cwd: projectDir, env: uvEnvironment, stdio: 'inherit' },
);
execFileSync(
  'uv',
  [
    'run',
    '--python',
    pythonVersion,
    '--frozen',
    '--project',
    projectDir,
    'pyinstaller',
    '--noconfirm',
    '--clean',
    '--onedir',
    '--name',
    'zinuto-finance-datareader-sidecar',
    '--distpath',
    outputRoot,
    '--workpath',
    buildRoot,
    '--specpath',
    buildRoot,
    '--copy-metadata',
    'finance-datareader',
    '--add-data',
    `${connectorVersionsFile}${path.delimiter}.`,
    '--collect-data',
    'FinanceDataReader',
    '--hidden-import',
    'FinanceDataReader',
    path.join(projectDir, 'main.py'),
  ],
  { cwd: repositoryDir, env: uvEnvironment, stdio: 'inherit' },
);
const executablePath = path.join(
  outputRoot,
  'zinuto-finance-datareader-sidecar',
  packageLayout.executableName,
);
if (!fs.existsSync(executablePath)) {
  throw new Error('FINANCEDATAREADER_SIDECAR_BUILD_OUTPUT_MISSING');
}
const smoke = spawnSync(executablePath, [], {
  cwd: repositoryDir,
  input: `${JSON.stringify({
    protocol: 'zinuto.finance-datareader.v1',
    requestId: 'build-smoke',
    operation: 'instruments',
    params: { marketId: 'GLOBAL_INDICES', query: '' },
  })}\n`,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
let smokeResponse = null;
try {
  smokeResponse = JSON.parse(String(smoke.stdout ?? '').trim());
} catch {
  // handled by the stable failure below
}
if (
  smoke.status !== 0 ||
  smokeResponse?.protocol !== 'zinuto.finance-datareader.v1' ||
  smokeResponse?.requestId !== 'build-smoke' ||
  smokeResponse?.ok !== true ||
  smokeResponse?.runtime?.financedatareader !== connector.version ||
  smokeResponse?.kind !== 'instruments'
) {
  throw new Error('FINANCEDATAREADER_SIDECAR_PROTOCOL_SMOKE_FAILED');
}
const stagedPackage = stageFinanceDataReaderSidecarPackageInput({
  generatedRoot,
  sourceBundleRoot: path.dirname(executablePath),
  nodePlatform: process.platform,
  nodeArch: process.arch,
});
process.stdout.write(
  `${JSON.stringify({ targetId, pythonVersion, executablePath, packagedExecutablePath: stagedPackage.executablePath })}\n`,
);
