#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveDesktopCompositionPlan } from './desktop-command-utils.mjs';
import { resolveDesktopTargetPlatform } from './desktop-runtime-layout.mjs';
import {
  findUnexpectedAkshareSidecarPackagePaths,
  resolveAkshareSidecarPackageLayout,
  resolveAkshareSidecarTargetId,
} from './market-data-acquisition-runtime.mjs';
import {
  loadNativeRuntimeAuthority,
  resolveNativeRuntimeDescriptor,
} from './native-runtime-authority.mjs';
import { validateRuntimeDirectory } from './native-runtime-transaction.mjs';

export { resolveAkshareSidecarTargetId };

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const rootDir = path.resolve(scriptDir, '../..');
const shellDir = path.join(rootDir, 'apps', 'desktop', 'shell');
const generatedDir = path.join(shellDir, 'gen');
const binaryName = process.platform === 'win32'
  ? 'open-trading-practice-backtest-engine.exe'
  : 'open-trading-practice-backtest-engine';
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';

const isRegularFileWithoutSymlink = (filePath) => {
  try {
    const metadata = fs.lstatSync(filePath);
    return !metadata.isSymbolicLink() && metadata.isFile();
  } catch {
    return false;
  }
};

export const isRegularAkshareSidecarExecutable = (
  filePath,
  nodePlatform = process.platform,
) => {
  try {
    const metadata = fs.lstatSync(filePath);
    return !metadata.isSymbolicLink()
      && metadata.isFile()
      && (nodePlatform === 'win32' || (metadata.mode & 0o111) !== 0);
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

const findSymlinks = (directoryPath) => {
  if (!isDirectoryWithoutSymlink(directoryPath)) return [];
  const symlinks = [];
  const pending = [directoryPath];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push(entryPath);
      } else if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return symlinks;
};

export const inspectAkshareSidecarBundle = ({
  generatedRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
  akshareVersion,
  aktoolsVersion,
}) => {
  const layout = resolveAkshareSidecarPackageLayout({
    generatedRoot,
    nodePlatform,
    nodeArch,
  });
  const { bundleRoot, executablePath, targetId } = layout;
  const internalRoot = path.join(bundleRoot, '_internal');
  const requiredFiles = [
    executablePath,
    path.join(internalRoot, 'base_library.zip'),
    path.join(internalRoot, 'akshare', 'file_fold', 'calendar.json'),
    path.join(internalRoot, `akshare-${akshareVersion}.dist-info`, 'METADATA'),
    path.join(internalRoot, `aktools-${aktoolsVersion}.dist-info`, 'METADATA'),
  ];
  const requiredDirectories = [bundleRoot, internalRoot];
  const invalidPaths = [
    ...requiredFiles.filter((filePath) => !isRegularFileWithoutSymlink(filePath)),
    ...requiredDirectories.filter(
      (directoryPath) => !isDirectoryWithoutSymlink(directoryPath),
    ),
    ...findUnexpectedAkshareSidecarPackagePaths({
      generatedRoot,
      nodePlatform,
      nodeArch,
    }),
    ...findSymlinks(bundleRoot),
  ];
  if (!isRegularAkshareSidecarExecutable(executablePath, nodePlatform)) {
    invalidPaths.push(executablePath);
  }
  return {
    bundleRoot,
    executablePath,
    invalidPaths: [...new Set(invalidPaths)],
    requiredDirectories,
    requiredFiles,
    targetId,
  };
};

export const parseNativeRuntimeValidationArguments = (
  args,
) => {
  let mode = 'build';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--mode') {
      mode = String(args[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
    throw new Error(`Unknown native runtime validation option: ${argument}`);
  }
  if (!['runtime', 'dev', 'build'].includes(mode)) {
    throw new Error(`Unknown native runtime validation mode: ${mode || '(empty)'}`);
  }
  return { mode };
};

export const resolveNativeRuntimeValidationPolicy = ({
  composition,
} = {}) => {
  const distributionId = String(composition?.distributionId ?? '').trim();
  if (distributionId !== 'community') {
    throw new Error('Native runtime validation requires the community composition.');
  }
  return { distributionId };
};

export const validateNativeRuntime = ({ args = process.argv.slice(2) } = {}) => {
  const { mode } = parseNativeRuntimeValidationArguments(args);
  const compositionPolicy = resolveNativeRuntimeValidationPolicy({
    composition: readActiveDesktopCompositionPlan(),
  });
  const sidecarCompliance = JSON.parse(
    fs.readFileSync(
      path.join(rootDir, 'config', 'open-source', 'python-sidecar-dependencies.json'),
      'utf8',
    ),
  );
  const rootPackageVersion = (packageName) => {
    const entry = sidecarCompliance.requiredRootPackages?.find(
      (item) => item?.name === packageName,
    );
    if (typeof entry?.version !== 'string') {
      throw new Error(`AKShare sidecar root package is not pinned: ${packageName}`);
    }
    return entry.version;
  };
  const sidecarBundle = mode === 'runtime'
    ? null
    : inspectAkshareSidecarBundle({
        generatedRoot: generatedDir,
        akshareVersion: rootPackageVersion('akshare'),
        aktoolsVersion: rootPackageVersion('aktools'),
      });
  const runtimeBinaryPath = path.join(shellDir, 'runtime', 'node', 'bin', nodeName);
  const nativeRuntimeDescriptor = resolveNativeRuntimeDescriptor({
    authority: loadNativeRuntimeAuthority(),
  });
  validateRuntimeDirectory({
    runtimeRoot: path.join(shellDir, 'runtime', 'node'),
    descriptor: nativeRuntimeDescriptor,
  });
  const preparedRuntimeFiles = [
    path.join(rootDir, 'apps', 'desktop', 'local-api', 'dist', 'runtime', 'index.js'),
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
    path.join(generatedDir, 'backtest-engine', binaryName),
  ];
  const requiredFiles = mode === 'runtime'
    ? [runtimeBinaryPath]
    : [
        ...(mode === 'build'
          ? [path.join(rootDir, 'apps', 'desktop', 'web', 'dist', 'index.html')]
          : []),
        ...preparedRuntimeFiles,
        ...(sidecarBundle?.requiredFiles ?? []),
        runtimeBinaryPath,
      ];

  const requiredDirectories = mode === 'runtime'
    ? []
    : [
        path.join(generatedDir, 'backend-runtime', 'node_modules', 'express'),
        path.join(generatedDir, 'node-runtime-libs'),
        ...(sidecarBundle?.requiredDirectories ?? []),
      ];

  const missing = [
    ...requiredFiles.filter(
      (filePath) => !fs.existsSync(filePath) || !fs.statSync(filePath).isFile(),
    ),
    ...requiredDirectories.filter(
      (dirPath) => !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory(),
    ),
    ...(sidecarBundle?.invalidPaths ?? []),
  ];

  const incomplete = [...new Set(missing)];
  if (incomplete.length) {
    throw new Error(
      `Runtime bundle is incomplete:\n${incomplete
        .map((targetPath) => `- ${path.relative(rootDir, targetPath)}`)
        .join('\n')}`,
    );
  }

  const expectedTarget = resolveDesktopTargetPlatform(process.platform);
  if (mode !== 'runtime') {
    const manifestPath = path.join(generatedDir, 'runtime-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== 1 || manifest.targetPlatform !== expectedTarget) {
      throw new Error(
        `Runtime manifest target mismatch: expected ${expectedTarget}, received ${String(
          manifest.targetPlatform,
        )}`,
      );
    }
  }

  console.log(
    `[runtime-check] ${mode} runtime ready for ${expectedTarget} (${requiredFiles.length} files, ${requiredDirectories.length} directories; ${compositionPolicy.distributionId})`,
  );
  return { distributionId: compositionPolicy.distributionId, mode };
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  validateNativeRuntime();
}
