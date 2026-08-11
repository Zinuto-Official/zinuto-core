// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from 'react';
import {
  api,
  followSystemStorageUntilFresh,
  type ApiSystemStorageSummary,
} from '@/api';
import {
  normalizeSystemStorageCategoryKey,
  type SystemStorageCategoryKey,
} from '@zinuto/shared/systemStorageCategories';

type StorageSummaryRow = {
  key: SystemStorageCategoryKey;
  bytes: number;
  percent: number;
  progressPercent: number;
  sortOrder: number;
};

type StorageSummaryReadModel = ApiSystemStorageSummary & {
  rows: StorageSummaryRow[];
};

export type GlobalResetStorageSummaryRow = StorageSummaryRow & {
  label: string;
  valueText: string;
};

type UseGlobalResetStorageSummaryArgs = {
  formatStorageBytes: (value: number) => string;
  labelByKey: Record<SystemStorageCategoryKey, string>;
  refreshKey?: string | number | null;
};

export const useGlobalResetStorageSummary = ({
  formatStorageBytes,
  labelByKey,
  refreshKey = null,
}: UseGlobalResetStorageSummaryArgs) => {
  const [storageSummary, setStorageSummary] =
    useState<StorageSummaryReadModel | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    setStorageSummary(null);
    void followSystemStorageUntilFresh({
      loadSummary: (signal) => api.getSystemStorageSummary({ signal }),
      publishSummary: setStorageSummary,
      signal: abortController.signal,
    })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setStorageSummary(null);
        }
      });
    return () => {
      abortController.abort();
    };
  }, [refreshKey]);

  const isGlobalResetStorageSummaryReady =
    storageSummary !== null &&
    storageSummary.measurementState.status !== 'WARMING';

  const globalResetStorageRows = useMemo(
    () =>
      (isGlobalResetStorageSummaryReady ? storageSummary.rows : []).map(
        (row) => {
          const key = normalizeSystemStorageCategoryKey(row.key);
          return {
            ...row,
            key,
            label: labelByKey[key],
            valueText: formatStorageBytes(row.bytes),
          };
        },
      ),
    [
      storageSummary,
      formatStorageBytes,
      isGlobalResetStorageSummaryReady,
      labelByKey,
    ],
  );

  const globalResetStorageTotalText = useMemo(
    () =>
      !isGlobalResetStorageSummaryReady
        ? '--'
        : formatStorageBytes(storageSummary.totalBytes),
    [formatStorageBytes, isGlobalResetStorageSummaryReady, storageSummary],
  );

  return {
    globalResetStorageRows,
    globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady,
    marketContentCounts: isGlobalResetStorageSummaryReady
      ? storageSummary.marketContentCounts
      : {
          instrumentCount: 0,
          barCount: 0,
        },
  };
};
