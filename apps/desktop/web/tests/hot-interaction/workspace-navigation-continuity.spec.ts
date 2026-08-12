// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

type WorkspacePage =
  | "COMMAND_CENTER"
  | "TRAINER"
  | "HISTORY"
  | "SPECIAL_TRAINING"
  | "CHALLENGE_STATS"
  | "STRATEGY_BACKTEST"
  | "NOTES"
  | "CUSTOM_INDICATOR"
  | "DATA"
  | "SETTINGS";

type ContinuitySnapshot = {
  activeNavKey: string | null;
  activePage: WorkspacePage;
  displayedPage: WorkspacePage;
  hasBlankFrame: boolean;
  loaderVisible: boolean;
  maxVisibleIconSize: number;
  motionActive: boolean;
  motionEpoch: string | null;
  visibleHiddenReadyPages: string[];
  visiblePages: string[];
  visibleText: string;
};

const navigationOrder: WorkspacePage[] = [
  "COMMAND_CENTER",
  "TRAINER",
  "HISTORY",
  "SPECIAL_TRAINING",
  "CHALLENGE_STATS",
  "STRATEGY_BACKTEST",
  "NOTES",
  "CUSTOM_INDICATOR",
  "DATA",
  "SETTINGS",
];

const viewports = [
  { width: 1440, height: 960 },
  { width: 1120, height: 900 },
  { width: 860, height: 900 },
] as const;

const MAX_WORKSPACE_ICON_SIZE = 56;

const readSnapshot = async (page: Page): Promise<ContinuitySnapshot> =>
  page.evaluate(() => {
    const bridge = window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__;
    if (!bridge) {
      throw new Error("Workspace navigation continuity bridge is not installed");
    }
    return bridge.snapshot();
  });

const collectAnimationFrameSnapshots = async (
  page: Page,
  frameCount: number,
): Promise<ContinuitySnapshot[]> =>
  page.evaluate(async (count) => {
    const nextFrame = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    const snapshots: ContinuitySnapshot[] = [];
    for (let index = 0; index < count; index += 1) {
      await nextFrame();
      const bridge = window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__;
      if (!bridge) {
        throw new Error(
          "Workspace navigation continuity bridge is not installed",
        );
      }
      snapshots.push(bridge.snapshot());
    }
    return snapshots;
  }, frameCount);

const expectStableNavigationFrame = (frame: ContinuitySnapshot) => {
  expect(frame.loaderVisible).toBe(false);
  expect(frame.hasBlankFrame).toBe(false);
  expect(frame.visibleHiddenReadyPages).toEqual([]);
  expect(frame.visiblePages.length).toBeGreaterThanOrEqual(1);
  expect(frame.visibleText.length).toBeGreaterThan(0);
  expect(frame.maxVisibleIconSize).toBeGreaterThan(0);
  expect(frame.maxVisibleIconSize).toBeLessThanOrEqual(
    MAX_WORKSPACE_ICON_SIZE,
  );
};

const waitForDisplayedPage = async (page: Page, expectedPage: WorkspacePage) => {
  await page.waitForFunction(
    (targetPage) =>
      window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__?.snapshot().displayedPage ===
      targetPage,
    expectedPage,
  );
};

const waitForMotionIdle = async (page: Page) => {
  await page.waitForFunction(() => {
    const snapshot = window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__?.snapshot();
    return snapshot ? !snapshot.motionActive : false;
  });
};

test("workspace navigation commits the target shell while its assets warm", async ({
  page,
}) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/workspace-navigation-continuity.html");
    await page.waitForFunction(() =>
      Boolean(window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__),
    );
    const initialSnapshot = await readSnapshot(page);
    expectStableNavigationFrame(initialSnapshot);

    for (const targetPage of navigationOrder.slice(1)) {
      const before = await readSnapshot(page);
      await page.locator(`[data-nav-item-key="${targetPage}"]`).click();
      await expect(
        page.locator(`[data-nav-item-key="${targetPage}"]`),
      ).toHaveAttribute("data-active", "true");
      await waitForDisplayedPage(page, targetPage);
      const warmupFrames = await collectAnimationFrameSnapshots(page, 8);
      expect(warmupFrames).not.toHaveLength(0);
      for (const frame of warmupFrames) {
        expectStableNavigationFrame(frame);
      }
      expect(
        warmupFrames.some(
          (frame) =>
            frame.displayedPage === before.displayedPage ||
            frame.displayedPage === targetPage,
        ),
      ).toBe(true);

      const after = await readSnapshot(page);
      expect(after.activePage).toBe(targetPage);
      expect(after.activeNavKey).toBe(targetPage);
      expect(after.displayedPage).toBe(targetPage);
      expectStableNavigationFrame(after);
      await waitForMotionIdle(page);
    }
  }
});

