// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataSourceSummary } from './types.js';

type LocalDataSourceCacheRecord = {
  loadedAtMs: number;
  authorizationSignature: string;
  items: LocalDataSourceSummary[];
};

export const createLocalDataSourcesCache = ({
  ttlMs,
  nowMs,
}: {
  ttlMs: number;
  nowMs: () => number;
}) => {
  let cacheRecord: LocalDataSourceCacheRecord | null = null;

  const invalidate = (): void => {
    cacheRecord = null;
  };

  const getCached = (authorizationSignature: string): LocalDataSourceSummary[] | null => {
    const now = nowMs();
    if (
      cacheRecord &&
      cacheRecord.authorizationSignature === authorizationSignature &&
      now - cacheRecord.loadedAtMs <= ttlMs
    ) {
      return cacheRecord.items;
    }
    return null;
  };

  const setCached = (
    authorizationSignature: string,
    items: LocalDataSourceSummary[],
  ): void => {
    cacheRecord = {
      loadedAtMs: nowMs(),
      authorizationSignature,
      items,
    };
  };

  return {
    invalidate,
    getCached,
    setCached,
  };
};
