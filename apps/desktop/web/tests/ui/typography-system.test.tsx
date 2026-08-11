// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasFont,
  buildTypographyCssVariables,
  resolveTypographySystem,
  setGlobalTypographyContext,
} from "../../src/frontend-kernel/typography";

test("typography reference sizes combine base scale, font stack scale, and preset scale", () => {
  const standardEnglish = resolveTypographySystem({
    language: "en",
    fontSizePreset: "STANDARD",
  });
  const smallChinese = resolveTypographySystem({
    language: "zh-CN",
    fontSizePreset: "SMALL",
  });
  const largeKorean = resolveTypographySystem({
    language: "ko",
    fontSizePreset: "LARGE",
  });
  const standardJapanese = resolveTypographySystem({
    language: "ja",
    fontSizePreset: "STANDARD",
  });
  const standardSpanish = resolveTypographySystem({
    language: "es",
    fontSizePreset: "STANDARD",
  });

  assert.equal(standardEnglish.referenceSizesPx.r1, 14.7);
  assert.equal(standardEnglish.referenceSizesPx.r8, 34.3);
  assert.equal(smallChinese.referenceSizesPx.r3, 16.229);
  assert.equal(largeKorean.referenceSizesPx.r2, 16.762);
  assert.equal(standardJapanese.referenceSizesPx.r8, 33.6);
  assert.equal(standardSpanish.referenceSizesPx.r5, 23.52);
});

test("typography CSS variables expose font scale, preset scale, and fit scale", () => {
  const englishLarge = buildTypographyCssVariables({
    language: "en",
    fontSizePreset: "LARGE",
  });
  const japaneseStandard = buildTypographyCssVariables({
    language: "ja",
    fontSizePreset: "STANDARD",
  });

  assert.equal(englishLarge["--ty-scale-font"], "0.98");
  assert.equal(englishLarge["--ty-scale-preset"], "1.08");
  assert.equal(englishLarge["--ty-fit-level-1"], "0.92");
  assert.equal(englishLarge["--ty-fit-level-2"], "0.84");
  assert.equal(englishLarge["--ty-r2"], "16.934px");
  assert.equal(englishLarge["--ty-scale-language"], undefined);
  assert.equal(englishLarge["--ty-scale-viewport"], undefined);
  assert.equal(englishLarge["--ty-step"], undefined);

  assert.equal(japaneseStandard["--ty-scale-font"], "0.96");
  assert.equal(japaneseStandard["--ty-fit-level-1"], "0.94");
  assert.equal(japaneseStandard["--ty-fit-level-2"], "0.88");
  assert.equal(japaneseStandard["--ty-r8"], "33.6px");
});

test("canvas typography reads the same scaled reference sizes as DOM typography", () => {
  setGlobalTypographyContext({
    language: "ja",
    fontSizePreset: "LARGE",
  });

  assert.match(
    buildCanvasFont({ weight: 700, size: "r2" }),
    /^700 16\.589px 'Hiragino Sans'/,
  );
  setGlobalTypographyContext({
    language: "en",
    fontSizePreset: "STANDARD",
  });
});
