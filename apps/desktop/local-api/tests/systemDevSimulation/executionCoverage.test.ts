// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-system-dev-simulation-coverage-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db },
  { replaceMarketBarsForInstrument },
  { resolveSessionNameFormat },
  { INPUT_LIMITS },
  { runtimeLimits },
  { getSystemDevSimulationCopy },
  {
    buildReplayNoteDefaultTitle,
    buildReplayNoteSeedMeta,
    buildReplayNoteSourceForCreate,
    getReplayNoteBuilderCopy,
  },
  { REPLAY_NOTE_COLOR_TOKENS },
  { normalizeReplayNoteDocument },
  {
    REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME,
    REPLAY_DRAW_TOOL_VISIBLE_NAMES,
  },
  { resolveSpecialTrainingLookbackBars },
  {
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES,
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES,
    SYSTEM_DEV_SIMULATION_TRAINING_TAGS,
  },
  { resolveSystemDevSimulationEffectivePlanForPools },
  { planSystemDevSimulationDataset },
  { getTrainingProjectById },
  { getReplayNoteById },
  { createSystemDevSimulationRandom },
  { createSystemDevSimulationTimeline },
  { createIndependentCustomReplayNotesWorkload },
  {
    cleanupSystemDevSimulationData,
    simulateChallengeItem,
    simulateFreeReplayItem,
  },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("@zinuto/shared/sessionNaming"),
  import("@zinuto/shared/input-limits"),
  import("../../src/kernel/runtimeLimits.js"),
  import("@zinuto/shared/systemDevSimulationCopy"),
  import("@zinuto/shared/replayNoteBuilder"),
  import("@zinuto/shared/replayNoteColors"),
  import("@zinuto/shared/replayNoteDocument"),
  import("@zinuto/shared/replayDrawingTools"),
  import("@zinuto/shared/specialTrainingModes"),
  import("@zinuto/shared/systemDevSimulationProfiles"),
  import("../../src/application/systemDevSimulation/planning.js"),
  import("../../src/application/systemDevSimulation/datasetPlanner.js"),
  import("../../src/application/historyService.js"),
  import("../../src/application/replayNoteService.js"),
  import("../../src/domain/systemDevSimulation/random.js"),
  import("../../src/application/systemDevSimulation/timeline.js"),
  import("../../src/application/systemDevSimulation/workloads/customNotes.js"),
  import("../../src/application/systemDevSimulationService.js"),
]);

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, source_folder, time_zone, base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source_folder = excluded.source_folder,
    time_zone = excluded.time_zone,
    base_timeframe = excluded.base_timeframe,
    field_mapping_json = excluded.field_mapping_json,
    trading_calendar_json = excluded.trading_calendar_json,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);

const upsertInstrument = db.prepare(
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

const buildDailyBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const open = 100 + index / 10;
    return {
      ts: new Date(Date.UTC(2023, 0, 1 + index, 0, 0, 0, 0)).toISOString(),
      open,
      high: open + 1,
      low: open - 1,
      close: open + 0.25,
      volume: 10_000 + index,
    };
  });

const buildMinuteBars = (count: number): OhlcvBar[] =>
  Array.from({ length: count }, (_, index) => {
    const open = 100 + Math.sin(index / 97) * 2 + index / 20_000;
    return {
      ts: new Date(Date.UTC(2024, 0, 1, 0, index, 0, 0)).toISOString(),
      open,
      high: open + 0.8,
      low: open - 0.8,
      close: open + Math.cos(index / 53) * 0.2,
      volume: 20_000 + index,
    };
  });

const poolId = "system-dev-simulation-coverage-pool";
const instrumentId = "system-dev-simulation-coverage-instrument";
const symbol = "SIMCOV.TEST";
const tailPoolId = "system-dev-simulation-tail-pool";
const tailInstrumentId = "system-dev-simulation-tail-instrument";
const tailSymbol = "SIMTAIL.TEST";
const duplicatePoolId = "system-dev-simulation-duplicate-pool";
const duplicateInstrumentId = "system-dev-simulation-duplicate-instrument";
const largeMinutePoolId = "system-dev-simulation-large-minute-pool";
const largeMinuteInstrumentId = "system-dev-simulation-large-minute-instrument";
const largeMinuteSymbol = "SIM1M.TEST";
const mixedLookbackPoolId = "system-dev-simulation-mixed-lookback-pool";
const mixedLookbackInstruments = [
  { instrumentId: "system-dev-simulation-lookback-65", symbol: "SIMLB65.TEST", barCount: 65 },
  { instrumentId: "system-dev-simulation-lookback-86", symbol: "SIMLB86.TEST", barCount: 86 },
  { instrumentId: "system-dev-simulation-lookback-103", symbol: "SIMLB103.TEST", barCount: 103 },
  { instrumentId: "system-dev-simulation-lookback-242-a", symbol: "SIMLB242A.TEST", barCount: 242 },
  { instrumentId: "system-dev-simulation-lookback-242-b", symbol: "SIMLB242B.TEST", barCount: 242 },
  { instrumentId: "system-dev-simulation-lookback-242-c", symbol: "SIMLB242C.TEST", barCount: 242 },
] as const;

