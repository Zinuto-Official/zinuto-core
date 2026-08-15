#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { PROVIDER_IDS, readPinnedProviderVersion, readRegistry, selectProvider } from './connector-registry.mjs';

const args = new Set(process.argv.slice(2));
if (![...args].every((argument) => argument === '--check')) {
  throw new Error('Usage: market-data:versions --check');
}
if (!args.has('--check')) {
  throw new Error('Usage: market-data:versions --check');
}

const latestVersion = async (provider) => {
  const endpoint = provider.ecosystem === 'npm'
    ? 'https://registry.npmjs.org/ccxt/latest'
    : `https://pypi.org/pypi/${provider.id === 'financedatareader' ? 'finance-datareader' : provider.id}/json`;
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  const candidate = provider.ecosystem === 'npm'
    ? payload.version
    : payload.info?.version;
  if (!/^[0-9A-Za-z.+-]{1,64}$/u.test(String(candidate ?? ''))) {
    throw new Error('VERSION_RESPONSE_INVALID');
  }
  return candidate;
};

const registry = readRegistry();
const results = await Promise.all(PROVIDER_IDS.map(async (id) => {
  const provider = selectProvider(registry, id);
  const pinned = readPinnedProviderVersion(provider);
  try {
    const candidate = await latestVersion(provider);
    return { provider: id, pinned, candidate, updateAvailable: candidate !== pinned };
  } catch (error) {
    return {
      provider: id,
      pinned,
      candidate: null,
      updateAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}));
process.stdout.write(`${JSON.stringify({ mode: 'read-only', results }, null, 2)}\n`);
