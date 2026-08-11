// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { appError } from '../../kernel/appError.js';
import { parsePayloadJson } from '../portableDataPackage.js';

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
};

const stableJson = (value: unknown): string => JSON.stringify(stableValue(value));

const requirePayloadObject = (value: unknown): Record<string, unknown> => {
  const parsed = parsePayloadJson<unknown>(value, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return parsed as Record<string, unknown>;
};

const updateHash = (
  hash: ReturnType<typeof crypto.createHash>,
  section: string,
  value: unknown,
): void => {
  hash.update(section);
  hash.update('\0');
  hash.update(stableJson(value));
  hash.update('\n');
};

export const buildPortableMarketPayloadFingerprint = ({
  payloadDb,
  sourceId,
}: {
  payloadDb: Database.Database;
  sourceId: string;
}): string => {
  const sourceRow = payloadDb
    .prepare(
      `SELECT source_id, payload_json
         FROM portable_export_market_sources
        WHERE source_id = ?
        LIMIT 1`,
    )
    .get(sourceId) as
    | { source_id?: unknown; payload_json?: unknown }
    | undefined;
  if (!sourceRow || String(sourceRow.source_id ?? '') !== sourceId) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  const sourcePayload = requirePayloadObject(sourceRow.payload_json);
  const hash = crypto.createHash('sha256');
  updateHash(hash, 'source', {
    ...sourcePayload,
    fingerprintHash: '',
  });

  const instrumentRows = payloadDb
    .prepare(
      `SELECT instrument_id, source_id, payload_json
         FROM portable_export_market_instruments
        WHERE source_id = ?
        ORDER BY instrument_id ASC`,
    )
    .all(sourceId) as Array<Record<string, unknown>>;
  instrumentRows.forEach((row) => {
    updateHash(hash, 'instrument', {
      instrumentId: String(row.instrument_id ?? ''),
      sourceId: String(row.source_id ?? ''),
      payload: requirePayloadObject(row.payload_json),
    });
  });

  const ledgerRows = payloadDb
    .prepare(
      `SELECT source_id, row_id, payload_json
         FROM portable_export_market_file_ledgers
        WHERE source_id = ?
        ORDER BY row_id ASC`,
    )
    .all(sourceId) as Array<Record<string, unknown>>;
  ledgerRows.forEach((row) => {
    updateHash(hash, 'ledger', {
      sourceId: String(row.source_id ?? ''),
      rowId: String(row.row_id ?? ''),
      payload: requirePayloadObject(row.payload_json),
    });
  });

  const barRows = payloadDb
    .prepare(
      `SELECT b.instrument_id, b.ts_ms, b.open, b.high, b.low, b.close, b.volume
         FROM portable_export_market_bars b
         JOIN portable_export_market_instruments i
           ON i.instrument_id = b.instrument_id
        WHERE i.source_id = ?
        ORDER BY b.instrument_id ASC, b.ts_ms ASC`,
    )
    .iterate(sourceId) as Iterable<Record<string, unknown>>;
  for (const row of barRows) {
    updateHash(hash, 'bar', {
      instrumentId: String(row.instrument_id ?? ''),
      tsMs: Number(row.ts_ms),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    });
  }
  return hash.digest('hex');
};
