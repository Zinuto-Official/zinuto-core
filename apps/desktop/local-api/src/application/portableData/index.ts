// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import {
  PORTABLE_TRANSFER_FORMAT_VERSION,
  buildPortableTransferOutputPath,
  createPortablePackage,
} from '../portableDataContainer.js';
import {
  normalizeDateRange,
  normalizeDomains,
  normalizeManifestDomains,
  type PortableExportDomain,
  type PortableExportManifest,
  type PortableImportConflictMode,
  type PortableImportSettingsConflictMode,
  type PortableMarketSourcePreview,
  type PortableSnapshotPolicy,
} from '../portableDataModel.js';
import {
  createPayloadDatabase,
  loadPortablePackage,
  readPortableManifest,
  readPortableMarketSourcePreviewRows,
  withTempWorkingDir,
} from '../portableDataPackage.js';
import {
  markTrainingStatsDirty,
} from '../trainingStatsService.js';
import {
  ensureLocalDataSourceDiagnosticsCache,
  invalidateLocalDataSourceAccessCache,
} from '../dataSourceService.js';
import { isSystemResetExecutionActive } from '../trading/resetExecutionState.js';
import {
  normalizeText,
  buildSourceManifestHashBySourceId,
  buildInstrumentSourceMap,
  normalizeMarketSourceIds,
  insertPayloadRow,
  listPortableSourceManifestBundles,
} from './helpers.js';
import {
  completePortableMarketSourceMutation,
  createPortableImportRecoveryJournal,
  deleteCommittedPortableImportRecoveryJournal,
  transitionPortableImportRecoveryJournal,
  getPortableDataLocalGeneration,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';

import { collectPortableExportPreview } from './exportBundles.js';
import {
  exportNotesDomain,
  exportTrainingHistoryDomain,
  exportSpecialTrainingDomain,
  exportMarketDataDomain,
  exportSettingsDomain,
  exportCustomIndicatorsDomain,
} from './exportDomains.js';
import {
  importMarketDataFromPayload,
  inspectPortableMarketDataConflicts,
} from './importMarketData.js';
import {
  validatePortableImportDomainPayloads,
  executePortableImportDomains,
} from './importDomains.js';
import { comparePortableImportConflicts } from './portableImportConflictComparator.js';
import {
  recoverPortableImportJournal,
  recoverPortableImportsAtStartup,
  type PortableImportRecoveryRuntime,
} from './recovery.js';

export { PORTABLE_EXPORT_DOMAINS } from './helpers.js';

export type PortableImportDurablePhase =
  | 'AFTER_PENDING'
  | 'AFTER_MARKET_WRITES'
  | 'AFTER_MARKET_READY'
  | 'AFTER_COMMITTED';

export type PortableImportExecutionRuntime = {
  ensureDiagnosticsCache?: typeof ensureLocalDataSourceDiagnosticsCache;
  onDurablePhase?: (phase: PortableImportDurablePhase) => void;
  recoverOnFailure?: boolean;
  recovery?: PortableImportRecoveryRuntime;
  requirePreviewGeneration?: boolean;
};

export { recoverPortableImportsAtStartup };

const PORTABLE_IMPORT_PREVIEW_TTL_MS = 10 * 60 * 1000;
const portableImportPreviewTokens = new Map<string, {
  expiresAtMs: number;
  exportId: string;
  localGeneration: number;
  resolvedInputPath: string;
}>();

const sweepPortableImportPreviewTokens = (): void => {
  const now = Date.now();
  portableImportPreviewTokens.forEach((entry, token) => {
    if (entry.expiresAtMs <= now) {
      portableImportPreviewTokens.delete(token);
    }
  });
  while (portableImportPreviewTokens.size > 32) {
    const oldest = portableImportPreviewTokens.keys().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    portableImportPreviewTokens.delete(oldest);
  }
};

const createPortableImportPreviewToken = (input: {
  exportId: string;
  localGeneration: number;
  resolvedInputPath: string;
}): string => {
  sweepPortableImportPreviewTokens();
  const token = createId();
  portableImportPreviewTokens.set(token, {
    ...input,
    expiresAtMs: Date.now() + PORTABLE_IMPORT_PREVIEW_TTL_MS,
  });
  return token;
};

const consumePortableImportPreviewToken = (input: {
  token: string;
  exportId: string;
  localGeneration: number;
  resolvedInputPath: string;
}): void => {
  sweepPortableImportPreviewTokens();
  const record = portableImportPreviewTokens.get(input.token);
  portableImportPreviewTokens.delete(input.token);
  if (
    !record
    || record.expiresAtMs <= Date.now()
    || record.exportId !== input.exportId
    || record.localGeneration !== input.localGeneration
    || record.resolvedInputPath !== input.resolvedInputPath
  ) {
    throw appError('PORTABLE_IMPORT_PREVIEW_STALE');
  }
};
export type {
  PortableDateRangeFilter,
  PortableDomainPreview,
  PortableExportDomain,
  PortableExportManifest,
  PortableExportPreview,
  PortableExportResult,
  PortableImportConflictMode,
  PortableImportPreview,
  PortableImportPreviewDomain,
  PortableImportResult,
  PortableImportSettingsConflictMode,
  PortableMarketSourcePreview,
  PortableSnapshotPolicy,
  ReplayAvailability,
} from './helpers.js';

export const previewPortableExport = (input?: {
  domains?: readonly PortableExportDomain[];
  dateRange?: Partial<{ from?: string | null; to?: string | null }> | null;
  marketSourceIds?: readonly string[] | null;
}) =>
  collectPortableExportPreview(
    normalizeDomains(input?.domains),
    normalizeDateRange(input?.dateRange),
    normalizeMarketSourceIds(input?.marketSourceIds),
  );

export const executePortableExport = async (input: {
  outputPath: string;
  domains?: readonly PortableExportDomain[];
  marketSourceIds?: readonly string[] | null;
  dateRange?: Partial<{ from?: string | null; to?: string | null }> | null;
  snapshotPolicy?: PortableSnapshotPolicy;
  appBuildVersion?: string | null;
  legalConfirmedForMarketData?: boolean;
}): Promise<{
  outputPath: string;
  manifest: PortableExportManifest;
  fileBytes: number;
}> => {
  const outputPathRaw = normalizeText(input.outputPath);
  if (!outputPathRaw) {
    throw appError('PORTABLE_EXPORT_PATH_REQUIRED');
  }
  const outputPath = buildPortableTransferOutputPath(outputPathRaw);
  const selectedDomains = normalizeDomains(input.domains);
  const selectedMarketSourceIds = normalizeMarketSourceIds(input.marketSourceIds);
  const dateRange = normalizeDateRange(input.dateRange);
  const snapshotPolicy: PortableSnapshotPolicy = 'EVIDENCE_ONLY';
  if (
    selectedDomains.includes('MARKET_DATA') &&
    !Boolean(input.legalConfirmedForMarketData)
  ) {
    throw appError('PORTABLE_MARKET_DATA_LEGAL_CONFIRM_REQUIRED');
  }
  let canonicalOutputPath = outputPath;
  const manifest = await withTempWorkingDir(async (workingDir) => {
    const payloadPath = path.join(workingDir, 'payload.sqlite');
    const payloadDb = createPayloadDatabase(payloadPath);
    const countsByDomain = {
      SETTINGS: 0,
      CUSTOM_INDICATORS: 0,
      NOTES: 0,
      TRAINING_HISTORY: 0,
      SPECIAL_TRAINING_HISTORY: 0,
      MARKET_DATA: 0,
    } satisfies Record<PortableExportDomain, number>;
    let marketSourcePreviewRows: PortableMarketSourcePreview[] = [];
    try {
      payloadDb.exec('BEGIN IMMEDIATE');
      const sourceManifests = listPortableSourceManifestBundles();
      const sourceManifestHashBySourceId = buildSourceManifestHashBySourceId(
        sourceManifests,
      );
      const instrumentSourceMap = buildInstrumentSourceMap();
      if (selectedDomains.includes('MARKET_DATA')) {
        const marketExport = await exportMarketDataDomain(
          payloadDb,
          selectedMarketSourceIds,
        );
        countsByDomain.MARKET_DATA = marketExport.sourceCount;
        marketSourcePreviewRows = marketExport.sourcePreviews;
        marketExport.fingerprintBySourceId.forEach((fingerprint, sourceId) => {
          sourceManifestHashBySourceId.set(sourceId, fingerprint);
        });
      }
      for (const domain of selectedDomains) {
        switch (domain) {
          case 'SETTINGS':
            countsByDomain.SETTINGS = exportSettingsDomain(payloadDb);
            break;
          case 'CUSTOM_INDICATORS':
            countsByDomain.CUSTOM_INDICATORS = exportCustomIndicatorsDomain(
              payloadDb,
              dateRange,
            );
            break;
          case 'NOTES':
            countsByDomain.NOTES = await exportNotesDomain(payloadDb, dateRange);
            break;
          case 'TRAINING_HISTORY':
            countsByDomain.TRAINING_HISTORY = await exportTrainingHistoryDomain(
              payloadDb,
              dateRange,
              instrumentSourceMap,
              sourceManifestHashBySourceId,
            );
            break;
          case 'SPECIAL_TRAINING_HISTORY':
            countsByDomain.SPECIAL_TRAINING_HISTORY =
              await exportSpecialTrainingDomain(
                payloadDb,
                dateRange,
                instrumentSourceMap,
                sourceManifestHashBySourceId,
              );
            break;
          case 'MARKET_DATA': {
            break;
          }
        }
      }
      const nextManifest: PortableExportManifest = {
        schemaVersion: PORTABLE_TRANSFER_FORMAT_VERSION,
        exportId: createId(),
        exportedAt: nowIso(),
        appBuildVersion: normalizeText(input.appBuildVersion) || 'unknown',
        selectedDomains,
        selectedMarketSourceIds,
        dateRange,
        snapshotPolicy,
        countsByDomain,
        payloadBytes: 0,
        marketDataIncluded:
          countsByDomain.MARKET_DATA > 0 && selectedDomains.includes('MARKET_DATA'),
      };
      insertPayloadRow(
        payloadDb,
        'portable_export_manifest',
        'manifest_key',
        'MANIFEST',
        nextManifest,
        nowIso(),
      );
      if (marketSourcePreviewRows.length > 0) {
        insertPayloadRow(
          payloadDb,
          'portable_export_manifest',
          'manifest_key',
          'MARKET_PREVIEW',
          marketSourcePreviewRows,
          nowIso(),
        );
      }
      payloadDb.exec('COMMIT');
    } catch (error) {
      try {
        payloadDb.exec('ROLLBACK');
      } catch {
        // ignore rollback failures from an already-closed transaction
      }
      throw error;
    } finally {
      payloadDb.pragma('optimize');
      payloadDb.close();
    }
    const payloadStat = await fs.stat(payloadPath);
    const finalManifest = await (async (): Promise<PortableExportManifest> => {
      const manifestDb = createPayloadDatabase(payloadPath);
      try {
        manifestDb.exec('BEGIN IMMEDIATE');
        const manifest = readPortableManifest<PortableExportManifest>(manifestDb);
        const result: PortableExportManifest = {
          ...manifest,
          payloadBytes: payloadStat.size,
        };
        insertPayloadRow(
          manifestDb,
          'portable_export_manifest',
          'manifest_key',
          'MANIFEST',
          result,
          nowIso(),
        );
        manifestDb.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          manifestDb.exec('ROLLBACK');
        } catch {
          // ignore rollback failures from an already-closed transaction
        }
        throw error;
      } finally {
        try {
          manifestDb.close();
        } catch {
          // ignore close failures
        }
      }
    })();
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    const canonicalOutputDir = await fs.realpath(outputDir);
    canonicalOutputPath = path.join(canonicalOutputDir, path.basename(outputPath));
    await createPortablePackage({
      payloadPath,
      outputPath: canonicalOutputPath,
    });
    return finalManifest;
  });
  const fileStat = await fs.stat(canonicalOutputPath);
  return {
    outputPath: canonicalOutputPath,
    manifest,
    fileBytes: fileStat.size,
  };
};

