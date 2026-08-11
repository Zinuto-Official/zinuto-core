// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataImportScopeStrategy } from './types.js';
import { preserveImportWireRelativePath } from '../../domain/dataSource/importPathSemantics.js';

export type NormalizedImportScope = {
  strategy: LocalDataImportScopeStrategy;
  topLevelSubfolder: string;
};

const preserveRelativePath = preserveImportWireRelativePath;

type ScopeMismatchErrorFactory = (
  code: string,
  args?: Record<string, string>,
  status?: number,
) => Error;

export const normalizeImportScopeStrategy = (
  value: unknown,
): LocalDataImportScopeStrategy | null => {
  if (value === 'FLAT' || value === 'WITH_PARENT') {
    return value;
  }
  return null;
};

export const resolveNormalizedImportScope = (
  strategyRaw: unknown,
  topLevelSubfolderRaw?: unknown,
): NormalizedImportScope => {
  const strategy = normalizeImportScopeStrategy(strategyRaw) ?? 'FLAT';
  if (strategy === 'WITH_PARENT') {
    return {
      strategy,
      topLevelSubfolder: preserveRelativePath(topLevelSubfolderRaw),
    };
  }
  return {
    strategy: 'FLAT',
    topLevelSubfolder: '',
  };
};

export const isSameImportScope = (
  left: NormalizedImportScope,
  right: NormalizedImportScope,
): boolean =>
  left.strategy === right.strategy &&
  preserveRelativePath(left.topLevelSubfolder) ===
    preserveRelativePath(right.topLevelSubfolder);

export const toPreviewPlanScope = (
  plan:
    | {
        strategy?: unknown;
        topLevelSubfolder?: unknown;
      }
    | null
    | undefined,
): NormalizedImportScope =>
  resolveNormalizedImportScope(plan?.strategy, plan?.topLevelSubfolder);

export const buildImportScopeErrorArgs = (
  scope: NormalizedImportScope,
): Record<string, string> => ({
  importScopeStrategy: scope.strategy,
  importScopeTopLevelSubfolder: scope.topLevelSubfolder,
});

export const assertRequestedScopeMatchesResolvedPlan = ({
  resolvedPlan,
  requestedStrategyRaw,
  requestedTopLevelSubfolderRaw,
  appError,
}: {
  resolvedPlan:
    | {
        strategy?: unknown;
        topLevelSubfolder?: unknown;
      }
    | null
    | undefined;
  requestedStrategyRaw: unknown;
  requestedTopLevelSubfolderRaw?: unknown;
  appError: ScopeMismatchErrorFactory;
}): NormalizedImportScope => {
  const normalizedPlanScope = toPreviewPlanScope(resolvedPlan);
  const requestedStrategy = normalizeImportScopeStrategy(requestedStrategyRaw);
  const requestedTopLevelSubfolder = preserveRelativePath(
    requestedTopLevelSubfolderRaw,
  );
  const hasRequestedScope =
    Boolean(requestedStrategy) || Boolean(requestedTopLevelSubfolder);
  if (!hasRequestedScope) {
    return normalizedPlanScope;
  }
  if (!requestedStrategy && requestedTopLevelSubfolder) {
    throw appError('LOCAL_DATA_IMPORT_PREVIEW_SCOPE_MISMATCH', {
      ...buildImportScopeErrorArgs(normalizedPlanScope),
      requestedImportScopeStrategy: '',
      requestedImportScopeTopLevelSubfolder: requestedTopLevelSubfolder,
    });
  }
  const normalizedRequestedScope = resolveNormalizedImportScope(
    requestedStrategy,
    requestedTopLevelSubfolder,
  );
  if (!isSameImportScope(normalizedRequestedScope, normalizedPlanScope)) {
    throw appError('LOCAL_DATA_IMPORT_PREVIEW_SCOPE_MISMATCH', {
      ...buildImportScopeErrorArgs(normalizedPlanScope),
      requestedImportScopeStrategy: normalizedRequestedScope.strategy,
      requestedImportScopeTopLevelSubfolder:
        normalizedRequestedScope.topLevelSubfolder,
    });
  }
  return normalizedPlanScope;
};
