// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("fast decision review result fills the available middle panel height", () => {
  const lightningStatusCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/02-special-training-lightning-status.layer-0${layer}.css`,
      ),
    )
    .join("\n");
  const lightningResultsCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/02-special-training-lightning-results.layer-0${layer}.css`,
      ),
    )
    .join("\n");

  assert.match(
    lightningStatusCss,
    /\.special-training-lightning-result-body\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[\s\S]*align-content:\s*stretch;/,
  );
  assert.match(
    lightningStatusCss,
    /\.special-training-lightning-result-hero\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*height:\s*100%;/,
  );
  assert.match(
    lightningStatusCss,
    /\.special-training-lightning-result-summary-column\s*\{[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/,
  );
  assert.match(
    lightningResultsCss,
    /\.special-training-lightning-result-log\s*\{[\s\S]*grid-template-rows:\s*repeat\(4,\s*minmax\(max-content,\s*1fr\)\);[\s\S]*height:\s*100%;/,
  );
});