test("workspace navigation motion keeps icons bounded during rapid ready-page changes", async ({
  page,
}) => {
  await page.setViewportSize(viewports[0]);
  await page.goto("/workspace-navigation-continuity.html");
  await page.waitForFunction(() =>
    Boolean(window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__),
  );

  for (const targetPage of navigationOrder.slice(1)) {
    await page.locator(`[data-nav-item-key="${targetPage}"]`).click();
    await waitForDisplayedPage(page, targetPage);
    await waitForMotionIdle(page);
  }
  const readySnapshot = await readSnapshot(page);
  expectStableNavigationFrame(readySnapshot);

  const rapidTargets: WorkspacePage[] = ["TRAINER", "HISTORY", "TRAINER"];
  for (const targetPage of rapidTargets) {
    await page.locator(`[data-nav-item-key="${targetPage}"]`).click();
    const frames = await collectAnimationFrameSnapshots(page, 12);
    expect(frames).not.toHaveLength(0);
    for (const frame of frames) {
      expectStableNavigationFrame(frame);
    }
  }

  await waitForDisplayedPage(page, rapidTargets.at(-1)!);
  await waitForMotionIdle(page);
  const finalSnapshot = await readSnapshot(page);
  expect(finalSnapshot.activePage).toBe("TRAINER");
  expect(finalSnapshot.displayedPage).toBe("TRAINER");
  expect(finalSnapshot.motionActive).toBe(false);
  expectStableNavigationFrame(finalSnapshot);
});

test("Training Center opens the resumed free replay without resetting it", async ({
  page,
}) => {
  await page.goto(
    "/workspace-navigation-continuity.html?scenario=command-center-free-replay",
  );
  await expect(
    page.getByTestId("command-center-free-replay-lifecycle-root"),
  ).toBeVisible();
  await expect(page.getByTestId("global-market")).toHaveText("A_SHARE");
  await expect(page.getByTestId("active-session")).toHaveText(
    "resumed-us-session",
  );
  await expect(page.getByTestId("active-form-market")).toHaveText("US_STOCK");

  await page
    .locator(".training-command-center-cta.is-primary.is-strategy")
    .click();

  await expect(page.getByTestId("active-page")).toHaveText("TRAINER");
  await expect(page.getByTestId("active-session")).toHaveText(
    "resumed-us-session",
  );
  await expect(page.getByTestId("active-form-market")).toHaveText("US_STOCK");
  await expect(page.getByTestId("prep-market")).toHaveText("US_STOCK");
  await expect(page.getByTestId("prep-pool")).toHaveText("system-us-stocks");
  await expect(page.getByTestId("prep-instrument")).toHaveText("AAPL");
  await expect(page.getByTestId("trainer-start")).toBeDisabled();
});

test("visited activity workspaces keep their local state and component instance", async ({
  page,
}) => {
  await page.goto("/workspace-navigation-continuity.html");
  await page.waitForFunction(() =>
    Boolean(window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__),
  );

  for (const targetPage of navigationOrder.slice(1)) {
    await page.locator(`[data-nav-item-key="${targetPage}"]`).click();
    await waitForDisplayedPage(page, targetPage);
    const input = page.getByTestId(`workspace-state-${targetPage}`);
    const mount = page.getByTestId(`workspace-mount-${targetPage}`);
    const draft = `${targetPage}-retained`;
    await input.fill(draft);
    const mountToken = await mount.textContent();

    await page.locator('[data-nav-item-key="COMMAND_CENTER"]').click();
    await waitForDisplayedPage(page, "COMMAND_CENTER");
    await page.locator(`[data-nav-item-key="${targetPage}"]`).click();
    await waitForDisplayedPage(page, targetPage);

    await expect(input).toHaveValue(draft);
    await expect(mount).toHaveText(mountToken ?? "");
  }
});
