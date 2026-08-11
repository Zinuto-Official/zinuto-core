// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClass,
  type TradingSettings,
} from "@zinuto/shared/trading";
import type { SystemDevSimulationProfileId } from "@zinuto/shared/systemDevSimulationProfiles";
import { appError } from "../../kernel/appError.js";
import {
  FREE_REPLAY_TARGET,
  type SupportedBaseTimeframe,
  type SystemDevSimulationEnabledPool,
} from "../../domain/systemDevSimulation/sharedDomain.js";

export type SystemDevSimulationFreeReplayPlanItem = {
  samplePoolId: string;
  samplePoolName: string;
  instrumentId?: string;
  baseTimeframe: SupportedBaseTimeframe;
  symbol: string;
  assetClass: TradingAssetClass;
  marketPresetId: BuiltInTradingMarketPresetId;
};

const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithRandom = <T>(items: T[], nextRandom: () => number): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
};

const buildFreeReplayCandidates = (
  pools: SystemDevSimulationEnabledPool[],
): SystemDevSimulationFreeReplayPlanItem[] => {
  const candidates: SystemDevSimulationFreeReplayPlanItem[] = [];
  const seen = new Set<string>();
  for (const pool of pools) {
    if (Array.isArray(pool.instruments) && pool.instruments.length > 0) {
      for (const instrument of pool.instruments) {
        const normalizedInstrumentId = String(instrument.instrumentId || "").trim();
        const normalizedSymbol = String(instrument.symbol || "")
          .trim()
          .toUpperCase();
        if (!normalizedInstrumentId || !normalizedSymbol) {
          continue;
        }
        const key = `${instrument.baseTimeframe}::${normalizedInstrumentId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({
          samplePoolId: instrument.sourceId || pool.id,
          samplePoolName: instrument.sourceName || pool.name,
          instrumentId: normalizedInstrumentId,
          baseTimeframe: instrument.baseTimeframe,
          symbol: normalizedSymbol,
          assetClass: instrument.assetClass,
          marketPresetId: instrument.marketPresetId,
        });
      }
      continue;
    }
    for (const symbol of pool.symbols) {
      const normalizedSymbol = String(symbol || "").trim().toUpperCase();
      if (!normalizedSymbol) {
        continue;
      }
      const key = `${pool.baseTimeframe}::${normalizedSymbol}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push({
        samplePoolId: pool.id,
        samplePoolName: pool.name,
        baseTimeframe: pool.baseTimeframe,
        symbol: normalizedSymbol,
        assetClass: pool.assetClass,
        marketPresetId:
          DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[pool.assetClass],
      });
    }
  }
  return candidates;
};

const shuffleCandidatesForCoverage = (
  candidates: SystemDevSimulationFreeReplayPlanItem[],
  nextRandom: () => number,
  requireLeveragePresetCoverage = false,
): SystemDevSimulationFreeReplayPlanItem[] => {
  const shuffled = shuffleWithRandom(candidates, nextRandom);
  if (!requireLeveragePresetCoverage) {
    return shuffled;
  }
  const leveraged: SystemDevSimulationFreeReplayPlanItem[] = [];
  const unleveraged: SystemDevSimulationFreeReplayPlanItem[] = [];
  shuffled.forEach((candidate) => {
    const preset =
      DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[
        candidate.marketPresetId
      ];
    (
      preset?.allowLongMarginTrading || preset?.allowShortSelling
        ? leveraged
        : unleveraged
    ).push(candidate);
  });
  // Coverage may prioritize an instrument whose real market supports leverage,
  // but it must never fabricate another market or trading-rule binding.
  return leveraged.length ? [...leveraged, ...unleveraged] : shuffled;
};

export const resolveSystemDevSimulationFreeReplayTarget = (
  pools: SystemDevSimulationEnabledPool[],
  target = FREE_REPLAY_TARGET,
): number => {
  const normalizedTarget = Math.max(0, Math.floor(Number(target) || 0));
  if (!normalizedTarget) {
    return 0;
  }
  const candidates = buildFreeReplayCandidates(pools);
  if (!candidates.length) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  return normalizedTarget;
};

export const buildSystemDevSimulationFreeReplayPlan = (
  pools: SystemDevSimulationEnabledPool[],
  seed: string,
  target = FREE_REPLAY_TARGET,
  options?: {
    profileId?: SystemDevSimulationProfileId;
    requireLeveragePresetCoverage?: boolean;
  },
): SystemDevSimulationFreeReplayPlanItem[] => {
  const normalizedTarget = Math.max(0, Math.floor(Number(target) || 0));
  if (!normalizedTarget) {
    return [];
  }
  const candidates = buildFreeReplayCandidates(pools);
  if (!candidates.length) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  const nextRandom = createSeededRandom(`${seed}:free-replay-plan`);
  const requireLeveragePresetCoverage =
    Boolean(options?.requireLeveragePresetCoverage) ||
    options?.profileId === "STRESS";
  const plan: SystemDevSimulationFreeReplayPlanItem[] = [];
  if (candidates.length >= normalizedTarget) {
    return shuffleCandidatesForCoverage(
      candidates,
      nextRandom,
      requireLeveragePresetCoverage,
    ).slice(0, normalizedTarget);
  }
  while (plan.length < normalizedTarget) {
    const cycle = shuffleCandidatesForCoverage(
      candidates,
      nextRandom,
      requireLeveragePresetCoverage,
    );
    for (const candidate of cycle) {
      plan.push(candidate);
      if (plan.length >= normalizedTarget) {
        break;
      }
    }
  }
  return plan;
};

export const applyBuiltInTradingMarketPresetToSettings = (
  currentSettings: TradingSettings,
  presetId: BuiltInTradingMarketPresetId,
): TradingSettings => ({
  ...currentSettings,
  ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId],
});
