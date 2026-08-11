#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRuntimeManifestPathSets,
  resolveDesktopTargetPlatform,
} from './desktop-runtime-layout.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../..');
const GEN_ROOT = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'gen');
const OUTPUT_ROOT = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'gen', 'backend-runtime');
const OUTPUT_BACKEND_DIR = path.join(OUTPUT_ROOT, 'apps', 'desktop', 'local-api');
const OUTPUT_NODE_MODULES_DIR = path.join(OUTPUT_ROOT, 'node_modules');
const OUTPUT_RUNTIME_MANIFEST_PATH = path.join(GEN_ROOT, 'runtime-manifest.json');
const BACKEND_DIR = path.join(ROOT_DIR, 'apps', 'desktop', 'local-api');
const BACKEND_DIST_DIR = path.join(BACKEND_DIR, 'dist');
const BACKEND_PACKAGE_JSON = path.join(BACKEND_DIR, 'package.json');
const BACKEND_LOCKFILE_KEY = 'apps/desktop/local-api';
const SHARED_DIR = path.join(ROOT_DIR, 'packages', 'shared');
const SHARED_SRC_DIR = path.join(SHARED_DIR, 'src');
const SHARED_DIST_DIR = path.join(SHARED_DIR, 'dist');
const ROOT_PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const ROOT_NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');
const BUILD_LOCK_DIR = path.join(GEN_ROOT, '.backend-runtime.lock');
const BUILD_LOCK_OWNER_PATH = path.join(BUILD_LOCK_DIR, 'owner.json');
const BUILD_LOCK_STALE_MS = 5 * 60 * 1000;
const BUILD_LOCK_TIMEOUT_MS = 30 * 1000;
const WINDOWS_REMOVE_RETRY_OPTIONS =
  process.platform === 'win32' ? { maxRetries: 30, retryDelay: 100 } : {};
let buildLockAcquired = false;
const NON_RUNTIME_DIRECTORY_NAMES = new Set([
  '__tests__',
  'test',
  'tests',
  'examples',
  'example',
  'fixtures',
  'fixture',
  'demo',
  'bench',
  'benchmark'
]);
const NON_RUNTIME_FILE_SEGMENT_PATTERN = /\.(test|spec)\./i;
const RUNTIME_PRUNED_DEPENDENCY_DIRECTORY_NAMES = new Set([
  '.github',
  '.nyc_output',
  'coverage',
]);
const RUNTIME_UNUSED_DEPENDENCY_FILE_PATTERN =
  /\.(map|d\.(?:ts|cts|mts)|c|cc|cpp|h|hpp|mk|gyp|tsbuildinfo)$/i;
const RUNTIME_UNUSED_MARKDOWN_PATTERN = /\.(md|markdown)$/i;
const RUNTIME_UNUSED_TSCONFIG_PATTERN = /^tsconfig(?:\..+)?\.json$/i;
const RUNTIME_PRESERVED_DOC_BASENAME_PATTERN = /^(license|licence|copying|notice)(\..+)?$/i;
const SHARED_TYPES_ONLY_SOURCE_PATTERN = /\.(ts|tsx|cts|mts)$/i;
const CURRENT_RUNTIME_PLATFORM = process.platform;
const CURRENT_RUNTIME_ARCH = process.arch;

const sleepSync = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const ensureExists = (targetPath, label) => {
  if (!fs.existsSync(targetPath)) {
    // eslint-disable-next-line no-console
    console.error(`[backend-runtime] Missing ${label}: ${targetPath}`);
    process.exit(1);
  }
};

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const copyPath = (sourcePath, destinationPath) => {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    force: true,
    dereference: true
  });
};

const removePathIfExists = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    ...WINDOWS_REMOVE_RETRY_OPTIONS
  });
};

const removeBuildLockDir = () => {
  removePathIfExists(BUILD_LOCK_DIR);
};

const isDirectoryEntryIgnoredForFreshness = (entryName) =>
  entryName === 'node_modules' ||
  entryName === 'dist' ||
  entryName === 'test' ||
  entryName === 'tests' ||
  entryName === 'reports' ||
  entryName === '.git' ||
  entryName === 'coverage';

