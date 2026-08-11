// SPDX-License-Identifier: GPL-3.0-only

import {
  FUTU_CAPABILITY_ENTRIES,
  FUTU_SUPPORT_TARGET_COUNTS,
  FUTU_VENDOR_FORMULA_ADAPTER,
  getFutuCallableFunctionNameSet,
  getFutuCapabilityByName,
  resolveFutuSupportState,
  type FutuCapabilityEntry,
  type FutuDataScopeBlockReason,
  type FutuSupportCategoryKey,
} from './futuSupportRegistry.js';

export type {
  FutuCapabilityEntry,
  FutuCapabilitySupportState,
  FutuDataScopeBlockReason,
  FutuSupportCategoryKey,
  VendorFormulaAdapter,
} from './futuSupportRegistry.js';

export type FutuSupportCategory = Readonly<{
  key: FutuSupportCategoryKey;
  targetCount: number;
  supported: readonly string[];
  unsupported: readonly string[];
  callable: boolean;
}>;

export type FutuDataScopeBlockEntry = Readonly<{
  name: string;
  reason: FutuDataScopeBlockReason;
}>;

export type FutuSupportCoverage = Readonly<{
  key: FutuSupportCategoryKey;
  targetCount: number;
  supportedCount: number;
  unsupportedCount: number;
  blockedCount: number;
  coveredCount: number;
  gap: number;
  completionRate: number;
}>;

export type FutuSupportCategoryIndexEntry = Readonly<{
  key: FutuSupportCategoryKey;
  targetCount: number;
  supported: readonly string[];
  unsupported: readonly string[];
  blocked: readonly FutuDataScopeBlockEntry[];
  callable: boolean;
}>;

const CATEGORY_KEYS: readonly FutuSupportCategoryKey[] = Object.freeze([
  'quote',
  'time',
  'reference',
  'logic',
  'selection',
  'math',
  'stats',
  'shape',
  'drawing',
  'lineAndColor',
  'operator',
]);

const sortNames = (items: readonly string[]): readonly string[] =>
  [...items].sort((left, right) => left.localeCompare(right, 'en'));

const buildCategoryIndex = (): readonly FutuSupportCategoryIndexEntry[] =>
  CATEGORY_KEYS.map((key) => {
    const categoryEntries = FUTU_CAPABILITY_ENTRIES.filter(
      (entry) => entry.categoryKey === key && entry.matrixTargetIncluded,
    );
    const callable = categoryEntries.some(
      (entry) => entry.callable && entry.supportState === 'full',
    );
    const supported = sortNames(
      categoryEntries
        .filter((entry) => entry.supportState === 'full')
        .map((entry) => entry.name),
    );
    const unsupported = sortNames(
      categoryEntries
        .filter(
          (entry) =>
            entry.dataScopeBlockedReason === null &&
            entry.supportState === 'unsupported',
        )
        .map((entry) => entry.name),
    );
    const blocked = categoryEntries
      .filter((entry) => entry.dataScopeBlockedReason !== null)
      .map((entry) => ({
        name: entry.name,
        reason: entry.dataScopeBlockedReason as FutuDataScopeBlockReason,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    return {
      key,
      targetCount: FUTU_SUPPORT_TARGET_COUNTS[key],
      supported,
      unsupported,
      blocked,
      callable,
    };
  });

const FUTU_SUPPORT_CATEGORY_INDEX = buildCategoryIndex();

export { FUTU_SUPPORT_TARGET_COUNTS, FUTU_VENDOR_FORMULA_ADAPTER, resolveFutuSupportState };

export const FUTU_SUPPORT_CATEGORIES: readonly FutuSupportCategory[] = Object.freeze(
  FUTU_SUPPORT_CATEGORY_INDEX.map((category) => ({
    key: category.key,
    targetCount: category.targetCount,
    supported: category.supported,
    unsupported: category.unsupported,
    callable: category.callable,
  })),
);

export const getFutuSupportCoverage = (): readonly FutuSupportCoverage[] =>
  FUTU_SUPPORT_CATEGORY_INDEX.map((category) => {
    const supportedCount = category.supported.length;
    const unsupportedCount = category.unsupported.length;
    const blockedCount = category.blocked.length;
    const coveredCount = supportedCount + unsupportedCount + blockedCount;
    const targetCount = category.targetCount;
    const gap = Math.max(0, targetCount - coveredCount);
    const completionRate = targetCount > 0 ? coveredCount / targetCount : 1;
    return {
      key: category.key,
      targetCount,
      supportedCount,
      unsupportedCount,
      blockedCount,
      coveredCount,
      gap,
      completionRate,
    };
  });

export const getFutuSupportedNameSet = (): ReadonlySet<string> =>
  new Set(
    FUTU_CAPABILITY_ENTRIES
      .filter(
        (entry) =>
          entry.matrixTargetIncluded && entry.supportState === 'full',
      )
      .map((entry) => entry.name),
  );

export const isFutuCallableFunction = (name: string): boolean =>
  getFutuCallableFunctionNameSet().has(name.trim().toUpperCase());

export const getFutuDataScopeBlockedFunctions = (): Readonly<Record<FutuSupportCategoryKey, readonly FutuDataScopeBlockEntry[]>> =>
  FUTU_SUPPORT_CATEGORY_INDEX.reduce<Record<FutuSupportCategoryKey, readonly FutuDataScopeBlockEntry[]>>(
    (acc, category) => {
      acc[category.key] = category.blocked;
      return acc;
    },
    {
      quote: [],
      time: [],
      reference: [],
      logic: [],
      selection: [],
      math: [],
      stats: [],
      shape: [],
      drawing: [],
      lineAndColor: [],
      operator: [],
    },
  );

export const getFutuDataScopeBlockedFunctionReason = (name: string): FutuDataScopeBlockReason | null =>
  getFutuCapabilityByName(name)?.dataScopeBlockedReason ?? null;

export const getFutuSupportCategoryIndex = (): readonly FutuSupportCategoryIndexEntry[] =>
  FUTU_SUPPORT_CATEGORY_INDEX;

export { getFutuCallableFunctionNameSet };

export const getFutuCapabilityEntry = (name: string): FutuCapabilityEntry | null =>
  getFutuCapabilityByName(name);

export const getFutuCapabilityEntries = (): readonly FutuCapabilityEntry[] =>
  FUTU_CAPABILITY_ENTRIES;
