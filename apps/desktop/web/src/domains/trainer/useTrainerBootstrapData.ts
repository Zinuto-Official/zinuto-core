// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type {
  ApiLocalDataSourceSummary,
  ApiTradingCalendarConfig,
} from '@/api';
import type { TradingSettings } from '@/domains/training/types';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type { BaseTimeframe } from '@/domains/trainer/trainerTypes';

type InstrumentLike = {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  name: string | null;
  barCount: number;
  barsVersionToken?: string;
  timeZone?: string | null;
  marketPresetId?: string;
  minTradeStep?: number;
  scopeKind?: "SYSTEM" | "LOCAL";
  sourceId?: string | null;
  sourceName?: string | null;
  displayLabel?: string;
};

type CustomSamplePoolLike = {
  id: string;
  name: string;
  assetClass?: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  marketPresetId?: string;
  sourceFolder: string;
  sourceFolderBookmarkId?: string;
  importScopeStrategy?: 'FLAT' | 'WITH_PARENT' | null;
  importScopeTopLevelSubfolder?: string;
  instruments: Array<{
    instrumentId: string;
    samplePoolId: string;
    symbol: string;
    displayLabel: string;
    sourceTimeframe: BaseTimeframe;
    barCount: number;
  }>;
  symbols: string[];
  sourceLocked?: boolean;
  unlockedSymbols?: string[];
  lockedSymbols?: string[];
  lockedSymbolCount?: number;
  lockReason?: string | null;
  fileCount: number;
  storageBytes: number;
  csvFieldMapping: CsvFieldMapping;
  tradingCalendar: ApiTradingCalendarConfig;
  baseTimeframe: BaseTimeframe;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
};

