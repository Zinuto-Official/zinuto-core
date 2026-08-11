// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFastDecisionOutcomeSequence,
  buildFreeReplayArchetypeSequence,
  buildRiskDisciplineOutcomeSequence,
  estimateSystemDevSimulationRemainingMs,
  resolveSystemDevSimulationEffectivePlanForPools,
  resolveSystemDevSimulationTotalTargetForPlan,
} from "../../src/application/systemDevSimulation/planning.js";
import { buildSystemDevSimulationFreeReplayPlan } from "../../src/application/systemDevSimulation/freeReplayPlan.js";
import { resolveSystemDevSimulationCapabilities } from "@zinuto/shared/systemDevSimulationProfiles";

const samplePools = [
  {
    id: "pool-1",
    name: "Pool 1",
    assetClass: "STOCK" as const,
    baseTimeframe: "1d" as const,
    symbols: ["AAPL", "MSFT", "NVDA", "TSLA"],
  },
  {
    id: "pool-2",
    name: "Pool 2",
    assetClass: "CRYPTO" as const,
    baseTimeframe: "1h" as const,
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"],
  },
];

test("realistic effective plan keeps representative targets and runtime settings", () => {
  const plan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: samplePools,
  });

  assert.equal(plan.profileId, "REALISTIC");
  assert.equal(plan.calibrated, true);
  assert.equal(plan.targets.freeReplayTarget, 48);
  assert.equal(plan.targets.fastDecisionTarget, 24);
  assert.equal(plan.targets.riskDisciplineTarget, 24);
  assert.equal(plan.targets.independentCustomNotes, 24);
  assert.equal(plan.targets.customIndicatorProfiles, 12);
  assert.equal(plan.targets.realBacktestBatches, 33);
  assert.equal(plan.runtime.freeReplayConcurrency, 1);
  assert.equal(plan.runtime.challengeConcurrency, 2);
  assert.equal(plan.runtime.barCacheMaxSeries, 8);
  assert.equal(resolveSystemDevSimulationTotalTargetForPlan(plan), 167);
});

test("realistic and stress replay plans preserve instrument market bindings", () => {
  const pools = [
    {
      id: "cn-stock-source",
      name: "CN stocks",
      assetClass: "STOCK" as const,
      baseTimeframe: "1d" as const,
      symbols: ["SH600000", "AAPL"],
      instruments: [
        {
          instrumentId: "cn:SH600000",
          symbol: "SH600000",
          baseTimeframe: "1d" as const,
          barCount: 500,
          assetClass: "STOCK" as const,
          marketPresetId: "A_SHARE" as const,
          sourceKind: "LOCAL" as const,
          sourceId: "cn-stock-source",
          sourceName: "CN stocks",
        },
        {
          instrumentId: "us:AAPL",
          symbol: "AAPL",
          baseTimeframe: "1d" as const,
          barCount: 500,
          assetClass: "STOCK" as const,
          marketPresetId: "US_STOCK" as const,
          sourceKind: "LOCAL" as const,
          sourceId: "cn-stock-source",
          sourceName: "CN stocks",
        },
      ],
    },
  ];

  const first = buildSystemDevSimulationFreeReplayPlan(
    pools,
    "fixed-realistic-seed",
    8,
    { profileId: "REALISTIC" },
  );
  const second = buildSystemDevSimulationFreeReplayPlan(
    pools,
    "fixed-realistic-seed",
    8,
    { profileId: "REALISTIC" },
  );

  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  first.forEach((item) => {
    assert.equal(
      item.marketPresetId,
      item.symbol === "SH600000" ? "A_SHARE" : "US_STOCK",
    );
  });

  const stress = buildSystemDevSimulationFreeReplayPlan(
    pools,
    "fixed-stress-seed",
    8,
    {
      profileId: "STRESS",
      requireLeveragePresetCoverage: true,
    },
  );
  stress.forEach((item) => {
    assert.equal(
      item.marketPresetId,
      item.symbol === "SH600000" ? "A_SHARE" : "US_STOCK",
    );
  });
});

test("stress effective plan uses calibration to stay within heavy-load clamps", () => {
  const calibratedPlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "STRESS",
    pools: samplePools,
    calibration: {
      freeReplayAverageMs: 160,
      fastDecisionAverageMs: 140,
      riskDisciplineAverageMs: 180,
      customNoteAverageMs: 60,
    },
  });

  assert.equal(calibratedPlan.profileId, "STRESS");
  assert.equal(calibratedPlan.calibrated, true);
  assert.ok(calibratedPlan.targets.freeReplayTarget >= 1200);
  assert.ok(calibratedPlan.targets.freeReplayTarget <= 3000);
  assert.ok(calibratedPlan.targets.fastDecisionTarget >= 240);
  assert.ok(calibratedPlan.targets.fastDecisionTarget <= 600);
  assert.ok(calibratedPlan.targets.riskDisciplineTarget >= 240);
  assert.ok(calibratedPlan.targets.riskDisciplineTarget <= 600);
  assert.ok(calibratedPlan.targets.independentCustomNotes >= 24);
  assert.ok(calibratedPlan.targets.independentCustomNotes <= 48);
  assert.equal(calibratedPlan.runtime.freeReplayConcurrency, 4);
  assert.equal(calibratedPlan.runtime.challengeConcurrency, 4);
  assert.equal(calibratedPlan.runtime.customNoteConcurrency, 2);
  assert.equal(calibratedPlan.runtime.barCacheMaxSeries, 32);
  assert.ok((calibratedPlan.budget.projectedDurationMs ?? 0) > 0);
});

