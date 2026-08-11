// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { formatMessage } from "@zinuto/shared/i18n";
import {
  SYSTEM_STORAGE_CATEGORY_KEYS,
  normalizeSystemStorageCategoryKey,
} from "@zinuto/shared/systemStorageCategories";

const APP_LOCALES = ["en", "zh-CN", "ja", "ko", "es"] as const;

test("system storage summary exposes the complete canonical category set", () => {
  assert.deepEqual(SYSTEM_STORAGE_CATEGORY_KEYS, [
    "training",
    "replayNotes",
    "marketData",
    "systemSettings",
    "stats",
    "other",
  ]);
  assert.equal(normalizeSystemStorageCategoryKey("replayNotes"), "replayNotes");
  assert.equal(normalizeSystemStorageCategoryKey("notes"), "other");
  assert.equal(normalizeSystemStorageCategoryKey("futureCategory"), "other");
});

test("market and replay-note storage labels are complete in all five locales", () => {
  for (const locale of APP_LOCALES) {
    const marketLabel = formatMessage(locale, "appText.marketDataStorage");
    const notesLabel = formatMessage(locale, "appText.notesData");
    assert.ok(marketLabel.trim(), `${locale}: market`);
    assert.ok(notesLabel.trim(), `${locale}: notes`);
    assert.notEqual(marketLabel, "appText.marketDataStorage", locale);
    assert.notEqual(notesLabel, "appText.notesData", locale);
    assert.notEqual(marketLabel, formatMessage(locale, "appText.marketData"));
  }
});
