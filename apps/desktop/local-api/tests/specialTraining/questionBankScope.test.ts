// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveSpecialTrainingLookbackBars } from "@zinuto/shared/specialTrainingModes";
import type { OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-special-training-question-bank-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db, DEFAULT_USER_ID },
  marketDatabaseModule,
  questionBankModule,
  specialTrainingBanksModule,
  bankEditorReadModelModule,
  specialTrainingServiceModule,
  systemSeedBarsModule,
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/application/specialTraining/questionBank.js"),
  import("../../src/application/specialTraining/banks.js"),
  import("../../src/application/specialTraining/bankEditorReadModel.js"),
  import("../../src/application/specialTrainingService.js"),
  import("../../src/infrastructure/db/systemSeedBars.js"),
]);

const { getMarketBarCount, replaceMarketBarsForInstrument } = marketDatabaseModule;
const {
  buildQuestionFromSlot,
  buildDeterministicQuestionSlotPermutation,
  normalizeSelectedPoolIds,
  readUsedSlotCount,
  resolveQuestionBankSummaryStateFromMeta,
  resolveQuestionScopeState,
  resolveDeterministicQuestionSlotOrdinal,
  resolveDisplaySlotByOrdinal,
  resetModeQuestionBankLedger,
} = questionBankModule;
const {
  DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
  DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  countDefaultSpecialTrainingQuestionBankSeeds,
  ensureDefaultSpecialTrainingQuestionBankSeed,
  listSpecialTrainingInstrumentIdsByPoolScope,
  listSpecialTrainingBanksPage,
  resolveSpecialTrainingBankScopeSummary,
} = specialTrainingBanksModule;
const { resolveSpecialTrainingBankEditorReadModel } = bankEditorReadModelModule;
const {
  createSpecialTrainingBank,
  deleteSpecialTrainingBank,
  discardSpecialTrainingChallenge,
  executeSpecialTrainingChallengeAction,
  getSpecialTrainingChallengeRuntime,
  listSpecialTrainingBanks,
  listPersistedSpecialTrainingHistorySessions,
  previewSpecialTrainingQuestionBankDraft,
  previewSpecialTrainingQuestionBank,
  resetSpecialTrainingQuestionBank,
  setSpecialTrainingChallengeActivity,
  settleSpecialTrainingQuestion,
  submitSpecialTrainingChallengeDecision,
  startSpecialTrainingChallenge,
} = specialTrainingServiceModule;
const {
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
} = systemSeedBarsModule;
const SYSTEM_SAMPLE_POOL_ID = SYSTEM_WIKI_EOD_POOL_ID;

test.after(async () => {
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const upsertScopedInstrument = db.prepare(
  `INSERT INTO instruments (
    id, source_id, symbol, base_timeframe, name, market, min_trade_step,
    bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    source_id = excluded.source_id,
    symbol = excluded.symbol,
    base_timeframe = excluded.base_timeframe,
    name = excluded.name,
    market = excluded.market,
    min_trade_step = excluded.min_trade_step,
    bar_count = excluded.bar_count,
    time_start_ts = excluded.time_start_ts,
    time_end_ts = excluded.time_end_ts,
    bars_version_token = excluded.bars_version_token`,
);

const insertLedger = db.prepare(
  `INSERT INTO special_training_question_ledger (
    id, user_id, bank_id, mode_id, scope_hash, symbol, timeframe, slot_index, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`,
);

const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, time_zone, base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    time_zone = excluded.time_zone,
    base_timeframe = excluded.base_timeframe,
    field_mapping_json = excluded.field_mapping_json,
    trading_calendar_json = excluded.trading_calendar_json,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);

const ensureSources = (poolIds: string[]) => {
  const now = new Date().toISOString();
  for (const poolId of normalizeSelectedPoolIds(poolIds)) {
    if (poolId === SYSTEM_SAMPLE_POOL_ID) {
      continue;
    }
    upsertSource.run(
      poolId,
      poolId,
      "UTC",
      "1d",
      "{}",
      DEFAULT_TRADING_CALENDAR_JSON,
      now,
      now,
    );
  }
};

const createBank = (input: {
  name: string;
  poolIds: string[];
  targetTimeframe?: "1m" | "5m" | "1h" | "1d";
}) => {
  const normalizedPoolIds = normalizeSelectedPoolIds(input.poolIds);
  ensureSources(normalizedPoolIds);
  return createSpecialTrainingBank({
    name: input.name,
    assetClass: "STOCK",
    targetTimeframe: input.targetTimeframe ?? "1d",
    poolIds: normalizedPoolIds,
  });
};

const buildTradingSessionMinuteBars = (
  dayCount: number,
  barsPerDay = 240,
): OhlcvBar[] => {
  const bars: OhlcvBar[] = [];
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    for (let minuteIndex = 0; minuteIndex < barsPerDay; minuteIndex += 1) {
      const open = 100 + dayIndex + minuteIndex / 1000;
      bars.push({
        ts: new Date(
          Date.UTC(2024, 0, 1 + dayIndex, 1, 30 + minuteIndex, 0, 0),
        ).toISOString(),
        open,
        high: open + 0.4,
        low: open - 0.4,
        close: open + 0.1,
        volume: 100 + minuteIndex,
      });
    }
  }
  return bars;
};

const buildDailyBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const open = 100 + index / 10;
    return {
      ts: new Date(Date.UTC(2024, 0, 1 + index, 0, 0, 0, 0)).toISOString(),
      open,
      high: open + 1,
      low: open - 1,
      close: open + 0.25,
      volume: 1_000 + index,
    };
  });

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildDecliningDailyBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const close = 1_000 * 0.99 ** index;
    const open = close / 0.995;
    return {
      ts: new Date(Date.UTC(2024, 0, 1 + index, 0, 0, 0, 0)).toISOString(),
      open,
      high: open * 1.002,
      low: close * 0.998,
      close,
      volume: 2_000 + index,
    };
  });

const resolvePoolInstrumentIds = (poolIds: string[]): string[] =>
  listSpecialTrainingInstrumentIdsByPoolScope(normalizeSelectedPoolIds(poolIds));

const countLedgerRowsByIds = (ledgerIds: string[]): number => {
  const normalizedLedgerIds = Array.from(
    new Set(
      ledgerIds
        .map((ledgerId) => String(ledgerId || "").trim())
        .filter((ledgerId) => ledgerId.length > 0),
    ),
  );
  if (!normalizedLedgerIds.length) {
    return 0;
  }
  const placeholders = normalizedLedgerIds.map(() => "?").join(",");
  return Number(
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_question_ledger
          WHERE id IN (${placeholders})`,
      )
      .pluck()
      .get(...normalizedLedgerIds) ?? 0,
  );
};

const listLedgerIdsForScope = (modeId: string, scopeHash: string): string[] =>
  (
    db
      .prepare(
        `SELECT id
           FROM special_training_question_ledger
          WHERE user_id = ?
            AND mode_id = ?
            AND scope_hash = ?
          ORDER BY id`,
      )
      .all(DEFAULT_USER_ID, modeId, scopeHash) as Array<{ id: string }>
  ).map((row) => row.id);

const countScopeIndexesForBank = (bankId: string): number =>
  Number(
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_question_scope_indexes
          WHERE user_id = ?
            AND bank_id = ?`,
      )
      .pluck()
      .get(DEFAULT_USER_ID, bankId) ?? 0,
  );

const hasHistoryForChallenge = (challengeId: string): boolean =>
  listPersistedSpecialTrainingHistorySessions({ limit: 100 }).some(
    (session) => session.challengeId === challengeId,
  );

test("deterministic question slot permutation covers each ordinal once per cycle", () => {
  const totalQuestionCount = 997;
  const firstCycle = buildDeterministicQuestionSlotPermutation({
    scopeHash: "scope-permutation-a",
    totalQuestionCount,
  });
  const repeatedFirstCycle = buildDeterministicQuestionSlotPermutation({
    scopeHash: "scope-permutation-a",
    totalQuestionCount,
  });
  const secondCycle = buildDeterministicQuestionSlotPermutation({
    scopeHash: "scope-permutation-a",
    cycleIndex: 1,
    totalQuestionCount,
  });
  const otherScope = buildDeterministicQuestionSlotPermutation({
    scopeHash: "scope-permutation-b",
    totalQuestionCount,
  });

  assert.equal(new Set(firstCycle).size, totalQuestionCount);
  assert.deepEqual([...firstCycle].sort((left, right) => left - right), Array.from({ length: totalQuestionCount }, (_, index) => index));
  assert.deepEqual(repeatedFirstCycle, firstCycle);
  assert.notDeepEqual(secondCycle.slice(0, 50), firstCycle.slice(0, 50));
  assert.notDeepEqual(otherScope.slice(0, 50), firstCycle.slice(0, 50));
  assert.equal(
    resolveDeterministicQuestionSlotOrdinal({
      scopeHash: "scope-permutation-a",
      totalQuestionCount,
      cycleIndex: 0,
      position: 12,
    }),
    firstCycle[12],
  );
});

