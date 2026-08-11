// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedAppPreferences } from "../../src/app-shell/appPreferencesModel";
import {
  commitRuntimeRemovedSymbolsPersistence,
  commitRuntimeUiSettingsPersistence,
  establishRecoveredPreferencesPersistenceRebase,
  mergeRecoveredRuntimePreferences,
  persistRuntimePreferenceWithRetry,
  prepareRuntimeRemovedSymbolsPersistence,
  prepareRuntimeUiSettingsPersistence,
  registerRuntimePreferencesSnapshotReader,
  resetRuntimePreferencesPersistenceRebase,
  resetRuntimePreferencesRecovery,
} from "../../src/app-shell/runtimePreferencesRecovery";

const snapshot = (
  uiSettings: Record<string, unknown>,
  removed: Record<string, string[]> = {},
): NormalizedAppPreferences => ({
  uiSettings,
  dataPoolRemovedSymbolsBySourceId: removed,
});

test("runtime preference recovery merges only fields changed during degraded boot", () => {
  resetRuntimePreferencesRecovery();
  resetRuntimePreferencesPersistenceRebase();
  let current = snapshot(
    {
      themeMode: "dark",
      trainerDisplayPeriod: "1d",
      buyLotInput: "1",
      lotSizeByPool: { A: 1, B: 2 },
    },
    { sourceA: ["AAPL"] },
  );
  const unregister = registerRuntimePreferencesSnapshotReader(() => current);

  current = snapshot(
    {
      themeMode: "light",
      trainerDisplayPeriod: "1d",
      buyLotInput: "1",
      lotSizeByPool: { A: 9, B: 2 },
    },
    { sourceA: ["MSFT"] },
  );
  const recovery = mergeRecoveredRuntimePreferences(snapshot(
    {
      themeMode: "system",
      trainerDisplayPeriod: "1h",
      buyLotInput: "5",
      lotSizeByPool: { A: 1, B: 7, C: 3 },
    },
    { sourceA: ["TSLA"], sourceB: ["NVDA"] },
  ));
  const merged = recovery.preferences;

  assert.equal(recovery.hasRuntimeSnapshot, true);
  assert.equal(recovery.uiSettingsChanged, true);
  assert.equal(recovery.removedSymbolsChanged, true);
  assert.equal(merged.uiSettings.themeMode, "light");
  assert.equal(merged.uiSettings.trainerDisplayPeriod, "1h");
  assert.equal(merged.uiSettings.buyLotInput, "5");
  assert.deepEqual(merged.uiSettings.lotSizeByPool, { A: 9, B: 7, C: 3 });
  assert.deepEqual(merged.dataPoolRemovedSymbolsBySourceId, {
    sourceA: ["MSFT"],
    sourceB: ["NVDA"],
  });

  establishRecoveredPreferencesPersistenceRebase({
    authoritative: merged,
    runtime: recovery.runtimeSnapshot,
  });
  const nextRuntimeUi = {
    ...current.uiSettings,
    buyLotInput: "9",
  };
  const nextPersistedUi = prepareRuntimeUiSettingsPersistence(
    nextRuntimeUi,
  );
  assert.equal(nextPersistedUi.themeMode, "light");
  assert.equal(nextPersistedUi.trainerDisplayPeriod, "1h");
  assert.equal(nextPersistedUi.buyLotInput, "9");
  commitRuntimeUiSettingsPersistence({
    current: nextRuntimeUi,
    persisted: nextPersistedUi,
  });

  const nextRuntimeRemovedSymbols = { sourceA: ["GOOG"] };
  const nextPersistedRemovedSymbols =
    prepareRuntimeRemovedSymbolsPersistence(nextRuntimeRemovedSymbols);
  assert.deepEqual(nextPersistedRemovedSymbols, {
    sourceA: ["GOOG"],
    sourceB: ["NVDA"],
  });
  commitRuntimeRemovedSymbolsPersistence({
    current: nextRuntimeRemovedSymbols,
    persisted: nextPersistedRemovedSymbols,
  });

  unregister();
  resetRuntimePreferencesRecovery();
  resetRuntimePreferencesPersistenceRebase();
});

test("runtime preference persistence retries transient local bridge failures", async () => {
  let attempts = 0;
  const result = await persistRuntimePreferenceWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("transient bridge failure");
    }
    return "persisted";
  }, [0, 0, 0]);

  assert.equal(result, "persisted");
  assert.equal(attempts, 3);
});
