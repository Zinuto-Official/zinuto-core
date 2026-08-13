// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESKTOP_LOCAL_FEATURE_FLAGS,
  validateDesktopFeatureManifest,
} from './feature-manifest.mjs';

const validManifest = () => ({
  schemaVersion: 3,
  productVersion: '2.0.0',
  localFeatures: { ...DESKTOP_LOCAL_FEATURE_FLAGS },
});

test('feature manifest requires the exact local-only schema', () => {
  assert.deepEqual(
    validateDesktopFeatureManifest(validManifest(), { expectedProductVersion: '2.0.0' }),
    validManifest(),
  );
  assert.throws(
    () => validateDesktopFeatureManifest({
      ...validManifest(),
      localFeatures: { ...DESKTOP_LOCAL_FEATURE_FLAGS, experimentalGate: false },
    }),
    /exact public schema/u,
  );
});

test('feature manifest keeps user-triggered local market-data acquisition available in every build', () => {
  assert.equal(
    validateDesktopFeatureManifest(validManifest()).localFeatures.localMarketDataAcquisition,
    true,
  );
});

test('feature manifest version must match the released desktop package', () => {
  assert.throws(
    () => validateDesktopFeatureManifest(validManifest(), { expectedProductVersion: '2.0.5' }),
    /must match/u,
  );
});
