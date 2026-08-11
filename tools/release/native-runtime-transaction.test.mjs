// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  extractVerifiedRuntimeArchive,
  isPrivateRuntimeStagingDirectory,
  readVerifiedRuntimeArchive,
} from './native-runtime-archive.mjs';
import {
  attestTrustedRuntimeDirectory,
  computeRuntimeTreeDigest,
  extractCanonicalRuntimeTree,
  installVerifiedRuntimeArchive,
  RUNTIME_IDENTITY_NAME,
  RUNTIME_INSTALL_FAULT_POINTS,
  validateRuntimeDirectory,
} from './native-runtime-transaction.mjs';

const ROOT_NAME = 'node-v24.18.0-darwin-arm64';
const WIN_ROOT_NAME = 'node-v24.18.0-win-x64';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const octal = (value, width) => `${value.toString(8).padStart(width - 1, '0')}\0`;

const tarHeader = ({ name, type = '0', content = Buffer.alloc(0), mode = 0o644, linkName = '' }) => {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii');
  header.write(octal(0, 8), 116, 8, 'ascii');
  header.write(octal(content.length, 12), 124, 12, 'ascii');
  header.write(octal(0, 12), 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write(linkName, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
};

const buildTarGz = (extraEntries = [], nodeScript = '#!/bin/sh\necho v24.18.0\n') => {
  const entries = [
    { name: ROOT_NAME, type: '5', mode: 0o755 },
    { name: `${ROOT_NAME}/bin`, type: '5', mode: 0o755 },
    { name: `${ROOT_NAME}/lib`, type: '5', mode: 0o755 },
    { name: `${ROOT_NAME}/bin/node`, content: Buffer.from(nodeScript), mode: 0o755 },
    ...extraEntries,
  ];
  const blocks = [];
  for (const entry of entries) {
    const content = entry.content ?? Buffer.alloc(0);
    blocks.push(tarHeader({ ...entry, content }));
    if (content.length > 0) {
      blocks.push(content);
      const padding = (512 - (content.length % 512)) % 512;
      if (padding) blocks.push(Buffer.alloc(padding));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
};

const descriptorFor = (archive) => ({
  archiveBytes: archive.length,
  archiveFileName: `${ROOT_NAME}.tar.gz`,
  archiveSha256: sha256(archive),
  archiveType: 'tar.gz',
  maxEntries: 100,
  maxUnpackedBytes: 1024 * 1024,
  releaseVersion: '24.18.0',
  signerFingerprint: 'C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C',
  targetId: 'darwin-arm64',
  treeSha256: '458da6d9732c00131bbf3b0af1c77d487011919a95f44949dc528f976d8e2fed',
});

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

const buildZip = (extraEntries = []) => {
  const entries = [
    { name: `${WIN_ROOT_NAME}/`, content: Buffer.alloc(0), mode: 0o040755, directory: true },
    { name: `${WIN_ROOT_NAME}/node.exe`, content: Buffer.from('safe-node'), mode: 0o100755 },
    ...extraEntries,
  ];
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = entry.content ?? Buffer.alloc(0);
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
    central.writeUInt32LE((entry.mode * 0x10000 + (entry.directory ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
  }
  const locals = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(locals.length, 16);
  return Buffer.concat([locals, centralDirectory, eocd]);
};

const zipDescriptorFor = (archive) => ({
  ...descriptorFor(archive),
  archiveFileName: `${WIN_ROOT_NAME}.zip`,
  archiveType: 'zip',
  targetId: 'win32-x64',
});

const withTemp = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-runtime-test-'));
  fs.chmodSync(root, 0o700);
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('private native-runtime staging validation uses Windows ACL semantics', () => {
  const directory = {
    mode: 0o777,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  };
  assert.equal(isPrivateRuntimeStagingDirectory({ metadata: directory, platform: 'win32' }), true);
  assert.equal(isPrivateRuntimeStagingDirectory({ metadata: directory, platform: 'linux' }), false);
  assert.equal(isPrivateRuntimeStagingDirectory({
    metadata: { ...directory, mode: 0o700 },
    platform: 'linux',
  }), true);
  assert.equal(isPrivateRuntimeStagingDirectory({
    metadata: { ...directory, isSymbolicLink: () => true },
    platform: 'win32',
  }), false);
});

const writeArchive = (root, name, archive) => {
  const archivePath = path.join(root, name);
  fs.writeFileSync(archivePath, archive, { flag: 'wx', mode: 0o600 });
  return archivePath;
};

test('verified archive rejects a malicious same-version cache before runtime execution', () => withTemp((root) => {
  const reviewed = buildTarGz([], '#!/bin/sh\necho v24.18.0\n');
  const malicious = buildTarGz([], '#!/bin/sh\necho v24.18.0; touch /tmp/pwn\n');
  const descriptor = descriptorFor(reviewed);
  descriptor.archiveBytes = malicious.length;
  const archivePath = writeArchive(root, 'same-version-cache.tar.gz', malicious);
  let probes = 0;
  assert.throws(
    () => installVerifiedRuntimeArchive({
      archivePath,
      descriptor,
      runtimeRoot: path.join(root, 'node'),
      runVersion: () => { probes += 1; return '24.18.0'; },
    }),
    /digest mismatch/u,
  );
  assert.equal(probes, 0);
  assert.equal(fs.existsSync(path.join(root, 'node')), false);
}));

test('installer creates a missing parent but never follows a symbolic parent', () => withTemp((root) => {
  const archive = buildTarGz();
  const descriptor = descriptorFor(archive);
  const archivePath = writeArchive(root, 'runtime.tar.gz', archive);
  const runtimeParent = path.join(root, 'runtime');
  const runtimeRoot = path.join(runtimeParent, 'node');

  installVerifiedRuntimeArchive({
    archivePath,
    descriptor,
    runtimeRoot,
    runVersion: () => '24.18.0',
  });
  assert.equal(fs.lstatSync(runtimeParent).isDirectory(), true);
  assert.equal(validateRuntimeDirectory({ runtimeRoot, descriptor, runVersion: () => '24.18.0' }).identity.releaseVersion, '24.18.0');

  const external = path.join(root, 'external');
  const symbolicParent = path.join(root, 'symbolic-runtime');
  fs.mkdirSync(external, { mode: 0o700 });
  fs.symlinkSync(external, symbolicParent);
  assert.throws(
    () => installVerifiedRuntimeArchive({
      archivePath,
      descriptor,
      runtimeRoot: path.join(symbolicParent, 'node'),
      runVersion: () => '24.18.0',
    }),
    /native runtime parent must be a no-follow directory/u,
  );
  assert.deepEqual(fs.readdirSync(external), []);
}));

test('archive input itself must be a no-follow regular file', () => withTemp((root) => {
  const archive = buildTarGz();
  const descriptor = descriptorFor(archive);
  const realPath = writeArchive(root, 'real.tar.gz', archive);
  const linkPath = path.join(root, 'cache.tar.gz');
  fs.symlinkSync(realPath, linkPath);
  assert.throws(
    () => readVerifiedRuntimeArchive({ archivePath: linkPath, descriptor }),
    /no-follow regular file/u,
  );
}));

test('known upstream wrapper links are replaced by canonical regular files', () => withTemp((root) => {
  const archive = buildTarGz([
    {
      name: `${ROOT_NAME}/lib/node_modules/npm/bin/npm-cli.js`,
      content: Buffer.from('console.log("npm");\n'),
    },
    {
      name: `${ROOT_NAME}/bin/npm`,
      type: '2',
      linkName: '../lib/node_modules/npm/bin/npm-cli.js',
    },
  ]);
  const archivePath = writeArchive(root, 'runtime-with-wrapper.tar.gz', archive);
  const destinationRoot = path.join(root, 'staging');
  fs.mkdirSync(destinationRoot, { mode: 0o700 });
  extractCanonicalRuntimeTree({
    archivePath,
    descriptor: descriptorFor(archive),
    destinationRoot,
  });
  const wrapperPath = path.join(destinationRoot, 'bin', 'npm');
  const metadata = fs.lstatSync(wrapperPath);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.isFile(), true);
  assert.equal(
    fs.readFileSync(wrapperPath, 'utf8'),
    "#!/usr/bin/env node\nrequire('../lib/node_modules/npm/bin/npm-cli.js');\n",
  );
}));

test('an identity-free exact trusted tree is attested before its first version probe', () => withTemp((root) => {
  const archive = buildTarGz();
  const descriptor = descriptorFor(archive);
  const archivePath = writeArchive(root, 'trusted-legacy-runtime.tar.gz', archive);
  const runtimeRoot = path.join(root, 'node');
  fs.mkdirSync(runtimeRoot, { mode: 0o700 });
  extractCanonicalRuntimeTree({ archivePath, descriptor, destinationRoot: runtimeRoot });
  let probes = 0;
  const result = attestTrustedRuntimeDirectory({
    runtimeRoot,
    descriptor,
    runVersion: () => { probes += 1; return '24.18.0'; },
  });
  assert.equal(probes, 1);
  assert.equal(result.identity.treeSha256, descriptor.treeSha256);
  assert.equal(fs.lstatSync(path.join(runtimeRoot, RUNTIME_IDENTITY_NAME)).isFile(), true);
}));

test('attestation never writes or executes for a mismatched tree or forged identity', () => {
  withTemp((root) => {
    const archive = buildTarGz();
    const descriptor = descriptorFor(archive);
    const archivePath = writeArchive(root, 'mismatched-runtime.tar.gz', archive);
    const runtimeRoot = path.join(root, 'node');
    fs.mkdirSync(runtimeRoot, { mode: 0o700 });
    extractCanonicalRuntimeTree({ archivePath, descriptor, destinationRoot: runtimeRoot });
    fs.appendFileSync(path.join(runtimeRoot, 'bin', 'node'), '# mismatch\n');
    let probes = 0;
    assert.throws(
      () => attestTrustedRuntimeDirectory({
        runtimeRoot,
        descriptor,
        runVersion: () => { probes += 1; return '24.18.0'; },
      }),
      /does not match trusted authority/u,
    );
    assert.equal(probes, 0);
    assert.equal(fs.existsSync(path.join(runtimeRoot, RUNTIME_IDENTITY_NAME)), false);
  });

  withTemp((root) => {
    const archive = buildTarGz();
    const descriptor = descriptorFor(archive);
    const archivePath = writeArchive(root, 'forged-identity-runtime.tar.gz', archive);
    const runtimeRoot = path.join(root, 'node');
    fs.mkdirSync(runtimeRoot, { mode: 0o700 });
    extractCanonicalRuntimeTree({ archivePath, descriptor, destinationRoot: runtimeRoot });
    const identityPath = path.join(runtimeRoot, RUNTIME_IDENTITY_NAME);
    const forged = {
      schemaVersion: 1,
      releaseVersion: descriptor.releaseVersion,
      targetId: descriptor.targetId,
      archiveSha256: '0'.repeat(64),
      signerFingerprint: descriptor.signerFingerprint,
      treeSha256: descriptor.treeSha256,
    };
    const forgedBytes = `${JSON.stringify(forged, null, 2)}\n`;
    fs.writeFileSync(identityPath, forgedBytes, { flag: 'wx', mode: 0o600 });
    let probes = 0;
    assert.throws(
      () => attestTrustedRuntimeDirectory({
        runtimeRoot,
        descriptor,
        runVersion: () => { probes += 1; return '24.18.0'; },
      }),
      /identity mismatch: archiveSha256/u,
    );
    assert.equal(probes, 0);
    assert.equal(fs.readFileSync(identityPath, 'utf8'), forgedBytes);
  });
});

test('legacy and post-install tampered runtimes are rejected before version execution', () => withTemp((root) => {
  const runtimeRoot = path.join(root, 'node');
  fs.mkdirSync(path.join(runtimeRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'bin', 'node'), '#!/bin/sh\necho v24.18.0\n', { mode: 0o755 });
  const archive = buildTarGz();
  const descriptor = descriptorFor(archive);
  let probes = 0;
  assert.throws(
    () => validateRuntimeDirectory({
      runtimeRoot,
      descriptor,
      runVersion: () => { probes += 1; return '24.18.0'; },
    }),
    /identity/u,
  );
  assert.equal(probes, 0);

  fs.rmSync(runtimeRoot, { recursive: true });
  const archivePath = writeArchive(root, 'reviewed.tar.gz', archive);
  installVerifiedRuntimeArchive({
    archivePath,
    descriptor,
    runtimeRoot,
    runVersion: () => '24.18.0',
  });
  fs.appendFileSync(path.join(runtimeRoot, 'bin', 'node'), '# tampered\n');
  assert.throws(
    () => validateRuntimeDirectory({
      runtimeRoot,
      descriptor,
      runVersion: () => { probes += 1; return '24.18.0'; },
    }),
    /does not match trusted authority/u,
  );
  assert.equal(probes, 0);
}));

test('tampered runtime cannot become trusted by recomputing its local identity', () => withTemp((root) => {
  const runtimeRoot = path.join(root, 'node');
  const archive = buildTarGz();
  const descriptor = descriptorFor(archive);
  const archivePath = writeArchive(root, 'reviewed.tar.gz', archive);
  installVerifiedRuntimeArchive({
    archivePath,
    descriptor,
    runtimeRoot,
    runVersion: () => '24.18.0',
  });

  fs.appendFileSync(path.join(runtimeRoot, 'bin', 'node'), '# malicious replacement\n');
  const identityPath = path.join(runtimeRoot, RUNTIME_IDENTITY_NAME);
  const forgedIdentity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  forgedIdentity.treeSha256 = computeRuntimeTreeDigest(runtimeRoot);
  fs.writeFileSync(identityPath, `${JSON.stringify(forgedIdentity, null, 2)}\n`, 'utf8');

  let probes = 0;
  assert.throws(
    () => validateRuntimeDirectory({
      runtimeRoot,
      descriptor,
      runVersion: () => { probes += 1; return '24.18.0'; },
    }),
    /does not match trusted authority/u,
  );
  assert.equal(probes, 0);
}));

test('safe tar extraction rejects traversal, link, hardlink, and special entries', () => {
  const cases = [
    { entry: { name: `${ROOT_NAME}/../escape`, content: Buffer.from('x') }, pattern: /unsafe archive entry path/u },
    { entry: { name: `${ROOT_NAME}/bin/evil-link`, type: '2', linkName: '../../escape' }, pattern: /link entry is forbidden/u },
    { entry: { name: `${ROOT_NAME}/bin/evil-hardlink`, type: '1', linkName: `${ROOT_NAME}/bin/node` }, pattern: /link or special entry is forbidden/u },
    { entry: { name: `${ROOT_NAME}/bin/evil-device`, type: '3' }, pattern: /link or special entry is forbidden/u },
    { entry: { name: `${ROOT_NAME}/bin/evil-fifo`, type: '6' }, pattern: /link or special entry is forbidden/u },
  ];
  for (const { entry, pattern } of cases) {
    withTemp((root) => {
      const archive = buildTarGz([entry]);
      assert.throws(
        () => extractVerifiedRuntimeArchive({
          archive,
          destinationRoot: root,
          descriptor: descriptorFor(archive),
        }),
        pattern,
      );
      assert.equal(fs.existsSync(path.join(root, 'escape')), false);
    });
  }
});

test('safe zip extraction rejects traversal, symlink, and special Unix file types', () => {
  const cases = [
    { entry: { name: `${WIN_ROOT_NAME}/../escape`, content: Buffer.from('x'), mode: 0o100644 }, pattern: /unsafe archive entry path/u },
    { entry: { name: `${WIN_ROOT_NAME}/evil-link`, content: Buffer.from('../node.exe'), mode: 0o120777 }, pattern: /link entry is forbidden/u },
    { entry: { name: `${WIN_ROOT_NAME}/evil-fifo`, content: Buffer.alloc(0), mode: 0o010644 }, pattern: /special entry is forbidden/u },
  ];
  for (const { entry, pattern } of cases) {
    withTemp((root) => {
      const archive = buildZip([entry]);
      assert.throws(
        () => extractVerifiedRuntimeArchive({
          archive,
          destinationRoot: root,
          descriptor: zipDescriptorFor(archive),
        }),
        pattern,
      );
    });
  }
});

test('safe zip extraction rejects directory payloads and cumulative byte-budget overflow', () => {
  withTemp((root) => {
    const archive = buildZip([
      {
        name: `${WIN_ROOT_NAME}/payload-directory/`,
        content: Buffer.from('x'),
        mode: 0o040755,
        directory: true,
      },
    ]);
    assert.throws(
      () => extractVerifiedRuntimeArchive({
        archive,
        destinationRoot: root,
        descriptor: zipDescriptorFor(archive),
      }),
      /zip directory has content/u,
    );
    assert.equal(fs.existsSync(path.join(root, 'payload-directory')), false);
  });

  withTemp((root) => {
    const archive = buildZip([
      { name: `${WIN_ROOT_NAME}/first.dat`, content: Buffer.from('a'), mode: 0o100644 },
      { name: `${WIN_ROOT_NAME}/second.dat`, content: Buffer.from('b'), mode: 0o100644 },
    ]);
    assert.throws(
      () => extractVerifiedRuntimeArchive({
        archive,
        destinationRoot: root,
        descriptor: {
          ...zipDescriptorFor(archive),
          maxUnpackedBytes: Buffer.byteLength('safe-node') + 1,
        },
      }),
      /exceeds unpacked byte limit/u,
    );
    assert.equal(fs.existsSync(path.join(root, 'second.dat')), false);
  });
});

test('every staged-copy and swap fault leaves current and LKG identities runnable', () => {
  assert.deepEqual(RUNTIME_INSTALL_FAULT_POINTS, [
    'after-copy-entry',
    'after-stage-extract',
    'after-stage-validate',
    'after-lkg-copy-entry',
    'after-lkg-validate',
    'after-old-lkg-to-reserve',
    'after-new-lkg-installed',
    'after-current-to-previous',
    'after-staging-to-current',
    'after-current-post-validate',
  ]);
  for (const faultPoint of RUNTIME_INSTALL_FAULT_POINTS) {
    withTemp((root) => {
      const archive = buildTarGz();
      const descriptor = descriptorFor(archive);
      const archivePath = writeArchive(root, 'runtime.tar.gz', archive);
      const runtimeRoot = path.join(root, 'node');
      installVerifiedRuntimeArchive({ archivePath, descriptor, runtimeRoot });
      installVerifiedRuntimeArchive({ archivePath, descriptor, runtimeRoot });
      let injected = false;
      assert.throws(
        () => installVerifiedRuntimeArchive({
          archivePath,
          descriptor,
          runtimeRoot,
          onFault: (point) => {
            if (!injected && point === faultPoint) {
              injected = true;
              throw new Error(`injected ${point}`);
            }
          },
        }),
        new RegExp(`injected ${faultPoint}`, 'u'),
      );
      assert.equal(injected, true, `fault point was not reached: ${faultPoint}`);
      assert.equal(validateRuntimeDirectory({ runtimeRoot, descriptor }).identity.releaseVersion, '24.18.0');
      assert.equal(
        validateRuntimeDirectory({ runtimeRoot: `${runtimeRoot}.lkg`, descriptor }).identity.releaseVersion,
        '24.18.0',
      );
    });
  }
});
