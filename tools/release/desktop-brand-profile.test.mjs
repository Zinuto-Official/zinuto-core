// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBrandWebEnvironment,
  readActiveDesktopCompositionPlan,
} from './desktop-command-utils.mjs';

test('active Core brand is fixed to the community identity', () => {
  const composition = readActiveDesktopCompositionPlan({ env: {} });
  assert.equal(composition.distributionId, 'community');
  assert.equal(composition.brand.productName, 'Zinuto Core');
  assert.equal(composition.brand.bundleIdentifier, 'org.zinuto.core');
  assert.deepEqual(buildBrandWebEnvironment(composition), {
    VITE_DESKTOP_COMPOSITION_PROTOCOL_VERSION: '1',
    VITE_DESKTOP_DISTRIBUTION_ID: 'community',
    VITE_DESKTOP_BRAND_PROFILE: 'community',
    VITE_DESKTOP_PRODUCT_NAME: 'Zinuto Core',
  });
});

test('Core rejects external composition-plan injection', () => {
  assert.throws(
    () => readActiveDesktopCompositionPlan({
      env: { ZINUTO_DESKTOP_COMPOSITION_PLAN: '/tmp/private-plan.json' },
    }),
    /does not accept an external desktop composition plan/u,
  );
});
