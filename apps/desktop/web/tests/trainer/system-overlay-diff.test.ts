// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  syncSystemOverlayById,
  syncSystemOverlayGroup,
  type SystemOverlayCreate,
  withSystemOverlaySignature,
} from "../../src/domains/chart/overlays/systemOverlayDiff";

const webRoot = path.resolve(import.meta.dirname, "../..");
const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

type FakeOverlay = SystemOverlayCreate & {
  extendData: Record<string, unknown>;
};

const createFakeChart = (initial: FakeOverlay[]) => {
  let overlays = [...initial];
  const calls = {
    create: 0,
    override: 0,
    remove: [] as Array<Record<string, unknown>>,
  };

  return {
    calls,
    overlays: () => overlays,
    chart: {
      getOverlays: (filter?: { id?: string; groupId?: string }) =>
        overlays.filter((overlay) => {
          if (filter?.id && overlay.id !== filter.id) {
            return false;
          }
          if (filter?.groupId && overlay.groupId !== filter.groupId) {
            return false;
          }
          return true;
        }),
      createOverlay: (overlay: SystemOverlayCreate) => {
        calls.create += 1;
        overlays.push(overlay as FakeOverlay);
        return overlay.id;
      },
      overrideOverlay: (overlay: SystemOverlayCreate) => {
        calls.override += 1;
        overlays = overlays.map((current) =>
          current.id === overlay.id ? { ...current, ...overlay } as FakeOverlay : current,
        );
        return true;
      },
      removeOverlay: (filter?: { id?: string; groupId?: string }) => {
        calls.remove.push({ ...filter });
        overlays = overlays.filter((overlay) => {
          if (filter?.id) {
            return overlay.id !== filter.id;
          }
          if (filter?.groupId) {
            return overlay.groupId !== filter.groupId;
          }
          return true;
        });
        return true;
      },
    },
  };
};

const overlay = (id: string, groupId: string, signature: string): FakeOverlay => ({
  id,
  groupId,
  name: "marker",
  points: [{ timestamp: 1, value: 2 }],
  extendData: withSystemOverlaySignature({ value: signature }, signature),
});

test("system overlay group sync keeps unchanged overlays and updates only the diff", () => {
  const fake = createFakeChart([
    overlay("same", "system-trade", "a"),
    overlay("changed", "system-trade", "old"),
    overlay("stale", "system-trade", "stale"),
  ]);

  const changed = syncSystemOverlayGroup(fake.chart as any, "system-trade", [
    overlay("same", "system-trade", "a"),
    overlay("changed", "system-trade", "new"),
    overlay("created", "system-trade", "fresh"),
  ]);

  assert.equal(changed, true);
  assert.equal(fake.calls.create, 1);
  assert.equal(fake.calls.override, 1);
  assert.deepEqual(fake.calls.remove, [{ id: "stale" }]);
  assert.deepEqual(fake.overlays().map((item) => item.id).sort(), ["changed", "created", "same"]);
});

test("system overlay group sync is a no-op when signatures are unchanged", () => {
  const fake = createFakeChart([overlay("same", "system-note", "a")]);

  const changed = syncSystemOverlayGroup(fake.chart as any, "system-note", [
    overlay("same", "system-note", "a"),
  ]);

  assert.equal(changed, false);
  assert.equal(fake.calls.create, 0);
  assert.equal(fake.calls.override, 0);
  assert.deepEqual(fake.calls.remove, []);
});

test("system overlay id sync upserts and removes the position marker", () => {
  const fake = createFakeChart([overlay("system-position-line", "system-position", "old")]);

  assert.equal(
    syncSystemOverlayById(
      fake.chart as any,
      "system-position-line",
      overlay("system-position-line", "system-position", "new"),
    ),
    true,
  );
  assert.equal(fake.calls.override, 1);

  assert.equal(syncSystemOverlayById(fake.chart as any, "system-position-line", null), true);
  assert.deepEqual(fake.calls.remove, [{ id: "system-position-line" }]);
  assert.deepEqual(fake.overlays(), []);
});

test("history replay refresh lets system marker controller diff normal overlay updates", () => {
  const source = readSource("src/domains/chart/useHistoryReplayArchivedOverlays.ts");
  const refreshStart = source.indexOf("const refreshArchivedOverlays = useCallback(");
  const systemMarkerStart = source.indexOf(
    "createSystemMarkersRef.current",
    refreshStart,
  );
  const systemMarkerEnd = source.indexOf("if (replaySnapshot && replaySnapshotSession && replayBars.length) {", systemMarkerStart);
  assert.ok(refreshStart >= 0);
  assert.ok(systemMarkerStart > refreshStart);
  assert.ok(systemMarkerEnd > systemMarkerStart);

  const preSystemMarkerCleanup = source.slice(refreshStart, systemMarkerStart);
  assert.doesNotMatch(preSystemMarkerCleanup, /systemTradeGroup|systemNoteGroup|systemPositionOverlayId/);

  const systemMarkerBranch = source.slice(systemMarkerStart, systemMarkerEnd);
  assert.match(systemMarkerBranch, /createSystemMarkersRef\.current/);
  assert.match(systemMarkerBranch, /systemTradeGroup/);
  assert.match(systemMarkerBranch, /systemNoteGroup/);
  assert.match(systemMarkerBranch, /systemPositionOverlayId/);
});
