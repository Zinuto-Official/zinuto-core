// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTimestampMs } from '../src/marketTime.js';
import { parseTimestampMsInTimeZone } from '../src/timezone.js';

const expected20250101 = Date.UTC(2025, 0, 1) - 8 * 60 * 60 * 1000;
const expected20250101_1500 = Date.UTC(2025, 0, 1, 15, 0) - 8 * 60 * 60 * 1000;

test('compact date strings parse as naive market timestamps, not epoch milliseconds', () => {
  assert.equal(parseTimestampMs('20250101'), expected20250101);
  assert.equal(parseTimestampMs('202501011500'), expected20250101_1500);
  assert.equal(parseTimestampMs('20250101150000'), expected20250101_1500);
});

test('timezone parser agrees with marketTime on compact and epoch shapes', () => {
  const tz = 'Asia/Shanghai';
  assert.equal(
    parseTimestampMsInTimeZone('20250101', tz),
    parseTimestampMs('20250101'),
  );
  assert.equal(
    parseTimestampMsInTimeZone('202501011500', tz),
    parseTimestampMs('202501011500'),
  );
  assert.equal(
    parseTimestampMsInTimeZone('20250101150000', tz),
    parseTimestampMs('20250101150000'),
  );
});

test('13-digit epoch milliseconds keep their numeric semantics', () => {
  const epochMs = Date.UTC(2026, 6, 1, 0, 0, 0);
  assert.equal(parseTimestampMs(String(epochMs)), epochMs);
  assert.equal(
    parseTimestampMsInTimeZone(String(epochMs), 'Asia/Shanghai'),
    epochMs,
  );
});

test('out-of-range compact shapes fall back to numeric epoch semantics', () => {
  // 12 digits with a year outside 1900-2200 is an epoch millisecond
  // (1973-1978 range) and must not parse as a date.
  const twelveDigit = '126230400000';
  assert.equal(parseTimestampMs(twelveDigit), 126_230_400_000);
  assert.equal(
    parseTimestampMsInTimeZone(twelveDigit, 'Asia/Shanghai'),
    126_230_400_000,
  );
  const eightDigit = '86400000';
  assert.equal(parseTimestampMs(eightDigit), 86_400_000);
  assert.equal(
    parseTimestampMsInTimeZone(eightDigit, 'Asia/Shanghai'),
    86_400_000,
  );
});
