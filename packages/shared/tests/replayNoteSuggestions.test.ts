// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { buildReplayNoteSuggestionCandidates } from "../dist/replayNoteSuggestions.js";

test("replay note suggestions are disabled after color-only note refactor", () => {
  assert.deepEqual(
    buildReplayNoteSuggestionCandidates({
      noteType: "FREE_REPLAY",
      language: "zh-CN",
      contextReplay: { bars: [{ open: 1, high: 2, low: 1, close: 2 }] },
    }),
    [],
  );
});
