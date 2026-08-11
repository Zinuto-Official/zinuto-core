// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { db, DEFAULT_USER_ID } from '../database.js';
import type {
  PortableCustomIndicatorProfileUpsertRow,
  PortableImportedMarketFileLedgerRow,
  PortableImportedMarketJobRow,
  PortableImportedMarketSourceRow,
  PortableLocalInstrumentBarsUpdateRow,
  PortableLocalInstrumentBindingRow,
  PortableLocalInstrumentInsertRow,
  PortableReplayNoteAttachmentUpsertRow,
  PortableReplayNoteColorUpsertRow,
  PortableReplayNoteContentInsertRow,
  PortableReplayNoteContextArchiveUpsertRow,
  PortableReplayNoteContextRefUpsertRow,
  PortableReplayNoteInsertRow,
  PortableReplayNoteMetaInsertRow,
  PortableReplayNoteSpecialTrainingContextRefUpsertRow,
  PortableSpecialTrainingQuestionInsertRow,
  PortableSpecialTrainingSessionInsertRow,
  PortableTrainingProjectInsertRow,
  PortableTrainingProjectReplayCashAdjustmentUpsertRow,
  PortableTrainingProjectReplayFillUpsertRow,
  PortableTrainingProjectReplayRefUpsertRow,
} from '../../../domain/portableDataRepositoryTypes.js';

export const runPortableDataTransaction = <T>(callback: () => T): T =>
  db.transaction(callback)();

export const countPortableMarketOrphanBars = (
  payloadDb: Database.Database,
): number =>
  Number(
    payloadDb
      .prepare(
        `SELECT COUNT(*)
           FROM portable_export_market_bars b
           LEFT JOIN portable_export_market_instruments i
             ON i.instrument_id = b.instrument_id
          WHERE i.instrument_id IS NULL`,
      )
      .pluck()
      .get() ?? 0,
  );

export const getPortableDataLocalGeneration = (): number => {
  const row = db.prepare('SELECT total_changes() AS generation').get() as {
    generation?: unknown;
  } | undefined;
  const generation = Number(row?.generation);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
};

