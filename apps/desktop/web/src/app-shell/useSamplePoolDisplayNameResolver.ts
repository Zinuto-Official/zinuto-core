// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useCallback, useMemo } from 'react';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import type {
  CustomSamplePool
} from "@/frontend-kernel/appTypes";
import {
  isReservedSamplePoolId,
  normalizeReservedSamplePoolTokenName,
  sanitizeSamplePoolName
} from '@/app-shell/appSamplePools';
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
  getBuiltInSamplePools
} from '@/domains/trainer/samplePools';
import { normalizeSystemPoolNameOverride } from '@/app-shell/appRootDataConfigUtils';
import { formatBuiltInSamplePoolDisplayName } from '@/domains/trainer/samplePoolDisplayNames';

type UseSamplePoolDisplayNameResolverArgs = {
  customSamplePools: CustomSamplePool[];
  language: UiLanguage;
  systemPoolNameOverrides?: Record<string, string>;
};

export const useSamplePoolDisplayNameResolver = ({
  customSamplePools,
  language,
  systemPoolNameOverrides
}: UseSamplePoolDisplayNameResolverArgs) => {
  const samplePoolDisplayNameMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set(SAMPLE_POOL_ALL_ID, tt('appText.samplePools'));
    map.set(SAMPLE_POOL_UNKNOWN_ID, SAMPLE_POOL_UNKNOWN_NAME());
    getBuiltInSamplePools().forEach((pool) => {
      map.set(
        pool.id,
        sanitizeSamplePoolName(
          normalizeSystemPoolNameOverride(pool.id, systemPoolNameOverrides?.[pool.id]),
          formatBuiltInSamplePoolDisplayName(language, pool.id, pool.name) || pool.name,
        ),
      );
    });
    customSamplePools.forEach((pool) => {
      if (isReservedSamplePoolId(pool.id)) {
        return;
      }
      map.set(pool.id, sanitizeSamplePoolName(pool.name, tt('appText.unnamedSamplePool')));
    });
    return map;
  }, [customSamplePools, language, systemPoolNameOverrides]);

  const resolveSamplePoolDisplayName = useCallback(
    (poolId: string, fallbackName = ''): string => {
      const normalizedPoolId = (poolId || '').trim();
      const normalizedPoolIdLower = normalizedPoolId.toLowerCase();
      if (!normalizedPoolId) {
        return SAMPLE_POOL_UNKNOWN_NAME();
      }
      if (normalizedPoolIdLower === SAMPLE_POOL_ALL_ID) {
        return tt('appText.samplePools');
      }
      if (normalizedPoolIdLower === SAMPLE_POOL_UNKNOWN_ID) {
        return SAMPLE_POOL_UNKNOWN_NAME();
      }
      const mapped = samplePoolDisplayNameMap.get(normalizedPoolId);
      if (mapped) {
        return mapped;
      }
      const normalizedPoolTokenName = normalizeReservedSamplePoolTokenName(normalizedPoolId);
      if (normalizedPoolTokenName && normalizedPoolTokenName !== normalizedPoolId) {
        return normalizedPoolTokenName;
      }
      const builtInName = formatBuiltInSamplePoolDisplayName(
        language,
        normalizedPoolId,
        fallbackName,
      );
      if (builtInName) {
        return builtInName;
      }
      const normalizedFallback = sanitizeSamplePoolName(fallbackName, '');
      if (normalizedFallback) {
        return normalizedFallback;
      }
      return SAMPLE_POOL_UNKNOWN_NAME();
    },
    [samplePoolDisplayNameMap, language]
  );

  return {
    samplePoolDisplayNameMap,
    resolveSamplePoolDisplayName
  };
};
