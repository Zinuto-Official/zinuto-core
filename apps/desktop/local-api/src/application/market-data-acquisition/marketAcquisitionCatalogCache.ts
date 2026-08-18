// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  DesktopMarketDataAcquisitionMarketId,
  DesktopMarketDataAcquisitionSourcePlanId,
} from '@zinuto/shared/contracts-desktop/api';

export const MARKET_ACQUISITION_CATALOG_CACHE_TTL_MS =
  7 * 24 * 60 * 60 * 1_000;

// Version 2 invalidates catalogs written by the old Windows code-page
// boundary. Those records may contain replacement characters that cannot be
// repaired after the original byte stream was decoded incorrectly.
const CATALOG_CACHE_SCHEMA_VERSION = 2;
const MAX_CACHE_FILE_BYTES = 6_000_000;
const MAX_CATALOG_INSTRUMENTS = 20_000;
const SAFE_CATALOG_ID = /^[A-Z0-9_]{1,64}$/u;

export type MarketAcquisitionCatalogCacheInstrument = {
  symbol: string;
  name: string;
  exchangeId: string | null;
};

export type MarketAcquisitionCatalogCacheResult = {
  instruments: MarketAcquisitionCatalogCacheInstrument[];
  cachedAt: string;
  cacheState: 'FRESH' | 'STALE';
};

type CatalogCacheRecord = {
  schemaVersion: number;
  marketId: DesktopMarketDataAcquisitionMarketId;
  sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId;
  connectorFingerprint: string;
  cachedAt: string;
  instruments: MarketAcquisitionCatalogCacheInstrument[];
};

type CatalogCacheLoadInput = {
  marketId: DesktopMarketDataAcquisitionMarketId;
  sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId;
  connectorFingerprint: string;
  forceRefresh: boolean;
  load: () => Promise<MarketAcquisitionCatalogCacheInstrument[]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isInstrument = (
  value: unknown,
): value is MarketAcquisitionCatalogCacheInstrument => {
  if (!isRecord(value)) return false;
  const symbol = typeof value.symbol === 'string' ? value.symbol.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const exchangeId = value.exchangeId;
  return (
    symbol.length > 0 &&
    symbol.length <= 64 &&
    name.length > 0 &&
    name.length <= 128 &&
    !name.includes('\uFFFD') &&
    (exchangeId === null ||
      (typeof exchangeId === 'string' &&
        exchangeId.trim().length > 0 &&
        exchangeId.trim().length <= 64))
  );
};

const cloneInstruments = (
  instruments: readonly MarketAcquisitionCatalogCacheInstrument[],
): MarketAcquisitionCatalogCacheInstrument[] =>
  instruments.map((instrument) => ({ ...instrument }));

const parseCacheRecord = ({
  raw,
  marketId,
  sourcePlanId,
  connectorFingerprint,
}: {
  raw: string;
  marketId: DesktopMarketDataAcquisitionMarketId;
  sourcePlanId: DesktopMarketDataAcquisitionSourcePlanId;
  connectorFingerprint: string;
}): CatalogCacheRecord | null => {
  if (Buffer.byteLength(raw, 'utf8') > MAX_CACHE_FILE_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== CATALOG_CACHE_SCHEMA_VERSION ||
    parsed.marketId !== marketId ||
    parsed.sourcePlanId !== sourcePlanId ||
    parsed.connectorFingerprint !== connectorFingerprint ||
    typeof parsed.cachedAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.cachedAt)) ||
    !Array.isArray(parsed.instruments) ||
    parsed.instruments.length === 0 ||
    parsed.instruments.length > MAX_CATALOG_INSTRUMENTS ||
    !parsed.instruments.every(isInstrument)
  ) {
    return null;
  }
  return {
    schemaVersion: CATALOG_CACHE_SCHEMA_VERSION,
    marketId,
    sourcePlanId,
    connectorFingerprint,
    cachedAt: parsed.cachedAt,
    instruments: cloneInstruments(parsed.instruments),
  };
};

