// SPDX-License-Identifier: GPL-3.0-only

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { api } from '@/api';
import { resolveUnknownErrorMessage } from '@/frontend-kernel/errors/appErrorUtils';
import type { CustomSamplePool } from '@/frontend-kernel/appTypes';
import {
  BUILT_IN_SAMPLE_POOL_IDS,
  SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
  SAMPLE_POOL_SYSTEM_ID,
  isBuiltInSamplePoolId
} from '@/domains/trainer/samplePools';
import {
  BUILT_IN_TRADING_MARKET_PRESET_IDS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  isTradingMarketPresetInAssetClass,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClassId,
  type TradingCustomFeeTemplateMeta,
  type TradingMarketPresetId
} from '@/domains/trainer/tradingMarketPresets';

const normalizeTradingAssetClass = (value: unknown): TradingAssetClassId =>
  value === 'FUTURES' || value === 'FOREX' || value === 'CRYPTO' ? value : 'STOCK';

export type SystemPoolTradingBinding = {
  assetClass: TradingAssetClassId;
  marketPresetId: TradingMarketPresetId;
};

export type SystemPoolTradingBindingById = Record<string, SystemPoolTradingBinding>;

const BUILT_IN_TRADING_MARKET_PRESET_ID_SET = new Set<string>(BUILT_IN_TRADING_MARKET_PRESET_IDS);

const normalizeBuiltInTradingMarketPresetId = (
  value: unknown,
  fallback: BuiltInTradingMarketPresetId
): BuiltInTradingMarketPresetId => {
  const normalized = String(value || '').trim();
  return BUILT_IN_TRADING_MARKET_PRESET_ID_SET.has(normalized) ?
      (normalized as BuiltInTradingMarketPresetId) :
      fallback;
};

export const DEFAULT_SYSTEM_POOL_TRADING_BINDING_BY_ID: Record<string, SystemPoolTradingBinding> = {
  [SAMPLE_POOL_SYSTEM_ID]: {
    assetClass: 'STOCK',
    marketPresetId: 'US_STOCK'
  },
  [SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID]: {
    assetClass: 'FOREX',
    marketPresetId: 'FOREX_STANDARD_LOT'
  }
};

export const buildDefaultSystemPoolTradingBindingById = (
  supportedPoolIds: readonly string[] = BUILT_IN_SAMPLE_POOL_IDS
): SystemPoolTradingBindingById => {
  const next: SystemPoolTradingBindingById = {};
  supportedPoolIds.forEach((poolId) => {
    const normalizedPoolId = String(poolId || '').trim();
    const fallback = DEFAULT_SYSTEM_POOL_TRADING_BINDING_BY_ID[normalizedPoolId];
    if (!normalizedPoolId || !fallback) {
      return;
    }
    next[normalizedPoolId] = {
      assetClass: fallback.assetClass,
      marketPresetId: normalizeBuiltInTradingMarketPresetId(fallback.marketPresetId, DEFAULT_TRADING_MARKET_PRESET_ID)
    };
  });
  return next;
};

type NormalizePoolTradingBindingArgs = {
  assetClass: unknown;
  marketPresetId: unknown;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
};

export const normalizePoolTradingBinding = ({
  assetClass,
  marketPresetId,
  tradingMarketPresetCustomTemplates
}: NormalizePoolTradingBindingArgs): SystemPoolTradingBinding => {
  const normalizedAssetClass = normalizeTradingAssetClass(assetClass);
  const fallbackPresetId =
    DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[normalizedAssetClass] ?? DEFAULT_TRADING_MARKET_PRESET_ID;
  const normalizedPresetIdRaw = String(marketPresetId || '').trim();
  const normalizedPresetId =
    normalizedPresetIdRaw &&
    isTradingMarketPresetInAssetClass(normalizedPresetIdRaw, normalizedAssetClass, tradingMarketPresetCustomTemplates)
      ? (normalizedPresetIdRaw as TradingMarketPresetId)
      : fallbackPresetId;
  return {
    assetClass: normalizedAssetClass,
    marketPresetId: normalizedPresetId
  };
};

type NormalizeSystemPoolTradingBindingByIdArgs = {
  value: unknown;
  supportedPoolIds: readonly string[];
  fallbackAssetClass: TradingAssetClassId;
  fallbackMarketPresetId: TradingMarketPresetId;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
};

