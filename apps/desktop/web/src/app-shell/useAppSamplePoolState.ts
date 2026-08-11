// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react';
import type { CustomSamplePool, UiSettings } from '@/frontend-kernel/appTypes';
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME
} from '@/domains/trainer/samplePools';

export const resolveInitialIncludeSystemDefaultPool = (_persistedUi?: UiSettings): boolean => {
  return true;
};

export const useAppSamplePoolState = ({ persistedUi }: { persistedUi: UiSettings }) => {
  const [includeSystemDefaultPool, setIncludeSystemDefaultPool] = useState<boolean>(() =>
    resolveInitialIncludeSystemDefaultPool(persistedUi)
  );

  const [customSamplePools, setCustomSamplePools] = useState<CustomSamplePool[]>([]);
  const customSamplePoolsRef = useRef<CustomSamplePool[]>(customSamplePools);

  useEffect(() => {
    customSamplePoolsRef.current = customSamplePools;
  }, [customSamplePools]);

  const [activeSamplePoolId, setActiveSamplePoolId] = useState<string>(() =>
    typeof persistedUi.activeSamplePoolId === 'string' && persistedUi.activeSamplePoolId.trim()
      ? persistedUi.activeSamplePoolId
      : SAMPLE_POOL_ALL_ID
  );

  const [currentTrainingPoolMeta, setCurrentTrainingPoolMeta] = useState<{ id: string; name: string }>({
    id: SAMPLE_POOL_UNKNOWN_ID,
    name: SAMPLE_POOL_UNKNOWN_NAME()
  });

  return {
    includeSystemDefaultPool,
    setIncludeSystemDefaultPool,
    customSamplePools,
    setCustomSamplePools,
    customSamplePoolsRef,
    activeSamplePoolId,
    setActiveSamplePoolId,
    currentTrainingPoolMeta,
    setCurrentTrainingPoolMeta
  };
};
