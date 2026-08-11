// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const webFutuSupportMatrixPath = new URL(
  '../../src/domains/custom-indicator/futu/futuSupportMatrix.ts',
  import.meta.url,
);
const webFutuSupportRegistryPath = new URL(
  '../../src/domains/custom-indicator/futu/futuSupportRegistry.ts',
  import.meta.url,
);
const webSystemDefaultsPath = new URL(
  '../../src/domains/custom-indicator/indicator/systemDefaults.ts',
  import.meta.url,
);
const customIndicatorWorkbenchMarketStateSource = readFileSync(
  new URL('../../src/workspaces/custom-indicator/customIndicatorWorkbenchMarketState.ts', import.meta.url),
  'utf8',
);
const customIndicatorWorkbenchStateSource = readFileSync(
  new URL('../../src/workspaces/custom-indicator/customIndicatorWorkbenchState.ts', import.meta.url),
  'utf8',
);

test('custom indicator Futu support facts are not owned by desktop web', () => {
  assert.equal(existsSync(webFutuSupportMatrixPath), false);
  assert.equal(existsSync(webFutuSupportRegistryPath), false);
  assert.equal(existsSync(webSystemDefaultsPath), false);
});

test('custom indicator profile actions prefer local-api workspace read model facts', () => {
  assert.match(customIndicatorWorkbenchMarketStateSource, /getWorkspaceReadModel\("custom-indicator"/u);
  assert.match(customIndicatorWorkbenchStateSource, /customIndicatorSystemDefaults\.templates/u);
  assert.doesNotMatch(customIndicatorWorkbenchStateSource, /Account|Membership|featureAccess|limits/u);
});
