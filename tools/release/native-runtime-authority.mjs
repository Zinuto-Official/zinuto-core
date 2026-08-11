// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const NATIVE_RUNTIME_AUTHORITY_PATH = path.join(
  ROOT_DIR,
  'config',
  'open-source',
  'node-runtime-authority.json',
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const FINGERPRINT_PATTERN = /^[A-F0-9]{40}$/u;
const EXPECTED_ORIGIN = 'https://nodejs.org';
const EXPECTED_TARGET_IDS = ['darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-x64'];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const readPacket = (packet) => {
  const tagByte = packet[0];
  if ((tagByte & 0x80) === 0 || (tagByte & 0x40) !== 0) {
    throw new Error('release manifest signature is not the expected OpenPGP packet format');
  }
  const tag = (tagByte >> 2) & 0x0f;
  const lengthType = tagByte & 0x03;
  if (tag !== 2 || lengthType !== 1 || packet.length < 3) {
    throw new Error('release manifest must have one two-octet OpenPGP signature packet');
  }
  const bodyLength = packet.readUInt16BE(1);
  if (bodyLength + 3 !== packet.length) {
    throw new Error('release manifest signature packet length mismatch');
  }
  return packet.subarray(3);
};

const readMpi = (body, offset) => {
  if (offset + 2 > body.length) throw new Error('truncated OpenPGP RSA signature');
  const bitLength = body.readUInt16BE(offset);
  const byteLength = Math.ceil(bitLength / 8);
  const end = offset + 2 + byteLength;
  if (end !== body.length) throw new Error('unexpected OpenPGP RSA signature payload');
  return body.subarray(offset + 2, end);
};

const parseOpenPgpSignature = (packet) => {
  const body = readPacket(packet);
  if (body.length < 12 || body[0] !== 4 || body[1] !== 0 || body[2] !== 1 || body[3] !== 8) {
    throw new Error('release manifest signature must be OpenPGP v4 binary RSA/SHA-256');
  }
  const hashedLength = body.readUInt16BE(4);
  const signedHeaderEnd = 6 + hashedLength;
  if (signedHeaderEnd + 2 > body.length) throw new Error('truncated OpenPGP hashed metadata');
  const unhashedLength = body.readUInt16BE(signedHeaderEnd);
  const digestPrefixOffset = signedHeaderEnd + 2 + unhashedLength;
  if (digestPrefixOffset + 4 > body.length) throw new Error('truncated OpenPGP signature metadata');
  const signedHeader = body.subarray(0, signedHeaderEnd);
  const trailer = Buffer.alloc(6);
  trailer[0] = 4;
  trailer[1] = 0xff;
  trailer.writeUInt32BE(signedHeader.length, 2);
  return {
    digestPrefix: body.subarray(digestPrefixOffset, digestPrefixOffset + 2),
    rsaSignature: readMpi(body, digestPrefixOffset + 2),
    signedHeader,
    trailer,
  };
};

const encodeMpi = (bytes) => {
  const first = bytes[0] ?? 0;
  const leadingZeros = first === 0 ? 8 : Math.clz32(first) - 24;
  const bitLength = bytes.length * 8 - leadingZeros;
  const encoded = Buffer.alloc(2 + bytes.length);
  encoded.writeUInt16BE(bitLength, 0);
  bytes.copy(encoded, 2);
  return encoded;
};

const computeOpenPgpV4Fingerprint = (publicKey) => {
  const modulus = Buffer.from(publicKey.modulusBase64Url, 'base64url');
  const exponent = Buffer.from(publicKey.exponentBase64Url, 'base64url');
  const body = Buffer.concat([
    Buffer.from([4]),
    Buffer.from([
      (publicKey.createdAtUnix >>> 24) & 0xff,
      (publicKey.createdAtUnix >>> 16) & 0xff,
      (publicKey.createdAtUnix >>> 8) & 0xff,
      publicKey.createdAtUnix & 0xff,
      1,
    ]),
    encodeMpi(modulus),
    encodeMpi(exponent),
  ]);
  const prefix = Buffer.from([0x99, (body.length >>> 8) & 0xff, body.length & 0xff]);
  return createHash('sha1').update(prefix).update(body).digest('hex').toUpperCase();
};

const parseSignedManifestLines = (content) => {
  const entries = new Map();
  for (const line of content.toString('utf8').split(/\r?\n/u)) {
    if (!line) continue;
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/u.exec(line);
    if (!match || entries.has(match[2])) {
      throw new Error('signed release manifest contains a malformed or duplicate entry');
    }
    entries.set(match[2], match[1]);
  }
  return entries;
};

