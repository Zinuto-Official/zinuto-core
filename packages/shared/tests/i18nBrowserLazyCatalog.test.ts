// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureLocaleCatalog,
  formatMessage,
  isLocaleCatalogLoaded,
} from "../dist/i18n.browser.js";

test("browser i18n loads only the requested catalog", async () => {
  assert.equal(isLocaleCatalogLoaded("ja"), false);
  assert.equal(isLocaleCatalogLoaded("en"), false);

  await Promise.all([
    ensureLocaleCatalog("ja"),
    ensureLocaleCatalog("ja"),
  ]);

  assert.equal(isLocaleCatalogLoaded("ja"), true);
  assert.equal(isLocaleCatalogLoaded("en"), false);
  assert.equal(formatMessage("ja", "appText.retry"), "再試行");
  assert.deepEqual(
    [
      "uiLabels.languageOptions.en",
      "uiLabels.languageOptions.zhCn",
      "uiLabels.languageOptions.ja",
      "uiLabels.languageOptions.ko",
      "uiLabels.languageOptions.es",
    ].map((id) => formatMessage("ja", id as never)),
    ["English", "简体中文", "日本語", "한국어", "Español"],
  );
  assert.equal(isLocaleCatalogLoaded("en"), false);
});
