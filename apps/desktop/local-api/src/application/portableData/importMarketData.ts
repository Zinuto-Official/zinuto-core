// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import {
  getMarketBarsByInstrumentIdRange,
  replaceMarketBarsForInstrumentBatched,
} from '../ports/infrastructure/db/marketDatabase.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import {
  parsePayloadJson,
  readBundleRows,
  toSha256,
} from '../portableDataPackage.js';
import {
  appendPortableImportRecoveryResource,
  beginPortableMarketSourceMutation,
  getLocalInstrumentBinding,
  insertImportedMarketFileLedgerRow,
  insertImportedMarketJobRow,
  insertImportedMarketSourceRow,
  insertLocalInstrumentRow,
  listPortablePayloadMarketBars,
  runPortableDataTransaction,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';

import type {
  ExportMarketSourceBundle,
  ExportMarketInstrumentBundle,
  ExportMarketFileLedgerBundle,
} from './types.js';

import {
  normalizeText,
  listPortableSourceManifestBundles,
} from './helpers.js';
import { buildPortableMarketPayloadFingerprint } from './marketPayloadFingerprint.js';

import type {
  PortableImportConflictMode,
  PortableImportResult,
} from '../portableDataModel.js';

export type PortableMarketImportPlan = {
  exportSourceIdToTargetSourceId: Map<string, string>;
  exportInstrumentIdToBinding: Map<string, { instrumentId: string; barsVersionToken: string }>;
  portableManifestRows: Array<Record<string, unknown>>;
  diagnosticSourceIds: string[];
  mutationSourceIds: string[];
  result: PortableImportResult['marketImport'];
};

const assertExistingInstrumentMatchesPayload = async ({
  payloadDb,
  exportInstrumentId,
  targetInstrumentId,
}: {
  payloadDb: Database.Database;
  exportInstrumentId: string;
  targetInstrumentId: string;
}): Promise<void> => {
  const batchSize = 5_000;
  let offset = 0;
  while (true) {
    const payloadRows = listPortablePayloadMarketBars({
      payloadDb,
      instrumentId: exportInstrumentId,
      limit: batchSize,
      offset,
    });
    const existingRows = await getMarketBarsByInstrumentIdRange(
      targetInstrumentId,
      offset,
      batchSize,
    );
    if (payloadRows.length !== existingRows.length) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
    for (let index = 0; index < payloadRows.length; index += 1) {
      const payloadRow = payloadRows[index];
      const existingRow = existingRows[index];
      if (
        Number(payloadRow.ts_ms) !== Date.parse(existingRow.ts) ||
        Number(payloadRow.open) !== existingRow.open ||
        Number(payloadRow.high) !== existingRow.high ||
        Number(payloadRow.low) !== existingRow.low ||
        Number(payloadRow.close) !== existingRow.close ||
        Number(payloadRow.volume) !== existingRow.volume
      ) {
        throw appError('PORTABLE_PACKAGE_TAMPERED');
      }
    }
    if (payloadRows.length < batchSize) {
      return;
    }
    offset += payloadRows.length;
  }
};

const readValidatedPortableMarketSourceBundles = (
  payloadDb: Database.Database,
): ExportMarketSourceBundle[] => {
  const sourceRows = readBundleRows<{ source_id: string; payload_json: string }>(
    payloadDb,
    'portable_export_market_sources',
  );
  return sourceRows.map((row) => {
    const sourceBundle = parsePayloadJson<ExportMarketSourceBundle>(row.payload_json, {
      sourceId: normalizeText(row.source_id),
      sourceName: '',
      baseTimeframe: '1d',
      timeZone: 'Etc/UTC',
      timeZoneOrigin: 'USER_SELECTED',
      importScopeStrategy: null,
      importScopeTopLevelSubfolder: '',
      fieldMappingJson: '{}',
      tradingCalendarJson: '',
      symbolCount: 0,
      barCount: 0,
      storageBytes: 0,
      timeStartTs: null,
      timeEndTs: null,
      fingerprintHash: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    const sourceId = normalizeText(row.source_id);
    const claimedFingerprint = normalizeText(sourceBundle.fingerprintHash);
    const computedFingerprint = buildPortableMarketPayloadFingerprint({
      payloadDb,
      sourceId,
    });
    if (
      !sourceId
      || normalizeText(sourceBundle.sourceId) !== sourceId
      || !claimedFingerprint
      || claimedFingerprint !== computedFingerprint
    ) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
    return sourceBundle;
  });
};

const readPortableMarketInstrumentBundles = (
  payloadDb: Database.Database,
): ExportMarketInstrumentBundle[] =>
  readBundleRows<{
    instrument_id: string;
    source_id: string;
    payload_json: string;
  }>(payloadDb, 'portable_export_market_instruments').map((row) =>
    parsePayloadJson<ExportMarketInstrumentBundle>(row.payload_json, {
      exportInstrumentId: normalizeText(row.instrument_id),
      sourceId: normalizeText(row.source_id),
      symbol: '',
      baseTimeframe: '1d',
      name: '',
      market: 'LOCAL',
      timeZone: null,
      minTradeStep: 1,
      barCount: 0,
      timeStartTs: null,
      timeEndTs: null,
      barsVersionToken: '',
      createdAt: nowIso(),
    }),
  );

export const inspectPortableMarketDataConflicts = (
  payloadDb: Database.Database,
): PortableMarketImportPlan => {
  const sourceBundles = readValidatedPortableMarketSourceBundles(payloadDb);
  const existingSourceManifestByFingerprint = new Map(
    listPortableSourceManifestBundles()
      .map((row) => [normalizeText(row.fingerprintHash), normalizeText(row.sourceId)])
      .filter((row): row is [string, string] => Boolean(row[0] && row[1])),
  );
  const exportSourceIdToTargetSourceId = new Map<string, string>();
  let reusedSources = 0;
  sourceBundles.forEach((source) => {
    const existingSourceId = normalizeText(
      existingSourceManifestByFingerprint.get(normalizeText(source.fingerprintHash)),
    );
    if (existingSourceId) {
      reusedSources += 1;
    }
    exportSourceIdToTargetSourceId.set(
      source.sourceId,
      existingSourceId || `preview-source:${source.sourceId}`,
    );
  });
  const exportInstrumentIdToBinding = new Map<
    string,
    { instrumentId: string; barsVersionToken: string }
  >();
  readPortableMarketInstrumentBundles(payloadDb).forEach((instrument) => {
    const targetSourceId = exportSourceIdToTargetSourceId.get(instrument.sourceId) ?? '';
    const existing = targetSourceId.startsWith('preview-source:')
      ? null
      : getLocalInstrumentBinding({
        sourceId: targetSourceId,
        symbol: instrument.symbol,
        baseTimeframe: instrument.baseTimeframe,
      });
    exportInstrumentIdToBinding.set(instrument.exportInstrumentId, {
      instrumentId: normalizeText(existing?.id) || `preview-instrument:${instrument.exportInstrumentId}`,
      barsVersionToken: normalizeText(existing?.bars_version_token) || instrument.barsVersionToken,
    });
  });
  return {
    exportSourceIdToTargetSourceId,
    exportInstrumentIdToBinding,
    portableManifestRows: sourceBundles.map((source) => ({
      ...source,
      id: exportSourceIdToTargetSourceId.get(source.sourceId),
      sourceId: exportSourceIdToTargetSourceId.get(source.sourceId),
    })),
    diagnosticSourceIds: [],
    mutationSourceIds: [],
    result: {
      importedSources: sourceBundles.length - reusedSources,
      reusedSources,
      importedInstruments: 0,
      importedBars: 0,
      pendingRebindSourceIds: [],
    },
  };
};

export const importMarketDataFromPayload = async ({
  payloadDb,
  conflictMode,
  recoveryJournalId,
  onSourceMutationStateChanged,
}: {
  payloadDb: Database.Database;
  conflictMode: PortableImportConflictMode;
  recoveryJournalId: string;
  onSourceMutationStateChanged?: () => void;
}): Promise<PortableMarketImportPlan> => {
  const sourceBundles = readValidatedPortableMarketSourceBundles(payloadDb);
  if (!sourceBundles.length) {
    return {
      exportSourceIdToTargetSourceId: new Map(),
      exportInstrumentIdToBinding: new Map(),
      portableManifestRows: [],
      diagnosticSourceIds: [],
      mutationSourceIds: [],
      result: {
        importedSources: 0,
        reusedSources: 0,
        importedInstruments: 0,
        importedBars: 0,
        pendingRebindSourceIds: [],
      },
    };
  }
  const instrumentBundles = readPortableMarketInstrumentBundles(payloadDb);
  const fileLedgerRows = readBundleRows<{
    source_id: string;
    row_id: string;
    payload_json: string;
  }>(payloadDb, 'portable_export_market_file_ledgers');
  const fileLedgerBundles = fileLedgerRows.map((row) =>
    parsePayloadJson<ExportMarketFileLedgerBundle>(row.payload_json, {
      sourceId: normalizeText(row.source_id),
      rowId: normalizeText(row.row_id),
      exportInstrumentId: '',
      symbol: '',
      fileName: '',
      relativePath: '',
      fileSize: 0,
      fileMtimeMs: 0,
      fileFingerprint: '',
      updatedAt: nowIso(),
    }),
  );
  const existingSourceManifestByFingerprint = new Map(
    (conflictMode === 'MERGE_KEEP_LOCAL'
      ? listPortableSourceManifestBundles()
      : [])
      .map((row) => [normalizeText(row.fingerprintHash), normalizeText(row.sourceId)])
      .filter((row): row is [string, string] => Boolean(row[0] && row[1])),
  );
  const exportSourceIdToTargetSourceId = new Map<string, string>();
  const exportInstrumentIdToBinding = new Map<
    string,
    { instrumentId: string; barsVersionToken: string }
  >();
  const syntheticJobIdBySourceId = new Map<string, string>();
  const pendingRebindSourceIds: string[] = [];
  const diagnosticSourceIds = new Set<string>();
  const claimedSourceIds = new Set<string>();
  const claimedExistingSourceIds = new Set<string>();
  const portableManifestRows: Array<Record<string, unknown>> = [];
  const appendPortableManifestRow = (
    sourceBundle: ExportMarketSourceBundle,
    targetSourceId: string,
  ): void => {
    const normalizedTargetSourceId = normalizeText(targetSourceId);
    if (!normalizedTargetSourceId) {
      return;
    }
    diagnosticSourceIds.add(normalizedTargetSourceId);
    portableManifestRows.push({
      id: normalizedTargetSourceId,
      sourceId: normalizedTargetSourceId,
      sourceName: sourceBundle.sourceName,
      baseTimeframe: sourceBundle.baseTimeframe,
      timeZone: sourceBundle.timeZone,
      symbolCount: sourceBundle.symbolCount,
      barCount: sourceBundle.barCount,
      timeStartTs: sourceBundle.timeStartTs,
      timeEndTs: sourceBundle.timeEndTs,
      fingerprintHash: sourceBundle.fingerprintHash,
      updatedAt: sourceBundle.updatedAt,
    });
  };
  let importedSources = 0;
  let reusedSources = 0;
  let importedInstruments = 0;
  let importedBars = 0;
  try {
    sourceBundles.forEach((sourceBundle) => {
      const existingSourceId = normalizeText(
        existingSourceManifestByFingerprint.get(normalizeText(sourceBundle.fingerprintHash)),
      );
      if (existingSourceId) {
        if (!claimedSourceIds.has(existingSourceId)) {
          runPortableDataTransaction(() => {
            const claimedAt = nowIso();
            if (
              !beginPortableMarketSourceMutation({
                sourceId: existingSourceId,
                updatedAt: claimedAt,
              })
            ) {
              throw appError(
                'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
                { sourceId: existingSourceId },
                409,
              );
            }
            appendPortableImportRecoveryResource({
              journalId: recoveryJournalId,
              resource: 'CLAIMED_SOURCE',
              resourceId: existingSourceId,
              updatedAt: claimedAt,
            });
          });
        }
        claimedSourceIds.add(existingSourceId);
        claimedExistingSourceIds.add(existingSourceId);
        exportSourceIdToTargetSourceId.set(sourceBundle.sourceId, existingSourceId);
        appendPortableManifestRow(sourceBundle, existingSourceId);
        reusedSources += 1;
        return;
      }
      const targetSourceId = createId();
      const jobId = createId();
      syntheticJobIdBySourceId.set(targetSourceId, jobId);
      exportSourceIdToTargetSourceId.set(sourceBundle.sourceId, targetSourceId);
      const importedAt = nowIso();
      const ledgerCount = fileLedgerBundles.filter(
        (item) => item.sourceId === sourceBundle.sourceId,
      ).length;
      const tradingCalendarJson = normalizeText(sourceBundle.tradingCalendarJson);
      if (!tradingCalendarJson) {
        throw appError('PORTABLE_DATA_IMPORT_INVALID');
      }
      runPortableDataTransaction(() => {
        appendPortableImportRecoveryResource({
          journalId: recoveryJournalId,
          resource: 'CREATED_SOURCE',
          resourceId: targetSourceId,
          updatedAt: importedAt,
        });
        insertImportedMarketSourceRow({
          id: targetSourceId,
          name: sourceBundle.sourceName || 'Imported Market Source',
          sourceFolder: '',
          sourceFolderBookmarkId: '',
          importScopeStrategy: sourceBundle.importScopeStrategy,
          importScopeTopLevelSubfolder:
            sourceBundle.importScopeTopLevelSubfolder || '',
          timeZone: sourceBundle.timeZone || 'Etc/UTC',
          timeZoneOrigin: sourceBundle.timeZoneOrigin || 'USER_SELECTED',
          baseTimeframe: sourceBundle.baseTimeframe || '1d',
          fieldMappingJson: sourceBundle.fieldMappingJson || '{}',
          tradingCalendarJson,
          status: 'READY',
          totalFiles: ledgerCount,
          importedFiles: ledgerCount,
          failedFiles: 0,
          symbolCount: sourceBundle.symbolCount,
          barCount: sourceBundle.barCount,
          storageBytes: sourceBundle.storageBytes,
          timeStartTs: sourceBundle.timeStartTs,
          timeEndTs: sourceBundle.timeEndTs,
          lastJobId: jobId,
          createdAt: sourceBundle.createdAt || importedAt,
          updatedAt: importedAt,
        });
        insertImportedMarketJobRow({
          id: jobId,
          sourceId: targetSourceId,
          sourceName: sourceBundle.sourceName || 'Imported Market Source',
          timeZone: sourceBundle.timeZone || 'Etc/UTC',
          baseTimeframe: sourceBundle.baseTimeframe || '1d',
          totalFiles: ledgerCount,
          doneFiles: ledgerCount,
          totalRows: sourceBundle.barCount,
          importedRows: sourceBundle.barCount,
          createdAt: importedAt,
          startedAt: importedAt,
          finishedAt: importedAt,
          updatedAt: importedAt,
        });
      });
      claimedSourceIds.add(targetSourceId);
      appendPortableManifestRow(sourceBundle, targetSourceId);
      pendingRebindSourceIds.push(targetSourceId);
      importedSources += 1;
    });
    onSourceMutationStateChanged?.();
    for (const instrumentBundle of instrumentBundles) {
      const targetSourceId =
        exportSourceIdToTargetSourceId.get(instrumentBundle.sourceId) ?? '';
      if (!targetSourceId) {
        continue;
      }
      const existingBinding = getLocalInstrumentBinding({
        sourceId: targetSourceId,
        symbol: instrumentBundle.symbol,
        baseTimeframe: instrumentBundle.baseTimeframe,
      });
      const shouldReuseExistingBinding =
        existingBinding &&
        normalizeText(existingBinding.id) &&
        sourceBundles.some(
          (row) =>
            row.sourceId === instrumentBundle.sourceId &&
            normalizeText(existingSourceManifestByFingerprint.get(normalizeText(row.fingerprintHash))) ===
              targetSourceId,
        );
      if (shouldReuseExistingBinding) {
        await assertExistingInstrumentMatchesPayload({
          payloadDb,
          exportInstrumentId: instrumentBundle.exportInstrumentId,
          targetInstrumentId: normalizeText(existingBinding?.id),
        });
        exportInstrumentIdToBinding.set(instrumentBundle.exportInstrumentId, {
          instrumentId: normalizeText(existingBinding?.id),
          barsVersionToken: normalizeText(existingBinding?.bars_version_token),
        });
        continue;
      }
      if (claimedExistingSourceIds.has(targetSourceId)) {
        throw appError('PORTABLE_PACKAGE_TAMPERED');
      }
      if (normalizeText(existingBinding?.id)) {
        throw appError('PORTABLE_PACKAGE_TAMPERED');
      }
      const targetInstrumentId = createId();
      const nextBarsVersionToken =
        normalizeText(instrumentBundle.barsVersionToken) ||
        `portable-${toSha256(`${instrumentBundle.exportInstrumentId}:${targetSourceId}`).slice(0, 16)}`;
      runPortableDataTransaction(() => {
        const instrumentCreatedAt = nowIso();
        appendPortableImportRecoveryResource({
          journalId: recoveryJournalId,
          resource: 'CREATED_INSTRUMENT',
          resourceId: targetInstrumentId,
          updatedAt: instrumentCreatedAt,
        });
        insertLocalInstrumentRow({
          id: targetInstrumentId,
          sourceId: targetSourceId,
          symbol: instrumentBundle.symbol,
          baseTimeframe: instrumentBundle.baseTimeframe || '1d',
          name: instrumentBundle.name || instrumentBundle.symbol,
          market: 'LOCAL',
          timeZone: instrumentBundle.timeZone,
          minTradeStep: Number(instrumentBundle.minTradeStep ?? 1),
          barsVersionToken: nextBarsVersionToken,
          barCount: Math.max(0, instrumentBundle.barCount),
          timeStartTs: instrumentBundle.timeStartTs,
          timeEndTs: instrumentBundle.timeEndTs,
          createdAt: instrumentBundle.createdAt || instrumentCreatedAt,
        });
      });
      await replaceMarketBarsForInstrumentBatched({
        instrumentId: targetInstrumentId,
        symbol: instrumentBundle.symbol,
        loadBatch: async (offset, limit) => {
          const rows = listPortablePayloadMarketBars({
            payloadDb,
            instrumentId: instrumentBundle.exportInstrumentId,
            limit: Math.max(1, Math.floor(limit)),
            offset: Math.max(0, Math.floor(offset)),
          });
          return rows.map((row) => ({
            ts: new Date(Number(row.ts_ms ?? 0)).toISOString(),
            open: Number(row.open ?? 0),
            high: Number(row.high ?? 0),
            low: Number(row.low ?? 0),
            close: Number(row.close ?? 0),
            volume: Number(row.volume ?? 0),
          }));
        },
      });
      exportInstrumentIdToBinding.set(instrumentBundle.exportInstrumentId, {
        instrumentId: targetInstrumentId,
        barsVersionToken: nextBarsVersionToken,
      });
      importedInstruments += 1;
      importedBars += Math.max(0, instrumentBundle.barCount);
    }
    fileLedgerBundles.forEach((ledgerBundle) => {
      const targetSourceId =
        exportSourceIdToTargetSourceId.get(ledgerBundle.sourceId) ?? '';
      const jobId = syntheticJobIdBySourceId.get(targetSourceId);
      if (!targetSourceId || !jobId) {
        return;
      }
      const instrumentBinding = exportInstrumentIdToBinding.get(
        ledgerBundle.exportInstrumentId,
      );
      insertImportedMarketFileLedgerRow({
        id: createId(),
        sourceId: targetSourceId,
        jobId,
        instrumentId: instrumentBinding?.instrumentId ?? null,
        symbol: ledgerBundle.symbol,
        fileName: ledgerBundle.fileName || ledgerBundle.symbol,
        filePath: ledgerBundle.relativePath || ledgerBundle.fileName || ledgerBundle.symbol,
        fileSize: Math.max(0, ledgerBundle.fileSize),
        fileMtimeMs: Math.max(0, ledgerBundle.fileMtimeMs),
        fileFingerprint: ledgerBundle.fileFingerprint,
        rowsTotal: 1,
        rowsImported: 1,
        rowsSkipped: 0,
        createdAt: ledgerBundle.updatedAt || nowIso(),
        updatedAt: ledgerBundle.updatedAt || nowIso(),
      });
    });
    onSourceMutationStateChanged?.();
  } catch (error) {
    onSourceMutationStateChanged?.();
    throw error;
  }
  return {
    exportSourceIdToTargetSourceId,
    exportInstrumentIdToBinding,
    portableManifestRows,
    diagnosticSourceIds: [...diagnosticSourceIds],
    mutationSourceIds: [...claimedSourceIds],
    result: {
      importedSources,
      reusedSources,
      importedInstruments,
      importedBars,
      pendingRebindSourceIds,
    },
  };
};
