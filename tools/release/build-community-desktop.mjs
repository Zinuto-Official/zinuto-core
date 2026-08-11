#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT_DIR,
  nodeCommand,
  runCommand,
} from './desktop-command-utils.mjs';
import {
  defaultCommunityArtifactRoot,
  exportCommunityArtifact,
} from './community-artifacts.mjs';
import { prepareLocalPackageSignature } from './local-package-signature.mjs';

const scriptPath = fileURLToPath(import.meta.url);

const signingEnvironmentKeys = Object.freeze([
  'APPLE_SIGNING_IDENTITY',
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_ID',
  'APPLE_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_API_ISSUER',
  'APPLE_API_KEY',
  'APPLE_API_KEY_PATH',
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'WINDOWS_CERTIFICATE_THUMBPRINT',
  'WINDOWS_CERTIFICATE_PASSWORD',
  'ZINUTO_DEVELOPER_ID_APPLICATION_IDENTITY',
  'ZINUTO_MACOS_NOTARY_KEYCHAIN_PROFILE',
  'ZINUTO_WINDOWS_DIRECT_SIGNER_THUMBPRINT',
  'ZINUTO_WINDOWS_TIMESTAMP_URL',
]);

const signingEnvironmentPrefixes = Object.freeze([
  'ZINUTO_APPSTORE_',
  'MICROSOFT_STORE_',
]);

export const createUnsignedPackageEnvironment = (environment = process.env) => {
  const sanitized = { ...environment };
  for (const key of signingEnvironmentKeys) delete sanitized[key];
  for (const key of Object.keys(sanitized)) {
    if (signingEnvironmentPrefixes.some((prefix) => key.startsWith(prefix))) {
      delete sanitized[key];
    }
  }
  return sanitized;
};

export const parseCommunityPackageArguments = (args) => {
  let outputRoot = defaultCommunityArtifactRoot();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--output-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--output-dir requires a directory path.');
      }
      outputRoot = path.resolve(value);
      index += 1;
    } else if (arg.startsWith('--output-dir=')) {
      const value = arg.slice('--output-dir='.length).trim();
      if (!value) {
        throw new Error('--output-dir requires a directory path.');
      }
      outputRoot = path.resolve(value);
    } else {
      throw new Error(`Unsupported package option ${arg}. Only --output-dir is accepted.`);
    }
  }
  return { outputRoot };
};

const main = () => {
  const { outputRoot } = parseCommunityPackageArguments(process.argv.slice(2));

  runCommand(
    nodeCommand,
    ['./tools/release/run-tauri-desktop.mjs', 'build'],
    'Building the local Zinuto Core package without a distributor signature',
    {
      cwd: ROOT_DIR,
      env: createUnsignedPackageEnvironment(),
      logPrefix: 'core-local-package',
    },
  );

  prepareLocalPackageSignature();

  const exported = exportCommunityArtifact({ outputRoot });

  // eslint-disable-next-line no-console
  console.log(`[core-local-package] ready: ${exported.artifactPath}`);
  // eslint-disable-next-line no-console
  console.log(`[core-local-package] sha256: ${exported.checksumPath}`);
  // eslint-disable-next-line no-console
  console.log('[core-local-package] verified: no distributor certificate and no notarization');
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main();
