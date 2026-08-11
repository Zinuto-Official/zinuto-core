// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  REPLAY_DRAW_TOOL_INTERNAL_NAMES,
  REPLAY_DRAW_TOOL_PREFERRED_ORDER,
} from "@zinuto/shared/replayDrawingTools";
import {
  DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  DRAW_TOOL_INTERNAL_NAMES,
  DRAW_TOOL_PREFERRED_ORDER,
} from "../../src/ui/config/uiConfig/staticOptionConfigMaps";

test("trainer drawing tool config follows shared replay drawing tool source", () => {
  assert.deepEqual(
    [...DRAW_TOOL_INTERNAL_NAMES],
    [...REPLAY_DRAW_TOOL_INTERNAL_NAMES],
  );
  assert.deepEqual(
    [...DRAW_TOOL_EXCLUDED_NATIVE_NAMES],
    [...REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES],
  );
  assert.deepEqual(DRAW_TOOL_PREFERRED_ORDER, [
    ...REPLAY_DRAW_TOOL_PREFERRED_ORDER,
  ]);
});
