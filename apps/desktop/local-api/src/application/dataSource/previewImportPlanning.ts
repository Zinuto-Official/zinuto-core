// SPDX-License-Identifier: GPL-3.0-only

import {
  buildImportScopeErrorArgs,
  isSameImportScope,
  normalizeImportScopeStrategy,
  resolveNormalizedImportScope,
  toPreviewPlanScope,
} from './importScope.js';
import { validateLocalDataImportDraftMapping } from './importDraftValidation.js';
import { preserveImportWireRelativePath } from '../../domain/dataSource/importPathSemantics.js';
import type { PreviewImportPlanRecord } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataImportSymbolLimit,
  LocalDataImportJobDetail,
  LocalDataSyncPreview,
  LocalDataSourceSummary,
  StartLocalDataFullReimportByPreviewPlanInput,
  StartLocalDataImportByPreviewPlanInput,
  StartLocalDataImportInput,
  StartLocalDataIncrementalUpdateByPreviewPlanInput,
} from './types.js';
import type { TradingCalendarSuggestion } from '@zinuto/shared/tradingCalendar';

type PreviewStore = {
  resolvePlan: (
    previewToken: string,
    previewPlanId: string,
  ) => PreviewImportPlanRecord | null | undefined;
  listPlans: (previewToken: string) => PreviewImportPlanRecord[];
  resolveSuggestedFreeReplayEnvironment?: (
    previewToken: string,
  ) => Pick<LocalDataSourceDiagnosticProfile, 'assetClass' | 'marketPresetId'> | null;
  resolveSuggestedTradingCalendar?: (
    previewToken: string,
  ) => TradingCalendarSuggestion | null;
};

type ResolveImportFilesFromPreviewPlan = (
  previewToken: string,
  previewPlanId: string,
  preferredSourceFolderRaw?: string,
  sourceIdRaw?: string,
  maxSymbolsRaw?: number | null,
  unlockedSourceSymbolsRaw?: readonly string[] | null,
) => Promise<{
  files: StartLocalDataImportInput['files'];
  tempDirPaths: string[];
  sourceFolder: string;
  snapshotSymbols: string[];
  sourceTotalFiles: number;
  symbolLimit: LocalDataImportSymbolLimit;
}>;

type PreviewImportErrorFactory = (
  code: string,
  args?: Record<string, string | number | boolean | null>,
  status?: number,
) => Error;

const normalizeUpperSymbols = (symbols: string[]): string[] =>
  Array.from(
    new Set(
      symbols
        .map((symbol) => String(symbol || '').trim().toUpperCase())
        .filter((symbol) => Boolean(symbol)),
    ),
  ).sort((left, right) => left.localeCompare(right, 'en'));

const preserveRelativePath = preserveImportWireRelativePath;

const resolveUnlockedSourceSymbolsForImport = (
  source: LocalDataSourceSummary,
  maxSymbols: number | null,
): string[] | null =>
  maxSymbols === null
    ? null
    : normalizeUpperSymbols(source.unlockedSymbols ?? []);

const resolveDiagnosticProfileFromPreview = (
  previewStore: PreviewStore,
  previewToken: string,
): LocalDataSourceDiagnosticProfile | undefined => {
  const suggestion =
    previewStore.resolveSuggestedFreeReplayEnvironment?.(previewToken) ?? null;
  return suggestion
    ? {
        assetClass: suggestion.assetClass,
        marketPresetId: suggestion.marketPresetId,
        profileOrigin: 'INFERRED',
      }
    : undefined;
};

const isSupportedBaseTimeframe = (
  value: unknown,
): value is StartLocalDataImportInput['baseTimeframe'] =>
  value === '1m' || value === '5m' || value === '1h' || value === '1d';

