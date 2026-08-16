// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from "@playwright/test";

const locales = ["en", "zh-CN", "ja", "ko", "es", "en-XA"] as const;

const pages = [
  "COMMAND_CENTER",
  "TRAINER",
  "TRAINER_START_POINT_DRAWER",
  "TRAINER_START_POINT_DRAWER_TOGGLE",
  "SPECIAL_TRAINING",
  "CHALLENGE_STATS",
  "HISTORY",
  "NOTES",
  "NOTES_EMPTY",
  "NOTES_FILTERED_EMPTY",
  "NOTES_COMPOSE",
  "CUSTOM_INDICATOR",
  "STRATEGY_BACKTEST",
  "STRATEGY_BACKTEST_DETAIL",
  "DATA",
  "DATA_IMPORT_MODAL",
  "DATA_IMPORT_MODAL_ERROR",
  "SETTINGS",
  "SETTINGS_GENERAL",
  "SETTINGS_DATA_TRANSFER",
  "SETTINGS_ABOUT",
  "SETTINGS_ADVANCED",
  "SETTINGS_BLOCKED",
] as const;

const workspaceFrameAuditPages = new Set<string>([
  "COMMAND_CENTER",
  "CHALLENGE_STATS",
  "CUSTOM_INDICATOR",
  "DATA",
  "HISTORY",
  "NOTES",
  "NOTES_EMPTY",
  "NOTES_FILTERED_EMPTY",
  "NOTES_COMPOSE",
  "SETTINGS",
  "SETTINGS_GENERAL",
  "SETTINGS_DATA_TRANSFER",
  "SETTINGS_ABOUT",
  "SETTINGS_ADVANCED",
  "SETTINGS_BLOCKED",
] as const);

const workspaceShellAuditPages = new Set<string>([
  "COMMAND_CENTER",
  "TRAINER",
  "SPECIAL_TRAINING",
  "CHALLENGE_STATS",
  "HISTORY",
  "NOTES",
  "NOTES_EMPTY",
  "NOTES_FILTERED_EMPTY",
  "NOTES_COMPOSE",
  "CUSTOM_INDICATOR",
  "DATA",
  "SETTINGS",
  "SETTINGS_GENERAL",
  "SETTINGS_DATA_TRANSFER",
  "SETTINGS_ABOUT",
  "SETTINGS_ADVANCED",
  "SETTINGS_BLOCKED",
] as const);

const splitDividerAuditPages = new Set<string>([
  "NOTES",
  "NOTES_EMPTY",
  "NOTES_FILTERED_EMPTY",
  "NOTES_COMPOSE",
  "SETTINGS",
  "SETTINGS_GENERAL",
  "SETTINGS_DATA_TRANSFER",
  "SETTINGS_ABOUT",
  "SETTINGS_ADVANCED",
  "SETTINGS_BLOCKED",
] as const);

const themes = ["light", "dark"] as const;

const viewports = [
  { name: "ultra-wide", width: 2560, height: 1440 },
  { name: "desktop", width: 1440, height: 960 },
  { name: "narrow", width: 1120, height: 900 },
  { name: "tight", width: 860, height: 900 },
] as const;

const waitForPreviewAuditIdle = async (page: Page) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
};

type DataTransferViewportRecord = {
  contentFitsViewport: boolean;
  hasVerticalOverflow: boolean;
  overflowY: string | null;
};

const collectDataTransferViewport = async (
  page: Page,
): Promise<DataTransferViewportRecord> =>
  page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(
      '.settings-redesign-scroll[data-active-tab="DATA_TRANSFER"]',
    );
    const sectionStack = scroll?.querySelector<HTMLElement>(
      ".settings-redesign-section-stack",
    );
    const scrollRect = scroll?.getBoundingClientRect();
    const sectionStackRect = sectionStack?.getBoundingClientRect();

    return {
      contentFitsViewport:
        Boolean(scrollRect && sectionStackRect) &&
        (sectionStackRect?.top ?? Number.POSITIVE_INFINITY) >=
          (scrollRect?.top ?? Number.NEGATIVE_INFINITY) - 1 &&
        (sectionStackRect?.bottom ?? Number.POSITIVE_INFINITY) <=
          (scrollRect?.bottom ?? Number.NEGATIVE_INFINITY) + 1,
      hasVerticalOverflow: scroll
        ? scroll.scrollHeight - scroll.clientHeight > 1
        : true,
      overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
    };
  });

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

type CustomIndicatorEditorGeometryRecord = {
  codeMirrorRuntimeStyleHasNonce: boolean;
  contentDisplay: string | null;
  diagnosticsOpen: string | null;
  drawerBottomDelta: number | null;
  editorHeight: number | null;
  firstGutterHeight: number | null;
  firstGutterTop: number | null;
  firstLineHeight: number | null;
  firstLineTop: number | null;
  gutterDisplay: string | null;
  scrollerAlignItems: string | null;
  scrollerDisplay: string | null;
  scrollerHeight: number | null;
  sourceTabHeight: number | null;
};

