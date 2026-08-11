// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpecialTrainingApi,
  type ApiSpecialTrainingBank,
} from "../../src/api/specialTraining";
import {
  canLoadMoreSpecialTrainingBanks,
  mergeSpecialTrainingBankPageItems,
} from "../../src/workspaces/special-training/banks/specialTrainingBankPoolHelpers";

const createBank = (
  id: string,
  name = `Bank ${id}`,
): ApiSpecialTrainingBank => ({
  id,
  name,
  assetClass: "STOCK",
  targetTimeframe: "1d",
  scope: {
    poolIds: [`pool-${id}`],
  },
  scopeSummary: {
    status: "READY",
    poolCount: 1,
    instrumentCount: 1,
    symbolCount: 1,
    sourceTimeframes: ["1d"],
    definitionHash: `definition-${id}`,
    missingPoolIds: [],
    maxSourceTimeframe: "1d",
  },
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
});

test("special training bank API requests paged bank search", async () => {
  const requests: string[] = [];
  const api = createSpecialTrainingApi(async <T>(path: string): Promise<T> => {
    requests.push(path);
    return {
      items: [createBank("bank-1")],
      nextCursor: "cursor-2",
      total: 3,
    } as T;
  });

  const page = await api.listSpecialTrainingBanks({
    limit: 2,
    cursor: "cursor-1",
    keyword: "Risk Bank",
  });

  assert.equal(
    requests[0],
    "/api/v1/training/special/banks?limit=2&cursor=cursor-1&keyword=Risk+Bank",
  );
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, "cursor-2");
  assert.equal(page.total, 3);
});

test("special training bank pages append, dedupe, and reset for new searches", () => {
  const currentBanks = [createBank("bank-1"), createBank("bank-2", "Old")];
  const nextPage = [createBank("bank-2", "Updated"), createBank("bank-3")];

  assert.deepEqual(
    mergeSpecialTrainingBankPageItems({
      currentBanks,
      incomingBanks: nextPage,
      append: true,
    }).map((bank) => [bank.id, bank.name]),
    [
      ["bank-1", "Bank bank-1"],
      ["bank-2", "Updated"],
      ["bank-3", "Bank bank-3"],
    ],
  );
  assert.deepEqual(
    mergeSpecialTrainingBankPageItems({
      currentBanks,
      incomingBanks: nextPage,
      append: false,
    }).map((bank) => bank.id),
    ["bank-2", "bank-3"],
  );
});

test("special training bank load-more state requires a cursor and idle request", () => {
  assert.equal(
    canLoadMoreSpecialTrainingBanks({
      nextCursor: "cursor-2",
      isLoadingMoreBanks: false,
    }),
    true,
  );
  assert.equal(
    canLoadMoreSpecialTrainingBanks({
      nextCursor: "cursor-2",
      isLoadingMoreBanks: true,
    }),
    false,
  );
  assert.equal(
    canLoadMoreSpecialTrainingBanks({
      nextCursor: null,
      isLoadingMoreBanks: false,
    }),
    false,
  );
});
