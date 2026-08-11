// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import { DEFAULT_USER_ID } from "../defaults.js";

export type SpecialTrainingBankRow = {
  id?: unknown;
  name?: unknown;
  asset_class?: unknown;
  target_timeframe?: unknown;
  scope_json?: unknown;
  simulation_batch_id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type SpecialTrainingBankInstrumentRow = {
  id?: unknown;
  symbol?: unknown;
  baseTimeframe?: unknown;
  barCount?: unknown;
  barsVersionToken?: unknown;
};

type SpecialTrainingBankListCursor = {
  updatedAt: string;
  createdAt: string;
  id: string;
};

type InsertSpecialTrainingBankRowInput = {
  id: string;
  name: string;
  assetClass: string;
  targetTimeframe: string;
  scopeJson: string;
  simulationBatchId: string | null;
  createdAt: string;
  updatedAt: string;
};

type UpdateSpecialTrainingBankRowInput = {
  id: string;
  name: string;
  assetClass: string;
  targetTimeframe: string;
  scopeJson: string;
  updatedAt: string;
};

const selectBankColumns = `id,
        name,
        asset_class,
        target_timeframe,
        scope_json,
        simulation_batch_id,
        created_at,
        updated_at`;

const listDefaultSpecialTrainingQuestionBankSeedRowsStmt = db.prepare(
  `SELECT ${selectBankColumns}
     FROM special_training_banks
    WHERE user_id = ?
      AND name = ?
      AND target_timeframe = '1d'
      AND asset_class = 'STOCK'
    ORDER BY updated_at DESC, created_at DESC, id DESC`,
);

const getSpecialTrainingBankByIdStmt = db.prepare(
  `SELECT ${selectBankColumns}
     FROM special_training_banks
    WHERE user_id = ?
      AND id = ?
    LIMIT 1`,
);

const listSpecialTrainingBanksStmt = db.prepare(
  `SELECT ${selectBankColumns}
     FROM special_training_banks
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC, id DESC`,
);

const insertSpecialTrainingBankStmt = db.prepare(
  `INSERT INTO special_training_banks (
    id,user_id,name,asset_class,target_timeframe,scope_json,simulation_batch_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`,
);

const updateSpecialTrainingBankStmt = db.prepare(
  `UPDATE special_training_banks
      SET name = ?,
          asset_class = ?,
          target_timeframe = ?,
          scope_json = ?,
          updated_at = ?
    WHERE user_id = ?
      AND id = ?`,
);

const readAppMetaValueStmt = db.prepare(
  `SELECT value
     FROM app_meta
    WHERE key = ?
    LIMIT 1`,
);

const writeAppMetaValueStmt = db.prepare(
  `INSERT INTO app_meta (key,value,updated_at)
   VALUES (?,?,?)
   ON CONFLICT(key) DO UPDATE SET
     value = excluded.value,
     updated_at = excluded.updated_at`,
);

export function runSpecialTrainingBankMutation<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export const listLocalDataSourceIds = (
  sourceIds: readonly string[],
): string[] => {
  if (!sourceIds.length) {
    return [];
  }
  const placeholders = sourceIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id
         FROM local_data_sources
        WHERE id IN (${placeholders})
          AND status = 'READY'
          AND (deletion_state IS NULL OR TRIM(deletion_state) = '' OR deletion_state = 'IDLE')`,
    )
    .all(...sourceIds) as Array<{ id?: unknown }>;
  return rows
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);
};

export const listLocalPoolScopedInstrumentRows = (
  poolIds: readonly string[],
): SpecialTrainingBankInstrumentRow[] => {
  if (!poolIds.length) {
    return [];
  }
  const placeholders = poolIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT instrument.id,
              instrument.symbol,
              instrument.base_timeframe AS baseTimeframe,
              instrument.bar_count AS barCount,
              instrument.bars_version_token AS barsVersionToken
         FROM instruments AS instrument
         INNER JOIN local_data_sources AS source
           ON source.id = instrument.source_id
        WHERE instrument.source_id IN (${placeholders})
          AND source.status = 'READY'
          AND (source.deletion_state IS NULL OR TRIM(source.deletion_state) = '' OR source.deletion_state = 'IDLE')
        ORDER BY instrument.source_id ASC, instrument.symbol ASC, instrument.base_timeframe ASC, instrument.id ASC`,
    )
    .all(...poolIds) as SpecialTrainingBankInstrumentRow[];
};