test("default system question bank preview stays metadata-only", async () => {
  const defaultBank = ensureDefaultSpecialTrainingQuestionBankSeed({ force: true });
  assert.ok(defaultBank);
  const fxInstrument = db
    .prepare(
      `SELECT id
         FROM instruments
        WHERE market = 'SYSTEM'
          AND symbol = 'AUDCAD'
          AND base_timeframe = '1m'
        LIMIT 1`,
    )
    .get() as { id?: string } | undefined;
  assert.ok(fxInstrument?.id);
  assert.equal(await getMarketBarCount(fxInstrument.id), 0);

  const preview = await previewSpecialTrainingQuestionBank({
    bankId: defaultBank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });

  assert.equal(preview.status, "READY_FRESH");
  assert.equal(preview.totalQuestionCount > 0, true);
  assert.deepEqual(preview.sourceTimeframes, ["1m", "1d"]);
  assert.deepEqual(preview.effectiveTimeframes, ["1d"]);
  assert.equal(await getMarketBarCount(fxInstrument.id), 0);
});

test("default 1d question bank seeds once and stays deleted until forced", () => {
  const seededBanks = listSpecialTrainingBanks();
  const defaultBank = seededBanks.find(
    (bank) => bank.name === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
  );

  assert.ok(defaultBank);
  assert.equal(defaultBank.targetTimeframe, "1d");
  assert.equal(defaultBank.assetClass, "STOCK");
  assert.deepEqual(
    defaultBank.scope.poolIds,
    DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  );
  assert.equal(defaultBank.scopeSummary.status, "READY");
  assert.equal(defaultBank.scopeSummary.poolCount, 2);
  assert.deepEqual(defaultBank.scopeSummary.sourceTimeframes, ["1m", "1d"]);
  assert.equal(countDefaultSpecialTrainingQuestionBankSeeds(), 1);

  deleteSpecialTrainingBank(defaultBank.id);
  assert.equal(countDefaultSpecialTrainingQuestionBankSeeds(), 0);
  assert.equal(
    listSpecialTrainingBanks().some(
      (bank) => bank.name === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
    ),
    false,
  );

  const forcedBank = ensureDefaultSpecialTrainingQuestionBankSeed({
    force: true,
  });
  assert.ok(forcedBank);
  assert.equal(forcedBank.name, DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME);
  assert.equal(forcedBank.targetTimeframe, "1d");
  assert.deepEqual(
    forcedBank.scope.poolIds,
    DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  );
});

test("listSpecialTrainingBanksPage paginates by cursor and bank name keyword", () => {
  const bankIds: string[] = [];
  const poolId = "pool-bank-pagination";
  const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
  const now = new Date().toISOString();
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    "instrument-bank-pagination",
    poolId,
    "PAGE.TEST",
    "1d",
    "PAGE",
    "LOCAL",
    1,
    1000,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-bank-pagination-v1",
    now,
  );
  try {
    for (let index = 0; index < 105; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const bank = createBank({
        name: `page-bank-${suffix}`,
        poolIds: [poolId],
        targetTimeframe: "1d",
      });
      bankIds.push(bank.id);
      const timestamp = new Date(baseTime + index * 60_000).toISOString();
      db.prepare(
        `UPDATE special_training_banks
            SET created_at = ?,
                updated_at = ?
          WHERE id = ?`,
      ).run(timestamp, timestamp, bank.id);
    }

    const defaultPage = listSpecialTrainingBanksPage({
      keyword: "page-bank-",
    });
    assert.equal(defaultPage.items.length, 30);
    assert.equal(defaultPage.total, 105);
    assert.equal(defaultPage.items[0]?.name, "page-bank-104");

    const firstPage = listSpecialTrainingBanksPage({
      limit: 250,
      keyword: "page-bank-",
    });
    assert.equal(firstPage.items.length, 100);
    assert.equal(firstPage.total, 105);
    assert.ok(firstPage.nextCursor);

    const secondPage = listSpecialTrainingBanksPage({
      limit: 250,
      cursor: firstPage.nextCursor ?? undefined,
      keyword: "page-bank-",
    });
    assert.equal(secondPage.items.length, 5);
    assert.equal(secondPage.total, 105);
    assert.equal(secondPage.nextCursor, null);

    const allPagedIds = [...firstPage.items, ...secondPage.items].map(
      (bank) => bank.id,
    );
    assert.equal(new Set(allPagedIds).size, 105);
    assert.deepEqual(
      secondPage.items.map((bank) => bank.name),
      [
        "page-bank-004",
        "page-bank-003",
        "page-bank-002",
        "page-bank-001",
        "page-bank-000",
      ],
    );

    const keywordPage = listSpecialTrainingBanksPage({
      limit: 10,
      keyword: "page-bank-042",
    });
    assert.equal(keywordPage.total, 1);
    assert.deepEqual(
      keywordPage.items.map((bank) => bank.name),
      ["page-bank-042"],
    );
  } finally {
    for (const bankId of bankIds) {
      deleteSpecialTrainingBank(bankId);
    }
  }
});

test("question bank scope hash changes when selected pool ids or data version changes", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-alpha", "pool-beta"]);
  upsertScopedInstrument.run(
    "instrument-aaa-alpha",
    "pool-alpha",
    "AAA.TEST",
    "1d",
    "AAA",
    "LOCAL",
    1,
    240,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-v1",
    now,
  );
  upsertScopedInstrument.run(
    "instrument-aaa-beta",
    "pool-beta",
    "AAA.TEST",
    "1d",
    "AAA",
    "LOCAL",
    1,
    240,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-aaa-alpha",
    "AAA.TEST",
    buildDailyBars(240),
  );
  await replaceMarketBarsForInstrument(
    "instrument-aaa-beta",
    "AAA.TEST",
    buildDailyBars(240),
  );

  const firstBank = createBank({
    name: "bank-alpha",
    poolIds: ["pool-alpha"],
  });
  const secondBank = createBank({
    name: "bank-beta",
    poolIds: ["pool-beta"],
  });
  const firstInstrumentIds = resolvePoolInstrumentIds(firstBank.scope.poolIds);
  const secondInstrumentIds = resolvePoolInstrumentIds(secondBank.scope.poolIds);
  const firstScope = await resolveQuestionBankSummaryStateFromMeta(
    "fast-decision-training",
    firstBank.id,
    firstBank.name,
    firstBank.scope.poolIds.length,
    firstInstrumentIds,
    20,
    "1d",
  );
  const secondScope = await resolveQuestionBankSummaryStateFromMeta(
    "fast-decision-training",
    secondBank.id,
    secondBank.name,
    secondBank.scope.poolIds.length,
    secondInstrumentIds,
    20,
    "1d",
  );

  assert.notEqual(firstScope.scopeHash, secondScope.scopeHash);

  upsertScopedInstrument.run(
    "instrument-aaa-alpha",
    "pool-alpha",
    "AAA.TEST",
    "1d",
    "AAA",
    "LOCAL",
    1,
    240,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-v2",
    now,
  );

  const updatedScope = await resolveQuestionBankSummaryStateFromMeta(
    "fast-decision-training",
    firstBank.id,
    firstBank.name,
    firstBank.scope.poolIds.length,
    firstInstrumentIds,
    20,
    "1d",
  );

  assert.notEqual(firstScope.scopeHash, updatedScope.scopeHash);
});