type UseTrainerBootstrapDataParams = {
  appIsMountedRef: MutableRefObject<boolean>;
  samplePoolAllId: string;
  defaultPoolLotSize: number;
  getBuiltInSamplePools: () => Array<{ id: string; lotSize: number }>;
  buildCustomSamplePoolsFromDataSources: (
    sources: ApiLocalDataSourceSummary[],
    resolveSourceFolderById?: (sourceId: string) => string,
    resolvePoolNameOverrideById?: (sourceId: string) => string,
  ) => CustomSamplePoolLike[];
  listInstruments: (options?: { signal?: AbortSignal }) => Promise<InstrumentLike[]>;
  listLocalDataSources: (options?: { signal?: AbortSignal }) => Promise<ApiLocalDataSourceSummary[]>;
  getTradingSettings: (options?: { signal?: AbortSignal }) => Promise<TradingSettings>;
  formatMoney: (value: number, fractionDigits?: number) => string;
  formatRateInput: (rate: number) => string;
  setInstruments: Dispatch<SetStateAction<InstrumentLike[]>>;
  setCustomSamplePools: Dispatch<SetStateAction<CustomSamplePoolLike[]>>;
  setLotSizeByPool: Dispatch<SetStateAction<Record<string, number>>>;
  setEditingSamplePoolId: Dispatch<SetStateAction<string>>;
  setActiveSamplePoolId: Dispatch<SetStateAction<string>>;
  setHistorySamplePoolFilter: Dispatch<SetStateAction<string>>;
  setTradingSettings: Dispatch<SetStateAction<TradingSettings>>;
  setInitialSecuritiesInput: Dispatch<SetStateAction<string>>;
  setTradingAssetClass: Dispatch<SetStateAction<TradingSettings['assetClass']>>;
  setTradingMarketPresetKey: Dispatch<SetStateAction<string>>;
  setMinTradeStepInput: Dispatch<SetStateAction<string>>;
  setCommissionRateInput: Dispatch<SetStateAction<string>>;
  setMakerFeeRateInput: Dispatch<SetStateAction<string>>;
  setTakerFeeRateInput: Dispatch<SetStateAction<string>>;
  setFundingRateInput: Dispatch<SetStateAction<string>>;
  setContractMultiplierInput: Dispatch<SetStateAction<string>>;
  setTransferFeeRateInput: Dispatch<SetStateAction<string>>;
  setRegulatoryFeeRateInput: Dispatch<SetStateAction<string>>;
  setPlatformFeeRateInput: Dispatch<SetStateAction<string>>;
  setTransactionLevyRateInput: Dispatch<SetStateAction<string>>;
  setSlippageRateInput: Dispatch<SetStateAction<string>>;
  setStampDutyRateInput: Dispatch<SetStateAction<string>>;
  setCommissionMinimumFeeInput: Dispatch<SetStateAction<string>>;
  setPlatformFeeMinimumFeeInput: Dispatch<SetStateAction<string>>;
  setTransactionLevyMinimumFeeInput: Dispatch<SetStateAction<string>>;
  setLongFinancingAnnualRateInput: Dispatch<SetStateAction<string>>;
  setLongInitialMarginRatioInput: Dispatch<SetStateAction<string>>;
  setLongMaintenanceMarginRatioInput: Dispatch<SetStateAction<string>>;
  setShortBorrowAnnualRateInput: Dispatch<SetStateAction<string>>;
  setShortInitialMarginRatioInput: Dispatch<SetStateAction<string>>;
  setShortMaintenanceMarginRatioInput: Dispatch<SetStateAction<string>>;
  setStampDutyMode: Dispatch<SetStateAction<'BUY' | 'SELL' | 'DOUBLE'>>;
  setPositionCostMode: Dispatch<SetStateAction<'DILUTED' | 'AVERAGE_OPEN'>>;
  setTradeSettlementMode: Dispatch<SetStateAction<'T0' | 'T1'>>;
  setFreeReplayEndSettlementMode: Dispatch<SetStateAction<TradingSettings['freeReplayEndSettlementMode']>>;
  setTradeAmountIncludesFees: Dispatch<SetStateAction<boolean>>;
  setAllowLongMarginTrading: Dispatch<SetStateAction<boolean>>;
  setAllowShortSelling: Dispatch<SetStateAction<boolean>>;
  setLocalDataSourceSummaries?: Dispatch<SetStateAction<ApiLocalDataSourceSummary[]>>;
  resolveSourceFolderOverrideBySourceId?: (sourceId: string) => string;
  resolveCustomPoolNameOverrideBySourceId?: (sourceId: string) => string;
  shouldWriteGlobalTradingSettingsToForm?: () => boolean;
};

export type GlobalTradingSettingsFormSyncContext = {
  activePage: string;
  sessionId?: string | null;
  hasSessionTradingSettings?: boolean;
  isSessionTerminated?: boolean;
};

export const shouldSyncGlobalTradingSettingsIntoForm = ({
  activePage,
  sessionId,
  hasSessionTradingSettings,
  isSessionTerminated,
}: GlobalTradingSettingsFormSyncContext): boolean => {
  const normalizedSessionId = String(sessionId || '').trim();
  return !(
    activePage === 'TRAINER' &&
    normalizedSessionId &&
    hasSessionTradingSettings &&
    !isSessionTerminated
  );
};

const stableJsonSignature = (value: unknown): string => JSON.stringify(value);

