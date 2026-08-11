// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  listBuiltInTradingMarketPresetIdsByAssetClass,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClass,
  type TradingMarketPresetRuntimeSettings,
} from "@zinuto/shared/trading";
import {
  listFreeReplayAdvancePeriodsForSource,
  normalizeFreeReplayAdvancePeriod,
  type FreeReplayAdvancePeriod,
} from "@zinuto/shared/period";
import {
  listSystemSeedDatasets,
  listSystemSeedInstruments,
} from "../ports/infrastructure/db/systemSeedBars.js";
import {
  type FreeReplayPoolDefaultEnvironment,
} from "./freeReplayPoolDefaultEnvironmentService.js";

type FreeReplayBaseTimeframe = "1m" | "5m" | "1h" | "1d";
type FreeReplayMode = "RANDOM" | "FOCUSED";

export type FreeReplayPrepInstrument = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  label: string;
  sourceTimeframe: FreeReplayBaseTimeframe;
  barCount: number;
  locked: boolean;
  lockReason: string | null;
};

export type FreeReplayPrepPool = {
  id: string;
  name: string;
  assetClass: TradingAssetClass;
  marketPresetId: BuiltInTradingMarketPresetId;
  sourceBaseTimeframe: FreeReplayBaseTimeframe;
  baseTimeframe: FreeReplayBaseTimeframe;
  minimumBaseTimeframeOptions: FreeReplayAdvancePeriod[];
  disabled: boolean;
  sourceLocked: boolean;
  lockReason: string | null;
  symbolCount: number;
  trainableSymbolCount: number;
  instruments: FreeReplayPrepInstrument[];
  symbols: string[];
};

type FreeReplayPrepCandidate = {
  instrumentId: string;
  symbol: string;
  poolId: string;
  poolName: string;
  sourceTimeframe: FreeReplayBaseTimeframe;
};

type FreeReplayEnvironmentRuleCardId =
  | "settlement"
  | "direction"
  | "longPermission"
  | "minTradeStep"
  | "commissionRate"
  | "commissionMinimumFee"
  | "platformFeeRate"
  | "platformFeeMinimumFee"
  | "transactionLevyRate"
  | "transactionLevyMinimumFee"
  | "transferFeeRate"
  | "regulatoryFeeRate"
  | "stampDutyRate"
  | "stampDutyMode"
  | "makerFeeRate"
  | "takerFeeRate"
  | "fundingRate"
  | "slippageRate"
  | "contractMultiplier"
  | "longInitialMargin"
  | "longMaintenanceMargin"
  | "longFinancing"
  | "shortInitialMargin"
  | "shortMaintenanceMargin"
  | "shortBorrow";

type FreeReplayEnvironmentRuleCardValueKind =
  | "TEXT"
  | "TRADE_SETTLEMENT_MODE"
  | "DIRECTION"
  | "LONG_MARGIN_PERMISSION"
  | "MIN_TRADE_STEP"
  | "STAMP_DUTY_MODE";

export type FreeReplayEnvironmentRuleCardFact = {
  id: FreeReplayEnvironmentRuleCardId;
  valueKind: FreeReplayEnvironmentRuleCardValueKind;
  value: string;
};

export type FreeReplayPrepReadModelRequest = {
  mode?: FreeReplayMode;
  selectedPoolId?: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
  selectedAnchorIndex?: number;
  minimumBaseTimeframe?: FreeReplayAdvancePeriod;
  minimumBaseTimeframeTouched?: boolean;
  hideSymbolName?: boolean;
  preferredAssetClass?: TradingAssetClass;
  preferredBaseTimeframe?: FreeReplayBaseTimeframe;
  activeSessionMinimumBaseTimeframe?: FreeReplayAdvancePeriod;
  hasActiveSession?: boolean;
  environmentSelection?: Partial<FreeReplayPoolDefaultEnvironment> | null;
  environmentTouched?: boolean;
};