test("question bank summary is backend-owned and internally consistent", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-summary-owner"]);
  upsertScopedInstrument.run(
    "instrument-summary-owner",
    "pool-summary-owner",
    "SUMMARY.TEST",
    "1d",
    "SUMMARY",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-summary-owner-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-summary-owner",
    "SUMMARY.TEST",
    buildDailyBars(260),
  );

  const bank = createBank({
    name: "bank-summary-owner",
    poolIds: ["pool-summary-owner"],
    targetTimeframe: "1d",
  });
  const initialSummary = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  assert.ok(initialSummary.totalQuestionCount > 2);
  assert.equal(initialSummary.status, "READY_FRESH");
  assert.equal(countScopeIndexesForBank(bank.id), 1);

  const repeatedSummary = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  assert.equal(repeatedSummary.scopeHash, initialSummary.scopeHash);
  assert.equal(repeatedSummary.totalQuestionCount, initialSummary.totalQuestionCount);
  assert.equal(countScopeIndexesForBank(bank.id), 1);

  insertLedger.run(
    "ledger-summary-owner-1",
    DEFAULT_USER_ID,
    bank.id,
    "fast-decision-training",
    initialSummary.scopeHash,
    "SUMMARY.TEST",
    "1d",
    0,
    now,
    now,
  );
  insertLedger.run(
    "ledger-summary-owner-2",
    DEFAULT_USER_ID,
    bank.id,
    "fast-decision-training",
    initialSummary.scopeHash,
    "SUMMARY.TEST",
    "1d",
    1,
    now,
    now,
  );

  const summary = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });

  assert.equal(summary.status, "READY_IN_PROGRESS");
  assert.equal(summary.completedQuestionCount, 2);
  assert.equal(
    summary.remainingQuestionCount,
    summary.totalQuestionCount - summary.completedQuestionCount,
  );
  assert.equal(summary.availableQuestionCount, summary.remainingQuestionCount);
  assert.equal(summary.builtQuestionCount, summary.completedQuestionCount);
  assert.equal(summary.capacity.requestedQuestionCount, 1);
  assert.equal(summary.actionAvailability.start.enabled, true);
  assert.equal(summary.actionAvailability.reset.enabled, true);
  assert.equal(summary.actionAvailability.reset.hasProgress, true);
  assert.equal(summary.symbolCount, 1);
  assert.equal(summary.instrumentCount, 1);

  const insufficientSummary = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
    questionCount: summary.totalQuestionCount + 1,
  });
  assert.equal(insufficientSummary.capacity.hasCapacityForRun, false);
  assert.equal(insufficientSummary.actionAvailability.start.enabled, false);
  assert.equal(
    insufficientSummary.actionAvailability.start.reasonCode,
    "QUESTION_BANK_INSUFFICIENT",
  );

  const resetSummary = await resetSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
    questionCount: 5,
  });
  assert.equal(resetSummary.runtimeState.noticeKind, "RESET_DONE");
  assert.equal(resetSummary.actionAvailability.reset.enabled, false);
  assert.equal(resetSummary.completedQuestionCount, 0);
});

