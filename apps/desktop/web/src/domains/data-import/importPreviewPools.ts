// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from '@/domains/chart/chartPeriods';
import { normalizeNativeImportRelativePath } from '@/domains/data-import/nativeImportHelpers';

type CsvPreviewPlanSummaryLike = {
  id: string;
  previewPlanId: string;
  strategy: 'FLAT' | 'WITH_PARENT';
  baseTimeframe: BaseTimeframe;
  topLevelSubfolder: string;
  defaultPoolName: string;
  symbolCount: number;
  fileCount: number;
};

type PendingImportLike = {
  confirmableImportPlans: CsvPreviewPlanSummaryLike[];
  folderName: string;
};

type ImportPreviewPoolGroup = {
  id: string;
  previewPlanId: string;
  strategy: 'FLAT' | 'WITH_PARENT';
  topLevelSubfolder: string;
  name: string;
  symbolCount: number;
  fileCount: number;
  baseTimeframe: BaseTimeframe;
};

export const resolveImportPreviewPoolGroups = (
  pendingImport: PendingImportLike,
  pendingPoolNamingStrategy: 'FLAT' | 'WITH_PARENT',
  _pendingPoolPreviewName: string
): ImportPreviewPoolGroup[] => {
  const confirmableImportPlans = Array.isArray((pendingImport as { confirmableImportPlans?: unknown }).confirmableImportPlans)
    ? pendingImport.confirmableImportPlans
    : [];

  return confirmableImportPlans
    .filter((plan) => plan.strategy === pendingPoolNamingStrategy)
    .map((plan) => ({
      id: plan.id,
      previewPlanId: plan.previewPlanId,
      strategy: plan.strategy,
      topLevelSubfolder: normalizeNativeImportRelativePath(
        plan.topLevelSubfolder || '',
      ),
      name: String(plan.defaultPoolName || '').trim(),
      symbolCount: Math.max(0, Math.floor(Number(plan.symbolCount) || 0)),
      fileCount: Math.max(0, Math.floor(Number(plan.fileCount) || 0)),
      baseTimeframe: plan.baseTimeframe
    }));
};
