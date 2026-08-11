// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { OhlcvBar } from '../../domain/models.js';
import {
  createTradingSettingsReadStore,
  type UserSettingsRow,
} from '../ports/infrastructure/db/trading/settingsReadStore.js';
import type { AccountRow, InstrumentRow, TradingSettings } from '../../domain/trading/types.js';

type BarsRangeResult = {
  symbol: string;
  timeframe: string;
  timeZone: string | null;
  total: number;
  offset: number;
  limit: number;
  bars: OhlcvBar[];
};

type CreateTradingSettingsReadOpsDeps = {
  db: Pick<Database.Database, 'prepare' | 'transaction'>;
  DEFAULT_USER_ID: string;
  DEFAULT_INITIAL_SECURITIES_BALANCE: number;
  DEFAULT_TRADING_ASSET_CLASS: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  DEFAULT_TRADING_MARKET_PRESET_ID: string;
  DEFAULT_MIN_TRADE_STEP: number;
  DEFAULT_COMMISSION_RATE: number;
  DEFAULT_MAKER_FEE_RATE: number;
  DEFAULT_TAKER_FEE_RATE: number;
  DEFAULT_FUNDING_RATE: number;
  DEFAULT_CONTRACT_MULTIPLIER: number;
  DEFAULT_TRANSFER_FEE_RATE: number;
  DEFAULT_REGULATORY_FEE_RATE: number;
  DEFAULT_PLATFORM_FEE_RATE: number;
  DEFAULT_TRANSACTION_LEVY_RATE: number;
  DEFAULT_SLIPPAGE_RATE: number;
  DEFAULT_STAMP_DUTY_RATE: number;
  DEFAULT_COMMISSION_MINIMUM_FEE: number;
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE: number;
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE: number;
  DEFAULT_LONG_FINANCING_ANNUAL_RATE: number;
  DEFAULT_LONG_INITIAL_MARGIN_RATIO: number;
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO: number;
  DEFAULT_SHORT_BORROW_ANNUAL_RATE: number;
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO: number;
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO: number;
  DEFAULT_STAMP_DUTY_MODE: 'BUY' | 'SELL' | 'DOUBLE';
  DEFAULT_STAMP_DUTY_SINGLE_SIDE: 'BUY' | 'SELL';
  DEFAULT_POSITION_COST_MODE: 'DILUTED' | 'AVERAGE_OPEN';
  DEFAULT_TRADE_SETTLEMENT_MODE: 'T0' | 'T1';
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES: boolean;
  DEFAULT_ALLOW_LONG_MARGIN_TRADING: boolean;
  DEFAULT_ALLOW_SHORT_SELLING: boolean;
  barsRangeLimitMax: number;
  SYSTEM_SEED_MARKET_PRESET_ID: string;
  resolveSystemSeedMarketPresetId: (symbol: string, baseTimeframe?: string | null) => string | null;
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  getInstrumentBySymbol: (symbol: string, timeframe?: string) => InstrumentRow | undefined;
  getInstrumentById: (instrumentId: string) => InstrumentRow | undefined;
  ensureInstrumentMarketBarsReady: (instrument: InstrumentRow) => Promise<number>;
  getBarsByInstrumentId: (instrumentId: string) => Promise<OhlcvBar[]>;
  getBarsByInstrumentIdRange: (
    instrumentId: string,
    offset: number,
    limit: number,
    options?: { signal?: AbortSignal },
  ) => Promise<OhlcvBar[]>;
  getAccount: () => AccountRow;
  setAccountBalance: (accountId: string, value: number) => void;
  ensureSystemMarketSeedReady: () => Promise<void>;
};