const countSpecialTrainingProjectionRowsForSimulationBatch = (
  simulationBatchId: string,
): number =>
  Number(
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_stats_projection p
           JOIN special_training_history_sessions s ON s.id = p.session_id
          WHERE s.simulation_batch_id = ?`,
      )
      .pluck()
      .get(simulationBatchId) ?? 0,
  );

const ensureCoverageMarket = async () => {
  const now = new Date().toISOString();
  const bars = buildDailyBars(2000);
  upsertSource.run(poolId, poolId, "zinuto://system-dev-simulation/historical-data/coverage", "UTC", "1d", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    instrumentId,
    poolId,
    symbol,
    "1d",
    symbol,
    "LOCAL",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "system-dev-simulation-coverage-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
};

const ensureTailMarket = async () => {
  const now = new Date().toISOString();
  const bars = buildDailyBars(24);
  upsertSource.run(tailPoolId, tailPoolId, "zinuto://system-dev-simulation/historical-data/tail", "UTC", "1d", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    tailInstrumentId,
    tailPoolId,
    tailSymbol,
    "1d",
    tailSymbol,
    "LOCAL",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "system-dev-simulation-tail-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(tailInstrumentId, tailSymbol, bars);
};

const ensureLargeMinuteMarket = async () => {
  const now = new Date().toISOString();
  const bars = buildMinuteBars(runtimeLimits.barsRangeLimitMax + 30_000);
  upsertSource.run(largeMinutePoolId, largeMinutePoolId, "zinuto://system-dev-simulation/historical-data/minute", "UTC", "1m", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    largeMinuteInstrumentId,
    largeMinutePoolId,
    largeMinuteSymbol,
    "1m",
    largeMinuteSymbol,
    "LOCAL",
    1,
    bars.length,
    bars[0]?.ts ?? null,
    bars.at(-1)?.ts ?? null,
    "system-dev-simulation-large-minute-bars-v1",
    now,
  );
  await replaceMarketBarsForInstrument(
    largeMinuteInstrumentId,
    largeMinuteSymbol,
    bars,
  );
};

const ensureMixedLookbackMarket = async () => {
  const now = new Date().toISOString();
  upsertSource.run(
    mixedLookbackPoolId,
    mixedLookbackPoolId,
    "zinuto://system-dev-simulation/historical-data/mixed-lookback",
    "UTC",
    "1d",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    now,
    now,
  );
  for (const instrument of mixedLookbackInstruments) {
    const bars = buildDailyBars(instrument.barCount);
    upsertInstrument.run(
      instrument.instrumentId,
      mixedLookbackPoolId,
      instrument.symbol,
      "1d",
      instrument.symbol,
      "LOCAL",
      1,
      bars.length,
      bars[0]?.ts ?? null,
      bars.at(-1)?.ts ?? null,
      `${instrument.instrumentId}-bars-v1`,
      now,
    );
    await replaceMarketBarsForInstrument(
      instrument.instrumentId,
      instrument.symbol,
      bars,
    );
  }
};

const ensureDuplicateSymbolMarket = async () => {
  const now = new Date().toISOString();
  upsertSource.run(duplicatePoolId, duplicatePoolId, "zinuto://system-dev-simulation/historical-data/duplicate", "UTC", "1d", "{}", DEFAULT_TRADING_CALENDAR_JSON, now, now);
  upsertInstrument.run(
    duplicateInstrumentId,
    duplicatePoolId,
    symbol,
    "1d",
    symbol,
    "LOCAL",
    1,
    180,
    new Date(Date.UTC(2022, 0, 1)).toISOString(),
    new Date(Date.UTC(2022, 6, 1)).toISOString(),
    "system-dev-simulation-duplicate-bars-v1",
    now,
  );
};

const enabledPool = {
  id: poolId,
  name: "System dev simulation coverage",
  assetClass: "STOCK" as const,
  baseTimeframe: "1d" as const,
  symbols: [symbol],
  instruments: [
    {
      instrumentId,
      symbol,
      baseTimeframe: "1d" as const,
      barCount: 2000,
      assetClass: "STOCK" as const,
      marketPresetId: "US_STOCK" as const,
      sourceKind: "LOCAL" as const,
      sourceId: poolId,
      sourceName: "System dev simulation coverage",
    },
  ],
};

const effectivePlan = {
  ...resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: [enabledPool],
  }),
  notePolicy: {
    freeReplayForceCreateUntil: 0,
    freeReplayCreateProbability: 0,
    challengeForceCreateUntil: 0,
    challengeCreateProbability: 0,
    maxColorCount: 2,
  },
};

const featureCoveragePlan = {
  ...effectivePlan,
  notePolicy: {
    ...effectivePlan.notePolicy,
    freeReplayForceCreateUntil: 12,
    freeReplayCreateProbability: 1,
    challengeForceCreateUntil: 4,
    challengeCreateProbability: 1,
    maxColorCount: 3,
  },
};

test("system dev simulation logical timeline is deterministic and increasing", () => {
  const first = createSystemDevSimulationTimeline({
    startIso: "2024-01-02T09:30:00.000Z",
    random: createSystemDevSimulationRandom("timeline-coverage"),
  });
  const second = createSystemDevSimulationTimeline({
    startIso: "2024-01-02T09:30:00.000Z",
    random: createSystemDevSimulationRandom("timeline-coverage"),
  });

  const firstSteps = [
    first.advanceSeconds(30, 240),
    first.advanceSeconds(2, 20),
    first.advanceMinutes(5, 90),
  ];
  const secondSteps = [
    second.advanceSeconds(30, 240),
    second.advanceSeconds(2, 20),
    second.advanceMinutes(5, 90),
  ];

  assert.deepEqual(firstSteps, secondSteps);
  assert.ok(Date.parse(firstSteps[0]!) > Date.parse("2024-01-02T09:30:00.000Z"));
  assert.ok(Date.parse(firstSteps[1]!) > Date.parse(firstSteps[0]!));
  assert.ok(Date.parse(firstSteps[2]!) > Date.parse(firstSteps[1]!));
});

test("free replay simulation item executes NEXT_OPEN auto-step and undo paths through the service", async () => {
  await ensureCoverageMarket();

  const nextOpenResult = await simulateFreeReplayItem(
    {
      samplePoolId: poolId,
      samplePoolName: enabledPool.name,
      instrumentId,
      baseTimeframe: "1d",
      symbol,
      assetClass: "STOCK",
      marketPresetId: "US_STOCK",
    },
    1,
    {
      language: "en",
      effectivePlan,
      simulationBatchId: "system-dev-simulation-free-next-open",
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(nextOpenResult.coverage.finalizePriceMode, "NEXT_OPEN");
  assert.ok(nextOpenResult.coverage.nextOpenOrders > 0);
  assert.ok(nextOpenResult.coverage.autoStepOrders > 0);

  const undoResult = await simulateFreeReplayItem(
    {
      samplePoolId: poolId,
      samplePoolName: enabledPool.name,
      instrumentId,
      baseTimeframe: "1d",
      symbol,
      assetClass: "STOCK",
      marketPresetId: "US_STOCK",
    },
    2,
    {
      language: "en",
      effectivePlan,
      simulationBatchId: "system-dev-simulation-free-undo",
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(undoResult.coverage.finalizePriceMode, "CUR_CLOSE");
  assert.ok(undoResult.coverage.undoActions > 0);
});

test("free replay simulation covers feature-aligned modes, drawings, colors, tags, and nonzero logical times", async () => {
  await ensureCoverageMarket();

  const inputModes = new Set<string>();
  const priceModes = new Set<string>();
  const drawingTools = new Set<string>();
  const colorTokens = new Set<string>();
  const trainingTags = new Set<string>();
  const projectIds: string[] = [];

  const itemCount = Math.max(
    REPLAY_DRAW_TOOL_VISIBLE_NAMES.length,
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES.length,
    SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES.length,
    REPLAY_NOTE_COLOR_TOKENS.length,
    SYSTEM_DEV_SIMULATION_TRAINING_TAGS.length,
  );

  for (let index = 0; index < itemCount; index += 1) {
    const simulationBatchId = `system-dev-simulation-feature-coverage-${index}`;
    const result = await simulateFreeReplayItem(
      {
        samplePoolId: poolId,
        samplePoolName: enabledPool.name,
        instrumentId,
        baseTimeframe: "1d",
        symbol,
        assetClass: "STOCK",
        marketPresetId: "US_STOCK",
      },
      index,
      {
        language: "en",
        effectivePlan: featureCoveragePlan,
        simulationBatchId,
        sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
      },
    );

    inputModes.add(result.coverage.inputMode);
    priceModes.add(result.coverage.priceMode);
    result.coverage.drawingTools.forEach((tool) => drawingTools.add(tool));
    result.coverage.noteColorTokens.forEach((color) => colorTokens.add(color));
    trainingTags.add(result.coverage.trainingTag);
    assert.ok(result.coverage.advancedBars > 0);
    assert.ok(result.coverage.replayBarCount > 0);
    assert.ok(
      result.coverage.archivedCursorIndex >= result.coverage.archivedEntryIndex,
    );
    if (result.coverage.archetype !== "WATCH_ONLY") {
      assert.ok(result.coverage.totalTrades > 0);
    }

    const projectRow = db
      .prepare(
        `SELECT id
           FROM training_projects
          WHERE simulation_batch_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .get(simulationBatchId) as { id?: string } | undefined;
    assert.ok(projectRow?.id);
    projectIds.push(projectRow.id);
  }

  assert.deepEqual(
    [...inputModes].sort(),
    [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES].sort(),
  );
  assert.deepEqual(
    [...priceModes].sort(),
    [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES].sort(),
  );
  assert.deepEqual([...drawingTools].sort(), [...REPLAY_DRAW_TOOL_VISIBLE_NAMES].sort());
  for (const projectId of projectIds) {
    const project = await getTrainingProjectById(projectId);
    const drawings = Array.isArray(project?.replay?.drawings)
      ? project.replay.drawings
      : [];
    assert.ok(drawings.length <= 4);
    const barTimes = new Set(
      (project?.replay?.bars ?? []).map((bar) => Date.parse(String(bar.ts))),
    );
    for (const drawing of drawings) {
      const drawingName = String((drawing as { name?: unknown }).name ?? "");
      assert.ok(
        Boolean(drawing) &&
          typeof drawing === "object" &&
          REPLAY_DRAW_TOOL_VISIBLE_NAMES.includes(
            drawingName as never,
          ),
      );
      const points = Array.isArray((drawing as { points?: unknown }).points)
        ? ((drawing as { points?: unknown[] }).points ?? [])
        : [];
      assert.ok(
        points.length >=
          REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME[
            drawingName as keyof typeof REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME
          ],
      );
      for (const point of points) {
        const timestamp = Number((point as { timestamp?: unknown }).timestamp);
        assert.equal(Number.isFinite(timestamp), true);
        assert.equal(barTimes.has(timestamp), true);
      }
    }
  }
  assert.deepEqual([...colorTokens].sort(), [...REPLAY_NOTE_COLOR_TOKENS].sort());
  assert.deepEqual(
    [...trainingTags].sort(),
    [...SYSTEM_DEV_SIMULATION_TRAINING_TAGS].sort(),
  );

  for (const projectId of projectIds) {
    const project = await getTrainingProjectById(projectId);
    assert.ok(project?.replay);
    const replaySession = (
      project.replay.snapshot as
        | { session?: { created_at?: unknown; createdAt?: unknown } }
        | undefined
    )?.session;
    const sessionCreatedAt = String(
      replaySession?.created_at ?? replaySession?.createdAt ?? "",
    );
    assert.ok(Number.isFinite(Date.parse(sessionCreatedAt)));
    assert.ok(
      Date.parse(project.createdAt) > Date.parse(sessionCreatedAt),
      `${project.createdAt} should be after ${sessionCreatedAt}`,
    );

    const noteRows = db
      .prepare(
        `SELECT created_at AS createdAt
           FROM replay_notes
          WHERE training_project_id = ?`,
      )
      .all(projectId) as Array<{ createdAt: string }>;
    assert.ok(noteRows.length > 0);
    for (const note of noteRows) {
      assert.ok(Date.parse(note.createdAt) > Date.parse(project.createdAt));
    }
  }

  const persistedTags = new Set<string>();
  const tagRows = db
    .prepare(
      `SELECT s.tags_json AS tagsJson
         FROM training_stats_sessions s
         JOIN training_projects p ON p.id = s.project_id
        WHERE p.id IN (${projectIds.map(() => "?").join(",")})`,
    )
    .all(...projectIds) as Array<{ tagsJson?: string }>;
  for (const row of tagRows) {
    for (const tag of JSON.parse(String(row.tagsJson ?? "[]"))) {
      persistedTags.add(String(tag));
    }
  }
  assert.deepEqual([...persistedTags], []);
  const projectNames = db
    .prepare(
      `SELECT name
         FROM training_projects
        WHERE id IN (${projectIds.map(() => "?").join(",")})`,
    )
    .all(...projectIds) as Array<{ name?: unknown }>;
  assert.ok(
    projectNames.every((project) => !String(project.name ?? "").includes("#")),
  );
});

