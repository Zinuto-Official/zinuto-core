#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), '../..');

const requiredFiles = Object.freeze([
  'AGENTS.md',
  'README.md',
  'CONTRIBUTING.md',
  'documentation-manifest.json',
  'docs/ARCHITECTURE.md',
  'docs/registry/agent-scopes.json',
  'docs/registry/features.json',
  'docs/registry/contracts.json',
  'docs/registry/product-lanes.json',
]);

const removedDocumentation = Object.freeze([
  'docs/PRODUCT.md',
  'docs/DEVELOPMENT.md',
  'apps/desktop/data/AGENTS.md',
  'apps/desktop/local-api/AGENTS.md',
  'apps/desktop/shell/AGENTS.md',
  'apps/desktop/web/AGENTS.md',
  'contracts/AGENTS.md',
  'packages/shared/AGENTS.md',
  'tools/AGENTS.md',
]);

const toPosix = (value) => value.split(path.sep).join('/');
const exists = (relativePath) => fs.existsSync(path.join(rootDir, relativePath));
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8'),
);
const unique = (values) => new Set(values).size === values.length;

const trackedMarkdown = () => execFileSync(
  'git',
  ['-C', rootDir, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
  .split('\n')
  .map((entry) => entry.trim())
  .filter((entry) => entry && exists(entry));

const hasTrackedFiles = (relativePath) => execFileSync(
  'git',
  ['-C', rootDir, 'ls-files', '--', relativePath],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
).trim().length > 0;

const packageJson = readJson('package.json');
const scripts = packageJson.scripts ?? {};

export const validateCommandReference = (command, label) => {
  const failures = [];
  const npmMatch = String(command).match(/^npm run ([a-z0-9:*-]+)/iu);
  if (npmMatch && !npmMatch[1].includes('*') && !Object.hasOwn(scripts, npmMatch[1])) {
    failures.push(`${label} references missing package script ${npmMatch[1]}`);
  }
  const cargoMatch = String(command).match(/--manifest-path\s+([^\s]+)/u);
  if (cargoMatch && !exists(cargoMatch[1])) {
    failures.push(`${label} references missing Cargo manifest ${cargoMatch[1]}`);
  }
  return failures;
};

export const validateArchitectureOwnership = (
  architectureSource,
  scopes,
  pathExists = exists,
) => {
  const failures = [];
  const rows = new Map(
    [...String(architectureSource).matchAll(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|$/gmu)]
      .map((match) => [match[1].trim(), match[2].trim()]),
  );
  for (const [area, sourcePath] of rows) {
    if (!pathExists(sourcePath)) {
      failures.push(`architecture ownership ${area} references missing path ${sourcePath}`);
    }
  }
  const seedScope = (scopes ?? []).find(
    (scope) => scope.label === 'redistributable desktop seed data',
  );
  if (!seedScope || rows.get('Bundled assets') !== seedScope.path) {
    failures.push(
      'architecture bundled assets owner must equal the redistributable desktop seed data scope',
    );
  }
  return failures;
};

const validateRegistryShape = ({ registry, version, collection, label }) => {
  if (registry?.version !== version || !Array.isArray(registry?.[collection])) {
    return [`${label} must use version ${version} and contain ${collection}`];
  }
  const ids = registry[collection].map((entry) => entry.id ?? entry.path);
  return unique(ids) ? [] : [`${label} ${collection} identifiers must be unique`];
};

const validateMarkdownLinks = (relativePath, source) => {
  const failures = [];
  const pattern = /!?\[[^\]]*\]\(([^)\n]+)\)/gu;
  for (const match of source.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith('<')) {
      const closing = target.indexOf('>');
      target = closing >= 0 ? target.slice(1, closing) : target;
    } else {
      target = target.split(/\s+/u)[0];
    }
    if (!target || /^(?:https?:|mailto:|data:|#)/iu.test(target) || target.startsWith('/')) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      // Keep the literal target so the missing-link error remains useful.
    }
    if (!fs.existsSync(path.resolve(rootDir, path.dirname(relativePath), target))) {
      failures.push(`${relativePath} has a broken link to ${target}`);
    }
  }
  return failures;
};

