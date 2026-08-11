// SPDX-License-Identifier: GPL-3.0-only

import type { CsvFieldMapping } from '../../../domain/dataSource/csvFieldMappingTypes.js';
import { IMPORT_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import type { TradingCalendarSuggestion } from '@zinuto/shared/tradingCalendar';
import { appError } from '../../../kernel/appError.js';
import { preserveImportWireRelativePath } from '../../../domain/dataSource/importPathSemantics.js';

type BaseTimeframe = '1m' | '5m' | '1h' | '1d';
type PreviewStrategy = 'FLAT' | 'WITH_PARENT';
type PreviewSuggestedFreeReplayEnvironment = {
  assetClass: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  marketPresetId: string;
};

export type PreviewImportPlanFile = {
  originalname: string;
  path: string;
  size: number;
  mtimeMs: number;
  fingerprint?: string;
  symbol: string;
  relativePath: string;
  detectedTimeframe: BaseTimeframe;
  headers?: string[];
  mapping?: CsvFieldMapping;
};

export type PreviewImportPlanRecord = {
  id: string;
  strategy: PreviewStrategy;
  baseTimeframe: BaseTimeframe;
  topLevelSubfolder: string;
  defaultPoolName?: string;
  folderPath?: string;
  snapshotSymbols?: string[];
  sourceTotalFiles?: number;
  symbolCount: number;
  fileCount: number;
  files: PreviewImportPlanFile[];
};

type PreviewImportPlanStoreRecord = {
  id: string;
  strategy: PreviewStrategy;
  baseTimeframe: BaseTimeframe;
  topLevelSubfolder: string;
  defaultPoolName: string;
  fileKeys: string[];
};

type PreviewImportSessionRecord = {
  token: string;
  createdAtMs: number;
  expiresAtMs: number;
  folderPath: string;
  snapshotSymbols: string[];
  sourceTotalFiles: number;
  suggestedFreeReplayEnvironment: PreviewSuggestedFreeReplayEnvironment | null;
  suggestedTradingCalendar: TradingCalendarSuggestion | null;
  headers: string[];
  filesByKey: Map<string, PreviewImportPlanFile>;
  plansById: Map<string, PreviewImportPlanStoreRecord>;
};

type CreatePreviewImportSessionStoreOptions = {
  ttlMs: number;
  maxEntries: number;
  nowMs: () => number;
  createToken: () => string;
  onDiscardFolder?: (folderPath: string) => void;
};

type SavePreviewImportSessionInput = {
  folderPath: string;
  plans: PreviewImportPlanRecord[];
  snapshotSymbols?: string[];
  sourceTotalFiles?: number;
  suggestedFreeReplayEnvironment?: PreviewSuggestedFreeReplayEnvironment | null;
  suggestedTradingCalendar?: TradingCalendarSuggestion | null;
  headers?: string[];
};

const assertLimit = (condition: boolean, limit: string, max: number): void => {
  if (!condition) {
    throw appError('LOCAL_DATA_IMPORT_LIMIT_EXCEEDED', { limit, max });
  }
};

const preserveNonWhitespaceText = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

const preserveRelativePath = preserveImportWireRelativePath;

const normalizePlanFile = (file: PreviewImportPlanFile): PreviewImportPlanFile => {
  const originalname = preserveRelativePath(file.originalname);
  const filePath = preserveNonWhitespaceText(file.path);
  const relativePath = preserveRelativePath(file.relativePath);
  const symbol = String(file.symbol || '').trim().toUpperCase();
  const size = Math.max(0, Math.floor(Number(file.size) || 0));
  const fingerprint = String(file.fingerprint || '').trim().toLowerCase();
  const headers = Array.isArray(file.headers)
    ? file.headers.map((header) => String(header || '').trim())
    : undefined;
  assertLimit(originalname.length <= INPUT_LIMITS.relativePathChars, 'relativePath', INPUT_LIMITS.relativePathChars);
  assertLimit(filePath.length <= INPUT_LIMITS.pathChars, 'path', INPUT_LIMITS.pathChars);
  assertLimit(relativePath.length <= INPUT_LIMITS.relativePathChars, 'relativePath', INPUT_LIMITS.relativePathChars);
  assertLimit(symbol.length <= INPUT_LIMITS.symbolChars, 'symbol', INPUT_LIMITS.symbolChars);
  assertLimit(size <= IMPORT_LIMITS.maxSingleFileBytes, 'singleFileBytes', IMPORT_LIMITS.maxSingleFileBytes);
  assertLimit(
    !headers || headers.length <= IMPORT_LIMITS.maxColumns,
    'importColumns',
    IMPORT_LIMITS.maxColumns,
  );
  headers?.forEach((header) => {
    assertLimit(
      header.length <= INPUT_LIMITS.csvHeaderChars,
      'csvHeaderChars',
      INPUT_LIMITS.csvHeaderChars,
    );
  });
  return {
    originalname,
    path: filePath,
    size,
    mtimeMs: Math.max(0, Math.floor(Number(file.mtimeMs) || 0)),
    fingerprint,
    symbol,
    relativePath,
    detectedTimeframe: file.detectedTimeframe,
    headers: headers ? [...headers] : undefined,
    mapping: file.mapping ? { ...file.mapping } : undefined
  };
};

const toFileStorageKey = (file: PreviewImportPlanFile): string => {
  const normalizedPath = preserveNonWhitespaceText(file.path);
  if (normalizedPath) {
    return normalizedPath;
  }
  const normalizedName = preserveRelativePath(file.originalname);
  const normalizedRelativePath = preserveRelativePath(file.relativePath);
  return normalizedRelativePath || normalizedName;
};

const assertPlanSymbolUniqueness = (files: PreviewImportPlanFile[]): void => {
  const firstFileBySymbol = new Map<string, PreviewImportPlanFile>();
  files.forEach((file) => {
    const symbol = String(file.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return;
    }
    const existing = firstFileBySymbol.get(symbol);
    if (existing) {
      throw appError('LOCAL_DATA_IMPORT_DUPLICATE_SYMBOL_IN_POOL', {
        symbol,
        fileName: preserveRelativePath(file.relativePath || file.originalname),
        duplicateFileName: preserveRelativePath(
          existing.relativePath || existing.originalname,
        ),
      });
    }
    firstFileBySymbol.set(symbol, file);
  });
};

const cloneResolvedPlan = (
  plan: PreviewImportPlanStoreRecord,
  folderPath: string,
  filesByKey: Map<string, PreviewImportPlanFile>,
  snapshotSymbols: string[],
  sourceTotalFiles: number,
): PreviewImportPlanRecord => {
  const files = plan.fileKeys
    .map((fileKey) => filesByKey.get(fileKey))
    .filter((file): file is PreviewImportPlanFile => Boolean(file))
    .map((file) => ({
      ...file,
      headers: file.headers ? [...file.headers] : undefined,
      mapping: file.mapping ? { ...file.mapping } : undefined,
    }));
  const symbolSet = new Set<string>();
  files.forEach((file) => {
    const symbol = String(file.symbol || '').trim().toUpperCase();
    if (symbol) {
      symbolSet.add(symbol);
    }
  });
  return {
    id: plan.id,
    strategy: plan.strategy,
    baseTimeframe: plan.baseTimeframe,
    topLevelSubfolder: plan.topLevelSubfolder,
    defaultPoolName: plan.defaultPoolName,
    folderPath,
    snapshotSymbols: [...snapshotSymbols],
    sourceTotalFiles,
    symbolCount: symbolSet.size,
    fileCount: files.length,
    files
  };
};

export const createPreviewImportSessionStore = ({
  ttlMs,
  maxEntries,
  nowMs,
  createToken,
  onDiscardFolder
}: CreatePreviewImportSessionStoreOptions) => {
  const normalizedTtlMs = Math.max(1, Math.floor(Number(ttlMs) || 0));
  const normalizedMaxEntries = Math.max(1, Math.floor(Number(maxEntries) || 0));
  const sessions = new Map<string, PreviewImportSessionRecord>();

  const discardSession = (
    token: string,
    options?: {
      cleanupFolder?: boolean;
    }
  ): void => {
    const session = sessions.get(token);
    if (!session) {
      return;
    }
    sessions.delete(token);
    if (options?.cleanupFolder === false) {
      return;
    }
    const folderPath = preserveNonWhitespaceText(session.folderPath);
    if (!folderPath) {
      return;
    }
    onDiscardFolder?.(folderPath);
  };

  const cleanupExpiredSessions = (): void => {
    const now = nowMs();
    Array.from(sessions.entries()).forEach(([token, session]) => {
      if (session.expiresAtMs <= now) {
        discardSession(token);
      }
    });
  };

  const trimOverflowSessions = (): void => {
    if (sessions.size <= normalizedMaxEntries) {
      return;
    }
    const sortedTokens = Array.from(sessions.values())
      .sort((left, right) => left.createdAtMs - right.createdAtMs)
      .map((session) => session.token);
    while (sessions.size > normalizedMaxEntries && sortedTokens.length > 0) {
      const token = sortedTokens.shift();
      if (!token) {
        break;
      }
      discardSession(token);
    }
  };

  const save = ({
    folderPath,
    plans,
    snapshotSymbols,
    sourceTotalFiles,
    suggestedFreeReplayEnvironment,
    suggestedTradingCalendar,
    headers,
  }: SavePreviewImportSessionInput): string => {
    cleanupExpiredSessions();
    const filesByKey = new Map<string, PreviewImportPlanFile>();
    const plansById = new Map<string, PreviewImportPlanStoreRecord>();
    const normalizedPlans = Array.isArray(plans) ? plans : [];
    let totalBytes = 0;

    normalizedPlans.forEach((plan) => {
      const normalizedPlanId = String(plan.id || '').trim();
      if (!normalizedPlanId || plansById.has(normalizedPlanId)) {
        return;
      }
      const fileKeys: string[] = [];
      const rawFiles = Array.isArray(plan.files) ? plan.files : [];
      const normalizedFilesForPlan: PreviewImportPlanFile[] = [];
      rawFiles.forEach((file) => {
        const normalizedFile = normalizePlanFile(file);
        normalizedFilesForPlan.push(normalizedFile);
        const fileStorageKey = toFileStorageKey(normalizedFile);
        if (!fileStorageKey) {
          return;
        }
        if (!filesByKey.has(fileStorageKey)) {
          filesByKey.set(fileStorageKey, normalizedFile);
          totalBytes += normalizedFile.size;
          assertLimit(filesByKey.size <= IMPORT_LIMITS.maxFiles, 'files', IMPORT_LIMITS.maxFiles);
          assertLimit(totalBytes <= IMPORT_LIMITS.maxTotalBytes, 'totalBytes', IMPORT_LIMITS.maxTotalBytes);
        }
        fileKeys.push(fileStorageKey);
      });
      assertPlanSymbolUniqueness(normalizedFilesForPlan);
      plansById.set(normalizedPlanId, {
        id: normalizedPlanId,
        strategy: plan.strategy,
        baseTimeframe: plan.baseTimeframe,
        topLevelSubfolder: preserveRelativePath(plan.topLevelSubfolder),
        defaultPoolName: String(plan.defaultPoolName || '').trim(),
        fileKeys
      });
    });

    const token = createToken();
    const now = nowMs();
    const normalizedSnapshotSymbols = Array.from(
      new Set(
        (Array.isArray(snapshotSymbols) ? snapshotSymbols : [])
          .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => Boolean(item))
      )
    ).sort((left, right) => left.localeCompare(right, 'en'));
    assertLimit(normalizedSnapshotSymbols.length <= IMPORT_LIMITS.maxFiles, 'files', IMPORT_LIMITS.maxFiles);
    const normalizedSourceTotalFiles = Math.max(
      0,
      Math.floor(Number(sourceTotalFiles ?? normalizedSnapshotSymbols.length) || 0),
      normalizedSnapshotSymbols.length,
    );
    const normalizedHeaders = Array.from(
      new Set(
        (Array.isArray(headers) ? headers : [])
          .map((item) => String(item || '').trim())
          .filter((item) => Boolean(item)),
      ),
    );
    assertLimit(normalizedHeaders.length <= IMPORT_LIMITS.maxColumns, 'columns', IMPORT_LIMITS.maxColumns);
    normalizedHeaders.forEach((header) => {
      assertLimit(header.length <= INPUT_LIMITS.csvHeaderChars, 'csvHeaderChars', INPUT_LIMITS.csvHeaderChars);
    });
    sessions.set(token, {
      token,
      folderPath: preserveNonWhitespaceText(folderPath),
      createdAtMs: now,
      expiresAtMs: now + normalizedTtlMs,
      snapshotSymbols: normalizedSnapshotSymbols,
      sourceTotalFiles: normalizedSourceTotalFiles,
      suggestedFreeReplayEnvironment: suggestedFreeReplayEnvironment
        ? {
            assetClass: suggestedFreeReplayEnvironment.assetClass,
            marketPresetId: String(
              suggestedFreeReplayEnvironment.marketPresetId || '',
            ).trim(),
          }
        : null,
      suggestedTradingCalendar: suggestedTradingCalendar
        ? {
            calendar: {
              tradingDays: [...suggestedTradingCalendar.calendar.tradingDays],
              sessions: suggestedTradingCalendar.calendar.sessions.map((session) => ({
                ...session,
              })),
            },
            confidence: suggestedTradingCalendar.confidence,
            origin: suggestedTradingCalendar.origin,
            sampleCount: suggestedTradingCalendar.sampleCount,
            activeDayCount: suggestedTradingCalendar.activeDayCount,
          }
        : null,
      headers: normalizedHeaders,
      filesByKey,
      plansById
    });
    trimOverflowSessions();
    return token;
  };

  const resolvePlan = (tokenRaw: string, planIdRaw: string): PreviewImportPlanRecord | null => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    const planId = String(planIdRaw || '').trim();
    if (!token || !planId) {
      return null;
    }
    const session = sessions.get(token);
    if (!session) {
      return null;
    }
    const plan = session.plansById.get(planId);
    if (!plan) {
      return null;
    }
    return cloneResolvedPlan(
      plan,
      session.folderPath,
      session.filesByKey,
      session.snapshotSymbols,
      session.sourceTotalFiles,
    );
  };

  const listPlans = (tokenRaw: string): PreviewImportPlanRecord[] => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    if (!token) {
      return [];
    }
    const session = sessions.get(token);
    if (!session) {
      return [];
    }
    return Array.from(session.plansById.values()).map((plan) =>
      cloneResolvedPlan(
        plan,
        session.folderPath,
        session.filesByKey,
        session.snapshotSymbols,
        session.sourceTotalFiles,
      )
    );
  };

  const listFolderPaths = (): string[] => {
    cleanupExpiredSessions();
    return Array.from(
      new Set(
        Array.from(sessions.values())
          .map((session) => preserveNonWhitespaceText(session.folderPath))
          .filter((folderPath) => Boolean(folderPath)),
      ),
    );
  };

  const resolveSuggestedFreeReplayEnvironment = (
    tokenRaw: string,
  ): PreviewSuggestedFreeReplayEnvironment | null => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    if (!token) {
      return null;
    }
    const session = sessions.get(token);
    return session?.suggestedFreeReplayEnvironment
      ? { ...session.suggestedFreeReplayEnvironment }
      : null;
  };

  const resolveSuggestedTradingCalendar = (
    tokenRaw: string,
  ): TradingCalendarSuggestion | null => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    if (!token) {
      return null;
    }
    const session = sessions.get(token);
    return session?.suggestedTradingCalendar
      ? {
          calendar: {
            tradingDays: [...session.suggestedTradingCalendar.calendar.tradingDays],
            sessions: session.suggestedTradingCalendar.calendar.sessions.map((item) => ({
              ...item,
            })),
          },
          confidence: session.suggestedTradingCalendar.confidence,
          origin: session.suggestedTradingCalendar.origin,
          sampleCount: session.suggestedTradingCalendar.sampleCount,
          activeDayCount: session.suggestedTradingCalendar.activeDayCount,
        }
      : null;
  };

  const resolveHeaders = (tokenRaw: string): string[] => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    if (!token) {
      return [];
    }
    const session = sessions.get(token);
    return session ? [...session.headers] : [];
  };

  const consumePlan = (tokenRaw: string, planIdRaw: string): PreviewImportPlanRecord | null => {
    cleanupExpiredSessions();
    const token = String(tokenRaw || '').trim();
    const planId = String(planIdRaw || '').trim();
    if (!token || !planId) {
      return null;
    }
    const session = sessions.get(token);
    if (!session) {
      return null;
    }
    const plan = session.plansById.get(planId);
    if (!plan) {
      return null;
    }
    const resolvedPlan = cloneResolvedPlan(
      plan,
      session.folderPath,
      session.filesByKey,
      session.snapshotSymbols,
      session.sourceTotalFiles,
    );
    discardSession(token, { cleanupFolder: false });
    return resolvedPlan;
  };

  const clear = (): void => {
    Array.from(sessions.keys()).forEach((token) => {
      discardSession(token);
    });
  };

  return {
    save,
    resolvePlan,
    listPlans,
    listFolderPaths,
    resolveSuggestedFreeReplayEnvironment,
    resolveSuggestedTradingCalendar,
    resolveHeaders,
    consumePlan,
    discard: (token: string, options?: { cleanupFolder?: boolean }) => {
      discardSession(String(token || '').trim(), options);
    },
    clear,
    cleanupExpiredSessions
  };
};

export type PreviewImportSessionStore = ReturnType<
  typeof createPreviewImportSessionStore
>;
