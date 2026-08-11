// SPDX-License-Identifier: GPL-3.0-only

import type { ApiLocalDataImportJob } from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';

type Translate = (key: AppTextKey) => string;
type TranslateFormat = (key: AppTextKey, replacements: Array<string | number>) => string;

// IncrementalOutcomeInsight is now computed server-side in local-api dataSourceService.
// The web layer receives pre-computed insight from the API.
export type IncrementalOutcomeInsight = {
  prependedRows: number;
  appendedRows: number;
  importedRows: number;
  overlapRowsIgnored: number;
  internalRangeRowsIgnored: number;
  conflictRowsIgnored: number;
  ignoredRows: number;
  hasIgnoredRows: boolean;
  filesWithSkippedRows: number;
  qualityRowsSkipped: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
  hasQualityWarnings: boolean;
  isIgnoredOnly: boolean;
};

// Fallback for when API does not provide pre-computed insight.
// Prefer calling local-api's buildIncrementalOutcomeInsight server-side.
const EMPTY_OUTCOME_INSIGHT: IncrementalOutcomeInsight = {
  prependedRows: 0,
  appendedRows: 0,
  importedRows: 0,
  overlapRowsIgnored: 0,
  internalRangeRowsIgnored: 0,
  conflictRowsIgnored: 0,
  ignoredRows: 0,
  hasIgnoredRows: false,
  filesWithSkippedRows: 0,
  qualityRowsSkipped: 0,
  invalidRequiredRowsSkipped: 0,
  invalidOhlcRowsSkipped: 0,
  duplicateConflictRowsSkipped: 0,
  duplicateIdenticalRowsDeduped: 0,
  hasQualityWarnings: false,
  isIgnoredOnly: false,
};

const toCount = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

// Client-side fallback for computing outcome insight from summary.
// Canonical implementation: local-api/src/application/dataSourceService.ts buildIncrementalOutcomeInsight
const buildOutcomeInsightFromSummary = (
  outcomeSummary: ApiLocalDataImportJob['outcomeSummary'],
): IncrementalOutcomeInsight => {
  if (!outcomeSummary) {
    return EMPTY_OUTCOME_INSIGHT;
  }
  const prependedRows = toCount(outcomeSummary.prependedRows);
  const appendedRows = toCount(outcomeSummary.appendedRows);
  const overlapRowsIgnored = toCount(outcomeSummary.overlapRowsIgnored);
  const internalRangeRowsIgnored = toCount(outcomeSummary.internalRangeRowsIgnored);
  const conflictRowsIgnored = toCount(outcomeSummary.conflictRowsIgnored);
  const qualityWarnings =
    outcomeSummary.qualityWarnings &&
    typeof outcomeSummary.qualityWarnings === 'object'
      ? outcomeSummary.qualityWarnings
      : null;
  const invalidRequiredRowsSkipped = toCount(
    qualityWarnings?.invalidRequiredRowsSkipped,
  );
  const invalidOhlcRowsSkipped = toCount(
    qualityWarnings?.invalidOhlcRowsSkipped,
  );
  const duplicateConflictRowsSkipped = toCount(
    qualityWarnings?.duplicateConflictRowsSkipped,
  );
  const duplicateIdenticalRowsDeduped = toCount(
    qualityWarnings?.duplicateIdenticalRowsDeduped,
  );
  const qualityRowsSkipped =
    invalidRequiredRowsSkipped +
    invalidOhlcRowsSkipped +
    duplicateConflictRowsSkipped +
    duplicateIdenticalRowsDeduped;
  const ignoredRows =
    overlapRowsIgnored + internalRangeRowsIgnored + conflictRowsIgnored;
  const importedRows = prependedRows + appendedRows;
  return {
    prependedRows,
    appendedRows,
    importedRows,
    overlapRowsIgnored,
    internalRangeRowsIgnored,
    conflictRowsIgnored,
    ignoredRows,
    hasIgnoredRows: ignoredRows > 0,
    filesWithSkippedRows: toCount(qualityWarnings?.filesWithSkippedRows),
    qualityRowsSkipped,
    invalidRequiredRowsSkipped,
    invalidOhlcRowsSkipped,
    duplicateConflictRowsSkipped,
    duplicateIdenticalRowsDeduped,
    hasQualityWarnings:
      toCount(qualityWarnings?.filesWithSkippedRows) > 0 ||
      qualityRowsSkipped > 0,
    isIgnoredOnly: importedRows === 0 && ignoredRows > 0,
  };
};

