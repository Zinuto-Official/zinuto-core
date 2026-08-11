// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';
import {
  findMarketBarRawIndexByTs,
  getMarketBarsByInstrumentIdRange,
} from '../marketDatabase.js';
import type { OhlcvBar } from '../../../domain/models.js';
import {
  encodeStoredJsonToCompressedBuffer,
  parseStoredJsonSafe,
} from '../../../kernel/compressedJson.js';
import {
  buildReplayEquityMetrics,
  buildReplayRefMeta,
  clamp,
  decodeReplayCashAdjustmentRowsForWindow,
  decodeReplayFillRowsForWindow,
  decodeReplayDrawingsCompact,
  encodeReplayCashAdjustmentsForRows,
  encodeReplayDrawingsCompact,
  encodeReplayFillsForRows,
  filterReplayDrawingsForWindow,
  normalizeBaseTimeframe,
  normalizeDisplayPeriod,
  normalizeNumber,
  normalizePortablePreviewRecord,
  normalizeReplayTradeRounds,
  normalizeStoredReplaySettings,
} from '../../../domain/history/replayRefCodec.js';
import type {
  ReplayCashAdjustmentStoreRow,
  ReplayCurvePoint,
  ReplayFillStoreRow,
  ReplayPayload,
  ReplayRefMeta,
  ReplayRefStoredPayload,
  ReplayTradeRoundRecord,
} from '../../../domain/history/replayRefCodec.js';
import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import {
  deriveReplayTradeRounds,
} from '@zinuto/shared/replay';

export { buildReplayRefMeta } from '../../../domain/history/replayRefCodec.js';

type ReplayRefRow = {
  project_id: string;
  instrument_id: string;
  bars_version_token: string;
  entry_index: number;
  cursor_index: number;
  history_bars: number;
  settings_json: unknown;
  payload_blob: unknown;
  payload_encoding: string;
  created_at: string;
  updated_at: string;
  start_ts: string | null;
  end_ts: string | null;
  base_timeframe: string | null;
};

type PortablePreviewRow = {
  project_id: string;
  source_manifest_hash: string;
  preview_payload: unknown;
  preview_encoding: string;
  source_bytes: number;
  preview_bytes: number;
  created_at: string;
  updated_at: string;
};

type TrainingProjectReplaySummaryRow = {
  symbol: string | null;
  initial_total: number | null;
  final_equity: number | null;
  equity_return_rate: number | null;
};

const getInstrumentRefById = (
  instrumentId: string,
  baseTimeframe: string | null,
): { instrumentId: string; barsVersionToken: string } | null => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  const normalizedBaseTimeframe = normalizeBaseTimeframe(baseTimeframe);
  if (!normalizedInstrumentId || !normalizedBaseTimeframe) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT id, bars_version_token AS barsVersionToken
       FROM instruments
       WHERE id = ?
         AND base_timeframe = ?
       LIMIT 1`
    )
    .get(normalizedInstrumentId, normalizedBaseTimeframe) as
    | { id?: string; barsVersionToken?: string | null }
    | undefined;
  const resolvedInstrumentId = typeof row?.id === 'string' ? row.id.trim() : '';
  if (!resolvedInstrumentId) {
    return null;
  }
  return {
    instrumentId: resolvedInstrumentId,
    barsVersionToken:
      typeof row?.barsVersionToken === 'string' ? row.barsVersionToken.trim() : '',
  };
};

const getInstrumentBarsVersionToken = (instrumentId: string): string | null => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  if (!normalizedInstrumentId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT bars_version_token AS barsVersionToken
         FROM instruments
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedInstrumentId) as { barsVersionToken?: string | null } | undefined;
  const value = typeof row?.barsVersionToken === 'string' ? row.barsVersionToken.trim() : '';
  return value || null;
};

const hasInstrumentById = (instrumentId: string): boolean => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  if (!normalizedInstrumentId) {
    return false;
  }
  const row = db
    .prepare(
      `SELECT 1
         FROM instruments
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedInstrumentId) as { 1?: number } | undefined;
  return Boolean(row);
};

