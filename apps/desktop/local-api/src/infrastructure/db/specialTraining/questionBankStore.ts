// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import { DEFAULT_USER_ID } from "../defaults.js";

const SQL_CHUNK_SIZE = 400;

export type InstrumentQuestionMetaRow = {
  instrumentId?: unknown;
  sourceId?: unknown;
  symbol?: unknown;
  market?: unknown;
  baseTimeframe?: unknown;
  instrumentTimeZone?: unknown;
  sourceTimeZone?: unknown;
  barCount?: unknown;
  timeStartTs?: unknown;
  timeEndTs?: unknown;
  barsVersionToken?: unknown;
  minTradeStep?: unknown;
};

export type QuestionScopeIndexRow = {
  definition_hash?: unknown;
  scope_hash?: unknown;
  payload_json?: unknown;
};

export type QuestionDrawCursorRow = {
  cycle_index?: unknown;
  cursor_index?: unknown;
  total_question_count?: unknown;
};

export type QuestionLedgerSlotRow = {
  instrument_id?: unknown;
  symbol?: unknown;
  slot_index?: unknown;
};

type WriteQuestionScopeIndexInput = {
  definitionHash: string;
  bankId: string;
  modeId: string;
  targetTimeframe: string;
  horizonBars: number;
  scopeHash: string;
  totalQuestionCount: number;
  payloadJson: string;
  timestamp: string;
};

type InsertQuestionLedgerReservationInput = {
  id: string;
  bankId: string;
  bankName: string;
  modeId: string;
  scopeHash: string;
  sourceTag: string;
  simulationBatchId: string | null;
  instrumentId: string;
  symbol: string;
  timeframe: string;
  minimumBaseTimeframe: string;
  sourceTimeframe: string;
  slotIndex: number;
  timestamp: string;
};

type UpsertQuestionDrawCursorInput = {
  modeId: string;
  scopeHash: string;
  cycleIndex: number;
  cursorIndex: number;
  totalQuestionCount: number;
  updatedAt: string;
};

type MarkQuestionLedgerSettledInput = {
  ledgerId: string;
  status: "ABANDONED" | "SETTLED";
  score: number;
  passed: boolean;
  decisionSelection: string | null;
  decisionActual: string | null;
  decisionCorrect: boolean | null;
  decisionSecondsUsed: number | null;
  decisionMfeMaeRatio: number | null;
  opportunityDirection: string | null;
  opportunityMfeMaeRatio: number | null;
  settledAt: string;
};

const selectQuestionScopeIndexStmt = db.prepare(
  `SELECT definition_hash, scope_hash, payload_json
     FROM special_training_question_scope_indexes
    WHERE user_id = ?
      AND definition_hash = ?
    LIMIT 1`,
);

const writeQuestionScopeIndexStmt = db.prepare(
  `INSERT INTO special_training_question_scope_indexes (
     definition_hash,user_id,bank_id,mode_id,target_timeframe,horizon_bars,scope_hash,total_question_count,payload_json,created_at,updated_at
   ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(definition_hash) DO UPDATE SET
     bank_id = excluded.bank_id,
     mode_id = excluded.mode_id,
     target_timeframe = excluded.target_timeframe,
     horizon_bars = excluded.horizon_bars,
     scope_hash = excluded.scope_hash,
     total_question_count = excluded.total_question_count,
     payload_json = excluded.payload_json,
     updated_at = excluded.updated_at`,
);

const selectQuestionDrawCursorStmt = db.prepare(
  `SELECT cycle_index, cursor_index, total_question_count
     FROM special_training_question_draw_cursors
    WHERE user_id = ?
      AND mode_id = ?
      AND scope_hash = ?
    LIMIT 1`,
);

const listQuestionLedgerSlotRowsStmt = db.prepare(
  `SELECT instrument_id, symbol, slot_index
     FROM special_training_question_ledger
    WHERE user_id = ?
      AND mode_id = ?
      AND scope_hash = ?
    LIMIT ?`,
);

const countQuestionLedgerRowsStmt = db.prepare(
  `SELECT COUNT(1)
     FROM special_training_question_ledger
    WHERE user_id = ?
      AND mode_id = ?
      AND scope_hash = ?`,
);

const deleteQuestionLedgerForScopeStmt = db.prepare(
  `DELETE FROM special_training_question_ledger
    WHERE user_id = ?
      AND mode_id = ?
      AND scope_hash = ?`,
);

const updateQuestionDrawCursorCycleStmt = db.prepare(
  `UPDATE special_training_question_draw_cursors
      SET cycle_index = ?,
          cursor_index = 0,
          updated_at = ?
    WHERE user_id = ?
      AND mode_id = ?
      AND scope_hash = ?`,
);

