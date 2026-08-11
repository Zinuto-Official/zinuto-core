// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Locator } from "@playwright/test";

const collectSplitLatinWords = async (locator: Locator): Promise<string[]> =>
  locator.evaluate((element) => {
    const splitWords: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      for (const match of text.matchAll(/[A-Za-z]+/g)) {
        const start = match.index ?? 0;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + match[0].length);
        const visibleRects = Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        if (visibleRects.length > 1) {
          splitWords.push(match[0]);
        }
      }
      node = walker.nextNode();
    }
    return splitWords;
  });

test("desktop navigation and setting labels do not split words at 1224px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1224, height: 900 });
  await page.goto(
    "/i18n-pages.html?page=SETTINGS_GENERAL&locale=en&theme=light",
  );

  const settingsLabel = page
    .locator(".settings-row-title")
    .filter({ hasText: "Show Floating Help Button" });
  await expect(settingsLabel).toBeVisible();
  await expect(settingsLabel).toHaveCSS("hyphens", "none");
  await expect(settingsLabel).toHaveCSS("overflow-wrap", "break-word");
  expect(await collectSplitLatinWords(settingsLabel)).toEqual([]);

  const longTokenLayout = await settingsLabel.evaluate((element) => {
    element.textContent =
      "VERSION_BUILD_IDENTIFIER_WITHOUT_SEPARATORS_0123456789".repeat(6);
    const bounds = element.getBoundingClientRect();
    const parentBounds = element.parentElement?.getBoundingClientRect() ?? bounds;
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: bounds.right,
      parentRight: parentBounds.right,
    };
  });
  expect(longTokenLayout.clientWidth).toBeGreaterThan(0);
  expect(longTokenLayout.scrollWidth).toBeLessThanOrEqual(
    longTokenLayout.clientWidth + 1,
  );
  expect(longTokenLayout.right).toBeLessThanOrEqual(
    longTokenLayout.parentRight + 1,
  );

  await page.goto("/workspace-navigation-continuity.html");
  for (const label of [
    page.locator('[data-nav-item-key="TRAINER"] .sidebar-nav-item-label'),
    page.locator('[data-nav-item-key="HISTORY"] .sidebar-nav-item-label'),
    page.locator('[data-nav-item-key="DATA"] .sidebar-nav-item-label'),
  ]) {
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS("hyphens", "none");
    await expect(label).toHaveCSS("overflow-wrap", "break-word");
    expect(await collectSplitLatinWords(label)).toEqual([]);
  }
});

test("floating Help dismiss stays accessible and Settings can restore the launcher", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(
    "/i18n-pages.html?page=SETTINGS_GENERAL&locale=en&theme=light&help=launcher",
  );

  const host = page.locator(".desktop-help-floating-host");
  const launcher = host.locator(":scope > .desktop-help-launcher");
  const dismiss = host.locator(":scope > .desktop-help-launcher-dismiss");
  const panel = page.getByRole("region", { name: "Help Center" });
  const settingsSwitch = page.getByRole("switch", {
    name: "Show Floating Help Button",
  });

  await expect(host).toBeVisible();
  await expect(host.locator(":scope > button")).toHaveCount(2);
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  await expect(dismiss).toHaveAttribute(
    "aria-label",
    "Hide floating Help button",
  );
  await expect(dismiss).toBeHidden();

  await launcher.focus();
  await expect(dismiss).toBeVisible();
  const launcherBox = await launcher.boundingBox();
  const dismissBox = await dismiss.boundingBox();
  expect(launcherBox).not.toBeNull();
  expect(dismissBox).not.toBeNull();
  expect(dismissBox!.width).toBeLessThan(launcherBox!.width);
  expect(
    Math.min(launcherBox!.x + launcherBox!.width, dismissBox!.x + dismissBox!.width) -
      Math.max(launcherBox!.x, dismissBox!.x),
  ).toBeLessThanOrEqual(12);
  expect(
    Math.min(launcherBox!.y + launcherBox!.height, dismissBox!.y + dismissBox!.height) -
      Math.max(launcherBox!.y, dismissBox!.y),
  ).toBeLessThanOrEqual(12);
  await page.keyboard.press("Tab");
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(host).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(settingsSwitch).toHaveAttribute("aria-checked", "false");

  await settingsSwitch.click();
  await expect(settingsSwitch).toHaveAttribute("aria-checked", "true");
  await expect(host).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);

  await launcher.click();
  await expect(panel).toBeVisible();
  await host.hover();
  await expect(dismiss).toBeVisible();
  await dismiss.click();

  await expect(host).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(settingsSwitch).toHaveAttribute("aria-checked", "false");

  await settingsSwitch.click();
  await expect(host).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
});

for (const testCase of [
  { width: 700, height: 900, theme: "light" },
  { width: 860, height: 620, theme: "dark" },
] as const) {
  test(`floating Help controls stay in view at ${testCase.width}x${testCase.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: testCase.width,
      height: testCase.height,
    });
    await page.goto(
      `/i18n-pages.html?page=COMMAND_CENTER&locale=en&theme=${testCase.theme}&help=launcher`,
    );

    const host = page.locator(".desktop-help-floating-host");
    const dismiss = host.locator(":scope > .desktop-help-launcher-dismiss");
    await host.hover();
    await expect(dismiss).toBeVisible();

    const hostBox = await host.boundingBox();
    const dismissBox = await dismiss.boundingBox();
    expect(hostBox).not.toBeNull();
    expect(dismissBox).not.toBeNull();
    expect(hostBox!.x).toBeGreaterThanOrEqual(0);
    expect(hostBox!.y).toBeGreaterThanOrEqual(0);
    expect(dismissBox!.x).toBeGreaterThanOrEqual(0);
    expect(dismissBox!.y).toBeGreaterThanOrEqual(0);
    expect(dismissBox!.x + dismissBox!.width).toBeLessThanOrEqual(
      testCase.width,
    );
    expect(dismissBox!.y + dismissBox!.height).toBeLessThanOrEqual(
      testCase.height,
    );
  });
}
