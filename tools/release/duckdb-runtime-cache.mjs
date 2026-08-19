// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  loadDuckdbRuntimeAuthority,
  resolveDuckdbRuntimeDescriptor,
} from './duckdb-runtime-authority.mjs';
import {
  extractVerifiedRuntimeArchive,
  readVerifiedRuntimeArchive,
} from './native-runtime-archive.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CACHE_ROOT = path.join(ROOT_DIR, '.zinuto-local', 'dependencies', 'duckdb');
const IDENTITY_FILE_NAME = '.zinuto-duckdb-runtime.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const FINAL_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

const sha256Buffer = (content) => createHash('sha256').update(content).digest('hex');

const readFileNoFollow = (filePath, expectedBytes) => {
  const metadata = fs.lstatSync(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size !== expectedBytes) {
    throw new Error(`DuckDB runtime file shape mismatch: ${path.basename(filePath)}`);
  }
  const handle = fs.openSync(filePath, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fs.fstatSync(handle);
    if (!opened.isFile() || opened.size !== expectedBytes) {
      throw new Error(`DuckDB runtime file changed while opening: ${path.basename(filePath)}`);
    }
    const content = Buffer.allocUnsafe(expectedBytes);
    let offset = 0;
    while (offset < content.length) {
      const read = fs.readSync(handle, content, offset, content.length - offset, offset);
      if (read <= 0) throw new Error(`DuckDB runtime file ended early: ${path.basename(filePath)}`);
      offset += read;
    }
    return content;
  } finally {
    fs.closeSync(handle);
  }
};

const expectedIdentity = (descriptor) => ({
  schemaVersion: 1,
  authoritySha256: descriptor.authoritySha256,
  releaseVersion: descriptor.releaseVersion,
  targetId: descriptor.targetId,
  archiveSha256: descriptor.archiveSha256,
  libraryFileName: descriptor.libraryFileName,
  librarySha256: descriptor.files[descriptor.libraryFileName].sha256,
});

const readIdentity = (runtimeRoot) => {
  const identityPath = path.join(runtimeRoot, IDENTITY_FILE_NAME);
  const metadata = fs.lstatSync(identityPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 4096) {
    throw new Error('DuckDB runtime identity is not a bounded regular file');
  }
  return JSON.parse(readFileNoFollow(identityPath, metadata.size).toString('utf8'));
};

export const validateDuckdbRuntimeDirectory = ({
  runtimeRoot,
  descriptor,
  requireIdentity = true,
}) => {
  const root = path.resolve(runtimeRoot);
  const rootMetadata = fs.lstatSync(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error('DuckDB runtime root must be a no-follow directory');
  }
  const expectedNames = [
    ...Object.keys(descriptor.files),
    ...(requireIdentity ? [IDENTITY_FILE_NAME] : []),
  ].sort();
  const actualNames = fs.readdirSync(root).sort();
  if (actualNames.join('\0') !== expectedNames.join('\0')) {
    throw new Error('DuckDB runtime directory contains missing or unexpected entries');
  }
  for (const [fileName, expected] of Object.entries(descriptor.files)) {
    const content = readFileNoFollow(path.join(root, fileName), expected.bytes);
    if (sha256Buffer(content) !== expected.sha256) {
      throw new Error(`DuckDB runtime digest mismatch: ${fileName}`);
    }
  }
  const expected = expectedIdentity(descriptor);
  let identity = null;
  if (requireIdentity) {
    identity = readIdentity(root);
    if (
      Object.keys(identity).sort().join(',') !== Object.keys(expected).sort().join(',')
      || Object.entries(expected).some(([key, value]) => identity[key] !== value)
    ) {
      throw new Error('DuckDB runtime identity does not match authority');
    }
  }
  return Object.freeze({
    descriptor,
    identity,
    libraryPath: path.join(root, descriptor.libraryFileName),
    libraryRoot: root,
  });
};

const validateDownloadUrl = (descriptor) => {
  const url = new URL(descriptor.archiveUrl);
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== `/duckdb/duckdb/releases/download/v${descriptor.releaseVersion}/${descriptor.archiveFileName}`
  ) {
    throw new Error('DuckDB runtime download URL does not match authority');
  }
  return url;
};

