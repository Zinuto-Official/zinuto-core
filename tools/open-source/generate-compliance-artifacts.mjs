#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');
const rootPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const applicationVersion = String(rootPackage.version ?? '').trim();
if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(applicationVersion)) {
  throw new Error('[license-audit] root package version must be a complete SemVer value');
}
const sbomPath = path.join(rootDir, 'sbom.cdx.json');
const noticesPath = path.join(rootDir, 'THIRD_PARTY_NOTICES.md');
const licenseOverridesPath = path.join(
  rootDir,
  'config',
  'open-source',
  'dependency-license-overrides.json',
);
const pythonSidecarManifestPath = path.join(
  rootDir,
  'config',
  'open-source',
  'python-sidecar-dependencies.json',
);
const financeDataReaderSidecarManifestPath = path.join(
  rootDir,
  'config',
  'open-source',
  'finance-datareader-sidecar-dependencies.json',
);

const normalizeLicense = (value) => String(value ?? '').trim();
const deniedLicensePattern = /(?:UNLICENSED|PROPRIETARY|SEE LICENSE|LicenseRef)/iu;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const readJsonManifest = (filePath, label) => {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (manifest?.schemaVersion !== 1) {
    throw new Error(`[license-audit] ${label} must use schemaVersion 1`);
  }
  return manifest;
};

const parseUvLockPackages = (contents) => contents
  .split(/^\[\[package\]\]\s*$/mu)
  .slice(1)
  .map((block) => {
    const name = block.match(/^name = "([^"]+)"\s*$/mu)?.[1];
    const version = block.match(/^version = "([^"]+)"\s*$/mu)?.[1];
    const source = block.match(/^source = \{ ([^\n]+) \}\s*$/mu)?.[1] ?? '';
    if (!name || !version || !source) {
      throw new Error('[license-audit] uv.lock package entry is incomplete');
    }
    return { name, version, registry: /registry = /u.test(source) };
  });

const licenseOverridesManifest = readJsonManifest(
  licenseOverridesPath,
  'dependency license overrides',
);
if (
  !Array.isArray(licenseOverridesManifest.entries)
) {
  throw new Error('[license-audit] dependency license overrides entries must be an array');
}
const licenseOverrides = new Map();
for (const entry of licenseOverridesManifest.entries) {
  const key = `${entry.ecosystem}:${entry.name}@${entry.version}`;
  if (licenseOverrides.has(key)) {
    throw new Error(`[license-audit] duplicate dependency license override: ${key}`);
  }
  if (
    !entry.declaredLicense
    || !entry.spdxExpression
    || !entry.evidence
    || deniedLicensePattern.test(entry.spdxExpression)
  ) {
    throw new Error(`[license-audit] incomplete dependency license override: ${key}`);
  }
  licenseOverrides.set(key, entry);
}
const usedLicenseOverrides = new Set();

const resolveAuditableLicense = ({ ecosystem, name, version, declaredLicense }) => {
  const key = `${ecosystem}:${name}@${version}`;
  const override = licenseOverrides.get(key);
  if (override) {
    if (override.declaredLicense !== declaredLicense) {
      throw new Error(
        `[license-audit] ${key} declaration changed; re-review override evidence`,
      );
    }
    usedLicenseOverrides.add(key);
    return {
      declaredLicense,
      license: override.spdxExpression,
      licenseEvidence: override.evidence,
    };
  }
  if (!declaredLicense || deniedLicensePattern.test(declaredLicense)) {
    throw new Error(
      `[license-audit] ${key} has an unauditable license: ${declaredLicense || '(missing)'}`,
    );
  }
  return { declaredLicense, license: declaredLicense, licenseEvidence: null };
};

