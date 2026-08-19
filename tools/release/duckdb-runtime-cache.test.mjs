// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  downloadDuckdbRuntimeArchive,
  ensureVerifiedDuckdbRuntime,
  validateDuckdbRuntimeDirectory,
} from './duckdb-runtime-cache.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const crcTable = Array.from({ length: 256 }, (_, initial) => {
  let value = initial;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (content) => {
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZip = (entries) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
  }
  const locals = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, central, eocd]);
};

const withTemp = async (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-duckdb-runtime-test-'));
  fs.chmodSync(root, 0o700);
  try {
    await callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const fixture = () => {
  const library = Buffer.from('reviewed-duckdb-library');
  const archive = buildZip([{ name: 'libduckdb.dylib', content: library }]);
  const descriptor = {
    archiveBytes: archive.length,
    archiveFileName: 'libduckdb-osx-universal.zip',
    archiveSha256: sha256(archive),
    files: {
      'libduckdb.dylib': { bytes: library.length, sha256: sha256(library) },
    },
    libraryFileName: 'libduckdb.dylib',
    rustTarget: 'aarch64-apple-darwin',
  };
  const authority = {
    authoritySha256: 'a'.repeat(64),
    releaseVersion: '1.5.3',
    sourceOrigin: 'https://github.com/duckdb/duckdb',
    platforms: { 'darwin-arm64': descriptor },
  };
  return { archive, authority, descriptor, library };
};

test('DuckDB cache installs a rootless reviewed archive and quarantines a poisoned cache', async () => withTemp(async (root) => {
  const { archive, authority } = fixture();
  const archivePath = path.join(root, 'duckdb.zip');
  fs.writeFileSync(archivePath, archive);
  const cacheRoot = path.join(root, 'cache');
  const installed = await ensureVerifiedDuckdbRuntime({
    archivePath,
    authority,
    cacheRoot,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });
  assert.equal(fs.readFileSync(installed.libraryPath, 'utf8'), 'reviewed-duckdb-library');
  fs.writeFileSync(installed.libraryPath, 'poisoned');
  const recovered = await ensureVerifiedDuckdbRuntime({
    archivePath,
    authority,
    cacheRoot,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });
  assert.equal(fs.readFileSync(recovered.libraryPath, 'utf8'), 'reviewed-duckdb-library');
  assert.equal(
    fs.readdirSync(path.dirname(recovered.libraryRoot)).some((name) => name.includes('.invalid-')),
    true,
  );
}));

test('DuckDB external runtime validation rejects extra files and digest drift', async () => withTemp(async (root) => {
  const { authority, library } = fixture();
  const descriptor = {
    ...authority.platforms['darwin-arm64'],
    authoritySha256: authority.authoritySha256,
    releaseVersion: authority.releaseVersion,
    targetId: 'darwin-arm64',
  };
  fs.writeFileSync(path.join(root, 'libduckdb.dylib'), library);
  assert.doesNotThrow(() => validateDuckdbRuntimeDirectory({
    runtimeRoot: root,
    descriptor,
    requireIdentity: false,
  }));
  fs.writeFileSync(path.join(root, 'unexpected'), 'x');
  assert.throws(
    () => validateDuckdbRuntimeDirectory({ runtimeRoot: root, descriptor, requireIdentity: false }),
    /unexpected entries/u,
  );
}));

test('DuckDB download requires the authority digest even after a trusted redirect', async () => withTemp(async (root) => {
  const { archive, authority } = fixture();
  const descriptor = {
    ...authority.platforms['darwin-arm64'],
    archiveUrl: 'https://github.com/duckdb/duckdb/releases/download/v1.5.3/libduckdb-osx-universal.zip',
    releaseVersion: '1.5.3',
  };
  const response = new Response(Buffer.from(archive), {
    status: 200,
    headers: { 'content-length': String(archive.length) },
  });
  Object.defineProperty(response, 'url', { value: 'https://release-assets.githubusercontent.com/reviewed' });
  descriptor.archiveSha256 = '0'.repeat(64);
  await assert.rejects(
    downloadDuckdbRuntimeArchive({
      descriptor,
      destinationPath: path.join(root, 'download.zip'),
      fetchImpl: async () => response,
    }),
    /digest mismatch/u,
  );
}));

test('rootless DuckDB archives cannot traverse the staging directory', async () => withTemp(async (root) => {
  const { authority } = fixture();
  const archive = buildZip([{ name: '../escape', content: Buffer.from('x') }]);
  const archivePath = path.join(root, 'escape.zip');
  fs.writeFileSync(archivePath, archive);
  authority.platforms['darwin-arm64'] = {
    ...authority.platforms['darwin-arm64'],
    archiveBytes: archive.length,
    archiveSha256: sha256(archive),
  };
  await assert.rejects(
    ensureVerifiedDuckdbRuntime({
      archivePath,
      authority,
      cacheRoot: path.join(root, 'cache'),
      nodePlatform: 'darwin',
      nodeArch: 'arm64',
    }),
    /unsafe archive entry path/u,
  );
  assert.equal(fs.existsSync(path.join(root, 'escape')), false);
}));