export const buildLocalDataSourceSummariesSignature = (
  sources: ApiLocalDataSourceSummary[],
): string =>
  stableJsonSignature(
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      sourceFolder: source.sourceFolder,
      sourceFolderBookmarkId: source.sourceFolderBookmarkId,
      importScopeStrategy: source.importScopeStrategy,
      importScopeTopLevelSubfolder: source.importScopeTopLevelSubfolder,
      timeZone: source.timeZone,
      timeZoneOrigin: source.timeZoneOrigin,
      baseTimeframe: source.baseTimeframe,
      tradingCalendar: source.tradingCalendar,
      diagnosticProfile: source.diagnosticProfile,
      fieldMapping: source.fieldMapping,
      symbols: source.symbols,
      unlockedSymbols: source.unlockedSymbols,
      lockedSymbols: source.lockedSymbols,
      lockedSymbolCount: source.lockedSymbolCount,
      lockReason: source.lockReason,
      sourceLocked: source.sourceLocked,
      requiresSourceFolderRebind: source.requiresSourceFolderRebind,
      symbolCount: source.symbolCount,
      barCount: source.barCount,
      storageBytes: source.storageBytes,
      totalFiles: source.totalFiles,
      importedFiles: source.importedFiles,
      failedFiles: source.failedFiles,
      timeStartTs: source.timeStartTs,
      timeEndTs: source.timeEndTs,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      lastJob: source.lastJob,
      instruments: source.instruments?.map((instrument) => ({
        instrumentId: instrument.instrumentId,
        samplePoolId: instrument.samplePoolId,
        symbol: instrument.symbol,
        displayLabel: instrument.displayLabel,
        sourceTimeframe: instrument.sourceTimeframe,
        barCount: instrument.barCount,
      })),
      symbolStats: source.symbolStats,
    })),
  );

export const buildCustomSamplePoolsSignature = (
  pools: CustomSamplePoolLike[],
): string =>
  stableJsonSignature(
    pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      assetClass: pool.assetClass,
      marketPresetId: pool.marketPresetId,
      sourceFolder: pool.sourceFolder,
      sourceFolderBookmarkId: pool.sourceFolderBookmarkId,
      importScopeStrategy: pool.importScopeStrategy,
      importScopeTopLevelSubfolder: pool.importScopeTopLevelSubfolder,
      symbols: pool.symbols,
      sourceLocked: pool.sourceLocked,
      unlockedSymbols: pool.unlockedSymbols,
      lockedSymbols: pool.lockedSymbols,
      lockedSymbolCount: pool.lockedSymbolCount,
      lockReason: pool.lockReason,
      fileCount: pool.fileCount,
      storageBytes: pool.storageBytes,
      csvFieldMapping: pool.csvFieldMapping,
      tradingCalendar: pool.tradingCalendar,
      baseTimeframe: pool.baseTimeframe,
      selected: pool.selected,
      instruments: pool.instruments.map((instrument) => ({
        instrumentId: instrument.instrumentId,
        samplePoolId: instrument.samplePoolId,
        symbol: instrument.symbol,
        displayLabel: instrument.displayLabel,
        sourceTimeframe: instrument.sourceTimeframe,
        barCount: instrument.barCount,
      })),
    })),
  );

export const areNumericRecordValuesEqual = (
  left: Record<string, number>,
  right: Record<string, number>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
};

