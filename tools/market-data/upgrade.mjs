#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROVIDER_IDS,
  ROOT_DIR,
  assertProviderHashes,
  parseUvLockVersions,
  readPinnedProviderVersion,
  readRegistry,
  selectProvider,
  sha256,
  writeRegistry,
} from './connector-registry.mjs';

const usage = 'Usage: market-data:upgrade --provider=<id> --version=<exact>';
const exactVersionPattern = /^[0-9A-Za-z.+-]{1,64}$/u;

const parseArguments = (args) => {
  const values = new Map();
  for (const argument of args) {
    const match = /^--(provider|version)=(.+)$/u.exec(argument);
    if (!match || values.has(match[1])) throw new Error(usage);
    values.set(match[1], match[2]);
  }
  const provider = values.get('provider');
  const version = values.get('version');
  if (values.size !== 2 || !provider || !exactVersionPattern.test(version ?? '')) {
    throw new Error(usage);
  }
  return { provider, version };
};

const packageNameFor = (provider) =>
  provider.id === 'financedatareader' ? 'finance-datareader' : provider.id;

const escapeRegExp = (value) => value.replace(/[-/\\^$*+?.()|[\]{}]/gu, '\\$&');

const readFileSnapshot = (filePath) => ({
  filePath,
  existed: fs.existsSync(filePath),
  contents: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
});

const restoreSnapshot = (snapshot) => {
  for (const entry of snapshot) {
    if (entry.existed) {
      fs.mkdirSync(path.dirname(entry.filePath), { recursive: true });
      fs.writeFileSync(entry.filePath, entry.contents);
    } else {
      fs.rmSync(entry.filePath, { force: true });
    }
  }
};

const updateJsonFile = (filePath, updater) => {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = updater(value);
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n');
  return updated;
};

const normalizeLicense = (value) => {
  const normalized = String(value ?? '').trim().replace(/\s+/gu, ' ');
  if (/^MIT(?: License)?$/iu.test(normalized)) return 'MIT';
  if (/^Apache(?: License)?(?:,? Version)? 2\.0$/iu.test(normalized)) {
    return 'Apache-2.0';
  }
  return normalized;
};

const candidateMetadata = async (provider, version) => {
  const packageName = packageNameFor(provider);
  const endpoint = provider.ecosystem === 'npm'
    ? 'https://registry.npmjs.org/' + encodeURIComponent(packageName) + '/' + encodeURIComponent(version)
    : 'https://pypi.org/pypi/' + encodeURIComponent(packageName) + '/' + encodeURIComponent(version) + '/json';
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      'MARKET_DATA_CONNECTOR_CANDIDATE_UNAVAILABLE:' + provider.id + ':HTTP_' + response.status,
    );
  }
  const payload = await response.json();
  const returnedVersion = provider.ecosystem === 'npm'
    ? payload.version
    : payload.info?.version;
  if (returnedVersion !== version) {
    throw new Error('MARKET_DATA_CONNECTOR_CANDIDATE_VERSION_MISMATCH:' + provider.id);
  }
  const classifiers = provider.ecosystem === 'pypi' && Array.isArray(payload.info?.classifiers)
    ? payload.info.classifiers
    : [];
  const declared = provider.ecosystem === 'npm'
    ? payload.license
    : payload.info?.license || classifiers.find((entry) => /MIT License/iu.test(entry));
  const license = normalizeLicense(declared);
  if (!license || license !== provider.license) {
    const error = new Error('MARKET_DATA_CONNECTOR_LICENSE_REVIEW_REQUIRED:' + provider.id);
    error.review = {
      reason: 'license-metadata-changed-or-missing',
      metadataUrl: endpoint,
      observedLicense: license || null,
      expectedLicense: provider.license,
    };
    throw error;
  }
  return { endpoint, license };
};

const diffVersionMaps = (before, after) => {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .filter((key) => before.get(key) !== after.get(key))
    .sort()
    .map((key) => ({ key, before: before.get(key) ?? null, after: after.get(key) ?? null }));
};

const readNpmLockVersions = (contents) => {
  const lock = JSON.parse(contents);
  return new Map(
    Object.entries(lock.packages ?? {})
      .filter(([packagePath, metadata]) => packagePath.includes('node_modules/') && metadata?.version)
      .map(([packagePath, metadata]) => [packagePath, String(metadata.version)]),
  );
};

