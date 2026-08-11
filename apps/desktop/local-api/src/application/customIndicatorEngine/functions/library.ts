// SPDX-License-Identifier: GPL-3.0-only

export * from './library/rollingStatistics.js';
export * from './library/mathDate.js';
export * from './library/conditionRange.js';
export * from './library/trendIndicators.js';

export {
  FUTU_VENDOR_FORMULA_ADAPTER,
  FUTU_SUPPORT_CATEGORIES,
  FUTU_SUPPORT_TARGET_COUNTS,
  getFutuCapabilityEntry,
  getFutuCapabilityEntries,
  getFutuSupportCoverage,
  getFutuSupportedNameSet,
  getFutuCallableFunctionNameSet,
  isFutuCallableFunction,
  getFutuDataScopeBlockedFunctions,
  getFutuDataScopeBlockedFunctionReason,
  getFutuSupportCategoryIndex,
  resolveFutuSupportState
} from '../futu/futuSupportMatrix.js';
