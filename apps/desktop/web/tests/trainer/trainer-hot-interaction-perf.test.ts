// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTrainerHotInteractionBudgets,
  summarizeTrainerHotInteractionMetrics,
  TRAINER_HOT_INTERACTION_BUDGETS,
  type TrainerHotInteractionMetricSample,
} from "../../src/domains/trainer/trainerPerfTrace";

const sample = (
  name: TrainerHotInteractionMetricSample["name"],
  durationMs: number,
): TrainerHotInteractionMetricSample => ({
  name,
  durationMs,
  atMs: durationMs,
});

test("trainer hot interaction metrics summarize p95 budgets", () => {
  const samples: TrainerHotInteractionMetricSample[] = [
    sample("local-feedback", 8),
    sample("local-feedback", 16),
    sample("visible-advance", 70),
    sample("visible-advance", 96),
    sample("backend-action", 40),
    sample("backend-action", 70),
    sample("long-task", 24),
  ];

  assert.deepEqual(summarizeTrainerHotInteractionMetrics(samples), {
    localFeedbackP95Ms: 16,
    visibleAdvanceP95Ms: 96,
    backendActionP95Ms: 70,
    maxLongTaskMs: 24,
    longTaskCount: 1,
    sampleCount: samples.length,
  });
  assert.equal(evaluateTrainerHotInteractionBudgets(samples).passes, true);
  assert.equal(TRAINER_HOT_INTERACTION_BUDGETS.localFeedbackP95Ms, 16);
  assert.equal(TRAINER_HOT_INTERACTION_BUDGETS.visibleAdvanceP95Ms, 100);
  assert.equal(TRAINER_HOT_INTERACTION_BUDGETS.backendActionP95Ms, 80);
  assert.equal(TRAINER_HOT_INTERACTION_BUDGETS.maxLongTaskMs, 50);
  assert.equal(TRAINER_HOT_INTERACTION_BUDGETS.continuousStepSampleCount, 200);
});

test("trainer hot interaction metrics fail when a segment exceeds budget", () => {
  const samples: TrainerHotInteractionMetricSample[] = [
    sample("local-feedback", 17),
    sample("visible-advance", 101),
    sample("backend-action", 81),
    sample("long-task", 51),
  ];

  const evaluation = evaluateTrainerHotInteractionBudgets(samples);

  assert.equal(evaluation.passes, false);
  assert.equal(evaluation.localFeedbackP95Ms, 17);
  assert.equal(evaluation.visibleAdvanceP95Ms, 101);
  assert.equal(evaluation.backendActionP95Ms, 81);
  assert.equal(evaluation.maxLongTaskMs, 51);
});