test("dataset planner prefers ready local imports and keeps duplicate symbols source-aware", async () => {
  await ensureCoverageMarket();
  await ensureDuplicateSymbolMarket();

  const plan = planSystemDevSimulationDataset();
  const selectedInstrumentIds = new Set(
    plan.enabledSamplePools.flatMap((pool) =>
      (pool.instruments ?? []).map((instrument) => instrument.instrumentId),
    ),
  );

  assert.equal(plan.dataAvailability.ready, true);
  assert.ok(plan.dataAvailability.localReadySourceCount >= 2);
  assert.ok(plan.dataAvailability.localEligibleInstrumentCount >= 2);
  assert.equal(selectedInstrumentIds.has(instrumentId), true);
  assert.equal(selectedInstrumentIds.has(duplicateInstrumentId), true);
});

test("custom simulation notes cover rich document blocks, attachments, and color tags", async () => {
  await ensureCoverageMarket();

  const simulationBatchId = "system-dev-simulation-custom-rich";
  const created = await createIndependentCustomReplayNotesWorkload({
    count: REPLAY_NOTE_COLOR_TOKENS.length,
    enabledSamplePools: [enabledPool],
    language: "en",
    maxColorCount: 3,
    concurrency: 1,
    simulationBatchId,
    runPool: async (total, _concurrency, worker) => {
      for (let index = 0; index < total; index += 1) {
        await worker(index);
      }
    },
    createRandom: createSystemDevSimulationRandom,
    randomCreatedAt: (random) =>
      new Date(
        Date.UTC(2024, 1, 1, 9, 0, 0, 0) + random.int(0, 90) * 60_000,
      ).toISOString(),
    buildSeedMeta: buildReplayNoteSeedMeta,
    getReplayNoteBuilderCopy,
    buildDocumentFromReflection: (
      title,
      headerLines,
      summaryTitle,
      summaryItems,
      reflectionTitle,
      reflectionItems,
    ) =>
      normalizeReplayNoteDocument({
        schemaVersion: 1,
        blocks: [
          {
            blockKind: "H2",
            children: [{ inlineKind: "TEXT", text: title }],
          },
          {
            blockKind: "BULLET_LIST",
            items: headerLines.map((line) => [
              { inlineKind: "TEXT", text: line },
            ]),
          },
          {
            blockKind: "H2",
            children: [{ inlineKind: "TEXT", text: summaryTitle }],
          },
          {
            blockKind: "BULLET_LIST",
            items: summaryItems.map((item) => [
              { inlineKind: "TEXT", text: `${item.label} ${item.value}` },
            ]),
          },
          {
            blockKind: "H2",
            children: [{ inlineKind: "TEXT", text: reflectionTitle }],
          },
          ...reflectionItems.map((item) => ({
            blockKind: "PARAGRAPH" as const,
            children: [
              { inlineKind: "TEXT" as const, text: `${item.label} ${item.value}` },
            ],
          })),
        ],
      }),
    buildSource: buildReplayNoteSourceForCreate,
    buildDefaultTitle: buildReplayNoteDefaultTitle,
    buildColors: (maxColorCount, _seed, requiredTokens = []) => {
      const merged = Array.from(
        new Set([...requiredTokens, ...REPLAY_NOTE_COLOR_TOKENS]),
      );
      return merged.slice(0, Math.max(1, Math.min(5, maxColorCount)));
    },
    shiftIso: (value, deltaMs) =>
      new Date(Date.parse(value) + deltaMs).toISOString(),
    randomInt: (min, max, random) => random.int(min, max),
  });

  assert.equal(created, REPLAY_NOTE_COLOR_TOKENS.length);

  const noteRows = db
    .prepare(
      `SELECT id
         FROM replay_notes
        WHERE simulation_batch_id = ?
          AND type = 'CUSTOM'
        ORDER BY created_at ASC`,
    )
    .all(simulationBatchId) as Array<{ id: string }>;
  assert.equal(noteRows.length, REPLAY_NOTE_COLOR_TOKENS.length);

  const richNote = await getReplayNoteById(noteRows[0]!.id);
  assert.ok(richNote);
  const blockKinds = new Set(
    richNote.contentDocument.blocks.map((block) => block.blockKind),
  );
  assert.deepEqual(
    [
      "BULLET_LIST",
      "CHECK_LIST",
      "DIVIDER",
      "EMBED",
      "H1",
      "ORDERED_LIST",
      "PARAGRAPH",
      "QUOTE",
    ].every((kind) => blockKinds.has(kind as never)),
    true,
  );
  const attachmentKinds = new Set(
    richNote.attachments.map((attachment) => attachment.kind),
  );
  assert.deepEqual(
    ["CAPSULE", "CHART_VIEW"].every(
      (kind) => attachmentKinds.has(kind as never),
    ),
    true,
  );
  assert.equal(attachmentKinds.has("REPLAY_CONTEXT" as never), false);
  assert.equal(attachmentKinds.has("DRAWING_LAYER" as never), false);

  const colors = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT color_token AS colorToken
             FROM replay_note_colors
            WHERE note_id IN (${noteRows.map(() => "?").join(",")})`,
        )
        .all(...noteRows.map((row) => row.id)) as Array<{ colorToken: string }>
    ).map((row) => row.colorToken),
  );
  assert.deepEqual([...colors].sort(), [...REPLAY_NOTE_COLOR_TOKENS].sort());
});

test("free replay simulation item does not fail when NEXT_OPEN becomes unavailable at the sample tail", async () => {
  await ensureTailMarket();

  const result = await simulateFreeReplayItem(
    {
      samplePoolId: tailPoolId,
      samplePoolName: "System dev simulation tail",
      instrumentId: tailInstrumentId,
      baseTimeframe: "1d",
      symbol: tailSymbol,
      assetClass: "STOCK",
      marketPresetId: "US_STOCK",
    },
    1,
    {
      language: "en",
      effectivePlan,
      simulationBatchId: "system-dev-simulation-free-tail-next-open",
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(result.coverage.finalizePriceMode, "NEXT_OPEN");
});

test("free replay simulation bounds large 1m archive windows below the range limit", async () => {
  await ensureLargeMinuteMarket();

  const simulationBatchId = "system-dev-simulation-large-minute-0";
  const result = await simulateFreeReplayItem(
    {
      samplePoolId: largeMinutePoolId,
      samplePoolName: "System dev simulation large minute",
      instrumentId: largeMinuteInstrumentId,
      baseTimeframe: "1m",
      symbol: largeMinuteSymbol,
      assetClass: "STOCK",
      marketPresetId: "US_STOCK",
    },
    1,
    {
      language: "en",
      effectivePlan,
      simulationBatchId,
      sessionNameFormat: resolveSessionNameFormat("YYYY-MM-DD"),
    },
  );

  assert.equal(result.coverage.finalizePriceMode, "NEXT_OPEN");

  const projectRow = db
    .prepare(
      `SELECT id
         FROM training_projects
        WHERE simulation_batch_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(simulationBatchId) as { id?: string } | undefined;
  assert.ok(projectRow?.id);

  const project = await getTrainingProjectById(projectRow.id);
  const replay = project?.replay as
    | {
        bars?: OhlcvBar[];
        snapshot?: {
          session?: {
            entry_index?: unknown;
            cursor_index?: unknown;
          };
          fills?: Array<{ fill_index?: unknown }>;
        };
      }
    | undefined;
  const replayBars = Array.isArray(replay?.bars) ? replay.bars : [];
  assert.ok(replayBars.length > 0);
  assert.ok(replayBars.length < runtimeLimits.barsRangeLimitMax);

  const entryIndex = Number(replay?.snapshot?.session?.entry_index);
  const cursorIndex = Number(replay?.snapshot?.session?.cursor_index);
  assert.equal(Number.isInteger(entryIndex), true);
  assert.equal(Number.isInteger(cursorIndex), true);
  assert.ok(entryIndex >= 0);
  assert.ok(entryIndex < Math.min(1_440, replayBars.length));
  assert.ok(cursorIndex >= entryIndex);
  assert.ok(cursorIndex < replayBars.length);

  const fills = Array.isArray(replay?.snapshot?.fills)
    ? replay.snapshot.fills
    : [];
  assert.ok(fills.length > 0);
  for (const fill of fills) {
    const fillIndex = Number(fill.fill_index);
    assert.equal(Number.isInteger(fillIndex), true);
    assert.ok(fillIndex >= 0);
    assert.ok(fillIndex < replayBars.length);
  }
});

