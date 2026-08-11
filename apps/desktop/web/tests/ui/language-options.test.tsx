// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { getLanguageOptions } from "../../src/ui/config/uiLabels";

test("language options keep their native self-names for every active locale", () => {
  const expectedOptions = [
    { key: "en", label: "English" },
    { key: "zh-CN", label: "简体中文" },
    { key: "ja", label: "日本語" },
    { key: "ko", label: "한국어" },
    { key: "es", label: "Español" },
  ];

  for (const language of ["en", "zh-CN", "ja", "ko", "es"] as const) {
    assert.deepEqual(getLanguageOptions(language), expectedOptions);
  }
});