test("invalidated local pools keep question-bank history but block preview, reset, and challenge start", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-invalidated-source";
  const instrumentId = "instrument-invalidated-source";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "INVALIDATED.TEST",
    "1d",
    "Invalidated",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-invalidated-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "INVALIDATED.TEST",
    buildDailyBars(260),
  );
  const bank = createBank({
    name: "bank-invalidated-source",
    poolIds: [poolId],
  });
  const readyPreview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  insertLedger.run(
    "ledger-invalidated-source",
    DEFAULT_USER_ID,
    bank.id,
    "fast-decision-training",
    readyPreview.scopeHash,
    "INVALIDATED.TEST",
    "1d",
    0,
    now,
    now,
  );
  const ledgerIdsBefore = listLedgerIdsForScope(
    "fast-decision-training",
    readyPreview.scopeHash,
  );
  assert.deepEqual(ledgerIdsBefore, ["ledger-invalidated-source"]);

  for (const state of [
    { status: "FAILED", deletionState: "IDLE" },
    { status: "IMPORTING", deletionState: "IDLE" },
    { status: "READY", deletionState: "DELETING" },
    { status: "READY", deletionState: "MUTATING_SYMBOLS" },
  ]) {
    db.prepare(
      `UPDATE local_data_sources
          SET status = ?, deletion_state = ?, updated_at = ?
        WHERE id = ?`,
    ).run(state.status, state.deletionState, new Date().toISOString(), poolId);

    const scopeSummary = resolveSpecialTrainingBankScopeSummary({
      targetTimeframe: "1d",
      poolIds: [poolId],
    });
    assert.equal(scopeSummary.status, "REPAIR_REQUIRED");
    assert.deepEqual(scopeSummary.missingPoolIds, [poolId]);
    assert.deepEqual(resolvePoolInstrumentIds([poolId]), []);

    for (const operation of [
      () =>
        previewSpecialTrainingQuestionBank({
          bankId: bank.id,
          modeId: "fast-decision-training",
          horizonBars: 20,
        }),
      () =>
        resetSpecialTrainingQuestionBank({
          bankId: bank.id,
          modeId: "fast-decision-training",
          horizonBars: 20,
        }),
      () =>
        startSpecialTrainingChallenge({
          bankId: bank.id,
          modeId: "fast-decision-training",
          questionCount: 5,
          horizonBars: 20,
        }),
    ]) {
      await assert.rejects(
        operation,
        (error: unknown) =>
          Boolean(error) &&
          typeof error === "object" &&
          (error as { code?: unknown }).code ===
            "SPECIAL_TRAINING_SYMBOLS_REQUIRED",
      );
    }
    assert.deepEqual(
      listLedgerIdsForScope("fast-decision-training", readyPreview.scopeHash),
      ledgerIdsBefore,
    );
  }

  db.prepare(
    `UPDATE local_data_sources
        SET status = 'READY', deletion_state = 'IDLE', updated_at = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), poolId);
  const readyScope = resolveSpecialTrainingBankScopeSummary({
    targetTimeframe: "1d",
    poolIds: [poolId],
  });
  assert.equal(readyScope.status, "READY");
  assert.deepEqual(resolvePoolInstrumentIds([poolId]), [instrumentId]);
  assert.deepEqual(bank.scope.poolIds, [poolId]);
});

test("question bank cold scope builds coalesce duplicate previews and cap market metadata reads", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-question-scope-coalesce";
  const instrumentIds = Array.from(
    { length: 10 },
    (_, index) => `instrument-question-scope-coalesce-${index}`,
  );
  ensureSources([poolId]);
  instrumentIds.forEach((instrumentId, index) => {
    upsertScopedInstrument.run(
      instrumentId,
      poolId,
      `COALESCE${index}.TEST`,
      "1d",
      `COALESCE ${index}`,
      "LOCAL",
      1,
      260,
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T00:00:00.000Z",
      `bars-question-scope-coalesce-${index}`,
      now,
    );
  });
  const bank = createBank({
    name: "bank-question-scope-coalesce",
    poolIds: [poolId],
    targetTimeframe: "1d",
  });
  const resolvedInstrumentIds = resolvePoolInstrumentIds(bank.scope.poolIds);
  let activeReads = 0;
  let maxActiveReads = 0;
  let readCount = 0;
  const readInstrumentIds: string[] = [];
  const marketReader = {
    getMarketTimelineTotalDisplay:
      marketDatabaseModule.getMarketTimelineTotalDisplay,
    getMarketBarCount: async (instrumentId: string): Promise<number> => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      readCount += 1;
      readInstrumentIds.push(String(instrumentId || "").trim());
      try {
        await delay(20);
        return 260;
      } finally {
        activeReads -= 1;
      }
    },
  };
  const summaries = await Promise.all(
    Array.from({ length: 4 }, () =>
      resolveQuestionBankSummaryStateFromMeta(
        "fast-decision-training",
        bank.id,
        bank.name,
        bank.scope.poolIds.length,
        resolvedInstrumentIds,
        20,
        "1d",
        marketReader,
      ),
    ),
  );
  const firstSummary = summaries[0]!;
  summaries.forEach((summary) => {
    assert.equal(summary.scopeHash, firstSummary.scopeHash);
    assert.equal(summary.totalQuestionCount, firstSummary.totalQuestionCount);
  });
  assert.equal(readCount, resolvedInstrumentIds.length);
  assert.deepEqual(
    [...new Set(readInstrumentIds)].sort((left, right) =>
      left.localeCompare(right),
    ),
    [...resolvedInstrumentIds].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
  assert.ok(maxActiveReads <= 2);
  assert.equal(countScopeIndexesForBank(bank.id), 1);
});

test("question bank market metadata cap is shared across concurrent scope builds", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-question-scope-global-cap";
  const instrumentIds = Array.from(
    { length: 8 },
    (_, index) => `instrument-question-scope-global-cap-${index}`,
  );
  ensureSources([poolId]);
  instrumentIds.forEach((instrumentId, index) => {
    upsertScopedInstrument.run(
      instrumentId,
      poolId,
      `GLOBALCAP${index}.TEST`,
      "1d",
      `GLOBALCAP ${index}`,
      "LOCAL",
      1,
      260,
      "2024-01-01T00:00:00.000Z",
      "2024-12-31T00:00:00.000Z",
      `bars-question-scope-global-cap-${index}`,
      now,
    );
  });
  const bank = createBank({
    name: "bank-question-scope-global-cap",
    poolIds: [poolId],
    targetTimeframe: "1d",
  });
  const resolvedInstrumentIds = resolvePoolInstrumentIds(bank.scope.poolIds);
  let activeReads = 0;
  let maxActiveReads = 0;
  let readCount = 0;
  const marketReader = {
    getMarketTimelineTotalDisplay:
      marketDatabaseModule.getMarketTimelineTotalDisplay,
    getMarketBarCount: async (): Promise<number> => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      readCount += 1;
      try {
        await delay(20);
        return 260;
      } finally {
        activeReads -= 1;
      }
    },
  };
  const [fastDecisionSummary, riskDisciplineSummary] = await Promise.all([
    resolveQuestionBankSummaryStateFromMeta(
      "fast-decision-training",
      bank.id,
      bank.name,
      bank.scope.poolIds.length,
      resolvedInstrumentIds,
      20,
      "1d",
      marketReader,
    ),
    resolveQuestionBankSummaryStateFromMeta(
      "risk-discipline-training",
      bank.id,
      bank.name,
      bank.scope.poolIds.length,
      resolvedInstrumentIds,
      20,
      "1d",
      marketReader,
    ),
  ]);
  assert.ok(fastDecisionSummary.totalQuestionCount > 0);
  assert.ok(riskDisciplineSummary.totalQuestionCount > 0);
  assert.notEqual(fastDecisionSummary.scopeHash, riskDisciplineSummary.scopeHash);
  assert.equal(readCount, resolvedInstrumentIds.length * 2);
  assert.ok(maxActiveReads <= 2);
  assert.equal(countScopeIndexesForBank(bank.id), 2);
});

test("mixed 1d and 1m instruments preview and start with a unified target timeframe", async () => {
  const now = new Date().toISOString();
  const minuteBars = buildTradingSessionMinuteBars(180);
  ensureSources(["pool-day", "pool-minute"]);
  upsertScopedInstrument.run(
    "instrument-mixed-day",
    "pool-day",
    "MIX.TEST",
    "1d",
    "MIX day",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-day-v1",
    now,
  );
  upsertScopedInstrument.run(
    "instrument-mixed-minute",
    "pool-minute",
    "MIX.TEST",
    "1m",
    "MIX minute",
    "LOCAL",
    1,
    minuteBars.length,
    minuteBars[0]?.ts ?? null,
    minuteBars.at(-1)?.ts ?? null,
    "bars-minute-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-mixed-day",
    "MIX.TEST",
    buildDailyBars(260),
  );
  await replaceMarketBarsForInstrument(
    "instrument-mixed-minute",
    "MIX.TEST",
    minuteBars,
  );

  const bank = createBank({
    name: "bank-mixed",
    poolIds: ["pool-day", "pool-minute"],
    targetTimeframe: "1d",
  });
  const preview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });

  assert.ok(preview.totalQuestionCount > 0);
  assert.deepEqual(preview.sourceTimeframes, ["1m", "1d"]);
  assert.deepEqual(preview.effectiveTimeframes, ["1d"]);
  assert.equal(preview.symbolCount, 1);
  assert.equal(preview.targetTimeframe, "1d");

  const scopeState = await resolveQuestionScopeState(
    "fast-decision-training",
    bank.id,
    bank.name,
    bank.scope.poolIds.length,
    resolvePoolInstrumentIds(bank.scope.poolIds),
    20,
    "1d",
  );
  const daySlotRange =
    scopeState.slotRangesByInstrumentId.get("instrument-mixed-day") ?? null;
  const minuteSlotRange =
    scopeState.slotRangesByInstrumentId.get("instrument-mixed-minute") ?? null;
  const daySlot = daySlotRange
    ? await resolveDisplaySlotByOrdinal(scopeState, daySlotRange.slotStartIndex)
    : null;
  const minuteSlot = minuteSlotRange
    ? await resolveDisplaySlotByOrdinal(
        scopeState,
        minuteSlotRange.slotStartIndex,
      )
    : null;
  assert.ok(daySlot);
  assert.ok(minuteSlot);

  const dayQuestion = await buildQuestionFromSlot(
    scopeState,
    daySlot!,
    "ledger-day",
  );

  assert.equal(dayQuestion.targetTimeframe, "1d");
  assert.equal(dayQuestion.instrumentId, "instrument-mixed-day");
  assert.equal(dayQuestion.effectiveTimeframe, "1d");
  assert.equal(minuteSlot!.targetTimeframe, "1d");
  assert.equal(minuteSlot!.instrumentId, "instrument-mixed-minute");
  assert.equal(minuteSlot!.effectiveTimeframe, "1d");

  const minuteQuestion = await buildQuestionFromSlot(
    scopeState,
    minuteSlot!,
    "ledger-minute",
  );
  assert.equal(minuteQuestion.targetTimeframe, "1d");
  assert.equal(minuteQuestion.sourceTimeframe, "1m");
  assert.equal(minuteQuestion.effectiveTimeframe, "1d");
  assert.ok(
    minuteQuestion.sourceWindowBarCount <
      minuteQuestion.effectiveWindowBarCount * 1440,
  );
  assert.equal(
    minuteQuestion.bars.length,
    minuteQuestion.effectiveWindowBarCount,
  );
});

test("1m local market bars preview and start as daily target timeframe", async () => {
  const now = new Date().toISOString();
  const minuteBars = buildTradingSessionMinuteBars(360);
  ensureSources(["pool-minute-daily"]);
  upsertScopedInstrument.run(
    "instrument-minute-daily",
    "pool-minute-daily",
    "DAILY.TEST",
    "1m",
    "DAILY minute",
    "LOCAL",
    1,
    minuteBars.length,
    minuteBars[0]?.ts ?? null,
    minuteBars.at(-1)?.ts ?? null,
    "bars-minute-daily-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-minute-daily",
    "DAILY.TEST",
    minuteBars,
  );

  const bank = createBank({
    name: "bank-minute-daily",
    poolIds: ["pool-minute-daily"],
    targetTimeframe: "1d",
  });

  const persistedPreview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  const draftPreview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: ["pool-minute-daily"],
  });

  assert.ok(persistedPreview.totalQuestionCount > 0);
  assert.ok(persistedPreview.availableQuestionCount > 0);
  assert.deepEqual(persistedPreview.sourceTimeframes, ["1m"]);
  assert.deepEqual(persistedPreview.effectiveTimeframes, ["1d"]);
  assert.equal(draftPreview.status, "READY");
  assert.equal(draftPreview.poolCount, 1);
  assert.equal(draftPreview.symbolCount, 1);
  assert.deepEqual(draftPreview.sourceTimeframes, ["1m"]);
  assert.equal(draftPreview.maxSourceTimeframe, "1m");

  const challenge = await startSpecialTrainingChallenge({
    bankId: bank.id,
    modeId: "fast-decision-training",
    questionCount: 5,
    horizonBars: 20,
  });
  const question = challenge.runtime.question;
  const lookbackBars = resolveSpecialTrainingLookbackBars(
    "fast-decision-training",
  );
  const expectedWindowBarCount = lookbackBars + 20;

  assert.ok(question);
  assert.equal(question?.sourceTimeframe, "1m");
  assert.equal(question?.effectiveTimeframe, "1d");
  assert.equal(question?.bars?.length, expectedWindowBarCount);
  assert.equal(challenge.runtime.questionStartIndex, lookbackBars - 1);
  assert.equal(challenge.runtime.questionEndIndex, expectedWindowBarCount - 1);

  resetModeQuestionBankLedger(bank.id, "fast-decision-training");
});

test("1m local market bars preview and start as hourly fast-decision timeframe", async () => {
  const now = new Date().toISOString();
  const minuteBars = buildTradingSessionMinuteBars(90);
  ensureSources(["pool-minute-hourly"]);
  upsertScopedInstrument.run(
    "instrument-minute-hourly",
    "pool-minute-hourly",
    "HOURLY.TEST",
    "1m",
    "HOURLY minute",
    "LOCAL",
    1,
    minuteBars.length,
    minuteBars[0]?.ts ?? null,
    minuteBars.at(-1)?.ts ?? null,
    "bars-minute-hourly-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-minute-hourly",
    "HOURLY.TEST",
    minuteBars,
  );

  const bank = createBank({
    name: "bank-minute-hourly",
    poolIds: ["pool-minute-hourly"],
    targetTimeframe: "1h",
  });

  const persistedPreview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  const draftPreview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "STOCK",
    targetTimeframe: "1h",
    poolIds: ["pool-minute-hourly"],
  });

  assert.ok(persistedPreview.totalQuestionCount > 0);
  assert.ok(persistedPreview.availableQuestionCount > 0);
  assert.deepEqual(persistedPreview.sourceTimeframes, ["1m"]);
  assert.deepEqual(persistedPreview.effectiveTimeframes, ["1h"]);
  assert.equal(persistedPreview.targetTimeframe, "1h");
  assert.equal(draftPreview.status, "READY");
  assert.deepEqual(draftPreview.sourceTimeframes, ["1m"]);
  assert.equal(draftPreview.maxSourceTimeframe, "1m");

  const challenge = await startSpecialTrainingChallenge({
    bankId: bank.id,
    modeId: "fast-decision-training",
    questionCount: 5,
    horizonBars: 20,
  });
  const question = challenge.runtime.question;
  const lookbackBars = resolveSpecialTrainingLookbackBars(
    "fast-decision-training",
  );
  const expectedWindowBarCount = lookbackBars + 20;

  assert.ok(question);
  assert.equal(question?.sourceTimeframe, "1m");
  assert.equal(question?.targetTimeframe, "1h");
  assert.equal(question?.effectiveTimeframe, "1h");
  assert.equal(question?.bars?.length, expectedWindowBarCount);
  assert.equal(challenge.runtime.questionStartIndex, lookbackBars - 1);
  assert.equal(challenge.runtime.questionEndIndex, expectedWindowBarCount - 1);

  resetModeQuestionBankLedger(bank.id, "fast-decision-training");
});

test("1m daily-target preview uses available context when default lookback is longer than the data span", async () => {
  const now = new Date().toISOString();
  const minuteBars = buildTradingSessionMinuteBars(89);
  ensureSources(["pool-minute-daily-short"]);
  upsertScopedInstrument.run(
    "instrument-minute-daily-short",
    "pool-minute-daily-short",
    "SHORTDAILY.TEST",
    "1m",
    "SHORT DAILY minute",
    "LOCAL",
    1,
    minuteBars.length,
    minuteBars[0]?.ts ?? null,
    minuteBars.at(-1)?.ts ?? null,
    "bars-minute-daily-short-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-minute-daily-short",
    "SHORTDAILY.TEST",
    minuteBars,
  );

  const bank = createBank({
    name: "bank-minute-daily-short",
    poolIds: ["pool-minute-daily-short"],
    targetTimeframe: "1d",
  });

  const preview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "FOREX",
    targetTimeframe: "1d",
    poolIds: ["pool-minute-daily-short"],
  });
  const scopeState = await resolveQuestionScopeState(
    "fast-decision-training",
    bank.id,
    bank.name,
    bank.scope.poolIds.length,
    resolvePoolInstrumentIds(bank.scope.poolIds),
    20,
    "1d",
  );
  const slotRange =
    scopeState.slotRangesByInstrumentId.get("instrument-minute-daily-short") ??
    null;
  const slot = slotRange
    ? await resolveDisplaySlotByOrdinal(scopeState, slotRange.slotStartIndex)
    : null;

  assert.equal(preview.status, "READY");
  assert.equal(preview.poolCount, 1);
  assert.equal(preview.symbolCount, 1);
  assert.deepEqual(preview.sourceTimeframes, ["1m"]);
  assert.equal(preview.maxSourceTimeframe, "1m");
  assert.ok(slotRange);
  assert.equal(slotRange?.effectiveWindowBarCount, 89);
  assert.equal(slotRange?.startIndex, 68);
  assert.equal(slotRange?.endIndex, 88);
  assert.ok(slot);
  assert.equal(slot?.sourceTimeframe, "1m");
  assert.equal(slot?.effectiveTimeframe, "1d");
});

test("question slot ranges require at least one forward bar", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-forward-window"]);
  upsertScopedInstrument.run(
    "instrument-forward-window",
    "pool-forward-window",
    "FORWARD.TEST",
    "1d",
    "FORWARD",
    "LOCAL",
    1,
    120,
    "2024-01-01T00:00:00.000Z",
    "2024-05-01T00:00:00.000Z",
    "bars-forward-window-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-forward-window",
    "FORWARD.TEST",
    buildDailyBars(120),
  );

  const bank = createBank({
    name: "bank-forward-window",
    poolIds: ["pool-forward-window"],
    targetTimeframe: "1d",
  });
  const scopeState = await resolveQuestionScopeState(
    "fast-decision-training",
    bank.id,
    bank.name,
    bank.scope.poolIds.length,
    resolvePoolInstrumentIds(bank.scope.poolIds),
    0,
    "1d",
  );
  const slotRange =
    scopeState.slotRangesByInstrumentId.get("instrument-forward-window") ??
    null;
  const slot = slotRange
    ? await resolveDisplaySlotByOrdinal(scopeState, slotRange.slotStartIndex)
    : null;

  assert.ok(slotRange);
  assert.ok(slot);
  assert.ok(slot!.endIndex > slot!.startIndex);
});

test("question bank preview excludes metadata-only instruments without market bars", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-metadata-only"]);
  upsertScopedInstrument.run(
    "instrument-metadata-only",
    "pool-metadata-only",
    "METAONLY.TEST",
    "1d",
    "METAONLY",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-metadata-only-v1",
    now,
  );

  const bank = createBank({
    name: "bank-metadata-only",
    poolIds: ["pool-metadata-only"],
    targetTimeframe: "1d",
  });
  const preview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });

  assert.equal(preview.status, "EMPTY");
  assert.equal(preview.totalQuestionCount, 0);
  assert.equal(preview.instrumentCount, 0);
  assert.equal(preview.symbolCount, 0);
});

test("same symbol from different local sources remains distinct when instrument ids are both selected", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-source-a", "pool-source-b"]);
  upsertScopedInstrument.run(
    "instrument-source-a",
    "pool-source-a",
    "DUPE.TEST",
    "1d",
    "DUPE A",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-a-v1",
    now,
  );
  upsertScopedInstrument.run(
    "instrument-source-b",
    "pool-source-b",
    "DUPE.TEST",
    "1d",
    "DUPE B",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-b-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-source-a",
    "DUPE.TEST",
    buildDailyBars(260),
  );
  await replaceMarketBarsForInstrument(
    "instrument-source-b",
    "DUPE.TEST",
    buildDailyBars(260),
  );

  const firstBank = createBank({
    name: "bank-source-a",
    poolIds: ["pool-source-a"],
  });
  const combinedBank = createBank({
    name: "bank-source-combined",
    poolIds: ["pool-source-a", "pool-source-b"],
  });
  const firstOnly = await resolveQuestionBankSummaryStateFromMeta(
    "fast-decision-training",
    firstBank.id,
    firstBank.name,
    firstBank.scope.poolIds.length,
    resolvePoolInstrumentIds(firstBank.scope.poolIds),
    20,
    "1d",
  );
  const combined = await resolveQuestionBankSummaryStateFromMeta(
    "fast-decision-training",
    combinedBank.id,
    combinedBank.name,
    combinedBank.scope.poolIds.length,
    resolvePoolInstrumentIds(combinedBank.scope.poolIds),
    20,
    "1d",
  );

  assert.equal(combined.normalizedSymbolsWithBars.length, 1);
  assert.ok(combined.totalQuestionCount > firstOnly.totalQuestionCount);
});

test("draft preview returns the same scope summary as a persisted bank", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-draft-preview"]);
  upsertScopedInstrument.run(
    "instrument-draft-preview",
    "pool-draft-preview",
    "DRAFT.TEST",
    "1d",
    "DRAFT",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-draft-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-draft-preview",
    "DRAFT.TEST",
    buildDailyBars(260),
  );
  const bank = createBank({
    name: "bank-draft-preview",
    poolIds: ["pool-draft-preview"],
    targetTimeframe: "1d",
  });

  const persistedPreview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  const draftPreview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: ["pool-draft-preview"],
  });

  assert.ok(persistedPreview.totalQuestionCount > 0);
  assert.equal(draftPreview.status, bank.scopeSummary.status);
  assert.equal(draftPreview.poolCount, bank.scopeSummary.poolCount);
  assert.equal(draftPreview.symbolCount, bank.scopeSummary.symbolCount);
  assert.equal(draftPreview.definitionHash, bank.scopeSummary.definitionHash);
  assert.deepEqual(draftPreview.sourceTimeframes, persistedPreview.sourceTimeframes);
  assert.deepEqual(draftPreview.sourceTimeframes, bank.scopeSummary.sourceTimeframes);
  assert.equal(draftPreview.maxSourceTimeframe, bank.scopeSummary.maxSourceTimeframe);
});

test("question banks accept built-in system pools during create and preview", async () => {
  db.prepare(
    `DELETE FROM instruments
      WHERE market = 'SYSTEM'
        AND NOT (
          (symbol = 'AAPL' AND base_timeframe = '1d') OR
          (symbol = 'EURUSD' AND base_timeframe = '1m')
        )`,
  ).run();
  db.prepare(
    `UPDATE instruments
        SET bar_count = ?,
            time_start_ts = ?,
            time_end_ts = ?,
            bars_version_token = ?
      WHERE market = 'SYSTEM'
        AND symbol = ?
        AND base_timeframe = ?`,
  ).run(
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-system-aapl-test",
    "AAPL",
    "1d",
  );
  db.prepare(
    `UPDATE instruments
        SET bar_count = ?,
            time_start_ts = ?,
            time_end_ts = ?,
            bars_version_token = ?
      WHERE market = 'SYSTEM'
        AND symbol = ?
        AND base_timeframe = ?`,
  ).run(
    1_440,
    "2025-01-02T05:00:00.000Z",
    "2025-01-03T04:59:00.000Z",
    "bars-system-eurusd-test",
    "EURUSD",
    "1m",
  );
  const bank = createSpecialTrainingBank({
    name: "bank-system-preview",
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: [SYSTEM_SAMPLE_POOL_ID, SYSTEM_FX_1M_2025Q1_POOL_ID],
  });

  const persistedPreview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId: "fast-decision-training",
    horizonBars: 20,
  });
  const draftPreview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: [SYSTEM_SAMPLE_POOL_ID, SYSTEM_FX_1M_2025Q1_POOL_ID],
  });

  assert.deepEqual(bank.scope.poolIds, [
    SYSTEM_SAMPLE_POOL_ID,
    SYSTEM_FX_1M_2025Q1_POOL_ID,
  ]);
  assert.ok(persistedPreview.totalQuestionCount > 0);
  assert.equal(persistedPreview.poolCount, 2);
  assert.equal(draftPreview.status, "READY");
  assert.equal(draftPreview.poolCount, 2);
  assert.ok(draftPreview.symbolCount > 0);
  assert.deepEqual(draftPreview.sourceTimeframes, ["1m", "1d"]);
  assert.equal(draftPreview.maxSourceTimeframe, "1d");
});

test("question banks can mix pools from different asset classes when target timeframe is valid", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-draft-stock"]);
  ensureSources(["pool-draft-crypto"]);
  upsertScopedInstrument.run(
    "instrument-draft-stock",
    "pool-draft-stock",
    "MIXED.STOCK",
    "1d",
    "MIXED STOCK",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-mixed-stock-v1",
    now,
  );
  upsertScopedInstrument.run(
    "instrument-draft-crypto",
    "pool-draft-crypto",
    "MIXED.CRYPTO",
    "1h",
    "MIXED CRYPTO",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-mixed-crypto-v1",
    now,
  );
  const draftPreview = await previewSpecialTrainingQuestionBankDraft({
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: ["pool-draft-stock", "pool-draft-crypto"],
  });

  assert.equal(draftPreview.status, "READY");
  assert.equal(draftPreview.poolCount, 2);
  assert.equal(draftPreview.symbolCount, 2);
  assert.deepEqual(draftPreview.sourceTimeframes, ["1h", "1d"]);
  assert.equal(draftPreview.maxSourceTimeframe, "1d");
  assert.equal(draftPreview.validation.scope.valid, true);
  assert.equal(draftPreview.validation.targetTimeframe.valid, true);
  assert.equal(draftPreview.readiness.canUse, true);
  assert.equal(draftPreview.readiness.blockedReasonCode, null);
});

test("pool-scoped validation rejects target timeframe below the highest source timeframe", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-invalid-timeframe"]);
  upsertScopedInstrument.run(
    "instrument-invalid-timeframe",
    "pool-invalid-timeframe",
    "INVALID.TEST",
    "1d",
    "INVALID",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-invalid-v1",
    now,
  );

  assert.throws(
    () =>
      createBank({
        name: "bank-invalid-timeframe",
        poolIds: ["pool-invalid-timeframe"],
        targetTimeframe: "1h",
      }),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          !Array.isArray(error) &&
          (error as { code?: unknown }).code ===
            "SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID" &&
          (error as { args?: Record<string, unknown> }).args?.maxSourceTimeframe ===
            "1d",
      ),
  );

  await assert.rejects(
    () =>
      previewSpecialTrainingQuestionBankDraft({
        assetClass: "STOCK",
        targetTimeframe: "1h",
        poolIds: ["pool-invalid-timeframe"],
      }),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          !Array.isArray(error) &&
          (error as { code?: unknown }).code ===
            "SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID" &&
          (error as { args?: Record<string, unknown> }).args?.maxSourceTimeframe ===
            "1d",
      ),
  );

  const summary = resolveSpecialTrainingBankScopeSummary({
    targetTimeframe: "1h",
    poolIds: ["pool-invalid-timeframe"],
  });
  assert.equal(summary.status, "TARGET_TIMEFRAME_INVALID");
  assert.equal(summary.validation.targetTimeframe.valid, false);
  assert.equal(
    summary.validation.targetTimeframe.blockedReasonCode,
    "TARGET_TIMEFRAME_INVALID",
  );
  assert.equal(summary.readiness.canUse, false);
  assert.equal(summary.readiness.blockedReasonCode, "TARGET_TIMEFRAME_INVALID");
});

test("bank editor read model owns validation and step availability", async () => {
  const now = new Date().toISOString();
  ensureSources(["pool-editor-readiness"]);
  upsertScopedInstrument.run(
    "instrument-editor-readiness",
    "pool-editor-readiness",
    "EDITOR.TEST",
    "1d",
    "EDITOR",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-editor-readiness-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    "instrument-editor-readiness",
    "EDITOR.TEST",
    buildDailyBars(260),
  );

  const missingName = resolveSpecialTrainingBankEditorReadModel({
    step: "CONFIG",
    draft: {
      name: "",
      targetTimeframe: "1d",
      poolIds: [],
    },
  });
  assert.equal(missingName.enabled, false);
  assert.equal(missingName.reasonCode, "NAME_REQUIRED");
  assert.equal(missingName.facts.validation.name.enabled, false);
  assert.equal(missingName.facts.validation.pools.reasonCode, "POOL_SELECTION_REQUIRED");

  const missingPools = resolveSpecialTrainingBankEditorReadModel({
    step: "CONFIG",
    draft: {
      name: "Editor readiness bank",
      targetTimeframe: "1d",
      poolIds: [],
    },
  });
  assert.equal(missingPools.enabled, false);
  assert.equal(missingPools.reasonCode, "POOL_SELECTION_REQUIRED");
  assert.equal(missingPools.readiness.config.enabled, false);

  const targetTooLow = resolveSpecialTrainingBankEditorReadModel({
    step: "CONFIG",
    draft: {
      name: "Editor readiness bank",
      targetTimeframe: "1h",
      poolIds: ["pool-editor-readiness"],
    },
    availablePoolIds: ["pool-editor-readiness"],
  });
  assert.equal(targetTooLow.enabled, false);
  assert.equal(targetTooLow.reasonCode, "TARGET_TIMEFRAME_INVALID");
  assert.deepEqual(targetTooLow.facts.autoRemovedPoolIds, [
    "pool-editor-readiness",
  ]);
  assert.deepEqual(targetTooLow.facts.compatibleSelectedPoolIds, []);
  assert.equal(
    targetTooLow.facts.poolReadinessById["pool-editor-readiness"]?.reasonCode,
    "TARGET_TIMEFRAME_TOO_LOW",
  );

  const readyPreview = resolveSpecialTrainingBankEditorReadModel({
    step: "PREVIEW",
    draft: {
      name: "Editor readiness bank",
      targetTimeframe: "1d",
      poolIds: ["pool-editor-readiness"],
    },
    availablePoolIds: ["pool-editor-readiness"],
  });
  assert.equal(readyPreview.enabled, true);
  assert.equal(readyPreview.reasonCode, null);
  assert.equal(readyPreview.readiness.current.enabled, true);
  assert.equal(readyPreview.readiness.preview.enabled, true);
  assert.equal(readyPreview.facts.scopeSummary.status, "READY");
  assert.equal(readyPreview.facts.selectedPoolCount, 1);
});

test("resetModeQuestionBankLedger clears only the selected bank and mode", () => {
  const now = new Date().toISOString();
  insertLedger.run(
    "ledger-fast-a",
    DEFAULT_USER_ID,
    "bank-a",
    "fast-decision-training",
    "scope-a",
    "AAA.TEST",
    "1d",
    0,
    now,
    now,
  );
  insertLedger.run(
    "ledger-fast-b",
    DEFAULT_USER_ID,
    "bank-b",
    "fast-decision-training",
    "scope-b",
    "AAA.TEST",
    "1d",
    1,
    now,
    now,
  );
  insertLedger.run(
    "ledger-risk-a",
    DEFAULT_USER_ID,
    "bank-a",
    "risk-discipline-training",
    "scope-risk",
    "AAA.TEST",
    "1d",
    0,
    now,
    now,
  );

  const deletedCount = resetModeQuestionBankLedger(
    "bank-a",
    "fast-decision-training",
  );
  assert.equal(deletedCount, 1);

  const remainingBankAFastCount =
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_question_ledger
          WHERE user_id = ?
            AND bank_id = 'bank-a'
            AND mode_id = 'fast-decision-training'`,
      )
      .pluck()
      .get(DEFAULT_USER_ID) ?? 0;
  const remainingBankBFastCount =
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_question_ledger
          WHERE user_id = ?
            AND bank_id = 'bank-b'
            AND mode_id = 'fast-decision-training'`,
      )
      .pluck()
      .get(DEFAULT_USER_ID) ?? 0;
  const remainingRiskCount =
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_question_ledger
          WHERE user_id = ?
            AND mode_id = 'risk-discipline-training'`,
      )
      .pluck()
      .get(DEFAULT_USER_ID) ?? 0;

  assert.equal(remainingBankAFastCount, 0);
  assert.equal(remainingBankBFastCount, 1);
  assert.equal(remainingRiskCount, 1);
});