const MIN_REPLAYABLE_BARS = 2;
const ASSET_CLASSES: TradingAssetClass[] = [
  "STOCK",
  "FUTURES",
  "FOREX",
  "CRYPTO",
];

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeAssetClass = (
  value: unknown,
  fallback: TradingAssetClass = "STOCK",
): TradingAssetClass => {
  const normalized = normalizeText(value).toUpperCase();
  return normalized === "STOCK" ||
    normalized === "FUTURES" ||
    normalized === "FOREX" ||
    normalized === "CRYPTO"
    ? normalized
    : fallback;
};

const normalizeBaseTimeframe = (
  value: unknown,
  fallback: FreeReplayBaseTimeframe = "1d",
): FreeReplayBaseTimeframe => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
    ? normalized
    : fallback;
};

const normalizeMode = (value: unknown): FreeReplayMode =>
  value === "FOCUSED" ? "FOCUSED" : "RANDOM";

const normalizePresetForAsset = (
  marketPresetIdRaw: unknown,
  assetClass: TradingAssetClass,
): BuiltInTradingMarketPresetId => {
  const marketPresetId = normalizeText(marketPresetIdRaw);
  if (
    marketPresetId &&
    BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[
      marketPresetId as BuiltInTradingMarketPresetId
    ] === assetClass
  ) {
    return marketPresetId as BuiltInTradingMarketPresetId;
  }
  return DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass];
};

const normalizePoolEnvironment = (
  value: Partial<FreeReplayPoolDefaultEnvironment> | null | undefined,
  fallback: FreeReplayPoolDefaultEnvironment,
): FreeReplayPoolDefaultEnvironment => {
  const assetClass = normalizeAssetClass(value?.assetClass, fallback.assetClass);
  return {
    assetClass,
    marketPresetId: normalizePresetForAsset(
      value?.marketPresetId ?? fallback.marketPresetId,
      assetClass,
    ),
  };
};

const buildSystemPools = (): FreeReplayPrepPool[] => {
  return listSystemSeedDatasets()
    .map((dataset) => {
      const sourceBaseTimeframe = normalizeBaseTimeframe(dataset.baseTimeframe);
      const assetClass = normalizeAssetClass(dataset.assetClass);
      const marketPresetId = normalizePresetForAsset(
        dataset.marketPresetId,
        assetClass,
      );
      return {
        id: dataset.poolId,
        name: dataset.sourceName,
        assetClass,
        marketPresetId,
        sourceBaseTimeframe,
        baseTimeframe: sourceBaseTimeframe,
        minimumBaseTimeframeOptions:
          listFreeReplayAdvancePeriodsForSource(sourceBaseTimeframe),
        disabled: false,
        sourceLocked: false,
        lockReason: null,
        symbolCount: Math.max(0, Math.floor(Number(dataset.selectedSymbolCount) || 0)),
        trainableSymbolCount: Math.max(
          0,
          Math.floor(Number(dataset.selectedSymbolCount) || 0),
        ),
        instruments: [],
        symbols: [],
      };
    })
    .filter((pool) => pool.trainableSymbolCount > 0);
};

const buildLocalPools = async (): Promise<FreeReplayPrepPool[]> => {
  const { listLocalDataSourceTrainingPoolCatalog } = await import(
    "../dataSourceService.js",
  );
  return listLocalDataSourceTrainingPoolCatalog().map(
    (source): FreeReplayPrepPool => {
      const sourceBaseTimeframe = normalizeBaseTimeframe(source.baseTimeframe);
      const assetClass = normalizeAssetClass(source.diagnosticAssetClass);
      const marketPresetId = normalizePresetForAsset(
        source.diagnosticMarketPresetId,
        assetClass,
      );
      return {
        id: source.id,
        name: source.name,
        assetClass,
        marketPresetId,
        sourceBaseTimeframe,
        baseTimeframe: sourceBaseTimeframe,
        minimumBaseTimeframeOptions:
          listFreeReplayAdvancePeriodsForSource(sourceBaseTimeframe),
        disabled: false,
        sourceLocked: false,
        lockReason: null,
        symbolCount: source.symbolCount,
        trainableSymbolCount: source.trainableSymbolCount,
        instruments: [],
        symbols: [],
      };
    },
  );
};