const isBuildSourceFile = (filePath) => /\.(?:ts|tsx|cts|mts|json)$/i.test(filePath);
const isBuildOutputFile = (filePath) => /\.(?:js|cjs|mjs|json)$/i.test(filePath);

const readNewestFileMtimeMs = (rootPath, includeFile) => {
  if (!fs.existsSync(rootPath)) {
    return 0;
  }
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    return includeFile(rootPath) ? stat.mtimeMs : 0;
  }
  if (!stat.isDirectory()) {
    return 0;
  }
  let newestMtimeMs = 0;
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const childPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (isDirectoryEntryIgnoredForFreshness(entry.name)) {
        return;
      }
      newestMtimeMs = Math.max(
        newestMtimeMs,
        readNewestFileMtimeMs(childPath, includeFile)
      );
      return;
    }
    if (entry.isFile() && includeFile(childPath)) {
      newestMtimeMs = Math.max(newestMtimeMs, fs.statSync(childPath).mtimeMs);
    }
  });
  return newestMtimeMs;
};

const computeRootContentFingerprint = (rootPaths, includeFile) => {
  const hasher = crypto.createHash('sha256');
  const files = [];
  for (const rootPath of rootPaths) {
    if (!fs.existsSync(rootPath)) {
      continue;
    }
    const stat = fs.statSync(rootPath);
    if (stat.isFile()) {
      if (includeFile(rootPath)) {
        files.push(rootPath);
      }
      continue;
    }
    files.push(...collectFilesRecursive(rootPath));
  }
  files
    .filter((filePath) => includeFile(filePath))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .forEach((filePath) => {
      const relativePath = path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
      const fileStat = fs.statSync(filePath);
      const fileContentHash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
      hasher.update(relativePath);
      hasher.update(String(fileStat.size));
      hasher.update(fileContentHash);
    });
  return hasher.digest('hex');
};

const FRESHNESS_FINGERPRINT_PATH = path.join(GEN_ROOT, 'backend-runtime-freshness.json');

const readRecordedFreshnessFingerprint = (label) => {
  try {
    const raw = fs.readFileSync(FRESHNESS_FINGERPRINT_PATH, 'utf8').trim();
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const entry = parsed?.[label];
    if (
      entry &&
      typeof entry.sourceFingerprint === 'string' &&
      typeof entry.outputFingerprint === 'string'
    ) {
      return {
        sourceFingerprint: entry.sourceFingerprint,
        outputFingerprint: entry.outputFingerprint,
      };
    }
    return null;
  } catch {
    return null;
  }
};

const assertBuildOutputFresh = ({ label, outputDir, sourceRoots }) => {
  const recorded = readRecordedFreshnessFingerprint(label);
  const currentSourceFingerprint = computeRootContentFingerprint(
    sourceRoots,
    isBuildSourceFile,
  );
  const currentOutputFingerprint = computeRootContentFingerprint(
    [outputDir],
    isBuildOutputFile,
  );
  if (recorded) {
    if (currentOutputFingerprint !== recorded.outputFingerprint) {
      // The output bytes changed since the last successful prepare: a real
      // rebuild happened. mtime staleness alone (for example after a git
      // checkout bumps source mtimes) must not reject this bundle.
      return;
    }
    if (currentSourceFingerprint === recorded.sourceFingerprint) {
      // Nothing changed since the last successful prepare; the existing
      // bundle remains current.
      return;
    }
    // The output is byte-identical to the previous prepare while the sources
    // changed: no rebuild actually ran. mtime "freshness" alone is
    // insufficient here.
    // eslint-disable-next-line no-console
    console.error(
      [
        `[backend-runtime] Stale ${label}; refusing to copy old build output.`,
        'Run first: npm run desktop:bundle:prepare'
      ].join('\n')
    );
    process.exit(1);
  }
  const newestSourceMtimeMs = Math.max(
    ...sourceRoots.map((sourceRoot) => readNewestFileMtimeMs(sourceRoot, isBuildSourceFile))
  );
  const newestOutputMtimeMs = readNewestFileMtimeMs(outputDir, isBuildOutputFile);
  if (newestSourceMtimeMs <= 0 || newestOutputMtimeMs <= 0) {
    return;
  }
  if (newestOutputMtimeMs + 1000 >= newestSourceMtimeMs) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(
    [
      `[backend-runtime] Stale ${label}; refusing to copy old build output.`,
      'Run first: npm run desktop:bundle:prepare'
    ].join('\n')
  );
  process.exit(1);
};

