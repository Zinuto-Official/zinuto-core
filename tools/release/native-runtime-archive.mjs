// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, inflateRawSync } from 'node:zlib';

const TAR_BLOCK_BYTES = 512;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const FILE_TYPE_MASK = 0o170000;
const REGULAR_FILE_TYPE = 0o100000;
const DIRECTORY_TYPE = 0o040000;
const SYMBOLIC_LINK_TYPE = 0o120000;
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

const hashBuffer = (buffer) => createHash('sha256').update(buffer).digest('hex');

const checkedInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`invalid ${label}: ${String(value)}`);
  }
  return value;
};

export const readVerifiedRuntimeArchive = ({ archivePath, descriptor }) => {
  const metadata = fs.lstatSync(archivePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error('native runtime archive must be a no-follow regular file');
  }
  if (metadata.size !== descriptor.archiveBytes) {
    throw new Error(
      `native runtime archive size mismatch: expected ${descriptor.archiveBytes}, received ${metadata.size}`,
    );
  }
  const handle = fs.openSync(archivePath, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fs.fstatSync(handle);
    if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
      throw new Error('native runtime archive changed while opening');
    }
    const archive = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < archive.length) {
      const read = fs.readSync(handle, archive, offset, archive.length - offset, offset);
      if (read <= 0) throw new Error('native runtime archive ended before its declared size');
      offset += read;
    }
    if (hashBuffer(archive) !== descriptor.archiveSha256) {
      throw new Error('native runtime archive digest mismatch');
    }
    return archive;
  } finally {
    fs.closeSync(handle);
  }
};

const parseTarOctal = (buffer, label) => {
  const value = buffer.toString('ascii').replace(/\0.*$/u, '').trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error(`invalid tar ${label}`);
  return checkedInteger(Number.parseInt(value, 8), `tar ${label}`);
};

const parseTarText = (buffer, label) => {
  const end = buffer.indexOf(0);
  const value = buffer.subarray(0, end < 0 ? buffer.length : end).toString('utf8');
  if (!value || value.includes('\u0000')) throw new Error(`invalid tar ${label}`);
  return value;
};

const validateTarChecksum = (header) => {
  const expected = parseTarOctal(header.subarray(148, 156), 'checksum');
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error('tar header checksum mismatch');
};

const archiveRootName = (descriptor) => descriptor.archiveFileName.replace(/\.(?:tar\.gz|zip)$/u, '');

const normalizeEntryName = (entryName, descriptor) => {
  if (
    entryName.includes('\\')
    || entryName.startsWith('/')
    || /^[A-Za-z]:/u.test(entryName)
    || entryName.includes('\u0000')
  ) {
    throw new Error(`unsafe archive entry path: ${entryName}`);
  }
  const withoutTrailingSlash = entryName.replace(/\/+$/u, '');
  const segments = withoutTrailingSlash.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`unsafe archive entry path: ${entryName}`);
  }
  if (descriptor.archiveLayout === 'rootless') {
    return segments;
  }
  if (segments[0] !== archiveRootName(descriptor)) {
    throw new Error(`archive entry is outside the expected runtime root: ${entryName}`);
  }
  const relativeSegments = segments.slice(1);
  if (descriptor.targetId.startsWith('win32-') && relativeSegments.length > 0) {
    const [first, ...rest] = relativeSegments;
    const lower = first.toLowerCase();
    if (lower === 'node_modules') return ['lib', 'node_modules', ...rest];
    if (lower === 'node.exe' || /\.(?:dll|dat)$/iu.test(first)) return ['bin', first, ...rest];
    if (/\.(?:cmd|ps1)$/iu.test(first) || ['npm', 'npx', 'corepack', 'nodevars.bat'].includes(lower)) {
      return null;
    }
  }
  return relativeSegments;
};

const destinationFor = (destinationRoot, segments) => {
  const destination = path.resolve(destinationRoot, ...segments);
  if (destination !== destinationRoot && !destination.startsWith(`${destinationRoot}${path.sep}`)) {
    throw new Error('archive destination escaped private staging');
  }
  return destination;
};