const collectCustomIndicatorEditorGeometry = async (
  page: Page,
): Promise<CustomIndicatorEditorGeometryRecord> =>
  page.evaluate(() => {
    const roundPixel = (value: number): number => Math.round(value * 100) / 100;
    const rectFor = (selector: string): DOMRect | null =>
      document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ??
      null;
    const heightFor = (selector: string): number | null => {
      const rect = rectFor(selector);
      return rect ? roundPixel(rect.height) : null;
    };

    const engineRect = rectFor(".custom-indicator-engine-body");
    const drawerRect = rectFor(".custom-indicator-diagnostics-drawer");
    const scroller = document.querySelector<HTMLElement>(
      ".custom-indicator-code-editor .cm-scroller",
    );
    const content = document.querySelector<HTMLElement>(
      ".custom-indicator-code-editor .cm-content",
    );
    const gutters = document.querySelector<HTMLElement>(
      ".custom-indicator-code-editor .cm-gutters",
    );
    const visibleLine = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".custom-indicator-code-editor .cm-line",
      ),
    ).find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    });
    const visibleGutter = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".custom-indicator-code-editor .cm-lineNumbers .cm-gutterElement",
      ),
    ).find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    });
    const lineRect = visibleLine?.getBoundingClientRect() ?? null;
    const gutterRect = visibleGutter?.getBoundingClientRect() ?? null;
    const scrollerStyle = scroller ? getComputedStyle(scroller) : null;
    const codeMirrorRuntimeStyleHasNonce = Array.from(
      document.querySelectorAll<HTMLStyleElement>("style"),
    ).some(
      (node) =>
        (node.nonce ?? "").trim().length > 0 &&
        (node.textContent ?? "").includes(".cm-content"),
    );

    return {
      codeMirrorRuntimeStyleHasNonce,
      contentDisplay: content ? getComputedStyle(content).display : null,
      diagnosticsOpen:
        document.querySelector<HTMLElement>(".custom-indicator-engine-body")
          ?.dataset.diagnosticsOpen ?? null,
      drawerBottomDelta:
        engineRect && drawerRect
          ? roundPixel(drawerRect.bottom - engineRect.bottom)
          : null,
      editorHeight: heightFor(".custom-indicator-code-editor .cm-editor"),
      firstGutterHeight: gutterRect ? roundPixel(gutterRect.height) : null,
      firstGutterTop: gutterRect ? roundPixel(gutterRect.top) : null,
      firstLineHeight: lineRect ? roundPixel(lineRect.height) : null,
      firstLineTop: lineRect ? roundPixel(lineRect.top) : null,
      gutterDisplay: gutters ? getComputedStyle(gutters).display : null,
      scrollerAlignItems: scrollerStyle?.alignItems ?? null,
      scrollerDisplay: scrollerStyle?.display ?? null,
      scrollerHeight: heightFor(".custom-indicator-code-editor .cm-scroller"),
      sourceTabHeight: heightFor(".custom-indicator-source-tab"),
    };
  });

