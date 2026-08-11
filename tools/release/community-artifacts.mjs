// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUNDLE_DIR, ROOT_DIR } from './desktop-command-utils.mjs';
import { readActiveDesktopComposition } from './desktop-composition.mjs';
import { inspectLocalPackageSignature } from './local-package-signature.mjs';

const PLATFORM_NAMES = Object.freeze({
  darwin: 'macos',
  win32: 'windows',
});

const ARCHITECTURE_NAMES = Object.freeze({
  arm64: 'arm64',
  x64: 'x64',
});

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const sha256File = (filePath) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
};

const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  fs.renameSync(temporaryPath, filePath);
};

const resolveGitState = (rootDir) => {
  const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  return {
    sourceCommit: commitResult.status === 0 ? commitResult.stdout.trim() : null,
    sourceDirty: statusResult.status !== 0 || Boolean(statusResult.stdout.trim()),
  };
};

const listFiles = (directoryPath, predicate) => {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(directoryPath, entry.name));
};

export const resolveCommunityPlatform = (platform = process.platform) => {
  const normalized = PLATFORM_NAMES[platform];
  if (!normalized) {
    throw new Error(`Community packaging supports macOS and Windows, not ${platform}.`);
  }
  return normalized;
};

export const resolveCommunityArchitecture = (architecture = process.arch) => {
  const normalized = ARCHITECTURE_NAMES[architecture];
  if (!normalized) {
    throw new Error(`Community packaging does not support architecture ${architecture}.`);
  }
  return normalized;
};

export const findCommunityBundleArtifact = ({
  bundleDir = BUNDLE_DIR,
  platform = process.platform,
} = {}) => {
  const normalizedPlatform = resolveCommunityPlatform(platform);
  const candidates = normalizedPlatform === 'macos'
    ? listFiles(path.join(bundleDir, 'dmg'), (name) => name.endsWith('.dmg'))
    : listFiles(path.join(bundleDir, 'nsis'), (name) => name.endsWith('-setup.exe'));

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one ${normalizedPlatform} Core installer, found ${candidates.length}.`,
    );
  }
  return candidates[0];
};

export const defaultCommunityArtifactRoot = ({
  rootDir = ROOT_DIR,
} = {}) => path.join(rootDir, 'artifacts');

export const exportCommunityArtifact = ({
  architecture = process.arch,
  bundleDir = BUNDLE_DIR,
  now = new Date(),
  outputRoot = defaultCommunityArtifactRoot(),
  platform = process.platform,
  rootDir = ROOT_DIR,
  sourceCommit,
  sourceDirty,
  signatureInspection,
} = {}) => {
  const composition = readActiveDesktopComposition();
  if (composition.distributionId !== 'community') {
    throw new Error('Community artifact export requires the community composition.');
  }
  const normalizedPlatform = resolveCommunityPlatform(platform);
  const normalizedArchitecture = resolveCommunityArchitecture(architecture);
  const sourcePath = findCommunityBundleArtifact({ bundleDir, platform });
  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const version = String(packageJson.version || '').trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid desktop package version ${JSON.stringify(version)}.`);
  }

  const gitState = sourceCommit === undefined || sourceDirty === undefined
    ? resolveGitState(rootDir)
    : { sourceCommit, sourceDirty };
  const inspectedSignature = signatureInspection ?? inspectLocalPackageSignature({
    bundleDir,
    platform,
  });
  if (
    inspectedSignature?.companyCodeSigned !== false
    || inspectedSignature?.notarized !== false
    || !['unsigned', 'ad-hoc'].includes(inspectedSignature?.platformSignature)
  ) {
    throw new Error('Local Core package signature evidence is not source-only and unsigned.');
  }
  const platformKey = `${normalizedPlatform}-${normalizedArchitecture}`;
  const destinationDirectory = path.join(outputRoot, 'local-builds', platformKey);
  fs.mkdirSync(destinationDirectory, { recursive: true });

  const extension = normalizedPlatform === 'macos' ? '.dmg' : '.exe';
  const artifactName = 'Zinuto-Core-' + version + extension;
  const destinationPath = path.join(destinationDirectory, artifactName);
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);

  const artifactSha256 = sha256File(destinationPath);
  const checksumPath = `${destinationPath}.sha256`;
  fs.writeFileSync(checksumPath, `${artifactSha256}  ${artifactName}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  const evidence = {
    schemaVersion: 2,
    compositionProtocolVersion: composition.protocolVersion,
    distributionId: composition.distributionId,
    productName: composition.brand.productName,
    version,
    platform: normalizedPlatform,
    architecture: normalizedArchitecture,
    sourceCommit: gitState.sourceCommit,
    sourceDirty: Boolean(gitState.sourceDirty),
    artifact: artifactName,
    artifactSha256,
    collectedAt: now.toISOString(),
    distributionScope: 'local-source-build',
    companyCodeSigned: false,
    notarized: false,
    platformSignature: inspectedSignature.platformSignature,
    signatureStates: [...inspectedSignature.signatureStates],
    inspectedCodeObjectCount: inspectedSignature.codeObjectCount,
    license: 'GPL-3.0-only',
  };
  const evidencePath = `${destinationPath}.json`;
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  atomicWriteJson(path.join(destinationDirectory, 'latest.json'), evidence);

  return {
    artifactPath: destinationPath,
    checksumPath,
    evidencePath,
    latestPath: path.join(destinationDirectory, 'latest.json'),
    platformKey,
  };
};
