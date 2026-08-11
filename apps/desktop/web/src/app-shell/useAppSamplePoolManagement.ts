// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CustomSamplePool } from '@/frontend-kernel/appTypes';
import type { DataConfigPoolOrderByBase } from '@/app-shell/appRootDataConfigUtils';
import type { CsvImportBaseTimeframe } from '@/domains/data-import/baseTimeframeInference';
import type { BuiltInSamplePoolConfig } from '@/domains/trainer/samplePools';

type PoolSettingsRowLike = {
  id: string;
  baseTimeframe: string;
};

type UseAppSamplePoolManagementArgs = {
  editingSamplePoolId: string;
  editingSamplePoolName: string;
  poolSettingsRows: PoolSettingsRowLike[];
  sanitizeSamplePoolName: (name: string, fallbackName: string) => string;
  isBuiltInSamplePoolId: (poolId: string) => boolean;
  findBuiltInSamplePoolById: (poolId: string) => BuiltInSamplePoolConfig | undefined;
  saveRenameSamplePool: () => void;
  removeCustomPool: (poolId: string) => Promise<void>;
  setEditingSamplePoolId: Dispatch<SetStateAction<string>>;
  setEditingSamplePoolName: Dispatch<SetStateAction<string>>;
  setSystemPoolNameOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setDataConfigPoolOrderByBase: Dispatch<SetStateAction<DataConfigPoolOrderByBase>>;
  setCustomSamplePools: Dispatch<SetStateAction<CustomSamplePool[]>>;
};

export const useAppSamplePoolManagement = ({
  editingSamplePoolId,
  editingSamplePoolName,
  poolSettingsRows,
  sanitizeSamplePoolName,
  isBuiltInSamplePoolId,
  findBuiltInSamplePoolById,
  saveRenameSamplePool,
  removeCustomPool,
  setEditingSamplePoolId,
  setEditingSamplePoolName,
  setSystemPoolNameOverrides,
  setDataConfigPoolOrderByBase,
  setCustomSamplePools
}: UseAppSamplePoolManagementArgs) => {
  const saveSamplePoolRename = useCallback(() => {
    const normalizedPoolId = String(editingSamplePoolId || '').trim();
    if (!normalizedPoolId) {
      return;
    }
    const builtInPool = findBuiltInSamplePoolById(normalizedPoolId);
    if (builtInPool) {
      const fallbackName = builtInPool.name;
      const nextName = sanitizeSamplePoolName(editingSamplePoolName, fallbackName);
      setSystemPoolNameOverrides((current) => ({
        ...current,
        [normalizedPoolId]: nextName
      }));
      setEditingSamplePoolId('');
      setEditingSamplePoolName('');
      return;
    }
    saveRenameSamplePool();
  }, [
    editingSamplePoolId,
    editingSamplePoolName,
    findBuiltInSamplePoolById,
    sanitizeSamplePoolName,
    saveRenameSamplePool,
    setEditingSamplePoolId,
    setEditingSamplePoolName,
    setSystemPoolNameOverrides
  ]);

  const removeSamplePool = useCallback(
    async (poolId: string) => {
      const normalizedPoolId = String(poolId || '').trim();
      if (!normalizedPoolId) {
        return;
      }
      if (isBuiltInSamplePoolId(normalizedPoolId)) {
        return;
      }
      await removeCustomPool(normalizedPoolId);
    },
    [
      isBuiltInSamplePoolId,
      removeCustomPool,
      setDataConfigPoolOrderByBase,
      setSystemPoolNameOverrides,
    ]
  );

  const moveCustomPoolWithinTimeframe = useCallback(
    (draggedPoolId: string, targetPoolId: string) => {
      const normalizedDraggedPoolId = String(draggedPoolId || '').trim();
      const normalizedTargetPoolId = String(targetPoolId || '').trim();
      if (!normalizedDraggedPoolId || !normalizedTargetPoolId || normalizedDraggedPoolId === normalizedTargetPoolId) {
        return;
      }

      const draggedPool = poolSettingsRows.find((pool) => String(pool.id || '').trim() === normalizedDraggedPoolId);
      const targetPool = poolSettingsRows.find((pool) => String(pool.id || '').trim() === normalizedTargetPoolId);
      if (!draggedPool || !targetPool || draggedPool.baseTimeframe !== targetPool.baseTimeframe) {
        return;
      }

      const baseTimeframe = draggedPool.baseTimeframe as CsvImportBaseTimeframe;
      const sectionPoolIds = poolSettingsRows
        .filter((pool) => pool.baseTimeframe === baseTimeframe)
        .map((pool) => String(pool.id || '').trim())
        .filter((poolId) => poolId.length > 0);
      const fromIndexInSection = sectionPoolIds.indexOf(normalizedDraggedPoolId);
      const toIndexInSection = sectionPoolIds.indexOf(normalizedTargetPoolId);
      if (fromIndexInSection < 0 || toIndexInSection < 0 || fromIndexInSection === toIndexInSection) {
        return;
      }

      const nextSectionPoolIds = [...sectionPoolIds];
      const [draggedId] = nextSectionPoolIds.splice(fromIndexInSection, 1);
      if (!draggedId) {
        return;
      }
      nextSectionPoolIds.splice(toIndexInSection, 0, draggedId);
      setDataConfigPoolOrderByBase((current) => ({
        ...current,
        [baseTimeframe]: nextSectionPoolIds
      }));

      setCustomSamplePools((current) => {
        const fromIndex = current.findIndex((pool) => String(pool.id || '').trim() === normalizedDraggedPoolId);
        const toIndex = current.findIndex((pool) => String(pool.id || '').trim() === normalizedTargetPoolId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return current;
        }
        const draggedCustomPool = current[fromIndex];
        const targetCustomPool = current[toIndex];
        if (!draggedCustomPool || !targetCustomPool || draggedCustomPool.baseTimeframe !== targetCustomPool.baseTimeframe) {
          return current;
        }
        const next = [...current];
        next.splice(fromIndex, 1);
        next.splice(toIndex, 0, {
          ...draggedCustomPool,
          updatedAt: new Date().toISOString()
        });
        return next;
      });
    },
    [poolSettingsRows, setCustomSamplePools, setDataConfigPoolOrderByBase]
  );

  return {
    saveSamplePoolRename,
    removeSamplePool,
    moveCustomPoolWithinTimeframe
  };
};
