// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ApiLocalDataSourceSummary } from '@/api';
import type {
  CustomSamplePool,
  CustomSamplePoolInstrument
} from "@/frontend-kernel/appTypes";
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';
import {
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
  trimAndLimitInputText,
} from '@zinuto/shared/input-limits';
import { DEFAULT_TRADING_CALENDAR_CONFIG } from '@zinuto/shared/tradingCalendar';
import { normalizeApiTradingCalendarConfig } from '@/api';
import {
  DEFAULT_CSV_FIELD_MAPPING,
  normalizeCsvFieldMapping
} from '@/domains/data-import/csvHelpers';
import { isLocalDataSourceEligibleForTraining } from '@zinuto/shared/localDataSourceEligibility';
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
  findBuiltInSamplePoolById,
  getBuiltInSamplePools
} from '@/domains/trainer/samplePools';
import {
  normalizeNativeImportDirectoryPath,
  normalizeNativeImportRelativePath,
} from '@/domains/data-import/nativeImportHelpers';

const SAMPLE_POOL_TOKEN_PATTERN = /^__sample_pool_[a-z0-9_-]+__$/i;
const GENERATED_SAMPLE_POOL_NAME_PATTERN = /^pool[-_]\d+(?:[-_]\d+){0,2}[-_][a-z0-9]{4,}$/i;

const looksLikeGeneratedSamplePoolName = (value: string): boolean => {
  const normalized = (value || '').trim();
  if (!normalized) {
    return false;
  }
  return GENERATED_SAMPLE_POOL_NAME_PATTERN.test(normalized);
};

export const normalizeReservedSamplePoolTokenName = (value: string): string => {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }
  const language = getCurrentUiLanguage();
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === SAMPLE_POOL_ALL_ID) {
    return formatMessage(language, 'app.samplePool.all');
  }
  const builtInPool = findBuiltInSamplePoolById(normalizedLower);
  if (builtInPool) {
    return builtInPool.name;
  }
  if (normalizedLower === SAMPLE_POOL_UNKNOWN_ID) {
    return SAMPLE_POOL_UNKNOWN_NAME();
  }
  if (SAMPLE_POOL_TOKEN_PATTERN.test(normalizedLower)) {
    if (normalizedLower.includes('_all__')) {
      return formatMessage(language, 'app.samplePool.all');
    }
    const tokenBuiltInPool = findBuiltInSamplePoolById(normalizedLower);
    if (tokenBuiltInPool) {
      return tokenBuiltInPool.name;
    }
    if (normalizedLower.includes('_unknown__')) {
      return SAMPLE_POOL_UNKNOWN_NAME();
    }
    return formatMessage(language, 'app.samplePool.unnamed');
  }
  return normalized;
};

export const sanitizeSamplePoolName = (
  raw: string,
  fallback = formatMessage(getCurrentUiLanguage(), 'common.entity.samplePool')
): string => {
  const normalized = trimAndLimitInputText(
    normalizeReservedSamplePoolTokenName(raw),
    INPUT_LIMITS.samplePoolNameChars,
  );
  if (normalized && !looksLikeGeneratedSamplePoolName(normalized)) {
    return normalized;
  }
  const normalizedFallback = trimAndLimitInputText(
    normalizeReservedSamplePoolTokenName(fallback),
    INPUT_LIMITS.samplePoolNameChars,
  );
  if (normalizedFallback && !looksLikeGeneratedSamplePoolName(normalizedFallback)) {
    return normalizedFallback;
  }
  return formatMessage(getCurrentUiLanguage(), 'app.samplePool.unnamed');
};

const RESERVED_SAMPLE_POOL_IDS = new Set<string>([
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  ...getBuiltInSamplePools().map((pool) => pool.id)
]);

export const isReservedSamplePoolId = (poolId: string): boolean =>
  RESERVED_SAMPLE_POOL_IDS.has((poolId || '').trim().toLowerCase());

export const normalizeCustomSamplePoolNameOverride = (value: unknown): string => {
  const normalized = trimAndLimitInputText(
    normalizeReservedSamplePoolTokenName(String(value ?? '')),
    INPUT_LIMITS.samplePoolNameChars,
  );
  return normalized && !looksLikeGeneratedSamplePoolName(normalized) ? normalized : '';
};

export const normalizeCustomSamplePoolNameOverrides = (
  value: unknown,
): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const next: Record<string, string> = {};
  Object.entries(value)
    .slice(0, INPUT_ARRAY_LIMITS.enabledSamplePools)
    .forEach(([poolId, rawName]) => {
      const normalizedPoolId = trimAndLimitInputText(poolId, INPUT_LIMITS.idChars);
      const normalizedName = normalizeCustomSamplePoolNameOverride(rawName);
      if (!normalizedPoolId || isReservedSamplePoolId(normalizedPoolId) || !normalizedName) {
        return;
      }
      next[normalizedPoolId] = normalizedName;
    });
  return next;
};

const normalizeBaseTimeframe = (value: unknown, fallback: BaseTimeframe = '1d'): BaseTimeframe =>
  value === '1m' || value === '5m' || value === '1h' || value === '1d'
    ? value
    : fallback;

