// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClass,
} from "@zinuto/shared/trading";
import type { SystemDevSimulationDataAvailability } from "@zinuto/shared/systemDevSimulationProfiles";
import {
  SYSTEM_FX_1M_2025Q1_ASSET_CLASS,
  SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID,
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_FX_1M_2025Q1_SOURCE_NAME,
  SYSTEM_SEED_ASSET_CLASS,
  SYSTEM_SEED_MARKET_PRESET_ID,
  SYSTEM_SEED_SOURCE_NAME,
  SYSTEM_WIKI_EOD_POOL_ID,
} from "../ports/infrastructure/db/systemSeedBars.js";
import type {
  SupportedBaseTimeframe,
  SystemDevSimulationEnabledInstrument,
  SystemDevSimulationEnabledPool,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import {
  countSystemDevSimulationLocalReadySources,
  listSystemDevSimulationLocalEligibleInstrumentRows,
  listSystemDevSimulationSystemEligibleInstrumentRows,
  type SystemDevSimulationEligibleInstrumentRow,
} from "../ports/infrastructure/db/systemDevSimulation/datasetPlannerStore.js";

export type SystemDevSimulationDatasetPlan = {
  enabledSamplePools: SystemDevSimulationEnabledPool[];
  dataAvailability: SystemDevSimulationDataAvailability;
};

const SUPPORTED_BASE_TIMEFRAMES = new Set<SupportedBaseTimeframe>([
  "1m",
  "5m",
  "1h",
  "1d",
]);
const MIN_ELIGIBLE_BARS = 24;
const MAX_SYSTEM_INSTRUMENTS = 128;
const MAX_LOCAL_INSTRUMENTS = 256;

const EMPTY_DATA_AVAILABILITY: SystemDevSimulationDataAvailability = {
  ready: false,
  localReadySourceCount: 0,
  localEligibleInstrumentCount: 0,
  systemEligibleInstrumentCount: 0,
  selectedInstrumentCount: 0,
  selectedLocalInstrumentCount: 0,
  selectedSystemInstrumentCount: 0,
  willUseSystemFallback: false,
  sourceStrategy: "NONE",
};

const normalizeBaseTimeframe = (value: unknown): SupportedBaseTimeframe | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SUPPORTED_BASE_TIMEFRAMES.has(normalized as SupportedBaseTimeframe)
    ? (normalized as SupportedBaseTimeframe)
    : null;
};

const normalizeSymbol = (value: unknown): string =>
  String(value ?? "").trim().toUpperCase();

const looksLikeForexSymbol = (symbol: string): boolean =>
  /^[A-Z]{6}$/.test(symbol) &&
  [
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "CAD",
    "CHF",
    "NZD",
  ].some((currency) => symbol.includes(currency));

const looksLikeCryptoSymbol = (symbol: string): boolean =>
  /(?:USDT|USDC|BTC|ETH|SOL|DOGE|BNB)$/.test(symbol) ||
  /^(?:BTC|ETH|SOL|DOGE|BNB)/.test(symbol);

const inferLocalInstrumentTradingBinding = (
  symbol: string,
): {
  assetClass: TradingAssetClass;
  marketPresetId: BuiltInTradingMarketPresetId;
} => {
  if (looksLikeForexSymbol(symbol)) {
    return {
      assetClass: "FOREX",
      marketPresetId: "FOREX_STANDARD_LOT",
    };
  }
  if (looksLikeCryptoSymbol(symbol)) {
    return {
      assetClass: "CRYPTO",
      marketPresetId: "CRYPTO_SPOT",
    };
  }
  return {
    assetClass: "STOCK",
    marketPresetId: DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS.STOCK,
  };
};

const resolveSystemPoolMeta = (
  baseTimeframe: SupportedBaseTimeframe,
): {
  sourceId: string;
  sourceName: string;
  assetClass: TradingAssetClass;
  marketPresetId: BuiltInTradingMarketPresetId;
} =>
  baseTimeframe === "1m"
    ? {
        sourceId: SYSTEM_FX_1M_2025Q1_POOL_ID,
        sourceName: SYSTEM_FX_1M_2025Q1_SOURCE_NAME,
        assetClass: SYSTEM_FX_1M_2025Q1_ASSET_CLASS,
        marketPresetId:
          SYSTEM_FX_1M_2025Q1_MARKET_PRESET_ID as BuiltInTradingMarketPresetId,
      }
    : {
        sourceId: SYSTEM_WIKI_EOD_POOL_ID,
        sourceName: SYSTEM_SEED_SOURCE_NAME,
        assetClass: SYSTEM_SEED_ASSET_CLASS,
        marketPresetId: SYSTEM_SEED_MARKET_PRESET_ID as BuiltInTradingMarketPresetId,
      };