const listScopeHashesForBankModeStmt = db.prepare(
  `SELECT scope_hash
     FROM special_training_question_scope_indexes
    WHERE user_id = ?
      AND bank_id = ?
      AND mode_id = ?
   UNION
   SELECT scope_hash
     FROM special_training_question_ledger
    WHERE user_id = ?
      AND bank_id = ?
      AND mode_id = ?`,
);

const deleteQuestionLedgerForBankModeStmt = db.prepare(
  `DELETE FROM special_training_question_ledger
    WHERE user_id = ?
      AND bank_id = ?
      AND mode_id = ?`,
);

const insertQuestionLedgerReservationStmt = db.prepare(
  `INSERT OR IGNORE INTO special_training_question_ledger (
    id,user_id,bank_id,bank_name,mode_id,scope_hash,source_tag,simulation_batch_id,instrument_id,symbol,timeframe,minimum_base_timeframe,source_timeframe,slot_index,status,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const upsertQuestionDrawCursorStmt = db.prepare(
  `INSERT INTO special_training_question_draw_cursors (
     user_id,mode_id,scope_hash,cycle_index,cursor_index,total_question_count,updated_at
   ) VALUES (?,?,?,?,?,?,?)
   ON CONFLICT(user_id, mode_id, scope_hash) DO UPDATE SET
     cycle_index = excluded.cycle_index,
     cursor_index = excluded.cursor_index,
     total_question_count = excluded.total_question_count,
     updated_at = excluded.updated_at`,
);

const markQuestionLedgerSettledStmt = db.prepare(
  `UPDATE special_training_question_ledger
      SET status = ?,
          score = ?,
          passed = ?,
          decision_selection = ?,
          decision_actual = ?,
          decision_correct = ?,
          decision_seconds_used = ?,
          decision_mfe_mae_ratio = ?,
          opportunity_direction = ?,
          opportunity_mfe_mae_ratio = ?,
          settled_at = ?,
          updated_at = ?
    WHERE id = ?`,
);

export const listInstrumentQuestionMetaRowsByIds = (
  instrumentIds: readonly string[],
): InstrumentQuestionMetaRow[] => {
  const rows: InstrumentQuestionMetaRow[] = [];
  for (let offset = 0; offset < instrumentIds.length; offset += SQL_CHUNK_SIZE) {
    const chunk = instrumentIds.slice(offset, offset + SQL_CHUNK_SIZE);
    if (!chunk.length) {
      continue;
    }
    const placeholders = chunk.map(() => "?").join(",");
    rows.push(
      ...(db
        .prepare(
          `SELECT i.id AS instrumentId,
                  i.source_id AS sourceId,
                  i.symbol,
                  i.market,
                  i.base_timeframe AS baseTimeframe,
                  i.time_zone AS instrumentTimeZone,
                  lds.time_zone AS sourceTimeZone,
                  i.bar_count AS barCount,
                  i.time_start_ts AS timeStartTs,
                  i.time_end_ts AS timeEndTs,
                  i.bars_version_token AS barsVersionToken,
                  i.min_trade_step AS minTradeStep
             FROM instruments i
        LEFT JOIN local_data_sources lds
               ON lds.id = i.source_id
            WHERE i.id IN (${placeholders})`,
        )
        .all(...chunk) as InstrumentQuestionMetaRow[]),
    );
  }
  return rows;
};

export const getQuestionScopeIndexRow = (
  definitionHash: string,
): QuestionScopeIndexRow | null =>
  (selectQuestionScopeIndexStmt.get(DEFAULT_USER_ID, definitionHash) as
    | QuestionScopeIndexRow
    | undefined) ?? null;

export const writeQuestionScopeIndexRow = (
  input: WriteQuestionScopeIndexInput,
): void => {
  writeQuestionScopeIndexStmt.run(
    input.definitionHash,
    DEFAULT_USER_ID,
    input.bankId,
    input.modeId,
    input.targetTimeframe,
    input.horizonBars,
    input.scopeHash,
    input.totalQuestionCount,
    input.payloadJson,
    input.timestamp,
    input.timestamp,
  );
};

export const getQuestionDrawCursorRow = (
  modeId: string,
  scopeHash: string,
): QuestionDrawCursorRow | null =>
  (selectQuestionDrawCursorStmt.get(DEFAULT_USER_ID, modeId, scopeHash) as
    | QuestionDrawCursorRow
    | undefined) ?? null;

export const deleteQuestionDrawCursorsByScopeHashes = (
  modeId: string,
  scopeHashes: readonly string[],
): void => {
  for (let offset = 0; offset < scopeHashes.length; offset += SQL_CHUNK_SIZE) {
    const chunk = scopeHashes.slice(offset, offset + SQL_CHUNK_SIZE);
    if (!chunk.length) {
      continue;
    }
    const placeholders = chunk.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM special_training_question_draw_cursors
        WHERE user_id = ?
          AND mode_id = ?
          AND scope_hash IN (${placeholders})`,
    ).run(DEFAULT_USER_ID, modeId, ...chunk);
  }
};

