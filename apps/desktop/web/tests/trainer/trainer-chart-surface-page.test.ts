// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrainerChartSurfacePage } from "../../src/app-shell/trainerChartSurfacePage";

test("trainer chart stays on the displayed market surface until navigation commits", () => {
  assert.equal(
    resolveTrainerChartSurfacePage({
      activePage: "HISTORY",
      displayedPage: "TRAINER",
    }),
    "TRAINER",
  );
  assert.equal(
    resolveTrainerChartSurfacePage({
      activePage: "SPECIAL_TRAINING",
      displayedPage: "TRAINER",
    }),
    "TRAINER",
  );
});

test("trainer chart prepares an incoming market surface while another page remains visible", () => {
  assert.equal(
    resolveTrainerChartSurfacePage({
      activePage: "TRAINER",
      displayedPage: "HISTORY",
    }),
    "TRAINER",
  );
  assert.equal(
    resolveTrainerChartSurfacePage({
      activePage: "SPECIAL_TRAINING",
      displayedPage: "NOTES",
    }),
    "SPECIAL_TRAINING",
  );
});

test("trainer chart lifecycle sleeps when neither page owns a chart", () => {
  assert.equal(
    resolveTrainerChartSurfacePage({
      activePage: "SETTINGS",
      displayedPage: "HISTORY",
    }),
    null,
  );
});