const mapEligibleInstrumentRow = (
  row: SystemDevSimulationEligibleInstrumentRow,
): SystemDevSimulationEnabledInstrument | null => {
  const instrumentId = String(row.instrumentId ?? "").trim();
  const symbol = normalizeSymbol(row.symbol);
  const baseTimeframe = normalizeBaseTimeframe(row.baseTimeframe);
  const barCount = Math.max(0, Math.floor(Number(row.barCount) || 0));
  const sourceKind = row.sourceKind === "SYSTEM" ? "SYSTEM" : "LOCAL";
  if (!instrumentId || !symbol || !baseTimeframe || barCount < MIN_ELIGIBLE_BARS) {
    return null;
  }
  if (sourceKind === "SYSTEM") {
    const systemMeta = resolveSystemPoolMeta(baseTimeframe);
    return {
      instrumentId,
      symbol,
      baseTimeframe,
      barCount,
      sourceKind,
      sourceId: systemMeta.sourceId,
      sourceName: systemMeta.sourceName,
      assetClass: systemMeta.assetClass,
      marketPresetId: systemMeta.marketPresetId,
    };
  }
  const sourceId = String(row.sourceId ?? "").trim();
  const sourceName = String(row.sourceName ?? "").trim();
  if (!sourceId || !sourceName) {
    return null;
  }
  const binding = inferLocalInstrumentTradingBinding(symbol);
  return {
    instrumentId,
    symbol,
    baseTimeframe,
    barCount,
    sourceKind,
    sourceId,
    sourceName,
    assetClass: binding.assetClass,
    marketPresetId: binding.marketPresetId,
  };
};

const listLocalEligibleInstruments = (): SystemDevSimulationEnabledInstrument[] =>
  listSystemDevSimulationLocalEligibleInstrumentRows({
    minEligibleBars: MIN_ELIGIBLE_BARS,
    limit: MAX_LOCAL_INSTRUMENTS,
  })
    .map(mapEligibleInstrumentRow)
    .filter(
      (item): item is SystemDevSimulationEnabledInstrument => Boolean(item),
    );

const listSystemEligibleInstruments = (): SystemDevSimulationEnabledInstrument[] =>
  listSystemDevSimulationSystemEligibleInstrumentRows({
    minEligibleBars: MIN_ELIGIBLE_BARS,
    limit: MAX_SYSTEM_INSTRUMENTS,
  })
    .map(mapEligibleInstrumentRow)
    .filter(
      (item): item is SystemDevSimulationEnabledInstrument => Boolean(item),
    );

const countLocalReadySources = (): number =>
  countSystemDevSimulationLocalReadySources();

const groupInstrumentsIntoPools = (
  instruments: readonly SystemDevSimulationEnabledInstrument[],
): SystemDevSimulationEnabledPool[] => {
  const groups = new Map<string, SystemDevSimulationEnabledInstrument[]>();
  instruments.forEach((instrument) => {
    const key = [
      instrument.sourceKind,
      instrument.sourceId,
      instrument.baseTimeframe,
      instrument.assetClass,
      instrument.marketPresetId,
    ].join("::");
    groups.set(key, [...(groups.get(key) ?? []), instrument]);
  });
  return Array.from(groups.values()).map((items) => {
    const first = items[0]!;
    const symbols = Array.from(new Set(items.map((item) => item.symbol))).sort(
      (left, right) => left.localeCompare(right, "en"),
    );
    return {
      id: first.sourceId,
      name: first.sourceName,
      assetClass: first.assetClass,
      baseTimeframe: first.baseTimeframe,
      symbols,
      instruments: [...items].sort((left, right) =>
        left.symbol.localeCompare(right.symbol, "en") ||
        left.instrumentId.localeCompare(right.instrumentId, "en"),
      ),
    };
  });
};

export const listSystemDevSimulationFallbackPools =
  (): SystemDevSimulationEnabledPool[] =>
    groupInstrumentsIntoPools(listSystemEligibleInstruments());

export const planSystemDevSimulationDataset =
  (): SystemDevSimulationDatasetPlan => {
    const localReadySourceCount = countLocalReadySources();
    const localEligibleInstruments = listLocalEligibleInstruments();
    const systemEligibleInstruments = listSystemEligibleInstruments();
    // User-imported data is authoritative. System data is used only when no
    // eligible user dataset is available at all.
    const selectedSystemInstruments =
      localEligibleInstruments.length === 0 ? systemEligibleInstruments : [];
    const selectedInstruments = [
      ...localEligibleInstruments,
      ...selectedSystemInstruments,
    ];
    const selectedLocalInstrumentCount = localEligibleInstruments.length;
    const selectedSystemInstrumentCount = selectedSystemInstruments.length;
    const ready = selectedInstruments.length > 0;
    const sourceStrategy: SystemDevSimulationDataAvailability["sourceStrategy"] =
      !ready
        ? "NONE"
        : selectedLocalInstrumentCount > 0
          ? "LOCAL_READY"
          : "SYSTEM_FALLBACK_ONLY";

    return {
      enabledSamplePools: groupInstrumentsIntoPools(selectedInstruments),
      dataAvailability: {
        ...EMPTY_DATA_AVAILABILITY,
        ready,
        localReadySourceCount,
        localEligibleInstrumentCount: localEligibleInstruments.length,
        systemEligibleInstrumentCount: systemEligibleInstruments.length,
        selectedInstrumentCount: selectedInstruments.length,
        selectedLocalInstrumentCount,
        selectedSystemInstrumentCount,
        willUseSystemFallback: selectedSystemInstrumentCount > 0,
        sourceStrategy,
      },
    };
  };