export const saveTrainingProjectPortablePreview = (
  projectId: string,
  preview: Record<string, unknown> | null,
  timestamp: string,
  sourceManifestHash = '',
): boolean => {
  const normalizedProjectId = projectId.trim();
  const normalizedPreview = normalizePortablePreviewRecord(preview);
  if (!normalizedProjectId || !normalizedPreview) {
    db.prepare('DELETE FROM training_project_portable_previews WHERE project_id = ?').run(normalizedProjectId);
    return false;
  }
  const sourceJson = JSON.stringify(normalizedPreview);
  const sourceBytes = Buffer.byteLength(sourceJson, 'utf-8');
  const previewPayload = encodeStoredJsonToCompressedBuffer(normalizedPreview);
  db.prepare(
    `INSERT INTO training_project_portable_previews (
      project_id,source_manifest_hash,preview_encoding,preview_payload,source_bytes,preview_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(project_id) DO UPDATE SET
      source_manifest_hash = excluded.source_manifest_hash,
      preview_encoding = excluded.preview_encoding,
      preview_payload = excluded.preview_payload,
      source_bytes = excluded.source_bytes,
      preview_bytes = excluded.preview_bytes,
      updated_at = excluded.updated_at`,
  ).run(
    normalizedProjectId,
    sourceManifestHash.trim(),
    'GZIP_JSON_V1',
    previewPayload,
    sourceBytes,
    previewPayload.byteLength,
    timestamp,
    timestamp,
  );
  return true;
};

export const loadTrainingProjectPortablePreview = (
  projectId: string,
): Record<string, unknown> | null => {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT project_id,source_manifest_hash,preview_payload,preview_encoding,source_bytes,preview_bytes,created_at,updated_at
         FROM training_project_portable_previews
        WHERE project_id = ?
        LIMIT 1`,
    )
    .get(normalizedProjectId) as PortablePreviewRow | undefined;
  if (!row) {
    return null;
  }
  return normalizePortablePreviewRecord(
    parseStoredJsonSafe<Record<string, unknown> | null>(row.preview_payload, null),
  );
};

export const clearTrainingProjectPortablePreview = (projectId: string): void => {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return;
  }
  db.prepare('DELETE FROM training_project_portable_previews WHERE project_id = ?').run(normalizedProjectId);
};



const countReplayFillRows = (projectId: string): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM training_project_replay_fills
        WHERE project_id = ?`,
    )
    .get(projectId) as { count?: unknown } | undefined;
  return Math.max(0, Math.floor(normalizeNumber(row?.count, 0)));
};

const loadReplayFillRowsForWindow = (
  projectId: string,
  localWindowStart: number,
  localWindowEnd: number,
): ReplayFillStoreRow[] =>
  db
    .prepare(
      `SELECT row_seq AS rowSeq,
              side,
              fill_index AS fillIndex,
              fill_time AS fillTime,
              fill_price AS fillPrice,
              fill_qty AS fillQty,
              contract_multiplier AS contractMultiplier,
              fee,
              tax,
              slippage,
              created_at AS createdAt
         FROM training_project_replay_fills
        WHERE project_id = ?
          AND fill_index >= ?
          AND fill_index <= ?
        ORDER BY fill_index ASC, row_seq ASC`,
    )
    .all(projectId, localWindowStart, localWindowEnd) as ReplayFillStoreRow[];

const loadReplayCashAdjustmentRowsForWindow = (
  projectId: string,
  localWindowStart: number,
  localWindowEnd: number,
): ReplayCashAdjustmentStoreRow[] =>
  db
    .prepare(
      `SELECT row_seq AS rowSeq,
              kind,
              bar_index AS barIndex,
              amount,
              ts,
              created_at AS createdAt
         FROM training_project_replay_cash_adjustments
        WHERE project_id = ?
          AND bar_index >= ?
          AND bar_index <= ?
        ORDER BY bar_index ASC, row_seq ASC`,
    )
    .all(projectId, localWindowStart, localWindowEnd) as ReplayCashAdjustmentStoreRow[];

