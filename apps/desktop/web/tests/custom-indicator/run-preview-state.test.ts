// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveCustomIndicatorMarketSurfaceState } from "../../src/workspaces/custom-indicator/customIndicatorMarketSurfaceState";

test("custom indicator market preview exposes every terminal surface state", () => {
  assert.equal(
    resolveCustomIndicatorMarketSurfaceState({
      catalogLoadState: "loading",
      marketLoadState: "idle",
      hasMarketData: false,
    }),
    "loading",
  );
  assert.equal(
    resolveCustomIndicatorMarketSurfaceState({
      catalogLoadState: "ready",
      marketLoadState: "ready",
      hasMarketData: false,
    }),
    "empty",
  );
  assert.equal(
    resolveCustomIndicatorMarketSurfaceState({
      catalogLoadState: "ready",
      marketLoadState: "error",
      hasMarketData: false,
    }),
    "error",
  );
  assert.equal(
    resolveCustomIndicatorMarketSurfaceState({
      catalogLoadState: "ready",
      marketLoadState: "ready",
      hasMarketData: true,
    }),
    "ready",
  );
});

test("custom indicator Run Preview cannot silently succeed without bars", () => {
  const editorSource = readFileSync(
    new URL(
      "../../src/workspaces/custom-indicator/customIndicatorWorkbenchEditorState.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const layoutSource = readFileSync(
    new URL(
      "../../src/workspaces/custom-indicator/CustomIndicatorWorkbenchLayout.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    editorSource,
    /if \(!readRuntimeDataList\(\)\.length\)\s*{[\s\S]*state: "empty"[\s\S]*ui\.statsNoData/,
  );
  assert.match(editorSource, /state: "running"/);
  assert.match(editorSource, /state: "success"/);
  assert.match(editorSource, /state: "error"/);
  assert.match(
    editorSource,
    /scriptRunFeedbackContextRef\.current \+= 1;[\s\S]*state: "idle"/,
  );
  assert.match(
    editorSource,
    /marketRunContextKey,[\s\S]*parameterDefinitionSignature,[\s\S]*parameterInputSignature,[\s\S]*scriptSource,/,
  );
  assert.match(
    editorSource,
    /scriptRunFeedbackContextRef\.current !== runFeedbackContext/,
  );
  assert.match(
    layoutSource,
    /const isRunDisabled =[\s\S]*marketSurfaceState !== "ready"/,
  );
  assert.match(layoutSource, /loading=\{editor\.isScriptRunning\}/);
  assert.match(layoutSource, /aria-live="polite"/);
  assert.match(layoutSource, /data-market-state=\{marketSurfaceState\}/);
});
