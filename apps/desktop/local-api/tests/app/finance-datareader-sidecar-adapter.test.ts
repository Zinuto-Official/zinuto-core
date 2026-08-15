// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FINANCE_DATA_READER_SIDECAR_PROTOCOL,
  FINANCE_DATA_READER_SIDECAR_TIMEOUT_MS,
  FINANCE_DATA_READER_VERSION,
  buildFinanceDataReaderBarsRequest,
  buildFinanceDataReaderInstrumentCatalogRequest,
  createFinanceDataReaderSidecarAdapter,
  parseFinanceDataReaderBarsResponse,
  parseFinanceDataReaderInstrumentCatalogResponse,
} from '../../src/application/market-data-acquisition/financeDataReaderSidecarAdapter.js';

const barsInput = {
  jobId: 'fdr-test-job',
  marketId: 'US_STOCKS' as const,
  sourcePlanId: 'FDR_US_STOCKS' as const,
  symbol: 'AAPL',
  sourceSymbol: 'AAPL',
  timeframe: '1d' as const,
  startAt: '2026-01-01T00:00:00-05:00',
  endAt: '2026-01-03T23:59:59-05:00',
  signal: new AbortController().signal,
};

test('FinanceDataReader bars request is limited to declared daily OHLCV markets', () => {
  const request = buildFinanceDataReaderBarsRequest(barsInput);
  assert.equal(request.protocol, FINANCE_DATA_READER_SIDECAR_PROTOCOL);
  assert.equal(request.operation, 'bars');
  assert.deepEqual(request.params, {
    marketId: 'US_STOCKS',
    symbol: 'AAPL',
    timeframe: '1d',
    startAt: '2026-01-01T00:00:00-05:00',
    endAt: '2026-01-03T23:59:59-05:00',
  });
  assert.throws(
    () => buildFinanceDataReaderBarsRequest({ ...barsInput, timeframe: '1h' as never }),
    /FINANCEDATAREADER_TIMEFRAME_UNAVAILABLE/u,
  );
  assert.throws(
    () => buildFinanceDataReaderBarsRequest({ ...barsInput, sourceSymbol: 'FRED:DFF' }),
    /FINANCEDATAREADER_SIDECAR_OPERATION_FORBIDDEN/u,
  );
});

test('FinanceDataReader parser accepts only complete canonical OHLCV rows', () => {
  const request = buildFinanceDataReaderBarsRequest(barsInput);
  const response = JSON.stringify({
    protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
    requestId: request.requestId,
    ok: true,
    runtime: { financedatareader: FINANCE_DATA_READER_VERSION },
    kind: 'bars',
    upstreamId: 'yahoo-finance',
    rows: [
      {
        timestamp: '2026-01-02T16:00:00-05:00',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
      },
    ],
  });
  assert.deepEqual(parseFinanceDataReaderBarsResponse(response, request.requestId), {
    upstreamId: 'yahoo-finance',
    rows: [
      {
        timestamp: '2026-01-02T16:00:00-05:00',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
      },
    ],
  });
  assert.throws(
    () => parseFinanceDataReaderBarsResponse(JSON.stringify({
      protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
      requestId: request.requestId,
      ok: true,
      runtime: { financedatareader: FINANCE_DATA_READER_VERSION },
      kind: 'bars',
      upstreamId: 'yahoo-finance',
      rows: [{
        timestamp: '2026-01-02T16:00:00-05:00',
        open: 10,
        high: 12,
        low: 9,
        close: 11,
      }],
    }), request.requestId),
    /FINANCEDATAREADER_SIDECAR_RESPONSE_INVALID/u,
  );
});

test('FinanceDataReader instrument catalog and adapter remain closed to the sidecar protocol', async () => {
  const request = buildFinanceDataReaderInstrumentCatalogRequest({
    marketId: 'KR_STOCKS',
    query: 'Samsung',
  });
  assert.equal(request.operation, 'instruments');
  assert.equal(request.params.marketId, 'KR_STOCKS');
  const response = JSON.stringify({
    protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
    requestId: request.requestId,
    ok: true,
    runtime: { financedatareader: FINANCE_DATA_READER_VERSION },
    kind: 'instruments',
    upstreamId: 'krx',
    rows: [{ symbol: '005930', name: 'Samsung Electronics', exchangeId: 'KRX' }],
  });
  assert.deepEqual(
    parseFinanceDataReaderInstrumentCatalogResponse(response, request.requestId),
    [{ symbol: '005930', name: 'Samsung Electronics', exchangeId: 'KRX' }],
  );

  let observedProtocol = '';
  let observedOperation = '';
  let observedWorkerTimeoutMs: number | undefined;
  const adapter = createFinanceDataReaderSidecarAdapter({
    resolveLaunchSpec: () => ({
      command: '/signed/finance-datareader-sidecar',
      args: [],
      source: 'EXPLICIT',
    }),
    execute: async ({ request: sidecarRequest, workerTimeoutMs }) => {
      observedProtocol = sidecarRequest.protocol;
      observedOperation = sidecarRequest.operation;
      observedWorkerTimeoutMs = workerTimeoutMs;
      return JSON.stringify({
        protocol: FINANCE_DATA_READER_SIDECAR_PROTOCOL,
        requestId: sidecarRequest.requestId,
        ok: true,
        runtime: { financedatareader: FINANCE_DATA_READER_VERSION },
        kind: 'instruments',
        upstreamId: 'krx',
        rows: [{ symbol: '005930', name: 'Samsung Electronics', exchangeId: 'KRX' }],
      });
    },
  });
  assert.deepEqual(
    await adapter.listInstruments({ marketId: 'KR_STOCKS', query: '' }),
    [{ symbol: '005930', name: 'Samsung Electronics', exchangeId: 'KRX' }],
  );
  assert.equal(observedProtocol, FINANCE_DATA_READER_SIDECAR_PROTOCOL);
  assert.equal(observedOperation, 'instruments');
  assert.equal(observedWorkerTimeoutMs, FINANCE_DATA_READER_SIDECAR_TIMEOUT_MS);
});