export const downloadDuckdbRuntimeArchive = async ({
  descriptor,
  destinationPath,
  fetchImpl = globalThis.fetch,
}) => {
  const url = validateDownloadUrl(descriptor);
  const response = await fetchImpl(url, {
    headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  const finalUrl = new URL(response.url || url);
  if (
    !response.ok
    || finalUrl.protocol !== 'https:'
    || !FINAL_DOWNLOAD_HOSTS.has(finalUrl.hostname)
  ) {
    throw new Error(`DuckDB runtime download failed or redirected outside the trusted host set: HTTP ${response.status}`);
  }
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) !== descriptor.archiveBytes) {
    throw new Error('DuckDB runtime download content-length mismatch');
  }
  if (!response.body) throw new Error('DuckDB runtime download returned no body');
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    receivedBytes += bytes.length;
    if (receivedBytes > descriptor.archiveBytes) {
      throw new Error('DuckDB runtime download exceeded authority byte length');
    }
    chunks.push(bytes);
  }
  if (receivedBytes !== descriptor.archiveBytes) {
    throw new Error('DuckDB runtime download ended before authority byte length');
  }
  const archive = Buffer.concat(chunks, receivedBytes);
  try {
    if (sha256Buffer(archive) !== descriptor.archiveSha256) {
      throw new Error('DuckDB runtime download digest mismatch');
    }
    const handle = fs.openSync(
      destinationPath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | NOFOLLOW,
      0o600,
    );
    try {
      fs.writeFileSync(handle, archive);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  } finally {
    archive.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const writeIdentity = (runtimeRoot, descriptor) => {
  const identityPath = path.join(runtimeRoot, IDENTITY_FILE_NAME);
  fs.writeFileSync(identityPath, `${JSON.stringify(expectedIdentity(descriptor), null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
};

const ensureDirectory = (directory) => {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const metadata = fs.lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`DuckDB cache path is not a no-follow directory: ${directory}`);
  }
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
};

const managedCacheTarget = ({ cacheRoot, descriptor }) => path.join(
  path.resolve(cacheRoot),
  descriptor.targetId,
  `${descriptor.releaseVersion}-${descriptor.archiveSha256.slice(0, 16)}`,
);

export const ensureVerifiedDuckdbRuntime = async ({
  archivePath = '',
  authority = loadDuckdbRuntimeAuthority(),
  cacheRoot = process.env.ZINUTO_DUCKDB_CACHE_DIR || DEFAULT_CACHE_ROOT,
  externalLibraryRoot = process.env.DUCKDB_LIB_DIR || '',
  fetchImpl = globalThis.fetch,
  nodePlatform = process.platform,
  nodeArch = process.arch,
} = {}) => {
  const descriptor = resolveDuckdbRuntimeDescriptor({ authority, nodePlatform, nodeArch });
  if (externalLibraryRoot) {
    return validateDuckdbRuntimeDirectory({
      runtimeRoot: externalLibraryRoot,
      descriptor,
      requireIdentity: false,
    });
  }
  const target = managedCacheTarget({ cacheRoot, descriptor });
  try {
    return validateDuckdbRuntimeDirectory({ runtimeRoot: target, descriptor });
  } catch {
    // A missing or invalid cache is never used. Invalid state is quarantined below.
  }
  const targetParent = path.dirname(target);
  ensureDirectory(targetParent);
  if (fs.existsSync(target)) {
    const quarantine = `${target}.invalid-${randomUUID()}`;
    fs.renameSync(target, quarantine);
  }
  const staging = path.join(targetParent, `.staging-${randomUUID()}`);
  const runtimeStaging = path.join(staging, 'runtime');
  ensureDirectory(staging);
  fs.mkdirSync(runtimeStaging, { mode: 0o700 });
  const temporaryArchive = path.join(staging, descriptor.archiveFileName);
  try {
    const sourceArchive = archivePath ? path.resolve(archivePath) : temporaryArchive;
    if (!archivePath) {
      await downloadDuckdbRuntimeArchive({ descriptor, destinationPath: sourceArchive, fetchImpl });
    }
    const archive = readVerifiedRuntimeArchive({ archivePath: sourceArchive, descriptor });
    extractVerifiedRuntimeArchive({ archive, destinationRoot: runtimeStaging, descriptor });
    writeIdentity(runtimeStaging, descriptor);
    validateDuckdbRuntimeDirectory({ runtimeRoot: runtimeStaging, descriptor });
    fs.renameSync(runtimeStaging, target);
    return validateDuckdbRuntimeDirectory({ runtimeRoot: target, descriptor });
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: false });
  }
};

export const verifiedDuckdbCargoEnvironment = (runtime, environment = process.env) => {
  const libraryRoot = runtime.libraryRoot;
  const prepend = (name) => [libraryRoot, environment[name]].filter(Boolean).join(path.delimiter);
  return {
    ...environment,
    DUCKDB_DOWNLOAD_LIB: '0',
    DUCKDB_LIB_DIR: libraryRoot,
    ...(process.platform === 'darwin' ? { DYLD_LIBRARY_PATH: prepend('DYLD_LIBRARY_PATH') } : {}),
    ...(process.platform === 'linux' ? { LD_LIBRARY_PATH: prepend('LD_LIBRARY_PATH') } : {}),
    ...(process.platform === 'win32' ? { PATH: prepend('PATH') } : {}),
  };
};

export const defaultDuckdbCacheRoot = () => DEFAULT_CACHE_ROOT;
