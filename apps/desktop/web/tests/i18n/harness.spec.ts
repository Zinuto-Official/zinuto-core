// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

const locales = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "es",
  "en-XA",
] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "narrow", width: 1120, height: 900 },
  { name: "tight", width: 860, height: 900 },
] as const;

const collectI18nFallbackMessages = (page: Page): string[] => {
  const messages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[i18n] Falling back")) {
      messages.push(text);
    }
  });
  return messages;
};

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`i18n harness has no critical overflow in ${locale} at ${viewport.name}`, async ({
      page,
    }) => {
      const i18nFallbackMessages = collectI18nFallbackMessages(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(`/i18n-harness.html?locale=${encodeURIComponent(locale)}`);
      await page.waitForLoadState("networkidle");

      const overflowRecords = await page.evaluate(() => {
        const bridge = (
          window as typeof window & {
            __ZINUTO_I18N_AUDIT__?: {
              collectDesktopLayoutRecords: () => {
                buttonFitRecords: Array<unknown>;
                containerInlineOverflowRecords: Array<unknown>;
                overlapRecords: Array<unknown>;
              };
              collectOverflowRecords: () => Array<unknown>;
            };
          }
        ).__ZINUTO_I18N_AUDIT__;
        return {
          desktopLayoutRecords: bridge?.collectDesktopLayoutRecords() ?? {
            buttonFitRecords: [],
            containerInlineOverflowRecords: [],
            overlapRecords: [],
          },
          overflowRecords: bridge?.collectOverflowRecords() ?? [],
        };
      });

      expect(overflowRecords.overflowRecords).toEqual([]);
      expect(overflowRecords.desktopLayoutRecords.buttonFitRecords).toEqual([]);
      expect(overflowRecords.desktopLayoutRecords.containerInlineOverflowRecords).toEqual([]);
      expect(overflowRecords.desktopLayoutRecords.overlapRecords).toEqual([]);
      expect(i18nFallbackMessages).toEqual([]);
    });
  }
}
