// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_SCHEMA_VERSION = 1;
const MAX_CACHE_JSON_CHARS = 3_000_000;
const MAX_CATALOG_ITEMS = 10_000;
const FOLDER_PREFERENCE_KEY = "zinuto.marketDataAcquisition.folder.v1";
const CATALOG_CACHE_PREFIX = "zinuto.marketDataAcquisition.catalog.v1";
const SAFE_GRANT_ID = /^acquisition-grant-[A-Za-z0-9_-]{8,96}$/u;

export type MarketDataAcquisitionFolderPreference = {
  displayPath: string;
  grantId: string;
};

type CatalogCacheId = "akshare" | "ccxt-binance" | "ccxt-okx";

type CatalogCacheRecord<T> = {
  items: T[];
  updatedAt: number;
};

type StoredCatalogCacheRecord = CatalogCacheRecord<unknown> & {
  version: number;
};

type StoredFolderPreference = MarketDataAcquisitionFolderPreference & {
  version: number;
};

type UseMarketDataCatalogInput<T> = {
  cacheId: CatalogCacheId;
  isItem: (value: unknown) => value is T;
  load: (signal: AbortSignal) => Promise<T[]>;
};

const readDefaultStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseStoredJson = (
  raw: string | null,
): Record<string, unknown> | null => {
  if (!raw || raw.length > MAX_CACHE_JSON_CHARS) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const catalogStorageKey = (cacheId: CatalogCacheId): string =>
  `${CATALOG_CACHE_PREFIX}.${cacheId}`;

export const readMarketDataCatalogCache = <T>(
  cacheId: CatalogCacheId,
  isItem: (value: unknown) => value is T,
  storage: Storage | null = readDefaultStorage(),
): CatalogCacheRecord<T> | null => {
  if (!storage) {
    return null;
  }
  let parsed: Record<string, unknown> | null;
  try {
    parsed = parseStoredJson(storage.getItem(catalogStorageKey(cacheId)));
  } catch {
    return null;
  }
  if (
    !parsed ||
    parsed.version !== CACHE_SCHEMA_VERSION ||
    !Number.isSafeInteger(parsed.updatedAt) ||
    Number(parsed.updatedAt) <= 0 ||
    !Array.isArray(parsed.items) ||
    parsed.items.length === 0 ||
    parsed.items.length > MAX_CATALOG_ITEMS ||
    !parsed.items.every(isItem)
  ) {
    return null;
  }
  return {
    items: parsed.items,
    updatedAt: Number(parsed.updatedAt),
  };
};

export const writeMarketDataCatalogCache = <T>(
  cacheId: CatalogCacheId,
  items: T[],
  updatedAt: number,
  storage: Storage | null = readDefaultStorage(),
): void => {
  if (
    !storage ||
    items.length === 0 ||
    items.length > MAX_CATALOG_ITEMS ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt <= 0
  ) {
    return;
  }
  const record: StoredCatalogCacheRecord = {
    version: CACHE_SCHEMA_VERSION,
    items,
    updatedAt,
  };
  try {
    storage.setItem(catalogStorageKey(cacheId), JSON.stringify(record));
  } catch {
    // Catalog caching is an optimization; a full storage area must not block use.
  }
};

export const readMarketDataAcquisitionFolderPreference = (
  storage: Storage | null = readDefaultStorage(),
): MarketDataAcquisitionFolderPreference | null => {
  if (!storage) {
    return null;
  }
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

export const useMarketDataCatalog = <T>({
  cacheId,
  isItem,
  load,
}: UseMarketDataCatalogInput<T>) => {
  const initialCacheRef = useRef<CatalogCacheRecord<T> | null>(null);
  const initialCacheReadRef = useRef(false);
  if (!initialCacheReadRef.current) {
    initialCacheRef.current = readMarketDataCatalogCache(cacheId, isItem);
    initialCacheReadRef.current = true;
  }
  const [catalog, setCatalog] = useState<CatalogCacheRecord<T>>(
    () => initialCacheRef.current ?? { items: [], updatedAt: 0 },
  );
  const [loading, setLoading] = useState(
    () => initialCacheRef.current === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  const loadCatalog = useCallback(
    async (mode: "initial" | "refresh") => {
      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      setLoadFailed(false);
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const items = await load(controller.signal);
        if (
          controller.signal.aborted ||
          requestGenerationRef.current !== requestGeneration ||
          items.length === 0 ||
          items.length > MAX_CATALOG_ITEMS ||
          !items.every(isItem)
        ) {
          if (!controller.signal.aborted) {
            setLoadFailed(true);
          }
          return;
        }
        const updatedAt = Date.now();
        const nextCatalog = { items, updatedAt };
        setCatalog(nextCatalog);
        writeMarketDataCatalogCache(cacheId, items, updatedAt);
      } catch {
        if (
          !controller.signal.aborted &&
          requestGenerationRef.current === requestGeneration
        ) {
          setLoadFailed(true);
        }
      } finally {
        if (requestGenerationRef.current === requestGeneration) {
          setLoading(false);
          setRefreshing(false);
          if (activeRequestRef.current === controller) {
            activeRequestRef.current = null;
          }
        }
      }
    },
    [cacheId, isItem, load],
  );

  useEffect(() => {
    if (initialCacheRef.current) {
      return;
    }
    void loadCatalog("initial");
  }, [loadCatalog]);

  useEffect(
    () => () => {
      requestGenerationRef.current += 1;
      activeRequestRef.current?.abort();
    },
    [],
  );

  return {
    items: catalog.items,
    updatedAt: catalog.updatedAt,
    loading,
    refreshing,
    loadFailed,
    refresh: () => loadCatalog(catalog.items.length ? "refresh" : "initial"),
  };
};
