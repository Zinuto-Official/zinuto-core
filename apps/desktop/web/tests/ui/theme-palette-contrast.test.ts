// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolvePriceTextColors } from "../../src/ui/theme/visual/priceColorTokens";
import { buildGlobalVisualCssVariables } from "../../src/ui/theme/visualColors";

const MINIMUM_NORMAL_TEXT_CONTRAST = 4.5;

const resolveRelativeLuminance = (hexColor: string): number => {
  assert.match(hexColor, /^#[0-9a-f]{6}$/i, `Expected a six-digit theme color, received ${hexColor}`);

  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

const resolveContrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = resolveRelativeLuminance(foreground);
  const backgroundLuminance = resolveRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const assertReadable = (
  themeMode: "light" | "dark",
  role: string,
  foreground: string,
  background: string,
): void => {
  const contrastRatio = resolveContrastRatio(foreground, background);
  assert.ok(
    contrastRatio >= MINIMUM_NORMAL_TEXT_CONTRAST,
    `${themeMode} ${role} contrast ${contrastRatio.toFixed(2)} is below ${MINIMUM_NORMAL_TEXT_CONTRAST}:1 (${foreground} on ${background})`,
  );
};

for (const themeMode of ["light", "dark"] as const) {
  test(`${themeMode} theme keeps core text and primary actions readable`, () => {
    const themeVariables = buildGlobalVisualCssVariables(
      themeMode,
      "GREEN_UP_RED_DOWN",
      "ACCESSIBLE",
    );
    const contentBackgrounds = [
      ["canvas", themeVariables["--surface-s1"]],
      ["card", themeVariables["--surface-s2"]],
      ["hover", themeVariables["--surface-s3"]],
      ["shell", themeVariables["--surface-s5"]],
      ["soft panel", themeVariables["--surface-s6"]],
      ["selected", themeVariables["--action-a6"]],
    ] as const;

    for (const [surfaceRole, background] of contentBackgrounds) {
      for (const [role, token] of [
        ["primary text", "--text-t1"],
        ["secondary text", "--text-t2"],
        ["muted text", "--text-t5"],
      ] as const) {
        assertReadable(themeMode, `${role} on ${surfaceRole}`, themeVariables[token], background);
      }
    }

    const primaryButtonText = themeVariables["--visual-accent-contrast"];
    assertReadable(
      themeMode,
      "primary button",
      primaryButtonText,
      themeVariables["--visual-accent-base"],
    );
    assertReadable(
      themeMode,
      "primary button hover",
      primaryButtonText,
      themeVariables["--visual-accent-hover"],
    );
    assertReadable(
      themeMode,
      "danger button",
      primaryButtonText,
      themeVariables["--visual-danger-solid"],
    );
    assertReadable(
      themeMode,
      "danger button hover",
      primaryButtonText,
      themeVariables["--visual-danger-solid-hover"],
    );

    assert.notEqual(
      themeVariables["--visual-accent-base"],
      themeVariables["--visual-link-accent"],
      `${themeMode} solid actions and link accents must remain separate semantic tokens`,
    );
    for (const [surfaceRole, background] of contentBackgrounds.slice(1)) {
      assertReadable(
        themeMode,
        `link accent on ${surfaceRole}`,
        themeVariables["--visual-link-accent"],
        background,
      );
    }
  });

  test(`${themeMode} theme keeps system statuses and recognition accents readable`, () => {
    const themeVariables = buildGlobalVisualCssVariables(
      themeMode,
      "GREEN_UP_RED_DOWN",
      "ACCESSIBLE",
    );

    for (const [role, foregroundToken, backgroundToken] of [
      ["success", "--success", "--success-soft"],
      ["warning", "--warning", "--warning-soft"],
      ["danger", "--danger", "--danger-soft"],
      ["info", "--info", "--info-soft"],
    ] as const) {
      assertReadable(
        themeMode,
        `${role} status on its soft surface`,
        themeVariables[foregroundToken],
        themeVariables[backgroundToken],
      );
      assertReadable(
        themeMode,
        `${role} status on card`,
        themeVariables[foregroundToken],
        themeVariables["--surface-s2"],
      );
    }


    const alternateVariables = buildGlobalVisualCssVariables(
      themeMode,
      "RED_UP_GREEN_DOWN",
      "CRYPTO",
    );
    for (const token of ["--success", "--warning", "--danger", "--info"] as const) {
      assert.equal(
        alternateVariables[token],
        themeVariables[token],
        `${themeMode} ${token} must not change with financial color preferences`,
      );
    }
    assert.notEqual(
      themeVariables["--success"],
      themeVariables["--trade-buy-color"],
      `${themeMode} system success must not reuse the trade-buy color`,
    );
  });

  test(`${themeMode} theme keeps both price directions readable and mode-aware`, () => {
    const backgrounds = ["--surface-s2", "--surface-s3", "--surface-s6"] as const;

    for (const priceColorMode of ["GREEN_UP_RED_DOWN", "RED_UP_GREEN_DOWN"] as const) {
      const themeVariables = buildGlobalVisualCssVariables(
        themeMode,
        priceColorMode,
        "ACCESSIBLE",
      );
      const expectedColors = resolvePriceTextColors(priceColorMode, themeMode);
      assert.equal(themeVariables["--price-up-color"], expectedColors.up);
      assert.equal(themeVariables["--price-down-color"], expectedColors.down);

      for (const backgroundToken of backgrounds) {
        assertReadable(
          themeMode,
          `${priceColorMode} up price on ${backgroundToken}`,
          themeVariables["--price-up-color"],
          themeVariables[backgroundToken],
        );
        assertReadable(
          themeMode,
          `${priceColorMode} down price on ${backgroundToken}`,
          themeVariables["--price-down-color"],
          themeVariables[backgroundToken],
        );
      }
    }

    const greenUp = buildGlobalVisualCssVariables(
      themeMode,
      "GREEN_UP_RED_DOWN",
      "ACCESSIBLE",
    );
    const redUp = buildGlobalVisualCssVariables(
      themeMode,
      "RED_UP_GREEN_DOWN",
      "ACCESSIBLE",
    );
    assert.equal(greenUp["--price-up-color"], redUp["--price-down-color"]);
    assert.equal(greenUp["--price-down-color"], redUp["--price-up-color"]);
  });
}
