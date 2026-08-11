// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { settleSuccessfulFullImportFollowUps } from '../../src/domains/data-import/successfulImportFollowUps';

const buildPool = (id: string) => ({
  id,
  name: id,
  sourceFolder: `/tmp/${id}`,
  baseTimeframe: '1d' as const,
  selected: false,
  instruments: [],
});

test('successful full-import follow-ups resolve the authoritative source pool', async () => {
  let instrumentRefreshCalls = 0;
  const result = await settleSuccessfulFullImportFollowUps({
    sourceId: 'job-source',
    syncCustomSamplePoolsFromDataSources: async () => [
      buildPool('card-source'),
      buildPool('job-source'),
    ],
    refreshInstruments: async () => {
      instrumentRefreshCalls += 1;
    },
  });

  assert.equal(result.nextPool?.id, 'job-source');
  assert.equal(result.followUpFailed, false);
  assert.equal(instrumentRefreshCalls, 1);
});

test('successful full-import follow-ups never reject when refreshed state is temporarily unavailable', async () => {
  const emptyPoolResult = await settleSuccessfulFullImportFollowUps({
    sourceId: 'source-1',
    syncCustomSamplePoolsFromDataSources: async () => [],
    refreshInstruments: async () => undefined,
  });
  assert.equal(emptyPoolResult.nextPool, null);
  assert.equal(emptyPoolResult.followUpFailed, true);

  let instrumentRefreshCalls = 0;
  const rejectedSyncResult = await settleSuccessfulFullImportFollowUps({
    sourceId: 'source-1',
    syncCustomSamplePoolsFromDataSources: async () => {
      throw new Error('temporary pool refresh failure');
    },
    refreshInstruments: async () => {
      instrumentRefreshCalls += 1;
      throw new Error('temporary instrument refresh failure');
    },
  });

  assert.equal(rejectedSyncResult.nextPool, null);
  assert.equal(rejectedSyncResult.followUpFailed, true);
  assert.equal(instrumentRefreshCalls, 1);
});