const normalizeSymbolList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((symbol) => String(symbol || '').trim().toUpperCase())
            .filter((symbol) => Boolean(symbol)),
        ),
      )
    : [];

export const normalizeCustomSamplePools = (value: unknown): CustomSamplePool[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalizedPools = value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((rawPool, index) => {
      const fallbackName = formatMessage(getCurrentUiLanguage(), 'app.samplePool.name', {
        index: index + 1,
      });
      const csvFieldMapping = normalizeCsvFieldMapping(rawPool.csvFieldMapping) ?? DEFAULT_CSV_FIELD_MAPPING;
      const tradingCalendar = normalizeApiTradingCalendarConfig(
        rawPool.tradingCalendar,
      );
      const baseTimeframe = normalizeBaseTimeframe(rawPool.baseTimeframe);
      const normalizedPoolId =
        typeof rawPool.id === 'string' && rawPool.id.trim()
          ? rawPool.id.trim()
          : `pool-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      const rawInstruments = Array.isArray(rawPool.instruments) ? rawPool.instruments : [];
      const instruments = Array.from(
        new Map(
          rawInstruments
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
            .map((rawInstrument): CustomSamplePoolInstrument => {
              const instrumentId = String(rawInstrument.instrumentId || '').trim();
              const symbol = String(rawInstrument.symbol || '').trim().toUpperCase();
              const sourceTimeframe = normalizeBaseTimeframe(rawInstrument.sourceTimeframe, baseTimeframe);
              return {
                instrumentId,
                samplePoolId: normalizedPoolId,
                symbol,
                displayLabel: String(rawInstrument.displayLabel || symbol).trim() || symbol,
                sourceTimeframe,
                barCount: Math.max(0, Math.floor(Number(rawInstrument.barCount) || 0)),
              };
            })
            .filter((instrument) => instrument.instrumentId && instrument.symbol)
            .map((instrument) => [instrument.instrumentId, instrument]),
        ).values(),
      );
      const symbols = Array.from(new Set(instruments.map((instrument) => instrument.symbol)));
      const unlockedSymbols = normalizeSymbolList(rawPool.unlockedSymbols);
      const lockedSymbols = normalizeSymbolList(rawPool.lockedSymbols);
      return {
        id: normalizedPoolId,
        name: sanitizeSamplePoolName(typeof rawPool.name === 'string' ? rawPool.name : '', fallbackName),
        assetClass:
          rawPool.assetClass === 'FUTURES' ||
          rawPool.assetClass === 'FOREX' ||
          rawPool.assetClass === 'CRYPTO'
            ? rawPool.assetClass
            : rawPool.assetClass === 'STOCK'
              ? 'STOCK'
              : undefined,
        marketPresetId:
          typeof rawPool.marketPresetId === 'string' && rawPool.marketPresetId.trim()
            ? rawPool.marketPresetId.trim()
            : undefined,
        sourceFolder: typeof rawPool.sourceFolder === 'string' ? rawPool.sourceFolder : '',
        sourceFolderBookmarkId:
          typeof rawPool.sourceFolderBookmarkId === 'string' ? rawPool.sourceFolderBookmarkId.trim() : '',
        importScopeStrategy:
          rawPool.importScopeStrategy === 'FLAT' || rawPool.importScopeStrategy === 'WITH_PARENT'
            ? rawPool.importScopeStrategy
            : null,
        importScopeTopLevelSubfolder:
          typeof rawPool.importScopeTopLevelSubfolder === 'string'
            ? normalizeNativeImportRelativePath(rawPool.importScopeTopLevelSubfolder)
            : '',
        instruments,
        symbols,
        sourceLocked: Boolean(rawPool.sourceLocked),
        unlockedSymbols: unlockedSymbols.length ? unlockedSymbols : symbols,
        lockedSymbols,
        lockedSymbolCount: Math.max(
          lockedSymbols.length,
          Math.floor(Number(rawPool.lockedSymbolCount) || 0),
        ),
        lockReason: typeof rawPool.lockReason === 'string' && rawPool.lockReason.trim()
          ? rawPool.lockReason.trim()
          : null,
        fileCount: Number.isFinite(Number(rawPool.fileCount))
          ? Math.max(0, Math.floor(Number(rawPool.fileCount)))
          : symbols.length,
        storageBytes: Number.isFinite(Number(rawPool.storageBytes))
          ? Math.max(0, Math.floor(Number(rawPool.storageBytes)))
          : 0,
        csvFieldMapping: { ...csvFieldMapping },
        tradingCalendar,
        baseTimeframe,
        selected: true,
        createdAt:
          typeof rawPool.createdAt === 'string' && rawPool.createdAt ? rawPool.createdAt : new Date().toISOString(),
        updatedAt:
          typeof rawPool.updatedAt === 'string' && rawPool.updatedAt ? rawPool.updatedAt : new Date().toISOString()
      } satisfies CustomSamplePool;
    });
  const uniqueById = new Map<string, CustomSamplePool>();
  normalizedPools.forEach((pool) => {
    const normalizedPoolId = (pool.id || '').trim();
    if (
      !normalizedPoolId ||
      isReservedSamplePoolId(normalizedPoolId) ||
      uniqueById.has(normalizedPoolId) ||
      !Array.isArray(pool.instruments) ||
      pool.instruments.length <= 0
    ) {
      return;
    }
    uniqueById.set(normalizedPoolId, {
      ...pool,
      id: normalizedPoolId
    });
  });
  return Array.from(uniqueById.values());
};

export const buildCustomSamplePoolsFromDataSources = (
  sources: ApiLocalDataSourceSummary[],
  resolveSourceFolderById?: (sourceId: string) => string,
  resolvePoolNameOverrideById?: (sourceId: string) => string,
): CustomSamplePool[] => {
  const readySourceRows = sources.filter(
    (source) =>
      isLocalDataSourceEligibleForTraining(source) &&
      !isReservedSamplePoolId(source.id),
  );
  return readySourceRows.flatMap((source, index) => {
    const normalizedSourceId = (source.id || '').trim();
    if (!normalizedSourceId) {
      return [];
    }
    const unlockedSymbolSet = new Set(normalizeSymbolList(source.unlockedSymbols));
    const hasExplicitUnlockedSymbols = unlockedSymbolSet.size > 0 || source.sourceLocked;
    const instruments = Array.from(
      new Map(
        (Array.isArray(source.instruments) ? source.instruments : [])
          .filter((instrument) => {
            if (!hasExplicitUnlockedSymbols) {
              return true;
            }
            const symbol = String(instrument.symbol || '').trim().toUpperCase();
            return unlockedSymbolSet.has(symbol);
          })
          .map((instrument): CustomSamplePoolInstrument => {
            const instrumentId = String(instrument.instrumentId || '').trim();
            const symbol = String(instrument.symbol || '').trim().toUpperCase();
            const sourceTimeframe = normalizeBaseTimeframe(
              instrument.sourceTimeframe,
              source.baseTimeframe,
            );
            return {
              instrumentId,
              samplePoolId: String(instrument.samplePoolId || normalizedSourceId).trim() || normalizedSourceId,
              symbol,
              displayLabel: String(instrument.displayLabel || symbol).trim() || symbol,
              sourceTimeframe,
              barCount: Math.max(0, Math.floor(Number(instrument.barCount) || 0)),
            };
          })
          .filter((instrument) => instrument.instrumentId && instrument.symbol)
          .map((instrument) => [instrument.instrumentId, instrument]),
      ).values(),
    );
    const normalizedSymbols = Array.from(new Set(instruments.map((instrument) => instrument.symbol)));
    if (!instruments.length || isReservedSamplePoolId(normalizedSourceId)) {
      return [];
    }
    const mapping =
      normalizeCsvFieldMapping(source.fieldMapping) ?? { ...DEFAULT_CSV_FIELD_MAPPING };
    const fallbackName = formatMessage(getCurrentUiLanguage(), 'app.samplePool.name', {
      index: index + 1,
    });
    const sourceFolderOverride = normalizeNativeImportDirectoryPath(
      resolveSourceFolderById?.(normalizedSourceId) ?? '',
    );
    const nameOverride = normalizeCustomSamplePoolNameOverride(
      resolvePoolNameOverrideById?.(normalizedSourceId),
    );
    return [{
      id: normalizedSourceId,
      name: sanitizeSamplePoolName(nameOverride || source.name || '', fallbackName),
      assetClass: source.diagnosticProfile.assetClass,
      marketPresetId: source.diagnosticProfile.marketPresetId,
      sourceFolder:
        sourceFolderOverride ||
        normalizeNativeImportDirectoryPath(source.sourceFolder || '') ||
        source.name ||
        '',
      sourceFolderBookmarkId: String(source.sourceFolderBookmarkId || '').trim(),
      importScopeStrategy: source.importScopeStrategy ?? null,
      importScopeTopLevelSubfolder: normalizeNativeImportRelativePath(
        source.importScopeTopLevelSubfolder || '',
      ),
      instruments,
      symbols: normalizedSymbols,
      sourceLocked: Boolean(source.sourceLocked),
      unlockedSymbols: normalizeSymbolList(source.unlockedSymbols),
      lockedSymbols: normalizeSymbolList(source.lockedSymbols),
      lockedSymbolCount: Math.max(0, Math.floor(Number(source.lockedSymbolCount) || 0)),
      lockReason: source.lockReason ?? null,
      fileCount: Math.max(0, Math.floor(Number(source.totalFiles ?? normalizedSymbols.length))),
      storageBytes: Math.max(0, Math.floor(Number(source.storageBytes ?? 0))),
      csvFieldMapping: { ...mapping },
      tradingCalendar: normalizeApiTradingCalendarConfig(
        source.tradingCalendar ?? DEFAULT_TRADING_CALENDAR_CONFIG,
      ),
      baseTimeframe: source.baseTimeframe,
      selected: true,
      createdAt: source.createdAt || new Date().toISOString(),
      updatedAt: source.updatedAt || new Date().toISOString()
    } satisfies CustomSamplePool];
  });
};
