// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DUCKDB_RUNTIME_AUTHORITY_PATH = path.join(
  ROOT_DIR,
  'config',
  'open-source',
  'duckdb-native-runtime.v1.json',
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/u;
const EXPECTED_SOURCE_ORIGIN = 'https://github.com/duckdb/duckdb';
const EXPECTED_TARGET_IDS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

export const verifyDuckdbRuntimeAuthority = (authority, { authoritySha256 = '' } = {}) => {
  if (
    !authority
    || authority.schemaVersion !== 1
    || authority.sourceOrigin !== EXPECTED_SOURCE_ORIGIN
    || !/^\d+\.\d+\.\d+$/u.test(String(authority.releaseVersion ?? ''))
    || !/^\d+\.\d+\.\d+$/u.test(String(authority.crateVersion ?? ''))
  ) {
    throw new Error('DuckDB runtime authority schema, source, or version is invalid');
  }
  const targetIds = Object.keys(authority.platforms ?? {}).sort();
  if (targetIds.join(',') !== EXPECTED_TARGET_IDS.join(',')) {
    throw new Error('DuckDB runtime authority must cover exactly the supported targets');
  }
  for (const [targetId, descriptor] of Object.entries(authority.platforms)) {
    const files = descriptor?.files;
    if (
      !/^(darwin|linux|win32)-(arm64|x64)$/u.test(targetId)
      || !/^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)+$/u.test(String(descriptor?.rustTarget ?? ''))
      || !SAFE_FILE_NAME_PATTERN.test(String(descriptor?.archiveFileName ?? ''))
      || !descriptor.archiveFileName.endsWith('.zip')
      || !Number.isSafeInteger(descriptor.archiveBytes)
      || descriptor.archiveBytes < 1
      || !SHA256_PATTERN.test(String(descriptor.archiveSha256 ?? ''))
      || !SAFE_FILE_NAME_PATTERN.test(String(descriptor.libraryFileName ?? ''))
      || !files
      || typeof files !== 'object'
      || Array.isArray(files)
      || !Object.hasOwn(files, descriptor.libraryFileName)
    ) {
      throw new Error(`DuckDB runtime descriptor is invalid: ${targetId}`);
    }
    for (const [fileName, file] of Object.entries(files)) {
      if (
        !SAFE_FILE_NAME_PATTERN.test(fileName)
        || !Number.isSafeInteger(file?.bytes)
        || file.bytes < 1
        || !SHA256_PATTERN.test(String(file?.sha256 ?? ''))
      ) {
        throw new Error(`DuckDB runtime file authority is invalid: ${targetId}/${fileName}`);
      }
    }
  }
  return Object.freeze({ ...authority, authoritySha256 });
};

export const loadDuckdbRuntimeAuthority = (
  authorityPath = DUCKDB_RUNTIME_AUTHORITY_PATH,
) => {
  const content = fs.readFileSync(authorityPath);
  return verifyDuckdbRuntimeAuthority(JSON.parse(content.toString('utf8')), {
    authoritySha256: sha256(content),
  });
};

export const resolveDuckdbRuntimeDescriptor = ({
  authority = loadDuckdbRuntimeAuthority(),
  nodePlatform = process.platform,
  nodeArch = process.arch,
} = {}) => {
  const targetId = `${nodePlatform}-${nodeArch}`;
  const descriptor = authority.platforms[targetId];
  if (!descriptor) throw new Error(`Unsupported DuckDB runtime target: ${targetId}`);
  return Object.freeze({
    ...descriptor,
    archiveLayout: 'rootless',
    archiveType: 'zip',
    archiveUrl: `${authority.sourceOrigin}/releases/download/v${authority.releaseVersion}/${descriptor.archiveFileName}`,
    authoritySha256: authority.authoritySha256,
    maxEntries: Object.keys(descriptor.files).length,
    maxUnpackedBytes: Object.values(descriptor.files)
      .reduce((total, file) => total + file.bytes, 0),
    releaseVersion: authority.releaseVersion,
    targetId,
  });
};
