// SPDX-License-Identifier: GPL-3.0-only

import {
  SYSTEM_BARS_SEED_VERSION,
  generateSystemSeedBars,
  getSystemSeedStorageEstimatesByPoolId,
  listSystemSeedInstruments,
  resolveSystemSeedInstrumentMetadata,
  type SystemSeedInstrumentDefinition
} from './ports/infrastructure/db/database.js';
import {
  getMarketBarCount,
  removeMarketInstrumentData,
  replaceMarketBarsForInstrument
} from './ports/infrastructure/db/marketDatabase.js';
import { createId } from '../kernel/id.js';
import { nowIso } from '../kernel/time.js';
import {
  deleteInstrumentById,
  insertSystemInstrument,
  listSystemInstrumentKeys,
  listSystemInstrumentSeedRows,
  readAppMetaValue,
  readSystemInstrumentBySymbol,
  updateSystemInstrumentMetadata,
  upsertAppMetaValue,
  type SystemMarketSeedInstrumentRow as InstrumentRow,
} from './ports/infrastructure/db/system/systemMarketSeedStore.js';

type SeedServiceDeps = {
  updateInstrumentBarCount: (instrumentId: string, barCount: number) => void;
  marketData?: {
    getMarketBarCount: typeof getMarketBarCount;
    removeMarketInstrumentData: typeof removeMarketInstrumentData;
    replaceMarketBarsForInstrument: typeof replaceMarketBarsForInstrument;
  };
};

type SeedProgressHandler = (completed: number, total: number) => void;
type SeedReconcileOptions = {
  signal?: AbortSignal;
  marketDataAlreadyCleared?: boolean;
};

const SYSTEM_BARS_SEED_METADATA_META_KEY = 'system_bars_seed_metadata_version';
const SYSTEM_BARS_SEED_INSTRUMENT_META_KEY_PREFIX = 'system_bars_seed_instrument:';
let systemMarketSeedMetadataReady = false;
let systemMarketSeedMetadataEnsurePromise: Promise<void> | null = null;
const systemInstrumentHydrationPromises = new Map<string, Promise<number>>();
let systemSeedStorageBytesCache:
  | {
      version: string;
      byPoolId: Record<string, number>;
    }
  | null = null;

const buildSystemInstrumentKey = (symbol: string, baseTimeframe: string): string =>
  `${String(baseTimeframe || '').trim().toLowerCase()}::${String(symbol || '').trim().toUpperCase()}`;

const getSystemInstrumentSeedMetaKey = (instrumentId: string): string =>
  `${SYSTEM_BARS_SEED_INSTRUMENT_META_KEY_PREFIX}${instrumentId}`;

const getSystemSeedInstrumentMetadataOrThrow = (seedInstrument: SystemSeedInstrumentDefinition) => {
  const metadata = resolveSystemSeedInstrumentMetadata(seedInstrument.symbol, seedInstrument.baseTimeframe);
  if (!metadata || metadata.barCount <= 0 || !metadata.barsVersionToken) {
    throw new Error('SYSTEM_SEED_METADATA_MISSING');
  }
  return metadata;
};

const applySystemInstrumentMetadata = (
  instrumentId: string,
  seedInstrument: SystemSeedInstrumentDefinition
): InstrumentRow => {
  const metadata = getSystemSeedInstrumentMetadataOrThrow(seedInstrument);
  return updateSystemInstrumentMetadata({
    id: instrumentId,
    symbol: seedInstrument.symbol.trim().toUpperCase(),
    baseTimeframe: seedInstrument.baseTimeframe,
    name: seedInstrument.name,
    timeZone: seedInstrument.timeZone,
    minTradeStep: seedInstrument.minTradeStep,
    metadata,
  });
};

const ensureSystemInstrument = (seedInstrument: SystemSeedInstrumentDefinition): InstrumentRow => {
  const normalized = seedInstrument.symbol.trim().toUpperCase();
  const baseTimeframe = seedInstrument.baseTimeframe;
  const existing = readSystemInstrumentBySymbol(normalized, baseTimeframe);
  if (existing) {
    return applySystemInstrumentMetadata(existing.id, seedInstrument);
  }
  const metadata = getSystemSeedInstrumentMetadataOrThrow(seedInstrument);
  const id = createId();
  return insertSystemInstrument({
    id,
    symbol: normalized,
    baseTimeframe,
    name: seedInstrument.name,
    timeZone: seedInstrument.timeZone,
    minTradeStep: seedInstrument.minTradeStep,
    metadata,
    createdAt: nowIso(),
  });
};