const expectCustomIndicatorEditorGeometry = (
  record: CustomIndicatorEditorGeometryRecord,
  state: "closed" | "open",
  options: { expectRuntimeStyleNonce?: boolean } = {},
) => {
  expect(record.diagnosticsOpen).toBe(state === "open" ? "true" : "false");
  expect(record.sourceTabHeight ?? 0).toBeGreaterThan(0);
  expect(record.editorHeight ?? 0).toBeGreaterThan(0);
  expect(record.scrollerHeight ?? 0).toBeGreaterThan(0);
  expect(record.scrollerDisplay).toBe("flex");
  expect(record.scrollerAlignItems).toBe("flex-start");
  expect(record.gutterDisplay).toBe("flex");
  expect(record.contentDisplay).toBe("block");
  expect(
    record.drawerBottomDelta ?? Number.POSITIVE_INFINITY,
  ).toBeLessThanOrEqual(1);
  expect(record.firstLineTop).not.toBeNull();
  expect(record.firstGutterTop).not.toBeNull();
  expect(record.firstLineHeight).not.toBeNull();
  expect(record.firstGutterHeight).not.toBeNull();
  expect(
    Math.abs((record.firstLineTop ?? 0) - (record.firstGutterTop ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((record.firstLineHeight ?? 0) - (record.firstGutterHeight ?? 0)),
  ).toBeLessThanOrEqual(1);
  if (options.expectRuntimeStyleNonce) {
    expect(record.codeMirrorRuntimeStyleHasNonce).toBe(true);
  }
};

const setCustomIndicatorDiagnosticsOpen = async (page: Page, open: boolean) => {
  const engineBody = page.locator(".custom-indicator-engine-body");
  const expectedState = open ? "true" : "false";
  if (
    (await engineBody.getAttribute("data-diagnostics-open")) !== expectedState
  ) {
    await page.locator(".custom-indicator-diagnostics-toggle").click();
    await expect(engineBody).toHaveAttribute(
      "data-diagnostics-open",
      expectedState,
    );
    await waitForPreviewAuditIdle(page);
  }
};

for (const locale of locales) {
  for (const pageName of pages) {
    for (const theme of themes) {
      for (const viewport of viewports) {
        test(`workspace preview ${pageName} has no critical overflow in ${locale} with ${theme} theme at ${viewport.name}`, async ({
          page,
        }) => {
          const i18nFallbackMessages = collectI18nFallbackMessages(page);
          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height,
          });
          await page.goto(
            `/i18n-pages.html?page=${encodeURIComponent(pageName)}&locale=${encodeURIComponent(locale)}&theme=${encodeURIComponent(theme)}`,
          );
          await page.waitForFunction(() => {
            const target = window as typeof window & {
              __ZINUTO_I18N_AUDIT__?: unknown;
            };
            return (
              Boolean(target.__ZINUTO_I18N_AUDIT__) &&
              document.querySelectorAll("[data-i18n-critical='true']").length >
                0
            );
          });
          await waitForPreviewAuditIdle(page);

          const audit = await page.evaluate((previewTheme) => {
            const criticalNodeCount = document.querySelectorAll(
              "[data-i18n-critical='true']",
            ).length;
            const bridge = (
              window as typeof window & {
                __ZINUTO_I18N_AUDIT__?: {
                  collectDesktopLayoutRecords: () => {
                    buttonFitRecords: Array<unknown>;
                    containerInlineOverflowRecords: Array<unknown>;
                    overlapRecords: Array<unknown>;
                  };
                  collectContrastRecords: () => Array<unknown>;
                  collectOverflowRecords: () => Array<unknown>;
                };
              }
            ).__ZINUTO_I18N_AUDIT__;

            return {
              contrastRecords:
                previewTheme === "light"
                  ? (bridge?.collectContrastRecords() ?? [])
                  : [],
              criticalNodeCount,
              desktopLayoutRecords: bridge?.collectDesktopLayoutRecords() ?? {
                buttonFitRecords: [],
                containerInlineOverflowRecords: [],
                overlapRecords: [],
              },
              overflowRecords: bridge?.collectOverflowRecords() ?? [],
            };
          }, theme);

          expect(audit.criticalNodeCount).toBeGreaterThan(0);
          expect(audit.overflowRecords).toEqual([]);
          expect(audit.desktopLayoutRecords.buttonFitRecords).toEqual([]);
          expect(
            audit.desktopLayoutRecords.containerInlineOverflowRecords,
          ).toEqual([]);
          expect(audit.desktopLayoutRecords.overlapRecords).toEqual([]);
          expect(audit.contrastRecords).toEqual([]);

          if (workspaceFrameAuditPages.has(pageName)) {
            const frameAudit = await page.evaluate(() => {
              const bridge = (
                window as typeof window & {
                  __ZINUTO_WORKSPACE_FRAME_AUDIT__?: {
                    collectRecords: () => Array<{
                      fit: string | null;
                      frameInlineStartDelta: number | null;
                      frameInlineEndDelta: number | null;
                      frameWidthDelta: number | null;
                      frameBottomDelta: number | null;
                      dividerTopDelta: number | null;
                      dividerBottomDelta: number | null;
                      duplicateShellBorders: number;
                      bodyHasOverflow: boolean;
                      bodyHasInlineOverflow: boolean;
                    }>;
                    collectShellRecords: () => Array<{
                      shellInlineStartDelta: number | null;
                      shellInlineEndDelta: number | null;
                      shellWidthDelta: number | null;
                      bodyHasInlineOverflow: boolean;
                    }>;
                  };
                }
              ).__ZINUTO_WORKSPACE_FRAME_AUDIT__;
              return bridge?.collectRecords() ?? [];
            });

            expect(frameAudit).toHaveLength(1);

            const [frameRecord] = frameAudit;
            expect(frameRecord?.frameInlineStartDelta).not.toBeNull();
            expect(
              frameRecord?.frameInlineStartDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(frameRecord?.frameInlineEndDelta).not.toBeNull();
            expect(
              frameRecord?.frameInlineEndDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(frameRecord?.frameWidthDelta).not.toBeNull();
            expect(
              frameRecord?.frameWidthDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(frameRecord?.frameBottomDelta).not.toBeNull();
            expect(
              frameRecord?.frameBottomDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(
              frameRecord?.duplicateShellBorders ?? Number.POSITIVE_INFINITY,
            ).toBe(0);
            expect(frameRecord?.bodyHasOverflow ?? true).toBe(false);
            expect(frameRecord?.bodyHasInlineOverflow ?? true).toBe(false);

            if (splitDividerAuditPages.has(pageName)) {
              if (
                frameRecord?.dividerTopDelta !== null &&
                frameRecord?.dividerTopDelta !== undefined &&
                frameRecord?.dividerBottomDelta !== null &&
                frameRecord?.dividerBottomDelta !== undefined
              ) {
                expect(frameRecord.dividerTopDelta).toBeLessThanOrEqual(1);
                expect(frameRecord.dividerBottomDelta).toBeLessThanOrEqual(1);
              }
            }
          }

          if (workspaceShellAuditPages.has(pageName)) {
            const shellAudit = await page.evaluate(() => {
              const bridge = (
                window as typeof window & {
                  __ZINUTO_WORKSPACE_FRAME_AUDIT__?: {
                    collectShellRecords: () => Array<{
                      shellInlineStartDelta: number | null;
                      shellInlineEndDelta: number | null;
                      shellWidthDelta: number | null;
                      bodyHasInlineOverflow: boolean;
                    }>;
                  };
                }
              ).__ZINUTO_WORKSPACE_FRAME_AUDIT__;
              return bridge?.collectShellRecords() ?? [];
            });

            expect(shellAudit).toHaveLength(1);

            const [shellRecord] = shellAudit;
            expect(shellRecord?.shellInlineStartDelta).not.toBeNull();
            expect(
              shellRecord?.shellInlineStartDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(shellRecord?.shellInlineEndDelta).not.toBeNull();
            expect(
              shellRecord?.shellInlineEndDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(shellRecord?.shellWidthDelta).not.toBeNull();
            expect(
              shellRecord?.shellWidthDelta ?? Number.POSITIVE_INFINITY,
            ).toBeLessThanOrEqual(1);
            expect(shellRecord?.bodyHasInlineOverflow ?? true).toBe(false);
          }

          if (pageName === "CUSTOM_INDICATOR") {
            await setCustomIndicatorDiagnosticsOpen(page, false);
            expectCustomIndicatorEditorGeometry(
              await collectCustomIndicatorEditorGeometry(page),
              "closed",
            );

            await setCustomIndicatorDiagnosticsOpen(page, true);
            expectCustomIndicatorEditorGeometry(
              await collectCustomIndicatorEditorGeometry(page),
              "open",
            );
          }

          if (pageName === "SETTINGS_DATA_TRANSFER") {
            const dataTransferLayout = await collectDataTransferViewport(page);
            expect(
              dataTransferLayout.contentFitsViewport ||
                dataTransferLayout.hasVerticalOverflow,
            ).toBe(true);
            expect(dataTransferLayout.overflowY).toBe("auto");

            const transferCards = page.locator(".portable-transfer-card");
            await expect(transferCards).toHaveCount(2);

            await transferCards.nth(0).click();
            await expect(
              page.locator(".data-config-transfer-dialog"),
            ).toBeVisible();
            await expect(
              page.getByText("Portable Archive Long Named Source 1").first(),
            ).toBeVisible();

            const exportDialogLayout = await page.evaluate(() => {
              const dialog = document.querySelector<HTMLElement>(
                ".data-config-transfer-dialog",
              );
              const body = dialog?.querySelector<HTMLElement>(
                ".data-config-transfer-dialog-body",
              );
              const footer = dialog?.querySelector<HTMLElement>(
                ".ui-standard-modal-actions",
              );
              const footerRect = footer?.getBoundingClientRect();

              return {
                bodyHasInlineOverflow: body
                  ? body.scrollWidth - body.clientWidth > 1
                  : true,
                bodyHasVerticalOverflow: body
                  ? body.scrollHeight - body.clientHeight > 1
                  : false,
                footerVisible: footerRect
                  ? footerRect.top >= 0 &&
                    footerRect.bottom <= window.innerHeight + 1
                  : false,
              };
            });
            expect(exportDialogLayout.bodyHasVerticalOverflow).toBe(true);
            expect(exportDialogLayout.bodyHasInlineOverflow).toBe(false);
            expect(exportDialogLayout.footerVisible).toBe(true);

            const exportDialogAudit = await page.evaluate(() => {
              const bridge = (
                window as typeof window & {
                  __ZINUTO_I18N_AUDIT__?: {
                    collectOverflowRecords: () => Array<unknown>;
                  };
                }
              ).__ZINUTO_I18N_AUDIT__;
              return bridge?.collectOverflowRecords() ?? [];
            });
            expect(exportDialogAudit).toEqual([]);

            await page.keyboard.press("Escape");

            await transferCards.nth(1).click();
            await expect(
              page.locator(".data-config-transfer-dialog"),
            ).toBeVisible();

            const importDialogAudit = await page.evaluate(() => {
              const bridge = (
                window as typeof window & {
                  __ZINUTO_I18N_AUDIT__?: {
                    collectOverflowRecords: () => Array<unknown>;
                  };
                }
              ).__ZINUTO_I18N_AUDIT__;
              return bridge?.collectOverflowRecords() ?? [];
            });
            expect(importDialogAudit).toEqual([]);

            await page.keyboard.press("Escape");
          }

          expect(i18nFallbackMessages).toEqual([]);
        });
      }
    }
  }
}

test("data transfer remains reachable by scrolling at the minimum desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  for (const locale of locales) {
    await page.goto(
      `/i18n-pages.html?page=SETTINGS_DATA_TRANSFER&locale=${encodeURIComponent(locale)}&theme=dark`,
    );
    await page.waitForSelector(
      '.settings-redesign-scroll[data-active-tab="DATA_TRANSFER"]',
    );
    await waitForPreviewAuditIdle(page);

    const layout = await collectDataTransferViewport(page);
    expect(layout.hasVerticalOverflow, locale).toBe(true);
    expect(layout.overflowY, locale).toBe("auto");
  }
});

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`desktop help floating preview fits ${locale} with ${theme} theme at ${viewport.name}`, async ({
        page,
      }) => {
        const i18nFallbackMessages = collectI18nFallbackMessages(page);
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(
          `/i18n-pages.html?page=COMMAND_CENTER&locale=${encodeURIComponent(locale)}&theme=${encodeURIComponent(theme)}&help=floating`,
        );
        await page.locator(".desktop-help-floating-panel").waitFor({
          state: "visible",
        });
        await waitForPreviewAuditIdle(page);

        const record = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(
            ".desktop-help-floating-panel",
          );
          const search = document.querySelector<HTMLInputElement>(
            ".desktop-help-floating-panel input[type='search']",
          );
          const recommendations = document.querySelectorAll(
            ".desktop-help-floating-panel [data-help-section='recommended'] .desktop-help-article-row",
          );
          if (!panel || !search) {
            return null;
          }
          const panelRect = panel.getBoundingClientRect();
          return {
            bodyScrollWidth: document.body.scrollWidth,
            focused: document.activeElement === search,
            panelBottom: panelRect.bottom,
            panelHeight: panelRect.height,
            panelLeft: panelRect.left,
            panelRight: panelRect.right,
            panelTop: panelRect.top,
            panelWidth: panelRect.width,
            recommendationCount: recommendations.length,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
          };
        });

        expect(record).not.toBeNull();
        expect(record?.focused).toBe(true);
        expect(record?.recommendationCount).toBe(4);
        expect(record?.bodyScrollWidth).toBeLessThanOrEqual(
          record?.viewportWidth ?? 0,
        );
        expect(record?.panelLeft).toBeGreaterThanOrEqual(0);
        expect(record?.panelTop).toBeGreaterThanOrEqual(0);
        expect(record?.panelRight).toBeLessThanOrEqual(
          record?.viewportWidth ?? 0,
        );
        expect(record?.panelBottom).toBeLessThanOrEqual(
          record?.viewportHeight ?? 0,
        );
        expect(record?.panelWidth).toBeLessThanOrEqual(840);
        expect(record?.panelHeight).toBeLessThanOrEqual(744);
        expect(i18nFallbackMessages).toEqual([]);
      });
    }
  }
}