const sidecarReviewPathFor = (provider) => {
  if (provider.id === 'financedatareader') {
    return path.join(
      ROOT_DIR,
      'config',
      'open-source',
      'finance-datareader-sidecar-dependencies.json',
    );
  }
  if (provider.id === 'akshare' || provider.id === 'aktools') {
    return path.join(ROOT_DIR, 'config', 'open-source', 'python-sidecar-dependencies.json');
  }
  return null;
};

const updateSidecarReview = ({ provider, version, lockContents, projectContents }) => {
  const reviewPath = sidecarReviewPathFor(provider);
  if (!reviewPath) return;
  const packageName = packageNameFor(provider);
  updateJsonFile(reviewPath, (manifest) => {
    const packageReview = manifest.packages?.find((entry) => entry?.name === packageName);
    const rootPackage = manifest.requiredRootPackages?.find((entry) => entry?.name === packageName);
    const connector = manifest.connectorSoftware?.find((entry) => entry?.name === packageName);
    if (!packageReview || !rootPackage || !connector) {
      throw new Error('MARKET_DATA_CONNECTOR_LICENSE_REVIEW_MANIFEST_INVALID:' + provider.id);
    }
    packageReview.version = version;
    packageReview.evidence =
      'Exact-release PyPI Core Metadata and bundled license files: https://pypi.org/project/' +
      packageName + '/' + version + '/';
    rootPackage.version = version;
    connector.version = version;
    manifest.lockSha256 = sha256(lockContents);
    manifest.projectSha256 = sha256(projectContents);
    return manifest;
  });
};

const run = (command, args, failureCode) => {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(failureCode);
};

const writeReviewReport = ({ provider, version, before, metadata, graphDiff, reason }) => {
  const reportDir = path.join(ROOT_DIR, '.cache', 'market-data-upgrades');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, provider.id + '-' + version + '.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    provider: provider.id,
    requestedVersion: version,
    before,
    candidate: metadata ?? null,
    capabilityFingerprint: provider.capabilityFingerprint,
    upstreamTerms: provider.upstreamTerms,
    semanticReviewRequired: true,
    reason,
    dependencyGraphDiff: graphDiff,
    policy: 'No adapter source was rewritten. The selected dependency graph was restored after this review stop.',
  }, null, 2) + '\n');
  return reportPath;
};

const { provider: providerId, version } = parseArguments(process.argv.slice(2));
if (!PROVIDER_IDS.includes(providerId)) {
  throw new Error('MARKET_DATA_PROVIDER_INVALID:' + providerId);
}
const registry = readRegistry();
const provider = selectProvider(registry, providerId);
assertProviderHashes(provider);
const pinnedVersion = readPinnedProviderVersion(provider);
if (pinnedVersion !== provider.version) {
  throw new Error(
    'MARKET_DATA_CONNECTOR_VERSION_DRIFT:' + provider.id + ':' +
    (pinnedVersion ?? 'missing') + ':' + provider.version,
  );
}
if (provider.version === version) {
  process.stdout.write(JSON.stringify({ provider: provider.id, version, changed: false }) + '\n');
  process.exit(0);
}

const before = {
  version: provider.version,
  capabilityFingerprint: provider.capabilityFingerprint,
  license: provider.license,
  upstreamTerms: provider.upstreamTerms,
};
let metadata = null;
try {
  metadata = await candidateMetadata(provider, version);
} catch (error) {
  const reportPath = writeReviewReport({
    provider,
    version,
    before,
    metadata: error?.review ?? null,
    graphDiff: [],
    reason: error instanceof Error ? error.message : String(error),
  });
  throw new Error(
    'MARKET_DATA_CONNECTOR_SEMANTIC_REVIEW_REQUIRED:' + provider.id + ':report=' + reportPath,
  );
}

const projectPath = path.join(ROOT_DIR, provider.projectFile.file);
const lockPath = path.join(ROOT_DIR, provider.dependencyLock.file);
const sidecarReviewPath = sidecarReviewPathFor(provider);
const snapshotPaths = [
  projectPath,
  lockPath,
  path.join(ROOT_DIR, 'config', 'open-source', 'market-data-connectors.v1.json'),
  path.join(ROOT_DIR, 'apps', 'desktop', 'local-api', 'src', 'application', 'market-data-acquisition', 'marketDataConnectorVersions.generated.ts'),
  path.join(ROOT_DIR, 'apps', 'desktop', 'local-api', 'sidecars', 'finance-datareader', 'connector-versions.json'),
  path.join(ROOT_DIR, 'sbom.cdx.json'),
  path.join(ROOT_DIR, 'THIRD_PARTY_NOTICES.md'),
  ...(sidecarReviewPath ? [sidecarReviewPath] : []),
];
const snapshot = [
  ...new Map(snapshotPaths.map((filePath) => [filePath, readFileSnapshot(filePath)])).values(),
];
const beforeLock = fs.readFileSync(lockPath, 'utf8');

