// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type MutableRefObject } from 'react';
import {
  api,
  type ApiLocalDataSourceSummary,
  type ApiLocalDataSourceSymbolDiagnostics,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { CustomSamplePool } from '@/frontend-kernel/appTypes';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import {
  findBuiltInSamplePoolById,
  isBuiltInSamplePoolId,
} from '@/domains/trainer/samplePools';
import {
  buildActiveLocalDataImportSourceIds,
  isLocalDataImportSourceBusy,
} from '@/domains/data-import/importActivity';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import type { DestructiveDataChangeFinalizer } from '@/domains/data-import/destructiveDataChangeTypes';
import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';

const resolveMaintenanceFollowUpFailureMessage = (): string =>
  formatMessage(getCurrentUiLanguage(), 'common.status.requestFailed');

type UseDataSourceSymbolActionsArgs = {
  appIsMountedRef: MutableRefObject<boolean>;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  isPreparingCsvImportPreview: boolean;
  activeSamplePoolId: string;
  customSamplePools: CustomSamplePool[];
  localDataSourceSummaries: ApiLocalDataSourceSummary[];
  csvImportCardStates: CsvImportCardState[];
  tt: (key: AppTextKey) => string;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  resolveSamplePoolDisplayName: (poolId: string, fallbackName?: string) => string;
  finalizeDestructiveDataChange: DestructiveDataChangeFinalizer;
  loadSymbol: (
    symbol: string,
    options?: {
      forceNewSession?: boolean;
      cleanupStaleSessions?: boolean;
      poolId?: string;
      poolName?: string;
    }
  ) => Promise<unknown>;
  setError: (value: string) => void;
  setHint: (value: string) => void;
  setActiveSamplePoolId: (value: string) => void;
  setActivePage: (value: WorkspacePage) => void;
};

export const useDataSourceSymbolActions = ({
  appIsMountedRef,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  isPreparingCsvImportPreview,
  activeSamplePoolId,
  customSamplePools,
  localDataSourceSummaries,
  csvImportCardStates,
  tt,
  resolveUnknownErrorMessage,
  resolveSamplePoolDisplayName,
  finalizeDestructiveDataChange,
  loadSymbol,
  setError,
  setHint,
  setActiveSamplePoolId,
  setActivePage,
}: UseDataSourceSymbolActionsArgs) => {
  const removeSymbolsFromSamplePool = useCallback(
    async (poolId: string, symbols: string[]): Promise<boolean> => {
      const normalizedPoolId = String(poolId || '').trim();
      const normalizedSymbols = Array.from(
        new Set(
          (Array.isArray(symbols) ? symbols : [])
            .map((symbol) => String(symbol || '').trim().toUpperCase())
            .filter((symbol) => Boolean(symbol))
        )
      );
      if (!normalizedPoolId || !normalizedSymbols.length) {
        return false;
      }
      if (isBuiltInSamplePoolId(normalizedPoolId)) {
        return false;
      }
      if (isClearingLocalDataSources || deletingSamplePoolId || isPreparingCsvImportPreview) {
        return false;
      }
      const sourceSummary =
        localDataSourceSummaries.find(
          (item) => String(item.id || '').trim() === normalizedPoolId
        ) ?? null;
      if (
        isLocalDataImportSourceBusy(
          normalizedPoolId,
          buildActiveLocalDataImportSourceIds(csvImportCardStates),
          sourceSummary,
        )
      ) {
        return false;
      }
      setError('');
      try {
        await api.removeLocalDataSourceSymbols(normalizedPoolId, normalizedSymbols);
        const followUpResult = await finalizeDestructiveDataChange({
          clearRemovedSymbols: true,
          refreshDataSources: true,
          resetAutoplay: true,
        });
        if (!appIsMountedRef.current) {
          return false;
        }
        setHint(tt('appText.ready'));
        if (followUpResult.failed) {
          setError(resolveMaintenanceFollowUpFailureMessage());
        }
        return true;
      } catch (err) {
        if (!appIsMountedRef.current) {
          return false;
        }
        const message = resolveUnknownErrorMessage(err, tt('appText.readFolder'));
        setError(message);
        return false;
      }
    },
    [
      appIsMountedRef,
      csvImportCardStates,
      deletingSamplePoolId,
      finalizeDestructiveDataChange,
      isClearingLocalDataSources,
      isPreparingCsvImportPreview,
      localDataSourceSummaries,
      resolveUnknownErrorMessage,
      setError,
      setHint,
      tt
    ]
  );

  const fetchDetailSymbolBarsRange = useCallback(
    async (
      symbol: string,
      instrumentId: string,
      baseTimeframe: '1m' | '5m' | '1h' | '1d',
      offset: number,
      limit: number,
      options?: { signal?: AbortSignal }
    ) => {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      const normalizedOffset = Math.max(0, Math.floor(Number(offset) || 0));
      const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
      if (!normalizedSymbol) {
        return {
          total: 0,
          offset: normalizedOffset,
          limit: normalizedLimit,
          bars: []
        };
      }
      const range = await api.getBarsRange(
        normalizedSymbol,
        baseTimeframe,
        normalizedOffset,
        normalizedLimit,
        {
          ...options,
          instrumentId,
        },
      );
      return {
        total: Math.max(0, Math.floor(Number(range.total) || 0)),
        offset: Math.max(0, Math.floor(Number(range.offset) || 0)),
        limit: Math.max(1, Math.floor(Number(range.limit) || 1)),
        bars: Array.isArray(range.bars)
          ? range.bars.map((bar) => ({
              ts: String(bar.ts || ''),
              open: Number(bar.open) || 0,
              high: Number(bar.high) || 0,
              low: Number(bar.low) || 0,
              close: Number(bar.close) || 0,
              volume: Number(bar.volume) || 0
            }))
          : []
      };
    },
    []
  );

  const fetchDetailSymbolDiagnostics = useCallback(
    async (
      sourceId: string,
      symbol: string,
      options?: { signal?: AbortSignal }
    ): Promise<ApiLocalDataSourceSymbolDiagnostics> => {
      const normalizedSourceId = String(sourceId || '').trim();
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      if (!normalizedSourceId || !normalizedSymbol) {
        return {
          symbol: normalizedSymbol,
          baseTimeframe: '1d',
          diagnosticRulesVersion: '',
          status: 'BUILDING',
          generatedAt: null,
          profile: {
            assetClass: 'STOCK',
            marketPresetId: 'A_SHARE',
            profileOrigin: 'INFERRED',
          },
          health: { score: 100, severity: 'INFO', affectedSymbols: 0 },
          totalBars: 0,
          summary: {
            totalIssues: 0,
            criticalIssues: 0,
            warningIssues: 0,
            infoIssues: 0,
            byCategory: {
              TIME_INTEGRITY: 0,
              EXTREME_ANOMALY: 0,
            },
          },
          items: [],
        };
      }
      return api.getLocalDataSourceSymbolDiagnostics(
        normalizedSourceId,
        normalizedSymbol,
        options
      );
    },
    []
  );

  const startTrainingWithSymbol = useCallback(
    async (symbol: string, poolId: string) => {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      if (!normalizedSymbol) {
        return;
      }
      const normalizedPoolId = String(poolId || '').trim() || activeSamplePoolId;
      const builtInPool = normalizedPoolId ? findBuiltInSamplePoolById(normalizedPoolId) : undefined;
      const customPool = normalizedPoolId
        ? customSamplePools.find((pool) => String(pool.id || '').trim() === normalizedPoolId)
        : null;
      const poolName = builtInPool
        ? resolveSamplePoolDisplayName(builtInPool.id, builtInPool.name)
        : customPool
          ? resolveSamplePoolDisplayName(customPool.id, customPool.name)
          : '';

      setActivePage('TRAINER');
      if (normalizedPoolId) {
        setActiveSamplePoolId(normalizedPoolId);
      }
      await loadSymbol(normalizedSymbol, {
        forceNewSession: true,
        cleanupStaleSessions: true,
        poolId: normalizedPoolId || undefined,
        poolName: poolName || undefined
      });
    },
    [
      activeSamplePoolId,
      customSamplePools,
      loadSymbol,
      resolveSamplePoolDisplayName,
      setActivePage,
      setActiveSamplePoolId
    ]
  );

  return {
    removeSymbolsFromSamplePool,
    fetchDetailSymbolBarsRange,
    fetchDetailSymbolDiagnostics,
    startTrainingWithSymbol,
  };
};