const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
const npmComponents = Object.entries(lock.packages ?? {})
  .filter(([packagePath, metadata]) =>
    packagePath.includes('node_modules/') && metadata?.version,
  )
  .map(([packagePath, metadata]) => {
    const nodeModulesIndex = packagePath.lastIndexOf('node_modules/');
    const name = packagePath.slice(nodeModulesIndex + 'node_modules/'.length);
    const licenseResolution = resolveAuditableLicense({
      ecosystem: 'npm',
      name,
      version: metadata.version,
      declaredLicense: normalizeLicense(metadata.license),
    });
    return {
      ecosystem: 'npm',
      name,
      version: String(metadata.version),
      ...licenseResolution,
      development: metadata.dev === true,
      purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(metadata.version)}`,
    };
  });

const pythonSidecarManifest = readJsonManifest(
  pythonSidecarManifestPath,
  'Python sidecar dependency manifest',
);
if (
  !pythonSidecarManifest.id
  || !pythonSidecarManifest.pythonRuntime
  || !pythonSidecarManifest.buildTool
  || !Array.isArray(pythonSidecarManifest.packages)
  || !Array.isArray(pythonSidecarManifest.connectorSoftware)
  || !Array.isArray(pythonSidecarManifest.marketDataProviderTerms)
) {
  throw new Error('[license-audit] Python sidecar dependency manifest is incomplete');
}

const resolveRepositoryPath = (relativePath, fieldName) => {
  if (
    typeof relativePath !== 'string'
    || path.isAbsolute(relativePath)
    || relativePath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error(`[license-audit] invalid Python sidecar ${fieldName}`);
  }
  return path.join(rootDir, relativePath);
};

const lockPath = resolveRepositoryPath(pythonSidecarManifest.lockFile, 'lockFile');
const projectPath = resolveRepositoryPath(pythonSidecarManifest.projectFile, 'projectFile');
const pythonVersionPath = resolveRepositoryPath(
  pythonSidecarManifest.pythonVersionFile,
  'pythonVersionFile',
);
const lockContents = fs.readFileSync(lockPath, 'utf8');
const projectContents = fs.readFileSync(projectPath, 'utf8');
const pythonVersionContents = fs.readFileSync(pythonVersionPath, 'utf8');
const expectedFiles = [
  ['uv.lock', lockContents, pythonSidecarManifest.lockSha256],
  ['pyproject.toml', projectContents, pythonSidecarManifest.projectSha256],
  ['.python-version', pythonVersionContents, pythonSidecarManifest.pythonVersionFileSha256],
];
for (const [label, contents, expectedDigest] of expectedFiles) {
  const actualDigest = sha256(contents);
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest) || actualDigest !== expectedDigest) {
    throw new Error(
      `[license-audit] Python sidecar ${label} SHA-256 mismatch: ${actualDigest}`,
    );
  }
}

const pythonVersion = normalizeLicense(pythonSidecarManifest.pythonRuntime.version);
if (pythonVersionContents.trim() !== pythonVersion) {
  throw new Error('[license-audit] Python sidecar interpreter version drifted');
}
if (!projectContents.includes(`requires-python = ">=${pythonVersion},<3.12"`)) {
  throw new Error('[license-audit] Python sidecar requires-python is not exactly pinned');
}
const requiredRootCoordinates = pythonSidecarManifest.requiredRootPackages.map(
  ({ name, version }) => `${name}==${version}`,
);
for (const coordinate of requiredRootCoordinates) {
  if (!projectContents.includes(`"${coordinate}"`)) {
    throw new Error(`[license-audit] Python sidecar root dependency drifted: ${coordinate}`);
  }
}

const uvVersion = normalizeLicense(pythonSidecarManifest.buildTool.version);
const uvResult = spawnSync('uv', ['--version'], { cwd: rootDir, encoding: 'utf8' });
if (
  uvResult.status !== 0
  || !new RegExp(`^uv ${uvVersion.replaceAll('.', '\\.')}(?:\\s|$)`, 'u')
    .test((uvResult.stdout ?? '').trim())
) {
  throw new Error(
    `[license-audit] uv ${uvVersion} is required to audit the Python sidecar`,
  );
}

const uvLockPackages = parseUvLockPackages(lockContents).filter(({ registry }) => registry);
const manifestPythonKeys = new Set();
for (const entry of pythonSidecarManifest.packages) {
  const key = `${entry.name}@${entry.version}`;
  if (manifestPythonKeys.has(key)) {
    throw new Error(`[license-audit] duplicate Python sidecar package: ${key}`);
  }
  if (
    !entry.name
    || !entry.version
    || !entry.spdxExpression
    || !entry.evidence
    || deniedLicensePattern.test(entry.spdxExpression)
  ) {
    throw new Error(`[license-audit] incomplete Python sidecar package review: ${key}`);
  }
  manifestPythonKeys.add(key);
}
const lockPythonKeys = new Set(uvLockPackages.map(({ name, version }) => `${name}@${version}`));
const missingPythonReviews = [...lockPythonKeys].filter((key) => !manifestPythonKeys.has(key));
const stalePythonReviews = [...manifestPythonKeys].filter((key) => !lockPythonKeys.has(key));
if (missingPythonReviews.length > 0 || stalePythonReviews.length > 0) {
  throw new Error(
    `[license-audit] Python sidecar license review drifted; missing=${missingPythonReviews.join(',') || '(none)'} stale=${stalePythonReviews.join(',') || '(none)'}`,
  );
}

const pythonComponents = pythonSidecarManifest.packages.map((entry) => ({
  ecosystem: 'pypi',
  name: entry.name,
  version: entry.version,
  declaredLicense: entry.declaredLicense ?? entry.spdxExpression,
  license: entry.spdxExpression,
  licenseEvidence: entry.evidence,
  development: false,
  role: entry.role ?? 'sidecar-lock',
  purl: `pkg:pypi/${encodeURIComponent(entry.name)}@${encodeURIComponent(entry.version)}`,
  sourceUrl: `https://pypi.org/project/${encodeURIComponent(entry.name)}/${encodeURIComponent(entry.version)}/`,
}));