test("challenge simulation item uses question bank preview/reset and unfinished discard chains", async () => {
  await ensureCoverageMarket();

  const result = await simulateChallengeItem(
    "fast-decision-training",
    [
      {
        baseTimeframe: "1d",
        assetClass: "STOCK",
        poolIds: [poolId],
        symbols: [symbol],
        instrumentIds: [instrumentId],
      },
    ],
    1,
    {
      copy: getSystemDevSimulationCopy("en"),
      effectivePlan,
      language: "en",
      simulationBatchId: "system-dev-simulation-challenge-bank",
      fastOutcomeBucket: "CORRECT",
      riskOutcomeBucket: "RECOVERED",
    },
  );

  assert.equal(result.coverage.createdQuestionBanks, 1);
  assert.equal(result.coverage.previewedQuestionBanks, 1);
  assert.ok(result.coverage.resetQuestionBanks >= 2);
  assert.equal(result.coverage.discardedChallenges, 1);
  assert.ok(result.questionCount > 0);
  assert.equal(result.coverage.settledAts.length, result.questionCount);
  assert.equal(result.coverage.decisionSecondsUsed.length, result.questionCount);
  for (let index = 0; index < result.coverage.settledAts.length; index += 1) {
    assert.ok(result.coverage.decisionSecondsUsed[index]! > 0);
    if (index > 0) {
      assert.ok(
        Date.parse(result.coverage.settledAts[index]!) >
          Date.parse(result.coverage.settledAts[index - 1]!),
      );
    }
  }
  const requiredLookback = resolveSpecialTrainingLookbackBars(
    "fast-decision-training",
  );
  const questionRows = db
    .prepare(
      `SELECT q.window_bar_count AS windowBarCount,
              q.start_index AS startIndex,
              q.end_index AS endIndex
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
        WHERE s.simulation_batch_id = ?`,
    )
    .all("system-dev-simulation-challenge-bank") as Array<{
    windowBarCount: number;
    startIndex: number;
    endIndex: number;
  }>;
  assert.equal(questionRows.length, result.questionCount);
  assert.equal(
    countSpecialTrainingProjectionRowsForSimulationBatch(
      "system-dev-simulation-challenge-bank",
    ),
    result.questionCount,
  );
  for (const row of questionRows) {
    assert.ok(row.startIndex + 1 >= requiredLookback);
    assert.ok(row.windowBarCount >= requiredLookback + 1);
    assert.ok(row.endIndex > row.startIndex);
  }

  const persistedBankNames = db
    .prepare(
      `SELECT name
         FROM special_training_banks
        WHERE simulation_batch_id = ?`,
    )
    .all("system-dev-simulation-challenge-bank") as Array<{ name?: unknown }>;
  assert.equal(persistedBankNames.length, 1);
  const persistedBankName = String(persistedBankNames[0]?.name ?? "");
  assert.ok(persistedBankName.startsWith("Market Sense · "));
  assert.ok(
    persistedBankName.length <= INPUT_LIMITS.specialTrainingBankNameChars,
  );

  const riskResult = await simulateChallengeItem(
    "risk-discipline-training",
    [
      {
        baseTimeframe: "1d",
        assetClass: "STOCK",
        poolIds: [poolId],
        symbols: [symbol],
        instrumentIds: [instrumentId],
      },
    ],
    3,
    {
      copy: getSystemDevSimulationCopy("en"),
      effectivePlan,
      language: "en",
      simulationBatchId: "system-dev-simulation-risk-actions",
      fastOutcomeBucket: "CORRECT",
      riskOutcomeBucket: "RECOVERED",
    },
  );
  assert.ok(riskResult.questionCount > 0);
  assert.equal(riskResult.coverage.settledAts.length, riskResult.questionCount);
  assert.ok(riskResult.coverage.decisionSecondsUsed.every((value) => value > 0));
  const riskRows = db
    .prepare(
      `SELECT start_index AS startIndex,
              end_index AS endIndex,
              used_operations AS usedOperations,
              max_operations AS maxOperations
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
        WHERE s.simulation_batch_id = ?`,
    )
    .all("system-dev-simulation-risk-actions") as Array<{
    startIndex: number;
    endIndex: number;
    usedOperations: number;
    maxOperations: number;
  }>;
  assert.equal(riskRows.length, riskResult.questionCount);
  assert.equal(
    countSpecialTrainingProjectionRowsForSimulationBatch(
      "system-dev-simulation-risk-actions",
    ),
    riskResult.questionCount,
  );
  for (const row of riskRows) {
    assert.ok(row.startIndex + 1 >= resolveSpecialTrainingLookbackBars("risk-discipline-training"));
    assert.ok(row.endIndex > row.startIndex);
    assert.ok(row.usedOperations >= 0);
    if (row.maxOperations > 0) {
      assert.ok(row.usedOperations <= row.maxOperations);
    }
  }

  const persistedBankCount = Number(
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_banks
          WHERE simulation_batch_id = ?`,
      )
      .pluck()
      .get("system-dev-simulation-challenge-bank") ?? 0,
  );
  assert.equal(persistedBankCount, 1);

  const cleanup = await cleanupSystemDevSimulationData();
  assert.ok(cleanup.deletedSpecialTrainingBanks >= 1);
  const remainingBankCount = Number(
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_banks
          WHERE simulation_batch_id = ?`,
      )
      .pluck()
      .get("system-dev-simulation-challenge-bank") ?? 0,
  );
  assert.equal(remainingBankCount, 0);
});

