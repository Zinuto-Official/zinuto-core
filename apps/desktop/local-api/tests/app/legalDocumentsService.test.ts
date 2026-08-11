// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopLegalDocumentsService } from "../../src/application/legalDocumentsService.js";

test("desktop legal documents are embedded for every public locale", async () => {
  const service = createDesktopLegalDocumentsService();
  for (const locale of ["en", "zh-CN", "ja", "ko", "es"] as const) {
    for (const documentKey of ["privacy", "terms"] as const) {
      const document = await service.getLegalDocument({ documentKey, locale });
      assert.equal(document.locale, locale);
      assert.equal(document.cacheStatus, "local");
      assert.match(document.sourceUrl, /^app:\/\/legal\//u);
      assert.ok(document.markdown.length > 100);
    }
  }
});

test("desktop legal documents never use network fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("network must not be used");
  }) as typeof fetch;
  try {
    const service = createDesktopLegalDocumentsService();
    await service.getLegalDocument({ documentKey: "privacy", locale: "en-XA" });
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