const isSystemPool = (poolId: string): boolean =>
  listSystemSeedDatasets().some((dataset) => dataset.poolId === poolId);

const toFreeReplayPrepInstrument = (
  row: {
    id: string;
    symbol: string;
    baseTimeframe: string;
    name: string | null;
    barCount: number;
    scopeKind: "SYSTEM" | "LOCAL";
    sourceId: string | null;
    displayLabel: string;
  },
  pool: FreeReplayPrepPool,
): FreeReplayPrepInstrument => {
  const symbol = normalizeText(row.symbol).toUpperCase();
  return {
    instrumentId: normalizeText(row.id),
    samplePoolId: pool.id,
    symbol,
    label: normalizeText(row.displayLabel) || normalizeText(row.name) || symbol,
    sourceTimeframe: normalizeBaseTimeframe(row.baseTimeframe, pool.sourceBaseTimeframe),
    barCount: Math.max(0, Math.floor(Number(row.barCount) || 0)),
    locked: false,
    lockReason: null,
  };
};

const loadFreeReplayPoolInstruments = async (
  pool: FreeReplayPrepPool,
  options: {
    random?: boolean;
    selectedSymbol?: string;
  } = {},
): Promise<FreeReplayPrepInstrument[]> => {
  const { listInstruments } = await import("./core.js");
  const systemPool = isSystemPool(pool.id);
  let query = "";
  let offset = 0;
  let limit = 10000;
  if (options.random) {
    if (systemPool) {
      const systemSymbols = listSystemSeedInstruments()
        .filter((instrument) => instrument.poolId === pool.id)
        .map((instrument) => normalizeText(instrument.symbol).toUpperCase())
        .filter(Boolean);
      query =
        systemSymbols[Math.floor(Math.random() * systemSymbols.length)] ?? "";
      limit = 1;
    } else {
      offset = Math.floor(Math.random() * Math.max(1, pool.trainableSymbolCount));
      limit = 1;
    }
  } else if (options.selectedSymbol) {
    query = normalizeText(options.selectedSymbol).toUpperCase();
    limit = 10;
  }
  const rows = await listInstruments({
    query,
    sourceId: systemPool ? undefined : pool.id,
    baseTimeframe: pool.sourceBaseTimeframe,
    minimumBarCount: MIN_REPLAYABLE_BARS,
    offset,
    limit,
  });
  return rows
    .filter((row) => row.scopeKind === (systemPool ? "SYSTEM" : "LOCAL"))
    .filter(
      (row) =>
        systemPool &&
        normalizePresetForAsset(row.marketPresetId, pool.assetClass) ===
          pool.marketPresetId
          ? true
          : !systemPool,
    )
    .filter(
      (row) =>
        !options.selectedSymbol ||
        normalizeText(row.symbol).toUpperCase() ===
          normalizeText(options.selectedSymbol).toUpperCase(),
    )
    .map((row) => toFreeReplayPrepInstrument(row, pool))
    .filter((instrument) => instrument.instrumentId && instrument.symbol)
    .sort((left, right) => left.symbol.localeCompare(right.symbol, "en"));
};

const hydrateFreeReplayPool = (
  pool: FreeReplayPrepPool,
  instruments: FreeReplayPrepInstrument[],
): FreeReplayPrepPool => ({
  ...pool,
  instruments,
  symbols: Array.from(new Set(instruments.map((instrument) => instrument.symbol))).sort(
    (left, right) => left.localeCompare(right, "en"),
  ),
});

const pickPreferredPool = (
  pools: FreeReplayPrepPool[],
  request: FreeReplayPrepReadModelRequest,
): FreeReplayPrepPool | null => {
  const selectedPoolId = normalizeText(request.selectedPoolId);
  if (selectedPoolId) {
    const selected = pools.find((pool) => pool.id === selectedPoolId);
    if (selected) {
      return selected;
    }
  }
  const preferredAssetClass = normalizeAssetClass(request.preferredAssetClass);
  const preferredBaseTimeframe = normalizeBaseTimeframe(
    request.preferredBaseTimeframe,
  );
  return (
    pools.find(
      (pool) =>
        pool.assetClass === preferredAssetClass &&
        pool.sourceBaseTimeframe === preferredBaseTimeframe,
    ) ??
    pools.find((pool) => pool.assetClass === preferredAssetClass) ??
    pools[0] ??
    null
  );
};

