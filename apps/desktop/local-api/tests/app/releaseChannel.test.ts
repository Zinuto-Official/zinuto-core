// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveDesktopReleaseChannel } from "../../src/runtime/releaseChannel.js";

test("the public source runtime always identifies the community channel", () => {
  assert.equal(resolveDesktopReleaseChannel(), "community");
});