export const useTrainerBootstrapData = ({
  appIsMountedRef,
  samplePoolAllId,
  defaultPoolLotSize,
  getBuiltInSamplePools,
  buildCustomSamplePoolsFromDataSources,
  listInstruments,
  listLocalDataSources,
  getTradingSettings,
  formatMoney,
  formatRateInput,
  setInstruments,
  setCustomSamplePools,
  setLotSizeByPool,
  setEditingSamplePoolId,
  setActiveSamplePoolId,
  setHistorySamplePoolFilter,
  setTradingSettings,
  setInitialSecuritiesInput,
  setTradingAssetClass,
  setTradingMarketPresetKey,
  setMinTradeStepInput,
  setCommissionRateInput,
  setMakerFeeRateInput,
  setTakerFeeRateInput,
  setFundingRateInput,
  setContractMultiplierInput,
  setTransferFeeRateInput,
  setRegulatoryFeeRateInput,
  setPlatformFeeRateInput,
  setTransactionLevyRateInput,
  setSlippageRateInput,
  setStampDutyRateInput,
  setCommissionMinimumFeeInput,
  setPlatformFeeMinimumFeeInput,
  setTransactionLevyMinimumFeeInput,
  setLongFinancingAnnualRateInput,
  setLongInitialMarginRatioInput,
  setLongMaintenanceMarginRatioInput,
  setShortBorrowAnnualRateInput,
  setShortInitialMarginRatioInput,
  setShortMaintenanceMarginRatioInput,
  setStampDutyMode,
  setPositionCostMode,
  setTradeSettlementMode,
  setFreeReplayEndSettlementMode,
  setTradeAmountIncludesFees,
  setAllowLongMarginTrading,
  setAllowShortSelling,
  setLocalDataSourceSummaries,
  resolveSourceFolderOverrideBySourceId,
  resolveCustomPoolNameOverrideBySourceId,
  shouldWriteGlobalTradingSettingsToForm
}: UseTrainerBootstrapDataParams) => {
  const refreshInstruments = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      const next = await listInstruments({ signal: options?.signal });
      if (!appIsMountedRef.current || options?.signal?.aborted) {
        return next;
      }
      setInstruments(next);
      return next;
    },
    [appIsMountedRef, listInstruments, setInstruments]
  );

  const syncCustomSamplePoolsFromDataSources = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      const sources = await listLocalDataSources({ signal: options?.signal });
      if (!appIsMountedRef.current || options?.signal?.aborted) {
        return [] as CustomSamplePoolLike[];
      }
      const sourcesSignature = buildLocalDataSourceSummariesSignature(sources);
      setLocalDataSourceSummaries?.((current) =>
        buildLocalDataSourceSummariesSignature(current) === sourcesSignature
          ? current
          : sources,
      );
      const nextPools = buildCustomSamplePoolsFromDataSources(
        sources,
        resolveSourceFolderOverrideBySourceId,
        resolveCustomPoolNameOverrideBySourceId,
      );
      const nextPoolsSignature = buildCustomSamplePoolsSignature(nextPools);
      setCustomSamplePools((current) =>
        buildCustomSamplePoolsSignature(current) === nextPoolsSignature
          ? current
          : nextPools,
      );
      setLotSizeByPool((current) => {
        const next: Record<string, number> = {};
        getBuiltInSamplePools().forEach((pool) => {
          const raw = current[pool.id];
          const normalizedRaw = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : Number.NaN;
          next[pool.id] =
            Number.isFinite(normalizedRaw) ? normalizedRaw : pool.lotSize;
        });
        nextPools.forEach((pool) => {
          const raw = current[pool.id];
          next[pool.id] = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : defaultPoolLotSize;
        });
        return areNumericRecordValuesEqual(current, next) ? current : next;
      });
      setEditingSamplePoolId((current) => {
        if (!current) {
          return '';
        }
        const keep = nextPools.some((pool) => pool.id === current);
        if (!keep) {
          return '';
        }
        return current;
      });
      setActiveSamplePoolId((current) =>
        current === samplePoolAllId || nextPools.some((pool) => pool.id === current) ? current : samplePoolAllId
      );
      setHistorySamplePoolFilter((current) =>
        current === samplePoolAllId || nextPools.some((pool) => pool.id === current) ? current : samplePoolAllId
      );
      return nextPools;
    },
    [
      appIsMountedRef,
      buildCustomSamplePoolsFromDataSources,
      defaultPoolLotSize,
      getBuiltInSamplePools,
      listLocalDataSources,
      resolveCustomPoolNameOverrideBySourceId,
      resolveSourceFolderOverrideBySourceId,
      samplePoolAllId,
      setActiveSamplePoolId,
      setCustomSamplePools,
      setEditingSamplePoolId,
      setHistorySamplePoolFilter,
      setLotSizeByPool,
      setLocalDataSourceSummaries
    ]
  );

  const refreshTradingSettings = useCallback(
    async (options?: { signal?: AbortSignal }): Promise<TradingSettings> => {
      const next = await getTradingSettings({ signal: options?.signal });
      if (!appIsMountedRef.current || options?.signal?.aborted) {
        return next;
      }
      setTradingSettings(next);
      if (shouldWriteGlobalTradingSettingsToForm?.() === false) {
        return next;
      }
      setInitialSecuritiesInput(formatMoney(next.initialSecuritiesBalance, 0));
      setTradingAssetClass(next.assetClass);
      setTradingMarketPresetKey(next.marketPresetId);
      setMinTradeStepInput(formatRateInput(next.minTradeStep));
      setCommissionRateInput(formatRateInput(next.commissionRate));
      setMakerFeeRateInput(formatRateInput(next.makerFeeRate));
      setTakerFeeRateInput(formatRateInput(next.takerFeeRate));
      setFundingRateInput(formatRateInput(next.fundingRate));
      setContractMultiplierInput(formatRateInput(next.contractMultiplier));
      setTransferFeeRateInput(formatRateInput(next.transferFeeRate));
      setRegulatoryFeeRateInput(formatRateInput(next.regulatoryFeeRate));
      setPlatformFeeRateInput(formatRateInput(next.platformFeeRate));
      setTransactionLevyRateInput(formatRateInput(next.transactionLevyRate));
      setSlippageRateInput(formatRateInput(next.slippageRate));
      setStampDutyRateInput(formatRateInput(next.stampDutyRate));
      setCommissionMinimumFeeInput(formatRateInput(next.commissionMinimumFee));
      setPlatformFeeMinimumFeeInput(formatRateInput(next.platformFeeMinimumFee));
      setTransactionLevyMinimumFeeInput(formatRateInput(next.transactionLevyMinimumFee));
      setLongFinancingAnnualRateInput(formatRateInput(next.longFinancingAnnualRate));
      setLongInitialMarginRatioInput(formatRateInput(next.longInitialMarginRatio));
      setLongMaintenanceMarginRatioInput(formatRateInput(next.longMaintenanceMarginRatio));
      setShortBorrowAnnualRateInput(formatRateInput(next.shortBorrowAnnualRate));
      setShortInitialMarginRatioInput(formatRateInput(next.shortInitialMarginRatio));
      setShortMaintenanceMarginRatioInput(formatRateInput(next.shortMaintenanceMarginRatio));
      setStampDutyMode(next.stampDutyMode);
      setPositionCostMode(next.positionCostMode);
      setTradeSettlementMode(next.tradeSettlementMode);
      setFreeReplayEndSettlementMode(next.freeReplayEndSettlementMode);
      setTradeAmountIncludesFees(Boolean(next.tradeAmountIncludesFees));
      setAllowLongMarginTrading(Boolean(next.allowLongMarginTrading));
      setAllowShortSelling(Boolean(next.allowShortSelling));
      return next;
    },
    [
      appIsMountedRef,
      formatMoney,
      formatRateInput,
      getTradingSettings,
      shouldWriteGlobalTradingSettingsToForm,
      setCommissionRateInput,
      setContractMultiplierInput,
      setFundingRateInput,
      setInitialSecuritiesInput,
      setMakerFeeRateInput,
      setMinTradeStepInput,
      setCommissionMinimumFeeInput,
      setPositionCostMode,
      setPlatformFeeMinimumFeeInput,
      setPlatformFeeRateInput,
      setRegulatoryFeeRateInput,
      setLongFinancingAnnualRateInput,
      setLongInitialMarginRatioInput,
      setLongMaintenanceMarginRatioInput,
      setTakerFeeRateInput,
      setSlippageRateInput,
      setFreeReplayEndSettlementMode,
      setAllowLongMarginTrading,
      setAllowShortSelling,
      setStampDutyMode,
      setStampDutyRateInput,
      setTransactionLevyMinimumFeeInput,
      setTransactionLevyRateInput,
      setShortInitialMarginRatioInput,
      setShortMaintenanceMarginRatioInput,
      setShortBorrowAnnualRateInput,
      setTradeAmountIncludesFees,
      setTradingAssetClass,
      setTradingMarketPresetKey,
      setTradeSettlementMode,
      setTradingSettings,
      setTransferFeeRateInput
    ]
  );

  return {
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings
  };
};