export const listQuestionLedgerSlotRows = (
  modeId: string,
  scopeHash: string,
  limit: number,
): QuestionLedgerSlotRow[] =>
  listQuestionLedgerSlotRowsStmt.all(
    DEFAULT_USER_ID,
    modeId,
    scopeHash,
    limit,
  ) as QuestionLedgerSlotRow[];

export const countQuestionLedgerRows = (
  modeId: string,
  scopeHash: string,
): number =>
  Number(
    countQuestionLedgerRowsStmt.pluck().get(DEFAULT_USER_ID, modeId, scopeHash) ??
      0,
  );

export function runQuestionBankMutation<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export const deleteQuestionLedgerRowsForScope = (
  modeId: string,
  scopeHash: string,
): number =>
  deleteQuestionLedgerForScopeStmt.run(DEFAULT_USER_ID, modeId, scopeHash).changes;

export const updateQuestionDrawCursorCycle = ({
  modeId,
  scopeHash,
  cycleIndex,
  updatedAt,
}: {
  modeId: string;
  scopeHash: string;
  cycleIndex: number;
  updatedAt: string;
}): void => {
  updateQuestionDrawCursorCycleStmt.run(
    cycleIndex,
    updatedAt,
    DEFAULT_USER_ID,
    modeId,
    scopeHash,
  );
};

export const listQuestionScopeHashesForBankMode = (
  bankId: string,
  modeId: string,
): string[] =>
  (
    listScopeHashesForBankModeStmt.all(
      DEFAULT_USER_ID,
      bankId,
      modeId,
      DEFAULT_USER_ID,
      bankId,
      modeId,
    ) as Array<{ scope_hash?: unknown }>
  )
    .map((row) => String(row.scope_hash ?? "").trim())
    .filter((scopeHash) => scopeHash.length > 0);

export const deleteQuestionLedgerRowsForBankMode = (
  bankId: string,
  modeId: string,
): number =>
  deleteQuestionLedgerForBankModeStmt.run(DEFAULT_USER_ID, bankId, modeId)
    .changes;

export const insertQuestionLedgerReservation = (
  input: InsertQuestionLedgerReservationInput,
): number =>
  insertQuestionLedgerReservationStmt.run(
    input.id,
    DEFAULT_USER_ID,
    input.bankId,
    input.bankName,
    input.modeId,
    input.scopeHash,
    input.sourceTag,
    input.simulationBatchId,
    input.instrumentId,
    input.symbol,
    input.timeframe,
    input.minimumBaseTimeframe,
    input.sourceTimeframe,
    input.slotIndex,
    "ASSIGNED",
    input.timestamp,
    input.timestamp,
  ).changes;

export const upsertQuestionDrawCursor = (
  input: UpsertQuestionDrawCursorInput,
): void => {
  upsertQuestionDrawCursorStmt.run(
    DEFAULT_USER_ID,
    input.modeId,
    input.scopeHash,
    input.cycleIndex,
    input.cursorIndex,
    input.totalQuestionCount,
    input.updatedAt,
  );
};

export const deleteAssignedQuestionLedgerRowsByIds = (
  ledgerIds: readonly string[],
): number => {
  let deletedCount = 0;
  for (let offset = 0; offset < ledgerIds.length; offset += SQL_CHUNK_SIZE) {
    const chunk = ledgerIds.slice(offset, offset + SQL_CHUNK_SIZE);
    if (!chunk.length) {
      continue;
    }
    const placeholders = chunk.map(() => "?").join(",");
    deletedCount += db
      .prepare(
        `DELETE FROM special_training_question_ledger
          WHERE user_id = ?
            AND status = 'ASSIGNED'
            AND id IN (${placeholders})`,
      )
      .run(DEFAULT_USER_ID, ...chunk).changes;
  }
  return deletedCount;
};

export const markQuestionLedgerSettledRow = (
  input: MarkQuestionLedgerSettledInput,
): void => {
  markQuestionLedgerSettledStmt.run(
    input.status,
    input.score,
    input.passed ? 1 : 0,
    input.decisionSelection,
    input.decisionActual,
    input.decisionCorrect === null ? null : input.decisionCorrect ? 1 : 0,
    input.decisionSecondsUsed,
    input.decisionMfeMaeRatio,
    input.opportunityDirection,
    input.opportunityMfeMaeRatio,
    input.settledAt,
    input.settledAt,
    input.ledgerId,
  );
};
