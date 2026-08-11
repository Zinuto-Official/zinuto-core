// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@/domains/trainer/trainerTypes";
import type { TradingAssetClassId } from "@/domains/trainer/tradingMarketPresets";
import type { AppIconName } from "@/assets/graphics";
import {
  listFreeReplayAdvancePeriodsForSource,
  normalizeFreeReplayAdvancePeriod,
  type FreeReplayAdvancePeriod,
} from "@zinuto/shared/period";

export const FREE_REPLAY_ASSET_CLASS_IDS = [
  "STOCK",
  "FUTURES",
  "FOREX",
  "CRYPTO",
] as const;

export type FreeReplayAssetClass = (typeof FREE_REPLAY_ASSET_CLASS_IDS)[number];

export const FREE_REPLAY_BASE_TIMEFRAMES = ["1m", "5m", "1h", "1d"] as const;

export type FreeReplayBaseTimeframe =
  (typeof FREE_REPLAY_BASE_TIMEFRAMES)[number];

export type { FreeReplayAdvancePeriod };

export const FREE_REPLAY_MODES = ["RANDOM", "FOCUSED"] as const;

export type FreeReplayMode = (typeof FREE_REPLAY_MODES)[number];

export type FreeReplayPrepConfig = {
  mode: FreeReplayMode;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  hideSymbolName: boolean;
  assetClass: FreeReplayAssetClass;
  baseTimeframe: FreeReplayAdvancePeriod;
};

export type FreeReplayStartDisableReason =
  | "NO_SAMPLES"
  | "NO_SYMBOL"
  | "NO_ANCHOR"
  | null;

export type FreeReplayEnvironmentDefaultCursor = {
  poolId: string;
  key: string;
};

export type FreeReplayEnvironmentSelection<
  TAssetClass extends string = string,
  TMarketPresetId extends string = string,
> = {
  assetClass: TAssetClass;
  marketPresetId: TMarketPresetId;
};

type CreateFreeReplayEnvironmentDefaultCursorArgs = {
  poolId: string;
  assetClass: string;
  marketPresetId: string;
};

type ShouldApplyFreeReplayEnvironmentDefaultArgs = {
  previous: FreeReplayEnvironmentDefaultCursor | null;
  next: FreeReplayEnvironmentDefaultCursor;
  environmentTouched: boolean;
};

type ResolveFreeReplayEnvironmentSelectionForStartArgs<
  TAssetClass extends string = string,
  TMarketPresetId extends string = string,
> = {
  current?: FreeReplayEnvironmentSelection<
    TAssetClass,
    TMarketPresetId
  > | null;
  fallback: FreeReplayEnvironmentSelection<TAssetClass, TMarketPresetId>;
};

export type FreeReplayPrepInstrumentOption = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  label: string;
  sourceTimeframe: FreeReplayBaseTimeframe;
  barCount: number;
  locked?: boolean;
  lockReason?: string | null;
};

export type FreeReplayPrepPoolOption = {
  id: string;
  name: string;
  assetClass: FreeReplayAssetClass;
  assetClassLabel: string;
  marketPresetId: string;
  marketPresetLabel: string;
  sourceBaseTimeframe: FreeReplayBaseTimeframe;
  baseTimeframe: FreeReplayBaseTimeframe;
  minimumBaseTimeframeOptions: FreeReplayAdvancePeriod[];
  instruments: FreeReplayPrepInstrumentOption[];
  symbols: string[];
  disabled?: boolean;
  sourceLocked?: boolean;
  lockReason?: string | null;
};

export const FREE_REPLAY_ASSET_ICON_NAME_BY_CLASS: Record<
  FreeReplayAssetClass,
  AppIconName
> = {
  STOCK: "assetStock",
  FUTURES: "assetFutures",
  FOREX: "assetForex",
  CRYPTO: "assetCrypto",
};