test("stress coverage sequences satisfy minimum warmup distribution", () => {
  const stressPlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "STRESS",
    pools: samplePools,
    calibration: {
      freeReplayAverageMs: 160,
      fastDecisionAverageMs: 140,
      riskDisciplineAverageMs: 180,
      customNoteAverageMs: 60,
    },
  });

  const archetypeSequence = buildFreeReplayArchetypeSequence(stressPlan, 64);
  const archetypeCounts = new Map<string, number>();
  archetypeSequence.forEach((item) => {
    archetypeCounts.set(item, (archetypeCounts.get(item) ?? 0) + 1);
  });
  assert.equal(archetypeCounts.size, 8);
  for (const count of archetypeCounts.values()) {
    assert.equal(count, 8);
  }

  const fastDecisionSequence = buildFastDecisionOutcomeSequence(stressPlan, 48);
  const fastCounts = new Map<string, number>();
  fastDecisionSequence.forEach((item) => {
    fastCounts.set(item, (fastCounts.get(item) ?? 0) + 1);
  });
  assert.equal(fastCounts.size, 4);
  for (const count of fastCounts.values()) {
    assert.equal(count, 12);
  }

  const riskSequence = buildRiskDisciplineOutcomeSequence(stressPlan, 50);
  const riskCounts = new Map<string, number>();
  riskSequence.forEach((item) => {
    riskCounts.set(item, (riskCounts.get(item) ?? 0) + 1);
  });
  assert.equal(riskCounts.size, 5);
  for (const count of riskCounts.values()) {
    assert.equal(count, 10);
  }
});

test("remaining-time estimation uses effective plan targets and workload averages", () => {
  const plan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: samplePools,
  });

  const remainingMs = estimateSystemDevSimulationRemainingMs({
    plan,
    freeReplayCompleted: 32,
    fastDecisionCompleted: 12,
    riskDisciplineCompleted: 6,
    customNotesCreated: 2,
    averages: {
      freeReplayAverageMs: 100,
      fastDecisionAverageMs: 80,
      riskDisciplineAverageMs: 90,
      customNoteAverageMs: 40,
    },
  });

  assert.equal(
    remainingMs,
    (16 * 100) +
      (12 * 80) +
      (18 * 90) +
      (22 * 40) +
      (12 * 25) +
      (33 * 1_000),
  );
});

test("requested targets keep exact selected categories while unselected categories stay empty", () => {
  const plan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: samplePools,
    targets: {
      freeReplayTarget: 0,
      fastDecisionTarget: 0,
      riskDisciplineTarget: 0,
      independentCustomNotes: 0,
      customIndicatorProfiles: 7,
      realBacktestBatches: 0,
    },
  });

  assert.deepEqual(plan.targets, {
    freeReplayTarget: 0,
    fastDecisionTarget: 0,
    riskDisciplineTarget: 0,
    independentCustomNotes: 0,
    customIndicatorProfiles: 7,
    realBacktestBatches: 0,
  });
  assert.equal(resolveSystemDevSimulationTotalTargetForPlan(plan), 9);
});

test("remaining-time estimation includes indicator and backtest-only workloads", () => {
  const plan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: "REALISTIC",
    pools: [],
    targets: {
      freeReplayTarget: 0,
      fastDecisionTarget: 0,
      riskDisciplineTarget: 0,
      independentCustomNotes: 0,
      customIndicatorProfiles: 7,
      realBacktestBatches: 10,
    },
  });

  assert.equal(
    estimateSystemDevSimulationRemainingMs({
      plan,
      freeReplayCompleted: 0,
      fastDecisionCompleted: 0,
      riskDisciplineCompleted: 0,
      customNotesCreated: 0,
      averages: null,
    }),
    10_175,
  );
});

test("capabilities hide stress when the backend marks it unavailable", () => {
  const capabilities = resolveSystemDevSimulationCapabilities({
    stressAvailable: false,
    dataAvailability: {
      ready: true,
      localReadySourceCount: 1,
      localEligibleInstrumentCount: 2,
      systemEligibleInstrumentCount: 0,
      selectedInstrumentCount: 2,
      selectedLocalInstrumentCount: 2,
      selectedSystemInstrumentCount: 0,
      willUseSystemFallback: false,
      sourceStrategy: "LOCAL_READY",
    },
  });

  assert.equal(capabilities.defaultProfileId, "REALISTIC");
  assert.equal(capabilities.dataAvailability.ready, true);
  assert.equal(capabilities.dataAvailability.sourceStrategy, "LOCAL_READY");
  assert.equal(capabilities.profiles.length, 2);
  assert.equal(
    capabilities.profiles.find((profile) => profile.profileId === "STRESS")
      ?.available,
    false,
  );
});
