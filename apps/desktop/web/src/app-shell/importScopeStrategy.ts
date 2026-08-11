// SPDX-License-Identifier: GPL-3.0-only

import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import type { CsvPoolNamingStrategy } from '@/app-shell/appCsvImportContracts';

const STRATEGIES: CsvPoolNamingStrategy[] = ['FLAT', 'WITH_PARENT'];

export const resolveAvailableImportScopeStrategies = (
  pendingImport: PendingCsvFolderImport | null,
): CsvPoolNamingStrategy[] => {
  if (!pendingImport) {
    return [];
  }
  const confirmableImportPlans = Array.isArray(pendingImport.confirmableImportPlans)
    ? pendingImport.confirmableImportPlans
    : [];
  const available = new Set<CsvPoolNamingStrategy>();
  confirmableImportPlans.forEach((plan) => {
    if (
      (plan.strategy === 'FLAT' || plan.strategy === 'WITH_PARENT') &&
      Math.max(0, Number(plan.fileCount) || 0) > 0 &&
      Math.max(0, Number(plan.symbolCount) || 0) > 0
    ) {
      available.add(plan.strategy);
    }
  });
  return STRATEGIES.filter((strategy) => available.has(strategy));
};

export const normalizePendingImportScopeStrategy = (
  pendingImport: PendingCsvFolderImport | null,
  currentStrategy: CsvPoolNamingStrategy,
): CsvPoolNamingStrategy => {
  const availableStrategies = resolveAvailableImportScopeStrategies(pendingImport);
  if (!availableStrategies.length) {
    return 'FLAT';
  }
  if (availableStrategies.includes(currentStrategy)) {
    return currentStrategy;
  }
  if (availableStrategies.includes('FLAT')) {
    return 'FLAT';
  }
  return availableStrategies[0];
};

export const shouldShowFirstImportScopeSelector = (
  pendingImport: PendingCsvFolderImport | null,
): boolean => {
  if (!pendingImport || pendingImport.importEntryMode === 'FULL_REIMPORT') {
    return false;
  }
  const availableStrategies = resolveAvailableImportScopeStrategies(pendingImport);
  return availableStrategies.includes('WITH_PARENT');
};