const pickMinimumBaseTimeframe = (
  pool: FreeReplayPrepPool | null,
  request: FreeReplayPrepReadModelRequest,
): FreeReplayAdvancePeriod => {
  const sourceDefault = normalizeFreeReplayAdvancePeriod(
    pool?.sourceBaseTimeframe ?? "1d",
    pool?.sourceBaseTimeframe ?? "1d",
  );
  const options = pool?.minimumBaseTimeframeOptions ?? [sourceDefault];
  const current = normalizeFreeReplayAdvancePeriod(
    request.minimumBaseTimeframe,
    sourceDefault,
  );
  const activeSessionDefault = normalizeFreeReplayAdvancePeriod(
    request.activeSessionMinimumBaseTimeframe,
    sourceDefault,
  );
  if (request.hasActiveSession) {
    return options.includes(activeSessionDefault)
      ? activeSessionDefault
      : options[0] ?? activeSessionDefault;
  }
  if (request.minimumBaseTimeframeTouched && options.includes(current)) {
    return current;
  }
  return options.includes(sourceDefault) ? sourceDefault : options[0] ?? sourceDefault;
};

const pickSelectedInstrument = (
  trainableInstruments: FreeReplayPrepInstrument[],
  request: FreeReplayPrepReadModelRequest,
): FreeReplayPrepInstrument | null => {
  if (!trainableInstruments.length) {
    return null;
  }
  const selectedInstrumentId = normalizeText(request.selectedInstrumentId);
  if (selectedInstrumentId) {
    const matched = trainableInstruments.find(
      (instrument) => instrument.instrumentId === selectedInstrumentId,
    );
    if (matched) {
      return matched;
    }
  }
  const selectedSymbol = normalizeText(request.selectedSymbol).toUpperCase();
  if (selectedSymbol) {
    const matched = trainableInstruments.find(
      (instrument) => instrument.symbol === selectedSymbol,
    );
    if (matched) {
      return matched;
    }
  }
  return trainableInstruments[0] ?? null;
};

const buildStartReadiness = ({
  mode,
  selectedPool,
  selectedInstrument,
  selectedAnchorIndex,
  startCandidates,
  candidateCount: candidateCountOverride,
  scopedCandidateCount: scopedCandidateCountOverride,
}: {
  mode: FreeReplayMode;
  selectedPool: FreeReplayPrepPool | null;
  selectedInstrument: FreeReplayPrepInstrument | null;
  selectedAnchorIndex: unknown;
  startCandidates: FreeReplayPrepCandidate[];
  candidateCount?: number;
  scopedCandidateCount?: number;
}) => {
  const requiresSymbol = mode === "FOCUSED";
  const requiresAnchor = mode === "FOCUSED";
  const hasExplicitAnchor = Number.isFinite(Number(selectedAnchorIndex));
  const normalizedSelectedAnchorIndex = hasExplicitAnchor
    ? Math.max(0, Math.floor(Number(selectedAnchorIndex)))
    : null;
  const scopedCandidateCount = Math.max(
    0,
    Math.floor(
      Number(
        scopedCandidateCountOverride ??
          (selectedPool
            ? startCandidates.filter((candidate) => candidate.poolId === selectedPool.id)
                .length
            : startCandidates.length),
      ) || 0,
    ),
  );
  const candidateCount = Math.max(
    0,
    Math.floor(Number(candidateCountOverride ?? startCandidates.length) || 0),
  );
  const reasonCode =
    scopedCandidateCount <= 0
      ? "NO_SAMPLES"
      : requiresSymbol && !selectedInstrument
        ? "NO_SYMBOL"
        : requiresAnchor && !hasExplicitAnchor
          ? "NO_ANCHOR"
          : null;
  const enabled = reasonCode === null;
  return {
    enabled,
    reasonCode,
    facts: {
      mode,
      candidateCount,
      scopedCandidateCount,
      selectedPoolId: selectedPool?.id ?? null,
      selectedInstrumentId: selectedInstrument?.instrumentId ?? null,
      selectedSymbol: selectedInstrument?.symbol ?? null,
      selectedAnchorIndex: normalizedSelectedAnchorIndex,
      requiresSymbol,
      requiresAnchor,
      hasExplicitAnchor,
      normalizedSelectedSymbol: selectedInstrument?.symbol ?? "",
    },
    readiness: {
      canStart: enabled,
      reason: reasonCode,
      requiresSymbol,
      requiresAnchor,
      hasExplicitAnchor,
      normalizedSelectedSymbol: selectedInstrument?.symbol ?? "",
    },
  };
};