export const createTradingSettingsReadOps = (deps: CreateTradingSettingsReadOpsDeps) => {
  const {
    db,
    DEFAULT_USER_ID,
    DEFAULT_INITIAL_SECURITIES_BALANCE,
    DEFAULT_TRADING_ASSET_CLASS,
    DEFAULT_TRADING_MARKET_PRESET_ID,
    DEFAULT_MIN_TRADE_STEP,
    DEFAULT_COMMISSION_RATE,
    DEFAULT_MAKER_FEE_RATE,
    DEFAULT_TAKER_FEE_RATE,
    DEFAULT_FUNDING_RATE,
    DEFAULT_CONTRACT_MULTIPLIER,
    DEFAULT_TRANSFER_FEE_RATE,
    DEFAULT_REGULATORY_FEE_RATE,
    DEFAULT_PLATFORM_FEE_RATE,
    DEFAULT_TRANSACTION_LEVY_RATE,
    DEFAULT_SLIPPAGE_RATE,
    DEFAULT_STAMP_DUTY_RATE,
    DEFAULT_COMMISSION_MINIMUM_FEE,
    DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
    DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
    DEFAULT_LONG_FINANCING_ANNUAL_RATE,
    DEFAULT_LONG_INITIAL_MARGIN_RATIO,
    DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
    DEFAULT_SHORT_BORROW_ANNUAL_RATE,
    DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
    DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
    DEFAULT_STAMP_DUTY_MODE,
    DEFAULT_POSITION_COST_MODE,
    DEFAULT_TRADE_SETTLEMENT_MODE,
    DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
    DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
    DEFAULT_ALLOW_LONG_MARGIN_TRADING,
    DEFAULT_ALLOW_SHORT_SELLING,
    SYSTEM_SEED_MARKET_PRESET_ID,
    resolveSystemSeedMarketPresetId,
    barsRangeLimitMax,
    round,
    nowIso,
    appError,
    getInstrumentBySymbol,
    getInstrumentById,
    ensureInstrumentMarketBarsReady,
    getBarsByInstrumentId,
    getBarsByInstrumentIdRange,
    getAccount,
    setAccountBalance,
    ensureSystemMarketSeedReady
  } = deps;

  const settingsReadStore = createTradingSettingsReadStore({ db });
  const MARGIN_RATIO_MAX_PERCENT = 1000;

  const resolveStampDutyStorageByMode = (
    mode: 'BUY' | 'SELL' | 'DOUBLE'
  ): { mode: 'SINGLE' | 'DOUBLE'; singleSide: 'BUY' | 'SELL' } => {
    if (mode === 'DOUBLE') {
      return { mode: 'DOUBLE', singleSide: 'SELL' };
    }
    if (mode === 'BUY') {
      return { mode: 'SINGLE', singleSide: 'BUY' };
    }
    return { mode: 'SINGLE', singleSide: 'SELL' };
  };

  const resolveStampDutyModeByStorage = (
    mode: 'SINGLE' | 'DOUBLE',
    singleSide: 'BUY' | 'SELL'
  ): 'BUY' | 'SELL' | 'DOUBLE' => {
    if (mode === 'DOUBLE') {
      return 'DOUBLE';
    }
    return singleSide === 'BUY' ? 'BUY' : 'SELL';
  };

  const getOrCreateUserSettings = (): UserSettingsRow => {
    const found = settingsReadStore.getUserSettings(DEFAULT_USER_ID);
    if (found) {
      return found;
    }

    const defaultStampDutyStorage = resolveStampDutyStorageByMode(DEFAULT_STAMP_DUTY_MODE);
    const created: UserSettingsRow = {
      user_id: DEFAULT_USER_ID,
      initial_securities_balance: DEFAULT_INITIAL_SECURITIES_BALANCE,
      asset_class: DEFAULT_TRADING_ASSET_CLASS,
      market_preset_id: DEFAULT_TRADING_MARKET_PRESET_ID,
      min_trade_step: DEFAULT_MIN_TRADE_STEP,
      commission_rate: DEFAULT_COMMISSION_RATE,
      maker_fee_rate: DEFAULT_MAKER_FEE_RATE,
      taker_fee_rate: DEFAULT_TAKER_FEE_RATE,
      funding_rate: DEFAULT_FUNDING_RATE,
      contract_multiplier: DEFAULT_CONTRACT_MULTIPLIER,
      transfer_fee_rate: DEFAULT_TRANSFER_FEE_RATE,
      regulatory_fee_rate: DEFAULT_REGULATORY_FEE_RATE,
      platform_fee_rate: DEFAULT_PLATFORM_FEE_RATE,
      transaction_levy_rate: DEFAULT_TRANSACTION_LEVY_RATE,
      slippage_rate: DEFAULT_SLIPPAGE_RATE,
      stamp_duty_rate: DEFAULT_STAMP_DUTY_RATE,
      commission_minimum_fee: DEFAULT_COMMISSION_MINIMUM_FEE,
      platform_fee_minimum_fee: DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
      transaction_levy_minimum_fee: DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
      long_financing_annual_rate: DEFAULT_LONG_FINANCING_ANNUAL_RATE,
      long_initial_margin_ratio: DEFAULT_LONG_INITIAL_MARGIN_RATIO,
      long_maintenance_margin_ratio: DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
      short_borrow_annual_rate: DEFAULT_SHORT_BORROW_ANNUAL_RATE,
      short_initial_margin_ratio: DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
      short_maintenance_margin_ratio: DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
      stamp_duty_mode: defaultStampDutyStorage.mode,
      stamp_duty_single_side: defaultStampDutyStorage.singleSide,
      position_cost_mode: DEFAULT_POSITION_COST_MODE,
      trade_settlement_mode: DEFAULT_TRADE_SETTLEMENT_MODE,
      free_replay_end_settlement_mode: DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
      trade_amount_includes_fees: DEFAULT_TRADE_AMOUNT_INCLUDES_FEES ? 1 : 0,
      allow_long_margin_trading: DEFAULT_ALLOW_LONG_MARGIN_TRADING ? 1 : 0,
      allow_short_selling: DEFAULT_ALLOW_SHORT_SELLING ? 1 : 0,
      updated_at: nowIso()
    };

    settingsReadStore.insertUserSettings(created);
    return created;
  };

  const getTradingSettings = (): TradingSettings => {
    const settings = getOrCreateUserSettings();
    const assetClass =
      settings.asset_class === 'FUTURES' ||
      settings.asset_class === 'FOREX' ||
      settings.asset_class === 'CRYPTO'
        ? settings.asset_class
        : 'STOCK';
    return {
      initialSecuritiesBalance: round(settings.initial_securities_balance, 6),
      assetClass,
      marketPresetId: String(settings.market_preset_id || '').trim() || DEFAULT_TRADING_MARKET_PRESET_ID,
      minTradeStep: round(Math.max(0.00000001, settings.min_trade_step), 8),
      commissionRate: round(settings.commission_rate, 8),
      makerFeeRate: round(settings.maker_fee_rate, 8),
      takerFeeRate: round(settings.taker_fee_rate, 8),
      fundingRate: round(settings.funding_rate, 8),
      contractMultiplier: round(Math.max(0.00000001, settings.contract_multiplier), 8),
      transferFeeRate: round(settings.transfer_fee_rate, 8),
      regulatoryFeeRate: round(settings.regulatory_fee_rate, 8),
      platformFeeRate: round(settings.platform_fee_rate, 8),
      transactionLevyRate: round(settings.transaction_levy_rate, 8),
      slippageRate: round(settings.slippage_rate, 8),
      stampDutyRate: round(settings.stamp_duty_rate, 8),
      commissionMinimumFee: round(settings.commission_minimum_fee, 8),
      platformFeeMinimumFee: round(settings.platform_fee_minimum_fee, 8),
      transactionLevyMinimumFee: round(settings.transaction_levy_minimum_fee, 8),
      longFinancingAnnualRate: round(settings.long_financing_annual_rate, 8),
      longInitialMarginRatio: round(settings.long_initial_margin_ratio, 6),
      longMaintenanceMarginRatio: round(settings.long_maintenance_margin_ratio, 6),
      shortBorrowAnnualRate: round(settings.short_borrow_annual_rate, 8),
      shortInitialMarginRatio: round(settings.short_initial_margin_ratio, 6),
      shortMaintenanceMarginRatio: round(settings.short_maintenance_margin_ratio, 6),
      stampDutyMode: resolveStampDutyModeByStorage(settings.stamp_duty_mode, settings.stamp_duty_single_side),
      positionCostMode: settings.position_cost_mode === 'AVERAGE_OPEN' ? 'AVERAGE_OPEN' : 'DILUTED',
      tradeSettlementMode: settings.trade_settlement_mode === 'T1' ? 'T1' : 'T0',
      freeReplayEndSettlementMode:
        settings.free_replay_end_settlement_mode === 'CURRENT_TOTAL_ASSET'
          ? 'CURRENT_TOTAL_ASSET'
          : 'FORCE_CLOSE',
      tradeAmountIncludesFees: Number(settings.trade_amount_includes_fees) === 1,
      allowLongMarginTrading: Number(settings.allow_long_margin_trading) === 1,
      allowShortSelling: Number(settings.allow_short_selling) === 1
    };
  };

  const getInitialBalances = () => {
    const settings = getTradingSettings();
    return {
      initialSecuritiesBalance: settings.initialSecuritiesBalance
    };
  };

  const getLiveFillCount = (): number => {
    return settingsReadStore.getLiveFillCount();
  };

  const replayAccountBalancesFromHistory = (): void => {
    const securities = getAccount();
    const settings = getInitialBalances();

    let securitiesBalance = settings.initialSecuritiesBalance;

    const fills = settingsReadStore.listOfficialFills();

    for (const fill of fills) {
      const contractMultiplier = Math.max(
        1,
        Number.isFinite(Number(fill.contractMultiplier))
          ? Number(fill.contractMultiplier)
          : 1,
      );
      const gross = fill.fill_price * fill.fill_qty * contractMultiplier;
      if (fill.side === 'BUY') {
        securitiesBalance -= gross + fill.fee + fill.tax + fill.slippage;
      } else {
        securitiesBalance += gross - fill.fee - fill.tax - fill.slippage;
      }
    }
    const shortBorrowChargesTotal =
      settingsReadStore.getShortBorrowAccrualTotal();
    const longFinancingChargesTotal =
      settingsReadStore.getLongFinancingAccrualTotal();
    securitiesBalance -= Number.isFinite(shortBorrowChargesTotal)
      ? shortBorrowChargesTotal
      : 0;
    securitiesBalance -= Number.isFinite(longFinancingChargesTotal)
      ? longFinancingChargesTotal
      : 0;

    setAccountBalance(securities.id, securitiesBalance);
  };

  const setTradingSettings = (payload: TradingSettings): TradingSettings => {
    const previousSettings = getTradingSettings();
    const fields: Array<keyof TradingSettings> = [
      'initialSecuritiesBalance',
      'minTradeStep',
      'commissionRate',
      'makerFeeRate',
      'takerFeeRate',
      'fundingRate',
      'contractMultiplier',
      'transferFeeRate',
      'regulatoryFeeRate',
      'platformFeeRate',
      'transactionLevyRate',
      'slippageRate',
      'stampDutyRate',
      'commissionMinimumFee',
      'platformFeeMinimumFee',
      'transactionLevyMinimumFee',
      'longFinancingAnnualRate',
      'longInitialMarginRatio',
      'longMaintenanceMarginRatio',
      'shortBorrowAnnualRate',
      'shortInitialMarginRatio',
      'shortMaintenanceMarginRatio'
    ];
    for (const key of fields) {
      if (!Number.isFinite(payload[key])) {
        throw appError('TRADING_SETTINGS_INVALID_NUMBER');
      }
    }
    if (
      payload.assetClass !== 'STOCK' &&
      payload.assetClass !== 'FUTURES' &&
      payload.assetClass !== 'FOREX' &&
      payload.assetClass !== 'CRYPTO'
    ) {
      throw appError('TRADING_ASSET_CLASS_INVALID');
    }
    if (!String(payload.marketPresetId || '').trim()) {
      throw appError('TRADING_MARKET_PRESET_INVALID');
    }
    if (!Number.isInteger(payload.initialSecuritiesBalance) || payload.initialSecuritiesBalance <= 0) {
      throw appError('TRADING_INITIAL_BALANCE_NEGATIVE');
    }
    if (payload.minTradeStep <= 0 || payload.contractMultiplier <= 0) {
      throw appError('TRADING_STEP_OR_MULTIPLIER_INVALID');
    }
    if (
      payload.commissionRate < 0 ||
      payload.makerFeeRate < 0 ||
      payload.takerFeeRate < 0 ||
      payload.transferFeeRate < 0 ||
      payload.regulatoryFeeRate < 0 ||
      payload.platformFeeRate < 0 ||
      payload.transactionLevyRate < 0 ||
      payload.slippageRate < 0 ||
      payload.stampDutyRate < 0 ||
      payload.commissionMinimumFee < 0 ||
      payload.platformFeeMinimumFee < 0 ||
      payload.transactionLevyMinimumFee < 0 ||
      payload.longFinancingAnnualRate < 0 ||
      payload.shortBorrowAnnualRate < 0
    ) {
      throw appError('TRADING_RATE_NEGATIVE');
    }
    if (
      payload.longInitialMarginRatio <= 0 ||
      payload.longInitialMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
      payload.longMaintenanceMarginRatio <= 0 ||
      payload.longMaintenanceMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
      payload.shortInitialMarginRatio <= 0 ||
      payload.shortInitialMarginRatio > MARGIN_RATIO_MAX_PERCENT ||
      payload.shortMaintenanceMarginRatio <= 0 ||
      payload.shortMaintenanceMarginRatio > MARGIN_RATIO_MAX_PERCENT
    ) {
      throw appError('MARGIN_RATIO_INVALID');
    }
    if (
      payload.longMaintenanceMarginRatio - payload.longInitialMarginRatio > 1e-12
    ) {
      throw appError('MARGIN_RATIO_RELATION_INVALID');
    }
    if (
      payload.shortMaintenanceMarginRatio - payload.shortInitialMarginRatio > 1e-12
    ) {
      throw appError('MARGIN_RATIO_RELATION_INVALID');
    }
    if (!['BUY', 'SELL', 'DOUBLE'].includes(payload.stampDutyMode)) {
      throw appError('STAMP_DUTY_MODE_INVALID');
    }
    if (!['DILUTED', 'AVERAGE_OPEN'].includes(payload.positionCostMode)) {
      throw appError('POSITION_COST_MODE_INVALID');
    }
    if (!['T0', 'T1'].includes(payload.tradeSettlementMode)) {
      throw appError('TRADE_SETTLEMENT_MODE_INVALID');
    }
    if (!['FORCE_CLOSE', 'CURRENT_TOTAL_ASSET'].includes(payload.freeReplayEndSettlementMode)) {
      throw appError('FREE_REPLAY_END_SETTLEMENT_MODE_INVALID');
    }
    if (typeof payload.tradeAmountIncludesFees !== 'boolean') {
      throw appError('TRADE_AMOUNT_MODE_INVALID');
    }
    if (typeof payload.allowLongMarginTrading !== 'boolean') {
      throw appError('ALLOW_LONG_MARGIN_MODE_INVALID');
    }
    if (typeof payload.allowShortSelling !== 'boolean') {
      throw appError('ALLOW_SHORT_SELLING_MODE_INVALID');
    }
    const nextInitialSecuritiesBalance = Math.trunc(payload.initialSecuritiesBalance);
    const shouldReplayAccountBalance =
      Math.abs(previousSettings.initialSecuritiesBalance - nextInitialSecuritiesBalance) > 0;
    if (shouldReplayAccountBalance && getLiveFillCount() > 0) {
      throw appError('TRADING_INITIAL_BALANCE_LOCKED');
    }

    const nextStampDutyStorage = resolveStampDutyStorageByMode(payload.stampDutyMode);
    const updatedAt = nowIso();
    const nextUserSettings: UserSettingsRow = {
      user_id: DEFAULT_USER_ID,
      initial_securities_balance: nextInitialSecuritiesBalance,
      asset_class: payload.assetClass,
      market_preset_id: payload.marketPresetId,
      min_trade_step: round(payload.minTradeStep, 8),
      maker_fee_rate: round(payload.makerFeeRate, 8),
      taker_fee_rate: round(payload.takerFeeRate, 8),
      funding_rate: round(payload.fundingRate, 8),
      contract_multiplier: round(payload.contractMultiplier, 8),
      commission_rate: round(payload.commissionRate, 8),
      transfer_fee_rate: round(payload.transferFeeRate, 8),
      regulatory_fee_rate: round(payload.regulatoryFeeRate, 8),
      platform_fee_rate: round(payload.platformFeeRate, 8),
      transaction_levy_rate: round(payload.transactionLevyRate, 8),
      slippage_rate: round(payload.slippageRate, 8),
      stamp_duty_rate: round(payload.stampDutyRate, 8),
      commission_minimum_fee: round(payload.commissionMinimumFee, 8),
      platform_fee_minimum_fee: round(payload.platformFeeMinimumFee, 8),
      transaction_levy_minimum_fee: round(payload.transactionLevyMinimumFee, 8),
      long_financing_annual_rate: round(payload.longFinancingAnnualRate, 8),
      long_initial_margin_ratio: round(payload.longInitialMarginRatio, 6),
      long_maintenance_margin_ratio: round(payload.longMaintenanceMarginRatio, 6),
      short_borrow_annual_rate: round(payload.shortBorrowAnnualRate, 8),
      short_initial_margin_ratio: round(payload.shortInitialMarginRatio, 6),
      short_maintenance_margin_ratio: round(payload.shortMaintenanceMarginRatio, 6),
      stamp_duty_mode: nextStampDutyStorage.mode,
      stamp_duty_single_side: nextStampDutyStorage.singleSide,
      position_cost_mode: payload.positionCostMode,
      trade_settlement_mode: payload.tradeSettlementMode,
      free_replay_end_settlement_mode: payload.freeReplayEndSettlementMode,
      trade_amount_includes_fees: payload.tradeAmountIncludesFees ? 1 : 0,
      allow_long_margin_trading: payload.allowLongMarginTrading ? 1 : 0,
      allow_short_selling: payload.allowShortSelling ? 1 : 0,
      updated_at: updatedAt,
    };
    const nextSettings = settingsReadStore.runInTransaction(() => {
      settingsReadStore.upsertUserSettings(nextUserSettings);
      if (shouldReplayAccountBalance) {
        replayAccountBalancesFromHistory();
      }

      return getTradingSettings();
    });

    return nextSettings;
  };

  const setInitialBalances = (initialSecuritiesBalance: number) => {
    const current = getTradingSettings();
    return setTradingSettings({
      ...current,
      initialSecuritiesBalance
    });
  };

  const listInstruments = async (options?: {
    query?: string;
    sourceId?: string;
    baseTimeframe?: string;
    minimumBarCount?: number;
    offset?: number;
    limit?: number;
  }): Promise<Array<{
    id: string;
    symbol: string;
    baseTimeframe: string;
    name: string | null;
    barCount: number;
    timeStartTs: string | null;
    timeEndTs: string | null;
    barsVersionToken: string;
    timeZone: string | null;
    marketPresetId: string;
    minTradeStep: number;
    scopeKind: 'SYSTEM' | 'LOCAL';
    sourceId: string | null;
    sourceName: string | null;
    displayLabel: string;
  }>> => {
    await ensureSystemMarketSeedReady();
    const keyword = String(options?.query ?? '').trim().toUpperCase();
    const sourceId = String(options?.sourceId ?? '').trim();
    const baseTimeframe = String(options?.baseTimeframe ?? '').trim().toLowerCase();
    const offset = Math.max(0, Math.floor(Number(options?.offset) || 0));
    const limit =
      Number.isFinite(Number(options?.limit)) && Number(options?.limit) > 0
        ? Math.max(1, Math.min(10000, Math.floor(Number(options?.limit))))
        : null;
    const rows = settingsReadStore.listInstrumentRows({
      keyword,
      sourceId,
      baseTimeframe: baseTimeframe || undefined,
      minimumBarCount: options?.minimumBarCount,
      offset,
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      instrumentId: row.id,
      symbol: row.symbol,
      baseTimeframe: row.baseTimeframe,
      sourceTimeframe: row.baseTimeframe,
      name: row.name,
      barCount: Math.max(0, Math.floor(Number(row.bar_count) || 0)),
      timeStartTs: String(row.timeStartTs || '').trim() || null,
      timeEndTs: String(row.timeEndTs || '').trim() || null,
      barsVersionToken: String(row.barsVersionToken || "").trim(),
      timeZone: typeof row.timeZone === 'string' && row.timeZone.trim() ? row.timeZone : null,
      marketPresetId:
        String(row.market || '').trim().toUpperCase() === 'SYSTEM'
          ? resolveSystemSeedMarketPresetId(row.symbol, row.baseTimeframe) || SYSTEM_SEED_MARKET_PRESET_ID
          : String(row.marketPresetId || '').trim(),
      minTradeStep: Math.max(0.00000001, Number(row.minTradeStep) || 0.00000001),
      scopeKind:
        String(row.market || '').trim().toUpperCase() === 'LOCAL'
          ? 'LOCAL'
          : 'SYSTEM',
      samplePoolId: String(row.sourceId || '').trim() || null,
      sourceId: String(row.sourceId || '').trim() || null,
      sourceName: String(row.sourceName || '').trim() || null,
      displayLabel:
        String(row.market || '').trim().toUpperCase() === 'LOCAL' &&
        String(row.sourceName || '').trim()
          ? `${row.symbol} · ${String(row.sourceName || '').trim()}`
          : row.symbol,
    }));
  };

  const listAccounts = (): AccountRow[] =>
    settingsReadStore.listSecuritiesAccounts(DEFAULT_USER_ID);

  const getBarsBySymbol = async (symbol: string, timeframe = '1d'): Promise<OhlcvBar[]> => {
    const instrument = getInstrumentBySymbol(symbol, timeframe);
    if (!instrument) {
      throw appError('INSTRUMENT_NOT_FOUND', { symbol, timeframe });
    }
    await ensureInstrumentMarketBarsReady(instrument);
    return getBarsByInstrumentId(instrument.id);
  };

  const getBarsByInstrumentIdPublic = async (instrumentId: string): Promise<OhlcvBar[]> => {
    const instrument = getInstrumentById(String(instrumentId || '').trim());
    if (!instrument) {
      throw appError('INSTRUMENT_NOT_FOUND', { instrumentId });
    }
    await ensureInstrumentMarketBarsReady(instrument);
    return getBarsByInstrumentId(instrument.id);
  };

  const getBarsByInstrumentIdRangePublic = async (
    instrumentId: string,
    offset = 0,
    limit = 5000,
    options: { signal?: AbortSignal } = {},
  ): Promise<BarsRangeResult> => {
    options.signal?.throwIfAborted();
    const instrument = getInstrumentById(String(instrumentId || '').trim());
    if (!instrument) {
      throw appError('INSTRUMENT_NOT_FOUND', { instrumentId });
    }
    const total = await ensureInstrumentMarketBarsReady(instrument);
    options.signal?.throwIfAborted();
    const safeOffset = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0));
    const safeLimit = Math.max(1, Math.min(barsRangeLimitMax, Math.floor(Number.isFinite(limit) ? limit : 5000)));
    const bars = safeOffset >= total
      ? []
      : await getBarsByInstrumentIdRange(
          instrument.id,
          safeOffset,
          safeLimit,
          options,
        );
    return {
      symbol: instrument.symbol,
      timeframe: String(instrument.base_timeframe || '1d').trim().toLowerCase() || '1d',
      timeZone: typeof instrument.time_zone === 'string' && instrument.time_zone.trim() ? instrument.time_zone : null,
      total,
      offset: safeOffset,
      limit: safeLimit,
      bars
    };
  };

  const getBarsBySymbolRange = async (
    symbol: string,
    timeframe = '1d',
    offset = 0,
    limit = 5000
  ): Promise<BarsRangeResult> => {
    const instrument = getInstrumentBySymbol(symbol, timeframe);
    if (!instrument) {
      throw appError('INSTRUMENT_NOT_FOUND', { symbol, timeframe });
    }
    const total = await ensureInstrumentMarketBarsReady(instrument);
    const safeOffset = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0));
    const safeLimit = Math.max(1, Math.min(barsRangeLimitMax, Math.floor(Number.isFinite(limit) ? limit : 5000)));
    const bars = safeOffset >= total ? [] : await getBarsByInstrumentIdRange(instrument.id, safeOffset, safeLimit);
    return {
      symbol: instrument.symbol,
      timeframe: String(instrument.base_timeframe || timeframe || '1d').trim().toLowerCase() || '1d',
      timeZone: typeof instrument.time_zone === 'string' && instrument.time_zone.trim() ? instrument.time_zone : null,
      total,
      offset: safeOffset,
      limit: safeLimit,
      bars
    };
  };

  return {
    getTradingSettings,
    setTradingSettings,
    getInitialBalances,
    setInitialBalances,
    replayAccountBalancesFromHistory,
    listInstruments,
    listAccounts,
    getBarsBySymbol,
    getBarsBySymbolRange,
    getBarsByInstrumentId: getBarsByInstrumentIdPublic,
    getBarsByInstrumentIdRange: getBarsByInstrumentIdRangePublic
  };
};
