// SPDX-License-Identifier: GPL-3.0-only

type RestoreSystemMarketSeedMetadataDeps = {
  listSystemSeedInstruments: () => Array<{
    symbol: string;
    baseTimeframe: '1m' | '1d';
    name: string;
    timeZone: string;
    minTradeStep: number;
  }>;
  resolveSystemSeedInstrumentMetadata: (
    symbol: string,
    baseTimeframe?: string | null
  ) => {
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
    barsVersionToken: string;
  } | null;
  getSystemInstrumentBySymbol: (
    symbol: string,
    baseTimeframe: '1m' | '1d'
  ) => { id: string; symbol: string } | undefined;
  createId: () => string;
  upsertSystemInstrument: (payload: {
    instrumentId: string;
    symbol: string;
    baseTimeframe: '1m' | '1d';
    name: string;
    timeZone: string;
    minTradeStep: number;
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
    barsVersionToken: string;
    createdAt: string;
  }) => void;
  nowIso: () => string;
};

export const restoreSystemMarketSeedMetadataAfterLocalClearCore = async (
  deps: RestoreSystemMarketSeedMetadataDeps
): Promise<void> => {
  const seedInstruments = deps.listSystemSeedInstruments();
  for (const seedInstrument of seedInstruments) {
    const normalized = seedInstrument.symbol.trim().toUpperCase();
    if (!normalized) {
      continue;
    }
    const baseTimeframe = seedInstrument.baseTimeframe;
    const existing = deps.getSystemInstrumentBySymbol(normalized, baseTimeframe);
    const instrumentId = existing?.id || deps.createId();
    const metadata = deps.resolveSystemSeedInstrumentMetadata(normalized, baseTimeframe);
    if (!metadata || metadata.barCount <= 0 || !metadata.barsVersionToken) {
      throw new Error('SYSTEM_SEED_METADATA_MISSING');
    }
    deps.upsertSystemInstrument({
      instrumentId,
      symbol: normalized,
      baseTimeframe,
      name: seedInstrument.name,
      timeZone: seedInstrument.timeZone,
      minTradeStep: seedInstrument.minTradeStep,
      barCount: metadata.barCount,
      timeStartTs: metadata.timeStartTs,
      timeEndTs: metadata.timeEndTs,
      barsVersionToken: metadata.barsVersionToken,
      createdAt: deps.nowIso()
    });
  }
};
