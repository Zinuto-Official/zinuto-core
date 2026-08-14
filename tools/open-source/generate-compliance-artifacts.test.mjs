// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(
  rootDir,
  'config',
  'open-source',
  'python-sidecar-dependencies.json',
);

test('generated compliance artifacts include the complete pinned Python sidecar', () => {
  const audit = spawnSync(
    process.execPath,
    [path.join(rootDir, 'tools/open-source/generate-compliance-artifacts.mjs'), '--check'],
    { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sbom = JSON.parse(fs.readFileSync(path.join(rootDir, 'sbom.cdx.json'), 'utf8'));
  const notices = fs.readFileSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const pypiComponents = sbom.components.filter(({ group }) => group === 'pypi');

  assert.equal(pypiComponents.length, manifest.packages.length);
  for (const expected of manifest.packages) {
    const component = pypiComponents.find(
      ({ name, version }) => name === expected.name && version === expected.version,
    );
    assert.ok(component, `missing PyPI SBOM component: ${expected.name}@${expected.version}`);
    assert.equal(component.licenses[0].expression, expected.spdxExpression);
  }

  const requiredComponents = [
    ['pypi', 'aktools', '0.0.91'],
    ['pypi', 'akshare', '1.18.91'],
    ['pypi', 'pyinstaller', '6.16.0'],
    ['npm', 'ccxt', '4.5.73'],
    ['runtime', 'CPython', '3.11.15'],
    ['build-tool', 'uv', '0.11.8'],
  ];
  for (const [group, name, version] of requiredComponents) {
    assert.ok(
      sbom.components.some((component) =>
        component.group === group
        && component.name === name
        && component.version === version,
      ),
      `missing pinned component: ${group}:${name}@${version}`,
    );
  }

  assert.match(notices, /## Optional local market-data connector software/u);
  assert.match(notices, /## Market-data provider terms \(not software licenses\)/u);
  for (const provider of manifest.marketDataProviderTerms) {
    assert.match(notices, new RegExp(provider.termsUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }

  const sbomText = JSON.stringify(sbom);
  for (const provider of manifest.marketDataProviderTerms) {
    assert.doesNotMatch(sbomText, new RegExp(provider.termsUrl.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});