const formatEnvironmentRuleNumber = (
  value: unknown,
  fallback = "0",
): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Object.is(parsed, -0) ? "0" : String(parsed);
};

const formatEnvironmentRuleRate = (value: unknown): string =>
  `${formatEnvironmentRuleNumber(value)}%`;

const createEnvironmentRuleCard = (
  id: FreeReplayEnvironmentRuleCardId,
  value: string,
  valueKind: FreeReplayEnvironmentRuleCardValueKind = "TEXT",
): FreeReplayEnvironmentRuleCardFact => ({
  id,
  valueKind,
  value,
});

const readEnvironmentRuntimeSettings = (
  environment: FreeReplayPoolDefaultEnvironment,
): TradingMarketPresetRuntimeSettings => {
  const presetId = normalizePresetForAsset(
    environment.marketPresetId,
    environment.assetClass,
  );
  return DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId];
};

export const buildFreeReplayEnvironmentRuleCardFacts = (
  environment: FreeReplayPoolDefaultEnvironment,
): FreeReplayEnvironmentRuleCardFact[] => {
  const values = readEnvironmentRuntimeSettings(environment);
  const cards: FreeReplayEnvironmentRuleCardFact[] = [
    createEnvironmentRuleCard(
      "settlement",
      values.tradeSettlementMode,
      "TRADE_SETTLEMENT_MODE",
    ),
    createEnvironmentRuleCard(
      "direction",
      values.allowShortSelling ? "BOTH" : "LONG_ONLY",
      "DIRECTION",
    ),
    createEnvironmentRuleCard(
      "longPermission",
      values.allowLongMarginTrading ? "ALLOW" : "DISALLOW",
      "LONG_MARGIN_PERMISSION",
    ),
    createEnvironmentRuleCard(
      "minTradeStep",
      formatEnvironmentRuleNumber(values.minTradeStep),
      "MIN_TRADE_STEP",
    ),
  ];

  if (values.assetClass === "STOCK") {
    cards.push(
      createEnvironmentRuleCard(
        "commissionRate",
        formatEnvironmentRuleRate(values.commissionRate),
      ),
      createEnvironmentRuleCard(
        "commissionMinimumFee",
        formatEnvironmentRuleNumber(values.commissionMinimumFee),
      ),
      createEnvironmentRuleCard(
        "platformFeeRate",
        formatEnvironmentRuleRate(values.platformFeeRate),
      ),
      createEnvironmentRuleCard(
        "platformFeeMinimumFee",
        formatEnvironmentRuleNumber(values.platformFeeMinimumFee),
      ),
      createEnvironmentRuleCard(
        "transactionLevyRate",
        formatEnvironmentRuleRate(values.transactionLevyRate),
      ),
      createEnvironmentRuleCard(
        "transactionLevyMinimumFee",
        formatEnvironmentRuleNumber(values.transactionLevyMinimumFee),
      ),
      createEnvironmentRuleCard(
        "transferFeeRate",
        formatEnvironmentRuleRate(values.transferFeeRate),
      ),
      createEnvironmentRuleCard(
        "regulatoryFeeRate",
        formatEnvironmentRuleRate(values.regulatoryFeeRate),
      ),
      createEnvironmentRuleCard(
        "stampDutyRate",
        formatEnvironmentRuleRate(values.stampDutyRate),
      ),
      createEnvironmentRuleCard(
        "stampDutyMode",
        values.stampDutyMode,
        "STAMP_DUTY_MODE",
      ),
      createEnvironmentRuleCard(
        "slippageRate",
        formatEnvironmentRuleRate(values.slippageRate),
      ),
    );
  } else {
    const feeSuffix = values.assetClass === "FUTURES" ? "" : "%";
    cards.push(
      createEnvironmentRuleCard(
        "makerFeeRate",
        `${formatEnvironmentRuleNumber(values.makerFeeRate)}${feeSuffix}`,
      ),
      createEnvironmentRuleCard(
        "takerFeeRate",
        `${formatEnvironmentRuleNumber(values.takerFeeRate)}${feeSuffix}`,
      ),
      createEnvironmentRuleCard(
        "fundingRate",
        formatEnvironmentRuleRate(values.fundingRate),
      ),
      createEnvironmentRuleCard(
        "slippageRate",
        formatEnvironmentRuleRate(values.slippageRate),
      ),
      createEnvironmentRuleCard(
        "contractMultiplier",
        formatEnvironmentRuleNumber(values.contractMultiplier, "1"),
      ),
    );
  }

  if (values.allowLongMarginTrading) {
    cards.push(
      createEnvironmentRuleCard(
        "longInitialMargin",
        formatEnvironmentRuleRate(values.longInitialMarginRatio),
      ),
      createEnvironmentRuleCard(
        "longMaintenanceMargin",
        formatEnvironmentRuleRate(values.longMaintenanceMarginRatio),
      ),
      createEnvironmentRuleCard(
        "longFinancing",
        formatEnvironmentRuleRate(values.longFinancingAnnualRate),
      ),
    );
  }

  if (values.allowShortSelling) {
    cards.push(
      createEnvironmentRuleCard(
        "shortInitialMargin",
        formatEnvironmentRuleRate(values.shortInitialMarginRatio),
      ),
      createEnvironmentRuleCard(
        "shortMaintenanceMargin",
        formatEnvironmentRuleRate(values.shortMaintenanceMarginRatio),
      ),
      createEnvironmentRuleCard(
        "shortBorrow",
        formatEnvironmentRuleRate(values.shortBorrowAnnualRate),
      ),
    );
  }

  return cards;
};

