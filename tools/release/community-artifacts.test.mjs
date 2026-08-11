// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  defaultCommunityArtifactRoot,
  exportCommunityArtifact,
  findCommunityBundleArtifact,
} from './community-artifacts.mjs';
import {
  createUnsignedPackageEnvironment,
  parseCommunityPackageArguments,
} from './build-community-desktop.mjs';
import {
  classifyAppleCodeSignature,
  sortCodeObjectsDeepestFirst,
} from './local-package-signature.mjs';

const unsignedInspection = (platformSignature = 'unsigned') => ({
  platformSignature,
  codeObjectCount: 2,
  signatureStates: [platformSignature],
  companyCodeSigned: false,
  notarized: false,
});

const createFixture = ({ platform }) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'community-artifact-'));
  const bundleDir = path.join(rootDir, 'bundle');
  const installerDirectory = path.join(bundleDir, platform === 'darwin' ? 'dmg' : 'nsis');
  const installerName = platform === 'darwin' ? 'Zinuto Core.dmg' : 'app-setup.exe';
  fs.mkdirSync(installerDirectory, { recursive: true });
  fs.writeFileSync(path.join(installerDirectory, installerName), `${platform}-installer`);
  fs.writeFileSync(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ version: '2.0.0' })}\n`,
  );
  return { bundleDir, rootDir };
};

test('community artifacts stay separated by platform and never overwrite a prior run', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'community-output-'));
  const macos = createFixture({ platform: 'darwin' });
  const windows = createFixture({ platform: 'win32' });
  const firstTime = new Date('2026-07-18T08:00:00.123Z');

  const macosResult = exportCommunityArtifact({
    architecture: 'arm64',
    bundleDir: macos.bundleDir,
    now: firstTime,
    outputRoot,
    platform: 'darwin',
    rootDir: macos.rootDir,
    sourceCommit: 'a'.repeat(40),
    sourceDirty: false,
    signatureInspection: unsignedInspection('ad-hoc'),
  });
  const windowsResult = exportCommunityArtifact({
    architecture: 'x64',
    bundleDir: windows.bundleDir,
    now: firstTime,
    outputRoot,
    platform: 'win32',
    rootDir: windows.rootDir,
    sourceCommit: 'b'.repeat(40),
    sourceDirty: false,
    signatureInspection: unsignedInspection(),
  });
  assert.match(macosResult.artifactPath, /local-builds\/macos-arm64\//u);
  assert.match(windowsResult.artifactPath, /local-builds\/windows-x64\//u);
  assert.equal(path.basename(macosResult.artifactPath), 'Zinuto-Core-2.0.0.dmg');
  assert.equal(path.basename(windowsResult.artifactPath), 'Zinuto-Core-2.0.0.exe');
  assert.throws(() => exportCommunityArtifact({
    architecture: 'arm64',
    bundleDir: macos.bundleDir,
    now: new Date('2026-07-18T08:00:01.456Z'),
    outputRoot,
    platform: 'darwin',
    rootDir: macos.rootDir,
    sourceCommit: 'a'.repeat(40),
    sourceDirty: false,
    signatureInspection: unsignedInspection('ad-hoc'),
  }), /EEXIST/u);
  assert.equal(fs.readFileSync(macosResult.artifactPath, 'utf8'), 'darwin-installer');
  assert.equal(fs.readFileSync(windowsResult.artifactPath, 'utf8'), 'win32-installer');
  const evidence = JSON.parse(fs.readFileSync(macosResult.evidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.compositionProtocolVersion, 1);
  assert.equal(evidence.distributionId, 'community');
  assert.equal('official' in evidence, false);
  assert.equal('clientPresence' in evidence, false);
  assert.equal(evidence.distributionScope, 'local-source-build');
  assert.equal(evidence.companyCodeSigned, false);
  assert.equal(evidence.notarized, false);
  assert.equal(evidence.platformSignature, 'ad-hoc');
  assert.equal(JSON.parse(fs.readFileSync(macosResult.latestPath, 'utf8')).artifact,
    path.basename(macosResult.artifactPath));
});

test('collector rejects missing or ambiguous installer output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'community-bundle-'));
  assert.throws(
    () => findCommunityBundleArtifact({ bundleDir: root, platform: 'darwin' }),
    /found 0/u,
  );
  const directory = path.join(root, 'dmg');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'one.dmg'), 'one');
  fs.writeFileSync(path.join(directory, 'two.dmg'), 'two');
  assert.throws(
    () => findCommunityBundleArtifact({ bundleDir: root, platform: 'darwin' }),
    /found 2/u,
  );
});

test('artifact root defaults to the repository-local build directory', () => {
  assert.equal(
    defaultCommunityArtifactRoot({ rootDir: '/workspace/desktop' }),
    path.join('/workspace/desktop', 'artifacts'),
  );
});

test('standard package arguments reject signing config injection', () => {
  assert.deepEqual(
    parseCommunityPackageArguments(['--output-dir', '/tmp/core-output']),
    { outputRoot: path.resolve('/tmp/core-output') },
  );
  assert.throws(
    () => parseCommunityPackageArguments(['--config', '/tmp/signing.json']),
    /Only --output-dir is accepted/u,
  );
  assert.throws(
    () => parseCommunityPackageArguments(['--bundles', 'dmg']),
    /Only --output-dir is accepted/u,
  );
});

test('standard package environment removes distributor signing inputs', () => {
  const environment = createUnsignedPackageEnvironment({
    PATH: '/usr/bin',
    APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example',
    TAURI_SIGNING_PRIVATE_KEY: 'private',
    WINDOWS_CERTIFICATE_THUMBPRINT: 'abc',
    ZINUTO_DEVELOPER_ID_APPLICATION_IDENTITY: 'Developer ID Application: Zinuto',
    ZINUTO_WINDOWS_DIRECT_SIGNER_THUMBPRINT: 'thumbprint',
    ZINUTO_APPSTORE_TEAM_ID: 'team',
  });
  assert.equal(environment.PATH, '/usr/bin');
  assert.equal('APPLE_SIGNING_IDENTITY' in environment, false);
  assert.equal('TAURI_SIGNING_PRIVATE_KEY' in environment, false);
  assert.equal('WINDOWS_CERTIFICATE_THUMBPRINT' in environment, false);
  assert.equal('ZINUTO_DEVELOPER_ID_APPLICATION_IDENTITY' in environment, false);
  assert.equal('ZINUTO_WINDOWS_DIRECT_SIGNER_THUMBPRINT' in environment, false);
  assert.equal('ZINUTO_APPSTORE_TEAM_ID' in environment, false);
});

test('Apple signature classification accepts unsigned and ad-hoc code only', () => {
  assert.equal(
    classifyAppleCodeSignature('code object is not signed at all', 1).state,
    'unsigned',
  );
  assert.equal(
    classifyAppleCodeSignature('Signature=adhoc\nTeamIdentifier=not set', 0).state,
    'ad-hoc',
  );
  assert.equal(
    classifyAppleCodeSignature(
      'Authority=Developer ID Application: Example Corp (ABCDE12345)\nTeamIdentifier=ABCDE12345',
      0,
    ).state,
    'certificate',
  );
});

test('macOS code objects are normalized deepest-first before the outer app', () => {
  assert.deepEqual(
    sortCodeObjectsDeepestFirst([
      '/Zinuto Core.app/Contents/MacOS/main',
      '/Zinuto Core.app/Contents/Resources/node_modules/addon.node',
      '/Zinuto Core.app/Contents/Resources/node/bin/node',
    ]),
    [
      '/Zinuto Core.app/Contents/Resources/node/bin/node',
      '/Zinuto Core.app/Contents/Resources/node_modules/addon.node',
      '/Zinuto Core.app/Contents/MacOS/main',
    ],
  );
});
