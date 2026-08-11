// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  extractVerifiedRuntimeArchive,
  readVerifiedRuntimeArchive,
} from './native-runtime-archive.mjs';

export const RUNTIME_IDENTITY_NAME = '.zinuto-runtime-identity.json';
export const RUNTIME_INSTALL_FAULT_POINTS = Object.freeze([
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
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const WRAPPERS = [
  ['npm', '../lib/node_modules/npm/bin/npm-cli.js'],
  ['npx', '../lib/node_modules/npm/bin/npx-cli.js'],
  ['corepack', '../lib/node_modules/corepack/dist/corepack.js'],
];
const comparePortablePath = (left, right) => Buffer.compare(
  Buffer.from(left, 'utf8'),
  Buffer.from(right, 'utf8'),
);

const isInside = (parent, candidate) => candidate.startsWith(`${parent}${path.sep}`);

const assertManagedPath = (parent, candidate, prefix) => {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  if (!isInside(resolvedParent, resolvedCandidate) || !path.basename(resolvedCandidate).startsWith(prefix)) {
    throw new Error(`refusing unmanaged native runtime transaction path: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
};

const listTree = (runtimeRoot) => {
  const root = path.resolve(runtimeRoot);
  const rootMetadata = fs.lstatSync(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`native runtime root is not a no-follow directory: ${root}`);
  }
  const entries = [];
  const pending = [''];
  while (pending.length > 0) {
    const relativeDirectory = pending.pop();
    const directory = path.join(root, relativeDirectory);
    const children = fs.readdirSync(directory).sort(comparePortablePath);
    for (const name of children) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      if (relativePath === RUNTIME_IDENTITY_NAME) continue;
      const entryPath = path.join(root, ...relativePath.split('/'));
      const metadata = fs.lstatSync(entryPath);
      if (metadata.isSymbolicLink()) throw new Error(`native runtime contains a symbolic link: ${relativePath}`);
      if (metadata.isDirectory()) {
        entries.push({ kind: 'directory', mode: metadata.mode & 0o777, relativePath });
        pending.push(relativePath);
      } else if (metadata.isFile()) {
        entries.push({ kind: 'file', mode: metadata.mode & 0o777, relativePath, size: metadata.size });
      } else {
        throw new Error(`native runtime contains a special entry: ${relativePath}`);
      }
    }
  }
  return entries.sort((left, right) => comparePortablePath(left.relativePath, right.relativePath));
};

const readFileNoFollow = (filePath, expectedSize) => {
  const handle = fs.openSync(filePath, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const metadata = fs.fstatSync(handle);
    if (!metadata.isFile() || metadata.size !== expectedSize) {
      throw new Error(`native runtime file changed while opening: ${filePath}`);
    }
    const content = Buffer.allocUnsafe(metadata.size);
    let offset = 0;
    while (offset < content.length) {
      const read = fs.readSync(handle, content, offset, content.length - offset, offset);
      if (read <= 0) throw new Error(`native runtime file ended early: ${filePath}`);
      offset += read;
    }
    return content;
  } finally {
    fs.closeSync(handle);
  }
};

export const computeRuntimeTreeDigest = (runtimeRoot) => {
  const root = path.resolve(runtimeRoot);
  const treeHash = createHash('sha256');
  for (const entry of listTree(root)) {
    if (entry.kind === 'directory') {
      treeHash.update(`D\0${entry.relativePath}\n`);
      continue;
    }
    const content = readFileNoFollow(path.join(root, ...entry.relativePath.split('/')), entry.size);
    const fileDigest = createHash('sha256').update(content).digest('hex');
    treeHash.update(`F\0${entry.size}\0${fileDigest}\0${entry.relativePath}\n`);
  }
  return treeHash.digest('hex');
};

const identityFor = (descriptor) => ({
  schemaVersion: 1,
  releaseVersion: descriptor.releaseVersion,
  targetId: descriptor.targetId,
  archiveSha256: descriptor.archiveSha256,
  signerFingerprint: descriptor.signerFingerprint,
  treeSha256: descriptor.treeSha256,
});

const assertTrustedRuntimeTree = (runtimeRoot, descriptor) => {
  const computedTreeSha256 = computeRuntimeTreeDigest(runtimeRoot);
  if (computedTreeSha256 !== descriptor.treeSha256) {
    throw new Error(
      `native runtime tree does not match trusted authority: expected ${descriptor.treeSha256}, received ${computedTreeSha256}`,
    );
  }
  return computedTreeSha256;
};

const writeIdentity = (runtimeRoot, descriptor) => {
  const identityPath = path.join(runtimeRoot, RUNTIME_IDENTITY_NAME);
  assertTrustedRuntimeTree(runtimeRoot, descriptor);
  const content = `${JSON.stringify(identityFor(descriptor), null, 2)}\n`;
  const handle = fs.openSync(
    identityPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(handle, content, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
};

const readIdentity = (runtimeRoot) => {
  const identityPath = path.join(runtimeRoot, RUNTIME_IDENTITY_NAME);
  const metadata = fs.lstatSync(identityPath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 4096) {
    throw new Error('native runtime identity must be a bounded no-follow regular file');
  }
  return JSON.parse(readFileNoFollow(identityPath, metadata.size).toString('utf8'));
};

const defaultRunVersion = (binaryPath) => {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`native runtime version probe exited ${String(result.status)}`);
  }
  return String(result.stdout ?? '').trim().replace(/^v/u, '');
};

export const validateRuntimeDirectory = ({
  runtimeRoot,
  descriptor,
  runVersion = defaultRunVersion,
}) => {
  const root = path.resolve(runtimeRoot);
  const identity = readIdentity(root);
  assertTrustedRuntimeTree(root, descriptor);
  const expected = identityFor(descriptor);
  for (const field of ['schemaVersion', 'releaseVersion', 'targetId', 'archiveSha256', 'signerFingerprint', 'treeSha256']) {
    if (identity[field] !== expected[field]) {
      throw new Error(`native runtime identity mismatch: ${field}`);
    }
  }
  if (Object.keys(identity).sort().join(',') !== Object.keys(expected).sort().join(',')) {
    throw new Error('native runtime identity contains unexpected fields');
  }
  const binaryName = descriptor.targetId.startsWith('win32-') ? 'node.exe' : 'node';
  const binaryPath = path.join(root, 'bin', binaryName);
  const binaryMetadata = fs.lstatSync(binaryPath);
  if (binaryMetadata.isSymbolicLink() || !binaryMetadata.isFile()) {
    throw new Error('native runtime binary is not a no-follow regular file');
  }
  const actualVersion = runVersion(binaryPath);
  if (actualVersion !== descriptor.releaseVersion) {
    throw new Error(
      `native runtime version mismatch: expected ${descriptor.releaseVersion}, received ${actualVersion || '(empty)'}`,
    );
  }
  return { binaryPath, identity };
};

export const attestTrustedRuntimeDirectory = ({
  runtimeRoot,
  descriptor,
  runVersion = defaultRunVersion,
}) => {
  const root = path.resolve(runtimeRoot);
  const identityPath = path.join(root, RUNTIME_IDENTITY_NAME);
  let identityExists = true;
  try {
    fs.lstatSync(identityPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    identityExists = false;
  }
  if (identityExists) return validateRuntimeDirectory({ runtimeRoot: root, descriptor, runVersion });
  assertTrustedRuntimeTree(root, descriptor);
  writeIdentity(root, descriptor);
  return validateRuntimeDirectory({ runtimeRoot: root, descriptor, runVersion });
};

const rewriteRuntimeWrappers = (runtimeRoot) => {
  for (const [name, relativeEntry] of WRAPPERS) {
    const targetPath = path.resolve(runtimeRoot, 'bin', relativeEntry);
    if (!isInside(runtimeRoot, targetPath)) throw new Error(`runtime wrapper target escaped staging: ${name}`);
    let targetMetadata;
    try {
      targetMetadata = fs.lstatSync(targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (targetMetadata.isSymbolicLink() || !targetMetadata.isFile()) {
      throw new Error(`runtime wrapper target is not a regular file: ${name}`);
    }
    const wrapperPath = path.join(runtimeRoot, 'bin', name);
    try {
      const existing = fs.lstatSync(wrapperPath);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`runtime wrapper path is unsafe: ${name}`);
      fs.rmSync(wrapperPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    fs.writeFileSync(wrapperPath, `#!/usr/bin/env node\nrequire('${relativeEntry}');\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o755,
    });
  }
};

export const extractCanonicalRuntimeTree = ({
  archivePath,
  descriptor,
  destinationRoot,
  onFault = () => {},
}) => {
  const archive = readVerifiedRuntimeArchive({ archivePath, descriptor });
  extractVerifiedRuntimeArchive({ archive, destinationRoot, descriptor, onFault });
  rewriteRuntimeWrappers(destinationRoot);
};

const copyVerifiedRuntime = ({ sourceRoot, destinationRoot, onFault }) => {
  fs.mkdirSync(destinationRoot, { mode: 0o700 });
  for (const entry of listTree(sourceRoot)) {
    const destination = path.join(destinationRoot, ...entry.relativePath.split('/'));
    if (entry.kind === 'directory') {
      fs.mkdirSync(destination, { mode: 0o700 });
      fs.chmodSync(destination, entry.mode);
      continue;
    }
    const source = path.join(sourceRoot, ...entry.relativePath.split('/'));
    const content = readFileNoFollow(source, entry.size);
    fs.writeFileSync(destination, content, { flag: 'wx', mode: entry.mode });
    onFault('after-lkg-copy-entry', { relativePath: entry.relativePath });
  }
};

const pathExistsNoFollow = (targetPath) => {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const removeManagedPath = (parent, targetPath, prefix) => {
  const managed = assertManagedPath(parent, targetPath, prefix);
  if (pathExistsNoFollow(managed)) fs.rmSync(managed, { recursive: true, force: false });
};

export const installVerifiedRuntimeArchive = ({
  archivePath,
  descriptor,
  runtimeRoot,
  runVersion = defaultRunVersion,
  onFault = () => {},
}) => {
  const target = path.resolve(runtimeRoot);
  const parent = path.dirname(target);
  const baseName = path.basename(target);
  const parentMetadata = fs.lstatSync(parent);
  if (parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error('native runtime parent must be a no-follow directory');
  }
  const nonce = randomUUID();
  const staging = assertManagedPath(parent, path.join(parent, `.${baseName}-staging-${nonce}`), `.${baseName}-staging-`);
  const previous = assertManagedPath(parent, path.join(parent, `.${baseName}-previous-${nonce}`), `.${baseName}-previous-`);
  const failed = assertManagedPath(parent, path.join(parent, `.${baseName}-failed-${nonce}`), `.${baseName}-failed-`);
  const lkg = path.join(parent, `${baseName}.lkg`);
  const lkgStaging = assertManagedPath(parent, path.join(parent, `.${baseName}-lkg-staging-${nonce}`), `.${baseName}-lkg-staging-`);
  const lkgReserve = assertManagedPath(parent, path.join(parent, `.${baseName}-lkg-reserve-${nonce}`), `.${baseName}-lkg-reserve-`);
  let currentMoved = false;
  let newCurrentInstalled = false;
  let oldLkgReserved = false;
  let currentWasValid = false;
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    extractCanonicalRuntimeTree({ archivePath, descriptor, destinationRoot: staging, onFault });
    onFault('after-stage-extract');
    writeIdentity(staging, descriptor);
    validateRuntimeDirectory({ runtimeRoot: staging, descriptor, runVersion });
    onFault('after-stage-validate');

    if (pathExistsNoFollow(target)) {
      try {
        validateRuntimeDirectory({ runtimeRoot: target, descriptor, runVersion });
        currentWasValid = true;
      } catch {
        currentWasValid = false;
      }
    }
    if (currentWasValid) {
      copyVerifiedRuntime({ sourceRoot: target, destinationRoot: lkgStaging, onFault });
      writeIdentity(lkgStaging, descriptor);
      validateRuntimeDirectory({ runtimeRoot: lkgStaging, descriptor, runVersion });
      onFault('after-lkg-validate');
      if (pathExistsNoFollow(lkg)) {
        fs.renameSync(lkg, lkgReserve);
        oldLkgReserved = true;
        onFault('after-old-lkg-to-reserve');
      }
      fs.renameSync(lkgStaging, lkg);
      onFault('after-new-lkg-installed');
    }

    if (pathExistsNoFollow(target)) {
      fs.renameSync(target, previous);
      currentMoved = true;
      onFault('after-current-to-previous');
    }
    fs.renameSync(staging, target);
    newCurrentInstalled = true;
    onFault('after-staging-to-current');
    validateRuntimeDirectory({ runtimeRoot: target, descriptor, runVersion });
    onFault('after-current-post-validate');

    if (currentMoved) removeManagedPath(parent, previous, `.${baseName}-previous-`);
    if (oldLkgReserved) removeManagedPath(parent, lkgReserve, `.${baseName}-lkg-reserve-`);
    return validateRuntimeDirectory({ runtimeRoot: target, descriptor, runVersion });
  } catch (error) {
    try {
      if (newCurrentInstalled && pathExistsNoFollow(target)) {
        fs.renameSync(target, failed);
        newCurrentInstalled = false;
      }
      if (currentMoved && pathExistsNoFollow(previous) && !pathExistsNoFollow(target)) {
        fs.renameSync(previous, target);
        currentMoved = false;
      }
      if (oldLkgReserved && !pathExistsNoFollow(lkg) && pathExistsNoFollow(lkgReserve)) {
        fs.renameSync(lkgReserve, lkg);
        oldLkgReserved = false;
      }
      if (currentWasValid && pathExistsNoFollow(target)) {
        validateRuntimeDirectory({ runtimeRoot: target, descriptor, runVersion });
      }
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'native runtime install and rollback both failed');
    } finally {
      for (const [candidate, prefix] of [
        [staging, `.${baseName}-staging-`],
        [lkgStaging, `.${baseName}-lkg-staging-`],
        [failed, `.${baseName}-failed-`],
      ]) {
        try {
          removeManagedPath(parent, candidate, prefix);
        } catch {
          // Preserve the original install failure; known residue remains for the next bounded cleanup.
        }
      }
    }
    throw error;
  }
};
