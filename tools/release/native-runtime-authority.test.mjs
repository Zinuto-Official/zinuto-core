// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  NATIVE_RUNTIME_AUTHORITY_PATH,
  resolveNativeRuntimeDescriptor,
  verifyNativeRuntimeAuthority,
} from './native-runtime-authority.mjs';

const readAuthority = () => JSON.parse(fs.readFileSync(NATIVE_RUNTIME_AUTHORITY_PATH, 'utf8'));

test('native runtime authority cryptographically binds version, platform, digest, and signer', () => {
  const authority = verifyNativeRuntimeAuthority(readAuthority());
  const descriptor = resolveNativeRuntimeDescriptor({
    authority,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });
  assert.equal(descriptor.releaseVersion, '24.18.0');
  assert.equal(descriptor.archiveSha256, 'e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1');
  assert.equal(descriptor.treeSha256, 'ad010b2118def95a6fc8983f2ce801a2d1038fc7ad953979c4af9c924175a9bd');
  assert.equal(descriptor.signerFingerprint, 'C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C');
  assert.equal(descriptor.archiveUrl, 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-darwin-arm64.tar.gz');
});

test('native runtime authority rejects wrong manifest digest, signer identity, and signature', () => {
  const cases = [
    (authority) => { authority.signedManifest.sha256 = '0'.repeat(64); },
    (authority) => { authority.signedManifest.signerFingerprint = '0'.repeat(40); },
    (authority) => {
      const signature = Buffer.from(authority.signedManifest.signatureBase64, 'base64');
      signature[signature.length - 1] ^= 1;
      authority.signedManifest.signatureBase64 = signature.toString('base64');
    },
    (authority) => { authority.platforms['darwin-arm64'].archiveSha256 = 'f'.repeat(64); },
    (authority) => { authority.platforms['darwin-arm64'].treeSha256 = 'invalid'; },
    (authority) => { delete authority.platforms['win32-x64']; },
  ];
  for (const mutate of cases) {
    const authority = readAuthority();
    mutate(authority);
    assert.throws(
      () => verifyNativeRuntimeAuthority(authority),
      /mismatch|verification failed|not bound|invalid native runtime platform authority|cover exactly/u,
    );
  }
});

test('native runtime authority fails closed for unsupported platform or architecture', () => {
  const authority = verifyNativeRuntimeAuthority(readAuthority());
  assert.throws(
    () => resolveNativeRuntimeDescriptor({ authority, nodePlatform: 'linux', nodeArch: 'x64' }),
    /Unsupported native runtime platform/u,
  );
});