const normalizeLoadedInstruments = (
  instruments: readonly MarketAcquisitionCatalogCacheInstrument[],
): MarketAcquisitionCatalogCacheInstrument[] => {
  if (
    instruments.length === 0 ||
    instruments.length > MAX_CATALOG_INSTRUMENTS ||
    !instruments.every(isInstrument)
  ) {
    throw new Error('MARKET_ACQUISITION_CATALOG_INVALID');
  }
  const unique = new Map<string, MarketAcquisitionCatalogCacheInstrument>();
  for (const instrument of instruments) {
    const symbol = instrument.symbol.trim();
    if (!unique.has(symbol)) {
      unique.set(symbol, {
        symbol,
        name: instrument.name.trim(),
        exchangeId:
          typeof instrument.exchangeId === 'string'
            ? instrument.exchangeId.trim()
            : null,
      });
    }
  }
  return [...unique.values()];
};

export const createMarketAcquisitionCatalogCache = ({
  cacheDir,
  now,
}: {
  cacheDir: string;
  now: () => Date;
}) => {
  const loadsInFlight = new Map<
    string,
    { forceRefresh: boolean; load: Promise<MarketAcquisitionCatalogCacheResult> }
  >();

  const resolveFilePath = ({
    marketId,
    sourcePlanId,
  }: Pick<CatalogCacheLoadInput, 'marketId' | 'sourcePlanId'>): string => {
    if (!SAFE_CATALOG_ID.test(marketId) || !SAFE_CATALOG_ID.test(sourcePlanId)) {
      throw new Error('MARKET_ACQUISITION_CATALOG_CACHE_KEY_INVALID');
    }
    return path.join(cacheDir, `${marketId}--${sourcePlanId}.json`);
  };

  const readRecord = async (
    input: Pick<
      CatalogCacheLoadInput,
      'marketId' | 'sourcePlanId' | 'connectorFingerprint'
    >,
  ): Promise<CatalogCacheRecord | null> => {
    const filePath = resolveFilePath(input);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return parseCacheRecord({ raw, ...input });
  };

  const writeRecord = async (record: CatalogCacheRecord): Promise<void> => {
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const filePath = resolveFilePath(record);
    const contents = JSON.stringify(record);
    if (Buffer.byteLength(contents, 'utf8') > MAX_CACHE_FILE_BYTES) {
      throw new Error('MARKET_ACQUISITION_CATALOG_CACHE_TOO_LARGE');
    }
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
      await handle.close();
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  };

  const isFresh = (record: CatalogCacheRecord): boolean =>
    now().getTime() - Date.parse(record.cachedAt) <
    MARKET_ACQUISITION_CATALOG_CACHE_TTL_MS;

  const load = async (
    input: CatalogCacheLoadInput,
  ): Promise<MarketAcquisitionCatalogCacheResult> => {
    const existingRecord = await readRecord(input);
    if (existingRecord && !input.forceRefresh && isFresh(existingRecord)) {
      return {
        instruments: cloneInstruments(existingRecord.instruments),
        cachedAt: existingRecord.cachedAt,
        cacheState: 'FRESH',
      };
    }
    try {
      const instruments = normalizeLoadedInstruments(await input.load());
      const record: CatalogCacheRecord = {
        schemaVersion: CATALOG_CACHE_SCHEMA_VERSION,
        marketId: input.marketId,
        sourcePlanId: input.sourcePlanId,
        connectorFingerprint: input.connectorFingerprint,
        cachedAt: now().toISOString(),
        instruments,
      };
      await writeRecord(record);
      return {
        instruments: cloneInstruments(record.instruments),
        cachedAt: record.cachedAt,
        cacheState: 'FRESH',
      };
    } catch (error) {
      if (existingRecord) {
        return {
          instruments: cloneInstruments(existingRecord.instruments),
          cachedAt: existingRecord.cachedAt,
          cacheState: 'STALE',
        };
      }
      throw error;
    }
  };

  return {
    async readOrLoad(
      input: CatalogCacheLoadInput,
    ): Promise<MarketAcquisitionCatalogCacheResult> {
      const key = `${input.marketId}:${input.sourcePlanId}:${input.connectorFingerprint}`;
      const existing = loadsInFlight.get(key);
      if (existing) {
        if (!input.forceRefresh || existing.forceRefresh) {
          const result = await existing.load;
          return { ...result, instruments: cloneInstruments(result.instruments) };
        }
        await existing.load;
      }
      const started = load(input);
      loadsInFlight.set(key, { forceRefresh: input.forceRefresh, load: started });
      try {
        const result = await started;
        return { ...result, instruments: cloneInstruments(result.instruments) };
      } finally {
        if (loadsInFlight.get(key)?.load === started) loadsInFlight.delete(key);
      }
    },
  };
};