for (const locale of locales) {
  for (const theme of themes) {
    test(`strategy backtest detail preview fits the secondary minimum window in ${locale} with ${theme} theme`, async ({
      page,
    }) => {
      const i18nFallbackMessages = collectI18nFallbackMessages(page);
      await page.setViewportSize({
        width: 1080,
        height: 720,
      });
      await page.goto(
        `/i18n-pages.html?page=STRATEGY_BACKTEST_DETAIL&locale=${encodeURIComponent(locale)}&theme=${encodeURIComponent(theme)}`,
      );
      await page.waitForFunction(() => {
        const target = window as typeof window & {
          __ZINUTO_I18N_AUDIT__?: unknown;
        };
        return (
          Boolean(target.__ZINUTO_I18N_AUDIT__) &&
          Boolean(
            document.querySelector(".strategy-backtest-secondary-layout"),
          ) &&
          document.querySelectorAll("[data-i18n-critical='true']").length > 0
        );
      });
      await waitForPreviewAuditIdle(page);

      const audit = await page.evaluate((previewTheme) => {
        const bridge = (
          window as typeof window & {
            __ZINUTO_I18N_AUDIT__?: {
              collectDesktopLayoutRecords: () => {
                buttonFitRecords: Array<unknown>;
                containerInlineOverflowRecords: Array<unknown>;
                overlapRecords: Array<unknown>;
              };
              collectContrastRecords: () => Array<unknown>;
              collectOverflowRecords: () => Array<unknown>;
            };
          }
        ).__ZINUTO_I18N_AUDIT__;

        return {
          contrastRecords:
            previewTheme === "light"
              ? (bridge?.collectContrastRecords() ?? [])
              : [],
          desktopLayoutRecords: bridge?.collectDesktopLayoutRecords() ?? {
            buttonFitRecords: [],
            containerInlineOverflowRecords: [],
            overlapRecords: [],
          },
          overflowRecords: bridge?.collectOverflowRecords() ?? [],
        };
      }, theme);

      expect(audit.overflowRecords).toEqual([]);
      expect(audit.desktopLayoutRecords.buttonFitRecords).toEqual([]);
      expect(audit.desktopLayoutRecords.containerInlineOverflowRecords).toEqual(
        [],
      );
      expect(audit.desktopLayoutRecords.overlapRecords).toEqual([]);
      expect(audit.contrastRecords).toEqual([]);
      expect(i18nFallbackMessages).toEqual([]);
    });
  }
}