const resolveSelectedEnvironment = (
  selectedPool: FreeReplayPrepPool | null,
  request: FreeReplayPrepReadModelRequest,
  persistedEnvironments: Record<string, FreeReplayPoolDefaultEnvironment>,
): FreeReplayPoolDefaultEnvironment => {
  const poolFallback: FreeReplayPoolDefaultEnvironment = selectedPool
    ? {
        assetClass: selectedPool.assetClass,
        marketPresetId: selectedPool.marketPresetId,
      }
    : {
        assetClass: normalizeAssetClass(request.preferredAssetClass),
        marketPresetId:
          DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[
            normalizeAssetClass(request.preferredAssetClass)
          ],
      };
  const persisted = selectedPool
    ? persistedEnvironments[selectedPool.id]
    : null;
  const defaultEnvironment = normalizePoolEnvironment(persisted, poolFallback);
  if (request.environmentTouched) {
    return normalizePoolEnvironment(
      request.environmentSelection,
      defaultEnvironment,
    );
  }
  return defaultEnvironment;
};

// --- Free replay environment default cursor ---

export type FreeReplayEnvironmentDefaultCursor = {
  poolId: string;
  key: string;
};

export const createFreeReplayEnvironmentDefaultCursor = ({
  poolId,
  assetClass,
  marketPresetId,
}: {
  poolId: string;
  assetClass: string;
  marketPresetId: string;
}): FreeReplayEnvironmentDefaultCursor => {
  const normalizedPoolId = String(poolId || '').trim();
  const normalizedAssetClass = String(assetClass || '').trim();
  const normalizedMarketPresetId = String(marketPresetId || '').trim();
  return {
    poolId: normalizedPoolId,
    key: [
      normalizedPoolId,
      normalizedAssetClass,
      normalizedMarketPresetId,
    ].join(''),
  };
};

