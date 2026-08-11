// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataImportJobDetail } from './types.js';

export type LocalDataImportCardPhase =
  | 'IMPORTING'
  | 'FINALIZING'
  | 'FAILED'
  | 'DONE';

export type LocalDataImportJobPhaseFacts = {
  cardPhase: LocalDataImportCardPhase;
  active: boolean;
  terminal: boolean;
  done: boolean;
  failed: boolean;
  fileProgressPercent: number;
  importProgressPercent: number;
  compactProgressDisplayPercent: number;
  compactAfterDisplayBytes: number;
  compactReclaimedDisplayBytes: number;
  shouldShowCompactProgress: boolean;
  progressTone: 'syncing' | 'danger' | 'ready';
  pollDelayMs: number;
};

export type LocalDataImportOutcomeInsight = {
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

type ImportJobPhaseInput = Pick<
  LocalDataImportJobDetail,
  | 'status'
  | 'stage'
  | 'progressPercent'
  | 'compactProgressPercent'
  | 'compactBeforeBytes'
  | 'compactAfterBytes'
  | 'compactReclaimedBytes'
  | 'doneFiles'
  | 'totalFiles'
>;

const toCount = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const toPercent = (value: unknown): number =>
  Math.max(0, Math.min(100, Number(value) || 0));

const resolveImportCardPhase = (
  job: Pick<ImportJobPhaseInput, 'status' | 'stage'>,
): LocalDataImportCardPhase => {
  if (job.status === 'FAILED') {
    return 'FAILED';
  }
  if (job.status === 'SUCCESS' || job.status === 'PARTIAL_SUCCESS') {
    return job.stage === 'DONE' ? 'DONE' : 'FINALIZING';
  }
  return job.stage === 'FINALIZING' || job.stage === 'DONE'
    ? 'FINALIZING'
    : 'IMPORTING';
};

export const resolveLocalDataImportJobPollDelayMs = (
  job: Pick<ImportJobPhaseInput, 'status' | 'stage'>,
): number => {
  if (job.status === 'QUEUED') {
    return 420;
  }
  if (job.stage === 'SCANNING') {
    return 320;
  }
  if (job.stage === 'FINALIZING') {
    return 220;
  }
  return 260;
};

export const buildLocalDataImportJobPhaseFacts = (
  job: ImportJobPhaseInput,
): LocalDataImportJobPhaseFacts => {
  const cardPhase = resolveImportCardPhase(job);
  const totalFiles = toCount(job.totalFiles);
  const progressDenominatorFiles = Math.max(1, totalFiles);
  const doneFiles = toCount(job.doneFiles);
  const rawProgressPercent = toPercent(job.progressPercent);
  const compactProgressPercent = toPercent(job.compactProgressPercent);
  const compactBeforeBytes = toCount(job.compactBeforeBytes);
  const compactAfterBytes = toCount(job.compactAfterBytes);
  const compactReclaimedBytes = toCount(job.compactReclaimedBytes);
  const fileProgressPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Math.min(doneFiles, progressDenominatorFiles) /
          progressDenominatorFiles) *
          100,
      ),
    ),
  );
  const importingDisplayProgressPercent = Math.max(
    1,
    Math.min(
      89,
      Math.max(fileProgressPercent, Math.min(rawProgressPercent, fileProgressPercent + 6)),
    ),
  );
  const importProgressPercent =
    cardPhase === 'DONE'
      ? 100
      : cardPhase === 'FINALIZING'
        ? Math.max(90, Math.min(99, Math.max(rawProgressPercent, fileProgressPercent)))
        : cardPhase === 'IMPORTING'
          ? importingDisplayProgressPercent
          : Math.max(1, Math.min(100, Math.max(rawProgressPercent, fileProgressPercent)));
  const shouldShowCompactProgress =
    cardPhase === 'FINALIZING' ||
    compactProgressPercent > 0 ||
    compactBeforeBytes > 0 ||
    compactAfterBytes > 0 ||
    compactReclaimedBytes > 0;
  const compactProgressDerivedFromOverall =
    cardPhase === 'FINALIZING' &&
    rawProgressPercent >= 90 &&
    rawProgressPercent < 100
      ? Math.max(
          1,
          Math.min(99, Math.round(((rawProgressPercent - 90) / 9) * 100)),
        )
      : 0;
  const compactProgressDisplayPercent = shouldShowCompactProgress
    ? Math.max(compactProgressPercent, compactProgressDerivedFromOverall)
    : 0;
  const compactAfterDisplayBytes =
    compactAfterBytes > 0
      ? compactAfterBytes
      : compactBeforeBytes > 0
        ? Math.max(0, compactBeforeBytes - compactReclaimedBytes)
        : 0;
  const compactReclaimedDisplayBytes =
    compactBeforeBytes > 0
      ? Math.max(0, compactBeforeBytes - compactAfterDisplayBytes)
      : compactReclaimedBytes;
  const active = job.status === 'QUEUED' || job.status === 'RUNNING';
  const failed = cardPhase === 'FAILED';
  const done = cardPhase === 'DONE';
  return {
    cardPhase,
    active,
    terminal: !active,
    done,
    failed,
    fileProgressPercent,
    importProgressPercent,
    compactProgressDisplayPercent,
    compactAfterDisplayBytes,
    compactReclaimedDisplayBytes,
    shouldShowCompactProgress,
    progressTone: failed ? 'danger' : done ? 'ready' : 'syncing',
    pollDelayMs: resolveLocalDataImportJobPollDelayMs(job),
  };
};

