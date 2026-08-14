// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AKSHARE_SIDECAR_PROTOCOL,
  buildAkshareInstrumentCatalogRequest,
  buildAkshareSidecarRequest,
  createAkshareSidecarAdapter,
  executeAkshareSidecar,
  parseAkshareInstrumentCatalogResponse,
  parseAkshareSidecarResponse,
} from '../../src/application/market-data-acquisition/akshareSidecarAdapter.js';

const runtime = { aktools: '0.0.91', akshare: '1.18.91' } as const;

test('AKShare instrument catalog uses a fixed parameter-free operation', () => {
  const request = buildAkshareInstrumentCatalogRequest();
  assert.equal(request.protocol, AKSHARE_SIDECAR_PROTOCOL);
  assert.equal(request.operation, 'stock_info_a_code_name');
  assert.deepEqual(request.params, {});
});

test('AKShare response parsers keep bars and instruments separate', () => {
  const request = buildAkshareInstrumentCatalogRequest();
  const instrumentResponse = JSON.stringify({
    protocol: AKSHARE_SIDECAR_PROTOCOL,
    requestId: request.requestId,
    ok: true,
    runtime,
    kind: 'instruments',
    rows: [
      {
        symbol: '600000',
        name: '浦发银行',
        exchangeId: 'SH',
        kind: 'A_SHARE',
      },
      {
        symbol: '000001',
        name: '平安银行',
        exchangeId: 'SZ',
        kind: 'A_SHARE',
      },
      {
        symbol: '920000',
        name: '安徽凤凰',
        exchangeId: 'BJ',
        kind: 'A_SHARE',
      },
    ],
  });
  assert.equal(
    parseAkshareInstrumentCatalogResponse(instrumentResponse, request.requestId)
      .length,
    3,
  );
  assert.throws(
    () => parseAkshareSidecarResponse(instrumentResponse, request.requestId),
    /AKSHARE_SIDECAR_RESPONSE_INVALID/u,
  );

  const invalidTokenResponse = JSON.stringify({
    protocol: AKSHARE_SIDECAR_PROTOCOL,
    requestId: request.requestId,
    ok: true,
    runtime,
    kind: 'instruments',
    rows: [
      {
        symbol: 'SH',
        name: 'must not leak as a symbol',
        exchangeId: 'SH',
        kind: 'A_SHARE',
      },
    ],
  });
  assert.throws(
    () =>
      parseAkshareInstrumentCatalogResponse(
        invalidTokenResponse,
        request.requestId,
      ),
    /AKSHARE_SIDECAR_RESPONSE_INVALID/u,
  );
});

test('AKShare index jobs strip the controlled prefix before sidecar execution', () => {
  const indexInput = {
    jobId: 'index-job',
    request: {
      connectorId: 'akshare',
      dataset: 'index_zh_a_hist',
      symbols: ['INDEX-000001'],
      timeframe: '1d',
      startAt: '2026-07-01T00:00:00+08:00',
      endAt: '2026-07-18T23:59:59+08:00',
      adjustment: 'none',
    },
    symbol: 'INDEX-000001',
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof buildAkshareSidecarRequest>[0];
  const request = buildAkshareSidecarRequest(indexInput);
  assert.equal(request.operation, 'index_zh_a_hist');
  assert.equal(request.params.symbol, '000001');
  assert.equal(request.params.adjustment, 'none');

  assert.throws(
    () =>
      buildAkshareSidecarRequest({
        ...indexInput,
        request: {
          ...indexInput.request,
          adjustment: 'qfq',
        },
      }),
    /AKSHARE_SIDECAR_REQUEST_INVALID/u,
  );
});

const waitForFile = async (filePath: string): Promise<void> => {
  const deadlineAt = Date.now() + 2_000;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadlineAt) {
      throw new Error('AKSHARE_TEST_PID_FILE_TIMEOUT');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('AKShare supervisor escalates cancellation and reaps an ignore-TERM process tree', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Unix process-group fixture');
    return;
  }
  const fixtureDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'zinuto-akshare-supervisor-'),
  );
  const grandchildPidPath = path.join(fixtureDirectory, 'grandchild.pid');
  const fixture = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "process.on('SIGTERM', () => undefined);",
    "const grandchild = spawn(process.execPath, ['-e', \"process.on('SIGTERM',()=>undefined);setInterval(()=>undefined,1000)\"], { stdio: 'ignore' });",
    'fs.writeFileSync(process.argv[1], String(grandchild.pid));',
    'setInterval(() => undefined, 1000);',
  ].join('');
  const controller = new AbortController();
  try {
    const execution = executeAkshareSidecar({
      launchSpec: {
        command: process.execPath,
        args: ['-e', fixture, grandchildPidPath],
        source: 'EXPLICIT',
      },
      request: buildAkshareInstrumentCatalogRequest(),
      signal: controller.signal,
      workerTimeoutMs: 5_000,
      terminationGraceMs: 50,
      settlementDeadlineMs: 500,
    });
    await waitForFile(grandchildPidPath);
    const grandchildPid = Number(fs.readFileSync(grandchildPidPath, 'utf8'));
    controller.abort();
    await assert.rejects(execution, /ACQUISITION_CANCELED/u);
    const deadlineAt = Date.now() + 1_000;
    while (isProcessAlive(grandchildPid) && Date.now() < deadlineAt) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(isProcessAlive(grandchildPid), false);
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('AKShare supervisor bounds oversized-output termination independently of close', async () => {
  const fixture = [
    "process.on('SIGTERM', () => undefined);",
    "process.stdout.write('x'.repeat(4096));",
    'setInterval(() => undefined, 1000);',
  ].join('');
  await assert.rejects(
    executeAkshareSidecar({
      launchSpec: {
        command: process.execPath,
        args: ['-e', fixture],
        source: 'EXPLICIT',
      },
      request: buildAkshareInstrumentCatalogRequest(),
      signal: new AbortController().signal,
      responseLimitBytes: 128,
      workerTimeoutMs: 5_000,
      terminationGraceMs: 50,
      settlementDeadlineMs: 500,
    }),
    /AKSHARE_SIDECAR_RESPONSE_TOO_LARGE/u,
  );
});

test('AKShare adapter exposes the real instrument catalog to its caller', async () => {
  let observedOperation = '';
  let observedParams: unknown;
  const adapter = createAkshareSidecarAdapter({
    resolveLaunchSpec: () => ({
      command: '/signed/sidecar',
      args: [],
      source: 'EXPLICIT',
    }),
    execute: async ({ request }) => {
      observedOperation = request.operation;
      observedParams = request.params;
      return JSON.stringify({
        protocol: AKSHARE_SIDECAR_PROTOCOL,
        requestId: request.requestId,
        ok: true,
        runtime,
        kind: 'instruments',
        rows: [
          {
            symbol: '688981',
            name: '中芯国际',
            exchangeId: 'SH',
            kind: 'A_SHARE',
          },
        ],
      });
    },
  });

  const rows = await adapter.listInstruments();
  assert.equal(observedOperation, 'stock_info_a_code_name');
  assert.deepEqual(observedParams, {});
  assert.deepEqual(rows, [
    {
      symbol: '688981',
      name: '中芯国际',
      exchangeId: 'SH',
      kind: 'A_SHARE',
    },
  ]);
});
