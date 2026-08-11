// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

type PerfTarget = "trainer" | "risk";

type HotPerfSnapshot = {
  budgets: {
    backendActionP95Ms: number;
    localFeedbackP95Ms: number;
    maxLongTaskMs: number;
    passes: boolean;
    visibleAdvanceP95Ms: number;
  };
  cursors: Record<PerfTarget, number>;
  droppedFrames: number;
  maxFrameGapMs: number;
  maxQueueDepth: number;
  metrics: Array<{ name: string }>;
  queues: Record<PerfTarget, number>;
  summary: {
    longTaskCount: number;
    sampleCount: number;
  };
};

const sampleCounts = [20, 100, 200] as const;

const readSnapshot = async (page: Page): Promise<HotPerfSnapshot> =>
  page.evaluate(() => {
    const bridge = window.__ZINUTO_HOT_INTERACTION_PERF__;
    if (!bridge) {
      throw new Error("Hot interaction perf bridge is not installed");
    }
    return bridge.read();
  });

const runSpaceSequence = async (
  page: Page,
  target: PerfTarget,
  count: number,
): Promise<HotPerfSnapshot> => {
  await page.evaluate((nextTarget) => {
    window.__ZINUTO_HOT_INTERACTION_PERF__?.start(nextTarget);
  }, target);
  await page.locator(`[data-testid="hot-${target}-target"]`).click();
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Space");
  }
  await page.waitForFunction(
    ({ expectedCount, expectedTarget }) => {
      const snapshot = window.__ZINUTO_HOT_INTERACTION_PERF__?.read();
      return (
        snapshot &&
        snapshot.cursors[expectedTarget] === expectedCount &&
        snapshot.queues[expectedTarget] === 0
      );
    },
    { expectedCount: count, expectedTarget: target },
    { timeout: 30_000 },
  );
  await page.evaluate(() => window.__ZINUTO_HOT_INTERACTION_PERF__?.finish());
  return readSnapshot(page);
};

const assertHotPerfSnapshot = (
  snapshot: HotPerfSnapshot,
  target: PerfTarget,
  count: number,
) => {
  expect(snapshot.cursors[target]).toBe(count);
  expect(snapshot.queues[target]).toBe(0);
  expect(snapshot.maxQueueDepth).toBeLessThanOrEqual(200);
  expect(snapshot.budgets.passes).toBe(true);
  expect(snapshot.budgets.localFeedbackP95Ms).toBeLessThanOrEqual(16);
  expect(snapshot.budgets.visibleAdvanceP95Ms).toBeLessThanOrEqual(100);
  expect(snapshot.budgets.backendActionP95Ms).toBeLessThanOrEqual(80);
  expect(snapshot.budgets.maxLongTaskMs).toBeLessThanOrEqual(50);
  expect(snapshot.summary.longTaskCount).toBe(0);
  expect(snapshot.summary.sampleCount).toBeGreaterThanOrEqual(count * 5);
  expect(snapshot.maxFrameGapMs).toBeLessThanOrEqual(120);
  expect(snapshot.droppedFrames).toBeLessThanOrEqual(1);
  expect(snapshot.metrics.some((sample) => sample.name === "bridge")).toBe(true);
  expect(snapshot.metrics.some((sample) => sample.name === "json-parse")).toBe(
    true,
  );
  expect(
    snapshot.metrics.some((sample) => sample.name === "backend-action"),
  ).toBe(true);
  expect(snapshot.metrics.some((sample) => sample.name === "chart-paint")).toBe(
    true,
  );
};

test.beforeEach(async ({ page }) => {
  await page.goto("/hot-interaction-perf.html");
  await page.waitForFunction(() =>
    Boolean(window.__ZINUTO_HOT_INTERACTION_PERF__),
  );
});

test("free trainer space advance stays inside hot interaction budgets", async ({
  page,
}) => {
  for (const count of sampleCounts) {
    const snapshot = await runSpaceSequence(page, "trainer", count);
    assertHotPerfSnapshot(snapshot, "trainer", count);
  }
});

test("special training risk space advance stays inside hot interaction budgets", async ({
  page,
}) => {
  for (const count of sampleCounts) {
    const snapshot = await runSpaceSequence(page, "risk", count);
    assertHotPerfSnapshot(snapshot, "risk", count);
  }
});