export const shouldApplyFreeReplayEnvironmentDefault = ({
  previous,
  next,
  environmentTouched,
}: {
  previous: FreeReplayEnvironmentDefaultCursor | null;
  next: FreeReplayEnvironmentDefaultCursor;
  environmentTouched: boolean;
}): boolean => {
  if (!previous) {
    return true;
  }
  if (previous.poolId !== next.poolId) {
    return true;
  }
  return !environmentTouched;
};

export const resolveFreeReplayEnvironmentSelectionForStart = <
  TAssetClass extends string = string,
  TMarketPresetId extends string = string,
>({
  current,
  fallback,
}: {
  current?: { assetClass?: TAssetClass | null; marketPresetId?: TMarketPresetId | null } | null;
  fallback: { assetClass: TAssetClass; marketPresetId: TMarketPresetId };
}): { assetClass: TAssetClass; marketPresetId: TMarketPresetId } => {
  const assetClass =
    String(current?.assetClass || '').trim() ||
    String(fallback.assetClass || '').trim();
  const marketPresetId =
    String(current?.marketPresetId || '').trim() ||
    String(fallback.marketPresetId || '').trim();
  return {
    assetClass: assetClass as TAssetClass,
    marketPresetId: marketPresetId as TMarketPresetId,
  };
};

export const resolveFreeReplayStartSelection = async ({
  mode,
  selectedPoolId,
  selectedInstrumentId,
  selectedSymbol,
}: {
  mode: FreeReplayMode;
  selectedPoolId: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
}): Promise<FreeReplayPrepCandidate | null> => {
  const [systemPools, localPools] = await Promise.all([
    buildSystemPools(),
    buildLocalPools(),
  ]);
  const pool = [...systemPools, ...localPools].find(
    (candidate) => candidate.id === normalizeText(selectedPoolId),
  );
  if (!pool || pool.disabled || pool.sourceLocked || pool.trainableSymbolCount <= 0) {
    return null;
  }
  const instruments = await loadFreeReplayPoolInstruments(pool, {
    random: mode === "RANDOM",
    selectedSymbol: mode === "FOCUSED" ? selectedSymbol : undefined,
  });
  const trainableInstruments = instruments.filter(
    (instrument) => !instrument.locked && instrument.barCount >= MIN_REPLAYABLE_BARS,
  );
  const normalizedSelectedInstrumentId = normalizeText(selectedInstrumentId);
  const normalizedSelectedSymbol = normalizeText(selectedSymbol).toUpperCase();
  const picked =
    mode === "RANDOM"
      ? trainableInstruments[0] ?? null
      : (normalizedSelectedInstrumentId
          ? trainableInstruments.find(
              (instrument) => instrument.instrumentId === normalizedSelectedInstrumentId,
            )
          : null) ??
        (normalizedSelectedSymbol
          ? trainableInstruments.find(
              (instrument) => instrument.symbol === normalizedSelectedSymbol,
            )
          : null) ??
        (!normalizedSelectedInstrumentId && !normalizedSelectedSymbol
          ? trainableInstruments[0] ?? null
          : null);
  return picked
    ? {
        instrumentId: picked.instrumentId,
        symbol: picked.symbol,
        poolId: pool.id,
        poolName: pool.name,
        sourceTimeframe: picked.sourceTimeframe,
      }
    : null;
};

