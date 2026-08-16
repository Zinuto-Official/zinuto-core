// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

const liveRootSelector = "#root > .app-root";
const overlaySelector = '[data-theme-transition-overlay="true"]';

const readThemeTransitionFrame = async (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(
      '[data-theme-transition-overlay="true"]',
    );
    const liveRoot = document.querySelector<HTMLElement>("#root > .app-root");

    return {
      backdrop: layer ? getComputedStyle(layer).backgroundColor : null,
      liveTheme: liveRoot?.classList.contains("theme-dark")
        ? "dark"
        : liveRoot?.classList.contains("theme-light")
          ? "light"
          : null,
      opacity: Number(layer ? getComputedStyle(layer).opacity : "-1"),
      transitionActive:
        document.documentElement.dataset.themeTransition === "active",
    };
  });

test("theme toggle fades across desktop palettes", async ({ page }) => {
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
      '[data-theme-transition-overlay="true"]',
    );
    return (
      layer !== null &&
      document.documentElement.dataset.themeTransition === "active" &&
      Number(getComputedStyle(layer).opacity) > 0
    );
  });

  const frame = await readThemeTransitionFrame(page);
  expect(frame.liveTheme).toBe("dark");
  expect(frame.transitionActive).toBe(true);
  expect(frame.backdrop).not.toBe("rgba(0, 0, 0, 0)");
  expect(frame.opacity).toBeGreaterThan(0);

  await page.waitForFunction(
    () => document.querySelector('[data-theme-transition-overlay="true"]') === null,
  );
  await expect(liveRoot).toHaveClass(/theme-dark/);

  const lightButton = page.locator(`${liveRootSelector} button[title="Light mode"]`);
  await expect(lightButton).toHaveCount(1);
  await lightButton.click();
  await page.waitForFunction(
    () => document.querySelector('[data-theme-transition-overlay="true"]') === null,
  );
  await expect(liveRoot).toHaveClass(/theme-light/);
});

test("reduced motion switches the theme without creating a snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui-catalog.html?theme=light");

  await page.locator(`${liveRootSelector} button[title="Dark mode"]`).click();
  await expect(page.locator(liveRootSelector)).toHaveClass(/theme-dark/);
  await expect(page.locator(overlaySelector)).toHaveCount(0);
});
