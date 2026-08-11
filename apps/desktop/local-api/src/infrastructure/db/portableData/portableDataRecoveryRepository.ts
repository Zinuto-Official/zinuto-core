// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';
import type {
  PortableImportRecoveryJournal,
  PortableImportRecoveryJournalState,
} from '../../../domain/portableDataRepositoryTypes.js';

type PortableImportRecoveryJournalRow = {
  id: string;
  state: PortableImportRecoveryJournalState;
  created_source_ids_json: string;
  created_instrument_ids_json: string;
  claimed_source_ids_json: string;
  recovery_attempts: number;
  last_recovery_error: string | null;
  created_at: string;
  updated_at: string;
};

type PortableImportRecoveryResource =
  | 'CREATED_SOURCE'
  | 'CREATED_INSTRUMENT'
  | 'CLAIMED_SOURCE';

const parseIdList = (value: string): string[] => {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('PORTABLE_IMPORT_RECOVERY_JOURNAL_INVALID');
  }
  return Array.from(
    new Set(
      parsed
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
    ),
  );
};

const toJournal = (
  row: PortableImportRecoveryJournalRow,
): PortableImportRecoveryJournal => ({
  id: row.id,
  state: row.state,
  createdSourceIds: parseIdList(row.created_source_ids_json),
  createdInstrumentIds: parseIdList(row.created_instrument_ids_json),
  claimedSourceIds: parseIdList(row.claimed_source_ids_json),
  recoveryAttempts: Number(row.recovery_attempts ?? 0),
  lastRecoveryError: row.last_recovery_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const readJournalRow = (
  journalId: string,
): PortableImportRecoveryJournalRow | undefined =>
  db
    .prepare(
      `SELECT id, state, created_source_ids_json,
              created_instrument_ids_json, claimed_source_ids_json,
              recovery_attempts, last_recovery_error, created_at, updated_at
         FROM portable_import_recovery_journal
        WHERE id = ?
        LIMIT 1`,
    )
    .get(journalId) as PortableImportRecoveryJournalRow | undefined;

const assertSingleRowChanged = (changes: number): void => {
  if (changes !== 1) {
    throw new Error('PORTABLE_IMPORT_RECOVERY_JOURNAL_UPDATE_FAILED');
  }
};

export const createPortableImportRecoveryJournal = (input: {
  id: string;
  createdAt: string;
}): void => {
  db.prepare(
    `INSERT INTO portable_import_recovery_journal (
       id, state, created_source_ids_json, created_instrument_ids_json,
       claimed_source_ids_json, recovery_attempts, last_recovery_error,
       created_at, updated_at
     ) VALUES (?, 'PENDING', '[]', '[]', '[]', 0, NULL, ?, ?)`,
  ).run(input.id, input.createdAt, input.createdAt);
};

export const getPortableImportRecoveryJournal = (
  journalId: string,
): PortableImportRecoveryJournal | null => {
  const row = readJournalRow(journalId);
  return row ? toJournal(row) : null;
};

export const listPortableImportRecoveryJournals =
  (): PortableImportRecoveryJournal[] =>
    (
      db
        .prepare(
          `SELECT id, state, created_source_ids_json,
                  created_instrument_ids_json, claimed_source_ids_json,
                  recovery_attempts, last_recovery_error, created_at, updated_at
             FROM portable_import_recovery_journal
            ORDER BY created_at ASC, id ASC`,
        )
        .all() as PortableImportRecoveryJournalRow[]
    ).map(toJournal);

export const appendPortableImportRecoveryResource = (input: {
  journalId: string;
  resource: PortableImportRecoveryResource;
  resourceId: string;
  updatedAt: string;
}): void => {
  const row = readJournalRow(input.journalId);
  if (!row || row.state !== 'PENDING') {
    throw new Error('PORTABLE_IMPORT_RECOVERY_JOURNAL_NOT_PENDING');
  }
  const columnByResource = {
    CREATED_SOURCE: 'created_source_ids_json',
    CREATED_INSTRUMENT: 'created_instrument_ids_json',
    CLAIMED_SOURCE: 'claimed_source_ids_json',
  } as const;
  const column = columnByResource[input.resource];
  const ids = parseIdList(row[column]);
  const resourceId = String(input.resourceId ?? '').trim();
  if (!resourceId || ids.includes(resourceId)) {
    return;
  }
  ids.push(resourceId);
  assertSingleRowChanged(
    db
      .prepare(
        `UPDATE portable_import_recovery_journal
            SET ${column} = ?, updated_at = ?
          WHERE id = ? AND state = 'PENDING'`,
      )
      .run(JSON.stringify(ids), input.updatedAt, input.journalId).changes,
  );
};

export const transitionPortableImportRecoveryJournal = (input: {
  journalId: string;
  fromState: PortableImportRecoveryJournalState;
  toState: PortableImportRecoveryJournalState;
  updatedAt: string;
}): void => {
  assertSingleRowChanged(
    db
      .prepare(
        `UPDATE portable_import_recovery_journal
            SET state = ?, last_recovery_error = NULL, updated_at = ?
          WHERE id = ? AND state = ?`,
      )
      .run(
        input.toState,
        input.updatedAt,
        input.journalId,
        input.fromState,
      ).changes,
  );
};

export const beginPortableImportRecoveryAttempt = (input: {
  journalId: string;
  updatedAt: string;
}): PortableImportRecoveryJournal | null => {
  const row = readJournalRow(input.journalId);
  if (!row) {
    return null;
  }
  if (row.state === 'COMMITTED') {
    return toJournal(row);
  }
  assertSingleRowChanged(
    db
      .prepare(
        `UPDATE portable_import_recovery_journal
            SET recovery_attempts = recovery_attempts + 1,
                last_recovery_error = NULL,
                updated_at = ?
          WHERE id = ? AND state IN ('PENDING','MARKET_READY')`,
      )
      .run(input.updatedAt, input.journalId).changes,
  );
  return toJournal(readJournalRow(input.journalId)!);
};

export const recordPortableImportRecoveryFailure = (input: {
  journalId: string;
  error: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `UPDATE portable_import_recovery_journal
        SET last_recovery_error = ?, updated_at = ?
      WHERE id = ? AND state IN ('PENDING','MARKET_READY')`,
  ).run(input.error, input.updatedAt, input.journalId);
};

export const deleteCommittedPortableImportRecoveryJournal = (
  journalId: string,
): boolean =>
  db
    .prepare(
      `DELETE FROM portable_import_recovery_journal
        WHERE id = ? AND state = 'COMMITTED'`,
    )
    .run(journalId).changes === 1;

export const completePortableImportRecoveryCleanup = (
  journalId: string,
  updatedAt: string,
): boolean =>
  db.transaction(() => {
    const row = readJournalRow(journalId);
    if (!row) {
      return false;
    }
    if (row.state === 'COMMITTED') {
      throw new Error('PORTABLE_IMPORT_RECOVERY_ALREADY_COMMITTED');
    }
    const journal = toJournal(row);
    journal.createdSourceIds.forEach((sourceId) => {
      db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?').run(
        sourceId,
      );
      db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(
        sourceId,
      );
    });
    journal.createdInstrumentIds.forEach((instrumentId) => {
      db.prepare(
        'DELETE FROM local_data_source_files WHERE instrument_id = ?',
      ).run(instrumentId);
      db.prepare('DELETE FROM instruments WHERE id = ?').run(instrumentId);
    });
    journal.createdSourceIds.forEach((sourceId) => {
      db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
    });
    journal.claimedSourceIds.forEach((sourceId) => {
      db.prepare(
        `UPDATE local_data_sources
            SET status = 'READY', deletion_state = 'IDLE', updated_at = ?
          WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`,
      ).run(updatedAt, sourceId);
    });
    assertSingleRowChanged(
      db
        .prepare(
          `DELETE FROM portable_import_recovery_journal
            WHERE id = ? AND state IN ('PENDING','MARKET_READY')`,
        )
        .run(journalId).changes,
    );
    return true;
  })();