export const beginPortableMarketSourceMutation = (input: {
  sourceId: string;
  updatedAt: string;
}): boolean =>
  db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'MUTATING_SYMBOLS', updated_at = ?
      WHERE id = ?
        AND deletion_state = 'IDLE'
        AND status = 'READY'`,
  ).run(input.updatedAt, input.sourceId).changes === 1;

export const completePortableMarketSourceMutation = (input: {
  sourceId: string;
  updatedAt: string;
}): boolean =>
  db.prepare(
    `UPDATE local_data_sources
        SET status = 'READY', deletion_state = 'IDLE', updated_at = ?
      WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`,
  ).run(input.updatedAt, input.sourceId).changes === 1;

export const failPortableMarketSourceMutation = (input: {
  sourceId: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `UPDATE local_data_sources
        SET status = 'FAILED', deletion_state = 'IDLE', updated_at = ?
      WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`,
  ).run(input.updatedAt, input.sourceId);
};

export const deletePortableImportedMarketRows = (input: {
  sourceIds: readonly string[];
  instrumentIds: readonly string[];
}): void => {
  const sourceIds = Array.from(
    new Set(
      input.sourceIds
        .map((sourceId) => String(sourceId ?? '').trim())
        .filter(Boolean),
    ),
  );
  const instrumentIds = Array.from(
    new Set(
      input.instrumentIds
        .map((instrumentId) => String(instrumentId ?? '').trim())
        .filter(Boolean),
    ),
  );
  if (!sourceIds.length && !instrumentIds.length) {
    return;
  }
  db.transaction(() => {
    sourceIds.forEach((sourceId) => {
      db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?').run(sourceId);
      db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(sourceId);
    });
    instrumentIds.forEach((instrumentId) => {
      db.prepare('DELETE FROM local_data_source_files WHERE instrument_id = ?').run(instrumentId);
      db.prepare('DELETE FROM instruments WHERE id = ?').run(instrumentId);
    });
    sourceIds.forEach((sourceId) => {
      db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
    });
  })();
};

export const getLocalSourceNameById = (
  sourceId: string,
): { name?: unknown } | undefined =>
  db
    .prepare('SELECT name FROM local_data_sources WHERE id = ? LIMIT 1')
    .get(sourceId) as { name?: unknown } | undefined;

export const insertImportedMarketSourceRow = (
  row: PortableImportedMarketSourceRow,
): void => {
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,import_scope_strategy,import_scope_top_level_subfolder,
      time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'MUTATING_SYMBOLS',?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.name,
    row.sourceFolder,
    row.sourceFolderBookmarkId,
    row.importScopeStrategy,
    row.importScopeTopLevelSubfolder,
    row.timeZone,
    row.timeZoneOrigin,
    row.baseTimeframe,
    row.fieldMappingJson,
    row.tradingCalendarJson,
    row.status,
    row.totalFiles,
    row.importedFiles,
    row.failedFiles,
    row.symbolCount,
    row.barCount,
    row.storageBytes,
    row.timeStartTs,
    row.timeEndTs,
    row.lastJobId,
    row.createdAt,
    row.updatedAt,
  );
};

export const insertImportedMarketJobRow = (
  row: PortableImportedMarketJobRow,
): void => {
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.sourceId,
    row.sourceName,
    row.timeZone,
    row.baseTimeframe,
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    row.totalFiles,
    row.doneFiles,
    row.totalRows,
    row.importedRows,
    0,
    0,
    null,
    null,
    null,
    row.createdAt,
    row.startedAt,
    row.finishedAt,
    row.updatedAt,
  );
};

export const getLocalInstrumentBinding = ({
  sourceId,
  symbol,
  baseTimeframe,
}: {
  sourceId: string;
  symbol: string;
  baseTimeframe: string;
}): PortableLocalInstrumentBindingRow | undefined =>
  db
    .prepare(
      `SELECT id, bars_version_token
         FROM instruments
        WHERE source_id = ?
          AND symbol = ?
          AND base_timeframe = ?
          AND market = 'LOCAL'
        LIMIT 1`,
    )
    .get(sourceId, symbol, baseTimeframe) as
    | PortableLocalInstrumentBindingRow
    | undefined;

export const insertLocalInstrumentRow = (
  row: PortableLocalInstrumentInsertRow,
): void => {
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.sourceId,
    row.symbol,
    row.baseTimeframe,
    row.name,
    row.market,
    row.timeZone,
    row.minTradeStep,
    row.barCount,
    row.timeStartTs,
    row.timeEndTs,
    row.barsVersionToken,
    row.createdAt,
  );
};

export const updateLocalInstrumentBarsRow = (
  row: PortableLocalInstrumentBarsUpdateRow,
): void => {
  db.prepare(
    `UPDATE instruments
        SET bars_version_token = ?,
            bar_count = ?,
            time_start_ts = ?,
            time_end_ts = ?
      WHERE id = ?`,
  ).run(
    row.barsVersionToken,
    row.barCount,
    row.timeStartTs,
    row.timeEndTs,
    row.id,
  );
};

export const insertImportedMarketFileLedgerRow = (
  row: PortableImportedMarketFileLedgerRow,
): void => {
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.sourceId,
    row.jobId,
    row.instrumentId,
    row.symbol,
    row.fileName,
    row.filePath,
    row.fileSize,
    row.fileMtimeMs,
    row.fileFingerprint,
    'IMPORTED',
    row.rowsTotal,
    row.rowsImported,
    row.rowsSkipped,
    null,
    row.createdAt,
    row.updatedAt,
  );
};

export const getCustomIndicatorProfileById = (
  id: string,
): Record<string, unknown> | undefined =>
  db
    .prepare('SELECT * FROM custom_indicator_profiles WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined;

export const getReplayNoteById = (
  id: string,
): Record<string, unknown> | undefined =>
  db
    .prepare('SELECT * FROM replay_notes WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined;

export const getTrainingProjectById = (
  id: string,
): Record<string, unknown> | undefined =>
  db
    .prepare('SELECT * FROM training_projects WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined;

export const getSpecialTrainingSessionById = (
  id: string,
): Record<string, unknown> | undefined =>
  db
    .prepare('SELECT * FROM special_training_history_sessions WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined;

export const getSpecialTrainingQuestionById = (
  id: string,
): Record<string, unknown> | undefined =>
  db
    .prepare('SELECT * FROM special_training_history_questions WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined;

export const upsertCustomIndicatorProfileRow = (
  row: PortableCustomIndicatorProfileUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO custom_indicator_profiles (
      id,name,source,parameter_inputs_json,revisions_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source = excluded.source,
      parameter_inputs_json = excluded.parameter_inputs_json,
      revisions_json = excluded.revisions_json,
      updated_at = excluded.updated_at`,
  ).run(
    row.id,
    row.name,
    row.source,
    row.parameterInputsJson,
    row.revisionsJson,
    row.createdAt,
    row.updatedAt,
  );
};

export const insertTrainingProjectRow = (
  row: PortableTrainingProjectInsertRow,
): void => {
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.name,
    row.createdAt,
    row.updatedAt,
    row.symbol,
    row.samplePoolId,
    row.samplePoolName,
    row.baseTimeframe,
    row.trainingDateRange,
    row.initialTotal,
    row.totalPnl,
    row.profitRate,
    row.durationDays,
    row.totalTrades,
    row.finalEquity,
    row.equityReturnRate,
    row.simulationBatchId,
    row.sourceTag,
    row.summaryJson,
    row.operatorSummaryJson,
  );
};