test("risk discipline settlement rejects no-op survival and accepts effective stop-loss", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-risk-discipline-scoring";
  const instrumentId = "instrument-risk-discipline-scoring";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "RISK.DOWN",
    "1d",
    "Risk Downtrend",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-risk-discipline-scoring-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "RISK.DOWN",
    buildDecliningDailyBars(800),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-risk-discipline-scoring",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;

    const noOpChallenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "risk-discipline-training",
      questionCount: 5,
      horizonBars: 20,
    });
    const noOpQuestion = noOpChallenge.runtime.question;
    assert.ok(noOpQuestion);
    const noOpSettlement = await settleSpecialTrainingQuestion(
      noOpChallenge.challengeId,
      noOpQuestion!.id,
      {
        cursorIndex: noOpChallenge.runtime.questionEndIndex,
        tradeActions: [],
      },
    );

    assert.equal(noOpSettlement.usedOperations, 0);
    assert.equal(noOpSettlement.passed, false);
    assert.notEqual(noOpSettlement.grade, "S");
    assert.ok((noOpSettlement.alpha ?? 0) <= 0);
    assert.ok(noOpSettlement.feedbackCodes.includes("RECOVERY_PENDING"));

    const stopLossChallenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "risk-discipline-training",
      questionCount: 5,
      horizonBars: 20,
    });
    const stopLossQuestion = stopLossChallenge.runtime.question;
    assert.ok(stopLossQuestion);
    const stopLossSettlement = await settleSpecialTrainingQuestion(
      stopLossChallenge.challengeId,
      stopLossQuestion!.id,
      {
        cursorIndex: stopLossChallenge.runtime.questionEndIndex,
        tradeActions: [
          {
            type: "SELL",
            barIndex: stopLossChallenge.runtime.questionStartIndex,
            inputMode: "RATIO",
            priceMode: "CUR_CLOSE",
            ratioInput: "100",
            quantity: 0,
            executionPrice: 0,
            cashEffect: 0,
          },
        ],
      },
    );

    assert.equal(stopLossSettlement.usedOperations, 1);
    assert.equal(stopLossSettlement.passed, true);
    assert.ok((stopLossSettlement.alpha ?? 0) > 0);
    assert.ok(stopLossSettlement.feedbackCodes.includes("ALPHA_BEAT_HOLDER"));
    assert.ok(stopLossSettlement.feedbackCodes.includes("RECOVERY_SUCCESS"));
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, "risk-discipline-training");
    }
  }
});