export const normalizeSystemPoolTradingBindingById = ({
  value,
  fallbackAssetClass,
  fallbackMarketPresetId,
  tradingMarketPresetCustomTemplates
}: NormalizeSystemPoolTradingBindingByIdArgs): SystemPoolTradingBindingById => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const fallback = normalizePoolTradingBinding({
    assetClass: fallbackAssetClass,
    marketPresetId: fallbackMarketPresetId,
    tradingMarketPresetCustomTemplates
  });
  const next: SystemPoolTradingBindingById = {};
  Object.entries(source).forEach(([poolId, rawBinding]) => {
    const normalizedPoolId = String(poolId || '').trim();
    const rawObject =
      rawBinding && typeof rawBinding === 'object' && !Array.isArray(rawBinding)
        ? (rawBinding as Record<string, unknown>)
        : null;
    if (!normalizedPoolId || !rawObject) {
      return;
    }
    next[normalizedPoolId] = normalizePoolTradingBinding({
      assetClass: rawObject.assetClass ?? fallback.assetClass,
      marketPresetId: rawObject.marketPresetId ?? fallback.marketPresetId,
      tradingMarketPresetCustomTemplates
    });
  });
  return next;
};

type ResolvePoolTradingBindingByPoolIdArgs = {
  poolId?: string;
  fallbackAssetClass: TradingAssetClassId;
  fallbackMarketPresetId: TradingMarketPresetId;
  customSamplePools: CustomSamplePool[];
  systemPoolTradingBindingById: SystemPoolTradingBindingById;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
};

export const resolvePoolTradingBindingByPoolId = ({
  poolId,
  fallbackAssetClass,
  fallbackMarketPresetId,
  customSamplePools,
  systemPoolTradingBindingById,
  tradingMarketPresetCustomTemplates
}: ResolvePoolTradingBindingByPoolIdArgs): SystemPoolTradingBinding => {
  const normalizedPoolId = String(poolId || '').trim();
  const savedDefault = normalizedPoolId ? systemPoolTradingBindingById[normalizedPoolId] : undefined;
  if (savedDefault) {
    return normalizePoolTradingBinding({
      assetClass: savedDefault.assetClass,
      marketPresetId: savedDefault.marketPresetId,
      tradingMarketPresetCustomTemplates
    });
  }
  if (normalizedPoolId && isBuiltInSamplePoolId(normalizedPoolId)) {
    const defaultBinding = DEFAULT_SYSTEM_POOL_TRADING_BINDING_BY_ID[normalizedPoolId];
    return normalizePoolTradingBinding({
      assetClass: defaultBinding?.assetClass ?? fallbackAssetClass,
      marketPresetId: defaultBinding?.marketPresetId ?? fallbackMarketPresetId,
      tradingMarketPresetCustomTemplates
    });
  }
  const matchedPool = normalizedPoolId
    ? customSamplePools.find((pool) => String(pool.id || '').trim() === normalizedPoolId)
    : undefined;
  if (matchedPool) {
    return normalizePoolTradingBinding({
      assetClass: matchedPool.assetClass ?? fallbackAssetClass,
      marketPresetId: matchedPool.marketPresetId ?? fallbackMarketPresetId,
      tradingMarketPresetCustomTemplates
    });
  }
  return normalizePoolTradingBinding({
    assetClass: fallbackAssetClass,
    marketPresetId: fallbackMarketPresetId,
    tradingMarketPresetCustomTemplates
  });
};

type UpdatePoolTradingBindingCoreArgs = {
  poolId: string;
  assetClass: TradingAssetClassId;
  marketPresetId: string;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
  setSystemPoolTradingBindingById: Dispatch<SetStateAction<SystemPoolTradingBindingById>>;
  appIsMountedRef: MutableRefObject<boolean>;
  fallbackErrorMessage: string;
  reportError: (message: string) => void;
};

export const updatePoolTradingBindingCore = async ({
  poolId,
  assetClass,
  marketPresetId,
  tradingMarketPresetCustomTemplates,
  setSystemPoolTradingBindingById,
  appIsMountedRef,
  fallbackErrorMessage,
  reportError
}: UpdatePoolTradingBindingCoreArgs): Promise<boolean> => {
  const normalizedPoolId = String(poolId || '').trim();
  if (!normalizedPoolId) {
    return false;
  }
  const normalizedBinding = normalizePoolTradingBinding({
    assetClass,
    marketPresetId,
    tradingMarketPresetCustomTemplates
  });
  try {
    const updated = await api.setFreeReplayPoolDefaultEnvironment(
      normalizedPoolId,
      normalizedBinding
    );
    if (!appIsMountedRef.current) {
      return false;
    }
    setSystemPoolTradingBindingById(
      normalizeSystemPoolTradingBindingById({
        value: updated,
        supportedPoolIds: BUILT_IN_SAMPLE_POOL_IDS,
        fallbackAssetClass: normalizedBinding.assetClass,
        fallbackMarketPresetId: normalizedBinding.marketPresetId,
        tradingMarketPresetCustomTemplates
      })
    );
    return true;
  } catch (err) {
    if (appIsMountedRef.current) {
      reportError(resolveUnknownErrorMessage(err, fallbackErrorMessage));
    }
    return false;
  }
};
