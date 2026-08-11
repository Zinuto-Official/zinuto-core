// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DesktopBacktestSignalRules } from '@zinuto/shared/contracts-desktop/api';
import { composeBacktestStrategySource } from '../../src/application/backtest/signalRuleCodegen.js';

test('signal rule codegen returns the original source when rules are empty', () => {
  const source = 'DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9);  ';

  assert.equal(composeBacktestStrategySource(source), source);
  assert.equal(composeBacktestStrategySource(source, {}), source);
});

test('signal rule codegen maps crossover and comparison operators', () => {
  const source = 'DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9);\nRSI1: RSI(CLOSE, 6);';

  const composed = composeBacktestStrategySource(source, {
    buy: {
      connector: 'AND',
      conditions: [
        {
          left: { kind: 'OUTPUT', key: 'DIF' },
          operator: 'CROSS_ABOVE',
          right: { kind: 'OUTPUT', key: 'DEA' },
        },
        {
          left: { kind: 'OUTPUT', key: 'RSI1' },
          operator: 'LESS',
          right: { kind: 'CONSTANT', value: 30 },
        },
      ],
    },
    sell: {
      connector: 'OR',
      conditions: [
        {
          left: { kind: 'OUTPUT', key: 'DIF' },
          operator: 'CROSS_BELOW',
          right: { kind: 'OUTPUT', key: 'DEA' },
        },
        {
          left: { kind: 'PRICE', field: 'CLOSE' },
          operator: 'GREATER_EQUAL',
          right: { kind: 'PRICE', field: 'HIGH' },
        },
      ],
    },
  });

  assert.equal(
    composed,
    [
      'DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);',
      'DEA: EMA(DIF, 9);',
      'RSI1: RSI(CLOSE, 6);',
      'BUY: CROSS(DIF, DEA) AND (RSI1 < 30);',
      'SELL: CROSSDOWN(DIF, DEA) OR (CLOSE >= HIGH);',
    ].join('\n'),
  );
});

test('signal rule codegen covers all comparison operators and price volume alias', () => {
  const composed = composeBacktestStrategySource('BASE: CLOSE;', {
    buy: {
      connector: 'AND',
      conditions: [
        {
          left: { kind: 'PRICE', field: 'OPEN' },
          operator: 'GREATER',
          right: { kind: 'PRICE', field: 'LOW' },
        },
        {
          left: { kind: 'PRICE', field: 'VOLUME' },
          operator: 'LESS_EQUAL',
          right: { kind: 'CONSTANT', value: 1_000_000 },
        },
        {
          left: { kind: 'PRICE', field: 'CLOSE' },
          operator: 'EQUAL',
          right: { kind: 'CONSTANT', value: 12.5 },
        },
      ],
    },
  });

  assert.equal(
    composed,
    'BASE: CLOSE;\nBUY: (OPEN > LOW) AND (VOL <= 1000000) AND (CLOSE = 12.5);',
  );
});

test('signal rule codegen emits short and cover directions', () => {
  const composed = composeBacktestStrategySource('FAST: EMA(CLOSE, 5);\nSLOW: EMA(CLOSE, 20);', {
    short: {
      connector: 'AND',
      conditions: [
        {
          left: { kind: 'OUTPUT', key: 'FAST' },
          operator: 'CROSS_BELOW',
          right: { kind: 'OUTPUT', key: 'SLOW' },
        },
      ],
    },
    cover: {
      connector: 'AND',
      conditions: [
        {
          left: { kind: 'OUTPUT', key: 'FAST' },
          operator: 'CROSS_ABOVE',
          right: { kind: 'OUTPUT', key: 'SLOW' },
        },
      ],
    },
  });

  assert.equal(
    composed,
    'FAST: EMA(CLOSE, 5);\nSLOW: EMA(CLOSE, 20);\nSHORT: CROSSDOWN(FAST, SLOW);\nCOVER: CROSS(FAST, SLOW);',
  );
});

test('signal rule codegen rejects unsafe operands', () => {
  assert.throws(
    () =>
      composeBacktestStrategySource('DIF: CLOSE;', {
        buy: {
          connector: 'AND',
          conditions: [
            {
              left: { kind: 'OUTPUT', key: 'DIF);SELL:1' },
              operator: 'GREATER',
              right: { kind: 'CONSTANT', value: 0 },
            },
          ],
        },
      }),
    /BACKTEST_SIGNAL_RULE_INVALID_OUTPUT/,
  );

  assert.throws(
    () =>
      composeBacktestStrategySource('DIF: CLOSE;', {
        buy: {
          connector: 'AND',
          conditions: [
            {
              left: { kind: 'OUTPUT', key: 'DIF' },
              operator: 'GREATER',
              right: { kind: 'CONSTANT', value: Number.NaN },
            },
          ],
        },
      }),
    /BACKTEST_SIGNAL_RULE_INVALID_CONSTANT/,
  );
});

test('signal rule codegen terminates an unterminated final statement before appending', () => {
  const buyRule: DesktopBacktestSignalRules = {
    buy: {
      connector: 'AND',
      conditions: [
        {
          left: { kind: 'OUTPUT', key: 'DIF' },
          operator: 'CROSS_ABOVE',
          right: { kind: 'OUTPUT', key: 'DEA' },
        },
      ],
    },
  };

  // Final statement WITHOUT a trailing semicolon: insert one so the appended
  // signal statement parses (otherwise the grammar reports a missing semicolon).
  assert.equal(
    composeBacktestStrategySource('DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9)', buyRule),
    'DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9)\n;\nBUY: CROSS(DIF, DEA);',
  );

  // Final statement already terminated: keep a clean single-newline separator.
  assert.equal(
    composeBacktestStrategySource('DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9);', buyRule),
    'DIF: EMA(CLOSE, 12) - EMA(CLOSE, 26);\nDEA: EMA(DIF, 9);\nBUY: CROSS(DIF, DEA);',
  );
});
