// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpecialTrainingOverlaySignature,
  resolveTrainerChartDataRenderStage,
  resolveTrainerChartRenderState,
} from "../../src/app-shell/trainerChartRenderStateMachine";

test("trainer chart render stage treats failed realtime pushes as reset", () => {
  assert.equal(
    resolveTrainerChartDataRenderStage({
      dataUpdateDecision: {
        action: "realtime",
        reason: "append",
        updateStartIndex: 2,
      },
      realtimeApplied: true,
    }),
    "realtime",
  );
  assert.equal(
    resolveTrainerChartDataRenderStage({
      dataUpdateDecision: {
        action: "realtime",
        reason: "append",
        updateStartIndex: 2,
      },
      realtimeApplied: false,
    }),
    "reset",
  );
  assert.equal(
    resolveTrainerChartDataRenderStage({
      dataUpdateDecision: { action: "none", reason: "same-data" },
      realtimeApplied: null,
    }),
    "stable",
  );
});

test("trainer chart render state refreshes overlays and markers after data reset", () => {
  assert.deepEqual(
    resolveTrainerChartRenderState({
      dataStage: "reset",
      previousSpecialTrainingOverlaySignature: "same",
      nextSpecialTrainingOverlaySignature: "same",
      deferSystemMarkers: false,
      previousSystemMarkerHeavySignature: "heavy",
      nextSystemMarkerHeavySignature: "heavy",
      previousSystemMarkerPositionSignature: "position",
      nextSystemMarkerPositionSignature: "position",
      pendingDrawingRebuildPeriod: null,
      trainerDisplayPeriod: "1d",
    }),
    {
      dataStage: "reset",
      shouldResetData: true,
      shouldRefreshSpecialTrainingOverlays: true,
      shouldRefreshTradeAndNoteMarkers: true,
      shouldRefreshPositionMarker: true,
      shouldRefreshSystemMarkers: true,
      shouldRebuildDrawingsForPeriod: false,
      shouldScheduleOverlayFrame: true,
      shouldQueuePaneAdjustWithoutOverlay: false,
    },
  );
});

test("trainer chart render state isolates marker refresh from special overlay refresh", () => {
  assert.deepEqual(
    resolveTrainerChartRenderState({
      dataStage: "stable",
      previousSpecialTrainingOverlaySignature: "old-overlay",
      nextSpecialTrainingOverlaySignature: "new-overlay",
      deferSystemMarkers: false,
      previousSystemMarkerHeavySignature: "same-heavy",
      nextSystemMarkerHeavySignature: "same-heavy",
      previousSystemMarkerPositionSignature: "same-position",
      nextSystemMarkerPositionSignature: "same-position",
      pendingDrawingRebuildPeriod: null,
      trainerDisplayPeriod: "1d",
    }),
    {
      dataStage: "stable",
      shouldResetData: false,
      shouldRefreshSpecialTrainingOverlays: true,
      shouldRefreshTradeAndNoteMarkers: false,
      shouldRefreshPositionMarker: false,
      shouldRefreshSystemMarkers: false,
      shouldRebuildDrawingsForPeriod: false,
      shouldScheduleOverlayFrame: true,
      shouldQueuePaneAdjustWithoutOverlay: false,
    },
  );
});

test("trainer chart render state defers system markers while still rebuilding drawings", () => {
  assert.deepEqual(
    resolveTrainerChartRenderState({
      dataStage: "stable",
      previousSpecialTrainingOverlaySignature: "same",
      nextSpecialTrainingOverlaySignature: "same",
      deferSystemMarkers: true,
      previousSystemMarkerHeavySignature: "old-heavy",
      nextSystemMarkerHeavySignature: "new-heavy",
      previousSystemMarkerPositionSignature: "old-position",
      nextSystemMarkerPositionSignature: "new-position",
      pendingDrawingRebuildPeriod: "1h",
      trainerDisplayPeriod: "1h",
    }),
    {
      dataStage: "stable",
      shouldResetData: false,
      shouldRefreshSpecialTrainingOverlays: false,
      shouldRefreshTradeAndNoteMarkers: false,
      shouldRefreshPositionMarker: false,
      shouldRefreshSystemMarkers: false,
      shouldRebuildDrawingsForPeriod: true,
      shouldScheduleOverlayFrame: true,
      shouldQueuePaneAdjustWithoutOverlay: false,
    },
  );
});

test("special training overlay signature is stable and changes with visible range bindings", () => {
  const base = {
    decisionBoundaryRawIndexOverride: 10,
    decisionMarkerOverride: {
      selection: "LONG" as const,
      label: "long",
      displayText: "Long",
    },
    tradeMarkersOverride: [
      {
        rawIndex: 11,
        side: "BUY" as const,
        price: 101,
        label: "B",
      },
    ],
    tradeMarkerBasePeriod: "1d",
    tradeMarkerDensityRatio: 0.5,
    fastDecisionExtremeRayOverride: null,
    riskDisciplineGuidesOverride: null,
    maxIndex: 20,
    firstBucketStartMs: 1_000,
    lastBucketStartMs: 2_000,
    priceColorMode: "classic",
    tradeColorTheme: "classic",
    showGlobalDecimals: true,
    chartThemeMode: "dark",
  };

  assert.equal(
    buildSpecialTrainingOverlaySignature(base),
    buildSpecialTrainingOverlaySignature({ ...base }),
  );
  assert.notEqual(
    buildSpecialTrainingOverlaySignature(base),
    buildSpecialTrainingOverlaySignature({
      ...base,
      lastBucketStartMs: 3_000,
    }),
  );
});