export const upsertTrainingProjectReplayRefRow = (
  row: PortableTrainingProjectReplayRefUpsertRow,
): void => {
  db.prepare(
    `INSERT OR REPLACE INTO training_project_replay_refs (
      project_id,base_timeframe,instrument_id,bars_version_token,start_ts,end_ts,entry_index,cursor_index,history_bars,settings_json,payload_blob,payload_encoding,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.projectId,
    row.baseTimeframe,
    row.instrumentId,
    row.barsVersionToken,
    row.startTs,
    row.endTs,
    row.entryIndex,
    row.cursorIndex,
    row.historyBars,
    row.settingsJson,
    row.payloadBlob,
    row.payloadEncoding,
    row.createdAt,
    row.updatedAt,
  );
};

export const replaceTrainingProjectReplayDetailRows = (
  projectId: string,
  fillRows: readonly PortableTrainingProjectReplayFillUpsertRow[],
  cashAdjustmentRows: readonly PortableTrainingProjectReplayCashAdjustmentUpsertRow[],
): void => {
  db.transaction(() => {
    db.prepare('DELETE FROM training_project_replay_fills WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM training_project_replay_cash_adjustments WHERE project_id = ?').run(projectId);
    const insertFill = db.prepare(
      `INSERT INTO training_project_replay_fills (
        project_id,fill_index,row_seq,side,fill_time,fill_price,fill_qty,contract_multiplier,fee,tax,slippage,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    fillRows.forEach((row) => {
      insertFill.run(
        row.projectId,
        row.fillIndex,
        row.rowSeq,
        row.side,
        row.fillTime,
        row.fillPrice,
        row.fillQty,
        row.contractMultiplier,
        row.fee,
        row.tax,
        row.slippage,
        row.createdAt,
      );
    });
    const insertCashAdjustment = db.prepare(
      `INSERT INTO training_project_replay_cash_adjustments (
        project_id,bar_index,row_seq,kind,amount,ts,created_at
      ) VALUES (?,?,?,?,?,?,?)`,
    );
    cashAdjustmentRows.forEach((row) => {
      insertCashAdjustment.run(
        row.projectId,
        row.barIndex,
        row.rowSeq,
        row.kind,
        row.amount,
        row.ts,
        row.createdAt,
      );
    });
  })();
};

