// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../../src/assets/graphics/images.ts", import.meta.url),
  "utf8",
);

test("desktop image manifest emits only assets with a runtime consumer", () => {
  assert.match(source, /brandLogoRounded/u);
  assert.doesNotMatch(source, /local-market-data-import-empty/u);
  assert.doesNotMatch(source, /localMarketDataImportEmpty/u);
});