for (const viewport of [
  { name: "secondary-window", width: 980, height: 780 },
  { name: "compact-secondary-window", width: 760, height: 620 },
] as const) {
  test(`DATA acquisition catalog fits the ${viewport.name} viewport`, async ({
    page,
  }) => {
    const i18nFallbackMessages = collectI18nFallbackMessages(page);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(
      "/i18n-pages.html?page=DATA_ACQUISITION&scenario=catalog&locale=zh-CN&theme=dark",
    );
    await expect(page.locator(".market-data-acquisition-dialog")).toBeVisible();
    await expect(
      page.locator(".market-data-acquisition-header h1"),
    ).toHaveCount(1);
    await expect(
      page.locator(".market-data-acquisition-catalog-option").first(),
    ).toBeVisible();
    await waitForPreviewAuditIdle(page);

    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>(
        ".market-data-acquisition-dialog",
      );
      const body = document.querySelector<HTMLElement>(
        ".market-data-acquisition-body",
      );
      const footer = document.querySelector<HTMLElement>(
        ".market-data-acquisition-footer",
      );
      const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".market-data-acquisition-catalog-panel",
        ),
      );
      const firstOptionCopy = document.querySelector<HTMLElement>(
        ".market-data-acquisition-catalog-option > span",
      );
      const firstOptionLabels = firstOptionCopy
        ? Array.from(firstOptionCopy.querySelectorAll<HTMLElement>("strong, small"))
        : [];
      const dialogRect = dialog?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const panelRects = panels.map((panel) => panel.getBoundingClientRect());
      return {
        bodyBottom: bodyRect?.bottom ?? Number.POSITIVE_INFINITY,
        bodyHasInlineOverflow: body
          ? body.scrollWidth > body.clientWidth + 1
          : true,
        dialogLeft: dialogRect?.left ?? -1,
        dialogRight: dialogRect?.right ?? Number.POSITIVE_INFINITY,
        footerBottom: footerRect?.bottom ?? Number.POSITIVE_INFINITY,
        panelRects: panelRects.map((rect) => ({
          bottom: rect.bottom,
          left: rect.left,
          top: rect.top,
        })),
        firstOptionLabelTops: firstOptionLabels.map(
          (element) => element.getBoundingClientRect().top,
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry.bodyHasInlineOverflow).toBe(false);
    expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.dialogRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.panelRects).toHaveLength(2);
    expect(geometry.bodyBottom - (geometry.panelRects[0]?.bottom ?? 0)).toBeLessThanOrEqual(
      22,
    );
    expect(geometry.firstOptionLabelTops).toHaveLength(2);
    expect(
      Math.abs(
        (geometry.firstOptionLabelTops[0] ?? 0) -
          (geometry.firstOptionLabelTops[1] ?? Number.POSITIVE_INFINITY),
      ),
    ).toBeLessThanOrEqual(1);
    if (viewport.width > 640) {
      expect(geometry.panelRects[1]?.left).toBeGreaterThan(
        geometry.panelRects[0]?.left ?? 0,
      );
    } else {
      expect(geometry.panelRects[1]?.top).toBeGreaterThanOrEqual(
        geometry.panelRects[0]?.bottom ?? 0,
      );
    }
    expect(i18nFallbackMessages).toEqual([]);
  });
}