export const insertSpecialTrainingSessionRow = (
  row: PortableSpecialTrainingSessionInsertRow,
): void => {
	  db.prepare(
	    `INSERT INTO special_training_history_sessions (
	      id,user_id,challenge_id,bank_id,bank_name,mode_id,simulation_batch_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,created_at,finished_at,updated_at
	    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	  ).run(
	    row.id,
	    DEFAULT_USER_ID,
	    row.challengeId,
	    row.bankId,
	    row.bankName,
	    row.modeId,
	    row.simulationBatchId,
	    row.sourceTag,
	    row.timeframe,
	    row.minimumBaseTimeframe,
	    row.sourceTimeframe,
	    row.questionCount,
    row.completedQuestionCount,
    row.passedQuestionCount,
    row.failedQuestionCount,
    row.missedQuestionCount,
    row.timedOutQuestionCount,
    row.decisionSecondsTotal,
    row.decisionSecondsAverage,
    row.maxConsecutivePasses,
    row.configJson,
    row.sessionSummaryJson,
    row.operatorSummaryJson,
    row.createdAt,
    row.finishedAt,
    row.updatedAt,
  );
};

export const insertSpecialTrainingQuestionRow = (
  row: PortableSpecialTrainingQuestionInsertRow,
): void => {
	  db.prepare(
	    `INSERT INTO special_training_history_questions (
	      id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,minimum_base_timeframe,instrument_id,bars_version_token,window_start_ts,window_end_ts,window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,settlement_status,score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,max_drawdown_ratio,performance_rate,grade,detail_blob,detail_encoding,detail_expired_at,created_at,settled_at,updated_at
	    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	  ).run(
	    row.id,
    row.sessionId,
    row.questionOrder,
    row.modeId,
	    row.sourceTag,
	    row.symbol,
	    row.baseTimeframe,
	    row.effectiveTimeframe,
	    row.minimumBaseTimeframe,
	    row.instrumentId,
	    row.barsVersionToken,
	    row.windowStartTs,
	    row.windowEndTs,
	    row.windowBarCount,
	    row.sourceWindowBarCount,
	    row.startIndex,
    row.endIndex,
    row.minTradeStep,
    row.settlementStatus,
    row.score,
    row.passed,
    row.initialTotal,
    row.totalPnl,
    row.finalTotalAsset,
    row.returnRate,
    row.usedOperations,
    row.maxOperations,
    row.maxDrawdownRatio,
    row.performanceRate,
	    row.grade,
	    row.detailBlob,
	    row.detailEncoding,
	    row.detailExpiredAt,
	    row.createdAt,
    row.settledAt,
    row.updatedAt,
  );
};

export const insertReplayNoteRow = (
  row: PortableReplayNoteInsertRow,
): void => {
	  db.prepare(
	    `INSERT INTO replay_notes (
	      id,title,type,simulation_batch_id,source_kind,source_id,content_preview,training_project_id,context_display_period,has_context_replay,context_expired_at,context_session_id,context_cursor_index,created_at,updated_at
	    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	  ).run(
    row.id,
    row.title,
    row.type,
    row.simulationBatchId,
    row.sourceKind,
    row.sourceId,
    row.contentPreview,
    row.trainingProjectId,
	    row.contextDisplayPeriod,
	    row.hasContextReplay,
	    row.contextExpiredAt,
	    row.contextSessionId,
    row.contextCursorIndex,
    row.createdAt,
    row.updatedAt,
  );
};

export const insertReplayNoteContentRow = (
  row: PortableReplayNoteContentInsertRow,
): void => {
  db.prepare(
    `INSERT INTO replay_note_contents (
      note_id,document_schema_version,document_encoding,document_payload,document_hash,
      content_preview,text_chars,payload_bytes,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.noteId,
    row.documentSchemaVersion,
    row.documentEncoding,
    row.documentPayload,
    row.documentHash,
    row.contentPreview,
    row.textChars,
    row.payloadBytes,
    row.updatedAt,
  );
};

export const upsertReplayNoteAttachmentRow = (
  row: PortableReplayNoteAttachmentUpsertRow,
): void => {
  db.prepare(
    `INSERT OR REPLACE INTO replay_note_attachments (
      note_id,attachment_ref_id,attachment_kind,summary_json,ref_kind,ref_id,
      payload_encoding,payload_blob,source_bytes,payload_bytes,sort_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.noteId,
    row.attachmentRefId,
    row.attachmentKind,
    row.summaryJson,
    row.refKind,
    row.refId,
    row.payloadEncoding,
    row.payloadBlob,
    row.sourceBytes,
    row.payloadBytes,
    row.sortIndex,
    row.createdAt,
    row.updatedAt,
  );
};

export const insertReplayNoteMetaRow = (
  row: PortableReplayNoteMetaInsertRow,
): void => {
  db.prepare(
    `INSERT INTO replay_note_meta (
      note_id,meta_json,meta_summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?)`,
  ).run(
    row.noteId,
    row.metaJson,
    row.metaSummaryJson,
    row.createdAt,
    row.updatedAt,
  );
};

export const upsertReplayNoteColorRow = (
  row: PortableReplayNoteColorUpsertRow,
): void => {
  db.prepare(
    `INSERT OR REPLACE INTO replay_note_colors (
      note_id,color_token,sort_index,created_at,updated_at
    ) VALUES (?,?,?,?,?)`,
  ).run(
    row.noteId,
    row.colorToken,
    row.sortIndex,
    row.createdAt,
    row.updatedAt,
  );
};

export const upsertReplayNoteContextArchiveRow = (
  row: PortableReplayNoteContextArchiveUpsertRow,
): void => {
  db.prepare(
    `INSERT OR REPLACE INTO replay_note_context_archives (
      note_id,archive_encoding,archive_payload,source_bytes,archive_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    row.noteId,
    row.archiveEncoding,
    row.archivePayload,
    row.sourceBytes,
    row.archiveBytes,
    row.createdAt,
    row.updatedAt,
  );
};

export const upsertReplayNoteContextRefRow = (
  row: PortableReplayNoteContextRefUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO replay_note_context_refs (
      note_id,training_project_id,context_cursor_index,window_bars,created_at,updated_at
    ) VALUES (?,?,?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      training_project_id = excluded.training_project_id,
      context_cursor_index = excluded.context_cursor_index,
      window_bars = excluded.window_bars,
      updated_at = excluded.updated_at`,
  ).run(
    row.noteId,
    row.trainingProjectId,
    row.contextCursorIndex,
    row.windowBars,
    row.createdAt,
    row.updatedAt,
  );
};

export const upsertReplayNoteSpecialTrainingContextRefRow = (
  row: PortableReplayNoteSpecialTrainingContextRefUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO replay_note_special_training_context_refs (
      note_id,question_id,created_at,updated_at
    ) VALUES (?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      question_id = excluded.question_id,
      updated_at = excluded.updated_at`,
  ).run(row.noteId, row.questionId, row.createdAt, row.updatedAt);
};