export const buildLocalDataImportOutcomeInsight = (
  outcomeSummary: LocalDataImportJobDetail['outcomeSummary'],
): LocalDataImportOutcomeInsight | null => {
  if (!outcomeSummary) {
    return null;
  }
  const prependedRows = toCount(outcomeSummary.prependedRows);
  const appendedRows = toCount(outcomeSummary.appendedRows);
  const importedRows = prependedRows + appendedRows;
  const overlapRowsIgnored = toCount(outcomeSummary.overlapRowsIgnored);
  const internalRangeRowsIgnored = toCount(
    outcomeSummary.internalRangeRowsIgnored,
  );
  const conflictRowsIgnored = toCount(outcomeSummary.conflictRowsIgnored);
  const ignoredRows =
    overlapRowsIgnored + internalRangeRowsIgnored + conflictRowsIgnored;
  const qualityWarnings = outcomeSummary.qualityWarnings;
  const filesWithSkippedRows = toCount(qualityWarnings.filesWithSkippedRows);
  const invalidRequiredRowsSkipped = toCount(
    qualityWarnings.invalidRequiredRowsSkipped,
  );
  const invalidOhlcRowsSkipped = toCount(qualityWarnings.invalidOhlcRowsSkipped);
  const duplicateConflictRowsSkipped = toCount(
    qualityWarnings.duplicateConflictRowsSkipped,
  );
  const duplicateIdenticalRowsDeduped = toCount(
    qualityWarnings.duplicateIdenticalRowsDeduped,
  );
  const qualityRowsSkipped =
    invalidRequiredRowsSkipped +
    invalidOhlcRowsSkipped +
    duplicateConflictRowsSkipped +
    duplicateIdenticalRowsDeduped;
  return {
    prependedRows,
    appendedRows,
    importedRows,
    overlapRowsIgnored,
    internalRangeRowsIgnored,
    conflictRowsIgnored,
    ignoredRows,
    hasIgnoredRows: ignoredRows > 0,
    filesWithSkippedRows,
    qualityRowsSkipped,
    invalidRequiredRowsSkipped,
    invalidOhlcRowsSkipped,
    duplicateConflictRowsSkipped,
    duplicateIdenticalRowsDeduped,
    hasQualityWarnings: filesWithSkippedRows > 0 || qualityRowsSkipped > 0,
    isIgnoredOnly: importedRows === 0 && ignoredRows > 0,
  };
};
