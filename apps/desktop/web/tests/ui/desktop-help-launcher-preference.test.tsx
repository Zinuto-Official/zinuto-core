// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { NormalizedAppPreferences } from "../../src/app-shell/appPreferencesModel";
import {
  commitRuntimeUiSettingsPersistence,
  establishRecoveredPreferencesPersistenceRebase,
  mergeRecoveredRuntimePreferences,
  prepareRuntimeUiSettingsPersistence,
  registerRuntimePreferencesSnapshotReader,
  resetRuntimePreferencesPersistenceRebase,
  resetRuntimePreferencesRecovery,
} from "../../src/app-shell/runtimePreferencesRecovery";
import { useAppUiBootstrapState } from "../../src/app-shell/useAppUiBootstrapState";
import type { UiSettings } from "../../src/frontend-kernel/appTypes";

const snapshot = (
  uiSettings: UiSettings,
): NormalizedAppPreferences => ({
  uiSettings,
  dataPoolRemovedSymbolsBySourceId: {},
});

const renderBootstrapPreference = (initialUiSettings: UiSettings): string => {
  const BootstrapProbe = () => {
    const { showDesktopHelpLauncher } = useAppUiBootstrapState({
      initialHint: "",
      initialUiSettings,
    });
    return (
      <output data-show-desktop-help-launcher={showDesktopHelpLauncher}>
        {String(showDesktopHelpLauncher)}
      </output>
    );
  };
  return renderToStaticMarkup(<BootstrapProbe />);
};

test("desktop Help launcher bootstrap defaults missing or invalid preferences to visible", () => {
  assert.match(
    renderBootstrapPreference({}),
    /data-show-desktop-help-launcher="true">true</,
  );
  assert.match(
    renderBootstrapPreference({
      showDesktopHelpLauncher: "false",
    } as unknown as UiSettings),
    /data-show-desktop-help-launcher="true">true</,
  );
});

test("desktop Help launcher bootstrap honors an explicit hidden preference", () => {
  assert.match(
    renderBootstrapPreference({ showDesktopHelpLauncher: false }),
    /data-show-desktop-help-launcher="false">false</,
  );
});

test("desktop Help launcher hide survives preference recovery and can persist true again", () => {
  resetRuntimePreferencesRecovery();
  resetRuntimePreferencesPersistenceRebase();
  let current = snapshot({ showDesktopHelpLauncher: true });
  const unregister = registerRuntimePreferencesSnapshotReader(() => current);

  current = snapshot({ showDesktopHelpLauncher: false });
  const recovery = mergeRecoveredRuntimePreferences(
    snapshot({ showDesktopHelpLauncher: true }),
  );

  assert.equal(recovery.uiSettingsChanged, true);
  assert.equal(
    recovery.preferences.uiSettings.showDesktopHelpLauncher,
    false,
  );

  establishRecoveredPreferencesPersistenceRebase({
    authoritative: recovery.preferences,
    runtime: recovery.runtimeSnapshot,
  });
  const restored = snapshot({ showDesktopHelpLauncher: true }).uiSettings;
  const persisted = prepareRuntimeUiSettingsPersistence(restored);
  assert.equal(persisted.showDesktopHelpLauncher, true);

  commitRuntimeUiSettingsPersistence({
    current: restored,
    persisted,
  });
  assert.equal(
    prepareRuntimeUiSettingsPersistence(restored).showDesktopHelpLauncher,
    true,
  );

  unregister();
  resetRuntimePreferencesRecovery();
  resetRuntimePreferencesPersistenceRebase();
});