test("risk discipline command settlement returns the settled question runtime trade actions", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-risk-command-runtime";
  const instrumentId = "instrument-risk-command-runtime";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "RISK.RUNTIME",
    "1d",
    "Risk Command Runtime",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-risk-command-runtime-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "RISK.RUNTIME",
    buildDailyBars(800),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-risk-command-runtime",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;

    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "risk-discipline-training",
      questionCount: 5,
      horizonBars: 5,
    });
    const firstQuestion = challenge.runtime.question;
    assert.ok(firstQuestion);
    const firstQuestionId = firstQuestion!.id;

    const firstCommand = await executeSpecialTrainingChallengeAction(
      challenge.challengeId,
      {
        action: "BUY_AND_ADVANCE",
        inputMode: "RATIO",
        ratioInput: "25",
        priceMode: "CUR_CLOSE",
      },
    );
    assert.equal(firstCommand.settlement, null);
    assert.equal(firstCommand.runtime.currentQuestionId, firstQuestionId);
    assert.equal(firstCommand.runtime.tradeActions.length, 1);

    let commandResult = firstCommand;
    for (let guard = 0; guard < 20 && !commandResult.settlement; guard++) {
      commandResult = await executeSpecialTrainingChallengeAction(
        challenge.challengeId,
        { action: "NEXT_BAR" },
      );
    }

    assert.ok(commandResult.settlement);
    assert.equal(commandResult.progress.settledCount, 1);
    assert.equal(commandResult.progress.currentQuestionIndex, 1);
    assert.notEqual(commandResult.progress.currentQuestionId, firstQuestionId);
    assert.equal(commandResult.runtime.currentQuestionIndex, 0);
    assert.equal(commandResult.runtime.currentQuestionId, firstQuestionId);
    assert.equal(commandResult.runtime.question?.id, firstQuestionId);
    assert.equal(
      commandResult.runtime.cursorIndex,
      commandResult.runtime.questionEndIndex,
    );
    assert.deepEqual(
      commandResult.runtime.tradeActions,
      firstCommand.runtime.tradeActions,
    );
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, "risk-discipline-training");
    }
  }
});