const assertResolvedPreviewPlan = (
  resolvedPlan: PreviewImportPlanRecord | null | undefined,
  appError: PreviewImportErrorFactory,
): PreviewImportPlanRecord => {
  if (!resolvedPlan || !Array.isArray(resolvedPlan.files) || !resolvedPlan.files.length) {
    throw appError('LOCAL_DATA_IMPORT_PREVIEW_EXPIRED');
  }
  return resolvedPlan;
};

const resolvePlanBaseTimeframe = (
  resolvedPlan: PreviewImportPlanRecord,
  appError: PreviewImportErrorFactory,
): StartLocalDataImportInput['baseTimeframe'] => {
  if (isSupportedBaseTimeframe(resolvedPlan.baseTimeframe)) {
    return resolvedPlan.baseTimeframe;
  }
  throw appError('CSV_TIMEFRAME_INCONSISTENT', {
    timeframes: String(resolvedPlan.baseTimeframe || '').trim(),
  });
};

const buildPreviewPlanFileKey = (file: {
  path?: unknown;
  originalname?: unknown;
  symbol?: unknown;
}): string =>
  (String(file.path ?? '').trim() ? String(file.path ?? '') : '') ||
  (String(file.originalname ?? '').trim() ? String(file.originalname ?? '') : '') ||
  String(file.symbol || '').trim().toUpperCase();

const throwMappingValidationIssue = (
  validation: ReturnType<typeof validateLocalDataImportDraftMapping>,
  fileName: string,
  appError: PreviewImportErrorFactory,
): never => {
  const issue = validation.issues[0];
  const args = {
    field: issue?.field ?? '',
    header: issue?.header ?? '',
    fileName,
  };
  if (issue?.reasonCode === 'CSV_MAPPING_HEADER_MISSING') {
    throw appError('CSV_MAPPING_HEADER_MISSING', args);
  }
  if (issue?.reasonCode === 'CSV_MAPPING_DUPLICATED') {
    throw appError('CSV_MAPPING_DUPLICATED', args);
  }
  throw appError('CSV_MAPPING_REQUIRED', args);
};

const resolveMappingsFromPreviewPlan = ({
  resolvedPlan,
  resolvedFiles,
  requestedMapping,
  fallbackMapping,
  appError,
}: {
  resolvedPlan: PreviewImportPlanRecord;
  resolvedFiles: StartLocalDataImportInput['files'];
  requestedMapping?: StartLocalDataImportInput['mapping'];
  fallbackMapping?: StartLocalDataImportInput['mapping'];
  appError: PreviewImportErrorFactory;
}): Pick<StartLocalDataImportInput, 'mapping' | 'files'> => {
  if (requestedMapping) {
    const selectedHeaders = [
      requestedMapping.date,
      requestedMapping.time,
      requestedMapping.open,
      requestedMapping.high,
      requestedMapping.low,
      requestedMapping.close,
      requestedMapping.volume,
    ].filter((header) => Boolean(String(header || '').trim()));
    const shapeValidation = validateLocalDataImportDraftMapping(
      requestedMapping,
      selectedHeaders,
    );
    if (!shapeValidation.valid) {
      throwMappingValidationIssue(shapeValidation, '', appError);
    }
  }

  const planFileByKey = new Map(
    resolvedPlan.files.map((file) => [buildPreviewPlanFileKey(file), file] as const),
  );
  const files = resolvedFiles.map((file) => {
    const planFile = planFileByKey.get(buildPreviewPlanFileKey(file));
    const headers = Array.isArray(planFile?.headers) ? planFile.headers : [];
    const automaticMapping = file.mapping ?? planFile?.mapping ?? fallbackMapping;
    if (requestedMapping && headers.length > 0) {
      const requestedValidation = validateLocalDataImportDraftMapping(
        requestedMapping,
        headers,
      );
      if (requestedValidation.valid) {
        return { ...file, mapping: { ...requestedMapping } };
      }
      if (automaticMapping) {
        const automaticValidation = validateLocalDataImportDraftMapping(
          automaticMapping,
          headers,
        );
        if (automaticValidation.valid) {
          return { ...file, mapping: { ...automaticMapping } };
        }
      }
      throwMappingValidationIssue(
        requestedValidation,
        String(file.originalname || '').trim(),
        appError,
      );
    }
    if (automaticMapping) {
      return { ...file, mapping: { ...automaticMapping } };
    }
    if (requestedMapping) {
      return { ...file, mapping: { ...requestedMapping } };
    }
    throw appError('CSV_MAPPING_REQUIRED', {
      fileName: String(file.originalname || '').trim(),
    });
  });
  const mapping =
    files.find((file) => file.mapping)?.mapping ??
    resolvedPlan.files.find((file) => file.mapping)?.mapping ??
    fallbackMapping ??
    requestedMapping;
  if (!mapping) {
    throw appError('CSV_MAPPING_REQUIRED');
  }
  return {
    mapping: { ...mapping },
    files,
  };
};

