// SPDX-License-Identifier: GPL-3.0-only

import { removeMarketInstrumentData } from '../ports/infrastructure/db/marketDatabase.js';
import {
  beginPortableImportRecoveryAttempt,
  completePortableImportRecoveryCleanup,
  deleteCommittedPortableImportRecoveryJournal,
  listPortableImportRecoveryJournals,
  recordPortableImportRecoveryFailure,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';
import { nowIso } from '../../kernel/time.js';

type MarketInstrumentCleanup = (instrumentId: string) => Promise<void>;

export type PortableImportRecoveryRuntime = {
  cleanupMarketInstrument?: MarketInstrumentCleanup;
};

export type PortableImportStartupRecoveryResult = {
  scanned: number;
  recovered: number;
  committedJournalsCleared: number;
  failed: number;
};

const toRecoveryError = (error: unknown): string => {
  const value =
    error instanceof Error
      ? `${error.name}:${error.message}`
      : String(error ?? 'UNKNOWN');
  return value.slice(0, 1_024);
};

export const recoverPortableImportJournal = async (
  journalId: string,
  runtime: PortableImportRecoveryRuntime = {},
): Promise<'NONE' | 'RECOVERED' | 'COMMITTED_CLEARED'> => {
  const cleanupMarketInstrument =
    runtime.cleanupMarketInstrument ?? removeMarketInstrumentData;
  const journal = beginPortableImportRecoveryAttempt({
    journalId,
    updatedAt: nowIso(),
  });
  if (!journal) {
    return 'NONE';
  }
  if (journal.state === 'COMMITTED') {
    deleteCommittedPortableImportRecoveryJournal(journalId);
    return 'COMMITTED_CLEARED';
  }

  const cleanupResults = await Promise.allSettled(
    journal.createdInstrumentIds.map((instrumentId) =>
      cleanupMarketInstrument(instrumentId),
    ),
  );
  const failedCleanup = cleanupResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failedCleanup) {
    try {
      recordPortableImportRecoveryFailure({
        journalId,
        error: toRecoveryError(failedCleanup.reason),
        updatedAt: nowIso(),
      });
    } catch {
      // The original journal is intentionally retained for the next startup.
    }
    throw failedCleanup.reason;
  }

  completePortableImportRecoveryCleanup(journalId, nowIso());
  return 'RECOVERED';
};

export const recoverPortableImportsAtStartup = async (
  runtime: PortableImportRecoveryRuntime = {},
): Promise<PortableImportStartupRecoveryResult> => {
  const journals = listPortableImportRecoveryJournals();
  const result: PortableImportStartupRecoveryResult = {
    scanned: journals.length,
    recovered: 0,
    committedJournalsCleared: 0,
    failed: 0,
  };
  for (const journal of journals) {
    try {
      const recoveryStatus = await recoverPortableImportJournal(
        journal.id,
        runtime,
      );
      if (recoveryStatus === 'RECOVERED') {
        result.recovered += 1;
      } else if (recoveryStatus === 'COMMITTED_CLEARED') {
        result.committedJournalsCleared += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
};
