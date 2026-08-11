// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readCssWithImports } from "./readCssWithImports";

const readSource = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const strategyBacktestCss = readCssWithImports(
  new URL("../../src/styles/workspaces/strategy-backtest.css", import.meta.url),
);

const declarationMatches = (
  property: string,
): Array<{ value: string; index: number }> => {
  const pattern = new RegExp(`(?:^|[;{])\\s*${property}:([^;}]+)`, "g");
  return [...strategyBacktestCss.matchAll(pattern)].map((match) => ({
    value: match[1].trim(),
    index: match.index ?? 0,
  }));
};

const selectorBefore = (index: number): string => {
  const blockStart = strategyBacktestCss.lastIndexOf("{", index);
  const previousBlockEnd = strategyBacktestCss.lastIndexOf("}", blockStart);
  return strategyBacktestCss.slice(previousBlockEnd + 1, blockStart).trim();
};

test("strategy backtest css stays within the layout token contract", () => {
  const lineCount = strategyBacktestCss.split(/\r?\n/).length;
  assert.ok(lineCount <= 950, `expected <=950 CSS lines, received ${lineCount}`);
  assert.doesNotMatch(strategyBacktestCss, /--strategy-backtest-type-/);
  assert.doesNotMatch(strategyBacktestCss, /font-size:\s*\d+(?:\.\d+)?px\b/);
  assert.doesNotMatch(strategyBacktestCss, /border-radius:\s*\d+(?:\.\d+)?px\b/);
  assert.doesNotMatch(strategyBacktestCss, /#[0-9a-fA-F]{3,8}\b|rgb\(/);
});

test("strategy backtest time range uses the shared calendar picker", () => {
  const pageSource = readSource(
    "../../src/workspaces/strategy-backtest/StrategyBacktestPage.tsx",
  );

  assert.match(pageSource, /import \{ DatePicker \} from "@\/ui\/primitives\/date-picker"/);
  assert.match(pageSource, /<DatePicker[\s\S]*max=\{backtestEndDateInput/);
  assert.match(pageSource, /<DatePicker[\s\S]*min=\{backtestStartDateInput/);
  assert.equal(pageSource.match(/allowManualInput/g)?.length, 2);
  assert.doesNotMatch(pageSource, /type="date"/);
});

test("strategy backtest spacing uses the shared gap scale", () => {
  const allowedGapTokens = new Set(["4px", "8px", "12px", "16px"]);
  const gapDeclarations = [
    ...declarationMatches("gap"),
    ...declarationMatches("row-gap"),
    ...declarationMatches("column-gap"),
  ];

  for (const declaration of gapDeclarations) {
    if (declaration.value.startsWith("var(")) {
      continue;
    }
    for (const token of declaration.value.split(/\s+/)) {
      if (token.endsWith("px")) {
        assert.ok(
          allowedGapTokens.has(token),
          `disallowed gap ${token} in ${selectorBefore(declaration.index)}`,
        );
      }
    }
  }
});

test("strategy backtest chart heights come from chart tokens", () => {
  const chartSelectors = [
    "strategy-backtest-history-chart",
    "strategy-backtest-simple-chart",
    "strategy-backtest-analysis-section",
    "strategy-backtest-analysis-chart",
    "strategy-backtest-monthly-heatmap",
  ];

  for (const declaration of declarationMatches("min-height")) {
    const selector = selectorBefore(declaration.index);
    if (!chartSelectors.some((className) => selector.includes(className))) {
      continue;
    }
    assert.match(
      declaration.value,
      /^(0|var\(--strategy-backtest-chart-(?:lg|md|sm)\)|minmax\(var\(--strategy-backtest-chart-(?:lg|md|sm)\),[^)]*\)|clamp\(var\(--strategy-backtest-chart-(?:lg|md|sm)\),[^)]*var\(--strategy-backtest-(?:chart-(?:lg|md|sm)|heatmap-height)\)\))$/,
      `chart min-height must use chart tokens in ${selector}: ${declaration.value}`,
    );
  }
});

test("strategy backtest main layout keeps fixed proportions with bounded internal scrollers", () => {
  const block = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      strategyBacktestCss.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`))
        ?.groups?.body ?? ""
    );
  };

  assert.match(block(".strategy-backtest-page-body"), /overflow:\s*hidden;/);
  assert.match(block(".strategy-backtest-layout"), /height:\s*100%;/);
  assert.match(
    block(".strategy-backtest-layout"),
    /grid-template-rows:\s*minmax\(0,\s*7fr\)\s+minmax\(0,\s*3fr\);/,
  );
  assert.match(block(".strategy-backtest-layout"), /overflow:\s*hidden;/);
  assert.match(block(".workspace-section.is-shell.strategy-backtest-panel"), /box-sizing:\s*border-box;/);
  assert.match(block(".strategy-backtest-config"), /overflow:\s*hidden;/);
  assert.match(block(".strategy-backtest-config-scroll"), /overflow:\s*auto;/);
  assert.match(block(".strategy-signal-rule-card-list"), /display:\s*grid;/);
  assert.match(
    block(".strategy-signal-rule-card-list"),
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    block(".strategy-signal-rule-card-list"),
    /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(block(".strategy-signal-rule-card-list"), /align-items:\s*stretch;/);
  assert.match(block(".strategy-signal-rule-card-list"), /height:\s*100%;/);
  assert.doesNotMatch(block(".strategy-signal-rule-card-list"), /grid-auto-rows:/);
  assert.doesNotMatch(block(".strategy-signal-rule-card-list"), /align-content:\s*start;/);
  assert.match(block(".strategy-signal-rule-card-list"), /overflow:\s*hidden;/);
  assert.match(block('.strategy-signal-rule-card-list[data-density="compact"]'), /gap:\s*8px;/);
  assert.match(block(".strategy-signal-rule-direction"), /grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(block(".strategy-signal-rule-direction"), /align-items:\s*stretch;/);
  assert.match(block(".strategy-signal-rule-direction"), /box-sizing:\s*border-box;/);
  assert.match(block(".strategy-signal-rule-direction"), /min-height:\s*0;/);
  assert.match(block('.strategy-signal-rule-direction[data-density="expanded"]'), /min-height:\s*160px;/);
  assert.match(block(".strategy-signal-rule-head-meta"), /display:\s*flex;/);
  assert.match(block(".strategy-signal-rule-head-meta"), /flex-wrap:\s*wrap;/);
  assert.match(block(".strategy-signal-rule-summary-row"), /grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(block(".strategy-signal-rule-summary"), /text-overflow:\s*ellipsis;/);
  assert.match(block(".strategy-signal-rule-condition-preview"), /display:\s*grid;/);
  assert.match(block(".strategy-signal-rule-condition-preview"), /align-content:\s*start;/);
  assert.match(
    block(".strategy-signal-rule-condition-item"),
    /grid-template-columns:\s*minmax\(32px,\s*auto\)\s+minmax\(0,\s*1fr\);/,
  );
  assert.match(
    block('.strategy-signal-rule-condition-item[data-has-joiner="false"]'),
    /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(block(".strategy-signal-rule-condition-joiner"), /border-radius:\s*var\(--ui-radius-pill\);/);
  assert.match(
    block(".strategy-signal-rule-formula-line"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/,
  );
  assert.match(block(".strategy-signal-rule-formula-line"), /border-radius:\s*var\(--ui-radius-control\);/);
  assert.match(block(".strategy-signal-rule-condition-part"), /text-overflow:\s*ellipsis;/);
  assert.match(block(".strategy-signal-rule-condition-operator"), /border-radius:\s*var\(--ui-radius-pill\);/);
  assert.match(
    block('.strategy-signal-rule-card-list[data-density="compact"] .strategy-signal-rule-condition-preview'),
    /display:\s*none;/,
  );
  assert.doesNotMatch(strategyBacktestCss, /\.strategy-signal-rule-condition-line\s*\{/);
  assert.match(block(".strategy-signal-rule-modal-body"), /overflow:\s*auto;/);
  assert.match(block(".strategy-backtest-batch-list"), /height:\s*100%;/);
  assert.match(block(".strategy-backtest-batch-list"), /display:\s*flex;/);
  assert.match(block(".strategy-backtest-batch-list"), /flex-direction:\s*column;/);
  assert.doesNotMatch(block(".strategy-backtest-batch-list"), /grid-auto-rows:/);
  assert.match(block(".strategy-backtest-batch-list"), /align-items:\s*stretch;/);
  assert.match(block(".strategy-backtest-batch-list"), /max-height:\s*none;/);
  assert.match(block(".strategy-backtest-batch-list"), /overflow:\s*auto;/);
  assert.match(block(".strategy-backtest-batch"), /flex:\s*0\s+0\s+auto;/);
  assert.match(block(".strategy-backtest-batch"), /align-self:\s*stretch;/);
  assert.match(block(".strategy-backtest-batch"), /box-sizing:\s*border-box;/);
  assert.match(block(".strategy-backtest-batch"), /cursor:\s*pointer;/);
  assert.match(block(".strategy-backtest-asset-class-control .segmented-option"), /position:\s*relative;/);
  assert.match(block('.strategy-backtest-asset-class-control .segmented-option [data-i18n-slot="segmentedLabel"]'), /clip-path:\s*inset\(50%\);/);
  assert.match(block(".strategy-backtest-batch-top"), /display:\s*grid;/);
  assert.match(
    block(".strategy-backtest-batch-top"),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
  );
  assert.match(block(".strategy-backtest-batch-top"), /align-items:\s*center;/);
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /appearance:\s*none;/,
  );
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /height:\s*auto;/,
  );
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /block-size:\s*auto;/,
  );
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /min-block-size:\s*max-content;/,
  );
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /flex:\s*1\s+1\s+auto;/,
  );
  assert.match(
    block('.strategy-backtest-batch [data-slot="button"].strategy-backtest-batch-open'),
    /justify-content:\s*stretch;/,
  );
  assert.match(block(".strategy-backtest-batch-card-actions"), /flex:\s*0\s+0\s+auto;/);
  assert.match(block(".strategy-backtest-batch-card-actions"), /align-self:\s*center;/);
  assert.match(block(".strategy-backtest-batch-card-actions"), /flex-wrap:\s*nowrap;/);
  assert.match(
    block(".strategy-backtest-batch-metrics"),
    /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    strategyBacktestCss,
    /@media\s*\(max-width:980px\)\{[\s\S]*\.strategy-backtest-batch-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/,
  );
  assert.match(
    strategyBacktestCss,
    /@media\s*\(max-width:560px\)\{[\s\S]*\.strategy-backtest-batch-metrics\{grid-template-columns:1fr;/,
  );
  assert.match(
    block(".strategy-backtest-secondary-layout"),
    /grid-template-columns:\s*clamp\(300px,\s*30vw,\s*380px\)\s+minmax\(0,\s*1fr\);/,
  );
  assert.doesNotMatch(strategyBacktestCss, /min-height:\s*(?:640|520)px;/);
});