export const buildIncrementalUpdateNotice = (
  poolNameRaw: string,
  outcomeSummary: ApiLocalDataImportJob['outcomeSummary'],
  tt: Translate,
  ttf: TranslateFormat,
  options?: {
    outcomeInsight?: ApiLocalDataImportJob['outcomeInsight'];
    missingSymbolsRetained?: string[];
    failedSymbols?: string[];
  },
): { title: string; message: string; hint: string } => {
  const poolName = String(poolNameRaw || '').trim() || tt('appText.unnamedFolder');
  const title = tt('appText.dataSyncResult');
  // Prefer pre-computed insight from API; fall back to client-side computation
  const outcomeInsight =
    options?.outcomeInsight ?? buildOutcomeInsightFromSummary(outcomeSummary);
  const ignoredLine = outcomeInsight.hasIgnoredRows
    ? ttf('appText.syncIgnoredValue0OverlappingRowValue1RangeRowValue2', [
        outcomeInsight.overlapRowsIgnored,
        outcomeInsight.internalRangeRowsIgnored,
        outcomeInsight.conflictRowsIgnored,
      ])
    : '';
  const qualityLine = outcomeInsight.hasQualityWarnings
    ? ttf('appText.importSkippedProblemRowsValue0FilesValue1', [
        outcomeInsight.qualityRowsSkipped,
        Math.max(1, outcomeInsight.filesWithSkippedRows),
      ])
    : '';
  const retainedMissingSymbols = Array.isArray(options?.missingSymbolsRetained)
    ? options?.missingSymbolsRetained.filter((item) => Boolean(String(item || '').trim()))
    : [];
  const retainedHint = retainedMissingSymbols.length
    ? ttf('appText.value0OlderSymbolFoundFolderRetainedDefault', [retainedMissingSymbols.length])
    : '';
  const failedSymbols = Array.from(
    new Set(
      (Array.isArray(options?.failedSymbols) ? options.failedSymbols : [])
        .map((item) => String(item || '').trim().toUpperCase())
        .filter((item) => Boolean(item))
    )
  );
  const failedHint = failedSymbols.length
    ? ttf('appText.skippedUnloadableSymbolsValue0', [failedSymbols.join(', ')])
    : '';
  if (!outcomeSummary) {
    const message = ttf('appText.newDataFoundSourceValue0', [poolName]);
    return {
      title,
      message: [message, failedHint].filter(Boolean).join('\n'),
      hint: [message, failedHint].filter(Boolean).join(' ')
    };
  }
  if (outcomeSummary.noChanges && !outcomeInsight.isIgnoredOnly) {
    const message = ttf('appText.newDataFoundSourceValue0', [poolName]);
    return {
      title,
      message: [message, failedHint, retainedHint].filter(Boolean).join('\n'),
      hint: [message, failedHint, retainedHint].filter(Boolean).join(' ')
    };
  }

  const message = ttf('appText.syncCompletedSourceValue0Value1AddedSymbolValue2Value3Value4Value5', [
    poolName,
    outcomeSummary.addedSymbols.length,
    outcomeSummary.updatedSymbols.length,
    outcomeInsight.prependedRows,
    outcomeInsight.appendedRows,
    outcomeSummary.unchangedFiles,
  ]);
  return {
    title,
    message: [message, failedHint, ignoredLine, qualityLine, retainedHint].filter(Boolean).join('\n'),
    hint: [message, failedHint, ignoredLine, qualityLine, retainedHint].filter(Boolean).join(' ')
  };
};
