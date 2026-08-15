#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  inspectAkshareSidecarBundle,
  inspectFinanceDataReaderSidecarBundle,
} from '../release/validate-native-runtime.mjs';
import {
  PROVIDER_IDS,
  ROOT_DIR,
  assertProviderHashes,
  readPinnedProviderVersion,
  readRegistry,
  selectProvider,
} from './connector-registry.mjs';

const usage = 'Usage: market-data:verify --provider=<id|all>';
const providerArgument = process.argv.slice(2).find((argument) =>
  argument.startsWith('--provider='),
);
if (
  !providerArgument ||
  process.argv.slice(2).length !== 1 ||
  providerArgument.length === '--provider='.length
) {
  throw new Error(usage);
}

const providerId = providerArgument.slice('--provider='.length);
const run = (command, args, failureCode) => {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(failureCode);
};

const verifyCcxtRuntime = (version) => {
  const script = [
    "const { createRequire } = require('node:module');",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const requireFromLocalApi = createRequire(process.cwd() + '/apps/desktop/local-api/package.json');",
    "let packageDirectory = path.dirname(requireFromLocalApi.resolve('ccxt'));",
    "while (!fs.existsSync(path.join(packageDirectory, 'package.json'))) { const parent = path.dirname(packageDirectory); if (parent === packageDirectory) throw new Error('CCXT_PACKAGE_JSON_MISSING'); packageDirectory = parent; }",
    "const packageJson = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));",
    "const ccxt = requireFromLocalApi('ccxt');",
    "if (packageJson.version !== process.argv[1]) throw new Error('CCXT_VERSION_MISMATCH');",
    "if (typeof ccxt.binance !== 'function' || typeof ccxt.okx !== 'function') throw new Error('CCXT_EXCHANGES_UNAVAILABLE');",
    "if (typeof new ccxt.binance().fetchOHLCV !== 'function' || typeof new ccxt.okx().fetchOHLCV !== 'function') throw new Error('CCXT_OHLCV_UNAVAILABLE');",
  ].join('');
  run(
    process.execPath,
    ['-e', script, version],
    'MARKET_DATA_CONNECTOR_RUNTIME_INVALID:ccxt',
  );
};

const inspectFrozenSidecar = (provider, registry) => {
  if (!provider.sidecar) return;
  const generatedRoot = path.join(ROOT_DIR, 'apps', 'desktop', 'shell', 'gen');
  const version = (id) => selectProvider(registry, id).version;
  const inspection = provider.sidecar.id === 'akshare'
    ? inspectAkshareSidecarBundle({
      generatedRoot,
      akshareVersion: version('akshare'),
      aktoolsVersion: version('aktools'),
    })
    : inspectFinanceDataReaderSidecarBundle({
      generatedRoot,
      financeDataReaderVersion: version('financedatareader'),
    });
  if (inspection.invalidPaths.length > 0) {
    throw new Error(
      'MARKET_DATA_CONNECTOR_FROZEN_PACKAGE_INVALID:' + provider.id + ':' +
      inspection.invalidPaths.map((filePath) => path.relative(ROOT_DIR, filePath)).join(','),
    );
  }
};

run(
  process.execPath,
  [path.join(ROOT_DIR, 'tools', 'market-data', 'generate-runtime-version-manifest.mjs'), '--check'],
  'MARKET_DATA_RUNTIME_VERSION_MANIFEST_INVALID',
);

const registry = readRegistry();
const providers = providerId === 'all'
  ? PROVIDER_IDS.map((id) => selectProvider(registry, id))
  : [selectProvider(registry, providerId)];
const checks = [];
for (const provider of providers) {
  assertProviderHashes(provider);
  const pinnedVersion = readPinnedProviderVersion(provider);
  if (pinnedVersion !== provider.version) {
    throw new Error(
      'MARKET_DATA_CONNECTOR_VERSION_DRIFT:' + provider.id + ':' +
      (pinnedVersion ?? 'missing') + ':' + provider.version,
    );
  }
  if (provider.ecosystem === 'pypi') {
    const projectPath = path.join(ROOT_DIR, provider.projectFile.file);
    const project = fs.readFileSync(projectPath, 'utf8');
    const packageName = provider.id === 'financedatareader'
      ? 'finance-datareader'
      : provider.id;
    if (!project.includes('"' + packageName + '==' + provider.version + '"')) {
      throw new Error('MARKET_DATA_CONNECTOR_PROJECT_DRIFT:' + provider.id);
    }
    run(
      'uv',
      ['lock', '--check', '--project', path.dirname(projectPath)],
      'MARKET_DATA_CONNECTOR_LOCK_INVALID:' + provider.id,
    );
  } else {
    verifyCcxtRuntime(provider.version);
  }
  checks.push({ provider: provider.id, version: provider.version, lock: 'verified' });
}

const verifiedSidecarIds = new Set();
for (const provider of providers.filter((entry) => entry.sidecar)) {
  const sidecarId = provider.sidecar.id;
  if (!verifiedSidecarIds.has(sidecarId)) {
    const script = sidecarId === 'financedatareader'
      ? 'finance-datareader-sidecar:build'
      : 'akshare-sidecar:build';
    run(
      'npm',
      ['run', script, '--workspace=@zinuto/desktop-local-api'],
      'MARKET_DATA_CONNECTOR_FROZEN_RUNTIME_INVALID:' + provider.id,
    );
    inspectFrozenSidecar(provider, registry);
    verifiedSidecarIds.add(sidecarId);
  }
  checks.find((check) => check.provider === provider.id).frozenRuntime = 'verified';
}

run(
  'npm',
  ['run', 'compliance:generate', '--', '--check'],
  'MARKET_DATA_CONNECTOR_COMPLIANCE_INVALID',
);
process.stdout.write(JSON.stringify({ verified: checks }, null, 2) + '\n');