const resolveDependencyKey = (relativeDependencyPath) => {
  const normalizedParts = String(relativeDependencyPath || '')
    .split('/')
    .filter(Boolean);
  if (normalizedParts.length === 0) {
    return '';
  }
  if (normalizedParts[0].startsWith('@') && normalizedParts.length >= 2) {
    return `${normalizedParts[0]}/${normalizedParts[1]}`;
  }
  return normalizedParts[0];
};

const readBuildLockOwnerPid = () => {
  try {
    const raw = fs.readFileSync(BUILD_LOCK_OWNER_PATH, 'utf8').trim();
    if (!raw) {
      return 0;
    }
    const parsed = JSON.parse(raw);
    const pid = Number.parseInt(String(parsed?.pid ?? ''), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
};

const isBuildLockStale = () => {
  const ownerPid = readBuildLockOwnerPid();
  if (ownerPid > 0) {
    return !isProcessAlive(ownerPid);
  }
  const stat = fs.statSync(BUILD_LOCK_DIR);
  return Date.now() - stat.mtimeMs >= BUILD_LOCK_STALE_MS;
};

const pruneNonRuntimeArtifacts = (rootPath) => {
  if (!fs.existsSync(rootPath)) {
    return;
  }
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (NON_RUNTIME_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
        removePathIfExists(entryPath);
        return;
      }
      pruneNonRuntimeArtifacts(entryPath);
      return;
    }
    if (entry.isFile() && NON_RUNTIME_FILE_SEGMENT_PATTERN.test(entry.name)) {
      removePathIfExists(entryPath);
    }
  });
};