const reconcileSystemMarketSeedMetadata = async (
  deps: SeedServiceDeps,
  onSymbolProgress?: SeedProgressHandler,
  options: SeedReconcileOptions = {},
): Promise<void> => {
  options.signal?.throwIfAborted();
  const seedInstruments = listSystemSeedInstruments();
  const keep = new Set(seedInstruments.map((item) => buildSystemInstrumentKey(item.symbol, item.baseTimeframe)));
  const staleSystemInstruments = listSystemInstrumentSeedRows();

  for (const item of staleSystemInstruments) {
    options.signal?.throwIfAborted();
    const symbol = item.symbol.trim().toUpperCase();
    const key = buildSystemInstrumentKey(symbol, item.baseTimeframe);
    if (keep.has(key)) {
      continue;
    }
    if (!options.marketDataAlreadyCleared) {
      await (deps.marketData?.removeMarketInstrumentData ?? removeMarketInstrumentData)(
        item.id,
      );
      options.signal?.throwIfAborted();
    }
    deleteInstrumentById(item.id);
  }

  const totalSymbols = seedInstruments.length;
  let completedSymbols = 0;
  for (const seedInstrument of seedInstruments) {
    options.signal?.throwIfAborted();
    ensureSystemInstrument(seedInstrument);
    completedSymbols += 1;
    onSymbolProgress?.(completedSymbols, totalSymbols);
  }

  options.signal?.throwIfAborted();
  upsertAppMetaValue({
    key: SYSTEM_BARS_SEED_METADATA_META_KEY,
    value: SYSTEM_BARS_SEED_VERSION,
    updatedAt: nowIso(),
  });
  systemMarketSeedMetadataReady = true;
};

const shouldReconcileSystemMarketSeedMetadata = (): boolean => {
  if (readAppMetaValue(SYSTEM_BARS_SEED_METADATA_META_KEY) !== SYSTEM_BARS_SEED_VERSION) {
    return true;
  }
  const expected = new Map(
    listSystemSeedInstruments().map((item) => [
      buildSystemInstrumentKey(item.symbol, item.baseTimeframe),
      resolveSystemSeedInstrumentMetadata(item.symbol, item.baseTimeframe)?.barCount ?? 0,
    ]),
  );
  const rows = listSystemInstrumentKeys();
  for (const rowItem of rows) {
    const key = buildSystemInstrumentKey(String(rowItem.symbol || ''), String(rowItem.baseTimeframe || ''));
    const expectedBarCount = expected.get(key);
    if (expectedBarCount === undefined) {
      return true;
    }
    const storedBarCount = Math.max(0, Math.floor(Number(rowItem.barCount) || 0));
    // A stored bar_count of 0 means the seeded rows were never hydrated (or
    // the dataset is empty); treat that as needing a reconcile so the seed
    // metadata is re-established with the real bar counts.
    if (expectedBarCount > 0 && storedBarCount !== expectedBarCount) {
      return true;
    }
  }
  return rows.length !== expected.size;
};

const ensureSystemMarketSeedMetadataReady = async (deps: SeedServiceDeps): Promise<void> => {
  if (systemMarketSeedMetadataReady) {
    return;
  }
  if (systemMarketSeedMetadataEnsurePromise) {
    await systemMarketSeedMetadataEnsurePromise;
    return;
  }

  systemMarketSeedMetadataEnsurePromise = (async () => {
    if (systemMarketSeedMetadataReady) {
      return;
    }
    if (shouldReconcileSystemMarketSeedMetadata()) {
      await reconcileSystemMarketSeedMetadata(deps);
      return;
    }
    systemMarketSeedMetadataReady = true;
  })();

  try {
    await systemMarketSeedMetadataEnsurePromise;
  } finally {
    systemMarketSeedMetadataEnsurePromise = null;
  }
};

export const ensureSystemMarketSeedReady = async (deps: SeedServiceDeps): Promise<void> => {
  await ensureSystemMarketSeedMetadataReady(deps);
};

const findSystemSeedInstrumentForRow = (instrument: InstrumentRow): SystemSeedInstrumentDefinition | null => {
  if (String(instrument.market || '').trim().toUpperCase() !== 'SYSTEM') {
    return null;
  }
  const normalizedSymbol = String(instrument.symbol || '').trim().toUpperCase();
  const normalizedBaseTimeframe = String(instrument.base_timeframe || '').trim().toLowerCase();
  if (!normalizedSymbol || !normalizedBaseTimeframe) {
    return null;
  }
  return listSystemSeedInstruments().find(
    (item) =>
      item.symbol.trim().toUpperCase() === normalizedSymbol &&
      item.baseTimeframe === normalizedBaseTimeframe,
  ) ?? null;
};

