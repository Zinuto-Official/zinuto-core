// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNativeEngineEnv,
  isNativeBatchBacktestEnabled,
} from '../../src/application/backtest/nativeEngine.js';

const restoreEnvironmentValue = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
};

test('native batch evaluation is fail-closed until explicitly enabled', () => {
  const previous = process.env.ZINUTO_BACKTEST_NATIVE_BATCH;
  try {
    delete process.env.ZINUTO_BACKTEST_NATIVE_BATCH;
    assert.equal(isNativeBatchBacktestEnabled(), false);
    for (const value of ['0', 'false', 'no', 'off', 'invalid']) {
      process.env.ZINUTO_BACKTEST_NATIVE_BATCH = value;
      assert.equal(isNativeBatchBacktestEnabled(), false);
    }
    for (const value of ['1', 'true', 'yes', 'on']) {
      process.env.ZINUTO_BACKTEST_NATIVE_BATCH = value;
      assert.equal(isNativeBatchBacktestEnabled(), true);
    }
  } finally {
    restoreEnvironmentValue('ZINUTO_BACKTEST_NATIVE_BATCH', previous);
  }
});

test('native backtest child environment is purpose-bound and excludes ambient secrets', () => {
  const environment = buildNativeEngineEnv('/nonexistent/zinuto-backtest-engine', {
    HOME: '/tmp/zinuto-home',
    LANG: 'zh_CN.UTF-8',
    PATH: '/usr/bin',
    ZINUTO_BACKEND_BRIDGE_SECRET: 'sentinel-bridge-secret',
    ZINUTO_UNRELATED_SECRET: 'sentinel-unrelated-secret',
  });

  assert.equal(environment.HOME, '/tmp/zinuto-home');
  assert.equal(environment.LANG, 'zh_CN.UTF-8');
  assert.equal(environment.ZINUTO_BACKEND_BRIDGE_SECRET, undefined);
  assert.equal(environment.ZINUTO_UNRELATED_SECRET, undefined);
  if (process.platform !== 'win32') {
    assert.equal(environment.PATH, undefined);
  }
});