const readJsonFile = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[backend-runtime] Failed to read ${label}: ${filePath} (${
        error instanceof Error ? error.message : 'unknown error'
      })`,
    );
    process.exit(1);
  }
};

const normalizePackageEntryPath = (entryPath) =>
  String(entryPath || '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/u, '')
    .replace(/\/+$/u, '')
    .trim();

const shouldIgnorePackageEntryCondition = (entryKey) => {
  const normalized = String(entryKey || '').toLowerCase();
  return (
    normalized === 'types' ||
    normalized === 'typings' ||
    normalized.includes('source')
  );
};

const collectPackageEntryPathStrings = (value, entryKey = '') => {
  if (typeof value === 'string') {
    return shouldIgnorePackageEntryCondition(entryKey)
      ? []
      : [normalizePackageEntryPath(value)].filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectPackageEntryPathStrings(entry, entryKey));
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    collectPackageEntryPathStrings(entry, key)
  );
};

const collectRuntimePackageEntryPaths = (packageRootPath) => {
  const packageJsonPath = path.join(packageRootPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }
  const packageEntry = readJsonFile(packageJsonPath, 'runtime dependency package.json');
  return [
    ...collectPackageEntryPathStrings(packageEntry?.main, 'main'),
    ...collectPackageEntryPathStrings(packageEntry?.module, 'module'),
    ...collectPackageEntryPathStrings(packageEntry?.browser, 'browser'),
    ...collectPackageEntryPathStrings(packageEntry?.bin, 'bin'),
    ...collectPackageEntryPathStrings(packageEntry?.exports, 'exports'),
    ...collectPackageEntryPathStrings(packageEntry?.imports, 'imports'),
  ];
};

const packageEntryPathsReferenceDirectory = (entryPaths, directoryName) =>
  entryPaths.some((entryPath) =>
    entryPath === directoryName ||
    entryPath.startsWith(`${directoryName}/`)
  );

const toLockPackageKey = (value) =>
  String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/u, '')
    .replace(/\/+$/u, '')
    .trim();

const resolveParentLockPackageKey = (packageKey) => {
  const normalized = toLockPackageKey(packageKey);
  if (!normalized) {
    return '';
  }
  const lastNodeModulesMarker = normalized.lastIndexOf('/node_modules/');
  if (lastNodeModulesMarker >= 0) {
    return normalized.slice(0, lastNodeModulesMarker);
  }
  if (normalized.startsWith('node_modules/')) {
    return '';
  }
  return '';
};

const collectRuntimeDependencySpecs = (packageEntry) => {
  const specsByName = new Map();
  const appendSpecs = (dependencyMap, optional) => {
    if (!dependencyMap || typeof dependencyMap !== 'object') {
      return;
    }
    Object.keys(dependencyMap).forEach((dependencyName) => {
      const normalizedDependencyName = String(dependencyName || '').trim();
      if (!normalizedDependencyName) {
        return;
      }
      const existing = specsByName.get(normalizedDependencyName);
      specsByName.set(normalizedDependencyName, {
        dependencyName: normalizedDependencyName,
        optional: existing ? Boolean(existing.optional) && optional : optional,
      });
    });
  };

  appendSpecs(packageEntry?.dependencies, false);
  appendSpecs(packageEntry?.optionalDependencies, true);

  if (packageEntry?.peerDependencies && typeof packageEntry.peerDependencies === 'object') {
    Object.keys(packageEntry.peerDependencies).forEach((dependencyName) => {
      const normalizedDependencyName = String(dependencyName || '').trim();
      if (!normalizedDependencyName) {
        return;
      }
      const optional = packageEntry?.peerDependenciesMeta?.[normalizedDependencyName]?.optional === true;
      if (optional) {
        return;
      }
      specsByName.set(normalizedDependencyName, {
        dependencyName: normalizedDependencyName,
        optional: false,
      });
    });
  }

  return Array.from(specsByName.values()).sort((left, right) =>
    left.dependencyName.localeCompare(right.dependencyName, 'en'),
  );
};

const resolveInstalledDependencyDescriptor = (packages, fromKey, dependencyName) => {
  const normalizedDependencyName = String(dependencyName || '').trim();
  if (!normalizedDependencyName) {
    return null;
  }
  let scope = toLockPackageKey(fromKey);
  const attempted = new Set();
  while (true) {
    const installKey = scope
      ? `${scope}/node_modules/${normalizedDependencyName}`
      : `node_modules/${normalizedDependencyName}`;
    if (!attempted.has(installKey)) {
      attempted.add(installKey);
      const installEntry = packages[installKey];
      if (installEntry) {
        const resolvedSourceKey = installEntry.link
          ? toLockPackageKey(installEntry.resolved || '')
          : installKey;
        return {
          installKey,
          sourceKey: resolvedSourceKey || installKey,
        };
      }
    }
    if (!scope) {
      return null;
    }
    scope = resolveParentLockPackageKey(scope);
  }
};

const resolveDependencySourcePath = (fromSourcePath, dependencyName) => {
  const normalizedDependencyName = String(dependencyName || '').trim();
  if (!normalizedDependencyName) {
    return null;
  }
  const rootPath = path.resolve(ROOT_DIR);
  let currentPath = path.resolve(fromSourcePath || ROOT_DIR);
  while (true) {
    const candidatePath = path.join(currentPath, 'node_modules', normalizedDependencyName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
    if (currentPath === rootPath) {
      return null;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
};

const formatDependencySourceResolutionMessage = ({
  dependencyName,
  fromKey,
  expectedSourceKey,
  expectedSourcePath,
}) =>
  [
    `[backend-runtime] Missing backend runtime dependency source "${dependencyName}" from "${fromKey}".`,
    `Expected lockfile source ${expectedSourceKey}: ${expectedSourcePath}`,
    'Run npm install at the repository root so workspace node_modules matches package-lock.json.',
  ].join('\n');

const packageConstraintMatchesCurrentRuntime = (constraints, currentValue) => {
  if (!Array.isArray(constraints) || constraints.length === 0) {
    return true;
  }
  const tokens = constraints
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (tokens.some((token) => token.startsWith('!') && token.slice(1) === currentValue)) {
    return false;
  }
  const allowTokens = tokens.filter((token) => !token.startsWith('!'));
  return allowTokens.length === 0 || allowTokens.includes(currentValue);
};

const isPackageEntryForCurrentRuntime = (packageEntry) =>
  packageConstraintMatchesCurrentRuntime(packageEntry?.os, CURRENT_RUNTIME_PLATFORM) &&
  packageConstraintMatchesCurrentRuntime(packageEntry?.cpu, CURRENT_RUNTIME_ARCH);

const listRuntimeDependencyRoots = () => {
  const lockfile = readJsonFile(ROOT_PACKAGE_LOCK_PATH, 'root package-lock.json');
  const packages = lockfile?.packages;
  if (!packages || typeof packages !== 'object') {
    // eslint-disable-next-line no-console
    console.error('[backend-runtime] package-lock.json is missing the packages map required for runtime dependency resolution.');
    process.exit(1);
  }
  const backendPackageEntry = packages[BACKEND_LOCKFILE_KEY];
  if (!backendPackageEntry || typeof backendPackageEntry !== 'object') {
    // eslint-disable-next-line no-console
    console.error(`[backend-runtime] package-lock.json is missing the ${BACKEND_LOCKFILE_KEY} workspace entry.`);
    process.exit(1);
  }

  const selectedDescriptors = [];
  const visitedInstallKeys = new Set();
  const pending = collectRuntimeDependencySpecs(backendPackageEntry).map((spec) => ({
    fromKey: BACKEND_LOCKFILE_KEY,
    fromSourcePath: BACKEND_DIR,
    ...spec,
  }));

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    const descriptor = resolveInstalledDependencyDescriptor(
      packages,
      current.fromKey,
      current.dependencyName,
    );
    if (!descriptor) {
      if (current.optional) {
        continue;
      }
      // eslint-disable-next-line no-console
      console.error(
        `[backend-runtime] Failed to resolve backend runtime dependency "${current.dependencyName}" from "${current.fromKey}".`,
      );
      process.exit(1);
    }
    if (visitedInstallKeys.has(descriptor.installKey)) {
      continue;
    }
    const sourceEntry = packages[descriptor.sourceKey];
    if (!sourceEntry || typeof sourceEntry !== 'object') {
      // eslint-disable-next-line no-console
      console.error(
        `[backend-runtime] package-lock.json is missing the source entry "${descriptor.sourceKey}" for "${descriptor.installKey}".`,
      );
      process.exit(1);
    }

    const expectedSourcePath = path.join(ROOT_DIR, descriptor.sourceKey);
    const sourcePath = resolveDependencySourcePath(
      current.fromSourcePath,
      current.dependencyName,
    ) || (fs.existsSync(expectedSourcePath) ? expectedSourcePath : null);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      if (current.optional && !isPackageEntryForCurrentRuntime(sourceEntry)) {
        continue;
      }
      // eslint-disable-next-line no-console
      console.error(
        formatDependencySourceResolutionMessage({
          dependencyName: current.dependencyName,
          fromKey: current.fromKey,
          expectedSourceKey: descriptor.sourceKey,
          expectedSourcePath,
        }),
      );
      process.exit(1);
    }
    visitedInstallKeys.add(descriptor.installKey);
    selectedDescriptors.push({
      ...descriptor,
      sourcePath,
    });
    collectRuntimeDependencySpecs(sourceEntry).forEach((spec) => {
      pending.push({
        fromKey: descriptor.installKey,
        fromSourcePath: sourcePath,
        ...spec,
      });
    });
  }

  return selectedDescriptors.map(({ installKey, sourcePath }) => ({
    destinationPath: path.join(OUTPUT_ROOT, installKey),
    sourcePath,
  }));
};

const collectFilesRecursive = (rootPath) => {
  const files = [];
  const pending = [rootPath];
  while (pending.length) {
    const currentPath = pending.pop();
    if (!currentPath || !fs.existsSync(currentPath)) {
      continue;
    }
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    entries
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .forEach((entry) => {
        const entryPath = path.join(currentPath, entry.name);
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

const buildRuntimeBuildId = (rootPath) => {
  const hasher = crypto.createHash('sha256');
  const files = collectFilesRecursive(rootPath);
  files.forEach((filePath) => {
    const relativePath = path.relative(rootPath, filePath).replaceAll(path.sep, '/');
    const stat = fs.statSync(filePath);
    const fileContentHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(filePath))
      .digest('hex');
    hasher.update(relativePath);
    hasher.update(String(stat.size));
    hasher.update(fileContentHash);
  });
  return `backend-bundle:${hasher.digest('hex').slice(0, 24)}:${files.length}`;
};

const pruneCopiedDependencyArtifacts = (destinationPath) => {
  const relativeDependencyPath = path.relative(OUTPUT_NODE_MODULES_DIR, destinationPath).replaceAll(path.sep, '/');
  const dependencyKey = resolveDependencyKey(relativeDependencyPath);
  const runtimeEntryPaths = collectRuntimePackageEntryPaths(destinationPath);

  const pending = [destinationPath];
  while (pending.length) {
    const currentPath = pending.pop();
    if (!currentPath || !fs.existsSync(currentPath)) {
      continue;
    }
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    entries.forEach((entry) => {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        const relativeEntryPath = path.relative(destinationPath, entryPath).replaceAll(path.sep, '/');
        const isTopLevelDependencyDirectory = !relativeEntryPath.includes('/');
        const lowerDirectoryName = entry.name.toLowerCase();
        const shouldRemoveSourceDirectory =
          isTopLevelDependencyDirectory &&
          lowerDirectoryName === 'src' &&
          !packageEntryPathsReferenceDirectory(runtimeEntryPaths, 'src');
        if (
          RUNTIME_PRUNED_DEPENDENCY_DIRECTORY_NAMES.has(lowerDirectoryName) ||
          shouldRemoveSourceDirectory
        ) {
          removePathIfExists(entryPath);
          return;
        }
        pending.push(entryPath);
        return;
      }
      if (!entry.isFile()) {
        return;
      }
      const lowerName = entry.name.toLowerCase();
      const shouldRemoveMarkdown =
        RUNTIME_UNUSED_MARKDOWN_PATTERN.test(entry.name) &&
        !RUNTIME_PRESERVED_DOC_BASENAME_PATTERN.test(lowerName);
      const shouldRemoveSharedTypesOnlySource =
        dependencyKey === '@zinuto/shared' && SHARED_TYPES_ONLY_SOURCE_PATTERN.test(entry.name);
      if (
        RUNTIME_UNUSED_DEPENDENCY_FILE_PATTERN.test(entry.name) ||
        RUNTIME_UNUSED_TSCONFIG_PATTERN.test(entry.name) ||
        shouldRemoveMarkdown ||
        shouldRemoveSharedTypesOnlySource
      ) {
        removePathIfExists(entryPath);
      }
    });
  }

  if (dependencyKey !== 'better-sqlite3') {
    return;
  }

  ensureExists(
    path.join(destinationPath, 'build', 'Release', 'better_sqlite3.node'),
    'better-sqlite3 runtime addon'
  );

  [
    'build/Release/test_extension.node',
    'build/Release/sqlite3.a',
    'build/Release/.deps',
    'build/test_extension.target.mk',
    'deps/test_extension.c'
  ].forEach((relativePath) => {
    removePathIfExists(path.join(destinationPath, relativePath));
  });
};

const acquireBuildLock = () => {
  const startedAt = Date.now();
  fs.mkdirSync(GEN_ROOT, { recursive: true });

  while (true) {
    try {
      fs.mkdirSync(BUILD_LOCK_DIR);
      buildLockAcquired = true;
      try {
        fs.writeFileSync(
          BUILD_LOCK_OWNER_PATH,
          JSON.stringify(
            {
              pid: process.pid,
              acquiredAtMs: Date.now()
            },
            null,
            2
          ),
          'utf8'
        );
      } catch (error) {
        buildLockAcquired = false;
        removeBuildLockDir();
        throw error;
      }
      return;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt >= BUILD_LOCK_TIMEOUT_MS) {
        throw new Error(
          `timed out waiting for backend runtime build lock: ${BUILD_LOCK_DIR}`
        );
      }
      try {
        if (isBuildLockStale()) {
          removeBuildLockDir();
          continue;
        }
      } catch {
        // Another process released the lock while we were checking.
      }
      sleepSync(200);
    }
  }
};

const releaseBuildLock = () => {
  if (!buildLockAcquired) {
    return;
  }
  buildLockAcquired = false;
  removeBuildLockDir();
};

process.on('exit', () => {
  releaseBuildLock();
});

ensureExists(BACKEND_DIST_DIR, 'backend dist output');
ensureExists(BACKEND_PACKAGE_JSON, 'backend package.json');
ensureExists(SHARED_DIST_DIR, 'shared dist output');
ensureExists(ROOT_PACKAGE_LOCK_PATH, 'root package-lock.json');
ensureExists(ROOT_NODE_MODULES_DIR, 'workspace node_modules');

assertBuildOutputFresh({
  label: 'shared dist output',
  outputDir: SHARED_DIST_DIR,
  sourceRoots: [
    SHARED_SRC_DIR,
    path.join(SHARED_SRC_DIR, 'i18n', 'messages')
  ]
});
assertBuildOutputFresh({
  label: 'backend dist output',
  outputDir: BACKEND_DIST_DIR,
  sourceRoots: [
    path.join(BACKEND_DIR, 'src'),
    BACKEND_PACKAGE_JSON
  ]
});

acquireBuildLock();

try {
  removePathIfExists(OUTPUT_ROOT);
  fs.mkdirSync(OUTPUT_BACKEND_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_NODE_MODULES_DIR, { recursive: true });

  copyPath(BACKEND_DIST_DIR, path.join(OUTPUT_BACKEND_DIR, 'dist'));
  copyPath(BACKEND_PACKAGE_JSON, path.join(OUTPUT_BACKEND_DIR, 'package.json'));
  pruneNonRuntimeArtifacts(OUTPUT_BACKEND_DIR);

  const runtimeDependencyRoots = listRuntimeDependencyRoots();
  runtimeDependencyRoots.forEach(({ sourcePath, destinationPath }) => {
    ensureExists(sourcePath, `backend runtime dependency source ${path.relative(ROOT_DIR, sourcePath)}`);
    copyPath(sourcePath, destinationPath);
    pruneNonRuntimeArtifacts(destinationPath);
    pruneCopiedDependencyArtifacts(destinationPath);
  });


  ensureExists(
    path.join(OUTPUT_NODE_MODULES_DIR, 'express'),
    'generated backend runtime dependency express'
  );

  const generatedBackendEntry = path.join(OUTPUT_BACKEND_DIR, 'dist', 'runtime', 'index.js');
  ensureExists(generatedBackendEntry, 'generated backend entry');

  fs.mkdirSync(GEN_ROOT, { recursive: true });
  const freshnessFingerprints = {
    'shared dist output': {
      sourceFingerprint: computeRootContentFingerprint(
        [SHARED_SRC_DIR, path.join(SHARED_SRC_DIR, 'i18n', 'messages')],
        isBuildSourceFile,
      ),
      outputFingerprint: computeRootContentFingerprint(
        [SHARED_DIST_DIR],
        isBuildOutputFile,
      ),
    },
    'backend dist output': {
      sourceFingerprint: computeRootContentFingerprint(
        [path.join(BACKEND_DIR, 'src'), BACKEND_PACKAGE_JSON],
        isBuildSourceFile,
      ),
      outputFingerprint: computeRootContentFingerprint(
        [BACKEND_DIST_DIR],
        isBuildOutputFile,
      ),
    },
  };
  fs.writeFileSync(
    FRESHNESS_FINGERPRINT_PATH,
    `${JSON.stringify(freshnessFingerprints, null, 2)}\n`,
    'utf8',
  );

  const runtimeManifestPathSets = buildRuntimeManifestPathSets(process.platform);
  fs.writeFileSync(
    OUTPUT_RUNTIME_MANIFEST_PATH,
    JSON.stringify(
      {
        version: 1,
        targetPlatform: resolveDesktopTargetPlatform(process.platform),
        runtimeBuildId: buildRuntimeBuildId(OUTPUT_ROOT),
        development: runtimeManifestPathSets.development,
        packaged: runtimeManifestPathSets.packaged,
      },
      null,
      2,
    ),
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log(
    `[backend-runtime] Prepared isolated backend runtime bundle at ${OUTPUT_ROOT} with ${runtimeDependencyRoots.length} dependency roots.`
  );
} finally {
  releaseBuildLock();
}