const auditedStandaloneComponent = (entry, defaults) => {
  if (
    !entry.name
    || !entry.version
    || !entry.spdxExpression
    || !entry.evidence
    || deniedLicensePattern.test(entry.spdxExpression)
  ) {
    throw new Error(`[license-audit] incomplete ${defaults.role} review`);
  }
  return {
    ...defaults,
    name: entry.name,
    version: entry.version,
    declaredLicense: entry.declaredLicense ?? entry.spdxExpression,
    license: entry.spdxExpression,
    licenseEvidence: entry.evidence,
    purl: entry.purl,
    sourceUrl: entry.sourceUrl,
  };
};
const pythonRuntimeComponent = auditedStandaloneComponent(
  pythonSidecarManifest.pythonRuntime,
  {
    ecosystem: 'runtime',
    development: false,
    role: 'bundled-sidecar-runtime',
    type: 'framework',
  },
);
const uvBuildToolComponent = auditedStandaloneComponent(
  pythonSidecarManifest.buildTool,
  {
    ecosystem: 'build-tool',
    development: true,
    role: 'reproducible-build-tool',
    type: 'application',
  },
);

const auditAdditionalPythonSidecarManifest = (manifestPath, label) => {
  const manifest = readJsonManifest(manifestPath, label);
  if (
    !manifest.id ||
    !manifest.pythonRuntime ||
    !manifest.buildTool ||
    !Array.isArray(manifest.packages) ||
    !Array.isArray(manifest.connectorSoftware) ||
    !Array.isArray(manifest.marketDataProviderTerms)
  ) {
    throw new Error(`[license-audit] ${label} is incomplete`);
  }
  const additionalLockPath = resolveRepositoryPath(manifest.lockFile, 'lockFile');
  const additionalProjectPath = resolveRepositoryPath(manifest.projectFile, 'projectFile');
  const additionalPythonVersionPath = resolveRepositoryPath(
    manifest.pythonVersionFile,
    'pythonVersionFile',
  );
  const additionalLockContents = fs.readFileSync(additionalLockPath, 'utf8');
  const additionalProjectContents = fs.readFileSync(additionalProjectPath, 'utf8');
  const additionalPythonVersionContents = fs.readFileSync(
    additionalPythonVersionPath,
    'utf8',
  );
  for (const [fileLabel, contents, expectedDigest] of [
    ['uv.lock', additionalLockContents, manifest.lockSha256],
    ['pyproject.toml', additionalProjectContents, manifest.projectSha256],
    ['.python-version', additionalPythonVersionContents, manifest.pythonVersionFileSha256],
  ]) {
    const actual = sha256(contents);
    if (!/^[a-f0-9]{64}$/u.test(expectedDigest) || actual !== expectedDigest) {
      throw new Error(`[license-audit] ${label} ${fileLabel} SHA-256 mismatch: ${actual}`);
    }
  }
  const additionalPythonVersion = normalizeLicense(manifest.pythonRuntime.version);
  if (
    additionalPythonVersionContents.trim() !== additionalPythonVersion ||
    !additionalProjectContents.includes(
      `requires-python = ">=${additionalPythonVersion},<3.12"`,
    )
  ) {
    throw new Error(`[license-audit] ${label} interpreter pin drifted`);
  }
  for (const { name, version } of manifest.requiredRootPackages ?? []) {
    if (!additionalProjectContents.includes(`"${name}==${version}"`)) {
      throw new Error(`[license-audit] ${label} root dependency drifted: ${name}`);
    }
  }
  const additionalUvVersion = normalizeLicense(manifest.buildTool.version);
  if (additionalUvVersion !== uvVersion) {
    throw new Error(`[license-audit] ${label} requires a different uv version`);
  }
  const reviewed = new Map();
  for (const entry of manifest.packages) {
    const key = `${entry.name}@${entry.version}`;
    if (
      reviewed.has(key) ||
      !entry.name ||
      !entry.version ||
      !entry.spdxExpression ||
      !entry.evidence ||
      deniedLicensePattern.test(entry.spdxExpression)
    ) {
      throw new Error(`[license-audit] incomplete ${label} package review: ${key}`);
    }
    reviewed.set(key, entry);
  }
  const lockKeys = new Set(
    parseUvLockPackages(additionalLockContents)
      .filter(({ registry }) => registry)
      .map(({ name, version }) => `${name}@${version}`),
  );
  const missing = [...lockKeys].filter((key) => !reviewed.has(key));
  const stale = [...reviewed.keys()].filter((key) => !lockKeys.has(key));
  if (missing.length || stale.length) {
    throw new Error(
      `[license-audit] ${label} license review drifted; missing=${missing.join(',') || '(none)'} stale=${stale.join(',') || '(none)'}`,
    );
  }
  return {
    manifest,
    pythonVersion: additionalPythonVersion,
    pythonComponents: [...reviewed.values()].map((entry) => ({
      ecosystem: 'pypi',
      name: entry.name,
      version: entry.version,
      declaredLicense: entry.declaredLicense ?? entry.spdxExpression,
      license: entry.spdxExpression,
      licenseEvidence: entry.evidence,
      development: false,
      role: entry.role ?? 'sidecar-lock',
      purl: `pkg:pypi/${encodeURIComponent(entry.name)}@${encodeURIComponent(entry.version)}`,
      sourceUrl: `https://pypi.org/project/${encodeURIComponent(entry.name)}/${encodeURIComponent(entry.version)}/`,
    })),
    pythonRuntimeComponent: auditedStandaloneComponent(manifest.pythonRuntime, {
      ecosystem: 'runtime',
      development: false,
      role: 'bundled-sidecar-runtime',
      type: 'framework',
    }),
    uvBuildToolComponent: auditedStandaloneComponent(manifest.buildTool, {
      ecosystem: 'build-tool',
      development: true,
      role: 'reproducible-build-tool',
      type: 'application',
    }),
  };
};

