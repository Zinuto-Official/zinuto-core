// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { downloadRuntimeArchive } from './native-runtime-download.mjs';

const descriptor = {
  archiveBytes: 4,
  archiveFileName: 'node-v24.18.0-darwin-arm64.tar.gz',
  archiveUrl: 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-darwin-arm64.tar.gz',
  releaseVersion: '24.18.0',
};

const fakeGet = ({ statusCode = 200, headers = {}, chunks = [], neverRespond = false }) => (
  _url,
  _options,
  callback,
) => {
  const request = new EventEmitter();
  request.setTimeout = (timeout, timeoutCallback) => { setTimeout(timeoutCallback, timeout); };
  request.destroy = (error) => { queueMicrotask(() => request.emit('error', error)); };
  if (!neverRespond) {
    queueMicrotask(() => {
      const response = Readable.from(chunks);
      response.statusCode = statusCode;
      response.headers = headers;
      response.setTimeout = () => {};
      callback(response);
    });
  }
  return request;
};

const tempDestination = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-download-test-'));
  return { destinationPath: path.join(root, 'archive'), root };
};

test('native runtime download rejects redirects without following Location', async () => {
  const { destinationPath, root } = tempDestination();
  try {
    await assert.rejects(
      downloadRuntimeArchive({
        descriptor,
        destinationPath,
        get: fakeGet({ statusCode: 302, headers: { location: 'https://evil.example/runtime' } }),
      }),
      /redirect is forbidden/u,
    );
    assert.equal(fs.existsSync(destinationPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native runtime download rejects wrong length and an idle connection', async () => {
  const wrongLength = tempDestination();
  try {
    await assert.rejects(
      downloadRuntimeArchive({
        descriptor,
        destinationPath: wrongLength.destinationPath,
        get: fakeGet({ statusCode: 200, headers: { 'content-length': '5' }, chunks: [Buffer.from('evil!')] }),
      }),
      /content-length mismatch/u,
    );
  } finally {
    fs.rmSync(wrongLength.root, { recursive: true, force: true });
  }

  const idle = tempDestination();
  try {
    await assert.rejects(
      downloadRuntimeArchive({
        descriptor,
        destinationPath: idle.destinationPath,
        get: fakeGet({ neverRespond: true }),
        idleTimeoutMs: 1,
        overallTimeoutMs: 100,
      }),
      /connection deadline/u,
    );
  } finally {
    fs.rmSync(idle.root, { recursive: true, force: true });
  }
});

test('native runtime download writes only an exact bounded response', async () => {
  const { destinationPath, root } = tempDestination();
  try {
    await downloadRuntimeArchive({
      descriptor,
      destinationPath,
      get: fakeGet({ statusCode: 200, headers: { 'content-length': '4' }, chunks: [Buffer.from('safe')] }),
    });
    assert.equal(fs.readFileSync(destinationPath, 'utf8'), 'safe');
    assert.equal(fs.lstatSync(destinationPath).isSymbolicLink(), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
