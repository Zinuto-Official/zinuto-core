// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { SessionSnapshot } from '@/domains/training/types';
import type { BaseTimeframe } from '@/domains/trainer/trainerTypes';
import type { TrainerInstrumentOption } from '@/domains/trainer/useTrainerSamplePoolModel';

type SamplePoolOptionLike = {
  id: string;
  name: string;
  disabled?: boolean;
};

type BuiltInPoolLike = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
};

type CustomPoolLike = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
};

type LoadSymbolOptions = {
  silentError?: boolean;
  forceNewSession?: boolean;
  cleanupStaleSessions?: boolean;
  instrumentId?: string;
  poolId?: string;
  anchorIndex?: number;
};

type UseTrainerPoolSelectionControllerParams = {
  activeSamplePoolId: string;
  selectedSymbol: string;
  selectedInstrumentId: string;
  snapshotSessionSymbol?: string;
  snapshotSessionInstrumentId?: string;
  isBusy: boolean;
  autoStartWhenIdle?: boolean;
  isTrainingSymbolLocked: boolean;
  includeSystemDefaultPool: boolean;
  selectedCustomSamplePoolsLength: number;
  trainerSamplePoolOptions: SamplePoolOptionLike[];
  symbolOptionEntries: TrainerInstrumentOption[];
  randomInstrumentPool: TrainerInstrumentOption[];
  availableBuiltInPoolInstrumentOptionsById: Map<string, TrainerInstrumentOption[]>;
  selectedCustomPoolInstrumentOptionsMap: Map<string, TrainerInstrumentOption[]>;
  customSamplePools: CustomPoolLike[];
  samplePoolAllId: string;
  samplePoolUnknownId: string;
  samplePoolUnknownName: () => string;
  barsOffsetRef: MutableRefObject<number>;
  barsTotalRef: MutableRefObject<number>;
  manualPoolSwitchTokenRef: MutableRefObject<number>;
  manualPoolSwitchLoadingRef: MutableRefObject<boolean>;
  autoSyncSymbolKeyRef: MutableRefObject<string>;
  setHint: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  setReplayUnavailableMessage: Dispatch<SetStateAction<string>>;
  setActiveSamplePoolId: Dispatch<SetStateAction<string>>;
  setCurrentTrainingBaseTimeframe: Dispatch<SetStateAction<BaseTimeframe>>;
  setBars: Dispatch<SetStateAction<Array<{ ts: string; open: number; high: number; low: number; close: number; volume: number }>>>;
  setBarsOffset: Dispatch<SetStateAction<number>>;
  setBarsTotal: Dispatch<SetStateAction<number>>;
  setSessionId: Dispatch<SetStateAction<string>>;
  setSnapshot: Dispatch<SetStateAction<SessionSnapshot | null>>;
  setSelectedSymbol: Dispatch<SetStateAction<string>>;
  setSelectedInstrumentId: Dispatch<SetStateAction<string>>;
  setIncludeSystemDefaultPool: Dispatch<SetStateAction<boolean>>;
  setCurrentTrainingPoolMeta: Dispatch<SetStateAction<{ id: string; name: string }>>;
  resolveSamplePoolBaseTimeframe: (poolId: string) => BaseTimeframe;
  findBuiltInSamplePoolById: (poolId: string) => BuiltInPoolLike | undefined;
  isBuiltInSamplePoolId: (poolId: string) => boolean;
  loadSymbol: (symbol: string, options?: LoadSymbolOptions) => Promise<string>;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

export const useTrainerPoolSelectionController = ({
  activeSamplePoolId,
  selectedSymbol,
  selectedInstrumentId,
  snapshotSessionSymbol,
  snapshotSessionInstrumentId,
  isBusy,
  autoStartWhenIdle = true,
  isTrainingSymbolLocked,
  includeSystemDefaultPool,
  selectedCustomSamplePoolsLength,
  trainerSamplePoolOptions,
  symbolOptionEntries,
  randomInstrumentPool,
  availableBuiltInPoolInstrumentOptionsById,
  selectedCustomPoolInstrumentOptionsMap,
  customSamplePools,
  samplePoolAllId,
  samplePoolUnknownId,
  samplePoolUnknownName,
  barsOffsetRef,
  barsTotalRef,
  manualPoolSwitchTokenRef,
  manualPoolSwitchLoadingRef,
  autoSyncSymbolKeyRef,
  setHint,
  setError,
  setReplayUnavailableMessage,
  setActiveSamplePoolId,
  setCurrentTrainingBaseTimeframe,
  setBars,
  setBarsOffset,
  setBarsTotal,
  setSessionId,
  setSnapshot,
  setSelectedSymbol,
  setSelectedInstrumentId,
  setIncludeSystemDefaultPool,
  setCurrentTrainingPoolMeta,
  resolveSamplePoolBaseTimeframe,
  findBuiltInSamplePoolById,
  isBuiltInSamplePoolId,
  loadSymbol,
  tt,
  ttf
}: UseTrainerPoolSelectionControllerParams) => {
  const trainerSamplePoolOptionIds = useMemo(
    () =>
      trainerSamplePoolOptions
        .filter((option) => !option.disabled)
        .map((option) => (option.id || '').trim())
        .filter(Boolean),
    [trainerSamplePoolOptions]
  );

  const activeSamplePoolSelectValue = useMemo(() => {
    const normalized = (activeSamplePoolId || '').trim();
    if (!normalized) {
      return samplePoolAllId;
    }
    return trainerSamplePoolOptionIds.includes(normalized) ? normalized : samplePoolAllId;
  }, [activeSamplePoolId, samplePoolAllId, trainerSamplePoolOptionIds]);

  const activeToolbarSymbol = useMemo(
    () => (selectedSymbol || snapshotSessionSymbol || '').trim().toUpperCase(),
    [selectedSymbol, snapshotSessionSymbol]
  );

  const loadSymbolByInput = useCallback(
    async (rawValue: string) => {
      const normalizedValue = rawValue.trim();
      if (!normalizedValue) {
        return;
      }
      const targetEntry =
        symbolOptionEntries.find((entry) => entry.instrumentId === normalizedValue) ??
        symbolOptionEntries.find((entry) => entry.label === normalizedValue) ??
        symbolOptionEntries.find((entry) => entry.symbol === normalizedValue.toUpperCase()) ??
        null;
      if (!targetEntry) {
        return;
      }
      const symbol = targetEntry.symbol.trim().toUpperCase();
      const currentActiveInstrumentId = (selectedInstrumentId || snapshotSessionInstrumentId || '').trim();
      if (
        isTrainingSymbolLocked &&
        currentActiveInstrumentId &&
        currentActiveInstrumentId !== targetEntry.instrumentId
      ) {
        setHint(tt('appText.replaceableDuringUse'));
        return;
      }
      if (currentActiveInstrumentId && currentActiveInstrumentId === targetEntry.instrumentId) {
        return;
      }
      await loadSymbol(symbol, {
        instrumentId: targetEntry.instrumentId,
        poolId: targetEntry.poolId,
        forceNewSession: true,
        cleanupStaleSessions: true
      });
    },
    [
      isTrainingSymbolLocked,
      loadSymbol,
      selectedInstrumentId,
      setHint,
      snapshotSessionInstrumentId,
      snapshotSessionSymbol,
      symbolOptionEntries,
      tt
    ]
  );

  const handleSamplePoolChange = useCallback(
    (nextPoolId: string) => {
      if (!nextPoolId) {
        return;
      }
      if (isTrainingSymbolLocked) {
        setHint(tt('appText.replaceableDuringUse'));
        return;
      }
      const isSamePool = nextPoolId === activeSamplePoolId;
      const switchToken = manualPoolSwitchTokenRef.current + 1;
      manualPoolSwitchTokenRef.current = switchToken;
      manualPoolSwitchLoadingRef.current = true;

      setReplayUnavailableMessage('');
      if (!isSamePool) {
        setActiveSamplePoolId(nextPoolId);
        const nextPoolBaseTimeframe = resolveSamplePoolBaseTimeframe(nextPoolId);
        setCurrentTrainingBaseTimeframe(nextPoolBaseTimeframe);
      }
      const poolEntries =
        nextPoolId === samplePoolAllId
          ? randomInstrumentPool
          : isBuiltInSamplePoolId(nextPoolId)
            ? availableBuiltInPoolInstrumentOptionsById.get(nextPoolId) ?? []
            : selectedCustomPoolInstrumentOptionsMap.get(nextPoolId) ?? [];

      if (!poolEntries.length) {
        setBars([]);
        setBarsOffset(0);
        setBarsTotal(0);
        barsOffsetRef.current = 0;
        barsTotalRef.current = 0;
        setSessionId('');
        setSnapshot(null);
        setSelectedSymbol('');
        setSelectedInstrumentId('');
        setHint(tt('appText.replayableSymbolsSamplePool'));
        if (manualPoolSwitchTokenRef.current === switchToken) {
          manualPoolSwitchLoadingRef.current = false;
        }
        return;
      }

      const currentActiveInstrumentId = (selectedInstrumentId || snapshotSessionInstrumentId || '').trim();
      const startIndex = Math.floor(Math.random() * poolEntries.length);
      const rotated = [...poolEntries.slice(startIndex), ...poolEntries.slice(0, startIndex)];
      const candidates =
        currentActiveInstrumentId && rotated.length > 1
          ? rotated.filter((entry) => entry.instrumentId !== currentActiveInstrumentId)
          : rotated;
      const targetEntry = candidates[0] ?? rotated[0] ?? null;

      void (async () => {
        try {
          if (!targetEntry || manualPoolSwitchTokenRef.current !== switchToken) {
            return;
          }
          const ok = await loadSymbol(targetEntry.symbol, {
            silentError: true,
            forceNewSession: true,
            cleanupStaleSessions: true,
            instrumentId: targetEntry.instrumentId,
            poolId: nextPoolId
          });
          if (manualPoolSwitchTokenRef.current !== switchToken) {
            return;
          }
          if (ok) {
            return;
          }
          if (manualPoolSwitchTokenRef.current === switchToken) {
            setError(ttf('appText.loadingAfterSwitchingSamplePoolValue0', [targetEntry.label]));
          }
        } finally {
          if (manualPoolSwitchTokenRef.current === switchToken) {
            manualPoolSwitchLoadingRef.current = false;
          }
        }
      })();
    },
    [
      activeSamplePoolId,
      availableBuiltInPoolInstrumentOptionsById,
      barsOffsetRef,
      barsTotalRef,
      isBuiltInSamplePoolId,
      isTrainingSymbolLocked,
      loadSymbol,
      manualPoolSwitchLoadingRef,
      manualPoolSwitchTokenRef,
      resolveSamplePoolBaseTimeframe,
      samplePoolAllId,
      selectedCustomPoolInstrumentOptionsMap,
      selectedInstrumentId,
      selectedSymbol,
      setActiveSamplePoolId,
      setBars,
      setBarsOffset,
      setBarsTotal,
      setCurrentTrainingBaseTimeframe,
      setError,
      setHint,
      setReplayUnavailableMessage,
      setSelectedInstrumentId,
      setSelectedSymbol,
      setSessionId,
      setSnapshot,
      snapshotSessionInstrumentId,
      snapshotSessionSymbol,
      tt,
      ttf
    ]
  );

  const selectSamplePoolOption = useCallback(
    (poolId: string) => {
      const matched = trainerSamplePoolOptions.find((option) => option.id === poolId);
      if (!matched || matched.disabled) {
        setHint(tt('appText.replaceableDuringUse'));
        return;
      }
      handleSamplePoolChange(matched.id);
    },
    [handleSamplePoolChange, setHint, trainerSamplePoolOptions, tt]
  );

  const selectSymbolOption = useCallback(
    (rawSymbol: string) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) {
        return;
      }
      void loadSymbolByInput(symbol);
    },
    [loadSymbolByInput]
  );

  const pickRandomSymbolOption = useCallback(() => {
    if (isBusy) {
      return;
    }
    const currentActiveInstrumentId = (selectedInstrumentId || snapshotSessionInstrumentId || '').trim();
    if (isTrainingSymbolLocked && currentActiveInstrumentId) {
      setHint(tt('appText.replaceableDuringUse'));
      return;
    }

    if (!randomInstrumentPool.length) {
      setHint(tt('appText.replayableSymbolsSamplePool'));
      return;
    }

    const candidates =
      currentActiveInstrumentId && randomInstrumentPool.length > 1
        ? randomInstrumentPool.filter((entry) => entry.instrumentId !== currentActiveInstrumentId)
        : randomInstrumentPool;
    const targetEntry = candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    if (!targetEntry) {
      return;
    }

    void (async () => {
      void loadSymbol(targetEntry.symbol, {
        instrumentId: targetEntry.instrumentId,
        poolId: targetEntry.poolId,
        forceNewSession: true,
        silentError: true,
        cleanupStaleSessions: true
      });
    })();
  }, [
    activeSamplePoolId,
    isBusy,
    isTrainingSymbolLocked,
    loadSymbol,
    randomInstrumentPool,
    resolveSamplePoolBaseTimeframe,
    selectedInstrumentId,
    selectedSymbol,
    setHint,
    snapshotSessionInstrumentId,
    snapshotSessionSymbol,
    tt
  ]);

  useEffect(() => {
    const optionSet = new Set(trainerSamplePoolOptionIds);
    setActiveSamplePoolId((current) => (optionSet.has((current || '').trim()) ? current : samplePoolAllId));
  }, [samplePoolAllId, setActiveSamplePoolId, trainerSamplePoolOptionIds]);

  useEffect(() => {
    if (selectedCustomSamplePoolsLength > 0) {
      return;
    }
    if (!includeSystemDefaultPool) {
      setIncludeSystemDefaultPool(true);
    }
  }, [
    includeSystemDefaultPool,
    selectedCustomSamplePoolsLength,
    setIncludeSystemDefaultPool
  ]);

  useEffect(() => {
    const builtInPool = findBuiltInSamplePoolById(activeSamplePoolId);
    if (builtInPool) {
      setCurrentTrainingPoolMeta({ id: builtInPool.id, name: builtInPool.name });
      setCurrentTrainingBaseTimeframe(builtInPool.baseTimeframe);
      return;
    }
    if (activeSamplePoolId === samplePoolAllId) {
      return;
    }
    const matched = customSamplePools.find((pool) => pool.id === activeSamplePoolId);
    if (matched) {
      setCurrentTrainingPoolMeta({ id: matched.id, name: matched.name });
      setCurrentTrainingBaseTimeframe(matched.baseTimeframe);
      return;
    }
    setCurrentTrainingPoolMeta({ id: samplePoolUnknownId, name: samplePoolUnknownName() });
  }, [
    activeSamplePoolId,
    customSamplePools,
    findBuiltInSamplePoolById,
    samplePoolAllId,
    samplePoolUnknownId,
    samplePoolUnknownName,
    setCurrentTrainingBaseTimeframe,
    setCurrentTrainingPoolMeta
  ]);

  useEffect(() => {
    if (!autoStartWhenIdle) {
      return;
    }
    if (isBusy) {
      return;
    }
    if (isTrainingSymbolLocked) {
      return;
    }
    const activeSessionSymbol = (snapshotSessionSymbol || '').trim().toUpperCase();
    if (activeSessionSymbol) {
      return;
    }
    const current = (selectedInstrumentId || '').trim();
    if (!current) {
      return;
    }
    if (!randomInstrumentPool.some((entry) => entry.instrumentId === current)) {
      setSelectedSymbol('');
      setSelectedInstrumentId('');
    }
  }, [isBusy, isTrainingSymbolLocked, randomInstrumentPool, selectedInstrumentId, setSelectedInstrumentId, selectedSymbol, setSelectedSymbol, snapshotSessionSymbol]);

  useEffect(() => {
    if (!autoStartWhenIdle) {
      autoSyncSymbolKeyRef.current = '';
      return;
    }
    if (isBusy) {
      return;
    }
    if (manualPoolSwitchLoadingRef.current) {
      return;
    }
    if (!randomInstrumentPool.length) {
      autoSyncSymbolKeyRef.current = '';
      return;
    }

    const current = (selectedInstrumentId || snapshotSessionInstrumentId || '').trim();
    if (current) {
      autoSyncSymbolKeyRef.current = '';
      return;
    }

    const poolKey = `${activeSamplePoolId}|${randomInstrumentPool.map((entry) => entry.instrumentId).join(',')}`;
    const syncKey = `${poolKey}|AUTO`;
    if (autoSyncSymbolKeyRef.current === syncKey) {
      return;
    }
    autoSyncSymbolKeyRef.current = syncKey;
    const startIndex = Math.floor(Math.random() * randomInstrumentPool.length);
    const targetEntry =
      [...randomInstrumentPool.slice(startIndex), ...randomInstrumentPool.slice(0, startIndex)][0] ?? null;
    void (async () => {
      if (!targetEntry) {
        return;
      }
      const ok = await loadSymbol(targetEntry.symbol, {
        instrumentId: targetEntry.instrumentId,
        poolId: targetEntry.poolId,
        forceNewSession: true,
        cleanupStaleSessions: true,
        silentError: true
      });
      if (ok) {
        return;
      }
      if (!(selectedSymbol || snapshotSessionSymbol || '').trim()) {
        setError(ttf('appText.loadingAfterSwitchingSamplePoolValue0', [targetEntry.label]));
      }
    })();
  }, [
    activeSamplePoolId,
    autoSyncSymbolKeyRef,
    autoStartWhenIdle,
    isBusy,
    loadSymbol,
    manualPoolSwitchLoadingRef,
    randomInstrumentPool,
    selectedInstrumentId,
    selectedSymbol,
    snapshotSessionInstrumentId,
    snapshotSessionSymbol,
    setError,
    ttf
  ]);

  return {
    activeSamplePoolSelectValue,
    activeToolbarSymbol,
    selectSamplePoolOption,
    selectSymbolOption,
    pickRandomSymbolOption
  };
};
