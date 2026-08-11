// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export const dataSourceRepository = {
  insertSourceStmt: db.prepare(
    `INSERT INTO local_data_sources (
        id,name,source_folder,source_folder_bookmark_id,import_scope_strategy,import_scope_top_level_subfolder,
        time_zone,time_zone_origin,base_timeframe,diagnostic_asset_class,diagnostic_market_preset_id,diagnostic_profile_origin,field_mapping_json,trading_calendar_json,status,
        total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ),
  insertJobStmt: db.prepare(
      `INSERT INTO local_data_import_jobs (
        id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
        compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
        total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
        error_message,outcome_summary_json,symbol_limit_json,created_at,started_at,finished_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ),
  insertFileStmt: db.prepare(
    `INSERT INTO local_data_source_files (
        id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
        rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ),
  updateFileImportingStmt: db.prepare(
    `UPDATE local_data_source_files
        SET status = ?, rows_total = ?, rows_imported = ?, rows_skipped = ?, error_message = NULL, updated_at = ?
      WHERE id = ?`
  ),
  updateFileProgressStmt: db.prepare(
    `UPDATE local_data_source_files
        SET rows_total = ?, rows_imported = ?, rows_skipped = ?, updated_at = ?
      WHERE id = ?`
  ),
  updateFileImportedStmt: db.prepare(
    `UPDATE local_data_source_files
        SET status = ?, instrument_id = ?, rows_total = ?, rows_imported = ?, rows_skipped = ?, error_message = NULL, updated_at = ?
      WHERE id = ?`
  ),
  updateFileFailedStmt: db.prepare(
    `UPDATE local_data_source_files
        SET status = ?, rows_total = ?, rows_imported = ?, rows_skipped = ?, error_message = ?, updated_at = ?
      WHERE id = ?`
  ),
  updateFileFailureDetailsStmt: db.prepare(
    `UPDATE local_data_source_files
        SET error_code = ?,
            error_cause_json = ?,
            error_details_json = ?,
            diagnostics_json = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  updateSourceStatusStmt: db.prepare(
    `UPDATE local_data_sources
        SET status = ?, updated_at = ?
      WHERE id = ?`
  ),
  beginSourceDeletionStmt: db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'DELETING', updated_at = ?
      WHERE id = ? AND deletion_state = 'IDLE'`
  ),
  beginSourceSymbolMutationStmt: db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'MUTATING_SYMBOLS', updated_at = ?
      WHERE id = ?
        AND deletion_state = 'IDLE'
        AND status IN ('READY', 'FAILED')`
  ),
  updateSourceSymbolMutationSummaryStmt: db.prepare(
    `UPDATE local_data_sources
        SET status = 'READY', total_files = ?, imported_files = ?, failed_files = 0,
            symbol_count = ?, bar_count = ?, storage_bytes = ?, time_start_ts = ?, time_end_ts = ?,
            updated_at = ?
      WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`
  ),
  completeSourceSymbolMutationStmt: db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'IDLE', updated_at = ?
      WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`
  ),
  markSourceSymbolMutationFailedStmt: db.prepare(
    `UPDATE local_data_sources
        SET status = 'FAILED', deletion_state = 'IDLE', updated_at = ?
      WHERE id = ? AND deletion_state = 'MUTATING_SYMBOLS'`
  ),
  recoverInterruptedSourceSymbolMutationsStmt: db.prepare(
    `UPDATE local_data_sources
        SET status = 'FAILED', deletion_state = 'IDLE', updated_at = ?
      WHERE deletion_state = 'MUTATING_SYMBOLS'`
  ),
  updateSourceFinalStmt: db.prepare(
    `UPDATE local_data_sources
        SET status = ?, total_files = ?, imported_files = ?, failed_files = ?,
            symbol_count = ?, bar_count = ?, storage_bytes = ?, time_start_ts = ?, time_end_ts = ?,
            deletion_state = 'IDLE', updated_at = ?
      WHERE id = ?`
  ),
  updateSourceStorageBytesStmt: db.prepare(
    `UPDATE local_data_sources
        SET storage_bytes = ?, updated_at = ?
      WHERE id = ?`
  ),
  updateSourceProjectionSummaryStmt: db.prepare(
    `UPDATE local_data_sources
        SET symbol_count = ?,
            bar_count = ?,
            time_start_ts = ?,
            time_end_ts = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  updateSourceImportScopeStmt: db.prepare(
    `UPDATE local_data_sources
        SET import_scope_strategy = ?,
            import_scope_top_level_subfolder = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  markAllSourcesDeletingIfIdleStmt: db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'DELETING',
            updated_at = ?
      WHERE NOT EXISTS (
        SELECT 1
          FROM local_data_sources AS active_mutation
         WHERE active_mutation.deletion_state <> 'IDLE'
      )`
  ),
  updateSourceForSyncImportStmt: db.prepare(
    `UPDATE local_data_sources
        SET name = ?,
            source_folder = ?,
            source_folder_bookmark_id = ?,
            import_scope_strategy = ?,
            import_scope_top_level_subfolder = ?,
            time_zone = ?,
            time_zone_origin = ?,
            base_timeframe = ?,
            diagnostic_asset_class = ?,
            diagnostic_market_preset_id = ?,
            diagnostic_profile_origin = ?,
            field_mapping_json = ?,
            trading_calendar_json = ?,
            status = 'IMPORTING',
            deletion_state = 'IDLE',
            total_files = ?,
            imported_files = 0,
            failed_files = 0,
            symbol_count = 0,
            bar_count = 0,
            storage_bytes = 0,
            time_start_ts = NULL,
            time_end_ts = NULL,
            last_job_id = ?,
            updated_at = ?
      WHERE id = ? AND deletion_state = 'IDLE'`
  ),
  updateSourceDiagnosticProfileStmt: db.prepare(
    `UPDATE local_data_sources
        SET diagnostic_asset_class = ?,
            diagnostic_market_preset_id = ?,
            diagnostic_profile_origin = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  updateSourceTradingCalendarStmt: db.prepare(
    `UPDATE local_data_sources
        SET trading_calendar_json = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  updateSourceForIncrementalImportStmt: db.prepare(
    `UPDATE local_data_sources
        SET source_folder = COALESCE(?, source_folder),
            source_folder_bookmark_id = COALESCE(?, source_folder_bookmark_id),
            status = 'IMPORTING',
            deletion_state = 'IDLE',
            last_job_id = ?,
            updated_at = ?
      WHERE id = ? AND deletion_state = 'IDLE'`
  ),
  updateJobRunningStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET status = ?, stage = ?, progress_percent = ?, compact_progress_percent = 0,
            compact_before_bytes = 0, compact_after_bytes = 0, compact_reclaimed_bytes = 0, current_file_name = ?,
            started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ?`
  ),
  updateJobProgressStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET stage = ?, progress_percent = ?, done_files = ?, total_rows = ?, imported_rows = ?, skipped_rows = ?,
            error_files = ?, current_file_name = ?, updated_at = ?
      WHERE id = ?`
  ),
  updateJobCompactingProgressStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET stage = ?, progress_percent = ?, compact_progress_percent = ?,
            done_files = ?, total_rows = ?, imported_rows = ?, skipped_rows = ?, error_files = ?,
            current_file_name = NULL, updated_at = ?
      WHERE id = ?`
  ),
  updateJobCompactionResultStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET compact_progress_percent = 100,
            compact_before_bytes = ?,
            compact_after_bytes = ?,
            compact_reclaimed_bytes = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  updateJobCompactionBaselineStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET compact_before_bytes = ?,
            compact_after_bytes = 0,
            compact_reclaimed_bytes = 0,
            updated_at = ?
      WHERE id = ?`
  ),
  updateJobFinalStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET status = ?, stage = ?, progress_percent = ?, done_files = ?, total_rows = ?, imported_rows = ?, skipped_rows = ?,
            error_files = ?, current_file_name = NULL, error_message = ?, outcome_summary_json = ?, finished_at = ?, updated_at = ?
      WHERE id = ?`
  ),
  updateJobFailureDetailsStmt: db.prepare(
    `UPDATE local_data_import_jobs
        SET error_code = ?,
            error_cause_json = ?,
            error_details_json = ?,
            failure_summary_json = ?,
            updated_at = ?
      WHERE id = ?`
  ),
  listSourcesStmt: db.prepare(
    `SELECT s.id,
            s.name,
            s.source_folder AS sourceFolder,
            s.source_folder_bookmark_id AS sourceFolderBookmarkId,
            s.import_scope_strategy AS importScopeStrategy,
            s.import_scope_top_level_subfolder AS importScopeTopLevelSubfolder,
            s.time_zone AS timeZone,
            s.time_zone_origin AS timeZoneOrigin,
            s.base_timeframe AS baseTimeframe,
            s.diagnostic_asset_class AS diagnosticAssetClass,
            s.diagnostic_market_preset_id AS diagnosticMarketPresetId,
            s.diagnostic_profile_origin AS diagnosticProfileOrigin,
            s.field_mapping_json AS fieldMappingJson,
            s.trading_calendar_json AS tradingCalendarJson,
            s.status,
            s.deletion_state AS deletionState,
            s.symbol_count AS symbolCount,
            s.bar_count AS barCount,
            s.storage_bytes AS storageBytes,
            s.time_start_ts AS timeStartTs,
            s.time_end_ts AS timeEndTs,
            s.total_files AS totalFiles,
            s.imported_files AS importedFiles,
            s.failed_files AS failedFiles,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            j.id AS lastJobId,
            j.status AS lastJobStatus,
            j.stage AS lastJobStage,
            j.progress_percent AS lastJobProgressPercent,
            j.compact_progress_percent AS lastJobCompactProgressPercent,
            j.compact_before_bytes AS lastJobCompactBeforeBytes,
            j.compact_after_bytes AS lastJobCompactAfterBytes,
            j.compact_reclaimed_bytes AS lastJobCompactReclaimedBytes,
            j.done_files AS lastJobDoneFiles,
            j.total_files AS lastJobTotalFiles,
            j.error_files AS lastJobErrorFiles,
            j.started_at AS lastJobStartedAt,
            j.finished_at AS lastJobFinishedAt
       FROM local_data_sources s
       LEFT JOIN local_data_import_jobs j ON j.id = s.last_job_id
      ORDER BY s.updated_at DESC, s.created_at DESC`
  ),
  listTrainingPoolCatalogStmt: db.prepare(
    `SELECT s.id,
            s.name,
            s.base_timeframe AS baseTimeframe,
            s.diagnostic_asset_class AS diagnosticAssetClass,
            s.diagnostic_market_preset_id AS diagnosticMarketPresetId,
            s.status,
            s.deletion_state AS deletionState,
            COUNT(i.id) AS symbolCount,
            COALESCE(SUM(CASE WHEN COALESCE(i.bar_count, 0) >= 2 THEN 1 ELSE 0 END), 0) AS trainableSymbolCount
       FROM local_data_sources s
       LEFT JOIN instruments i
         ON i.source_id = s.id
        AND i.market = 'LOCAL'
        AND i.base_timeframe = s.base_timeframe
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.created_at DESC`
  ),
  getJobStmt: db.prepare(
    `SELECT j.id,
            j.source_id AS sourceId,
            j.source_name AS sourceName,
            j.time_zone AS timeZone,
            j.base_timeframe AS baseTimeframe,
            j.job_mode AS jobMode,
            j.status,
            j.stage,
            j.progress_percent AS progressPercent,
            j.compact_progress_percent AS compactProgressPercent,
            j.compact_before_bytes AS compactBeforeBytes,
            j.compact_after_bytes AS compactAfterBytes,
            j.compact_reclaimed_bytes AS compactReclaimedBytes,
            j.total_files AS totalFiles,
            j.done_files AS doneFiles,
            j.total_rows AS totalRows,
            j.imported_rows AS importedRows,
            j.skipped_rows AS skippedRows,
            j.error_files AS errorFiles,
            j.current_file_name AS currentFileName,
            j.error_message AS errorMessage,
            j.error_code AS errorCode,
            j.error_cause_json AS errorCauseJson,
            j.error_details_json AS errorDetailsJson,
            j.failure_summary_json AS failureSummaryJson,
            j.outcome_summary_json AS outcomeSummaryJson,
            j.symbol_limit_json AS symbolLimitJson,
            j.created_at AS createdAt,
            j.started_at AS startedAt,
            j.finished_at AS finishedAt
       FROM local_data_import_jobs j
      WHERE j.id = ?`
  ),
  getJobStatusStmt: db.prepare(
    `SELECT id,
            source_id AS sourceId,
            status
       FROM local_data_import_jobs
      WHERE id = ?`
  ),
  listFailedFilesByJobStmt: db.prepare(
    `SELECT id,
            file_name AS fileName,
            symbol,
            rows_total AS rowsTotal,
            rows_imported AS rowsImported,
            rows_skipped AS rowsSkipped,
            error_message AS errorMessage,
            error_code AS errorCode,
            error_cause_json AS errorCauseJson,
            error_details_json AS errorDetailsJson,
            diagnostics_json AS diagnosticsJson,
            updated_at AS updatedAt
       FROM local_data_source_files
      WHERE job_id = ? AND status = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 120`
  ),
  getSourceByIdStmt: db.prepare(
    `SELECT id
       FROM local_data_sources
      WHERE id = ?
      LIMIT 1`
  ),
  getSourceBaseTimeframeByIdStmt: db.prepare(
    `SELECT id,
            base_timeframe AS baseTimeframe,
            time_zone AS timeZone,
            trading_calendar_json AS tradingCalendarJson,
            diagnostic_asset_class AS diagnosticAssetClass,
            diagnostic_market_preset_id AS diagnosticMarketPresetId,
            diagnostic_profile_origin AS diagnosticProfileOrigin
       FROM local_data_sources
      WHERE id = ?
      LIMIT 1`
  ),
  getSourceDiagnosticsCacheStmt: db.prepare(
    `SELECT source_id AS sourceId,
            base_timeframe AS baseTimeframe,
            diagnostics_json AS diagnosticsJson,
            generated_at AS generatedAt
       FROM local_data_source_diagnostics
      WHERE source_id = ?
      LIMIT 1`
  ),
  getSourceSymbolDiagnosticsCacheStmt: db.prepare(
    `SELECT source_id AS sourceId,
            instrument_id AS instrumentId,
            symbol,
            base_timeframe AS baseTimeframe,
            diagnostics_json AS diagnosticsJson,
            generated_at AS generatedAt
       FROM local_data_source_symbol_diagnostics
      WHERE source_id = ?
        AND symbol = ?
      LIMIT 1`
  ),
  upsertSourceDiagnosticsCacheStmt: db.prepare(
    `INSERT INTO local_data_source_diagnostics
      (source_id, base_timeframe, diagnostics_json, generated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       base_timeframe = excluded.base_timeframe,
       diagnostics_json = excluded.diagnostics_json,
       generated_at = excluded.generated_at`
  ),
  upsertSourceSymbolDiagnosticsCacheStmt: db.prepare(
    `INSERT INTO local_data_source_symbol_diagnostics
      (source_id, instrument_id, symbol, base_timeframe, diagnostics_json, generated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id, instrument_id) DO UPDATE SET
       symbol = excluded.symbol,
       base_timeframe = excluded.base_timeframe,
       diagnostics_json = excluded.diagnostics_json,
       generated_at = excluded.generated_at`
  ),
  deleteSourceDiagnosticsCacheStmt: db.prepare(
    `DELETE FROM local_data_source_diagnostics
      WHERE source_id = ?`
  ),
  deleteSourceSymbolDiagnosticsCacheBySourceStmt: db.prepare(
    `DELETE FROM local_data_source_symbol_diagnostics
      WHERE source_id = ?`
  ),
  deleteAllSourceDiagnosticsCacheStmt: db.prepare(
    `DELETE FROM local_data_source_diagnostics`
  ),
  deleteAllSourceSymbolDiagnosticsCacheStmt: db.prepare(
    `DELETE FROM local_data_source_symbol_diagnostics`
  ),
  getSourceImportConfigByIdStmt: db.prepare(
    `SELECT id,
            name,
            source_folder AS sourceFolder,
            source_folder_bookmark_id AS sourceFolderBookmarkId,
            import_scope_strategy AS importScopeStrategy,
            import_scope_top_level_subfolder AS importScopeTopLevelSubfolder,
            time_zone AS timeZone,
            time_zone_origin AS timeZoneOrigin,
            trading_calendar_json AS tradingCalendarJson,
            diagnostic_asset_class AS diagnosticAssetClass,
            diagnostic_market_preset_id AS diagnosticMarketPresetId,
            diagnostic_profile_origin AS diagnosticProfileOrigin
       FROM local_data_sources
      WHERE id = ?
      LIMIT 1`
  ),
  getSourceSyncQuickCheckByIdStmt: db.prepare(
    `SELECT id,
            name,
            source_folder AS sourceFolder,
            import_scope_strategy AS importScopeStrategy,
            import_scope_top_level_subfolder AS importScopeTopLevelSubfolder,
            base_timeframe AS baseTimeframe,
            status
       FROM local_data_sources
      WHERE id = ?
      LIMIT 1`
  ),
  getImportedSourceSymbolStmt: db.prepare(
    `SELECT symbol,
            instrument_id AS instrumentId
       FROM local_data_source_files
      WHERE source_id = ?
        AND symbol = ?
        AND rows_imported > 0
      LIMIT 1`
  ),
  listAllFilePathsStmt: db.prepare(
    `SELECT DISTINCT file_path AS filePath
       FROM local_data_source_files
      WHERE file_path IS NOT NULL
        AND TRIM(file_path) <> ''`
  ),
  listActiveFilePathsStmt: db.prepare(
    `SELECT DISTINCT f.file_path AS filePath
       FROM local_data_source_files f
       INNER JOIN local_data_import_jobs j ON j.id = f.job_id
      WHERE j.status IN ('QUEUED', 'RUNNING')
        AND f.status IN (?, ?)
        AND f.file_path IS NOT NULL
        AND TRIM(f.file_path) <> ''`
  ),
  listImportedSymbolsBySourceStmt: db.prepare(
    `SELECT DISTINCT symbol
       FROM local_data_source_files
      WHERE source_id = ? AND rows_imported > 0`
  ),
  listImportedSourceSymbolOrderRowsStmt: db.prepare(
    `SELECT source_id AS sourceId,
            symbol,
            MIN(created_at) AS firstCreatedAt
       FROM local_data_source_files
      WHERE rows_imported > 0
      GROUP BY source_id, symbol
      ORDER BY source_id ASC, MIN(created_at) ASC, symbol ASC`
  ),
  listLatestImportedFileMetaBySourceStmt: db.prepare(
    `SELECT symbol,
            instrument_id AS instrumentId,
            file_name AS fileName,
            file_path AS filePath,
            file_size AS fileSize,
            file_mtime_ms AS fileMtimeMs,
            file_fingerprint AS fileFingerprint
       FROM (
         SELECT symbol,
                instrument_id,
                file_name,
                file_path,
                file_size,
                file_mtime_ms,
                file_fingerprint,
                ROW_NUMBER() OVER (
                  PARTITION BY source_id, symbol
                  ORDER BY updated_at DESC, created_at DESC, id DESC
                ) AS row_rank
           FROM local_data_source_files
          WHERE source_id = ?
            AND status = 'IMPORTED'
            AND instrument_id IS NOT NULL
       ) ranked
      WHERE row_rank = 1`
  ),
  listLatestSourceFileLedgerRowsStmt: db.prepare(
    `SELECT source_id AS sourceId,
            instrument_id AS instrumentId,
            symbol,
            file_name AS fileName,
            file_path AS filePath,
            status,
            rows_imported AS rowsImported
       FROM (
         SELECT source_id,
                instrument_id,
                symbol,
                file_name,
                file_path,
                status,
                rows_imported,
                ROW_NUMBER() OVER (
                  PARTITION BY source_id, COALESCE(NULLIF(TRIM(file_path), ''), NULLIF(TRIM(file_name), ''), symbol)
                  ORDER BY updated_at DESC, created_at DESC, id DESC
                ) AS row_rank
           FROM local_data_source_files
       ) ranked
      WHERE row_rank = 1`
  ),
  listAllImportedSourceSymbolsStmt: db.prepare(
    `SELECT source_id AS sourceId, symbol
       FROM local_data_source_files
      WHERE rows_imported > 0
      GROUP BY source_id, symbol`
  ),
  listAllImportedSourceInstrumentsStmt: db.prepare(
    `SELECT f.source_id AS sourceId,
            f.instrument_id AS instrumentId,
            i.symbol AS symbol,
            i.base_timeframe AS baseTimeframe,
            i.time_start_ts AS timeStartTs,
            i.time_end_ts AS timeEndTs,
            i.bar_count AS barCount,
            i.source_id AS instrumentSourceId,
            s.name AS sourceName
       FROM local_data_source_files f
       INNER JOIN instruments i ON i.id = f.instrument_id
       LEFT JOIN local_data_sources s ON s.id = i.source_id
      WHERE f.rows_imported > 0
        AND i.market = 'LOCAL'
      GROUP BY f.source_id, f.instrument_id`
  ),
  listFilePathsBySourceStmt: db.prepare(
    `SELECT DISTINCT file_path AS filePath
       FROM local_data_source_files
      WHERE source_id = ?
        AND file_path IS NOT NULL
        AND TRIM(file_path) <> ''`
  ),
  countActiveJobsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs
      WHERE status IN ('QUEUED', 'RUNNING')`
  ),
  countRunningJobsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs
      WHERE status = 'RUNNING'`
  ),
  countActiveJobsBySourceStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs
      WHERE source_id = ?
        AND status IN ('QUEUED', 'RUNNING')`
  ),
  listActiveJobsDetailStmt: db.prepare(
    `SELECT j.id,
            j.source_id AS sourceId,
            j.status,
            j.stage,
            j.total_files AS totalFiles,
            j.done_files AS doneFiles,
            j.total_rows AS totalRows,
            j.imported_rows AS importedRows,
            j.skipped_rows AS skippedRows,
            j.error_files AS errorFiles,
            s.status AS sourceStatus
       FROM local_data_import_jobs j
       LEFT JOIN local_data_sources s ON s.id = j.source_id
      WHERE j.status IN ('QUEUED', 'RUNNING')`
  ),
  summarizeJobFilesStmt: db.prepare(
    `SELECT COUNT(*) AS totalFiles,
            SUM(CASE WHEN status = 'IMPORTED' THEN 1 ELSE 0 END) AS importedFiles,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failedFiles
       FROM local_data_source_files
      WHERE job_id = ?`
  ),
  failActiveFilesByJobStmt: db.prepare(
    `UPDATE local_data_source_files
        SET status = ?,
            error_message = ?,
            updated_at = ?
      WHERE job_id = ?
        AND status IN (?, ?)`
  ),
  countImportedSymbolOnOtherSourcesStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_files f
      WHERE f.source_id <> ?
        AND f.instrument_id = ?
        AND f.rows_imported > 0`
  ),
  listLocalInstrumentsStmt: db.prepare(
    `SELECT id
       FROM instruments
      WHERE market = 'LOCAL'`
  ),
  listLocalInstrumentIdsBySourceStmt: db.prepare(
    `SELECT id
       FROM instruments
      WHERE market = 'LOCAL'
        AND source_id = ?`
  ),
  getLocalInstrumentBySymbolStmt: db.prepare(
    `SELECT id,
            source_id AS sourceId,
            time_zone AS timeZone
       FROM instruments
      WHERE source_id = ?
        AND symbol = ?
        AND base_timeframe = ?
        AND market = 'LOCAL'
      LIMIT 1`
  ),
  updateLocalInstrumentTimeZoneStmt: db.prepare(
    `UPDATE instruments
        SET time_zone = ?
      WHERE id = ?`
  ),
  insertLocalInstrumentStmt: db.prepare(
    `INSERT INTO instruments
      (id, source_id, symbol, base_timeframe, name, market, time_zone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  listLocalInstrumentSummaryRowsBySourceStmt: db.prepare(
    `SELECT symbol,
            bar_count AS barCount,
            time_start_ts AS timeStartTs,
            time_end_ts AS timeEndTs
       FROM instruments
      WHERE market = 'LOCAL'
        AND source_id = ?`
  ),
  sumLocalInstrumentBarCountStmt: db.prepare(
    `SELECT COALESCE(SUM(bar_count), 0) AS totalBarCount
       FROM instruments
      WHERE market = 'LOCAL'`
  ),
  countLocalSourcesStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_sources`
  ),
  countLocalSourceFilesStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_files`
  ),
  countLocalImportJobsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs`
  ),
  countLocalInstrumentsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM instruments
      WHERE market = 'LOCAL'`
  ),
  countLocalSourceDiagnosticsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_diagnostics`
  ),
  countLocalSourceSymbolDiagnosticsStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_symbol_diagnostics`
  ),
  countSourceByIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_sources
      WHERE id = ?`
  ),
  countSourceFilesBySourceIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_files
      WHERE source_id = ?`
  ),
  countSourceFilesBySourceSymbolStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_files
      WHERE source_id = ?
        AND symbol = ?`
  ),
  countImportJobsBySourceIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs
      WHERE source_id = ?`
  ),
  countLocalInstrumentsBySourceIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM instruments
      WHERE market = 'LOCAL'
        AND source_id = ?`
  ),
  countLocalInstrumentsBySourceSymbolStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM instruments
      WHERE market = 'LOCAL'
        AND source_id = ?
        AND symbol = ?`
  ),
  countSourceDiagnosticsBySourceIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_diagnostics
      WHERE source_id = ?`
  ),
  countSourceSymbolDiagnosticsBySourceIdStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_symbol_diagnostics
      WHERE source_id = ?`
  ),
  countSourceSymbolDiagnosticsBySourceSymbolStmt: db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_source_symbol_diagnostics
      WHERE source_id = ?
        AND symbol = ?`
  ),
  getSourceStoredSummaryByIdStmt: db.prepare(
    `SELECT symbol_count AS symbolCount,
            bar_count AS barCount
       FROM local_data_sources
      WHERE id = ?`
  ),
  listLocalInstrumentConsistencyRowsBySourceStmt: db.prepare(
    `SELECT id,
            symbol,
            bar_count AS barCount
       FROM instruments
      WHERE market = 'LOCAL'
        AND source_id = ?`
  ),
  listSystemInstrumentsBySymbolStmt: db.prepare(
    `SELECT id,
            symbol,
            bar_count AS barCount,
            time_start_ts AS timeStartTs,
            time_end_ts AS timeEndTs,
            bars_version_token AS barsVersionToken
       FROM instruments
      WHERE symbol = ?
        AND base_timeframe = ?
        AND market = 'SYSTEM'
      LIMIT 1`
  ),
  upsertSystemInstrumentStmt: db.prepare(
    `INSERT INTO instruments
      (id, symbol, base_timeframe, name, market, time_zone, min_trade_step, bar_count, time_start_ts, time_end_ts, bars_version_token, created_at)
     VALUES (?, ?, ?, ?, 'SYSTEM', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol, base_timeframe) WHERE market = 'SYSTEM' DO UPDATE SET
       name = excluded.name,
       market = 'SYSTEM',
       time_zone = excluded.time_zone,
       min_trade_step = excluded.min_trade_step,
       bar_count = excluded.bar_count,
       time_start_ts = excluded.time_start_ts,
       time_end_ts = excluded.time_end_ts,
       bars_version_token = excluded.bars_version_token`
  ),
  updateInstrumentBarCountStmt: db.prepare('UPDATE instruments SET bar_count = ? WHERE id = ?'),
  deleteLocalSourceFilesStmt: db.prepare('DELETE FROM local_data_source_files'),
  deleteLocalImportJobsStmt: db.prepare('DELETE FROM local_data_import_jobs'),
  deleteLocalSourcesStmt: db.prepare('DELETE FROM local_data_sources'),
  deleteLocalInstrumentsStmt: db.prepare(`DELETE FROM instruments WHERE market = 'LOCAL'`),
  deleteSourceFilesBySourceIdStmt: db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?'),
  deleteSourceFilesBySourceSymbolStmt: db.prepare('DELETE FROM local_data_source_files WHERE source_id = ? AND symbol = ?'),
  deleteSourceFilesBySourceSymbolExceptJobStmt: db.prepare(
    'DELETE FROM local_data_source_files WHERE source_id = ? AND symbol = ? AND job_id <> ?'
  ),
  deleteSourceFilesBySourceExceptJobStmt: db.prepare(
    'DELETE FROM local_data_source_files WHERE source_id = ? AND job_id <> ?'
  ),
  deleteImportJobsBySourceIdStmt: db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?'),
  deleteSourceByIdStmt: db.prepare('DELETE FROM local_data_sources WHERE id = ?'),
  deleteInstrumentByIdStmt: db.prepare('DELETE FROM instruments WHERE id = ?')
};