export const inspectPortableImportPackage = async (input: {
  inputPath: string;
}): Promise<{
  manifest: PortableExportManifest;
  domains: Array<{
    domain: PortableExportDomain;
    itemCount: number;
    estimatedBytes: number;
    includesEvidenceSnapshots: boolean;
    needsRebindAfterImport: boolean;
    conflictCount: number;
  }>;
  marketSources: PortableMarketSourcePreview[];
  totalItems: number;
  payloadBytes: number;
  fullRestoreCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
  snapshotOnlyCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
  previewGeneration: string;
}> => {
  const inputPathRaw = normalizeText(input.inputPath);
  if (!inputPathRaw) {
    throw appError('PORTABLE_IMPORT_PATH_REQUIRED');
  }
  const loaded = await loadPortablePackage<PortableExportManifest>(inputPathRaw);
  try {
    const { manifest, payloadDb } = loaded;
    const domains = normalizeManifestDomains(manifest.selectedDomains);
    validatePortableImportDomainPayloads(payloadDb, domains);
    const marketImport = inspectPortableMarketDataConflicts(payloadDb);
    const conflictCountByDomain = comparePortableImportConflicts({
      payloadDb,
      selectedDomains: domains,
      marketImport,
    });
    const previews = domains.map((domain) => {
      const conflictCount = conflictCountByDomain[domain] ?? 0;
      return {
        domain,
        itemCount: manifest.countsByDomain[domain] ?? 0,
        estimatedBytes: 0,
        includesEvidenceSnapshots:
          domain === 'NOTES' ||
          domain === 'TRAINING_HISTORY' ||
          domain === 'SPECIAL_TRAINING_HISTORY',
        needsRebindAfterImport:
          domain === 'TRAINING_HISTORY' ||
          domain === 'SPECIAL_TRAINING_HISTORY' ||
          domain === 'MARKET_DATA',
        conflictCount,
      };
    });
    const marketSourcePreviews =
      readPortableMarketSourcePreviewRows<PortableMarketSourcePreview>(
        payloadDb,
      );
    const resolvedInputPath = await fs.realpath(inputPathRaw);
    const previewGeneration = createPortableImportPreviewToken({
      exportId: manifest.exportId,
      localGeneration: getPortableDataLocalGeneration(),
      resolvedInputPath,
    });
    return {
      manifest,
      domains: previews,
      marketSources: marketSourcePreviews,
      totalItems: previews.reduce((sum, item) => sum + item.itemCount, 0),
      payloadBytes: manifest.payloadBytes,
      fullRestoreCounts: {
        trainingProjects: marketSourcePreviews.reduce(
          (sum, item) => sum + item.linkedTrainingProjectCount,
          0,
        ),
        specialTrainingQuestions: marketSourcePreviews.reduce(
          (sum, item) => sum + item.linkedSpecialTrainingQuestionCount,
          0,
        ),
      },
      snapshotOnlyCounts: {
        trainingProjects: domains.includes('MARKET_DATA')
          ? 0
          : manifest.countsByDomain.TRAINING_HISTORY ?? 0,
        specialTrainingQuestions: domains.includes('MARKET_DATA')
          ? 0
          : manifest.countsByDomain.SPECIAL_TRAINING_HISTORY ?? 0,
      },
      previewGeneration,
    };
  } finally {
    await loaded.cleanup();
  }
};