try {
  if (provider.ecosystem === 'pypi') {
    const packageName = packageNameFor(provider);
    const project = fs.readFileSync(projectPath, 'utf8');
    const nextProject = project.replace(
      new RegExp('"' + escapeRegExp(packageName) + '==[^"]+"', 'u'),
      '"' + packageName + '==' + version + '"',
    );
    if (nextProject === project) {
      throw new Error('MARKET_DATA_CONNECTOR_PROJECT_DRIFT:' + provider.id);
    }
    fs.writeFileSync(projectPath, nextProject);
    run(
      'uv',
      ['lock', '--project', path.dirname(projectPath)],
      'MARKET_DATA_CONNECTOR_LOCK_UPDATE_FAILED:' + provider.id,
    );
  } else {
    run(
      'npm',
      [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--save-exact',
        'ccxt@' + version,
        '--workspace=@zinuto/desktop-local-api',
      ],
      'MARKET_DATA_CONNECTOR_LOCK_UPDATE_FAILED:ccxt',
    );
  }

  const afterLock = fs.readFileSync(lockPath, 'utf8');
  const graphDiff = provider.ecosystem === 'pypi'
    ? diffVersionMaps(parseUvLockVersions(beforeLock), parseUvLockVersions(afterLock))
    : diffVersionMaps(readNpmLockVersions(beforeLock), readNpmLockVersions(afterLock));
  const allowedGraphKey = provider.ecosystem === 'pypi'
    ? packageNameFor(provider)
    : 'node_modules/ccxt';
  if (graphDiff.some((entry) => entry.key !== allowedGraphKey)) {
    const reportPath = writeReviewReport({
      provider,
      version,
      before,
      metadata,
      graphDiff,
      reason: 'dependency-graph-changed-outside-selected-root',
    });
    throw new Error(
      'MARKET_DATA_CONNECTOR_SEMANTIC_REVIEW_REQUIRED:' + provider.id + ':report=' + reportPath,
    );
  }

  if (provider.ecosystem === 'pypi') {
    updateSidecarReview({
      provider,
      version,
      lockContents: afterLock,
      projectContents: fs.readFileSync(projectPath, 'utf8'),
    });
  }

  provider.version = version;
  for (const registryProvider of registry.providers) {
    if (registryProvider.dependencyLock.file === provider.dependencyLock.file) {
      registryProvider.dependencyLock.sha256 = sha256(fs.readFileSync(
        path.join(ROOT_DIR, registryProvider.dependencyLock.file),
      ));
    }
    if (registryProvider.projectFile.file === provider.projectFile.file) {
      registryProvider.projectFile.sha256 = sha256(fs.readFileSync(
        path.join(ROOT_DIR, registryProvider.projectFile.file),
      ));
    }
  }
  writeRegistry(registry);
  run(
    process.execPath,
    [path.join(ROOT_DIR, 'tools', 'market-data', 'generate-runtime-version-manifest.mjs')],
    'MARKET_DATA_RUNTIME_VERSION_MANIFEST_GENERATION_FAILED:' + provider.id,
  );
  run(
    'npm',
    ['run', 'compliance:generate'],
    'MARKET_DATA_CONNECTOR_COMPLIANCE_GENERATION_FAILED:' + provider.id,
  );
  run(
    process.execPath,
    [path.join(ROOT_DIR, 'tools', 'market-data', 'verify.mjs'), '--provider=' + provider.id],
    'MARKET_DATA_CONNECTOR_COMPATIBILITY_FAILED:' + provider.id,
  );
  process.stdout.write(JSON.stringify({
    provider: provider.id,
    before: before.version,
    version,
    changed: true,
    metadata,
    dependencyGraphDiff: graphDiff,
    generated: ['lock', 'connector-registry', 'runtime-version-manifest', 'SBOM', 'THIRD_PARTY_NOTICES'],
  }, null, 2) + '\n');
} catch (error) {
  restoreSnapshot(snapshot);
  throw error;
}