test("DATA acquisition paging stays below the scrollable candidates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 780 });
  await page.goto(
    "/i18n-pages.html?page=DATA_ACQUISITION&scenario=catalog-paged&locale=zh-CN&theme=dark",
  );
  await expect(
    page.locator(".market-data-acquisition-catalog-load-more"),
  ).toBeVisible();

  const pager = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(
      ".market-data-acquisition-catalog-list",
    );
    const loadMore = document.querySelector<HTMLElement>(
      ".market-data-acquisition-catalog-load-more",
    );
    const panel = loadMore?.closest<HTMLElement>(
      ".market-data-acquisition-catalog-panel",
    );
    const listRect = list?.getBoundingClientRect();
    const loadMoreRect = loadMore?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      listBottom: listRect?.bottom ?? Number.POSITIVE_INFINITY,
      loadMoreBottom: loadMoreRect?.bottom ?? Number.POSITIVE_INFINITY,
      loadMorePosition: loadMore ? getComputedStyle(loadMore).position : "",
      loadMoreTop: loadMoreRect?.top ?? -1,
      panelBottom: panelRect?.bottom ?? -1,
    };
  });

  expect(pager.loadMorePosition).not.toBe("sticky");
  expect(pager.loadMoreTop).toBeGreaterThanOrEqual(pager.listBottom - 1);
  expect(pager.loadMoreBottom).toBeLessThanOrEqual(pager.panelBottom + 1);
});

for (const scenario of ["saved", "failed"] as const) {
  test(`DATA acquisition ${scenario} state has a clear terminal action boundary`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 780 });
    await page.goto(
      `/i18n-pages.html?page=DATA_ACQUISITION&scenario=${scenario}&locale=zh-CN&theme=light`,
    );
    await expect(page.locator(".market-data-acquisition-dialog")).toBeVisible();
    await expect(
      page.locator(
        scenario === "saved"
          ? ".market-data-acquisition-result"
          : ".market-data-acquisition-state-page[data-tone='danger'], .market-data-acquisition-state-page",
      ),
    ).toBeVisible();
    await expect(
      page.locator(".market-data-acquisition-footer [data-slot='button']"),
    ).toHaveCount(3);
  });
}