test("challenge simulation keeps full lookback and bounded horizons when a pool mixes short and long instruments", async () => {
  await ensureMixedLookbackMarket();

  const simulationBatchId = "system-dev-simulation-mixed-lookback-10";
  const result = await simulateChallengeItem(
    "fast-decision-training",
    [
      {
        baseTimeframe: "1d",
        assetClass: "STOCK",
        poolIds: [mixedLookbackPoolId],
        symbols: mixedLookbackInstruments.map((instrument) => instrument.symbol),
        instrumentIds: mixedLookbackInstruments.map(
          (instrument) => instrument.instrumentId,
        ),
      },
    ],
    0,
    {
      copy: getSystemDevSimulationCopy("en"),
      effectivePlan,
      language: "en",
      simulationBatchId,
      fastOutcomeBucket: "CORRECT",
      riskOutcomeBucket: "RECOVERED",
    },
  );

  assert.ok(result.questionCount > 0);
  const requiredLookback = resolveSpecialTrainingLookbackBars(
    "fast-decision-training",
  );
  const questionRows = db
    .prepare(
      `SELECT q.window_bar_count AS windowBarCount,
              q.start_index AS startIndex,
              q.end_index AS endIndex
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
        WHERE s.simulation_batch_id = ?`,
    )
    .all(simulationBatchId) as Array<{
    windowBarCount: number;
    startIndex: number;
    endIndex: number;
  }>;
  assert.equal(questionRows.length, result.questionCount);
  for (const row of questionRows) {
    assert.ok(row.startIndex + 1 >= requiredLookback);
    assert.ok(row.windowBarCount >= requiredLookback + 1);
    assert.equal(row.endIndex - row.startIndex, 50);
  }

  const riskSimulationBatchId = "system-dev-simulation-risk-lookback-5";
  const riskResult = await simulateChallengeItem(
    "risk-discipline-training",
    [
      {
        baseTimeframe: "1d",
        assetClass: "STOCK",
        poolIds: [mixedLookbackPoolId],
        symbols: mixedLookbackInstruments.map((instrument) => instrument.symbol),
        instrumentIds: mixedLookbackInstruments.map(
          (instrument) => instrument.instrumentId,
        ),
      },
    ],
    0,
    {
      copy: getSystemDevSimulationCopy("en"),
      effectivePlan,
      language: "en",
      simulationBatchId: riskSimulationBatchId,
      fastOutcomeBucket: "CORRECT",
      riskOutcomeBucket: "RECOVERED",
    },
  );
  const riskQuestionRows = db
    .prepare(
      `SELECT q.start_index AS startIndex,
              q.end_index AS endIndex
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
        WHERE s.simulation_batch_id = ?`,
    )
    .all(riskSimulationBatchId) as Array<{
    startIndex: number;
    endIndex: number;
  }>;
  assert.equal(riskQuestionRows.length, riskResult.questionCount);
  for (const row of riskQuestionRows) {
    assert.ok(row.startIndex + 1 >= requiredLookback);
    assert.equal(row.endIndex - row.startIndex, 60);
  }
});
