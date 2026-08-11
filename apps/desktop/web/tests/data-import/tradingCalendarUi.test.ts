// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTradingSessionRangeFromInput,
  formatTradingSessionRange,
} from '../../src/domains/data-import/tradingCalendarUi';

const morningSession = {
  startMinute: 9 * 60 + 30,
  endMinute: 11 * 60 + 30,
  crossesMidnight: false,
};

const afternoonSession = {
  startMinute: 13 * 60,
  endMinute: 15 * 60,
  crossesMidnight: false,
};

test('trading calendar ranges display inclusive close minutes across intraday timeframes', () => {
  for (const timeframe of ['1m', '5m', '1h'] as const) {
    assert.equal(
      formatTradingSessionRange(morningSession, timeframe),
      '09:30-11:30',
    );
    assert.equal(
      formatTradingSessionRange(afternoonSession, timeframe),
      '13:00-15:00',
    );
  }
});

test('trading calendar input round-trips inclusive close minutes', () => {
  for (const timeframe of ['1m', '5m', '1h'] as const) {
    assert.deepEqual(
      buildTradingSessionRangeFromInput('09:30', '11:30', timeframe),
      morningSession,
    );
    assert.deepEqual(
      buildTradingSessionRangeFromInput('13:00', '15:00', timeframe),
      afternoonSession,
    );
  }
});