const financeDataReaderSidecarAudit = auditAdditionalPythonSidecarManifest(
  financeDataReaderSidecarManifestPath,
  'FinanceDataReader Python sidecar dependency manifest',
);

const cargoManifests = [
  'apps/desktop/shell/Cargo.toml',
  'apps/desktop/backtest-engine/Cargo.toml',
];
const rustById = new Map();
for (const manifest of cargoManifests) {
  const result = spawnSync(
    'cargo',
    [
      'metadata',
      '--format-version',
      '1',
      '--locked',
      '--manifest-path',
      path.join(rootDir, manifest),
    ],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`[license-audit] cargo metadata failed for ${manifest}: ${result.stderr}`);
  }
  const metadata = JSON.parse(result.stdout);
  for (const pkg of metadata.packages ?? []) {
    if (!pkg.source) continue;
    const licenseResolution = resolveAuditableLicense({
      ecosystem: 'cargo',
      name: pkg.name,
      version: pkg.version,
      declaredLicense: normalizeLicense(pkg.license),
    });
    rustById.set(`${pkg.name}@${pkg.version}`, {
      ecosystem: 'cargo',
      name: String(pkg.name),
      version: String(pkg.version),
      ...licenseResolution,
      development: false,
      purl: `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`,
    });
  }
}

