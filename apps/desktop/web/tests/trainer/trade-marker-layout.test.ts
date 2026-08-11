// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { layoutTradeMarkerCandidates } from "../../src/domains/chart/tradeMarkerLayout";

test("trade marker layout keeps readable segmented ranges", () => {
  const markers = layoutTradeMarkerCandidates({
    compact: true,
    visibleBarPixelWidth: 18,
    candidates: [
      { key: "s-1", side: "SELL", timestamp: 1, value: 10, label: "S1-2", x: 100, y: 170, aggregated: true },
      { key: "s-2", side: "SELL", timestamp: 2, value: 11, label: "S3-4", x: 101, y: 125, aggregated: true },
      { key: "s-3", side: "SELL", timestamp: 3, value: 12, label: "S5-8", x: 102, y: 80, aggregated: true },
    ],
  });

  assert.deepEqual(markers.map((marker) => marker.displayLabel).sort(), ["S1-2", "S3-4", "S5-8"]);
  assert.equal(markers.some((marker) => marker.compressed), false);
  assert.equal(markers.every((marker) => marker.labelOnly), true);
});

test("trade marker layout keeps crowded same-side ranges on their source candles", () => {
  const markers = layoutTradeMarkerCandidates({
    compact: true,
    visibleBarPixelWidth: 7,
    candidates: [
      {
        key: "s-1",
        side: "SELL",
        timestamp: 1,
        value: 10,
        label: "S1-2",
        x: 100,
        y: 100,
        aggregated: true,
        hoverText: "S1-2\nfirst",
      },
      {
        key: "s-2",
        side: "SELL",
        timestamp: 2,
        value: 11,
        label: "S3-4",
        x: 101,
        y: 101,
        aggregated: true,
        hoverText: "S3-4\nsecond",
      },
      {
        key: "s-3",
        side: "SELL",
        timestamp: 3,
        value: 12,
        label: "S5-8",
        x: 102,
        y: 102,
        aggregated: true,
        hoverText: "S5-8\nthird",
      },
    ],
  });

  assert.deepEqual(markers.map((marker) => marker.displayLabel).sort(), ["S1-2", "S3-4", "S5-8"]);
  assert.equal(markers.some((marker) => marker.compressed), false);
  assert.equal(markers.every((marker) => marker.labelOnly), true);
  assert.equal(markers.every((marker) => marker.labelOffsetX === 0), true);
  assert.deepEqual(markers.flatMap((marker) => marker.sourceKeys).sort(), ["s-1", "s-2", "s-3"]);
  assert.equal(markers.find((marker) => marker.key === "s-1")?.hoverText.includes("first"), true);
  assert.equal(markers.find((marker) => marker.key === "s-2")?.hoverText.includes("second"), true);
  assert.equal(markers.find((marker) => marker.key === "s-3")?.hoverText.includes("third"), true);
});

test("trade marker layout does not aggregate close adjacent candles", () => {
  const markers = layoutTradeMarkerCandidates({
    compact: true,
    visibleBarPixelWidth: 6,
    candidates: [
      { key: "b-1", side: "BUY", timestamp: 1, value: 9, label: "B1", x: 100, y: 120 },
      { key: "b-2", side: "BUY", timestamp: 2, value: 9, label: "B2", x: 108, y: 121 },
      { key: "b-3", side: "BUY", timestamp: 3, value: 9, label: "B3", x: 116, y: 122 },
      { key: "b-4", side: "BUY", timestamp: 4, value: 9, label: "B4", x: 124, y: 123 },
    ],
  });

  assert.deepEqual(markers.map((marker) => marker.displayLabel), ["B1", "B2", "B3", "B4"]);
  assert.deepEqual(markers.map((marker) => marker.timestamp), [1, 2, 3, 4]);
  assert.equal(markers.every((marker) => marker.side === "BUY"), true);
  assert.equal(markers.every((marker) => marker.compressed === false), true);
  assert.equal(markers.every((marker) => marker.labelOffsetX === 0), true);
});

test("trade marker layout keeps mixed B/S as a single label-only marker", () => {
  const markers = layoutTradeMarkerCandidates({
    compact: true,
    visibleBarPixelWidth: 18,
    candidates: [
      {
        key: "mixed-1",
        side: "MIXED",
        timestamp: 1,
        value: 10,
        label: "B/S",
        x: 100,
        y: 110,
        aggregated: true,
        forceDirection: -1,
      },
    ],
  });

  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.side, "MIXED");
  assert.equal(markers[0]?.displayLabel, "B/S");
  assert.equal(markers[0]?.labelOnly, true);
  assert.equal(markers[0]?.forceDirection, -1);
});

test("trade marker layout keeps buy and sell summaries separated in crowded clusters", () => {
  const markers = layoutTradeMarkerCandidates({
    compact: true,
    visibleBarPixelWidth: 6,
    candidates: [
      { key: "s-1", side: "SELL", timestamp: 1, value: 10, label: "S1", x: 100, y: 101 },
      { key: "s-2", side: "SELL", timestamp: 2, value: 10, label: "S2", x: 102, y: 102 },
      { key: "s-3", side: "SELL", timestamp: 3, value: 10, label: "S3", x: 104, y: 103 },
      { key: "s-4", side: "SELL", timestamp: 4, value: 10, label: "S4", x: 106, y: 104 },
      { key: "b-1", side: "BUY", timestamp: 5, value: 9, label: "B1", x: 100, y: 100 },
      { key: "b-2", side: "BUY", timestamp: 6, value: 9, label: "B2", x: 102, y: 101 },
      { key: "b-3", side: "BUY", timestamp: 7, value: 9, label: "B3", x: 104, y: 102 },
      { key: "b-4", side: "BUY", timestamp: 8, value: 9, label: "B4", x: 106, y: 103 },
    ],
  });

  assert.equal(markers.length, 8);
  assert.deepEqual(
    markers.filter((marker) => marker.side === "SELL").map((marker) => marker.displayLabel),
    ["S1", "S2", "S3", "S4"],
  );
  assert.deepEqual(
    markers.filter((marker) => marker.side === "BUY").map((marker) => marker.displayLabel),
    ["B1", "B2", "B3", "B4"],
  );
  assert.equal(markers.some((marker) => marker.compressed), false);
  assert.equal(markers.every((marker) => marker.labelOffsetX === 0), true);
});
