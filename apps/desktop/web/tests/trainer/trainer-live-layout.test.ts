// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readStyleLayers = (baseName: string, count: number): string =>
  Array.from({ length: count }, (_, index) =>
    readFileSync(
      new URL(
        `../../src/styles/layout/workspace-overrides/${baseName}.layer-0${index + 1}.css`,
        import.meta.url,
      ),
      "utf8",
    ),
  ).join("\n");
const trainerGeometryCss = readStyleLayers("05-global-workspace-geometry", 2);
const trainerShellCss = readStyleLayers("03-trainer-layout-refresh-shell", 2);

const assertTrainerMarketGridLayout = (css: string) => {
  assert.match(
    css,
    /\.desktop-main\.is-trainer[\s\S]*\.left-panel\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.desktop-main\.is-trainer\s+\.trainer-market-layout\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.desktop-main\.is-trainer\s+\.trainer-market-layout-chart\s*\{[\s\S]*grid-row:\s*1;[\s\S]*align-self:\s*stretch;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.desktop-main\.is-trainer\s+\.trainer-market-layout-chart\s*>\s*\.trainer-market-layout-chart-shell\s*\{[\s\S]*overflow:\s*hidden;/,
  );
};

test("trainer live chart and trade log keep dedicated grid rows", () => {
  assertTrainerMarketGridLayout(trainerShellCss);
  assertTrainerMarketGridLayout(trainerGeometryCss);
  assert.match(
    trainerGeometryCss,
    /\.desktop-main\.is-trainer\s+\.trade-log\.trade-log-strip\s*\{[\s\S]*grid-row:\s*2;[\s\S]*align-self:\s*end;[\s\S]*height:\s*var\(--trainer-bottom-strip-h\);/,
  );
  assert.match(
    trainerShellCss,
    /\.desktop-main\.is-trainer\s+\.trainer-market-layout\s*>\s*\.trade-log\.trade-log-strip\s*\{[\s\S]*grid-row:\s*2;[\s\S]*align-self:\s*end;[\s\S]*height:\s*var\(--trainer-bottom-strip-h\);/,
  );
});