test("startSpecialTrainingChallenge advances draw cursor and restarts exhausted cycle", async () => {
  const now = new Date().toISOString();
  const modeId = "fast-decision-training";
  const poolId = "pool-draw-cursor";
  const instrumentId = "instrument-draw-cursor";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "CURSOR.TEST",
    "1d",
    "CURSOR",
    "LOCAL",
    1,
    260,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-draw-cursor-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "CURSOR.TEST",
    buildDailyBars(1000),
  );

  const bank = createBank({
    name: "bank-draw-cursor",
    poolIds: [poolId],
    targetTimeframe: "1d",
  });
  const scopeState = await resolveQuestionScopeState(
    modeId,
    bank.id,
    bank.name,
    bank.scope.poolIds.length,
    resolvePoolInstrumentIds(bank.scope.poolIds),
    20,
    "1d",
  );
  assert.ok(scopeState.totalQuestionCount > 3);

  db.prepare(
    `INSERT INTO special_training_question_draw_cursors (
      user_id,mode_id,scope_hash,cycle_index,cursor_index,total_question_count,updated_at
    ) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    DEFAULT_USER_ID,
    modeId,
    scopeState.scopeHash,
    0,
    scopeState.totalQuestionCount - 1,
    scopeState.totalQuestionCount,
    now,
  );

  const challenge = await startSpecialTrainingChallenge({
    bankId: bank.id,
    modeId,
    questionCount: 5,
    horizonBars: 20,
  });

  assert.equal(challenge.scopeRestart?.reason, "SCOPE_EXHAUSTED");
  assert.equal(
    challenge.scopeRestart?.previousUsedQuestionCount,
    scopeState.totalQuestionCount - 1,
  );
  assert.equal(readUsedSlotCount(modeId, scopeState.scopeHash, "1d"), 5);

  const ledgerRows = db
    .prepare(
      `SELECT slot_index
         FROM special_training_question_ledger
        WHERE user_id = ?
          AND mode_id = ?
          AND scope_hash = ?
        ORDER BY slot_index ASC`,
    )
    .all(DEFAULT_USER_ID, modeId, scopeState.scopeHash) as Array<{
    slot_index?: unknown;
  }>;
  assert.equal(ledgerRows.length, 5);
  assert.equal(
    new Set(ledgerRows.map((row) => Number(row.slot_index))).size,
    5,
  );
  discardSpecialTrainingChallenge(challenge.challengeId);
});

test("startSpecialTrainingChallenge releases expired assigned ledger before reserving", async () => {
  const modeId = "fast-decision-training";
  const horizonBars = 20;
  const questionCount = 5;
  const windowBarCount = resolveSpecialTrainingLookbackBars(modeId) + horizonBars;
  const slotStrideBars = Math.max(1, Math.floor(Math.max(2, windowBarCount) / 2));
  const barCount = windowBarCount + slotStrideBars * (questionCount - 1);
  const now = new Date().toISOString();
  const staleAt = "2000-01-01T00:00:00.000Z";
  const poolId = "pool-stale-assigned-ledger";
  const instrumentId = "instrument-stale-assigned-ledger";
  const symbol = "STALE.TEST";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    symbol,
    "1d",
    "STALE",
    "LOCAL",
    1,
    barCount,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z",
    "bars-stale-assigned-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    symbol,
    buildDailyBars(barCount),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-stale-assigned-ledger",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;
    const scopeState = await resolveQuestionScopeState(
      modeId,
      bank.id,
      bank.name,
      1,
      resolvePoolInstrumentIds([poolId]),
      horizonBars,
      "1d",
    );
    assert.equal(scopeState.totalQuestionCount, questionCount);
    const staleLedgerIds = Array.from(
      { length: questionCount },
      (_, index) => `ledger-stale-assigned-conflict-${index}`,
    );
    staleLedgerIds.forEach((ledgerId, slotIndex) => {
      insertLedger.run(
        ledgerId,
        DEFAULT_USER_ID,
        bank.id,
        modeId,
        scopeState.scopeHash,
        symbol,
        scopeState.timeframe,
        slotIndex,
        staleAt,
        staleAt,
      );
    });

    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId,
      questionCount,
      horizonBars,
    });

    assert.ok(challenge.runtime.question);
    assert.equal(countLedgerRowsByIds(staleLedgerIds), 0);
    discardSpecialTrainingChallenge(challenge.challengeId);
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, modeId);
    }
  }
});

test("challenge runtime materializes the next question only when requested", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-lazy-runtime";
  const instrumentId = "instrument-lazy-runtime";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "LAZY.TEST",
    "1d",
    "LAZY",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-lazy-runtime-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "LAZY.TEST",
    buildDailyBars(800),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-lazy-runtime",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;
    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "fast-decision-training",
      questionCount: 5,
      horizonBars: 20,
    });
    const firstQuestion = challenge.runtime.question;
    assert.ok(firstQuestion);
    assert.equal(challenge.runtime.currentQuestionIndex, 0);
    assert.equal(challenge.runtime.currentQuestionId, firstQuestion!.id);
    assert.ok((firstQuestion!.bars?.length ?? 0) > 0);

    const commandResult = await submitSpecialTrainingChallengeDecision(
      challenge.challengeId,
      {
        selection: "OBSERVE",
        decisionSecondsUsed: 1,
      },
    );
    assert.ok(commandResult.settlement);
    assert.equal(commandResult.progress.settledCount, 1);
    assert.equal(commandResult.progress.currentQuestionIndex, 1);
    assert.notEqual(
      commandResult.progress.currentQuestionId,
      firstQuestion!.id,
    );
    assert.equal(commandResult.runtime.currentQuestionIndex, 0);
    assert.equal(commandResult.runtime.currentQuestionId, firstQuestion!.id);
    assert.equal(commandResult.runtime.question?.id, firstQuestion!.id);

    const nextRuntime = await getSpecialTrainingChallengeRuntime(
      challenge.challengeId,
    );
    assert.equal(nextRuntime.currentQuestionIndex, 1);
    assert.equal(
      nextRuntime.currentQuestionId,
      commandResult.progress.currentQuestionId,
    );
    assert.ok(nextRuntime.question);
    assert.notEqual(nextRuntime.question?.id, firstQuestion!.id);
    assert.ok((nextRuntime.question?.bars?.length ?? 0) > 0);

    const ledgerIds = listLedgerIdsForScope(
      challenge.modeId,
      challenge.scopeHash,
    );
    const discarded = discardSpecialTrainingChallenge(challenge.challengeId);
    assert.equal(discarded.releasedQuestionLedgerRows, 4);
    assert.equal(countLedgerRowsByIds(ledgerIds), 1);
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, "fast-decision-training");
    }
  }
});

test("challenge activity pause is idempotent and excludes inactive wall time", async (t) => {
  let nowMs = Date.parse("2026-08-01T00:00:00.000Z");
  t.mock.method(Date, "now", () => nowMs);
  const now = new Date(nowMs).toISOString();
  const poolId = "pool-fast-activity-pause";
  const instrumentId = "instrument-fast-activity-pause";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "PAUSE.TEST",
    "1d",
    "PAUSE",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-fast-activity-pause-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "PAUSE.TEST",
    buildDailyBars(800),
  );

  let cleanupBankId = "";
  let challengeId = "";
  try {
    const bank = createBank({
      name: "bank-fast-activity-pause",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;
    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "fast-decision-training",
      questionCount: 5,
      horizonBars: 20,
      decisionSecondsLimit: 10,
    });
    challengeId = challenge.challengeId;

    nowMs += 2_100;
    const paused = await setSpecialTrainingChallengeActivity(challengeId, true);
    assert.equal(paused.paused, true);
    assert.equal(paused.runtime.activityPaused, true);
    assert.equal(paused.runtime.fastDecisionTimer?.state, "PAUSED");
    assert.equal(paused.runtime.fastDecisionTimer?.elapsedSeconds, 2);
    assert.equal(paused.runtime.fastDecisionTimer?.remainingSeconds, 8);

    nowMs += 20_000;
    const repeatedPause = await setSpecialTrainingChallengeActivity(
      challengeId,
      true,
    );
    assert.equal(repeatedPause.runtime.fastDecisionTimer?.elapsedSeconds, 2);
    assert.equal(repeatedPause.runtime.fastDecisionTimer?.remainingSeconds, 8);

    const resumed = await setSpecialTrainingChallengeActivity(
      challengeId,
      false,
    );
    assert.equal(resumed.paused, false);
    assert.equal(resumed.runtime.fastDecisionTimer?.state, "RUNNING");
    assert.equal(resumed.runtime.fastDecisionTimer?.elapsedSeconds, 2);

    nowMs += 1_800;
    const runningRuntime = await getSpecialTrainingChallengeRuntime(challengeId);
    assert.equal(runningRuntime.fastDecisionTimer?.elapsedSeconds, 3);
    assert.equal(runningRuntime.fastDecisionTimer?.remainingSeconds, 7);
  } finally {
    if (challengeId) {
      discardSpecialTrainingChallenge(challengeId);
    }
    if (cleanupBankId) {
      resetModeQuestionBankLedger(
        cleanupBankId,
        "fast-decision-training",
      );
    }
  }
});

test("discardSpecialTrainingChallenge removes unfinished runtime and ledger rows", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-discard-unfinished";
  const instrumentId = "instrument-discard-unfinished";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "DISCARD.TEST",
    "1d",
    "DISCARD",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-discard-unfinished-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "DISCARD.TEST",
    buildDailyBars(800),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-discard-unfinished",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;
    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "fast-decision-training",
      questionCount: 5,
      horizonBars: 20,
    });
    const ledgerIds = listLedgerIdsForScope(
      challenge.modeId,
      challenge.scopeHash,
    );
    const currentQuestion = challenge.runtime.question;

    assert.equal(ledgerIds.length, 5);
    assert.ok(currentQuestion);
    await settleSpecialTrainingQuestion(challenge.challengeId, currentQuestion!.id, {
      abandoned: true,
      cursorIndex: currentQuestion!.startIndex,
    });
    assert.equal(countLedgerRowsByIds(ledgerIds), 5);
    assert.equal(hasHistoryForChallenge(challenge.challengeId), false);

    const discarded = discardSpecialTrainingChallenge(challenge.challengeId);

    assert.deepEqual(discarded, {
      challengeId: challenge.challengeId,
      deleted: true,
      releasedQuestionLedgerRows: 4,
    });
    assert.equal(countLedgerRowsByIds(ledgerIds), 1);
    assert.equal(hasHistoryForChallenge(challenge.challengeId), false);
    await assert.rejects(
      () => getSpecialTrainingChallengeRuntime(challenge.challengeId),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            !Array.isArray(error) &&
            (error as { code?: unknown }).code ===
              "SPECIAL_TRAINING_CHALLENGE_NOT_FOUND",
        ),
    );
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, "fast-decision-training");
    }
  }
});

test("discardSpecialTrainingChallenge keeps completed challenge history intact", async () => {
  const now = new Date().toISOString();
  const poolId = "pool-discard-completed";
  const instrumentId = "instrument-discard-completed";
  ensureSources([poolId]);
  upsertScopedInstrument.run(
    instrumentId,
    poolId,
    "DONE.TEST",
    "1d",
    "DONE",
    "LOCAL",
    1,
    800,
    "2024-01-01T00:00:00.000Z",
    "2026-03-10T00:00:00.000Z",
    "bars-discard-completed-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    instrumentId,
    "DONE.TEST",
    buildDailyBars(800),
  );

  let cleanupBankId = "";
  try {
    const bank = createBank({
      name: "bank-discard-completed",
      poolIds: [poolId],
      targetTimeframe: "1d",
    });
    cleanupBankId = bank.id;
    const challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "fast-decision-training",
      questionCount: 5,
      horizonBars: 20,
    });
    const ledgerIds = listLedgerIdsForScope(
      challenge.modeId,
      challenge.scopeHash,
    );
    assert.equal(ledgerIds.length, 5);
    let finalSettlement: Awaited<
      ReturnType<typeof settleSpecialTrainingQuestion>
    > | null = null;
    for (let index = 0; index < challenge.questionCount; index += 1) {
      const runtime = await getSpecialTrainingChallengeRuntime(challenge.challengeId);
      const currentQuestion = runtime.question;
      assert.ok(currentQuestion);
      finalSettlement = await settleSpecialTrainingQuestion(
        challenge.challengeId,
        currentQuestion!.id,
        {
          cursorIndex: currentQuestion!.startIndex,
          fastDecision: {
            selection: "OBSERVE",
            decisionSecondsUsed: 1,
          },
        },
      );
    }
    const finalSummary = finalSettlement?.sessionSummary;
    assert.ok(finalSummary);
    if (finalSummary.modeId !== "fast-decision-training") {
      assert.fail("expected a fast-decision session summary");
    }
    assert.equal(finalSummary.completedCount, 5);
    assert.equal(finalSummary.averageDecisionSeconds, 1);
    assert.equal(finalSummary.selectionCounts.OBSERVE, 5);
    assert.equal(hasHistoryForChallenge(challenge.challengeId), true);
    assert.equal(countLedgerRowsByIds(ledgerIds), 5);

    const discarded = discardSpecialTrainingChallenge(challenge.challengeId);

    assert.deepEqual(discarded, {
      challengeId: challenge.challengeId,
      deleted: false,
      releasedQuestionLedgerRows: 0,
    });
    assert.equal(hasHistoryForChallenge(challenge.challengeId), true);
    assert.equal(countLedgerRowsByIds(ledgerIds), 5);
  } finally {
    if (cleanupBankId) {
      resetModeQuestionBankLedger(cleanupBankId, "fast-decision-training");
    }
  }
});