export const listSystemPoolScopedInstrumentRowsByTimeframe = (
  timeframes: readonly string[],
): SpecialTrainingBankInstrumentRow[] => {
  if (!timeframes.length) {
    return [];
  }
  const placeholders = timeframes.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id,
              symbol,
              base_timeframe AS baseTimeframe,
              bar_count AS barCount,
              bars_version_token AS barsVersionToken
         FROM instruments
        WHERE market = 'SYSTEM'
          AND base_timeframe IN (${placeholders})
        ORDER BY base_timeframe ASC, symbol ASC, id ASC`,
    )
    .all(...timeframes) as SpecialTrainingBankInstrumentRow[];
};

export const listDefaultSpecialTrainingQuestionBankSeedRows = (
  bankName: string,
): SpecialTrainingBankRow[] =>
  listDefaultSpecialTrainingQuestionBankSeedRowsStmt.all(
    DEFAULT_USER_ID,
    bankName,
  ) as SpecialTrainingBankRow[];

export const readAppMetaValue = (key: string): string =>
  String(readAppMetaValueStmt.pluck().get(key) ?? "").trim();

export const writeAppMetaValue = ({
  key,
  value,
  updatedAt,
}: {
  key: string;
  value: string;
  updatedAt: string;
}): void => {
  writeAppMetaValueStmt.run(key, value, updatedAt);
};

export const insertSpecialTrainingBankRow = (
  row: InsertSpecialTrainingBankRowInput,
): void => {
  insertSpecialTrainingBankStmt.run(
    row.id,
    DEFAULT_USER_ID,
    row.name,
    row.assetClass,
    row.targetTimeframe,
    row.scopeJson,
    row.simulationBatchId,
    row.createdAt,
    row.updatedAt,
  );
};

export const listSpecialTrainingBankRows = (): SpecialTrainingBankRow[] =>
  listSpecialTrainingBanksStmt.all(DEFAULT_USER_ID) as SpecialTrainingBankRow[];

const escapeSqlLike = (value: string): string =>
  value.replace(/[\\%_]/gu, (match) => `\\${match}`);

export const countSpecialTrainingBankRows = (keyword: string): number => {
  const whereParts = ["user_id = ?"];
  const whereParams: unknown[] = [DEFAULT_USER_ID];
  if (keyword) {
    whereParts.push(`name LIKE ? ESCAPE '\\'`);
    whereParams.push(`%${escapeSqlLike(keyword)}%`);
  }
  const total =
    db
      .prepare(
        `SELECT COUNT(1)
           FROM special_training_banks
          WHERE ${whereParts.join(" AND ")}`,
      )
      .pluck()
      .get(...whereParams) ?? 0;
  return Math.max(0, Math.floor(Number(total) || 0));
};

export const listSpecialTrainingBankPageRows = ({
  keyword,
  cursor,
  limit,
}: {
  keyword: string;
  cursor: SpecialTrainingBankListCursor | null;
  limit: number;
}): SpecialTrainingBankRow[] => {
  const whereParts = ["user_id = ?"];
  const whereParams: unknown[] = [DEFAULT_USER_ID];
  if (keyword) {
    whereParts.push(`name LIKE ? ESCAPE '\\'`);
    whereParams.push(`%${escapeSqlLike(keyword)}%`);
  }
  if (cursor) {
    whereParts.push(`(updated_at, created_at, id) < (?, ?, ?)`);
    whereParams.push(cursor.updatedAt, cursor.createdAt, cursor.id);
  }
  return db
    .prepare(
      `SELECT ${selectBankColumns}
         FROM special_training_banks
        WHERE ${whereParts.join(" AND ")}
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(...whereParams, limit) as SpecialTrainingBankRow[];
};

export const getSpecialTrainingBankRowById = (
  bankId: string,
): SpecialTrainingBankRow | null =>
  (getSpecialTrainingBankByIdStmt.get(DEFAULT_USER_ID, bankId) as
    | SpecialTrainingBankRow
    | undefined) ?? null;

export const updateSpecialTrainingBankRow = (
  row: UpdateSpecialTrainingBankRowInput,
): void => {
  updateSpecialTrainingBankStmt.run(
    row.name,
    row.assetClass,
    row.targetTimeframe,
    row.scopeJson,
    row.updatedAt,
    DEFAULT_USER_ID,
    row.id,
  );
};

export const deleteSpecialTrainingBankRow = (bankId: string): boolean =>
  db.transaction(() => {
    const scopeRows = db
      .prepare(
        `SELECT scope_hash
           FROM special_training_question_scope_indexes
          WHERE user_id = ?
            AND bank_id = ?
         UNION
         SELECT scope_hash
           FROM special_training_question_ledger
          WHERE user_id = ?
            AND bank_id = ?`,
      )
      .all(DEFAULT_USER_ID, bankId, DEFAULT_USER_ID, bankId) as Array<{
      scope_hash?: unknown;
    }>;
    const scopeHashes = scopeRows
      .map((row) => String(row.scope_hash ?? "").trim())
      .filter((scopeHash) => scopeHash.length > 0);
    if (scopeHashes.length) {
      const placeholders = scopeHashes.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM special_training_question_draw_cursors
          WHERE user_id = ?
            AND scope_hash IN (${placeholders})`,
      ).run(DEFAULT_USER_ID, ...scopeHashes);
    }
    db.prepare(
      `DELETE FROM special_training_question_scope_indexes
        WHERE user_id = ?
          AND bank_id = ?`,
    ).run(DEFAULT_USER_ID, bankId);
    return db
      .prepare(
        `DELETE FROM special_training_banks
          WHERE user_id = ?
            AND id = ?`,
      )
      .run(DEFAULT_USER_ID, bankId).changes > 0;
  })();
