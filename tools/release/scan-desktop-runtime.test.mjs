// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FORBIDDEN_DESKTOP_RUNTIME_MARKERS,
  parseDesktopRuntimeScanArguments,
  scanDesktopRuntimeTree,
} from './scan-desktop-runtime.mjs';

const withRuntimeTree = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-runtime-scan-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('desktop runtime scan accepts local output', () => {
  withRuntimeTree((root) => {
    fs.writeFileSync(path.join(root, 'runtime.js'), 'startLocalRuntime();');
    assert.equal(scanDesktopRuntimeTree(root), 1);
  });
});

test('desktop runtime scan rejects every private-runtime marker', () => {
  for (const marker of FORBIDDEN_DESKTOP_RUNTIME_MARKERS) {
    withRuntimeTree((root) => {
      fs.writeFileSync(path.join(root, 'runtime.js'), JSON.stringify(marker));
      assert.throws(() => scanDesktopRuntimeTree(root), /forbidden marker/u);
    });
  }
});

test('desktop runtime scan rejects every marker at every first and later chunk split', () => {
  const chunkBytes = 64;
  for (const marker of FORBIDDEN_DESKTOP_RUNTIME_MARKERS) {
    const markerBytes = Buffer.from(marker);
    for (let split = 1; split < markerBytes.length; split += 1) {
      for (const boundary of [chunkBytes, chunkBytes * 2]) {
        withRuntimeTree((root) => {
          const prefix = Buffer.alloc(boundary - split, 0x41);
          fs.writeFileSync(path.join(root, 'payload.bin'), Buffer.concat([prefix, markerBytes]));
          assert.throws(
            () => scanDesktopRuntimeTree(root, { chunkBytes }),
            /forbidden marker/u,
            `${marker} split=${split} boundary=${boundary}`,
          );
        });
      }
    }
  }
});

test('desktop runtime scan permits exempt third-party terminology only', () => {
  withRuntimeTree((root) => {
    const file = path.join(root, 'node_modules', 'ccxt', 'dist', 'ccxt.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'const paths = ["/v1/account", "/v1/auth", "/v1/support"];');
    assert.equal(scanDesktopRuntimeTree(root), 1);
    fs.writeFileSync(file, 'const path = "/account-service";');
    assert.throws(() => scanDesktopRuntimeTree(root), /forbidden marker/u);
  });
});

test('desktop runtime scan permits generic third-party subscription terminology', () => {
  withRuntimeTree((root) => {
    const file = path.join(
      root,
      'node_modules',
      'undici',
      'lib',
      'core',
      'diagnostics.js',
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'channel.subscribe(onDiagnosticEvent);');
    assert.equal(scanDesktopRuntimeTree(root), 1);
  });
});

test('desktop runtime scan CLI accepts paths and rejects options', () => {
  assert.deepEqual(parseDesktopRuntimeScanArguments(['web', 'backend']), {
    targets: ['web', 'backend'],
  });
  assert.throws(
    () => parseDesktopRuntimeScanArguments(['--unexpected', 'runtime']),
    /unknown option/u,
  );
});