test("settings language control follows the standard select width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(
    "/i18n-pages.html?page=SETTINGS_GENERAL&locale=zh-CN&theme=dark",
  );
  await waitForPreviewAuditIdle(page);
  await expect(
    page.locator('.settings-language-control > .settings-language-select'),
  ).toBeVisible();
  await expect(page.locator(".settings-language-select")).toHaveCount(2);

  const selectWidths = await page.evaluate(() => {
    const languageSelect = document.querySelector<HTMLElement>(
      '.settings-language-control > .settings-language-select',
    );
    const closeActionSelect = Array.from(
      document.querySelectorAll<HTMLElement>(".settings-language-select"),
    ).find((element) => element !== languageSelect);
    return {
      closeActionWidth: closeActionSelect?.getBoundingClientRect().width ?? 0,
      languageWidth: languageSelect?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(selectWidths.languageWidth).toBeGreaterThan(0);
  expect(selectWidths.closeActionWidth).toBeGreaterThan(0);
  expect(selectWidths.languageWidth).toBeCloseTo(
    selectWidths.closeActionWidth,
    0,
  );
});

test("DATA management preview covers empty, populated, precheck, and long paths", async ({
  page,
}) => {
  const i18nFallbackMessages = collectI18nFallbackMessages(page);
  await page.setViewportSize({
    width: 1440,
    height: 960,
  });

  const openDataPreview = async (scenario?: string) => {
    const scenarioQuery = scenario
      ? `&scenario=${encodeURIComponent(scenario)}`
      : "";
    await page.goto(
      `/i18n-pages.html?page=DATA&locale=zh-CN&theme=dark${scenarioQuery}`,
    );
    await page.waitForFunction(() => {
      const target = window as typeof window & {
        __ZINUTO_I18N_AUDIT__?: unknown;
      };
      return (
        Boolean(target.__ZINUTO_I18N_AUDIT__) &&
        Boolean(document.querySelector(".data-config-page-toolbar"))
      );
    });
    await waitForPreviewAuditIdle(page);
  };

  await openDataPreview("empty");
  await expect(page.locator(".data-config-add-decision")).toBeVisible();
  await expect(
    page.locator(".data-config-add-decision-options > [data-slot='button']"),
  ).toHaveCount(2);
  await expect(page.locator(".data-config-source-group-system")).toHaveClass(
    /is-expanded/u,
  );
  await expect(page.locator(".data-config-page-toolbar-actions")).toHaveCount(
    0,
  );

  await openDataPreview("populated");
  await expect(page.locator(".data-config-add-decision")).toHaveCount(0);
  expect(await page.locator(".data-config-source-row").count()).toBeGreaterThan(
    1,
  );
  await expect(page.locator(".data-config-source-group-system")).toHaveClass(
    /is-collapsed/u,
  );
  await expect(page.locator(".data-config-page-toolbar-actions")).toBeVisible();
  const populatedReadyRow = page
    .locator(".data-config-source-group-imported .data-config-source-row")
    .filter({ hasText: "A 股日线自导入" });
  await expect(populatedReadyRow).toHaveAttribute(
    "data-card-navigable",
    "true",
  );
  await expect(populatedReadyRow).toHaveAttribute("tabindex", "0");
  await populatedReadyRow.click();
  await populatedReadyRow.focus();
  await page.keyboard.press("Enter");
  // The detail view opens in a native secondary window. The browser harness
  // intentionally has no Tauri bridge, so this verifies both the card click
  // and keyboard navigation surfaces without asserting an in-page drawer.
  await expect(populatedReadyRow).toBeVisible();

  await openDataPreview("technical-name-collision");
  const collisionRows = page.locator(
    ".data-config-source-group-imported .data-config-source-row",
  );
  await expect(collisionRows).toHaveCount(2);
  await expect(
    collisionRows.filter({ hasText: "BTCUSDT" }),
  ).toContainText("BTC_ETH/1d");
  await expect(
    collisionRows.filter({ hasText: "SOLUSDT" }),
  ).toContainText("SOL_BNB/1d");
  const collisionAudit = await page.evaluate(() => ({
    coverageBands: document.querySelectorAll(
      ".data-config-source-card-coverage-band",
    ).length,
    coverageFacts: document.querySelectorAll(
      ".data-config-source-card-coverage-fact",
    ).length,
    dragHandles: document.querySelectorAll(
      ".data-config-source-card-drag-handle",
    ).length,
  }));
  expect(collisionAudit.coverageBands).toBe(2);
  expect(collisionAudit.coverageFacts).toBe(8);
  expect(collisionAudit.dragHandles).toBeGreaterThan(0);

  await openDataPreview("precheck");
  await expect(page.locator(".data-config-task-section")).toHaveCount(0);
  await expect(page.locator(".data-config-precheck-inline")).toBeVisible();

  const precheckAudit = await page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(
      ".data-config-import-drop-progress .data-config-import-preview-track",
    );
    const progress = document.querySelector<HTMLElement>(
      ".data-config-import-drop-progress",
    );
    const trackRect = track?.getBoundingClientRect();
    return {
      progressIsIndeterminate:
        progress?.classList.contains("is-indeterminate") ?? false,
      trackHeight: trackRect?.height ?? 0,
      trackWidth: trackRect?.width ?? 0,
    };
  });
  expect(precheckAudit.progressIsIndeterminate).toBe(true);
  expect(precheckAudit.trackHeight).toBeGreaterThan(0);
  expect(precheckAudit.trackWidth).toBeGreaterThan(0);

  await openDataPreview("empty-precheck");
  await expect(page.locator(".data-config-add-decision")).toBeVisible();
  await expect(page.locator(".data-config-precheck-inline")).toHaveCount(1);
  await expect(
    page.locator(".data-config-precheck-inline .data-config-import-drop-progress"),
  ).toHaveCount(1);
  await expect(
    page.locator(
      ".data-config-precheck-inline .data-config-import-drop-hint",
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(".data-config-add-choice-local .data-config-import-drop-progress"),
  ).toHaveCount(0);
  await expect(page.locator(".data-config-add-choice-local")).toBeDisabled();
  await expect(
    page.locator(".data-config-add-choice-local .data-config-add-choice-copy"),
  ).toBeVisible();

  await openDataPreview("existing-import");
  await expect(page.locator(".data-config-task-section")).toHaveCount(0);
  await expect(
    page.locator(
      ".data-config-source-group-imported .data-config-source-row",
    ),
  ).toHaveCount(2);
  await expect(
    page
      .locator(".data-config-source-group-imported .data-config-source-row")
      .filter({ hasText: "A 股日线自导入" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".data-config-source-group-imported .data-config-source-row")
      .filter({ hasText: "A 股日线自导入" })
      .locator(".data-task-progress-rail"),
  ).toHaveCount(1);
  const existingImportRowAudit = await page.evaluate(() => {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".data-config-source-group-imported .data-config-source-row",
      ),
    ).find((item) => item.textContent?.includes("A 股日线自导入"));
    return {
      height: row?.getBoundingClientRect().height ?? 0,
      coverageFactCount:
        row?.querySelectorAll(".data-config-source-card-coverage-fact").length ??
        0,
      hasCoverageBand: Boolean(
        row?.querySelector(".data-config-source-card-coverage-band"),
      ),
      hasInlineProgress: Boolean(row?.querySelector(".data-task-progress-rail")),
    };
  });
  expect(existingImportRowAudit.height).toBeGreaterThanOrEqual(156);
  expect(existingImportRowAudit.coverageFactCount).toBe(4);
  expect(existingImportRowAudit.hasCoverageBand).toBe(true);
  expect(existingImportRowAudit.hasInlineProgress).toBe(true);

  await openDataPreview("existing-import-transition");
  const transitionStartAudit = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".data-config-source-group-imported .data-config-source-row",
      ),
    );
    const activeRow = rows.find((item) =>
      item.textContent?.includes("A 股日线自导入"),
    );
    const stableRow = rows.find((item) =>
      item.textContent?.includes("迁移后待重绑"),
    );
    const target = window as typeof window & {
      __zinutoTransitionActiveRow?: HTMLElement;
    };
    target.__zinutoTransitionActiveRow = activeRow;
    return {
      activeTop: activeRow?.getBoundingClientRect().top ?? 0,
      stableTop: stableRow?.getBoundingClientRect().top ?? 0,
    };
  });
  await expect(
    page
      .locator(".data-config-source-group-imported .data-config-source-row")
      .filter({ hasText: "A 股日线自导入" }),
  ).toContainText("422 / 620");
  await page.waitForTimeout(420);
  const transitionCompleteAudit = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".data-config-source-group-imported .data-config-source-row",
      ),
    );
    const activeRow = rows.find((item) =>
      item.textContent?.includes("A 股日线自导入"),
    );
    const stableRow = rows.find((item) =>
      item.textContent?.includes("迁移后待重绑"),
    );
    const target = window as typeof window & {
      __zinutoTransitionActiveRow?: HTMLElement;
    };
    return {
      activeRowIsStable: activeRow === target.__zinutoTransitionActiveRow,
      activeTop: activeRow?.getBoundingClientRect().top ?? 0,
      stableTop: stableRow?.getBoundingClientRect().top ?? 0,
      progressCount: activeRow?.querySelectorAll(".data-task-progress-rail").length ?? 0,
      hasCompletedStatus: activeRow?.textContent?.includes("已启用") ?? false,
    };
  });
  expect(transitionCompleteAudit.activeRowIsStable).toBe(true);
  expect(transitionCompleteAudit.activeTop).toBeCloseTo(
    transitionStartAudit.activeTop,
    1,
  );
  expect(transitionCompleteAudit.stableTop).toBeCloseTo(
    transitionStartAudit.stableTop,
    1,
  );
  expect(transitionCompleteAudit.progressCount).toBe(0);
  expect(transitionCompleteAudit.hasCompletedStatus).toBe(true);

  await openDataPreview("long-import");
  const cardAudit = await page.evaluate(() => {
    type RectRecord = {
      bottom: number;
      height: number;
      left: number;
      right: number;
      top: number;
      width: number;
    };
    const rectFor = (selector: string): RectRecord | null => {
      const rect = document
        .querySelector<HTMLElement>(selector)
        ?.getBoundingClientRect();
      return rect
        ? {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          }
        : null;
    };
    const overlaps = (
      first: RectRecord | null,
      second: RectRecord | null,
    ): boolean =>
      Boolean(
        first &&
        second &&
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top,
      );

    const card = rectFor(".data-asset-card-import");
    const summary = rectFor(".data-asset-card-import .data-asset-card-summary");
    const foot = rectFor(
      ".data-asset-card-import .data-asset-card-foot-import",
    );
    const progress = rectFor(
      ".data-asset-card-import .data-asset-import-progress",
    );
    const actions = rectFor(".data-asset-card-import .data-asset-card-actions");
    const track = rectFor(
      ".data-asset-card-import .data-asset-import-progress-track",
    );
    const sourceLine = rectFor(
      ".data-asset-card-import .data-asset-card-meta-line-source",
    );

    return {
      actionsWithinCard:
        Boolean(card && actions) &&
        (actions?.right ?? 0) <= (card?.right ?? 0) + 1 &&
        (actions?.bottom ?? 0) <= (card?.bottom ?? 0) + 1,
      footWithinCard:
        Boolean(card && foot) &&
        (foot?.right ?? 0) <= (card?.right ?? 0) + 1 &&
        (foot?.bottom ?? 0) <= (card?.bottom ?? 0) + 1,
      progressOverlapsActions: overlaps(progress, actions),
      sourceOverlapsFoot: overlaps(sourceLine, foot),
      summaryOverlapsFoot: overlaps(summary, foot),
      trackWidth: track?.width ?? 0,
    };
  });

  expect(cardAudit.footWithinCard).toBe(true);
  expect(cardAudit.actionsWithinCard).toBe(true);
  expect(cardAudit.progressOverlapsActions).toBe(false);
  expect(cardAudit.sourceOverlapsFoot).toBe(false);
  expect(cardAudit.summaryOverlapsFoot).toBe(false);
  expect(cardAudit.trackWidth).toBeGreaterThan(0);
  expect(i18nFallbackMessages).toEqual([]);
});