export const toFreeReplayAssetClass = (
  value: TradingAssetClassId,
  fallback: FreeReplayAssetClass = "STOCK",
): FreeReplayAssetClass =>
  value === "FUTURES" || value === "FOREX" || value === "CRYPTO"
    ? value
    : fallback;

export const toFreeReplayBaseTimeframe = (
  value: BaseTimeframe,
  fallback: FreeReplayBaseTimeframe = "1d",
): FreeReplayBaseTimeframe =>
  value === "1m" || value === "5m" || value === "1h" || value === "1d"
    ? value
    : fallback;

export const toFreeReplayAdvancePeriod = (
  value: unknown,
  fallback: FreeReplayAdvancePeriod = "1d",
): FreeReplayAdvancePeriod =>
  normalizeFreeReplayAdvancePeriod(value, fallback);

export const resolveFreeReplayMinimumBaseTimeframeOptions = (
  sourceBaseTimeframe: FreeReplayBaseTimeframe,
): FreeReplayAdvancePeriod[] =>
  listFreeReplayAdvancePeriodsForSource(sourceBaseTimeframe);

export const createFreeReplayEnvironmentDefaultCursor = ({
  poolId,
  assetClass,
  marketPresetId,
}: CreateFreeReplayEnvironmentDefaultCursorArgs): FreeReplayEnvironmentDefaultCursor => {
  const normalizedPoolId = String(poolId || "").trim();
  const normalizedAssetClass = String(assetClass || "").trim();
  const normalizedMarketPresetId = String(marketPresetId || "").trim();
  return {
    poolId: normalizedPoolId,
    key: [
      normalizedPoolId,
      normalizedAssetClass,
      normalizedMarketPresetId,
    ].join("\u001f"),
  };
};

export const shouldApplyFreeReplayEnvironmentDefault = ({
  previous,
  next,
  environmentTouched,
}: ShouldApplyFreeReplayEnvironmentDefaultArgs): boolean => {
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
}: ResolveFreeReplayEnvironmentSelectionForStartArgs<
  TAssetClass,
  TMarketPresetId
>): FreeReplayEnvironmentSelection<TAssetClass, TMarketPresetId> => {
  const assetClass =
    String(current?.assetClass || "").trim() ||
    String(fallback.assetClass || "").trim();
  const marketPresetId =
    String(current?.marketPresetId || "").trim() ||
    String(fallback.marketPresetId || "").trim();
  return {
    assetClass: assetClass as TAssetClass,
    marketPresetId: marketPresetId as TMarketPresetId,
  };
};

export const resolveFreeReplayPrepMinimumBaseTimeframe = ({
  availableTimeframes,
  currentMinimumBaseTimeframe,
  sourceBaseTimeframe,
  activeSessionMinimumBaseTimeframe,
  hasActiveSession,
  minimumBaseTimeframeTouched,
}: {
  availableTimeframes: FreeReplayAdvancePeriod[];
  currentMinimumBaseTimeframe: FreeReplayAdvancePeriod;
  sourceBaseTimeframe: FreeReplayBaseTimeframe;
  activeSessionMinimumBaseTimeframe: FreeReplayAdvancePeriod;
  hasActiveSession: boolean;
  minimumBaseTimeframeTouched: boolean;
}): FreeReplayAdvancePeriod => {
  const sourceDefault = toFreeReplayAdvancePeriod(
    sourceBaseTimeframe,
    sourceBaseTimeframe,
  );
  const sessionDefault = toFreeReplayAdvancePeriod(
    activeSessionMinimumBaseTimeframe,
    sourceDefault,
  );
  if (hasActiveSession) {
    return availableTimeframes.includes(sessionDefault)
      ? sessionDefault
      : availableTimeframes[0] ?? sessionDefault;
  }
  if (
    minimumBaseTimeframeTouched &&
    availableTimeframes.includes(currentMinimumBaseTimeframe)
  ) {
    return currentMinimumBaseTimeframe;
  }
  return availableTimeframes.includes(sourceDefault)
    ? sourceDefault
    : availableTimeframes[0] ?? sourceDefault;
};