const ensurePrivateDirectories = (destinationRoot, segments) => {
  let current = destinationRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const metadata = fs.lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`archive directory conflicts with non-directory: ${current}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      fs.mkdirSync(current, { mode: 0o700 });
    }
  }
};

const writeRegularFileNoFollow = ({ destinationRoot, segments, content, executable }) => {
  ensurePrivateDirectories(destinationRoot, segments.slice(0, -1));
  const destination = destinationFor(destinationRoot, segments);
  const handle = fs.openSync(
    destination,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | NOFOLLOW,
    executable ? 0o700 : 0o600,
  );
  try {
    let offset = 0;
    while (offset < content.length) {
      const written = fs.writeSync(handle, content, offset, content.length - offset, offset);
      if (written <= 0) throw new Error(`failed to write staged runtime file: ${destination}`);
      offset += written;
    }
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.chmodSync(destination, executable ? 0o755 : 0o644);
};

const isAllowedIgnoredNodeWrapperLink = ({ entryName, linkName, descriptor }) => {
  const root = archiveRootName(descriptor);
  const allowed = new Map([
    [`${root}/bin/npm`, '../lib/node_modules/npm/bin/npm-cli.js'],
    [`${root}/bin/npx`, '../lib/node_modules/npm/bin/npx-cli.js'],
    [`${root}/bin/corepack`, '../lib/node_modules/corepack/dist/corepack.js'],
  ]);
  return allowed.get(entryName) === linkName;
};

const createEntryWriter = ({ destinationRoot, descriptor, onFault = () => {} }) => {
  const seen = new Set();
  let entryCount = 0;
  let unpackedBytes = 0;
  return ({ entryName, kind, content = Buffer.alloc(0), executable = false, linkName = '' }) => {
    entryCount += 1;
    if (entryCount > descriptor.maxEntries) throw new Error('native runtime archive has too many entries');
    unpackedBytes += content.length;
    if (unpackedBytes > descriptor.maxUnpackedBytes) {
      throw new Error('native runtime archive exceeds unpacked byte limit');
    }
    if (kind === 'directory' && content.length !== 0) {
      throw new Error(`native runtime archive directory has content: ${entryName}`);
    }
    const segments = normalizeEntryName(entryName, descriptor);
    if (segments === null || segments.length === 0) return;
    const key = segments.join('/');
    if (seen.has(key)) throw new Error(`duplicate native runtime archive entry: ${entryName}`);
    for (let index = 1; index < segments.length; index += 1) {
      if (seen.has(`${segments.slice(0, index).join('/')}:file`)) {
        throw new Error(`archive entry has a regular-file ancestor: ${entryName}`);
      }
    }
    if (kind === 'ignored-wrapper-link') {
      if (!isAllowedIgnoredNodeWrapperLink({ entryName, linkName, descriptor })) {
        throw new Error(`native runtime archive link entry is forbidden: ${entryName}`);
      }
      seen.add(key);
      return;
    }
    if (kind === 'directory') {
      ensurePrivateDirectories(destinationRoot, segments);
      seen.add(key);
      return;
    }
    if (kind !== 'file') throw new Error(`native runtime archive special entry is forbidden: ${entryName}`);
    writeRegularFileNoFollow({ destinationRoot, segments, content, executable });
    seen.add(key);
    seen.add(`${key}:file`);
    onFault('after-copy-entry', { entryName, entryCount });
  };
};

const extractTarGz = ({ archive, destinationRoot, descriptor, onFault }) => {
  const unpacked = gunzipSync(archive, { maxOutputLength: descriptor.maxUnpackedBytes + descriptor.maxEntries * TAR_BLOCK_BYTES });
  const writeEntry = createEntryWriter({ destinationRoot, descriptor, onFault });
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + TAR_BLOCK_BYTES <= unpacked.length) {
    const header = unpacked.subarray(offset, offset + TAR_BLOCK_BYTES);
    offset += TAR_BLOCK_BYTES;
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) throw new Error('tar has data after a zero terminator block');
    validateTarChecksum(header);
    const name = parseTarText(header.subarray(0, 100), 'entry name');
    const prefixBytes = header.subarray(345, 500);
    const prefix = prefixBytes.every((byte) => byte === 0) ? '' : parseTarText(prefixBytes, 'entry prefix');
    const entryName = prefix ? `${prefix}/${name}` : name;
    const mode = parseTarOctal(header.subarray(100, 108), 'mode');
    const size = parseTarOctal(header.subarray(124, 136), 'size');
    const paddedSize = Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    if (offset + paddedSize > unpacked.length) throw new Error(`truncated tar entry: ${entryName}`);
    const content = unpacked.subarray(offset, offset + size);
    offset += paddedSize;
    const type = header[156];
    if (type === 0 || type === 0x30) {
      writeEntry({ entryName, kind: 'file', content, executable: (mode & 0o111) !== 0 });
    } else if (type === 0x35) {
      if (size !== 0) throw new Error(`tar directory has content: ${entryName}`);
      writeEntry({ entryName, kind: 'directory' });
    } else if (type === 0x32) {
      const linkName = parseTarText(header.subarray(157, 257), 'link name');
      writeEntry({ entryName, kind: 'ignored-wrapper-link', linkName });
    } else {
      throw new Error(`native runtime archive link or special entry is forbidden: ${entryName}`);
    }
  }
  if (zeroBlocks !== 2) throw new Error('tar archive is missing its two-block terminator');
};

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

const findZipEocd = (archive) => {
  const minimum = Math.max(0, archive.length - 0xffff - 22);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error('zip end-of-central-directory record is missing');
};

const extractZip = ({ archive, destinationRoot, descriptor, onFault }) => {
  const eocd = findZipEocd(archive);
  const disk = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  const commentLength = archive.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || eocd + 22 + commentLength !== archive.length) {
    throw new Error('split, trailing, or malformed zip archive is forbidden');
  }
  if (entryCount > descriptor.maxEntries || centralOffset + centralSize !== eocd) {
    throw new Error('zip central directory bounds are invalid');
  }
  const writeEntry = createEntryWriter({ destinationRoot, descriptor, onFault });
  let offset = centralOffset;
  let declaredUnpackedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || archive.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('zip central directory entry is malformed');
    }
    const madeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const unpackedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const entryCommentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (next > eocd || (flags & 1) !== 0 || ![0, 8].includes(method)) {
      throw new Error('encrypted, unsupported, or truncated zip entry is forbidden');
    }
    const entryName = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw new Error(`zip local entry is malformed: ${entryName}`);
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localName !== entryName || dataEnd > centralOffset) throw new Error(`zip entry bounds mismatch: ${entryName}`);
    const host = madeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    const unixType = unixMode & FILE_TYPE_MASK;
    const directory = entryName.endsWith('/') || (externalAttributes & 0x10) !== 0;
    if (directory && (compressedSize !== 0 || unpackedSize !== 0)) {
      throw new Error(`zip directory has content: ${entryName}`);
    }
    declaredUnpackedBytes += unpackedSize;
    if (declaredUnpackedBytes > descriptor.maxUnpackedBytes) {
      throw new Error('native runtime archive exceeds unpacked byte limit');
    }
    if (unpackedSize > descriptor.maxUnpackedBytes) {
      throw new Error(`zip entry exceeds unpacked byte limit: ${entryName}`);
    }
    const compressed = archive.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: unpackedSize });
    if (content.length !== unpackedSize || crc32(content) !== expectedCrc) {
      throw new Error(`zip entry size or CRC mismatch: ${entryName}`);
    }
    if (host === 3 && unixType !== 0) {
      if (unixType === SYMBOLIC_LINK_TYPE) throw new Error(`native runtime archive link entry is forbidden: ${entryName}`);
      const expectedType = directory ? DIRECTORY_TYPE : REGULAR_FILE_TYPE;
      if (unixType !== expectedType) throw new Error(`native runtime archive special entry is forbidden: ${entryName}`);
    }
    writeEntry({
      entryName,
      kind: directory ? 'directory' : 'file',
      content,
      executable: host === 3 && (unixMode & 0o111) !== 0,
    });
    offset = next;
  }
  if (offset !== eocd) throw new Error('zip central directory entry count mismatch');
};

export const extractVerifiedRuntimeArchive = ({
  archive,
  destinationRoot,
  descriptor,
  onFault = () => {},
}) => {
  const root = path.resolve(destinationRoot);
  const metadata = fs.lstatSync(root);
  if (!isPrivateRuntimeStagingDirectory({ metadata })) {
    throw new Error('native runtime staging root must be a private no-follow directory');
  }
  if (descriptor.archiveType === 'tar.gz') {
    extractTarGz({ archive, destinationRoot: root, descriptor, onFault });
  } else if (descriptor.archiveType === 'zip') {
    extractZip({ archive, destinationRoot: root, descriptor, onFault });
  } else {
    throw new Error(`unsupported native runtime archive type: ${descriptor.archiveType}`);
  }
};

export const isPrivateRuntimeStagingDirectory = ({
  metadata,
  platform = process.platform,
} = {}) => {
  if (metadata?.isSymbolicLink() || !metadata?.isDirectory()) return false;
  // Node exposes synthesized POSIX mode bits on Windows, so directory privacy
  // is governed by the inherited Windows ACL rather than metadata.mode.
  return platform === 'win32' || (metadata.mode & 0o077) === 0;
};
