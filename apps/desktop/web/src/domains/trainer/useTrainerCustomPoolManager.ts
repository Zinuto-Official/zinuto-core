// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { BaseTimeframe } from '@/domains/trainer/trainerTypes';
import type { DestructiveDataChangeFinalizer } from '@/domains/data-import/destructiveDataChangeTypes';

const LOCAL_POOL_DELETE_PROGRESS_MIN_MS = 420;

type CustomSamplePoolLike = {
  id: string;
  name: string;
  selected: boolean;
  updatedAt: string;
};

type UseTrainerCustomPoolManagerParams<TCustomPool extends CustomSamplePoolLike> = {
  appIsMountedRef: MutableRefObject<boolean>;
  deletingSamplePoolId: string;
  deletingSamplePoolProgressPercent: number;
  deletingSamplePoolProgressTargetPercent: number;
  editingSamplePoolId: string;
  editingSamplePoolName: string;
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  isCsvImporting: boolean;
  samplePoolUnknownId: string;
  samplePoolUnknownName: () => string;
  tt: (key: AppTextKey) => string;
  resolveUnknownErrorMessage: (error: unknown, fallbackText: string) => string;
  sanitizeSamplePoolName: (rawName: string, fallbackName?: string) => string;
  waitForDuration: (ms: number) => Promise<void>;
  waitForNextAnimationFrame: () => Promise<void>;
  waitForPercentReach: (getCurrent: () => number, target: number, timeoutMs?: number) => Promise<void>;
  deleteLocalDataSource: (sourceId: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  refreshInstruments: (options?: { signal?: AbortSignal }) => Promise<unknown[]>;
  syncCustomSamplePoolsFromDataSources: (options?: { signal?: AbortSignal }) => Promise<unknown[]>;
  finalizeDestructiveDataChange?: DestructiveDataChangeFinalizer;
  setError: Dispatch<SetStateAction<string>>;
  setCustomSamplePools: Dispatch<SetStateAction<TCustomPool[]>>;
  setCustomPoolNameOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setCurrentTrainingPoolMeta: Dispatch<SetStateAction<{ id: string; name: string }>>;
  setCurrentTrainingBaseTimeframe: Dispatch<SetStateAction<BaseTimeframe>>;
  setLotSizeByPool: Dispatch<SetStateAction<Record<string, number>>>;
  setEditingSamplePoolId: Dispatch<SetStateAction<string>>;
  setEditingSamplePoolName: Dispatch<SetStateAction<string>>;
  setDeletingSamplePoolId: Dispatch<SetStateAction<string>>;
  setDeletingSamplePoolProgressPercent: Dispatch<SetStateAction<number>>;
  setDeletingSamplePoolProgressTargetPercent: Dispatch<SetStateAction<number>>;
  onCustomPoolRemoved?: (poolId: string) => void;
};

export const useTrainerCustomPoolManager = <TCustomPool extends CustomSamplePoolLike>({
  appIsMountedRef,
  deletingSamplePoolId,
  deletingSamplePoolProgressPercent,
  deletingSamplePoolProgressTargetPercent,
  editingSamplePoolId,
  editingSamplePoolName,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  isCsvImporting,
  samplePoolUnknownId,
  samplePoolUnknownName,
  tt,
  resolveUnknownErrorMessage,
  sanitizeSamplePoolName,
  waitForDuration,
  waitForNextAnimationFrame,
  waitForPercentReach,
  deleteLocalDataSource,
  refreshInstruments,
  syncCustomSamplePoolsFromDataSources,
  finalizeDestructiveDataChange,
  setError,
  setCustomSamplePools,
  setCustomPoolNameOverrides,
  setCurrentTrainingPoolMeta,
  setCurrentTrainingBaseTimeframe,
  setLotSizeByPool,
  setEditingSamplePoolId,
  setEditingSamplePoolName,
  setDeletingSamplePoolId,
  setDeletingSamplePoolProgressPercent,
  setDeletingSamplePoolProgressTargetPercent,
  onCustomPoolRemoved
}: UseTrainerCustomPoolManagerParams<TCustomPool>) => {
  const deletingSamplePoolProgressPercentRef = useRef(0);
  const editingSamplePoolOriginalNameRef = useRef('');

  useEffect(() => {
    deletingSamplePoolProgressPercentRef.current = Math.max(0, Math.min(100, Number(deletingSamplePoolProgressPercent) || 0));
  }, [deletingSamplePoolProgressPercent]);

  useEffect(() => {
    const current = Math.max(0, Math.min(100, Number(deletingSamplePoolProgressPercent) || 0));
    const target = Math.max(0, Math.min(100, Number(deletingSamplePoolProgressTargetPercent) || 0));
    if (current >= target) {
      return;
    }
    const timerId = window.setTimeout(() => {
      setDeletingSamplePoolProgressPercent((value) =>
        Math.min(target, Math.max(0, Math.min(100, Number(value) || 0)) + 1)
      );
    }, 16);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    deletingSamplePoolProgressPercent,
    deletingSamplePoolProgressTargetPercent,
    setDeletingSamplePoolProgressPercent
  ]);

  useEffect(() => {
    if (!editingSamplePoolId && editingSamplePoolName) {
      setEditingSamplePoolName('');
    }
  }, [editingSamplePoolId, editingSamplePoolName, setEditingSamplePoolName]);

  const renameCustomPool = useCallback(
    (poolId: string, rawName: string) => {
      const nextName = sanitizeSamplePoolName(rawName, tt('appText.unnamedSamplePool'));
      setCustomSamplePools((current) =>
        current.map((pool) =>
          pool.id === poolId
            ? {
                ...pool,
                name: nextName,
                updatedAt: new Date().toISOString()
              }
            : pool
        )
      );
      setCustomPoolNameOverrides((current) => ({
        ...current,
        [poolId]: nextName,
      }));
      setCurrentTrainingPoolMeta((current) => (current.id === poolId ? { id: poolId, name: nextName } : current));
    },
    [sanitizeSamplePoolName, setCurrentTrainingPoolMeta, setCustomPoolNameOverrides, setCustomSamplePools, tt]
  );

  const startRenameSamplePool = useCallback(
    (poolId: string, poolName: string) => {
      editingSamplePoolOriginalNameRef.current = poolName;
      setEditingSamplePoolId(poolId);
      setEditingSamplePoolName(poolName);
    },
    [setEditingSamplePoolId, setEditingSamplePoolName]
  );

  const cancelRenameSamplePool = useCallback(() => {
    editingSamplePoolOriginalNameRef.current = '';
    setEditingSamplePoolId('');
    setEditingSamplePoolName('');
  }, [setEditingSamplePoolId, setEditingSamplePoolName]);

  const saveRenameSamplePool = useCallback(() => {
    if (!editingSamplePoolId) {
      return;
    }
    if (editingSamplePoolName !== editingSamplePoolOriginalNameRef.current) {
      renameCustomPool(editingSamplePoolId, editingSamplePoolName);
    }
    editingSamplePoolOriginalNameRef.current = '';
    setEditingSamplePoolId('');
    setEditingSamplePoolName('');
  }, [
    editingSamplePoolId,
    editingSamplePoolName,
    renameCustomPool,
    setEditingSamplePoolId,
    setEditingSamplePoolName
  ]);

  const removeCustomPool = useCallback(
    async (poolId: string) => {
      const normalizedPoolId = String(poolId ?? '').trim();
      if (
        !normalizedPoolId ||
        deletingSamplePoolId ||
        isPreparingCsvImportPreview ||
        isClearingLocalDataSources ||
        isCsvImporting
      ) {
        return;
      }
      const progressStartAt = performance.now();
      setError('');
      setDeletingSamplePoolId(normalizedPoolId);
      setDeletingSamplePoolProgressPercent(0);
      setDeletingSamplePoolProgressTargetPercent(92);
      let deleteSuccess = false;
      try {
        await waitForNextAnimationFrame();
        await deleteLocalDataSource(normalizedPoolId);
        deleteSuccess = true;
        setDeletingSamplePoolProgressTargetPercent(100);
      } catch (err) {
        if (appIsMountedRef.current) {
          setError(resolveUnknownErrorMessage(err, tt('appText.import')));
        }
      } finally {
        const progressElapsed = performance.now() - progressStartAt;
        const minimumWaitMs = LOCAL_POOL_DELETE_PROGRESS_MIN_MS - progressElapsed;
        if (deleteSuccess) {
          await Promise.all([
            waitForDuration(minimumWaitMs),
            waitForPercentReach(() => deletingSamplePoolProgressPercentRef.current, 100, 1800)
          ]);
        } else {
          await waitForDuration(minimumWaitMs);
        }
        if (deleteSuccess && appIsMountedRef.current) {
          if (editingSamplePoolId === normalizedPoolId) {
            setEditingSamplePoolId('');
            setEditingSamplePoolName('');
          }
          setLotSizeByPool((current) => {
            if (!(normalizedPoolId in current)) {
              return current;
            }
            const { [normalizedPoolId]: _removed, ...rest } = current;
            return rest;
          });
          setCustomSamplePools((current) => current.filter((pool) => pool.id !== normalizedPoolId));
          setCustomPoolNameOverrides((current) => {
            if (!(normalizedPoolId in current)) {
              return current;
            }
            const { [normalizedPoolId]: _removed, ...rest } = current;
            return rest;
          });
          setCurrentTrainingPoolMeta((current) =>
            current.id === normalizedPoolId ? { id: samplePoolUnknownId, name: samplePoolUnknownName() } : current
          );
          setCurrentTrainingBaseTimeframe((current) => (current !== '1d' ? '1d' : current));
          onCustomPoolRemoved?.(normalizedPoolId);
          if (finalizeDestructiveDataChange) {
            const finalizeResult = await finalizeDestructiveDataChange({
              clearRemovedSymbols: true,
              refreshDataSources: true,
              resetAutoplay: true,
            });
            if (finalizeResult.failed) {
              setError(tt('appText.import'));
            }
          } else {
            await Promise.all([
              refreshInstruments().catch(() => []),
              syncCustomSamplePoolsFromDataSources().catch(() => [])
            ]);
          }
        }
        if (appIsMountedRef.current) {
          window.setTimeout(() => {
            if (!appIsMountedRef.current) {
              return;
            }
            setDeletingSamplePoolId('');
            setDeletingSamplePoolProgressPercent(0);
            setDeletingSamplePoolProgressTargetPercent(0);
          }, deleteSuccess ? 160 : 80);
        }
      }
    },
    [
      appIsMountedRef,
      deleteLocalDataSource,
      deletingSamplePoolId,
      editingSamplePoolId,
      finalizeDestructiveDataChange,
      isClearingLocalDataSources,
      isCsvImporting,
      isPreparingCsvImportPreview,
      refreshInstruments,
      resolveUnknownErrorMessage,
      samplePoolUnknownId,
      samplePoolUnknownName,
      setCurrentTrainingBaseTimeframe,
      setCurrentTrainingPoolMeta,
      setCustomPoolNameOverrides,
      setCustomSamplePools,
      setDeletingSamplePoolId,
      setDeletingSamplePoolProgressPercent,
      setDeletingSamplePoolProgressTargetPercent,
      setEditingSamplePoolId,
      setEditingSamplePoolName,
      setError,
      setLotSizeByPool,
      syncCustomSamplePoolsFromDataSources,
      onCustomPoolRemoved,
      tt,
      waitForDuration,
      waitForNextAnimationFrame,
      waitForPercentReach
    ]
  );

  return {
    startRenameSamplePool,
    cancelRenameSamplePool,
    saveRenameSamplePool,
    removeCustomPool
  };
};