export const executePortableImport = async (input: {
  inputPath: string;
  previewGeneration?: string;
  domains?: readonly PortableExportDomain[];
  conflictMode?: PortableImportConflictMode;
  settingsConflictMode?: PortableImportSettingsConflictMode;
  legalConfirmedForMarketData?: boolean;
}, runtime: PortableImportExecutionRuntime = {}): Promise<{
  manifest: PortableExportManifest;
  importedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  skippedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  conflictCountByDomain: Partial<Record<PortableExportDomain, number>>;
  remappedIds: {
    notes: number;
    trainingProjects: number;
    specialTrainingSessions: number;
    specialTrainingQuestions: number;
  };
  rebind: {
    trainingProjectRefsUpdated: number;
    specialTrainingQuestionsUpdated: number;
  };
  marketImport: {
    importedSources: number;
    reusedSources: number;
    importedInstruments: number;
    importedBars: number;
    pendingRebindSourceIds: string[];
  };
}> => {
  const inputPathRaw = normalizeText(input.inputPath);
  if (!inputPathRaw) {
    throw appError('PORTABLE_IMPORT_PATH_REQUIRED');
  }
  const selectedDomains = normalizeDomains(input.domains);
  const conflictMode: PortableImportConflictMode =
    input.conflictMode === 'REPLACE_DOMAIN' ? 'REPLACE_DOMAIN' : 'MERGE_KEEP_LOCAL';
  const settingsConflictMode: PortableImportSettingsConflictMode =
    input.settingsConflictMode === 'REPLACE_TARGET'
      ? 'REPLACE_TARGET'
      : 'KEEP_LOCAL';
  if (
    selectedDomains.includes('MARKET_DATA') &&
    !Boolean(input.legalConfirmedForMarketData)
  ) {
    throw appError('PORTABLE_MARKET_DATA_LEGAL_CONFIRM_REQUIRED');
  }
  const loaded = await loadPortablePackage<PortableExportManifest>(inputPathRaw);
  const { manifest, payloadDb } = loaded;
  let recoveryJournalId: string | null = null;
  let marketImport: Awaited<ReturnType<typeof importMarketDataFromPayload>> = {
    exportSourceIdToTargetSourceId: new Map<string, string>(),
    exportInstrumentIdToBinding: new Map<
      string,
      { instrumentId: string; barsVersionToken: string }
    >(),
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
  try {
    const manifestDomains = normalizeManifestDomains(manifest.selectedDomains);
    const selectedImportDomains = selectedDomains.filter((domain) =>
      manifestDomains.includes(domain),
    );
    if (!selectedImportDomains.length) {
      throw appError('PORTABLE_DOMAIN_SELECTION_REQUIRED');
    }
    validatePortableImportDomainPayloads(payloadDb, selectedImportDomains);
    const previewGeneration = normalizeText(input.previewGeneration);
    if (runtime.requirePreviewGeneration || previewGeneration) {
      const resolvedInputPath = await fs.realpath(inputPathRaw);
      consumePortableImportPreviewToken({
        token: previewGeneration,
        exportId: manifest.exportId,
        localGeneration: getPortableDataLocalGeneration(),
        resolvedInputPath,
      });
    }
    if (selectedImportDomains.includes('MARKET_DATA')) {
      if (isSystemResetExecutionActive()) {
        throw appError('SYSTEM_RESET_IN_PROGRESS');
      }
      recoveryJournalId = createId();
      createPortableImportRecoveryJournal({
        id: recoveryJournalId,
        createdAt: nowIso(),
      });
      runtime.onDurablePhase?.('AFTER_PENDING');
      marketImport = await importMarketDataFromPayload({
        payloadDb,
        conflictMode,
        recoveryJournalId,
        onSourceMutationStateChanged: invalidateLocalDataSourceAccessCache,
      });
      runtime.onDurablePhase?.('AFTER_MARKET_WRITES');
      transitionPortableImportRecoveryJournal({
        journalId: recoveryJournalId,
        fromState: 'PENDING',
        toState: 'MARKET_READY',
        updatedAt: nowIso(),
      });
      runtime.onDurablePhase?.('AFTER_MARKET_READY');
    }
    const domainResult = executePortableImportDomains({
      payloadDb,
      selectedDomains: selectedImportDomains,
      conflictMode,
      settingsConflictMode,
      marketImport,
      onBeforeTransactionCommit: recoveryJournalId
        ? () => {
            marketImport.mutationSourceIds.forEach((sourceId) => {
              if (
                !completePortableMarketSourceMutation({
                  sourceId,
                  updatedAt: nowIso(),
                })
              ) {
                throw appError('LOCAL_DATA_SOURCE_MUTATION_OWNERSHIP_LOST', {
                  sourceId,
                });
              }
            });
            transitionPortableImportRecoveryJournal({
              journalId: recoveryJournalId!,
              fromState: 'MARKET_READY',
              toState: 'COMMITTED',
              updatedAt: nowIso(),
            });
          }
        : undefined,
    });
    if (recoveryJournalId) {
      invalidateLocalDataSourceAccessCache();
    }
    if (recoveryJournalId) {
      runtime.onDurablePhase?.('AFTER_COMMITTED');
      try {
        deleteCommittedPortableImportRecoveryJournal(recoveryJournalId);
      } catch {
        // COMMITTED is durable; startup only needs to remove the journal row.
      }
    }
    markTrainingStatsDirty();
    await Promise.allSettled(
      marketImport.diagnosticSourceIds.map((sourceId) =>
        (runtime.ensureDiagnosticsCache ?? ensureLocalDataSourceDiagnosticsCache)(
          sourceId,
        ),
      ),
    );
    return {
      manifest,
      importedCountByDomain: domainResult.importedCountByDomain,
      skippedCountByDomain: domainResult.skippedCountByDomain,
      conflictCountByDomain: domainResult.conflictCountByDomain,
      remappedIds: {
        notes: domainResult.remappedNotes,
        trainingProjects: domainResult.remappedTrainingProjects,
        specialTrainingSessions: domainResult.remappedSpecialSessions,
        specialTrainingQuestions: domainResult.remappedSpecialQuestions,
      },
      rebind: domainResult.rebind,
      marketImport: marketImport.result,
    };
  } catch (error) {
    if (
      recoveryJournalId &&
      runtime.recoverOnFailure !== false
    ) {
      try {
        await recoverPortableImportJournal(
          recoveryJournalId,
          runtime.recovery,
        );
      } catch {
        // The durable journal is retained and retried during the next startup.
      }
      invalidateLocalDataSourceAccessCache();
    }
    throw error;
  } finally {
    await loaded.cleanup();
  }
};
