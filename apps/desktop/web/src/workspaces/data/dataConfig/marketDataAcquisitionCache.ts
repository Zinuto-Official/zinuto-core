// SPDX-License-Identifier: GPL-3.0-only

const CACHE_SCHEMA_VERSION = 1;
const MAX_CACHE_JSON_CHARS = 3_000_000;
const FOLDER_PREFERENCE_KEY = "zinuto.marketDataAcquisition.folder.v1";
const SAFE_GRANT_ID = /^acquisition-grant-[A-Za-z0-9_-]{8,96}$/u;

export type MarketDataAcquisitionFolderPreference = {
  displayPath: string;
  grantId: string;
};

type StoredFolderPreference = MarketDataAcquisitionFolderPreference & {
  version: number;
};

const readDefaultStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseStoredJson = (raw: string | null): Record<string, unknown> | null => {
  if (!raw || raw.length > MAX_CACHE_JSON_CHARS) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readMarketDataAcquisitionFolderPreference = (
  storage: Storage | null = readDefaultStorage(),
): MarketDataAcquisitionFolderPreference | null => {
  if (!storage) return null;
  let parsed: Record<string, unknown> | null;
  try {
    parsed = parseStoredJson(storage.getItem(FOLDER_PREFERENCE_KEY));
  } catch {
    return null;
  }
  const grantId = String(parsed?.grantId ?? "").trim();
  const displayPath = String(parsed?.displayPath ?? "").trim();
  if (
    parsed?.version !== CACHE_SCHEMA_VERSION ||
    !SAFE_GRANT_ID.test(grantId) ||
    displayPath.length === 0 ||
    displayPath.length > 4_096
  ) {
    return null;
  }
  return { grantId, displayPath };
};

export const writeMarketDataAcquisitionFolderPreference = (
  preference: MarketDataAcquisitionFolderPreference,
  storage: Storage | null = readDefaultStorage(),
): void => {
  const grantId = String(preference.grantId || "").trim();
  const displayPath = String(preference.displayPath || "").trim();
  if (
    !storage ||
    !SAFE_GRANT_ID.test(grantId) ||
    displayPath.length === 0 ||
    displayPath.length > 4_096
  ) {
    return;
  }
  const record: StoredFolderPreference = {
    version: CACHE_SCHEMA_VERSION,
    grantId,
    displayPath,
  };
  try {
    storage.setItem(FOLDER_PREFERENCE_KEY, JSON.stringify(record));
  } catch {
    // Native authorization remains valid even if this convenience cache is full.
  }
};
