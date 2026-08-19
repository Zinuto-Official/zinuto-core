// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DUCKDB_RUNTIME_AUTHORITY_PATH,
  resolveDuckdbRuntimeDescriptor,
  verifyDuckdbRuntimeAuthority,
} from './duckdb-runtime-authority.mjs';

const readAuthority = () => JSON.parse(fs.readFileSync(DUCKDB_RUNTIME_AUTHORITY_PATH, 'utf8'));

test('DuckDB authority binds every supported platform to reviewed archive and library digests', () => {
  const authority = verifyDuckdbRuntimeAuthority(readAuthority(), {
    authoritySha256: 'a'.repeat(64),
  });
  const mac = resolveDuckdbRuntimeDescriptor({
    authority,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });
  assert.equal(mac.releaseVersion, '1.5.3');
  assert.equal(mac.archiveSha256, '386f8e8b3b4bc8d128762327121e22065ce45f2ee55ef1b1f412ce11e0e6c51f');
  assert.equal(mac.files['libduckdb.dylib'].sha256, '2de60b6210a6bc9a1405dabd1e26d8ea8ce8c0d03d992ceba0f4f61ccbe031a5');
  assert.equal(mac.archiveUrl, 'https://github.com/duckdb/duckdb/releases/download/v1.5.3/libduckdb-osx-universal.zip');

  const windows = resolveDuckdbRuntimeDescriptor({
    authority,
    nodePlatform: 'win32',
    nodeArch: 'x64',
  });
  assert.equal(windows.files['duckdb.dll'].sha256, 'bd4dd87fc2780efc9db46f70d949829d4d38677ee6b1e2ca8b14eba3495d77c9');
  assert.equal(windows.rustTarget, 'x86_64-pc-windows-msvc');
});

test('DuckDB authority rejects missing targets and malformed file identities', () => {
  const cases = [
    (authority) => { delete authority.platforms['win32-x64']; },
    (authority) => { authority.platforms['darwin-arm64'].archiveSha256 = 'wrong'; },
    (authority) => { authority.platforms['darwin-arm64'].files['../escape'] = { bytes: 1, sha256: '0'.repeat(64) }; },
    (authority) => { authority.platforms['darwin-arm64'].files['libduckdb.dylib'].bytes = 0; },
  ];
  for (const mutate of cases) {
    const authority = readAuthority();
    mutate(authority);
    assert.throws(
      () => verifyDuckdbRuntimeAuthority(authority),
      /authority|descriptor|file|supported targets/u,
    );
  }
});