export const getFreeReplayPrepReadModel = async (
  request: FreeReplayPrepReadModelRequest,
) => {
  const { listFreeReplayPoolDefaultEnvironments } = await import(
    "./freeReplayPoolDefaultEnvironmentService.js"
  );
  const [systemPools, localPools] = await Promise.all([
    Promise.resolve(buildSystemPools()),
    buildLocalPools(),
  ]);
  const pools = [...systemPools, ...localPools].sort((left, right) => {
    if (left.sourceBaseTimeframe !== right.sourceBaseTimeframe) {
      const order: Record<FreeReplayBaseTimeframe, number> = {
        "1m": 0,
        "5m": 1,
        "1h": 2,
        "1d": 3,
      };
      return order[left.sourceBaseTimeframe] - order[right.sourceBaseTimeframe];
    }
    return left.name.localeCompare(right.name, "en");
  });
  const selectedPoolCatalog = pickPreferredPool(pools, request);
  const mode = normalizeMode(request.mode);
  const selectedPool =
    selectedPoolCatalog && mode === "FOCUSED"
      ? hydrateFreeReplayPool(
          selectedPoolCatalog,
          await loadFreeReplayPoolInstruments(selectedPoolCatalog),
        )
      : selectedPoolCatalog;
  const trainableInstruments =
    selectedPool && mode === "FOCUSED" && !selectedPool.disabled && !selectedPool.sourceLocked
      ? selectedPool.instruments.filter(
          (instrument) =>
            !instrument.locked && instrument.barCount >= MIN_REPLAYABLE_BARS,
        )
      : [];
  const selectedInstrument = pickSelectedInstrument(
    trainableInstruments,
    request,
  );
  const minimumBaseTimeframe = pickMinimumBaseTimeframe(selectedPool, request);
  const startCandidates = selectedInstrument
    ? [
        {
          instrumentId: selectedInstrument.instrumentId,
          symbol: selectedInstrument.symbol,
          poolId: selectedPool?.id ?? "",
          poolName: selectedPool?.name ?? "",
          sourceTimeframe: selectedInstrument.sourceTimeframe,
        },
      ]
    : [];
  const scopedCandidateCount =
    mode === "RANDOM"
      ? selectedPool?.trainableSymbolCount ?? 0
      : startCandidates.length;
  const candidateCount = scopedCandidateCount;
  const startReadiness = buildStartReadiness({
    mode,
    selectedPool,
    selectedInstrument,
    selectedAnchorIndex: request.selectedAnchorIndex,
    startCandidates,
    candidateCount,
    scopedCandidateCount,
  });
  const environment = resolveSelectedEnvironment(
    selectedPool,
    request,
    listFreeReplayPoolDefaultEnvironments(),
  );
  const environmentPresetOptions = listBuiltInTradingMarketPresetIdsByAssetClass(
    environment.assetClass,
  ).map((presetId) => ({
    value: presetId,
    disabled: false,
  }));
  return {
    statusCode: pools.length > 0 ? "READY" : "EMPTY",
    reasonCode: pools.length > 0 ? null : "NO_POOLS",
    prepConfig: {
      mode,
      minimumBaseTimeframe,
      baseTimeframe: minimumBaseTimeframe,
      hideSymbolName: Boolean(request.hideSymbolName),
      assetClass: selectedPool?.assetClass ?? environment.assetClass,
    },
    selection: {
      selectedPoolId: selectedPool?.id ?? "",
      selectedInstrumentId: selectedInstrument?.instrumentId ?? "",
      selectedSymbol: selectedInstrument?.symbol ?? "",
      selectedSourceTimeframe:
        selectedInstrument?.sourceTimeframe ??
        selectedPool?.sourceBaseTimeframe ??
        "1d",
    },
    facts: {
      availablePoolCount: pools.length,
      availableSymbolCount: selectedPool?.symbolCount ?? 0,
      trainableSymbolCount: selectedPool?.trainableSymbolCount ?? 0,
      candidateCount,
    },
    pools,
    selectedPool,
    selectedInstrument,
    startCandidates,
    startReadiness,
    actions: {
      start: startReadiness,
    },
    environment: {
      selected: environment,
      ruleCards: buildFreeReplayEnvironmentRuleCardFacts(environment),
      assetOptions: ASSET_CLASSES.map((assetClass) => ({
        value: assetClass,
        disabled: false,
      })),
      presetOptions: environmentPresetOptions,
    },
  };
};