test("workspace preview CUSTOM_INDICATOR CodeMirror works with CSP nonce", async ({
  page,
}) => {
  const i18nFallbackMessages = collectI18nFallbackMessages(page);
  await page.setViewportSize({
    width: 1280,
    height: 900,
  });
  await page.goto(
    "/i18n-pages.html?page=CUSTOM_INDICATOR&locale=zh-CN&theme=dark&cspNonce=1",
  );
  await page.waitForFunction(() => {
    const target = window as typeof window & {
      __ZINUTO_I18N_AUDIT__?: unknown;
    };
    return (
      Boolean(target.__ZINUTO_I18N_AUDIT__) &&
      document.querySelectorAll("[data-i18n-critical='true']").length > 0
    );
  });
  await waitForPreviewAuditIdle(page);

  await setCustomIndicatorDiagnosticsOpen(page, false);
  expectCustomIndicatorEditorGeometry(
    await collectCustomIndicatorEditorGeometry(page),
    "closed",
    { expectRuntimeStyleNonce: true },
  );

  await setCustomIndicatorDiagnosticsOpen(page, true);
  expectCustomIndicatorEditorGeometry(
    await collectCustomIndicatorEditorGeometry(page),
    "open",
    { expectRuntimeStyleNonce: true },
  );
  expect(i18nFallbackMessages).toEqual([]);
});
