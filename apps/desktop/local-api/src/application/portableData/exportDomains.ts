// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import {
  getMarketBarsByInstrumentIdRange,
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  ensureReplayNoteContextArchivesForNotes,
} from '../replayNoteService.js';
import {
  getSpecialTrainingHistoryQuestionDetailById,
} from '../ports/infrastructure/db/specialTraining/historyStore.js';
import {
  getReplayNoteExportBundleRows,
  listCustomIndicatorRowsForExport,
  listReplayNoteRowsForExport,
  listSpecialTrainingQuestionRowsForSessionIds,
  listSpecialTrainingSessionRowsForExport,
  listTrainingProjectReplayCashAdjustmentRowsForExport,
  listTrainingProjectReplayFillRowsForExport,
  listTrainingProjectRowsForExport,
  getTrainingProjectReplayRefRow,
  insertPortablePayloadMarketBarRows,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';
import { loadTrainingProjectReplayWindowFromRef } from '../ports/infrastructure/db/history/replayRefStore.js';
import { nowIso } from '../../kernel/time.js';
import { Buffer } from 'node:buffer';

import type {
  ExportNoteBundle,
  ExportTrainingProjectBundle,
  ExportSpecialTrainingSessionBundle,
  ExportSpecialTrainingQuestionBundle,
} from './types.js';

import {
  normalizeText,
  applyRangeWhere,
  sanitizeSettingsBundle,
  insertPayloadRow,
  PORTABLE_HISTORY_EXPORT_BATCH_SIZE,
} from './helpers.js';

import { listPortableMarketSourceBundles } from './exportBundles.js';
import { buildPortableMarketPayloadFingerprint } from './marketPayloadFingerprint.js';

import type {
  PortableDateRangeFilter,
  PortableMarketSourcePreview,
} from '../portableDataModel.js';

export const exportNotesDomain = async (
  payloadDb: Database.Database,
  range: PortableDateRangeFilter,
): Promise<number> => {
  const where = applyRangeWhere('n.updated_at', range);
  let exported = 0;
  let offset = 0;
  while (true) {
    const noteRows = listReplayNoteRowsForExport(
      where,
      PORTABLE_HISTORY_EXPORT_BATCH_SIZE,
      offset,
    );
    if (!noteRows.length) {
      break;
    }
    const hydratedNoteIds = new Set(
      await ensureReplayNoteContextArchivesForNotes(
        noteRows.map((noteRow) => normalizeText(noteRow.id)),
      ),
    );
    noteRows.forEach((rawNoteRow) => {
      const noteId = normalizeText(rawNoteRow.id);
      const noteRow = hydratedNoteIds.has(noteId)
        ? {
            ...rawNoteRow,
            has_context_replay: 1,
            context_expired_at: null,
          }
        : rawNoteRow;
      const { content: contentRow, meta, colors, attachments: attachmentRows, contextArchive: contextArchiveRow } =
        getReplayNoteExportBundleRows(noteId);
      const content = contentRow
        ? {
            ...contentRow,
            document_payload: Buffer.isBuffer(contentRow.document_payload)
              ? Buffer.from(contentRow.document_payload).toString('base64')
              : null,
          }
        : null;
      const attachments = attachmentRows.map((attachmentRow) => ({
        ...attachmentRow,
        payload_blob: Buffer.isBuffer(attachmentRow.payload_blob)
          ? Buffer.from(attachmentRow.payload_blob).toString('base64')
          : null,
      }));
      const contextArchive = contextArchiveRow
        ? {
            ...contextArchiveRow,
            archive_payload: Buffer.isBuffer(contextArchiveRow.archive_payload)
              ? Buffer.from(contextArchiveRow.archive_payload).toString('base64')
              : null,
          }
        : null;
      insertPayloadRow(
        payloadDb,
        'portable_export_notes',
        'id',
        noteId,
        {
          note: noteRow,
          content,
          meta,
          colors,
          attachments,
          contextArchive,
        } satisfies ExportNoteBundle,
        normalizeText(noteRow.updated_at) || nowIso(),
      );
    });
    exported += noteRows.length;
    if (noteRows.length < PORTABLE_HISTORY_EXPORT_BATCH_SIZE) {
      break;
    }
    offset += noteRows.length;
  }
  return exported;
};

export const exportTrainingHistoryDomain = async (
  payloadDb: Database.Database,
  range: PortableDateRangeFilter,
  instrumentSourceMap: Map<string, string>,
  sourceManifestHashBySourceId: Map<string, string>,
): Promise<number> => {
  const where = applyRangeWhere('created_at', range);
  let exported = 0;
  let offset = 0;
  while (true) {
    const projectRows = listTrainingProjectRowsForExport(
      where,
      PORTABLE_HISTORY_EXPORT_BATCH_SIZE,
      offset,
    );
    if (!projectRows.length) {
      break;
    }
    for (const projectRow of projectRows) {
      const projectId = normalizeText(projectRow.id);
      const replayRef = getTrainingProjectReplayRefRow(projectId);
      const cursorIndex = Math.max(
        0,
        Math.floor(Number(replayRef?.cursor_index ?? replayRef?.entry_index ?? 0) || 0),
      );
      const preview =
        (await loadTrainingProjectReplayWindowFromRef(projectId, cursorIndex, 240)) as
          | Record<string, unknown>
          | null;
      const sourceId = replayRef ? instrumentSourceMap.get(normalizeText(replayRef.instrument_id)) ?? '' : '';
      const sourceManifestHash = sourceManifestHashBySourceId.get(sourceId) ?? '';
      const sanitizedReplayRef = replayRef
        ? {
            ...replayRef,
            instrument_id: '',
            payload_blob:
              replayRef.payload_blob && Buffer.isBuffer(replayRef.payload_blob)
                ? Buffer.from(replayRef.payload_blob).toString('base64')
                : null,
          }
        : null;
      const replayFills = replayRef ? listTrainingProjectReplayFillRowsForExport(projectId) : [];
      const replayCashAdjustments = replayRef
        ? listTrainingProjectReplayCashAdjustmentRowsForExport(projectId)
        : [];
      insertPayloadRow(
        payloadDb,
        'portable_export_training_projects',
        'id',
        projectId,
        {
          project: projectRow,
          replayRef: sanitizedReplayRef,
          replayFills,
          replayCashAdjustments,
          portablePreview: preview,
          sourceManifestHash,
          exportSourceId: sourceId,
          exportInstrumentId: replayRef ? normalizeText(replayRef.instrument_id) : '',
        } satisfies ExportTrainingProjectBundle,
        normalizeText(projectRow.created_at) || nowIso(),
        {
          archived_at: normalizeText(projectRow.created_at) || nowIso(),
        },
      );
    }
    exported += projectRows.length;
    if (projectRows.length < PORTABLE_HISTORY_EXPORT_BATCH_SIZE) {
      break;
    }
    offset += projectRows.length;
  }
  return exported;
};

export const exportSpecialTrainingDomain = async (
  payloadDb: Database.Database,
  range: PortableDateRangeFilter,
  instrumentSourceMap: Map<string, string>,
  sourceManifestHashBySourceId: Map<string, string>,
): Promise<number> => {
  const where = applyRangeWhere('finished_at', range);
  let exportedSessions = 0;
  let sessionOffset = 0;
  while (true) {
    const sessionRows = listSpecialTrainingSessionRowsForExport(
      where,
      PORTABLE_HISTORY_EXPORT_BATCH_SIZE,
      sessionOffset,
    );
    if (!sessionRows.length) {
      break;
    }
    const sessionIds = sessionRows.map((row) => normalizeText(row.id)).filter(Boolean);
    sessionRows.forEach((sessionRow) => {
      insertPayloadRow(
        payloadDb,
        'portable_export_special_training_sessions',
        'id',
        normalizeText(sessionRow.id),
        {
          session: sessionRow,
        } satisfies ExportSpecialTrainingSessionBundle,
        normalizeText(sessionRow.finished_at) || nowIso(),
        {
          finished_at: normalizeText(sessionRow.finished_at) || nowIso(),
        },
      );
    });
    let questionOffset = 0;
    while (sessionIds.length) {
      const questionRows = listSpecialTrainingQuestionRowsForSessionIds(
        sessionIds,
        PORTABLE_HISTORY_EXPORT_BATCH_SIZE,
        questionOffset,
      );
      if (!questionRows.length) {
        break;
      }
      for (const questionRow of questionRows) {
        const questionId = normalizeText(questionRow.id);
        const detail = await getSpecialTrainingHistoryQuestionDetailById(questionId);
        const snapshot =
          detail && Array.isArray(detail.bars) && detail.bars.length > 0
            ? {
                bars: detail.bars,
                symbol: detail.symbol,
                baseTimeframe: detail.baseTimeframe,
                startIndex: detail.startIndex,
                endIndex: detail.endIndex,
                cursorIndex: detail.cursorIndex,
                revealEndIndex: detail.revealEndIndex,
              }
            : null;
        const sourceId = instrumentSourceMap.get(normalizeText(questionRow.instrument_id)) ?? '';
        const sourceManifestHash = sourceManifestHashBySourceId.get(sourceId) ?? '';
        insertPayloadRow(
          payloadDb,
          'portable_export_special_training_questions',
          'id',
          questionId,
          {
            question: {
              ...questionRow,
              instrument_id: '',
              detail_blob:
                questionRow.detail_blob && Buffer.isBuffer(questionRow.detail_blob)
                  ? Buffer.from(questionRow.detail_blob).toString('base64')
                  : null,
            },
            snapshotArchive: snapshot,
            sourceManifestHash,
            exportSourceId: sourceId,
            exportInstrumentId: normalizeText(questionRow.instrument_id),
          } satisfies ExportSpecialTrainingQuestionBundle,
          normalizeText(questionRow.settled_at) || nowIso(),
          {
            session_id: normalizeText(questionRow.session_id),
            settled_at: normalizeText(questionRow.settled_at) || nowIso(),
          },
        );
      }
      if (questionRows.length < PORTABLE_HISTORY_EXPORT_BATCH_SIZE) {
        break;
      }
      questionOffset += questionRows.length;
    }
    exportedSessions += sessionRows.length;
    if (sessionRows.length < PORTABLE_HISTORY_EXPORT_BATCH_SIZE) {
      break;
    }
    sessionOffset += sessionRows.length;
  }
  return exportedSessions;
};

export const exportSourceManifestDomain = (
  payloadDb: Database.Database,
  sourceManifests: Array<Record<string, unknown>>,
): number => {
  sourceManifests.forEach((row) => {
    insertPayloadRow(
      payloadDb,
      'portable_export_source_manifests',
      'source_id',
      normalizeText(row.sourceId),
      row,
      normalizeText(row.updatedAt) || nowIso(),
    );
  });
  return sourceManifests.length;
};

export const exportMarketDataDomain = async (
  payloadDb: Database.Database,
  marketSourceIds: readonly string[],
): Promise<{
  sourceCount: number;
  sourcePreviews: PortableMarketSourcePreview[];
  fingerprintBySourceId: Map<string, string>;
}> => {
  const bundles = listPortableMarketSourceBundles(marketSourceIds);
  bundles.sourceBundles.forEach((sourceBundle) => {
    insertPayloadRow(
      payloadDb,
      'portable_export_market_sources',
      'source_id',
      sourceBundle.sourceId,
      sourceBundle,
      sourceBundle.updatedAt,
    );
  });
  bundles.instrumentBundles.forEach((instrumentBundle) => {
    insertPayloadRow(
      payloadDb,
      'portable_export_market_instruments',
      'instrument_id',
      instrumentBundle.exportInstrumentId,
      instrumentBundle,
      instrumentBundle.createdAt,
      {
        source_id: instrumentBundle.sourceId,
      },
    );
  });
  bundles.fileLedgerBundles.forEach((ledgerBundle) => {
    insertPayloadRow(
      payloadDb,
      'portable_export_market_file_ledgers',
      'row_id',
      ledgerBundle.rowId,
      ledgerBundle,
      ledgerBundle.updatedAt,
      {
        source_id: ledgerBundle.sourceId,
      },
    );
  });
  for (const instrumentBundle of bundles.instrumentBundles) {
    const totalBars = Math.max(0, instrumentBundle.barCount);
    let offset = 0;
    const limit = 5_000;
    while (offset < totalBars) {
      const bars = await getMarketBarsByInstrumentIdRange(
        instrumentBundle.exportInstrumentId,
        offset,
        limit,
      );
      if (!bars.length) {
        break;
      }
      insertPortablePayloadMarketBarRows(
        payloadDb,
        bars.map((bar) => ({
          instrumentId: instrumentBundle.exportInstrumentId,
          tsMs: Date.parse(bar.ts),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        })),
      );
      offset += bars.length;
      if (bars.length < limit) {
        break;
      }
    }
  }
  const fingerprintBySourceId = new Map<string, string>();
  const finalizedSourceBundles = bundles.sourceBundles.map((sourceBundle) => {
    const fingerprintHash = buildPortableMarketPayloadFingerprint({
      payloadDb,
      sourceId: sourceBundle.sourceId,
    });
    fingerprintBySourceId.set(sourceBundle.sourceId, fingerprintHash);
    const finalizedBundle = { ...sourceBundle, fingerprintHash };
    insertPayloadRow(
      payloadDb,
      'portable_export_market_sources',
      'source_id',
      sourceBundle.sourceId,
      finalizedBundle,
      sourceBundle.updatedAt,
    );
    return finalizedBundle;
  });
  exportSourceManifestDomain(
    payloadDb,
    finalizedSourceBundles.map((sourceBundle) => ({
      id: sourceBundle.sourceId,
      sourceId: sourceBundle.sourceId,
      sourceName: sourceBundle.sourceName,
      baseTimeframe: sourceBundle.baseTimeframe,
      timeZone: sourceBundle.timeZone,
      timeZoneOrigin: sourceBundle.timeZoneOrigin,
      importScopeStrategy: sourceBundle.importScopeStrategy,
      importScopeTopLevelSubfolder: sourceBundle.importScopeTopLevelSubfolder,
      fieldMappingJson: sourceBundle.fieldMappingJson,
      tradingCalendarJson: sourceBundle.tradingCalendarJson,
      symbolCount: sourceBundle.symbolCount,
      barCount: sourceBundle.barCount,
      timeStartTs: sourceBundle.timeStartTs,
      timeEndTs: sourceBundle.timeEndTs,
      fingerprintHash: sourceBundle.fingerprintHash,
      updatedAt: sourceBundle.updatedAt,
    })),
  );
  return {
    sourceCount: bundles.sourceBundles.length,
    sourcePreviews: bundles.previews,
    fingerprintBySourceId,
  };
};

export const exportSettingsDomain = (payloadDb: Database.Database): number => {
  const bundle = sanitizeSettingsBundle();
  insertPayloadRow(
    payloadDb,
    'portable_export_settings',
    'domain_key',
    'SETTINGS',
    bundle,
    nowIso(),
  );
  return 1;
};

export const exportCustomIndicatorsDomain = (
  payloadDb: Database.Database,
  range: PortableDateRangeFilter,
): number => {
  const where = applyRangeWhere('updated_at', range);
  const rows = listCustomIndicatorRowsForExport(where);
  rows.forEach((row) => {
    insertPayloadRow(
      payloadDb,
      'portable_export_custom_indicators',
      'id',
      normalizeText(row.id),
      row,
      normalizeText(row.updated_at) || nowIso(),
    );
  });
  return rows.length;
};
