#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAkshareSidecarBundle } from './validate-native-runtime.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const defaultRootDir = path.resolve(scriptDir, '../..');

const isRegularFileWithoutSymlink = (filePath) => {
  try {
    const metadata = fs.lstatSync(filePath);
    return !metadata.isSymbolicLink() && metadata.isFile();
  } catch {
    return false;
  }
};

const isDirectoryWithoutSymlink = (directoryPath) => {
  try {
    const metadata = fs.lstatSync(directoryPath);
    return !metadata.isSymbolicLink() && metadata.isDirectory();
  } catch {
    return false;
  }
};

const loadSidecarVersions = (rootDir) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(
    rootDir,
    'config',
    'open-source',
    'python-sidecar-dependencies.json',
  ), 'utf8'));
  const version = (packageName) => manifest.requiredRootPackages?.find(
    (entry) => entry?.name === packageName,
  )?.version;
  const akshareVersion = version('akshare');
  const aktoolsVersion = version('aktools');
  if (typeof akshareVersion !== 'string' || typeof aktoolsVersion !== 'string') {
    throw new Error('AKShare sidecar dependency versions are not pinned.');
  }
  return { akshareVersion, aktoolsVersion };
};

export const collectMissingTauriBuildInputs = ({
  rootDir = defaultRootDir,
  nodePlatform = process.platform,
  nodeArch = process.arch,
} = {}) => {
  const generatedDir = path.join(rootDir, 'apps', 'desktop', 'shell', 'gen');
  const backtestBinary = nodePlatform === 'win32'
    ? 'open-trading-practice-backtest-engine.exe'
    : 'open-trading-practice-backtest-engine';
  const nodeBinary = nodePlatform === 'win32' ? 'node.exe' : 'node';
  const sidecarBundle = inspectAkshareSidecarBundle({
    generatedRoot: generatedDir,
    nodePlatform,
    nodeArch,
    ...loadSidecarVersions(rootDir),
  });
  const requiredFiles = [
    path.join(rootDir, 'apps', 'desktop', 'web', 'dist', 'index.html'),
    path.join(
      generatedDir,
      'backend-runtime',
      'apps',
      'desktop',
      'local-api',
      'dist',
      'runtime',
      'index.js',
    ),
    path.join(generatedDir, 'runtime-manifest.json'),
    path.join(generatedDir, 'backtest-engine', backtestBinary),
    path.join(rootDir, 'apps', 'desktop', 'shell', 'runtime', 'node', 'bin', nodeBinary),
    ...sidecarBundle.requiredFiles,
  ];
  const requiredDirectories = [
    path.join(generatedDir, 'backend-runtime', 'node_modules'),
    path.join(generatedDir, 'node-runtime-libs'),
    ...sidecarBundle.requiredDirectories,
  ];
  return [...new Set([
    ...requiredFiles.filter((filePath) => !isRegularFileWithoutSymlink(filePath)),
    ...requiredDirectories.filter(
      (directoryPath) => !isDirectoryWithoutSymlink(directoryPath),
    ),
    ...sidecarBundle.invalidPaths,
  ])];
};

export const ensureTauriBuildInputs = (options = {}) => {
  const rootDir = options.rootDir ?? defaultRootDir;
  const missing = collectMissingTauriBuildInputs({ ...options, rootDir });
  if (missing.length) {
    throw new Error(
      `Desktop build inputs are missing. Run npm run desktop:runtime:check:build first:\n${missing
        .map((filePath) => `- ${path.relative(rootDir, filePath)}`)
        .join('\n')}`,
    );
  }
  return true;
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  ensureTauriBuildInputs();
}