const resolveTradingCalendarFromPreview = (
  previewStore: PreviewStore,
  previewToken: string,
): StartLocalDataImportInput['tradingCalendar'] => {
  const suggestion = previewStore.resolveSuggestedTradingCalendar?.(previewToken);
  return suggestion
    ? {
        tradingDays: [...suggestion.calendar.tradingDays],
        sessions: suggestion.calendar.sessions.map((session) => ({ ...session })),
      }
    : undefined;
};

export const createPreviewImportPlanningService = ({
  assertLocalImportPreviewAccess,
  assertLocalImportMutationAccess,
  previewStore,
  resolveImportFilesFromPreviewPlan,
  startLocalDataImportJob,
  invalidateLocalDataSourcesCache,
  listLocalDataSources,
  listImportedSymbolsBySource,
  resolveLocalImportSymbolLimit,
  acquireImportTempDirLease = () => () => undefined,
  removeImportTempDirsByPath = async () => undefined,
  appError,
}: {
  assertLocalImportPreviewAccess: (sourceIdRaw?: string) => Promise<void>;
  assertLocalImportMutationAccess: (sourceIdRaw?: string) => Promise<void>;
  previewStore: PreviewStore;
  resolveImportFilesFromPreviewPlan: ResolveImportFilesFromPreviewPlan;
  startLocalDataImportJob: (
    input: StartLocalDataImportInput,
  ) => Promise<LocalDataImportJobDetail>;
  invalidateLocalDataSourcesCache: () => void;
  listLocalDataSources: () => Promise<LocalDataSourceSummary[]>;
  listImportedSymbolsBySource: (sourceId: string) => Array<{ symbol: string }>;
  resolveLocalImportSymbolLimit: () => Promise<number | null>;
  acquireImportTempDirLease?: (paths: string[]) => () => void;
  removeImportTempDirsByPath?: (dirPaths: string[]) => Promise<void>;
  appError: PreviewImportErrorFactory;
}) => {
  const withPreviewPlanTempDirLease = async <Result>(
    resolvedPlan: PreviewImportPlanRecord,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const leasedPaths = [
      String(resolvedPlan.folderPath ?? ''),
      ...resolvedPlan.files.map((file) => String(file.path ?? '')),
    ];
    const releaseAcquiredLease = acquireImportTempDirLease(leasedPaths);
    let leaseReleased = false;
    const releaseLease = (): void => {
      if (leaseReleased) {
        return;
      }
      leaseReleased = true;
      releaseAcquiredLease();
    };

    try {
      return await operation();
    } finally {
      releaseLease();
      await removeImportTempDirsByPath(leasedPaths);
    }
  };

  const findSourceById = async (
    sourceIdRaw: string,
  ): Promise<LocalDataSourceSummary | null> => {
    const normalizedSourceId = String(sourceIdRaw || '').trim();
    if (!normalizedSourceId) {
      return null;
    }
    const sources = await listLocalDataSources();
    return (
      sources.find(
        (item) => String(item.id || '').trim() === normalizedSourceId,
      ) ?? null
    );
  };

  const startLocalDataImportJobFromPreviewPlan = async (
    input: StartLocalDataImportByPreviewPlanInput,
  ): Promise<LocalDataImportJobDetail> => {
    await assertLocalImportMutationAccess();
    const maxSymbols = await resolveLocalImportSymbolLimit();
    const userOverrides = input.userOverrides ?? {};
    const resolvedPlan = assertResolvedPreviewPlan(
      previewStore.resolvePlan(input.previewToken, input.previewPlanId),
      appError,
    );
    return withPreviewPlanTempDirLease(resolvedPlan, async () => {
      const resolved = await resolveImportFilesFromPreviewPlan(
        input.previewToken,
        input.previewPlanId,
        userOverrides.sourceFolder,
        '',
        maxSymbols,
      );
      const resolvedPlanScope = resolveNormalizedImportScope(
        resolvedPlan.strategy,
        resolvedPlan.topLevelSubfolder,
      );
      const resolvedMappings = resolveMappingsFromPreviewPlan({
        resolvedPlan,
        resolvedFiles: resolved.files,
        requestedMapping: input.mapping,
        appError,
      });
      const job = await startLocalDataImportJob({
        sourceName: userOverrides.sourceName ?? '',
        sourceFolder: resolved.sourceFolder,
        sourceFolderBookmarkId: userOverrides.sourceFolderBookmarkId,
        importScopeStrategy: resolvedPlanScope.strategy,
        importScopeTopLevelSubfolder: resolvedPlanScope.topLevelSubfolder,
        timeZone: userOverrides.timeZone,
        timeZoneOrigin: userOverrides.timeZoneOrigin,
        baseTimeframe: resolvePlanBaseTimeframe(resolvedPlan, appError),
        tradingCalendar:
          userOverrides.tradingCalendar ??
          resolveTradingCalendarFromPreview(previewStore, input.previewToken),
        diagnosticProfile: resolveDiagnosticProfileFromPreview(
          previewStore,
          input.previewToken,
        ),
        mapping: resolvedMappings.mapping,
        tempDirPaths: resolved.tempDirPaths,
        files: resolvedMappings.files,
        snapshotSymbols: resolved.snapshotSymbols,
        sourceTotalFiles: resolved.sourceTotalFiles,
        symbolLimit: resolved.symbolLimit,
      });
      invalidateLocalDataSourcesCache();
      return job;
    });
  };

  const startLocalDataIncrementalUpdateJobFromPreviewPlan = async (
    input: StartLocalDataIncrementalUpdateByPreviewPlanInput,
  ): Promise<LocalDataImportJobDetail> => {
    await assertLocalImportMutationAccess(input.sourceId);
    const maxSymbols = await resolveLocalImportSymbolLimit();
    const source = await findSourceById(input.sourceId);
    const normalizedSourceId = String(input.sourceId || '').trim();
    if (!source) {
      throw appError(
        'LOCAL_DATA_SOURCE_NOT_FOUND',
        { sourceId: normalizedSourceId },
        404,
      );
    }
    const userOverrides = input.userOverrides ?? {};
    const resolvedPlan = assertResolvedPreviewPlan(
      previewStore.resolvePlan(input.previewToken, input.previewPlanId),
      appError,
    );
    return withPreviewPlanTempDirLease(resolvedPlan, async () => {
      const planBaseTimeframe = resolvePlanBaseTimeframe(resolvedPlan, appError);
      if (planBaseTimeframe !== source.baseTimeframe) {
        throw appError('CSV_TIMEFRAME_INCONSISTENT', {
          timeframes: planBaseTimeframe,
        });
      }
      const resolved = await resolveImportFilesFromPreviewPlan(
        input.previewToken,
        input.previewPlanId,
        userOverrides.sourceFolder,
        input.sourceId,
        maxSymbols,
        resolveUnlockedSourceSymbolsForImport(source, maxSymbols),
      );
      const resolvedPlanScope = resolveNormalizedImportScope(
        resolvedPlan.strategy,
        resolvedPlan.topLevelSubfolder,
      );
      const savedScope = resolveNormalizedImportScope(
        source.importScopeStrategy,
        source.importScopeTopLevelSubfolder,
      );
      if (!isSameImportScope(savedScope, resolvedPlanScope)) {
        throw appError(
          'LOCAL_DATA_SOURCE_SCOPE_MISMATCH',
          buildImportScopeErrorArgs(savedScope),
        );
      }
      const resolvedMappings = resolveMappingsFromPreviewPlan({
        resolvedPlan,
        resolvedFiles: resolved.files,
        requestedMapping: input.mapping,
        fallbackMapping: source.fieldMapping,
        appError,
      });
      const job = await startLocalDataImportJob({
        sourceId: input.sourceId,
        sourceName: userOverrides.sourceName || '',
        sourceFolder: resolved.sourceFolder,
        sourceFolderBookmarkId: userOverrides.sourceFolderBookmarkId,
        sourceFolderUsageMode:
          userOverrides.sourceFolderUsageMode === 'ONE_OFF'
            ? 'ONE_OFF'
            : 'BOUND_SOURCE',
        importScopeStrategy: resolvedPlanScope.strategy,
        importScopeTopLevelSubfolder: resolvedPlanScope.topLevelSubfolder,
        baseTimeframe: source.baseTimeframe,
        jobMode: 'INCREMENTAL_UPDATE',
        mapping: resolvedMappings.mapping,
        tempDirPaths: resolved.tempDirPaths,
        files: resolvedMappings.files,
        snapshotSymbols: resolved.snapshotSymbols,
        sourceTotalFiles: resolved.sourceTotalFiles,
        symbolLimit: resolved.symbolLimit,
      });
      invalidateLocalDataSourcesCache();
      return job;
    });
  };

  const startLocalDataFullReimportJobFromPreviewPlan = async (
    input: StartLocalDataFullReimportByPreviewPlanInput,
  ): Promise<LocalDataImportJobDetail> => {
    await assertLocalImportMutationAccess(input.sourceId);
    const maxSymbols = await resolveLocalImportSymbolLimit();
    const source = await findSourceById(input.sourceId);
    const normalizedSourceId = String(input.sourceId || '').trim();
    if (!source) {
      throw appError(
        'LOCAL_DATA_SOURCE_NOT_FOUND',
        { sourceId: normalizedSourceId },
        404,
      );
    }
    const userOverrides = input.userOverrides ?? {};
    const resolvedPlan = assertResolvedPreviewPlan(
      previewStore.resolvePlan(input.previewToken, input.previewPlanId),
      appError,
    );
    return withPreviewPlanTempDirLease(resolvedPlan, async () => {
      const resolved = await resolveImportFilesFromPreviewPlan(
        input.previewToken,
        input.previewPlanId,
        userOverrides.sourceFolder,
        input.sourceId,
        maxSymbols,
        resolveUnlockedSourceSymbolsForImport(source, maxSymbols),
      );
      const resolvedPlanScope = resolveNormalizedImportScope(
        resolvedPlan.strategy,
        resolvedPlan.topLevelSubfolder,
      );
      const savedScope = resolveNormalizedImportScope(
        source.importScopeStrategy,
        source.importScopeTopLevelSubfolder,
      );
      if (!isSameImportScope(savedScope, resolvedPlanScope)) {
        throw appError(
          'LOCAL_DATA_SOURCE_SCOPE_MISMATCH',
          buildImportScopeErrorArgs(savedScope),
        );
      }
      const resolvedMappings = resolveMappingsFromPreviewPlan({
        resolvedPlan,
        resolvedFiles: resolved.files,
        requestedMapping: input.mapping,
        fallbackMapping: source.fieldMapping,
        appError,
      });
      const job = await startLocalDataImportJob({
        sourceId: input.sourceId,
        sourceName: userOverrides.sourceName ?? source.name,
        sourceFolder: resolved.sourceFolder,
        sourceFolderBookmarkId: userOverrides.sourceFolderBookmarkId,
        importScopeStrategy: resolvedPlanScope.strategy,
        importScopeTopLevelSubfolder: resolvedPlanScope.topLevelSubfolder,
        timeZone: userOverrides.timeZone,
        timeZoneOrigin: userOverrides.timeZoneOrigin,
        allowExistingSourceTimeZoneChange:
          userOverrides.allowExistingSourceTimeZoneChange,
        baseTimeframe: resolvePlanBaseTimeframe(resolvedPlan, appError),
        tradingCalendar:
          userOverrides.tradingCalendar ??
          resolveTradingCalendarFromPreview(previewStore, input.previewToken),
        diagnosticProfile:
          resolveDiagnosticProfileFromPreview(
            previewStore,
            input.previewToken,
          ) ?? source.diagnosticProfile,
        mapping: resolvedMappings.mapping,
        tempDirPaths: resolved.tempDirPaths,
        files: resolvedMappings.files,
        snapshotSymbols: resolved.snapshotSymbols,
        sourceTotalFiles: resolved.sourceTotalFiles,
        symbolLimit: resolved.symbolLimit,
      });
      invalidateLocalDataSourcesCache();
      return job;
    });
  };

  const previewLocalDataSourceSync = async (input: {
    sourceId: string;
    previewToken: string;
    sourceFolder?: string;
    sourceFolderUsageMode?: 'BOUND_SOURCE' | 'ONE_OFF';
  }): Promise<LocalDataSyncPreview> => {
    await assertLocalImportPreviewAccess(input.sourceId);
    const normalizedSourceId = String(input.sourceId || '').trim();
    const normalizedPreviewToken = String(input.previewToken || '').trim();
    const sourceFolderUsageMode =
      input.sourceFolderUsageMode === 'ONE_OFF' ? 'ONE_OFF' : 'BOUND_SOURCE';
    if (!normalizedSourceId || !normalizedPreviewToken) {
      throw appError('INVALID_PARAMS');
    }

    const source = await findSourceById(normalizedSourceId);
    if (!source) {
      throw appError(
        'LOCAL_DATA_SOURCE_NOT_FOUND',
        { sourceId: normalizedSourceId },
        404,
      );
    }

    const resolvedPreviewPlans = previewStore.listPlans(normalizedPreviewToken);
    const candidatePlans = resolvedPreviewPlans
      .filter(
        (plan) =>
          plan.baseTimeframe === source.baseTimeframe &&
          Math.max(0, Number(plan.fileCount) || 0) > 0,
      )
      .map((plan) => ({
        previewPlanId: String(plan.id || '').trim(),
        strategy: normalizeImportScopeStrategy(plan.strategy) ?? 'FLAT',
        topLevelSubfolder: preserveRelativePath(plan.topLevelSubfolder),
        symbolCount: Math.max(0, Number(plan.symbolCount) || 0),
        fileCount: Math.max(0, Number(plan.fileCount) || 0),
      }))
      .filter((plan) => Boolean(plan.previewPlanId));

    if (!candidatePlans.length) {
      throw appError('CSV_TIMEFRAME_INCONSISTENT', {
        timeframes: source.baseTimeframe,
      });
    }

    const configuredScopeStrategy = normalizeImportScopeStrategy(
      source.importScopeStrategy,
    );
    const configuredScopeTopLevelSubfolder =
      configuredScopeStrategy === 'WITH_PARENT'
        ? preserveRelativePath(source.importScopeTopLevelSubfolder)
        : '';
    const savedScope = resolveNormalizedImportScope(
      configuredScopeStrategy,
      configuredScopeTopLevelSubfolder,
    );
    const exactMatchedPlan =
      candidatePlans.find((plan) =>
        isSameImportScope(savedScope, toPreviewPlanScope(plan)),
      ) ?? null;
    if (!exactMatchedPlan) {
      throw appError(
        'LOCAL_DATA_SOURCE_SCOPE_MISMATCH',
        buildImportScopeErrorArgs(savedScope),
      );
    }
    const matchedPlan = exactMatchedPlan;
    const matchedResolvedPlan = assertResolvedPreviewPlan(
      resolvedPreviewPlans.find(
        (plan) => String(plan.id || '').trim() === matchedPlan.previewPlanId,
      ),
      appError,
    );
    return withPreviewPlanTempDirLease(matchedResolvedPlan, async () => {
      const requiresScopeConfirmation = false;

      let changedFiles = 0;
      let unchangedFiles = 0;
      let addedSymbols: string[] = [];
      let updatedSymbols: string[] = [];
      let missingSymbolsRetained: string[] = [];
      let symbolLimit: LocalDataImportSymbolLimit = {
        limitApplied: false,
        maxSymbols: null,
        selectedSymbols: [],
        skippedSymbols: [],
        skippedSymbolCount: 0,
        reason: null,
      };

      if (matchedPlan.previewPlanId) {
        const maxSymbols = await resolveLocalImportSymbolLimit();
        const resolved = await resolveImportFilesFromPreviewPlan(
          normalizedPreviewToken,
          matchedPlan.previewPlanId,
          input.sourceFolder,
          normalizedSourceId,
          maxSymbols,
          resolveUnlockedSourceSymbolsForImport(source, maxSymbols),
        );
        const existingImportedSymbols = normalizeUpperSymbols(
          listImportedSymbolsBySource(normalizedSourceId).map((item) =>
            String(item.symbol || '').trim().toUpperCase(),
          ),
        );
        const existingImportedSymbolSet = new Set(existingImportedSymbols);
        const changedSymbols = normalizeUpperSymbols(
          resolved.files.map((file) =>
            String(file.symbol || '').trim().toUpperCase(),
          ),
        );
        const snapshotSymbols = normalizeUpperSymbols(
          resolved.snapshotSymbols.map((symbol) =>
            String(symbol || '').trim().toUpperCase(),
          ),
        );
        changedFiles = resolved.files.length;
        unchangedFiles = Math.max(0, resolved.sourceTotalFiles - changedFiles);
        addedSymbols = changedSymbols.filter(
          (symbol) => !existingImportedSymbolSet.has(symbol),
        );
        updatedSymbols = changedSymbols.filter((symbol) =>
          existingImportedSymbolSet.has(symbol),
        );
        const snapshotSymbolSet = new Set(snapshotSymbols);
        missingSymbolsRetained = existingImportedSymbols.filter(
          (symbol) => !snapshotSymbolSet.has(symbol),
        );
        symbolLimit = resolved.symbolLimit;
      }

      return {
        sourceId: normalizedSourceId,
        sourceName: source.name,
        sourceFolder:
          (String(input.sourceFolder ?? '').trim()
            ? String(input.sourceFolder ?? '')
            : '') ||
          (String(source.sourceFolder ?? '').trim()
            ? String(source.sourceFolder ?? '')
            : ''),
        sourceFolderUsageMode,
        baseTimeframe: source.baseTimeframe,
        timeZone: source.timeZone,
        timeZoneOrigin: source.timeZoneOrigin,
        importScopeStrategy: configuredScopeStrategy,
        importScopeTopLevelSubfolder: configuredScopeTopLevelSubfolder,
        matchedPreviewPlanId: matchedPlan.previewPlanId ?? null,
        scopeCandidates: candidatePlans,
        requiresScopeConfirmation,
        changeSummary: {
          changedFiles,
          unchangedFiles,
          addedSymbols,
          updatedSymbols,
          missingSymbolsRetained,
          symbolLimit,
        },
      };
    });
  };

  return {
    startLocalDataImportJobFromPreviewPlan,
    startLocalDataFullReimportJobFromPreviewPlan,
    startLocalDataIncrementalUpdateJobFromPreviewPlan,
    previewLocalDataSourceSync,
  };
};