const unusedLicenseOverrides = [...licenseOverrides.keys()].filter(
  (key) => !usedLicenseOverrides.has(key),
);
if (unusedLicenseOverrides.length > 0) {
  throw new Error(
    `[license-audit] stale dependency license overrides: ${unusedLicenseOverrides.join(', ')}`,
  );
}

const components = [
  ...npmComponents,
  ...rustById.values(),
  ...pythonComponents,
  ...financeDataReaderSidecarAudit.pythonComponents,
  pythonRuntimeComponent,
  financeDataReaderSidecarAudit.pythonRuntimeComponent,
  uvBuildToolComponent,
  financeDataReaderSidecarAudit.uvBuildToolComponent,
].sort((left, right) =>
  `${left.ecosystem}:${left.name}@${left.version}`.localeCompare(
    `${right.ecosystem}:${right.name}@${right.version}`,
  ),
).filter((component, index, sorted) => {
  const key = `${component.ecosystem}:${component.name}@${component.version}`;
  const first = sorted.findIndex(
    (candidate) => `${candidate.ecosystem}:${candidate.name}@${candidate.version}` === key,
  );
  if (first !== index) {
    const original = sorted[first];
    if (original.license !== component.license) {
      throw new Error(`[license-audit] duplicate component license mismatch: ${key}`);
    }
    return false;
  }
  return true;
});
const componentByCoordinate = new Map(
  components.map((component) => [
    `${component.ecosystem}:${component.name}@${component.version}`,
    component,
  ]),
);
for (const connector of [
  ...pythonSidecarManifest.connectorSoftware,
  ...financeDataReaderSidecarAudit.manifest.connectorSoftware,
]) {
  const coordinate = `${connector.ecosystem}:${connector.name}@${connector.version}`;
  const component = componentByCoordinate.get(coordinate);
  if (
    !component
    || component.license !== connector.spdxExpression
    || !/^https:\/\//u.test(connector.projectUrl)
  ) {
    throw new Error(`[license-audit] connector software review drifted: ${coordinate}`);
  }
}
const providerIds = new Set();
for (const provider of [
  ...pythonSidecarManifest.marketDataProviderTerms,
  ...financeDataReaderSidecarAudit.manifest.marketDataProviderTerms,
]) {
  if (
    !provider.id
    || providerIds.has(provider.id)
    || !provider.name
    || !provider.termsRevision
    || !/^https:\/\//u.test(provider.termsUrl)
  ) {
    throw new Error('[license-audit] market-data provider terms review is incomplete');
  }
  providerIds.add(provider.id);
}
const componentsDigest = crypto
  .createHash('sha256')
  .update(JSON.stringify(components))
  .digest('hex');

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${componentsDigest.slice(0, 8)}-${componentsDigest.slice(8, 12)}-5${componentsDigest.slice(13, 16)}-a${componentsDigest.slice(17, 20)}-${componentsDigest.slice(20, 32)}`,
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: 'Zinuto Core',
      version: applicationVersion,
      licenses: [{ license: { id: 'GPL-3.0-only' } }],
    },
    properties: [
      {
        name: 'zinuto:dependencySnapshotSha256',
        value: componentsDigest,
      },
      {
        name: 'zinuto:pythonSidecarLockSha256',
        value: pythonSidecarManifest.lockSha256,
      },
      {
        name: 'zinuto:pythonSidecarVersion',
        value: pythonVersion,
      },
      {
        name: 'zinuto:pythonSidecarUvVersion',
        value: uvVersion,
      },
      {
        name: 'zinuto:financeDataReaderSidecarLockSha256',
        value: financeDataReaderSidecarAudit.manifest.lockSha256,
      },
      {
        name: 'zinuto:financeDataReaderSidecarVersion',
        value: financeDataReaderSidecarAudit.pythonVersion,
      },
      {
        name: 'zinuto:marketDataTermsAreNotSoftwareLicenses',
        value: 'true',
      },
    ],
  },
  components: components.map((component) => ({
    type: component.type ?? 'library',
    group: component.ecosystem,
    name: component.name,
    version: component.version,
    scope: component.development ? 'excluded' : 'required',
    licenses: [{ expression: component.license }],
    purl: component.purl,
    ...(component.sourceUrl
      ? { externalReferences: [{ type: 'website', url: component.sourceUrl }] }
      : {}),
    ...(component.role
      ? {
        properties: [
          {
            name: 'zinuto:dependencyRole',
            value: component.role,
          },
        ],
      }
      : {}),
  })),
};
const sbomOutput = `${JSON.stringify(sbom, null, 2)}\n`;

const noticeRows = components.map(
  (component) =>
    `| ${component.ecosystem} | ${component.name.replaceAll('|', '\\|')} | ${component.version} | ${component.license.replaceAll('|', '\\|')} | ${component.licenseEvidence?.replaceAll('|', '\\|') ?? ''} | ${component.role ?? (component.development ? 'development' : 'runtime')} |`,
);
const connectorRows = [
  ...pythonSidecarManifest.connectorSoftware,
  ...financeDataReaderSidecarAudit.manifest.connectorSoftware,
].map(
  (connector) =>
    `| ${connector.label.replaceAll('|', '\\|')} | ${connector.version} | ${connector.spdxExpression.replaceAll('|', '\\|')} | [Project](${connector.projectUrl}) |`,
);
const providerTermRows = [
  ...pythonSidecarManifest.marketDataProviderTerms,
  ...financeDataReaderSidecarAudit.manifest.marketDataProviderTerms,
].map(
  (provider) =>
    `| ${provider.name.replaceAll('|', '\\|')} | ${provider.termsRevision.replaceAll('|', '\\|')} | [Terms](${provider.termsUrl}) |`,
);
const noticesOutput = `# Third-party notices

