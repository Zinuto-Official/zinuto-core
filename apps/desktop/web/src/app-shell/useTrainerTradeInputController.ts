// SPDX-License-Identifier: GPL-3.0-only

import type { OrderInputMode as TradeInputMode, PriceMode as OrderPriceMode } from "@zinuto/shared/trading";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { parseNumeric } from '@/ui/formatting/format';
import type {
  CustomSamplePool
} from "@/frontend-kernel/appTypes";
import { DEFAULT_RATIO_PRESET_INPUTS } from '@/domains/trainer/tradingFormUtils';
import {
  DEFAULT_POOL_LOT_SIZE,
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_SYSTEM_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  findBuiltInSamplePoolById,
  resolveBuiltInPoolBySymbol
} from '@/domains/trainer/samplePools';

const SYMBOL_SEGMENT_PATTERN = /[._:/-]/;

const normalizeSymbol = (rawSymbol: string): string => String(rawSymbol || '').trim().toUpperCase();

const buildSymbolAliasSet = (rawSymbol: string): Set<string> => {
  const normalized = normalizeSymbol(rawSymbol);
  const aliases = new Set<string>();
  if (!normalized) {
    return aliases;
  }
  aliases.add(normalized);
  if (SYMBOL_SEGMENT_PATTERN.test(normalized)) {
    aliases.add(normalized.replace(/[._:/-]/g, ''));
    const parts = normalized.split(/[._:/-]/).filter((part) => part.trim().length > 0);
    const head = parts[0]?.trim().toUpperCase() ?? '';
    const tail = parts[parts.length - 1]?.trim().toUpperCase() ?? '';
    const tailLooksLikeMarketCode = /^[A-Z]{2,5}$/.test(tail);
    if (parts.length === 2 && head && tailLooksLikeMarketCode) {
      aliases.add(head);
    }
  }
  return aliases;
};

const symbolsLikelyMatch = (left: string, right: string): boolean => {
  const leftAliases = buildSymbolAliasSet(left);
  const rightAliases = buildSymbolAliasSet(right);
  if (!leftAliases.size || !rightAliases.size) {
    return false;
  }
  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) {
      return true;
    }
  }
  return false;
};

const poolContainsSymbol = (pool: CustomSamplePool, targetSymbol: string): boolean => {
  if (!targetSymbol) {
    return false;
  }
  return pool.symbols.some((symbol) => symbolsLikelyMatch(symbol, targetSymbol));
};

type UseTrainerTradeInputControllerArgs = {
  currentTrainingPoolId: string;
  activeSamplePoolId: string;
  customSamplePools: CustomSamplePool[];
  selectedSymbolUpper: string;
  lotSizeByPool: Record<string, number>;
  setLotSizeByPool: Dispatch<SetStateAction<Record<string, number>>>;
  buyRatioInput: string;
  setBuyRatioInput: Dispatch<SetStateAction<string>>;
  setSellRatioInput: Dispatch<SetStateAction<string>>;
  buyTradeInputMode: TradeInputMode;
  setSellTradeInputMode: Dispatch<SetStateAction<TradeInputMode>>;
  buyLotInput: string;
  setSellLotInput: Dispatch<SetStateAction<string>>;
  buyAmountInput: string;
  setSellAmountInput: Dispatch<SetStateAction<string>>;
  buyPriceMode: OrderPriceMode;
  setSellPriceMode: Dispatch<SetStateAction<OrderPriceMode>>;
  sellTradeInputMode: TradeInputMode;
  sellLotInput: string;
  sellAmountInput: string;
  sellPriceMode: OrderPriceMode;
  sellRatioInput: string;
};

