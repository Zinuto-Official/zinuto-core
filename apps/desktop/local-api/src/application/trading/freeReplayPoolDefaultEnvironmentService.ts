// SPDX-License-Identifier: GPL-3.0-only

import { getAppPreferences, setAppUiSettings } from "../appPreferencesService.js";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";

export type FreeReplayPoolDefaultEnvironment = {
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  marketPresetId: string;
};

export type FreeReplayPoolDefaultEnvironmentRecord = Record<
  string,
  FreeReplayPoolDefaultEnvironment
>;

const SETTINGS_KEY = "freeReplayPoolDefaultEnvironmentById";

const normalizeAssetClass = (
  value: unknown,
): FreeReplayPoolDefaultEnvironment["assetClass"] | null => {
  if (
    value === "STOCK" ||
    value === "FUTURES" ||
    value === "FOREX" ||
    value === "CRYPTO"
  ) {
    return value;
  }
  return null;
};

const normalizeEnvironment = (
  value: unknown,
): FreeReplayPoolDefaultEnvironment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const assetClass = normalizeAssetClass(record.assetClass);
  const marketPresetId = String(record.marketPresetId ?? "").trim();
  if (
    !assetClass ||
    !marketPresetId ||
    marketPresetId.length > INPUT_LIMITS.tradingPresetNameChars
  ) {
    return null;
  }
  return {
    assetClass,
    marketPresetId,
  };
};

const normalizeEnvironmentRecord = (
  value: unknown,
): FreeReplayPoolDefaultEnvironmentRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([poolIdRaw, environmentRaw]) => {
      const poolId = String(poolIdRaw ?? "").trim();
      const environment = normalizeEnvironment(environmentRaw);
      return poolId && environment ? ([poolId, environment] as const) : null;
    })
    .filter(
      (
        entry,
      ): entry is readonly [string, FreeReplayPoolDefaultEnvironment] =>
        Boolean(entry),
    )
    .sort((left, right) => left[0].localeCompare(right[0], "en"));
  return Object.fromEntries(entries);
};

export const listFreeReplayPoolDefaultEnvironments =
  (): FreeReplayPoolDefaultEnvironmentRecord =>
    normalizeEnvironmentRecord(getAppPreferences().uiSettings[SETTINGS_KEY]);

export const setFreeReplayPoolDefaultEnvironment = (
  poolIdRaw: string,
  environmentRaw: FreeReplayPoolDefaultEnvironment,
): FreeReplayPoolDefaultEnvironmentRecord => {
  const poolId = String(poolIdRaw ?? "").trim();
  const environment = normalizeEnvironment(environmentRaw);
  if (!poolId || !environment) {
    return listFreeReplayPoolDefaultEnvironments();
  }
  const preferences = getAppPreferences();
  const nextEnvironments = {
    ...normalizeEnvironmentRecord(preferences.uiSettings[SETTINGS_KEY]),
    [poolId]: environment,
  };
  const nextUiSettings = {
    ...preferences.uiSettings,
    [SETTINGS_KEY]: nextEnvironments,
  };
  setAppUiSettings(nextUiSettings);
  return listFreeReplayPoolDefaultEnvironments();
};