export const validateDocumentation = () => {
  const failures = [];
  for (const relativePath of requiredFiles) {
    if (!exists(relativePath)) failures.push(`required documentation input is missing: ${relativePath}`);
  }
  for (const relativePath of removedDocumentation) {
    if (exists(relativePath)) failures.push(`duplicate documentation must stay removed: ${relativePath}`);
  }
  if (failures.length) return failures;

  const lanesRegistry = readJson('docs/registry/product-lanes.json');
  const contractsRegistry = readJson('docs/registry/contracts.json');
  const featuresRegistry = readJson('docs/registry/features.json');
  const scopesRegistry = readJson('docs/registry/agent-scopes.json');
  const documentationManifest = readJson('documentation-manifest.json');
  const architectureSource = fs.readFileSync(path.join(rootDir, 'docs/ARCHITECTURE.md'), 'utf8');
  if (
    documentationManifest?.schemaVersion !== 1
    || documentationManifest?.generatedFrom !== 'zinuto-release/config/documentation-policy.json'
    || documentationManifest?.repository !== 'zinuto-core'
    || !Array.isArray(documentationManifest?.documents)
  ) {
    failures.push('documentation-manifest.json is not a valid generated Core manifest');
  }
  failures.push(...validateRegistryShape({
    registry: lanesRegistry,
    version: 2,
    collection: 'lanes',
    label: 'product-lanes.json',
  }));
  failures.push(...validateArchitectureOwnership(
    architectureSource,
    scopesRegistry.scopes,
  ));
  failures.push(...validateRegistryShape({
    registry: contractsRegistry,
    version: 3,
    collection: 'contracts',
    label: 'contracts.json',
  }));
  failures.push(...validateRegistryShape({
    registry: featuresRegistry,
    version: 3,
    collection: 'features',
    label: 'features.json',
  }));
  failures.push(...validateRegistryShape({
    registry: scopesRegistry,
    version: 1,
    collection: 'scopes',
    label: 'agent-scopes.json',
  }));

  const lanes = lanesRegistry.lanes ?? [];
  const laneIds = new Set(lanes.map((lane) => lane.id));
  const contractIds = new Set((contractsRegistry.contracts ?? []).map((contract) => contract.id));

  for (const lane of lanes) {
    for (const codeRoot of lane.codeRoots ?? []) {
      if (!exists(codeRoot)) failures.push(`lane ${lane.id} references missing code root ${codeRoot}`);
    }
    for (const command of [...(lane.checks ?? []), ...(lane.requiredChecks ?? [])]) {
      failures.push(...validateCommandReference(command, `lane ${lane.id}`));
    }
  }

  for (const scope of scopesRegistry.scopes ?? []) {
    if (!laneIds.has(scope.laneId)) {
      failures.push(`agent scope ${scope.path} references missing lane ${scope.laneId}`);
    }
    if (scope.path !== '.' && (!exists(scope.path) || !hasTrackedFiles(scope.path))) {
      failures.push(`agent scope path is not backed by tracked files: ${scope.path}`);
    }
  }

  for (const contract of contractsRegistry.contracts ?? []) {
    for (const sourcePath of [
      contract.source,
      ...(contract.implementingRoutes ?? []),
      ...(contract.consumers ?? []),
      ...(contract.generatedOutputs ?? []),
    ]) {
      if (!exists(sourcePath)) failures.push(`contract ${contract.id} references missing path ${sourcePath}`);
    }
    for (const command of contract.checks ?? []) {
      failures.push(...validateCommandReference(command, `contract ${contract.id}`));
    }
  }

  for (const feature of featuresRegistry.features ?? []) {
    if (!laneIds.has(feature.ownerLane)) {
      failures.push(`feature ${feature.id} references missing lane ${feature.ownerLane}`);
    }
    for (const contractId of feature.contracts ?? []) {
      if (!contractIds.has(contractId)) {
        failures.push(`feature ${feature.id} references missing contract ${contractId}`);
      }
    }
    for (const sourcePath of [
      ...(feature.truthDocs ?? []),
      ...(feature.codeRoots ?? []),
      ...(feature.debugPlaybooks ?? []),
    ]) {
      if (!exists(sourcePath)) failures.push(`feature ${feature.id} references missing path ${sourcePath}`);
    }
    for (const testReference of feature.tests ?? []) {
      if (/^(?:npm|cargo)\s/u.test(testReference)) {
        failures.push(...validateCommandReference(testReference, `feature ${feature.id}`));
      } else if (!exists(testReference)) {
        failures.push(`feature ${feature.id} references missing test ${testReference}`);
      }
    }
    for (const command of feature.qualityCommands ?? []) {
      failures.push(...validateCommandReference(command, `feature ${feature.id}`));
    }
  }

  const documentationFiles = trackedMarkdown().sort();
  const declaredDocumentation = (documentationManifest.documents ?? [])
    .map((document) => document.path)
    .sort();
  if (JSON.stringify(documentationFiles) !== JSON.stringify(declaredDocumentation)) {
    failures.push(
      `Markdown inventory differs from documentation-manifest.json: found ${documentationFiles.join(', ')}`,
    );
  }
  if (documentationFiles.some((relativePath) => (
    relativePath !== 'AGENTS.md' && path.basename(relativePath) === 'AGENTS.md'
  ))) {
    failures.push('path rules must stay in the root AGENTS.md and agent-scopes.json registry');
  }
  const removedPrivateFactPattern = /account-service|ops\/account-platform|WireGuard|PADDLE|AdminJS|marketing-site|admin-android/iu;
  const publicSupportEntryDocuments = new Set([
    'README.md',
    'README.es.md',
    'README.ja.md',
    'README.ko.md',
    'README.zh-CN.md',
  ]);
  for (const relativePath of documentationFiles) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
    if (removedPrivateFactPattern.test(source)) {
      failures.push(`private-system fact remains in Core documentation: ${relativePath}`);
    }
    if (!publicSupportEntryDocuments.has(relativePath) && /ALIPAY/iu.test(source)) {
      failures.push(`private payment fact remains outside a public support entry: ${relativePath}`);
    }
    failures.push(...validateMarkdownLinks(relativePath, source));
    for (const match of source.matchAll(/\bnpm run ([a-z0-9:*-]+)/giu)) {
      failures.push(...validateCommandReference(`npm run ${match[1]}`, relativePath));
    }
  }
  return failures;
};

const main = () => {
  const failures = validateDocumentation();
  if (failures.length > 0) {
    process.stderr.write(`[docs-check] failed (${failures.length})\n`);
    failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`[docs-check] passed (${trackedMarkdown().length} tracked Markdown files checked)\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main();