This file is generated from the locked npm, Cargo, and Python dependency graphs. It is
an inventory, not a substitute for the license texts shipped by each package.
The source distribution retains dependency license files through the normal
package, Cargo, and Python registries.

- Snapshot SHA-256: \`${componentsDigest}\`
- Components: ${components.length}
- AKShare sidecar lock SHA-256: \`${pythonSidecarManifest.lockSha256}\`
- FinanceDataReader sidecar lock SHA-256: \`${financeDataReaderSidecarAudit.manifest.lockSha256}\`
- Python sidecar builds: CPython ${pythonVersion}, uv ${uvVersion}
- Audit rule: missing, proprietary, unlicensed, \`SEE LICENSE\`, and
  \`LicenseRef\` declarations fail generation.

## Optional local market-data connector software

These are software licenses for the connector code. They do not grant rights to
market data returned by a third-party provider.

| Connector software | Version | Software license | Project |
| --- | --- | --- | --- |
${connectorRows.join('\n')}

## Market-data provider terms (not software licenses)

The links below govern access to the actual data source. They are intentionally
kept outside the software-license inventory and CycloneDX license fields. A UI
acknowledgement records that the reminder was shown; it is not a data license or
authorization from the provider.

| Data provider | Reviewed terms revision | Terms |
| --- | --- | --- |
${providerTermRows.join('\n')}

## Dependency inventory

| Ecosystem | Package | Version | Audited SPDX license | Review evidence | Role |
| --- | --- | --- | --- | --- | --- |
${noticeRows.join('\n')}
`;

const artifacts = [
  [sbomPath, sbomOutput],
  [noticesPath, noticesOutput],
];
if (checkOnly) {
  const drift = artifacts.filter(
    ([filePath, expected]) =>
      !fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== expected,
  );
  if (drift.length > 0) {
    throw new Error(
      `[license-audit] generated artifacts drifted: ${drift
        .map(([filePath]) => path.relative(rootDir, filePath))
        .join(', ')}`,
    );
  }
  process.stdout.write(`[license-audit] passed (${components.length} dependencies)\n`);
} else {
  artifacts.forEach(([filePath, content]) => fs.writeFileSync(filePath, content));
  process.stdout.write(`[license-audit] wrote SBOM and notices for ${components.length} dependencies\n`);
}