const readSystemInstrumentHydrationVersion = (instrumentId: string): string => {
  return readAppMetaValue(getSystemInstrumentSeedMetaKey(instrumentId));
};

const writeSystemInstrumentHydrationVersion = (instrumentId: string, version: string): void => {
  upsertAppMetaValue({
    key: getSystemInstrumentSeedMetaKey(instrumentId),
    value: version,
    updatedAt: nowIso(),
  });
};

const hydrateSystemInstrumentMarketBars = async (
  seedInstrument: SystemSeedInstrumentDefinition,
  deps: SeedServiceDeps
): Promise<number> => {
  const instrument = ensureSystemInstrument(seedInstrument);
  const metadata = getSystemSeedInstrumentMetadataOrThrow(seedInstrument);
  const marketCount = Math.max(
    0,
    await (deps.marketData?.getMarketBarCount ?? getMarketBarCount)(
      instrument.id,
    ),
  );
  if (
    marketCount === metadata.barCount &&
    readSystemInstrumentHydrationVersion(instrument.id) === metadata.barsVersionToken
  ) {
    return metadata.barCount;
  }

  const bars = generateSystemSeedBars(seedInstrument.symbol, seedInstrument.baseTimeframe);
  if (bars.length !== metadata.barCount) {
    throw new Error('SYSTEM_SEED_ROW_COUNT_MISMATCH');
  }
  await (
    deps.marketData?.replaceMarketBarsForInstrument
    ?? replaceMarketBarsForInstrument
  )(instrument.id, instrument.symbol, bars, {
    prewarmHotTimelines: false,
  });
  applySystemInstrumentMetadata(instrument.id, seedInstrument);
  deps.updateInstrumentBarCount(instrument.id, metadata.barCount);
  writeSystemInstrumentHydrationVersion(instrument.id, metadata.barsVersionToken);
  return metadata.barCount;
};

export const ensureInstrumentMarketBarsReady = async (
  deps: SeedServiceDeps,
  instrument: InstrumentRow,
  options: { signal?: AbortSignal } = {},
): Promise<number> => {
  options.signal?.throwIfAborted();
  await ensureSystemMarketSeedMetadataReady(deps);
  options.signal?.throwIfAborted();
  const seedInstrument = findSystemSeedInstrumentForRow(instrument);
  if (seedInstrument) {
    const normalizedInstrumentId = String(instrument.id || '').trim();
    const existingPromise = systemInstrumentHydrationPromises.get(normalizedInstrumentId);
    if (existingPromise) {
      return existingPromise;
    }
    const promise = hydrateSystemInstrumentMarketBars(seedInstrument, deps);
    systemInstrumentHydrationPromises.set(normalizedInstrumentId, promise);
    try {
      return await promise;
    } finally {
      systemInstrumentHydrationPromises.delete(normalizedInstrumentId);
    }
  }
  const marketCount = Math.max(
    0,
    await (deps.marketData?.getMarketBarCount ?? getMarketBarCount)(
      instrument.id,
      options,
    ),
  );
  options.signal?.throwIfAborted();
  if (Math.max(0, Math.floor(instrument.bar_count ?? 0)) !== marketCount) {
    deps.updateInstrumentBarCount(instrument.id, marketCount);
  }
  return marketCount;
};

export const forceReconcileSystemMarketSeedMetadata = async (
  deps: SeedServiceDeps,
  onSymbolProgress?: SeedProgressHandler,
  options: SeedReconcileOptions = {},
): Promise<void> => {
  systemMarketSeedMetadataReady = false;
  systemMarketSeedMetadataEnsurePromise = null;
  await reconcileSystemMarketSeedMetadata(deps, onSymbolProgress, options);
};

export const getSystemSeedStorageBytesByPoolId = (): Record<string, number> => {
  if (systemSeedStorageBytesCache?.version === SYSTEM_BARS_SEED_VERSION) {
    return { ...systemSeedStorageBytesCache.byPoolId };
  }

  const byPoolId = Object.fromEntries(
    Object.entries(getSystemSeedStorageEstimatesByPoolId()).map(([poolId, estimate]) => [
      poolId,
      Math.max(0, Math.floor(Number(estimate.seededDuckDbBytes) || 0)),
    ]),
  ) as Record<string, number>;

  systemSeedStorageBytesCache = {
    version: SYSTEM_BARS_SEED_VERSION,
    byPoolId,
  };
  return { ...byPoolId };
};
