// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (specifier: string): string =>
  readFileSync(new URL(specifier, import.meta.url), "utf8");

test("strategy backtest chart tooltips use the shared tooltip visual contract", () => {
  const chartThemeSource = readSource(
    "../../src/workspaces/strategy-backtest/detail/charts/backtestChartTheme.ts",
  );

  assert.match(chartThemeSource, /tooltipBg:\s*resolveCssTokenColor\("--ui-tooltip-bg"\)/);
  assert.match(chartThemeSource, /tooltipBorder:\s*resolveCssTokenColor\("--ui-tooltip-border"\)/);
  assert.match(chartThemeSource, /tooltipText:\s*resolveCssTokenColor\("--text"\)/);
  assert.match(chartThemeSource, /borderWidth:\s*1/);
  assert.match(chartThemeSource, /borderRadius:\s*6/);
  assert.match(chartThemeSource, /padding:\s*\[6,\s*12\]/);
  assert.match(chartThemeSource, /fontFamily:\s*getGlobalTypographyFontFamily\("ui"\)/);
  assert.match(chartThemeSource, /fontSize:\s*getGlobalTypographyReferencePx\("r1"\)/);
  assert.doesNotMatch(chartThemeSource, /tooltipBg:\s*resolveCssTokenColor\("--surface-s2"\)/);
});

test("strategy backtest metric explanations use the shared accessible tooltip", () => {
  const metricTableSource = readSource(
    "../../src/workspaces/strategy-backtest/detail/MetricTable.tsx",
  );
  const inlineInfoLabelSource = readSource(
    "../../src/ui/components/InlineInfoLabel.tsx",
  );

  assert.match(metricTableSource, /import \{ InlineInfoLabel \} from "@\/ui\/components"/);
  assert.match(
    metricTableSource,
    /<InlineInfoLabel[\s\S]*label=\{labels\[row\.key\]\}[\s\S]*tooltip=\{tooltips\[row\.key\]\}/,
  );
  assert.doesNotMatch(metricTableSource, /title=\{tooltips\[row\.key\]\}/);
  assert.match(inlineInfoLabelSource, /data-inline-info-trigger="true"/);
  assert.match(inlineInfoLabelSource, /style=\{\{ width: 14, height: 14 \}\}/);
  assert.match(inlineInfoLabelSource, /bg-transparent/);
  assert.match(inlineInfoLabelSource, /style=\{\{ background: "transparent", border: 0, boxShadow: "none", padding: 0 \}\}/);
  assert.doesNotMatch(inlineInfoLabelSource, /data-slot="button"/);
  assert.doesNotMatch(inlineInfoLabelSource, /bg-\[color:var\(--panel-soft\)\]/);
  assert.doesNotMatch(inlineInfoLabelSource, /const INFO_GLYPH/);
});
