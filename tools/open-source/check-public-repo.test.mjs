// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  containsVisibleOfficialBrand,
  findInvalidDocumentedNpmScripts,
  findForbiddenCoreWorkflowBehavior,
  findForbiddenCoreSigningConfiguration,
  findPrivateRuntimeMarker,
  walkPublicTree,
} from './check-public-repo.mjs';

test('Core workflow policy forbids binary publication and signing inputs', () => {
  assert.equal(findForbiddenCoreWorkflowBehavior('permissions:\n  contents: read'), null);
  assert.equal(
    findForbiddenCoreWorkflowBehavior('name: read-only source checks'),
    'missing explicit contents: read permission',
  );
  assert.equal(
    findForbiddenCoreWorkflowBehavior('permissions:\n  contents: write'),
    'write access to repository contents',
  );
  assert.equal(
    findForbiddenCoreWorkflowBehavior('run: gh release create v2.0.0'),
    'GitHub Release command',
  );
  assert.equal(
    findForbiddenCoreWorkflowBehavior([
      'uses: actions/upload-artifact@v4',
      'with:',
      '  path: apps/desktop/shell/target/release/bundle/*.dmg',
    ].join('\n')),
    'desktop binary artifact upload',
  );
  assert.equal(
    findForbiddenCoreWorkflowBehavior('env:\n  APPLE_SIGNING_IDENTITY: secret'),
    'signing input',
  );
});

test('Core package configuration rejects distributor signing and updater keys', () => {
  assert.equal(findForbiddenCoreSigningConfiguration('{ "productName": "Zinuto Core" }'), null);
  assert.ok(findForbiddenCoreSigningConfiguration('{ "signingIdentity": "Developer ID" }'));
  assert.ok(findForbiddenCoreSigningConfiguration('{ "certificateThumbprint": "abc" }'));
  assert.ok(findForbiddenCoreSigningConfiguration('{ "createUpdaterArtifacts": true }'));
});

test('visible official brand inspection ignores scripts, styles, and comments', () => {
  const html = `
    <style>.zinuto-shell { display: block; }</style>
    <script>localStorage.setItem('zinuto-locale', 'en');</script>
    <!-- Zinuto is intentionally retained in an internal compatibility key. -->
    <main class="zinuto-shell" data-runtime="zinuto">Zinuto Core</main>
  `;

  assert.equal(containsVisibleOfficialBrand(html), false);
});

test('visible official brand inspection checks text and accessible labels', () => {
  assert.equal(containsVisibleOfficialBrand('<title>Zinuto Core</title>'), false);
  assert.equal(containsVisibleOfficialBrand('<p>Download Zinuto Core today.</p>'), false);
  assert.equal(containsVisibleOfficialBrand('<title>Zinuto</title>'), true);
  assert.equal(containsVisibleOfficialBrand('<button aria-label="Open Zinuto">Open</button>'), true);
  assert.equal(containsVisibleOfficialBrand('<p>Download Zinuto today.</p>'), true);
});

test('private runtime inspection covers update, official composition, support, and broad opener surfaces', () => {
  const cases = [
    ['apps/desktop/local-api/src/runtime/index.ts', 'ZINUTO_UPDATE_SMOKE_BUILD'],
    ['apps/desktop/web/testHarness/fixture.ts', '/desktop/release-manifest.json'],
    ['apps/desktop/local-api/src/runtime/desktopRuntime.ts', 'ZINUTO_DESKTOP_BUNDLE_ID'],
    ['apps/desktop/web/src/api/native.ts', 'openExternalUrl'],
    ['apps/desktop/shell/capabilities/default.json', 'opener:default'],
    ['contracts/openapi/desktop-local-api.v1.yaml', 'direct-macos'],
    ['.github/workflows/publish.yml', 'Ko-fi'],
  ];
  for (const [relativePath, marker] of cases) {
    assert.equal(
      findPrivateRuntimeMarker({ relativePath, content: marker }),
      marker,
      relativePath,
    );
  }
  assert.equal(
    findPrivateRuntimeMarker({
      relativePath: 'README.md',
      content: 'The public boundary forbids online support.',
    }),
    null,
  );
  assert.equal(
    findPrivateRuntimeMarker({
      relativePath: '.github/FUNDING.yml',
      content: 'ko_fi: zinuto',
    }),
    null,
  );
  assert.equal(
    findPrivateRuntimeMarker({
      relativePath: '.github/ISSUE_TEMPLATE/config.yml',
      content: 'https://www.zinuto.com/en/contact/',
    }),
    null,
  );
  assert.equal(
    findPrivateRuntimeMarker({
      relativePath: '.github/FUNDING.yml',
      content: 'officialAccount',
    }),
    'officialAccount',
  );
});