export const useTrainerTradeInputController = ({
  currentTrainingPoolId,
  activeSamplePoolId,
  customSamplePools,
  selectedSymbolUpper,
  lotSizeByPool,
  setLotSizeByPool,
  buyRatioInput,
  setBuyRatioInput,
  setSellRatioInput,
  buyTradeInputMode,
  setSellTradeInputMode,
  buyLotInput,
  setSellLotInput,
  buyAmountInput,
  setSellAmountInput,
  buyPriceMode,
  setSellPriceMode,
  sellTradeInputMode,
  sellLotInput,
  sellAmountInput,
  sellPriceMode,
  sellRatioInput
}: UseTrainerTradeInputControllerArgs) => {
  const resolvePoolLotSize = useCallback(
    (rawPoolId?: string): number => {
      const poolId = (rawPoolId || '').trim();
      if (!poolId || poolId === SAMPLE_POOL_ALL_ID || poolId === SAMPLE_POOL_UNKNOWN_ID) {
        return DEFAULT_POOL_LOT_SIZE;
      }
      const builtInPool = findBuiltInSamplePoolById(poolId);
      const raw = lotSizeByPool[poolId];
      const fallback = builtInPool?.lotSize ?? DEFAULT_POOL_LOT_SIZE;
      const parsed = Number.isFinite(raw) ? Math.floor(raw) : fallback;
      return Math.max(1, parsed || fallback);
    },
    [lotSizeByPool]
  );

  const lotSizePoolIdForCurrentTrade = useMemo(() => {
    const activePoolId = (activeSamplePoolId || '').trim();
    if (activePoolId && activePoolId !== SAMPLE_POOL_ALL_ID && activePoolId !== SAMPLE_POOL_UNKNOWN_ID) {
      return activePoolId;
    }
    const trainingPoolId = (currentTrainingPoolId || '').trim();
    if (trainingPoolId && trainingPoolId !== SAMPLE_POOL_UNKNOWN_ID && trainingPoolId !== SAMPLE_POOL_ALL_ID) {
      return trainingPoolId;
    }
    if (selectedSymbolUpper) {
      const selectedMatchedPool = customSamplePools.find((pool) =>
        poolContainsSymbol(pool, selectedSymbolUpper)
      );
      if (selectedMatchedPool) {
        return selectedMatchedPool.id;
      }
      const anyMatchedPool = customSamplePools.find((pool) => poolContainsSymbol(pool, selectedSymbolUpper));
      if (anyMatchedPool) {
        return anyMatchedPool.id;
      }
      const builtInPool = resolveBuiltInPoolBySymbol(selectedSymbolUpper);
      if (builtInPool) {
        return builtInPool.id;
      }
    }
    return SAMPLE_POOL_SYSTEM_ID;
  }, [activeSamplePoolId, currentTrainingPoolId, customSamplePools, selectedSymbolUpper]);

  const lotSizeForCurrentPool = useMemo(
    () => resolvePoolLotSize(lotSizePoolIdForCurrentTrade),
    [lotSizePoolIdForCurrentTrade, resolvePoolLotSize]
  );

  const buyRatioPresetOptions = useMemo<string[]>(() => [...DEFAULT_RATIO_PRESET_INPUTS], []);

  const sellRatioPresetOptions = useMemo<string[]>(() => [...DEFAULT_RATIO_PRESET_INPUTS], []);

  useEffect(() => {
    const options: string[] = buyRatioPresetOptions.length ? buyRatioPresetOptions : [...DEFAULT_RATIO_PRESET_INPUTS];
    const fallback = options[0] ?? '25';
    setBuyRatioInput((current) => (options.includes(current) ? current : fallback));
  }, [buyRatioPresetOptions, setBuyRatioInput]);

  useEffect(() => {
    const options: string[] = sellRatioPresetOptions.length ? sellRatioPresetOptions : [...DEFAULT_RATIO_PRESET_INPUTS];
    const fallback = options[Math.min(1, options.length - 1)] ?? options[0] ?? '50';
    setSellRatioInput((current) => (options.includes(current) ? current : fallback));
  }, [sellRatioPresetOptions, setSellRatioInput]);

  const [sellInputsLocked, setSellInputsLocked] = useState(false);
  const lastMirroredSellValuesRef = useRef<{
    mode: TradeInputMode;
    lot: string;
    amount: string;
    priceMode: OrderPriceMode;
    ratio: string;
  } | null>(null);
  const pendingSellMirrorRef = useRef(false);

  useEffect(() => {
    if (sellInputsLocked) {
      return;
    }
    lastMirroredSellValuesRef.current = {
      mode: buyTradeInputMode,
      lot: buyLotInput,
      amount: buyAmountInput,
      priceMode: buyPriceMode,
      ratio: buyRatioInput,
    };
    pendingSellMirrorRef.current = true;
    setSellTradeInputMode((current) => (current === buyTradeInputMode ? current : buyTradeInputMode));
    setSellLotInput((current) => (current === buyLotInput ? current : buyLotInput));
    setSellAmountInput((current) => (current === buyAmountInput ? current : buyAmountInput));
    setSellPriceMode((current) => (current === buyPriceMode ? current : buyPriceMode));
    setSellRatioInput((current) => (current === buyRatioInput ? current : buyRatioInput));
  }, [
    buyAmountInput,
    buyLotInput,
    buyPriceMode,
    buyRatioInput,
    buyTradeInputMode,
    sellInputsLocked,
    setSellAmountInput,
    setSellLotInput,
    setSellPriceMode,
    setSellRatioInput,
    setSellTradeInputMode
  ]);

  // Sell inputs follow buy inputs until the user edits any sell field
  // manually. A change counts as user-edited only when it differs from both
  // the current buy values and the values the mirror last applied; transient
  // pre-mirror states after a buy change are ignored.
  useEffect(() => {
    const mirrored = lastMirroredSellValuesRef.current;
    if (!mirrored) {
      return;
    }
    const mirrorApplied =
      sellTradeInputMode === mirrored.mode &&
      sellLotInput === mirrored.lot &&
      sellAmountInput === mirrored.amount &&
      sellPriceMode === mirrored.priceMode &&
      sellRatioInput === mirrored.ratio;
    if (mirrorApplied) {
      pendingSellMirrorRef.current = false;
    }
    if (pendingSellMirrorRef.current || sellInputsLocked) {
      return;
    }
    const isUserEditedSellInput =
      (sellTradeInputMode !== buyTradeInputMode &&
        sellTradeInputMode !== mirrored.mode) ||
      (sellLotInput !== buyLotInput && sellLotInput !== mirrored.lot) ||
      (sellAmountInput !== buyAmountInput &&
        sellAmountInput !== mirrored.amount) ||
      (sellPriceMode !== buyPriceMode && sellPriceMode !== mirrored.priceMode) ||
      (sellRatioInput !== buyRatioInput && sellRatioInput !== mirrored.ratio);
    if (isUserEditedSellInput) {
      setSellInputsLocked(true);
    }
  }, [
    buyAmountInput,
    buyLotInput,
    buyPriceMode,
    buyRatioInput,
    buyTradeInputMode,
    sellAmountInput,
    sellInputsLocked,
    sellLotInput,
    sellPriceMode,
    sellRatioInput,
    sellTradeInputMode
  ]);

  const updatePoolLotSize = useCallback(
    (poolId: string, rawInput: string) => {
      const parsed = Math.max(1, Math.floor(parseNumeric(rawInput)));
      const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_LOT_SIZE;
      setLotSizeByPool((current) => ({
        ...current,
        [poolId]: normalized
      }));
    },
    [setLotSizeByPool]
  );

  return {
    resolvePoolLotSize,
    lotSizePoolIdForCurrentTrade,
    lotSizeForCurrentPool,
    buyRatioPresetOptions,
    sellRatioPresetOptions,
    updatePoolLotSize
  };
};
