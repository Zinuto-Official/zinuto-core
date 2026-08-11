// SPDX-License-Identifier: GPL-3.0-only

import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import type { CsvImportBaseTimeframe } from '@/domains/data-import/baseTimeframeInference';
import { isBuiltInSamplePoolDefaultDisplayAlias } from '@/domains/trainer/samplePoolDisplayNames';

export type DataConfigPoolOrderByBase = Partial<Record<CsvImportBaseTimeframe, string[]>>;
export type DrawToolScopePage = 'TRAINER' | 'SPECIAL_TRAINING';

export const resolveImportBatchWorkerCount = (groupCount: number): number => {
  const normalizedGroupCount = Math.max(0, Math.floor(Number(groupCount) || 0));
  if (normalizedGroupCount <= 0) {
    return 1;
  }
  const hardwareConcurrency = Number((globalThis.navigator as Navigator | undefined)?.hardwareConcurrency ?? 0);
  const workerBudgetByHardware =
    Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? Math.max(2, Math.floor(hardwareConcurrency / 2)) : 3;
  return Math.max(2, Math.min(normalizedGroupCount, 8, workerBudgetByHardware));
};

export const normalizeCsvImportBaseTimeframe = (value: string): CsvImportBaseTimeframe =>
  value === '1m' || value === '5m' || value === '1h' || value === '1d' ? value : '1d';

export const normalizeSystemPoolNameOverride = (
  poolId: string,
  value: unknown,
): string => {
  const name = String(value ?? '').trim();
  if (!name) {
    return '';
  }
  return isBuiltInSamplePoolDefaultDisplayAlias(poolId, name) ? '' : name;
};

export const normalizeSystemPoolNameOverrides = (
  value: unknown,
  supportedPoolIds: readonly string[]
): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const next: Record<string, string> = {};
  supportedPoolIds.forEach((poolId) => {
    const name = normalizeSystemPoolNameOverride(poolId, source[poolId]);
    if (!name) {
      return;
    }
    next[poolId] = name;
  });
  return next;
};

export const normalizeDataConfigPoolOrderByBase = (value: unknown): DataConfigPoolOrderByBase => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const next: DataConfigPoolOrderByBase = {};
  (['1m', '5m', '1h', '1d'] as const).forEach((baseTimeframe) => {
    const poolIds = source[baseTimeframe];
    if (!Array.isArray(poolIds)) {
      return;
    }
    const uniqueIds = Array.from(
      new Set(
        poolIds
          .map((poolId) => String(poolId || '').trim())
          .filter((poolId) => poolId.length > 0)
      )
    );
    if (uniqueIds.length > 0) {
      next[baseTimeframe] = uniqueIds;
    }
  });
  return next;
};

export const resolveDrawToolScopePage = (activePage: WorkspacePage): DrawToolScopePage | null => {
  if (activePage === 'TRAINER' || activePage === 'SPECIAL_TRAINING') {
    return activePage;
  }
  return null;
};
