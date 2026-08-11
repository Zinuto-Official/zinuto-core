// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

const liveRootSelector = "#root > .app-root";
const snapshotSelector = '[data-theme-transition-snapshot="true"]';

const readThemeTransitionFrame = async (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(
      '[data-theme-transition-snapshot="true"]',
    );
    const liveRoot = document.querySelector<HTMLElement>("#root > .app-root");
    const snapshotRoot = layer?.querySelector<HTMLElement>(".app-root");

    return {
      backdrop: layer ? getComputedStyle(layer).backgroundColor : null,
      liveTheme: liveRoot?.classList.contains("theme-dark")
        ? "dark"
        : liveRoot?.classList.contains("theme-light")
          ? "light"
          : null,
      progress: Number(layer?.dataset.themeTransitionProgress ?? "-1"),
      radius: Number(layer?.dataset.themeTransitionRadius ?? "-1"),
      snapshotTheme: snapshotRoot?.classList.contains("theme-dark")
        ? "dark"
        : snapshotRoot?.classList.contains("theme-light")
          ? "light"
          : null,
    };
  });

test("theme toggle reveals the new desktop palette from the center", async ({ page }) => {
  await page.goto("/ui-catalog.html?theme=light");
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--motion-theme-reveal-duration",
      "1200ms",
    );
  });
  const liveRoot = page.locator(liveRootSelector);
  const darkButton = page.locator(`${liveRootSelector} button[title="Dark mode"]`);

  await expect(liveRoot).toHaveClass(/theme-light/);
  await expect(darkButton).toHaveCount(1);
  await darkButton.click();
  await page.waitForFunction(() => {
    const layer = document.querySelector<HTMLElement>(
      '[data-theme-transition-snapshot="true"]',
    );
    return (
      layer !== null &&
      Number(layer.dataset.themeTransitionProgress ?? "0") > 0 &&
      Number(layer.dataset.themeTransitionProgress ?? "1") < 1 &&
      Number(layer.dataset.themeTransitionRadius ?? "0") > 32
    );
  });

  const frame = await readThemeTransitionFrame(page);
  expect(frame.liveTheme).toBe("dark");
  expect(frame.snapshotTheme).toBe("light");
  expect(frame.backdrop).not.toBe("rgba(0, 0, 0, 0)");
  expect(frame.radius).toBeGreaterThan(0);
  expect(frame.progress).toBeGreaterThan(0);
  expect(frame.progress).toBeLessThan(1);

  await page.waitForFunction(
    () => document.querySelector('[data-theme-transition-snapshot="true"]') === null,
  );
  await expect(liveRoot).toHaveClass(/theme-dark/);

  const lightButton = page.locator(`${liveRootSelector} button[title="Light mode"]`);
  await expect(lightButton).toHaveCount(1);
  await lightButton.click();
  await page.waitForFunction(
    () => document.querySelector('[data-theme-transition-snapshot="true"]') === null,
  );
  await expect(liveRoot).toHaveClass(/theme-light/);
});

test("reduced motion switches the theme without creating a snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui-catalog.html?theme=light");

  await page.locator(`${liveRootSelector} button[title="Dark mode"]`).click();
  await expect(page.locator(liveRootSelector)).toHaveClass(/theme-dark/);
  await expect(page.locator(snapshotSelector)).toHaveCount(0);
});
