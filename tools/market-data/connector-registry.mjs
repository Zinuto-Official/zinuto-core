// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const REGISTRY_PATH = path.join(
  ROOT_DIR,
  'config',
  'open-source',
  'market-data-connectors.v1.json',
);
export const PROVIDER_IDS = ['akshare', 'aktools', 'ccxt', 'financedatareader'];

export const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

export const resolveRepositoryPath = (relativePath, label) => {
  if (
    typeof relativePath !== 'string' ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error(`MARKET_DATA_REGISTRY_PATH_INVALID:${label}`);
  }
  return path.join(ROOT_DIR, relativePath);
};

export const readRegistry = () => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  if (
    registry?.schemaVersion !== 1 ||
    !Array.isArray(registry.providers) ||
    registry.providers.length !== PROVIDER_IDS.length
  ) {
    throw new Error('MARKET_DATA_CONNECTOR_REGISTRY_INVALID');
  }
  const found = new Set();
  for (const provider of registry.providers) {
    if (
      !PROVIDER_IDS.includes(provider?.id) ||
      found.has(provider.id) ||
      !/^[0-9A-Za-z.+-]{1,64}$/u.test(String(provider.version ?? '')) ||
      !/^[A-Za-z0-9 .()+-]{1,128}$/u.test(String(provider.license ?? '')) ||
      typeof provider.projectUrl !== 'string' ||
      !Array.isArray(provider.upstreamTerms) ||
      !provider.capabilityFingerprint
    ) {
      throw new Error('MARKET_DATA_CONNECTOR_REGISTRY_INVALID');
    }
    found.add(provider.id);
  }
  if (found.size !== PROVIDER_IDS.length) {
    throw new Error('MARKET_DATA_CONNECTOR_REGISTRY_INVALID');
  }
  return registry;
};

export const selectProvider = (registry, providerId) => {
  if (!PROVIDER_IDS.includes(providerId)) {
    throw new Error(`MARKET_DATA_PROVIDER_INVALID:${providerId || '(empty)'}`);
  }
  const provider = registry.providers.find((entry) => entry.id === providerId);
  if (!provider) throw new Error(`MARKET_DATA_PROVIDER_MISSING:${providerId}`);
  return provider;
};

export const parseUvLockVersions = (contents) => {
  const result = new Map();
  for (const block of contents.split(/^\[\[package\]\]\s*$/mu).slice(1)) {
    const name = block.match(/^name = "([^"]+)"\s*$/mu)?.[1];
    const version = block.match(/^version = "([^"]+)"\s*$/mu)?.[1];
    if (name && version) result.set(name, version);
  }
  return result;
};

export const providerRootPackageName = (providerId) =>
  providerId === 'financedatareader'
    ? 'finance-datareader'
    : providerId;

export const readPinnedProviderVersion = (provider) => {
  if (provider.ecosystem === 'pypi') {
    const lockPath = resolveRepositoryPath(provider.dependencyLock.file, 'dependencyLock');
    return parseUvLockVersions(fs.readFileSync(lockPath, 'utf8')).get(
      providerRootPackageName(provider.id),
    ) ?? null;
  }
  if (provider.ecosystem === 'npm') {
    const lockPath = resolveRepositoryPath(provider.dependencyLock.file, 'dependencyLock');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return lock.packages?.['node_modules/ccxt']?.version ?? null;
  }
  return null;
};

export const assertProviderHashes = (provider) => {
  for (const [field, descriptor] of [
    ['dependencyLock', provider.dependencyLock],
    ['projectFile', provider.projectFile],
  ]) {
    const filePath = resolveRepositoryPath(descriptor?.file, field);
    const actual = sha256(fs.readFileSync(filePath));
    if (!/^[a-f0-9]{64}$/u.test(String(descriptor?.sha256 ?? '')) || actual !== descriptor.sha256) {
      throw new Error(`MARKET_DATA_CONNECTOR_HASH_DRIFT:${provider.id}:${field}:${actual}`);
    }
  }
};

export const writeRegistry = (registry) => {
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
};