export const verifyNativeRuntimeAuthority = (authority) => {
  if (!authority || authority.schemaVersion !== 1 || authority.sourceOrigin !== EXPECTED_ORIGIN) {
    throw new Error('native runtime authority schema or source origin mismatch');
  }
  const releaseVersion = String(authority.releaseVersion ?? '');
  if (!/^\d+\.\d+\.\d+$/u.test(releaseVersion)) {
    throw new Error('native runtime authority has an invalid release version');
  }
  const signedManifest = authority.signedManifest;
  const publicKey = signedManifest?.publicKey;
  if (
    signedManifest?.publicKey?.algorithm !== 'RSA'
    || !FINGERPRINT_PATTERN.test(String(signedManifest?.signerFingerprint ?? ''))
    || !Number.isSafeInteger(publicKey?.createdAtUnix)
    || typeof publicKey?.modulusBase64Url !== 'string'
    || typeof publicKey?.exponentBase64Url !== 'string'
  ) {
    throw new Error('native runtime authority signer identity is incomplete');
  }
  const fingerprint = computeOpenPgpV4Fingerprint(publicKey);
  if (fingerprint !== signedManifest.signerFingerprint) {
    throw new Error('native runtime authority signer fingerprint mismatch');
  }
  const content = Buffer.from(String(signedManifest.contentBase64 ?? ''), 'base64');
  if (!SHA256_PATTERN.test(String(signedManifest.sha256 ?? '')) || sha256(content) !== signedManifest.sha256) {
    throw new Error('signed release manifest digest mismatch');
  }
  const parsedSignature = parseOpenPgpSignature(
    Buffer.from(String(signedManifest.signatureBase64 ?? ''), 'base64'),
  );
  const signedPayload = Buffer.concat([
    content,
    parsedSignature.signedHeader,
    parsedSignature.trailer,
  ]);
  const computedDigest = createHash('sha256').update(signedPayload).digest();
  if (!computedDigest.subarray(0, 2).equals(parsedSignature.digestPrefix)) {
    throw new Error('release manifest signature digest prefix mismatch');
  }
  const key = createPublicKey({
    format: 'jwk',
    key: {
      kty: 'RSA',
      n: publicKey.modulusBase64Url,
      e: publicKey.exponentBase64Url,
    },
  });
  if (!verifySignature('RSA-SHA256', signedPayload, key, parsedSignature.rsaSignature)) {
    throw new Error('release manifest signature verification failed');
  }
  const manifestEntries = parseSignedManifestLines(content);
  const platforms = authority.platforms;
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
    throw new Error('native runtime platform authority is missing');
  }
  if (Object.keys(platforms).sort().join(',') !== EXPECTED_TARGET_IDS.join(',')) {
    throw new Error('native runtime platform authority must cover exactly the supported targets');
  }
  for (const [targetId, descriptor] of Object.entries(platforms)) {
    if (
      !/^(darwin|win32)-(arm64|x64)$/u.test(targetId)
      || !['tar.gz', 'zip'].includes(descriptor?.archiveType)
      || !SHA256_PATTERN.test(String(descriptor?.archiveSha256 ?? ''))
      || !SHA256_PATTERN.test(String(descriptor?.treeSha256 ?? ''))
      || !Number.isSafeInteger(descriptor?.archiveBytes)
      || descriptor.archiveBytes <= 0
      || !Number.isSafeInteger(descriptor?.maxUnpackedBytes)
      || descriptor.maxUnpackedBytes <= descriptor.archiveBytes
      || !Number.isSafeInteger(descriptor?.maxEntries)
      || descriptor.maxEntries <= 0
    ) {
      throw new Error(`invalid native runtime platform authority: ${targetId}`);
    }
    const expectedName = `node-v${releaseVersion}-${targetId.replace('win32-', 'win-')}.${descriptor.archiveType}`;
    if (descriptor.archiveFileName !== expectedName) {
      throw new Error(`native runtime archive name mismatch: ${targetId}`);
    }
    if (manifestEntries.get(descriptor.archiveFileName) !== descriptor.archiveSha256) {
      throw new Error(`native runtime archive digest is not bound to signed manifest: ${targetId}`);
    }
  }
  return Object.freeze({
    ...authority,
    manifestSignerFingerprint: fingerprint,
  });
};

export const loadNativeRuntimeAuthority = (
  authorityPath = NATIVE_RUNTIME_AUTHORITY_PATH,
) => verifyNativeRuntimeAuthority(JSON.parse(fs.readFileSync(authorityPath, 'utf8')));

export const resolveNativeRuntimeDescriptor = ({
  authority = loadNativeRuntimeAuthority(),
  nodePlatform = process.platform,
  nodeArch = process.arch,
} = {}) => {
  const targetId = `${nodePlatform}-${nodeArch}`;
  const descriptor = authority.platforms[targetId];
  if (!descriptor) {
    throw new Error(`Unsupported native runtime platform: ${targetId}`);
  }
  return Object.freeze({
    ...descriptor,
    archiveUrl: `${authority.sourceOrigin}/dist/v${authority.releaseVersion}/${descriptor.archiveFileName}`,
    releaseVersion: authority.releaseVersion,
    signerFingerprint: authority.manifestSignerFingerprint,
    targetId,
  });
};