export const saveTrainingProjectReplayRef = (
  projectId: string,
  replay: unknown,
  timestamp: string
): ReplayRefMeta | null => {
  if (!projectId || !replay || typeof replay !== 'object') {
    return null;
  }
  const source = replay as Record<string, unknown>;
  const snapshot = source.snapshot && typeof source.snapshot === 'object' ? (source.snapshot as Record<string, unknown>) : null;
  if (!snapshot) {
    return null;
  }
  const bars = Array.isArray(source.bars) ? source.bars : [];
  if (!bars.length) {
    return null;
  }
  const meta = buildReplayRefMeta(replay);
  if (!meta) {
    return null;
  }
  const baseTimeframe = normalizeBaseTimeframe(source.baseTimeframe);
  if (!baseTimeframe) {
    return null;
  }
  const sessionMeta =
    snapshot.session && typeof snapshot.session === 'object'
      ? (snapshot.session as Record<string, unknown>)
      : {};
  const sessionCreatedAt =
    typeof sessionMeta.created_at === 'string' && sessionMeta.created_at.trim()
      ? sessionMeta.created_at.trim()
      : timestamp;
  const instrumentRef = getInstrumentRefById(
    typeof sessionMeta.instrument_id === 'string' ? sessionMeta.instrument_id : '',
    baseTimeframe,
  );
  if (!instrumentRef) {
    return null;
  }
  const fills = encodeReplayFillsForRows(Array.isArray(snapshot.fills) ? snapshot.fills : []);
  const cashAdjustments = encodeReplayCashAdjustmentsForRows(snapshot.cashAdjustments);
  const drawings = encodeReplayDrawingsCompact(Array.isArray(source.drawings) ? source.drawings : []);
  const settings = normalizeStoredReplaySettings(
    snapshot.sessionTradingSettings &&
      typeof snapshot.sessionTradingSettings === 'object' &&
      !Array.isArray(snapshot.sessionTradingSettings)
      ? snapshot.sessionTradingSettings
      : undefined,
  );
  const payloadBlob = encodeStoredJsonToCompressedBuffer({
    drawings,
    chartIndicators: source.chartIndicators,
    displayPeriod: normalizeDisplayPeriod(source.displayPeriod) ?? baseTimeframe,
  } satisfies ReplayRefStoredPayload);

  const persist = db.transaction(() => {
    db.prepare(
      `INSERT INTO training_project_replay_refs (
        project_id,base_timeframe,instrument_id,bars_version_token,start_ts,end_ts,entry_index,cursor_index,history_bars,settings_json,payload_blob,payload_encoding,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(project_id) DO UPDATE SET
        base_timeframe = excluded.base_timeframe,
        instrument_id = excluded.instrument_id,
        bars_version_token = excluded.bars_version_token,
        start_ts = excluded.start_ts,
        end_ts = excluded.end_ts,
        entry_index = excluded.entry_index,
        cursor_index = excluded.cursor_index,
        history_bars = excluded.history_bars,
        settings_json = excluded.settings_json,
        payload_blob = excluded.payload_blob,
        payload_encoding = excluded.payload_encoding,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
    ).run(
      projectId,
      baseTimeframe,
      instrumentRef.instrumentId,
      instrumentRef.barsVersionToken,
      meta.startTs,
      meta.endTs,
      Math.max(0, Math.floor(normalizeNumber(sessionMeta.entry_index, 0))),
      Math.max(0, Math.floor(normalizeNumber(sessionMeta.cursor_index, meta.barCount ? meta.barCount - 1 : 0))),
      Math.max(
        0,
        Math.floor(
          normalizeNumber(
            sessionMeta.history_bars,
            meta.barCount,
          ),
        ),
      ),
      JSON.stringify(settings),
      payloadBlob,
      'GZIP_JSON_V1',
      sessionCreatedAt,
      timestamp,
    );

    db.prepare('DELETE FROM training_project_replay_fills WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM training_project_replay_cash_adjustments WHERE project_id = ?').run(projectId);

    const insertFill = db.prepare(
      `INSERT INTO training_project_replay_fills (
        project_id,fill_index,row_seq,side,fill_time,fill_price,fill_qty,contract_multiplier,fee,tax,slippage,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    fills.forEach((fill) => {
      insertFill.run(
        projectId,
        fill.fill_index,
        fill.row_seq,
        fill.side,
        fill.fill_time,
        fill.fill_price,
        fill.fill_qty,
        fill.contract_multiplier,
        fill.fee,
        fill.tax,
        fill.slippage,
        fill.created_at || sessionCreatedAt,
      );
    });

    const insertCashAdjustment = db.prepare(
      `INSERT INTO training_project_replay_cash_adjustments (
        project_id,bar_index,row_seq,kind,amount,ts,created_at
      ) VALUES (?,?,?,?,?,?,?)`,
    );
    cashAdjustments.forEach((adjustment) => {
      insertCashAdjustment.run(
        projectId,
        adjustment.bar_index,
        adjustment.row_seq,
        adjustment.kind,
        adjustment.amount,
        adjustment.ts,
        adjustment.created_at || adjustment.ts || sessionCreatedAt,
      );
    });
  });
  persist();

  if (bars.length > 0) {
    return meta;
  }
  return null;
};

export const clearTrainingProjectReplayRef = (projectId: string): void => {
  if (!projectId) {
    return;
  }
  db.prepare('DELETE FROM training_project_replay_fills WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM training_project_replay_cash_adjustments WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM training_project_replay_refs WHERE project_id = ?').run(projectId);
};

export const loadTrainingProjectReplayFromRef = async (projectId: string, symbol: string): Promise<unknown | null> => {
  void symbol;
  if (!projectId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT project_id,base_timeframe,instrument_id,bars_version_token,start_ts,end_ts,entry_index,cursor_index,history_bars,
              settings_json,payload_blob,payload_encoding,created_at,updated_at
       FROM training_project_replay_refs
       WHERE project_id = ?`
    )
    .get(projectId) as ReplayRefRow | undefined;
  if (!row) {
    return null;
  }

  const replayBaseTimeframe = normalizeBaseTimeframe(row.base_timeframe);
  if (!replayBaseTimeframe) {
    return null;
  }
  const instrumentExists = hasInstrumentById(row.instrument_id);
  const currentBarsVersionToken = getInstrumentBarsVersionToken(row.instrument_id);
  const replayHydrationStatus: ReplayPayload['replayHydrationStatus'] =
    !instrumentExists
      ? 'SOURCE_MISSING'
      : row.bars_version_token &&
          currentBarsVersionToken &&
          currentBarsVersionToken !== row.bars_version_token
        ? 'SOURCE_CHANGED'
        : 'READY';
  if (replayHydrationStatus !== 'SOURCE_MISSING') {
    const replayWindow = await loadTrainingProjectReplayWindowFromRef(
      projectId,
      row.cursor_index,
      DESKTOP_API_LIMITS.noteContextBarsMax,
    );
    if (replayWindow) {
      return replayWindow;
    }
  }
  const portablePreview = loadTrainingProjectPortablePreview(projectId);
  if (portablePreview) {
    const previewBars = Array.isArray((portablePreview as { bars?: unknown }).bars)
      ? ((portablePreview as { bars?: OhlcvBar[] }).bars ?? []).slice(
          -DESKTOP_API_LIMITS.noteContextBarsMax,
        )
      : [];
    const previewSnapshot =
      portablePreview.snapshot &&
      typeof portablePreview.snapshot === 'object' &&
      !Array.isArray(portablePreview.snapshot)
        ? (portablePreview.snapshot as Record<string, unknown>)
        : {};
    const previewDrawings = Array.isArray(
      (portablePreview as { drawings?: unknown }).drawings,
    )
      ? ((portablePreview as { drawings?: unknown[] }).drawings ?? [])
      : [];
    const previewEquityCurve = Array.isArray(
      (portablePreview as { equityCurve?: unknown }).equityCurve,
    )
      ? ((portablePreview as { equityCurve?: ReplayCurvePoint[] }).equityCurve ?? [])
      : [];
    const previewDrawdownCurve = Array.isArray(
      (portablePreview as { drawdownCurve?: unknown }).drawdownCurve,
    )
      ? ((portablePreview as { drawdownCurve?: ReplayCurvePoint[] }).drawdownCurve ?? [])
      : [];
    const previewTradeRounds = Array.isArray(
      (portablePreview as { tradeRounds?: unknown }).tradeRounds,
    )
      ? ((portablePreview as { tradeRounds?: ReplayTradeRoundRecord[] }).tradeRounds ?? [])
      : [];
    return {
      bars: previewBars,
      snapshot: previewSnapshot,
      drawings: previewDrawings,
      equityCurve: previewEquityCurve,
      drawdownCurve: previewDrawdownCurve,
      tradeRounds: previewTradeRounds,
      finalEquity: normalizeNumber(
        (portablePreview as { finalEquity?: unknown }).finalEquity,
        0,
      ),
      equityReturnRate: normalizeNumber(
        (portablePreview as { equityReturnRate?: unknown }).equityReturnRate,
        0,
      ),
      chartIndicators:
        (portablePreview as { chartIndicators?: unknown }).chartIndicators ??
        null,
      replayHydrationStatus: 'SNAPSHOT_ONLY',
      displayPeriod:
        normalizeDisplayPeriod(
          (portablePreview as { displayPeriod?: unknown }).displayPeriod,
        ) ??
        normalizeDisplayPeriod(
          (portablePreview as { baseTimeframe?: unknown }).baseTimeframe,
        ) ??
        replayBaseTimeframe ??
        undefined,
      baseTimeframe:
        normalizeBaseTimeframe(
          (portablePreview as { baseTimeframe?: unknown }).baseTimeframe,
        ) ??
        replayBaseTimeframe ??
        undefined,
    } satisfies ReplayPayload;
  }
  return null;
};

export const loadTrainingProjectReplayWindowFromRef = async (
  projectId: string,
  rawCursorIndex: number,
  rawWindowBars: number
): Promise<unknown | null> => {
  if (!projectId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT project_id,base_timeframe,instrument_id,bars_version_token,start_ts,end_ts,entry_index,cursor_index,history_bars,
              settings_json,payload_blob,payload_encoding,created_at,updated_at
       FROM training_project_replay_refs
       WHERE project_id = ?
       LIMIT 1`
    )
    .get(projectId) as ReplayRefRow | undefined;
  if (!row) {
    return null;
  }
  const projectRow = db
    .prepare(
      `SELECT symbol, initial_total, final_equity, equity_return_rate
       FROM training_projects
       WHERE id = ?
       LIMIT 1`
    )
    .get(projectId) as TrainingProjectReplaySummaryRow | undefined;
  const symbol = (projectRow?.symbol || '').trim().toUpperCase();
  const replayBaseTimeframe = normalizeBaseTimeframe(row.base_timeframe);
  if (!symbol || !replayBaseTimeframe || !row.start_ts) {
    return null;
  }

  const instrumentExists = hasInstrumentById(row.instrument_id);
  if (!instrumentExists) {
    return null;
  }
  const currentBarsVersionToken = getInstrumentBarsVersionToken(row.instrument_id);
  const replayHydrationStatus: ReplayPayload['replayHydrationStatus'] =
    row.bars_version_token &&
    currentBarsVersionToken &&
    currentBarsVersionToken !== row.bars_version_token
      ? 'SOURCE_CHANGED'
      : 'READY';
  const rawStartIndex = await findMarketBarRawIndexByTs(row.instrument_id, row.start_ts);
  if (rawStartIndex === null) {
    return null;
  }

  const maxLocalCursor = Math.max(
    0,
    Math.floor(
      normalizeNumber(
        row.cursor_index,
        row.history_bars > 0 ? row.history_bars - 1 : 0,
      ),
    ),
  );
  const localCursorIndex = clamp(
    Math.floor(normalizeNumber(rawCursorIndex, maxLocalCursor)),
    0,
    maxLocalCursor,
  );
  const marketCursorIndex = rawStartIndex + localCursorIndex;
  const windowBars = clamp(
    Math.floor(normalizeNumber(rawWindowBars, 240)),
    60,
    DESKTOP_API_LIMITS.noteContextBarsMax,
  );
  const marketStartOffset = Math.max(rawStartIndex, marketCursorIndex - windowBars + 1);
  const limit = marketCursorIndex - marketStartOffset + 1;
  const bars = await getMarketBarsByInstrumentIdRange(row.instrument_id, marketStartOffset, limit);
  if (!bars.length) {
    return null;
  }
  if (bars.length < limit) {
    return null;
  }

  const localWindowStart = marketStartOffset - rawStartIndex;
  const localWindowEnd = localWindowStart + bars.length - 1;
  const storedPayload = parseStoredJsonSafe<ReplayRefStoredPayload>(
    row.payload_blob,
    {
      drawings: [],
      chartIndicators: undefined,
    },
  );
  const settings = parseStoredJsonSafe<Record<string, unknown>>(row.settings_json, {});
  const fillRows = loadReplayFillRowsForWindow(
    projectId,
    localWindowStart,
    localWindowEnd,
  );
  const fills = decodeReplayFillRowsForWindow(
    fillRows,
    bars,
    symbol,
    localWindowStart,
  );
  const cashAdjustmentRows = loadReplayCashAdjustmentRowsForWindow(
    projectId,
    localWindowStart,
    localWindowEnd,
  );
  const cashAdjustments = decodeReplayCashAdjustmentRowsForWindow(
    cashAdjustmentRows,
    bars,
    localWindowStart,
  );
  const drawings = filterReplayDrawingsForWindow(
    decodeReplayDrawingsCompact(storedPayload.drawings),
    bars,
  );
  const nextEntry = clamp(row.entry_index - localWindowStart, 0, bars.length - 1);
  const tradeRounds = normalizeReplayTradeRounds(deriveReplayTradeRounds({ bars, fills }));
  const initialTotal = normalizeNumber(projectRow?.initial_total, 0);
  const metrics = buildReplayEquityMetrics(initialTotal, bars, fills, nextEntry, cashAdjustments);
  const finalEquity =
    projectRow?.final_equity === null || projectRow?.final_equity === undefined
      ? metrics.finalEquity
      : normalizeNumber(projectRow.final_equity, metrics.finalEquity);
  const equityReturnRate =
    projectRow?.equity_return_rate === null || projectRow?.equity_return_rate === undefined
      ? metrics.equityReturnRate
      : normalizeNumber(projectRow.equity_return_rate, metrics.equityReturnRate);
  const totalStoredFills = countReplayFillRows(projectId);

  return {
    bars,
    snapshot: {
      session: {
        id: projectId,
        user_id: 'default-user',
        instrument_id: row.instrument_id,
        timeframe: replayBaseTimeframe ?? undefined,
        start_index: 0,
        entry_index: nextEntry,
        history_bars: Math.max(0, row.history_bars || bars.length),
        cursor_index: bars.length - 1,
        autoplay_interval_ms: 1000,
        is_paused: 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
        symbol,
        instrumentName: null,
      },
      sessionTradingSettings: settings,
      fills,
      fillsTotal: totalStoredFills,
      nextFillCursor: null,
      cashAdjustments,
      drawings: []
    },
    drawings: drawings.slice(-300),
    equityCurve: metrics.equityCurve,
    drawdownCurve: metrics.drawdownCurve,
    tradeRounds,
    finalEquity,
    equityReturnRate,
    chartIndicators: storedPayload.chartIndicators,
    baseTimeframe: replayBaseTimeframe ?? undefined,
    displayPeriod:
      normalizeDisplayPeriod(storedPayload.displayPeriod) ??
      replayBaseTimeframe ??
      undefined,
    replayHydrationStatus,
  };
};
