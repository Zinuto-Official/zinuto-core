// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopLocalDocumentLocales,
  desktopLocalDocumentUiText,
  desktopLocalReleaseManifest,
  resolveDesktopReleasePublicationState,
} from "../dist/desktopLocalDocuments.js";

test("bundled release notes remain complete for every desktop locale", () => {
  assert.equal(desktopLocalReleaseManifest.version?.trim().length, 5);
  assert.ok(Date.parse(desktopLocalReleaseManifest.publishedAt));

  for (const locale of desktopLocalDocumentLocales) {
    const copy = desktopLocalDocumentUiText[locale].releaseNotes;
    assert.ok(copy.latestReleaseLabel.trim(), locale);
    assert.ok(copy.highlightsLabel.trim(), locale);
    assert.ok(copy.emptyHighlightsLabel.trim(), locale);
    assert.ok(
      Array.isArray(desktopLocalReleaseManifest.releaseHighlights[locale]),
      locale,
    );
    assert.equal(
      desktopLocalReleaseManifest.releaseHighlights[locale].length,
      4,
      `${locale} release highlights`,
    );
  }

  const allHighlights = Object.values(
    desktopLocalReleaseManifest.releaseHighlights,
  ).flat().join("\n");
  assert.doesNotMatch(
    allHighlights,
    /(?:major release|fully open source|much faster|significantly faster|重大版本|完全开源|显著提升|大型アップデート|完全にオープンソース|大幅に向上|주요 버전|완전히 오픈 소스|크게 향상|actualización principal|completamente de código abierto|mejora notable)/iu,
  );
});

test("future release timestamps are scheduled until their publication instant", () => {
  assert.equal(desktopLocalReleaseManifest.version, "2.0.4");
  assert.equal(
    resolveDesktopReleasePublicationState(
      desktopLocalReleaseManifest.publishedAt,
      Date.parse("2026-08-13T01:59:59.000Z"),
    ),
    "SCHEDULED",
  );
  assert.equal(
    resolveDesktopReleasePublicationState(
      desktopLocalReleaseManifest.publishedAt,
      Date.parse("2026-08-13T02:00:00.000Z"),
    ),
    "PUBLISHED",
  );
});
