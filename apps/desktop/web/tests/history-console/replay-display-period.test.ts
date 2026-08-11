// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  normalizeReplayDisplayPeriod,
  resolveReplayDisplayPeriod,
} from "../../src/domains/chart/replayDisplayPeriod";

test("archived replay display period takes precedence over base timeframe", () => {
  assert.equal(
    resolveReplayDisplayPeriod({
      replay: {
        displayPeriod: "1h",
        baseTimeframe: "1d",
      },
      baseTimeframe: "1d",
    }),
    "1h",
  );
});

test("preferred display period keeps note-local period after user switches it", () => {
  assert.equal(
    resolveReplayDisplayPeriod({
      replay: {
        displayPeriod: "1h",
        baseTimeframe: "1d",
      },
      preferredDisplayPeriod: "1w",
    }),
    "1w",
  );
});

test("missing archived display period falls back to replay base timeframe", () => {
  assert.equal(
    resolveReplayDisplayPeriod({
      replay: {
        baseTimeframe: "5m",
      },
    }),
    "5m",
  );
});

test("invalid display period values are ignored", () => {
  assert.equal(normalizeReplayDisplayPeriod("2h"), undefined);
  assert.equal(
    resolveReplayDisplayPeriod({
      replay: {
        displayPeriod: "2h",
        baseTimeframe: "1d",
      },
      fallback: "1m",
    }),
    "1d",
  );
});

test("review console does not force archived replays to the global trainer period", () => {
  const source = fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../src/workspaces/history/history-console/ReplayReviewConsoleWorkspace.tsx",
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /displayPeriod=\{history\.trainerDisplayPeriod\}/);
  assert.doesNotMatch(source, /displayPeriod:\s*history\.trainerDisplayPeriod/);
});
