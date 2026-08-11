// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);

export const canonicalJsonStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const canonicalJsonSha256 = (value) =>
  crypto.createHash('sha256').update(canonicalJsonStringify(value), 'utf8').digest('hex');

const exactKeys = (value, expectedKeys) =>
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());

export const DESKTOP_LOCAL_FEATURE_FLAGS = Object.freeze({
  freeReplay: true,
  specialTraining: true,
  challengeStatistics: true,
  replayReview: true,
  notes: true,
  customIndicators: true,
  localMarketDataImport: true,
  localMarketDataAcquisition: true,
  bundledMarketSamples: true,
  strategyBacktesting: true,
  portablePackageV2: true,
});

export const validateDesktopFeatureManifest = (
  manifest,
  { expectedProductVersion } = {},
) => {
  if (!exactKeys(manifest, ['schemaVersion', 'productVersion', 'localFeatures'])) {
    throw new Error('[feature-manifest] manifest must describe local features only');
  }
  if (manifest.schemaVersion !== 3) {
    throw new Error('[feature-manifest] schemaVersion must be 3');
  }
  const productVersion = String(manifest.productVersion ?? '').trim();
  if (!/^2\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(productVersion)) {
    throw new Error('[feature-manifest] productVersion must be a valid 2.x version');
  }
  if (expectedProductVersion !== undefined && productVersion !== expectedProductVersion) {
    throw new Error('[feature-manifest] productVersion must match the desktop package version');
  }
  if (!exactKeys(manifest.localFeatures, Object.keys(DESKTOP_LOCAL_FEATURE_FLAGS))) {
    throw new Error('[feature-manifest] localFeatures must use the exact public schema');
  }
  for (const [feature, requiredValue] of Object.entries(DESKTOP_LOCAL_FEATURE_FLAGS)) {
    if (manifest.localFeatures[feature] !== requiredValue) {
      throw new Error(`[feature-manifest] localFeatures.${feature} must be ${requiredValue}`);
    }
  }
  return manifest;
};

const readNamedArg = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`[feature-manifest] missing ${name}`);
  }
  return process.argv[index + 1];
};

const main = () => {
  const manifestPath = path.resolve(readNamedArg('--manifest'));
  const expectedProductVersion = readNamedArg('--expected-product-version');
  const manifest = validateDesktopFeatureManifest(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    { expectedProductVersion },
  );
  process.stdout.write(`${canonicalJsonSha256(manifest)}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
