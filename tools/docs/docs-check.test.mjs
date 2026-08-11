// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateArchitectureOwnership,
  validateCommandReference,
  validateDocumentation,
} from './docs-check.mjs';

test('documentation registry, paths, links, and commands are current', () => {
  assert.deepEqual(validateDocumentation(), []);
});

test('architecture ownership uses the registry-backed bundled seed path', () => {
  const scopes = [{
    label: 'redistributable desktop seed data',
    path: 'apps/desktop/local-api/src/infrastructure/assets/system-market-seed',
  }];
  assert.deepEqual(
    validateArchitectureOwnership(
      '| Bundled assets | `apps/desktop/local-api/src/infrastructure/assets/system-market-seed` |',
      scopes,
      () => true,
    ),
    [],
  );
  assert.deepEqual(
    validateArchitectureOwnership(
      '| Bundled assets | `apps/desktop/data` |',
      scopes,
      (sourcePath) => sourcePath !== 'apps/desktop/data',
    ),
    [
      'architecture ownership Bundled assets references missing path apps/desktop/data',
      'architecture bundled assets owner must equal the redistributable desktop seed data scope',
    ],
  );
});

test('documentation command validation rejects unknown package scripts', () => {
  assert.deepEqual(validateCommandReference('npm run check:full', 'test'), []);
  assert.deepEqual(
    validateCommandReference('npm run missing:documentation-command', 'test'),
    ['test references missing package script missing:documentation-command'],
  );
});