test('documented npm commands resolve against their root or named workspace', () => {
  const failures = findInvalidDocumentedNpmScripts({
    documents: new Map([
      ['README.md', [
        '`npm run check:affected -- --base origin/main --head HEAD`',
        '`npm run test:ui --workspace=@zinuto/desktop-web`',
        '`npm run new:*`',
        '`npm run removed:root`',
        '`npm run removed:web --workspace=@zinuto/desktop-web`',
      ].join('\n')],
    ]),
    rootScripts: {
      'check:affected': 'node check.mjs',
    },
    workspaceScriptsByName: new Map([
      ['@zinuto/desktop-web', { 'test:ui': 'tsx --test' }],
    ]),
  });

  assert.deepEqual(failures, [
    'README.md: documented root npm script does not exist: removed:root',
    'README.md: documented npm script does not exist in @zinuto/desktop-web: removed:web',
  ]);
});

const withTemporaryTree = (callback) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-public-tree-'));
  try {
    callback(rootDir);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
};

test('public tree rejects symlinks instead of following or ignoring them', () => {
  withTemporaryTree((rootDir) => {
    fs.writeFileSync(path.join(rootDir, 'regular.txt'), 'ok');
    fs.symlinkSync('regular.txt', path.join(rootDir, 'brand-profile.json'));

    const result = walkPublicTree({ rootDir });
    assert.deepEqual(result.files.map((file) => path.basename(file)), ['regular.txt']);
    assert.deepEqual(result.failures, [
      'symbolic link is forbidden in public source: brand-profile.json',
    ]);
  });
});

test('public tree rejects special filesystem entries', { skip: process.platform === 'win32' }, () => {
  withTemporaryTree((rootDir) => {
    const fifoPath = path.join(rootDir, 'injected-profile');
    execFileSync('mkfifo', [fifoPath]);

    const result = walkPublicTree({ rootDir });
    assert.deepEqual(result.files, []);
    assert.deepEqual(result.failures, [
      'special filesystem entry is forbidden in public source: injected-profile',
    ]);
  });
});

test('public tree scans source runtime directories but skips only the bundled Node runtime', () => {
  withTemporaryTree((rootDir) => {
    const sourceRuntime = path.join(rootDir, 'apps/desktop/local-api/src/runtime');
    const shellSourceRuntime = path.join(rootDir, 'apps/desktop/shell/src/runtime');
    const bundledRuntime = path.join(rootDir, 'apps/desktop/shell/runtime/node/bin');
    const localVirtualEnvironment = path.join(rootDir, 'apps/desktop/local-api/sidecars/akshare/.venv/bin');
    fs.mkdirSync(sourceRuntime, { recursive: true });
    fs.mkdirSync(shellSourceRuntime, { recursive: true });
    fs.mkdirSync(bundledRuntime, { recursive: true });
    fs.mkdirSync(localVirtualEnvironment, { recursive: true });
    fs.writeFileSync(path.join(sourceRuntime, 'index.ts'), 'source runtime');
    fs.writeFileSync(path.join(shellSourceRuntime, 'backend.rs'), 'shell source runtime');
    fs.writeFileSync(path.join(bundledRuntime, 'node'), 'generated runtime');
    fs.writeFileSync(path.join(localVirtualEnvironment, 'python'), 'local environment');

    const repoFiles = walkPublicTree({ rootDir })
      .files
      .map((filePath) => path.relative(rootDir, filePath).split(path.sep).join('/'));
    assert.deepEqual(repoFiles, [
      'apps/desktop/local-api/src/runtime/index.ts',
      'apps/desktop/shell/src/runtime/backend.rs',
    ]);
  });
});

test('pre-commit rejects private Overlay paths before repository quality code runs', () => {
  withTemporaryTree((rootDir) => {
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: rootDir });
    const privateContract = path.join(rootDir, 'contracts', 'official-service.v1.yaml');
    fs.mkdirSync(path.dirname(privateContract), { recursive: true });
    fs.writeFileSync(privateContract, 'private contract\n');
    execFileSync('git', ['add', '--all'], { cwd: rootDir });

    const hookPath = path.resolve(import.meta.dirname, '..', '..', '.githooks', 'pre-commit');
    const result = spawnSync('bash', [hookPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /private Release\/Official paths must never enter public Zinuto Core/u);
    assert.match(result.stderr, /contracts\/official-service\.v1\.yaml/u);
  });
});
