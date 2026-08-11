// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sanitizeDrawingForArchive } from "../../src/app-shell/appDrawingArchive";
import {
  hasDrawingOverlayInProgress,
  isDrawingOverlayInProgress,
} from "../../src/domains/chart/drawingOverlayLifecycle";

const firstPoint = { timestamp: 1712102400000, value: 10, dataIndex: 1 };
const secondPoint = { timestamp: 1712188800000, value: 11, dataIndex: 2 };

test("drawing archive rejects in-progress overlays even when preview points meet the minimum", () => {
  assert.equal(
    sanitizeDrawingForArchive({
      id: "preview-segment",
      name: "segment",
      currentStep: 2,
      points: [firstPoint, secondPoint],
    }),
    null,
  );
});

test("drawing archive keeps completed two-point overlays", () => {
  assert.deepEqual(
    sanitizeDrawingForArchive({
      id: "completed-segment",
      name: "segment",
      currentStep: -1,
      points: [firstPoint, secondPoint],
    }),
    {
      id: "completed-segment",
      name: "segment",
      points: [firstPoint, secondPoint],
    },
  );
});

test("drawing archive treats legacy overlays without currentStep as completed", () => {
  assert.deepEqual(
    sanitizeDrawingForArchive({
      id: "legacy-segment",
      name: "segment",
      points: [firstPoint, secondPoint],
    }),
    {
      id: "legacy-segment",
      name: "segment",
      points: [firstPoint, secondPoint],
    },
  );
});

test("drawing archive keeps completed single-point drawing tools", () => {
  for (const name of ["priceLine", "horizontalStraightLine"]) {
    assert.deepEqual(
      sanitizeDrawingForArchive({
        id: `${name}-completed`,
        name,
        currentStep: -1,
        points: [firstPoint],
      }),
      {
        id: `${name}-completed`,
        name,
        points: [firstPoint],
      },
    );
  }
});

test("drawing overlay progress helpers use klinecharts currentStep semantics", () => {
  assert.equal(isDrawingOverlayInProgress({ currentStep: 2 }), true);
  assert.equal(isDrawingOverlayInProgress({ currentStep: -1 }), false);
  assert.equal(isDrawingOverlayInProgress({}), false);
  assert.equal(
    hasDrawingOverlayInProgress([{ currentStep: -1 }, { currentStep: "2" }]),
    true,
  );
});

test("drawing rebuild does not clear user drawings while a progress overlay exists", () => {
  const source = readFileSync(
    new URL("../../src/app-shell/useAppDrawingPersistence.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /if \(hasDrawingOverlayInProgress\(overlays\)\) \{\s*return false;\s*\}\s*chart\.removeOverlay\(\{ groupId: DRAW_GROUP_ID \}\);/,
  );
  assert.match(
    source,
    /const completedOverlays = overlays\.filter\(\(overlay\) => !isDrawingOverlayInProgress\(overlay\)\);/,
  );
});
