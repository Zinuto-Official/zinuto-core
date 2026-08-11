// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { ApiSpecialTrainingBank } from "../../src/api/specialTraining";
import { resolveSpecialTrainingBankCardPresentation } from "../../src/workspaces/special-training/banks/specialTrainingBankCardPresentation";

const bank: ApiSpecialTrainingBank = {
  id: "bank_1",
  name: "Backend owned bank",
  assetClass: "STOCK",
  targetTimeframe: "1d",
  scope: {
    poolIds: ["pool_1", "pool_2"],
  },
  scopeSummary: {
    status: "READY",
    poolCount: 2,
    instrumentCount: 9,
    symbolCount: 7,
    sourceTimeframes: ["1d"],
    definitionHash: "definition_1",
    missingPoolIds: [],
    maxSourceTimeframe: "1d",
  },
  createdAt: "2026-04-21T00:00:00.000Z",
  updatedAt: "2026-04-21T00:00:00.000Z",
};

test("bank card presentation uses backend scope summary instead of local pool map", () => {
  const presentation = resolveSpecialTrainingBankCardPresentation({
    bank,
    previewState: {
      loading: false,
      errorMessage: "",
      summary: bank.scopeSummary,
      missingPoolIds: [],
    },
    enabledSamplePoolById: new Map([
      [
        "pool_1",
        {
          id: "pool_1",
          name: "Pool 1",
          assetClass: "STOCK",
          assetClassLabel: "Stock",
          marketPresetId: "US_STOCK",
          baseTimeframe: "1d",
          symbols: ["AAPL"],
          instruments: [{ instrumentId: "instrument_1", symbol: "AAPL" }],
          questionBankRevisionToken: "revision_1",
        },
      ],
    ]),
    language: "en",
  });

  assert.equal(presentation.poolCount, 2);
  assert.equal(presentation.symbolCount, 7);
  assert.equal(presentation.status.tone, "ready");
});

test("bank card repair state takes priority over a stale ready summary", () => {
  const presentation = resolveSpecialTrainingBankCardPresentation({
    bank,
    previewState: {
      loading: false,
      errorMessage: "",
      summary: bank.scopeSummary,
      missingPoolIds: ["pool_2"],
    },
    enabledSamplePoolById: new Map(),
    language: "en",
  });

  assert.equal(presentation.status.tone, "danger");
  assert.equal(presentation.previewState.missingPoolIds[0], "pool_2");
});
