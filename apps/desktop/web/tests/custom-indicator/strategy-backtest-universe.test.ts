// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveStrategyBacktestUniverse,
} from "../../src/workspaces/strategy-backtest/strategyBacktestUniverse";

test("strategy backtest universe uses every valid instrument in the selected sample pool", () => {
  const universe = resolveStrategyBacktestUniverse({
    instruments: [
      { instrumentId: "instrument-a", symbol: "aaa" },
      { instrumentId: "instrument-b", symbol: "BBB" },
      { instrumentId: "instrument-a", symbol: "AAA_DUPLICATE" },
      { instrumentId: "", symbol: "EMPTY_ID" },
      { instrumentId: "instrument-empty-symbol", symbol: "" },
    ],
  });

  assert.deepEqual(universe.instrumentIds, ["instrument-a", "instrument-b"]);
  assert.deepEqual(universe.symbols, ["AAA", "BBB"]);
});

test("strategy backtest universe is independent from selected result symbol state", () => {
  const selectedResultSymbol = "ONLY_VISIBLE_RESULT";
  const universe = resolveStrategyBacktestUniverse({
    instruments: [
      { instrumentId: "instrument-a", symbol: "AAA" },
      { instrumentId: "instrument-b", symbol: "BBB" },
      { instrumentId: "instrument-c", symbol: "CCC" },
    ],
  });

  assert.equal(universe.instrumentIds.includes(selectedResultSymbol), false);
  assert.deepEqual(universe.instrumentIds, [
    "instrument-a",
    "instrument-b",
    "instrument-c",
  ]);
});
