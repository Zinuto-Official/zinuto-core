// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESKTOP_COMPOSITION_PROTOCOL_VERSION,
  DESKTOP_DISTRIBUTION_IDS,
  buildDesktopCompositionWebEnvironment,
  resolveDesktopComposition,
  resolveDesktopCompositionHostTarget,
  validateDesktopCompositionInput,
  validateResolvedDesktopCompositionPlan,
} from './desktop-composition.mjs';

const input = (targetPlatform = 'host') => ({
  compositionProtocolVersion: DESKTOP_COMPOSITION_PROTOCOL_VERSION,
  distributionId: 'community',
  targetPlatform,
  productName: 'Zinuto Core',
  bundleIdentifier: 'org.zinuto.core',
});

test('Core composition supports one community distribution', () => {
  assert.deepEqual(DESKTOP_DISTRIBUTION_IDS, ['community']);
  assert.deepEqual(validateDesktopCompositionInput(input()), input());
  const plan = resolveDesktopComposition(input(), { nodePlatform: 'darwin' });
  assert.equal(plan.distributionId, 'community');
  assert.equal(plan.targetPlatform, 'macos');
  assert.deepEqual(plan.tauri, { features: [], additionalCapabilities: [] });
  assert.deepEqual(validateResolvedDesktopCompositionPlan(plan, { nodePlatform: 'darwin' }), plan);
});

test('Core composition rejects private fields and non-community distributions', () => {
  assert.throws(
    () => validateDesktopCompositionInput({ ...input(), extra: true }),
    /input keys must be exactly/u,
  );
  assert.throws(
    () => validateDesktopCompositionInput({ ...input(), distributionId: 'private' }),
    /community distribution only/u,
  );
});

test('Core web environment exposes identity fields only', () => {
  const environment = buildDesktopCompositionWebEnvironment(
    resolveDesktopComposition(input(), { nodePlatform: 'linux' }),
    { nodePlatform: 'linux' },
  );
  assert.deepEqual(environment, {
    VITE_DESKTOP_COMPOSITION_PROTOCOL_VERSION: '1',
    VITE_DESKTOP_DISTRIBUTION_ID: 'community',
    VITE_DESKTOP_BRAND_PROFILE: 'community',
    VITE_DESKTOP_PRODUCT_NAME: 'Zinuto Core',
  });
});

test('host target mapping stays deterministic', () => {
  assert.equal(resolveDesktopCompositionHostTarget('darwin'), 'macos');
  assert.equal(resolveDesktopCompositionHostTarget('win32'), 'windows');
  assert.equal(resolveDesktopCompositionHostTarget('linux'), 'host');
});
