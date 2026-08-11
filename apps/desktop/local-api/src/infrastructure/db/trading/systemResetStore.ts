// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { SYSTEM_DEV_SIMULATION_META_KEY } from '../../../domain/systemDevSimulation/sharedDomain.js';

type CreateSystemResetStoreDeps = {
  db: Pick<Database.Database, 'prepare' | 'transaction'>;
};

type ResetAllDataStoreModuleKey =
  | 'trainingDataBytes'
  | 'replayNotesBytes'
  | 'statsDataBytes'
  | 'systemSettingsBytes'
  | 'marketDataBytes';

type ResetAllDataStoreModuleStatus = 'RUNNING' | 'SUCCESS';

type ResetAllStoredDataMutationInput = {
  defaultUserId: string;
  defaultSecuritiesAccountId: string;
  initialSecuritiesBalance: number;
  initialBankBalance: number;
  assetClass: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  marketPresetId: string;
  minTradeStep: number;
  commissionRate: number;
  makerFeeRate: number;
  takerFeeRate: number;
  fundingRate: number;
  contractMultiplier: number;
  transferFeeRate: number;
  regulatoryFeeRate: number;
  platformFeeRate: number;
  transactionLevyRate: number;
  slippageRate: number;
  stampDutyRate: number;
  commissionMinimumFee: number;
  platformFeeMinimumFee: number;
  transactionLevyMinimumFee: number;
  longFinancingAnnualRate: number;
  longInitialMarginRatio: number;
  longMaintenanceMarginRatio: number;
  shortBorrowAnnualRate: number;
  shortInitialMarginRatio: number;
  shortMaintenanceMarginRatio: number;
  stampDutyMode: 'SINGLE' | 'DOUBLE';
  stampDutySingleSide: 'BUY' | 'SELL';
  positionCostMode: 'DILUTED' | 'AVERAGE_OPEN';
  tradeSettlementMode: 'T0' | 'T1';
  freeReplayEndSettlementMode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  tradeAmountIncludesFees: boolean;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  updatedAt: string;
  ensureLocalDataImportIdle: () => void;
  ensureBacktestIdle: () => void;
  ensureSystemDevSimulationIdle: () => void;
  ensureHistoryRetentionIdle: () => void;
  createLocalDataSourceMutationInProgressError: () => Error;
  markCoreDataCommitted: () => void;
  reportModule: (
    moduleKey: ResetAllDataStoreModuleKey,
    progressPercent: number,
    status: ResetAllDataStoreModuleStatus,
  ) => void;
};

export type ResetAllStoredDataMutationResult = {
  deletedSessions: number;
  deletedStatsSessions: number;
  deletedStatsTags: number;
  deletedStatsMonthly: number;
  deletedStatsPools: number;
  deletedStatsSymbols: number;
  deletedStatsTimeframes: number;
  deletedProjects: number;
  deletedPortableProjectPreviews: number;
  deletedSpecialTrainingDrawCursors: number;
  deletedSpecialTrainingScopeIndexes: number;
  deletedSpecialTrainingLedger: number;
  deletedSpecialTrainingBanks: number;
  deletedSpecialTrainingHistoryQuestions: number;
  deletedSpecialTrainingHistorySessions: number;
  deletedSpecialTrainingQuestionSnapshots: number;
  deletedSpecialTrainingStatsProjection: number;
  deletedReplayNotes: number;
  deletedSimulationBatches: number;
  deletedBacktestEquityPoints: number;
  deletedBacktestFills: number;
  deletedBacktestResults: number;
  deletedBacktestBatches: number;
  deletedLocalDataSourceFiles: number;
  deletedLocalDataImportJobs: number;
  deletedLocalDataSources: number;
  deletedPortableSourceManifests: number;
  deletedTransfers: number;
  deletedInstruments: number;
};

export type ResetAllStoredDataRemainingCounts = {
  replaySessions: number;
  trainingProjects: number;
  trainingProjectPortablePreviews: number;
  specialTrainingLedger: number;
  specialTrainingBanks: number;
  specialTrainingHistorySessions: number;
  specialTrainingHistoryQuestions: number;
  specialTrainingQuestionSnapshots: number;
  specialTrainingStatsProjection: number;
  trainingStatsSessions: number;
  trainingStatsTags: number;
  trainingStatsMonthly: number;
  trainingStatsPools: number;
  trainingStatsSymbols: number;
  trainingStatsTimeframes: number;
  replayNotes: number;
  simulationBatches: number;
  simulationJobMeta: number;
  backtestEquityPoints: number;
  backtestFills: number;
  backtestResults: number;
  backtestBatches: number;
  localDataSources: number;
  localDataImportJobs: number;
  localDataSourceFiles: number;
  portableSourceManifests: number;
  nonSystemInstruments: number;
};

export type ResetAllStoredDataBaselineCounts = {
  defaultUser: number;
  defaultUserSettings: number;
  defaultUserAppPreferences: number;
  defaultSecuritiesAccount: number;
  defaultSpecialTrainingQuestionBank: number;
};

export type ResetAllSystemInstrumentRow = {
  symbol: string | null;
  bar_count: number | null;
};

export type ActiveBacktestBatchRow = {
  id: string;
  status: 'QUEUED' | 'RUNNING';
};

export type ResetAllStoredDataPostState = {
  remaining: ResetAllStoredDataRemainingCounts;
  baseline: ResetAllStoredDataBaselineCounts;
  systemInstrumentRows: ResetAllSystemInstrumentRow[];
};

const toCount = (row: { count?: unknown } | undefined): number => {
  const count = Number(row?.count ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count);
};

export const createSystemResetStore = ({ db }: CreateSystemResetStoreDeps) => {
  const countActiveLocalDataSourceMutationsStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_sources
      WHERE deletion_state <> 'IDLE'`,
  );
  const readActiveBacktestBatchStmt = db.prepare(
    `SELECT id, status
       FROM backtest_batches
      WHERE status IN ('QUEUED', 'RUNNING')
      ORDER BY updated_at ASC, created_at ASC, id ASC
      LIMIT 1`,
  );
  const countSpecialTrainingBanksStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_banks WHERE user_id = ?',
  );
  const countReplaySessionsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM replay_sessions WHERE user_id = ?',
  );
  const countTrainingProjectsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_projects',
  );
  const countTrainingProjectPortablePreviewsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_project_portable_previews',
  );
  const countSpecialTrainingLedgerStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_question_ledger WHERE user_id = ?',
  );
  const countSpecialTrainingHistorySessionsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_history_sessions',
  );
  const countSpecialTrainingHistoryQuestionsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_history_questions',
  );
  const countSpecialTrainingQuestionSnapshotsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_question_snapshot_archives',
  );
  const countSpecialTrainingStatsProjectionStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM special_training_stats_projection',
  );
  const countTrainingStatsSessionsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_sessions',
  );
  const countTrainingStatsTagsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_tags',
  );
  const countTrainingStatsMonthlyStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_monthly',
  );
  const countTrainingStatsPoolsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_pool',
  );
  const countTrainingStatsSymbolsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_symbol',
  );
  const countTrainingStatsTimeframesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM training_stats_timeframe',
  );
  const countReplayNotesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM replay_notes',
  );
  const countSimulationBatchesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM system_dev_simulation_batches',
  );
  const countSimulationJobMetaStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM app_meta WHERE key = ?',
  );
  const countBacktestEquityPointsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM backtest_equity_curve',
  );
  const countBacktestFillsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM backtest_fills',
  );
  const countBacktestResultsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM backtest_results',
  );
  const countBacktestBatchesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM backtest_batches',
  );
  const countLocalDataSourcesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM local_data_sources',
  );
  const countLocalDataImportJobsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM local_data_import_jobs',
  );
  const countLocalDataSourceFilesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM local_data_source_files',
  );
  const countPortableSourceManifestsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM portable_source_manifests',
  );
  const countNonSystemInstrumentsStmt = db.prepare(
    "SELECT COUNT(*) AS count FROM instruments WHERE market IS NULL OR market <> 'SYSTEM'",
  );
  const countDefaultUserStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM users WHERE id = ?',
  );
  const countDefaultUserSettingsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM user_settings WHERE user_id = ?',
  );
  const countDefaultUserAppPreferencesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM user_app_preferences WHERE user_id = ?',
  );
  const countDefaultSecuritiesAccountStmt = db.prepare(
    "SELECT COUNT(*) AS count FROM accounts WHERE id = ? AND user_id = ? AND kind = 'SECURITIES'",
  );
  const listSystemInstrumentRowsStmt = db.prepare(
    `SELECT symbol, bar_count
       FROM instruments
      WHERE market = 'SYSTEM'
      ORDER BY symbol ASC`,
  );

  const deleteReplaySessionsStmt = db.prepare(
    'DELETE FROM replay_sessions WHERE user_id = ?',
  );
  const deleteTrainingProjectsStmt = db.prepare('DELETE FROM training_projects');
  const deleteTrainingProjectPortablePreviewsStmt = db.prepare(
    'DELETE FROM training_project_portable_previews',
  );
  const deleteSpecialTrainingDrawCursorsStmt = db.prepare(
    'DELETE FROM special_training_question_draw_cursors WHERE user_id = ?',
  );
  const deleteSpecialTrainingScopeIndexesStmt = db.prepare(
    'DELETE FROM special_training_question_scope_indexes WHERE user_id = ?',
  );
  const deleteSpecialTrainingLedgerStmt = db.prepare(
    'DELETE FROM special_training_question_ledger WHERE user_id = ?',
  );
  const deleteSpecialTrainingBanksStmt = db.prepare(
    'DELETE FROM special_training_banks WHERE user_id = ?',
  );
  const deleteSpecialTrainingHistoryQuestionsStmt = db.prepare(
    'DELETE FROM special_training_history_questions',
  );
  const deleteSpecialTrainingHistorySessionsStmt = db.prepare(
    'DELETE FROM special_training_history_sessions',
  );
  const deleteSpecialTrainingQuestionSnapshotsStmt = db.prepare(
    'DELETE FROM special_training_question_snapshot_archives',
  );
  const deleteCashTransfersStmt = db.prepare(
    'DELETE FROM cash_transfers WHERE user_id = ?',
  );
  const deleteSpecialTrainingStatsProjectionStmt = db.prepare(
    'DELETE FROM special_training_stats_projection',
  );
  const deleteTrainingStatsTagsStmt = db.prepare(
    'DELETE FROM training_stats_tags',
  );
  const deleteTrainingStatsSessionsStmt = db.prepare(
    'DELETE FROM training_stats_sessions',
  );
  const deleteTrainingStatsMonthlyStmt = db.prepare(
    'DELETE FROM training_stats_monthly',
  );
  const deleteTrainingStatsPoolsStmt = db.prepare(
    'DELETE FROM training_stats_pool',
  );
  const deleteTrainingStatsSymbolsStmt = db.prepare(
    'DELETE FROM training_stats_symbol',
  );
  const deleteTrainingStatsTimeframesStmt = db.prepare(
    'DELETE FROM training_stats_timeframe',
  );
  const deleteReplayNotesStmt = db.prepare('DELETE FROM replay_notes');
  const deleteSimulationBatchesStmt = db.prepare(
    'DELETE FROM system_dev_simulation_batches',
  );
  const deleteSimulationJobMetaStmt = db.prepare(
    'DELETE FROM app_meta WHERE key = ?',
  );
  const deleteBacktestEquityPointsStmt = db.prepare(
    'DELETE FROM backtest_equity_curve',
  );
  const deleteBacktestFillsStmt = db.prepare('DELETE FROM backtest_fills');
  const deleteBacktestResultsStmt = db.prepare('DELETE FROM backtest_results');
  const deleteBacktestBatchesStmt = db.prepare('DELETE FROM backtest_batches');
  const deleteLocalDataSourceFilesStmt = db.prepare(
    'DELETE FROM local_data_source_files',
  );
  const deleteLocalDataImportJobsStmt = db.prepare(
    'DELETE FROM local_data_import_jobs',
  );
  const deleteLocalDataSourcesStmt = db.prepare(
    'DELETE FROM local_data_sources',
  );
  const deletePortableSourceManifestsStmt = db.prepare(
    'DELETE FROM portable_source_manifests',
  );
  const deleteInstrumentsStmt = db.prepare('DELETE FROM instruments');
  const insertDefaultUserStmt = db.prepare(
    'INSERT OR IGNORE INTO users (id,name,created_at) VALUES (?,?,?)',
  );
  const insertDefaultSecuritiesAccountStmt = db.prepare(
    "INSERT OR IGNORE INTO accounts (id,user_id,kind,balance,currency,created_at) VALUES (?,?,?,?,?,?)",
  );
  const updateDefaultAccountBalancesStmt = db.prepare(
    `UPDATE accounts
        SET balance = CASE
          WHEN kind = 'SECURITIES' THEN ?
          WHEN kind = 'BANK' THEN ?
          ELSE balance
        END
      WHERE user_id = ?`,
  );
  const upsertDefaultUserSettingsStmt = db.prepare(
    `INSERT INTO user_settings (
      user_id,initial_securities_balance,initial_bank_balance,
      asset_class,market_preset_id,min_trade_step,
      commission_rate,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,transaction_levy_rate,slippage_rate,stamp_duty_rate,
      maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,
      commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
      long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,
      short_borrow_annual_rate,short_initial_margin_ratio,short_maintenance_margin_ratio,
      stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      initial_securities_balance = excluded.initial_securities_balance,
      initial_bank_balance = excluded.initial_bank_balance,
      asset_class = excluded.asset_class,
      market_preset_id = excluded.market_preset_id,
      min_trade_step = excluded.min_trade_step,
      commission_rate = excluded.commission_rate,
      transfer_fee_rate = excluded.transfer_fee_rate,
      regulatory_fee_rate = excluded.regulatory_fee_rate,
      platform_fee_rate = excluded.platform_fee_rate,
      transaction_levy_rate = excluded.transaction_levy_rate,
      slippage_rate = excluded.slippage_rate,
      stamp_duty_rate = excluded.stamp_duty_rate,
      maker_fee_rate = excluded.maker_fee_rate,
      taker_fee_rate = excluded.taker_fee_rate,
      funding_rate = excluded.funding_rate,
      contract_multiplier = excluded.contract_multiplier,
      commission_minimum_fee = excluded.commission_minimum_fee,
      platform_fee_minimum_fee = excluded.platform_fee_minimum_fee,
      transaction_levy_minimum_fee = excluded.transaction_levy_minimum_fee,
      long_financing_annual_rate = excluded.long_financing_annual_rate,
      long_initial_margin_ratio = excluded.long_initial_margin_ratio,
      long_maintenance_margin_ratio = excluded.long_maintenance_margin_ratio,
      short_borrow_annual_rate = excluded.short_borrow_annual_rate,
      short_initial_margin_ratio = excluded.short_initial_margin_ratio,
      short_maintenance_margin_ratio = excluded.short_maintenance_margin_ratio,
      stamp_duty_mode = excluded.stamp_duty_mode,
      stamp_duty_single_side = excluded.stamp_duty_single_side,
      position_cost_mode = excluded.position_cost_mode,
      trade_settlement_mode = excluded.trade_settlement_mode,
      free_replay_end_settlement_mode = excluded.free_replay_end_settlement_mode,
      trade_amount_includes_fees = excluded.trade_amount_includes_fees,
      allow_long_margin_trading = excluded.allow_long_margin_trading,
      allow_short_selling = excluded.allow_short_selling,
      updated_at = excluded.updated_at`,
  );
  const upsertDefaultUserAppPreferencesStmt = db.prepare(
    `INSERT INTO user_app_preferences (
      user_id, ui_settings_json, data_pool_removed_symbols_json, updated_at
    ) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      ui_settings_json = excluded.ui_settings_json,
      data_pool_removed_symbols_json = excluded.data_pool_removed_symbols_json,
      updated_at = excluded.updated_at`,
  );

  const readResetAllStoredDataPostState = ({
    defaultUserId,
    defaultSecuritiesAccountId,
    defaultSpecialTrainingBankCount,
  }: {
    defaultUserId: string;
    defaultSecuritiesAccountId: string;
    defaultSpecialTrainingBankCount: number;
  }): ResetAllStoredDataPostState => {
    const totalSpecialTrainingBankCount = toCount(
      countSpecialTrainingBanksStmt.get(defaultUserId) as
        | { count?: unknown }
        | undefined,
    );
    return {
      remaining: {
        replaySessions: toCount(
          countReplaySessionsStmt.get(defaultUserId) as
            | { count?: unknown }
            | undefined,
        ),
        trainingProjects: toCount(
          countTrainingProjectsStmt.get() as { count?: unknown } | undefined,
        ),
        trainingProjectPortablePreviews: toCount(
          countTrainingProjectPortablePreviewsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        specialTrainingLedger: toCount(
          countSpecialTrainingLedgerStmt.get(defaultUserId) as
            | { count?: unknown }
            | undefined,
        ),
        specialTrainingBanks: Math.max(
          0,
          totalSpecialTrainingBankCount - defaultSpecialTrainingBankCount,
        ),
        specialTrainingHistorySessions: toCount(
          countSpecialTrainingHistorySessionsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        specialTrainingHistoryQuestions: toCount(
          countSpecialTrainingHistoryQuestionsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        specialTrainingQuestionSnapshots: toCount(
          countSpecialTrainingQuestionSnapshotsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        specialTrainingStatsProjection: toCount(
          countSpecialTrainingStatsProjectionStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        trainingStatsSessions: toCount(
          countTrainingStatsSessionsStmt.get() as { count?: unknown } | undefined,
        ),
        trainingStatsTags: toCount(
          countTrainingStatsTagsStmt.get() as { count?: unknown } | undefined,
        ),
        trainingStatsMonthly: toCount(
          countTrainingStatsMonthlyStmt.get() as { count?: unknown } | undefined,
        ),
        trainingStatsPools: toCount(
          countTrainingStatsPoolsStmt.get() as { count?: unknown } | undefined,
        ),
        trainingStatsSymbols: toCount(
          countTrainingStatsSymbolsStmt.get() as { count?: unknown } | undefined,
        ),
        trainingStatsTimeframes: toCount(
          countTrainingStatsTimeframesStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        replayNotes: toCount(
          countReplayNotesStmt.get() as { count?: unknown } | undefined,
        ),
        simulationBatches: toCount(
          countSimulationBatchesStmt.get() as { count?: unknown } | undefined,
        ),
        simulationJobMeta: toCount(
          countSimulationJobMetaStmt.get(SYSTEM_DEV_SIMULATION_META_KEY) as
            | { count?: unknown }
            | undefined,
        ),
        backtestEquityPoints: toCount(
          countBacktestEquityPointsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        backtestFills: toCount(
          countBacktestFillsStmt.get() as { count?: unknown } | undefined,
        ),
        backtestResults: toCount(
          countBacktestResultsStmt.get() as { count?: unknown } | undefined,
        ),
        backtestBatches: toCount(
          countBacktestBatchesStmt.get() as { count?: unknown } | undefined,
        ),
        localDataSources: toCount(
          countLocalDataSourcesStmt.get() as { count?: unknown } | undefined,
        ),
        localDataImportJobs: toCount(
          countLocalDataImportJobsStmt.get() as { count?: unknown } | undefined,
        ),
        localDataSourceFiles: toCount(
          countLocalDataSourceFilesStmt.get() as { count?: unknown } | undefined,
        ),
        portableSourceManifests: toCount(
          countPortableSourceManifestsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
        nonSystemInstruments: toCount(
          countNonSystemInstrumentsStmt.get() as
            | { count?: unknown }
            | undefined,
        ),
      },
      baseline: {
        defaultUser: toCount(
          countDefaultUserStmt.get(defaultUserId) as
            | { count?: unknown }
            | undefined,
        ),
        defaultUserSettings: toCount(
          countDefaultUserSettingsStmt.get(defaultUserId) as
            | { count?: unknown }
            | undefined,
        ),
        defaultUserAppPreferences: toCount(
          countDefaultUserAppPreferencesStmt.get(defaultUserId) as
            | { count?: unknown }
            | undefined,
        ),
        defaultSecuritiesAccount: toCount(
          countDefaultSecuritiesAccountStmt.get(
            defaultSecuritiesAccountId,
            defaultUserId,
          ) as { count?: unknown } | undefined,
        ),
        defaultSpecialTrainingQuestionBank: defaultSpecialTrainingBankCount,
      },
      systemInstrumentRows:
        listSystemInstrumentRowsStmt.all() as ResetAllSystemInstrumentRow[],
    };
  };

  const runResetAllStoredDataMutation = (
    input: ResetAllStoredDataMutationInput,
  ): ResetAllStoredDataMutationResult => {
    const tx = db.transaction(() => {
      input.ensureLocalDataImportIdle();
      input.ensureBacktestIdle();
      input.ensureSystemDevSimulationIdle();
      input.ensureHistoryRetentionIdle();
      if (
        toCount(
          countActiveLocalDataSourceMutationsStmt.get() as
            | { count?: unknown }
            | undefined,
        ) > 0
      ) {
        throw input.createLocalDataSourceMutationInProgressError();
      }
      input.reportModule('trainingDataBytes', 20, 'RUNNING');
      const deletedSessions = deleteReplaySessionsStmt.run(
        input.defaultUserId,
      ).changes;
      const deletedProjects = deleteTrainingProjectsStmt.run().changes;
      const deletedPortableProjectPreviews =
        deleteTrainingProjectPortablePreviewsStmt.run().changes;
      const deletedSpecialTrainingDrawCursors =
        deleteSpecialTrainingDrawCursorsStmt.run(input.defaultUserId).changes;
      const deletedSpecialTrainingScopeIndexes =
        deleteSpecialTrainingScopeIndexesStmt.run(input.defaultUserId).changes;
      const deletedSpecialTrainingLedger =
        deleteSpecialTrainingLedgerStmt.run(input.defaultUserId).changes;
      const deletedSpecialTrainingBanks =
        deleteSpecialTrainingBanksStmt.run(input.defaultUserId).changes;
      const deletedSpecialTrainingHistoryQuestions =
        deleteSpecialTrainingHistoryQuestionsStmt.run().changes;
      const deletedSpecialTrainingHistorySessions =
        deleteSpecialTrainingHistorySessionsStmt.run().changes;
      const deletedSpecialTrainingQuestionSnapshots =
        deleteSpecialTrainingQuestionSnapshotsStmt.run().changes;
      const deletedTransfers = deleteCashTransfersStmt.run(
        input.defaultUserId,
      ).changes;
      input.reportModule('trainingDataBytes', 100, 'SUCCESS');

      input.reportModule('statsDataBytes', 20, 'RUNNING');
      const deletedSpecialTrainingStatsProjection =
        deleteSpecialTrainingStatsProjectionStmt.run().changes;
      const deletedStatsTags = deleteTrainingStatsTagsStmt.run().changes;
      const deletedStatsSessions = deleteTrainingStatsSessionsStmt.run().changes;
      const deletedStatsMonthly = deleteTrainingStatsMonthlyStmt.run().changes;
      const deletedStatsPools = deleteTrainingStatsPoolsStmt.run().changes;
      const deletedStatsSymbols = deleteTrainingStatsSymbolsStmt.run().changes;
      const deletedStatsTimeframes =
        deleteTrainingStatsTimeframesStmt.run().changes;
      input.reportModule('statsDataBytes', 100, 'SUCCESS');

      input.reportModule('replayNotesBytes', 20, 'RUNNING');
      const deletedReplayNotes = deleteReplayNotesStmt.run().changes;
      input.reportModule('replayNotesBytes', 100, 'SUCCESS');

      const deletedSimulationBatches = deleteSimulationBatchesStmt.run().changes;
      deleteSimulationJobMetaStmt.run(SYSTEM_DEV_SIMULATION_META_KEY);

      const deletedBacktestEquityPoints =
        deleteBacktestEquityPointsStmt.run().changes;
      const deletedBacktestFills = deleteBacktestFillsStmt.run().changes;
      const deletedBacktestResults = deleteBacktestResultsStmt.run().changes;
      const deletedBacktestBatches = deleteBacktestBatchesStmt.run().changes;


      input.reportModule('marketDataBytes', 16, 'RUNNING');
      const deletedLocalDataSourceFiles =
        deleteLocalDataSourceFilesStmt.run().changes;
      const deletedLocalDataImportJobs =
        deleteLocalDataImportJobsStmt.run().changes;
      const deletedLocalDataSources = deleteLocalDataSourcesStmt.run().changes;
      const deletedPortableSourceManifests =
        deletePortableSourceManifestsStmt.run().changes;
      const deletedInstruments = deleteInstrumentsStmt.run().changes;
      input.reportModule('marketDataBytes', 34, 'RUNNING');

      input.reportModule('systemSettingsBytes', 20, 'RUNNING');
      insertDefaultUserStmt.run(
        input.defaultUserId,
        'Default User',
        input.updatedAt,
      );
      insertDefaultSecuritiesAccountStmt.run(
        input.defaultSecuritiesAccountId,
        input.defaultUserId,
        'SECURITIES',
        input.initialSecuritiesBalance,
        'CNY',
        input.updatedAt,
      );
      updateDefaultAccountBalancesStmt.run(
        input.initialSecuritiesBalance,
        input.initialBankBalance,
        input.defaultUserId,
      );
      upsertDefaultUserSettingsStmt.run(
        input.defaultUserId,
        input.initialSecuritiesBalance,
        input.initialBankBalance,
        input.assetClass,
        input.marketPresetId,
        input.minTradeStep,
        input.commissionRate,
        input.transferFeeRate,
        input.regulatoryFeeRate,
        input.platformFeeRate,
        input.transactionLevyRate,
        input.slippageRate,
        input.stampDutyRate,
        input.makerFeeRate,
        input.takerFeeRate,
        input.fundingRate,
        input.contractMultiplier,
        input.commissionMinimumFee,
        input.platformFeeMinimumFee,
        input.transactionLevyMinimumFee,
        input.longFinancingAnnualRate,
        input.longInitialMarginRatio,
        input.longMaintenanceMarginRatio,
        input.shortBorrowAnnualRate,
        input.shortInitialMarginRatio,
        input.shortMaintenanceMarginRatio,
        input.stampDutyMode,
        input.stampDutySingleSide,
        input.positionCostMode,
        input.tradeSettlementMode,
        input.freeReplayEndSettlementMode,
        input.tradeAmountIncludesFees ? 1 : 0,
        input.allowLongMarginTrading ? 1 : 0,
        input.allowShortSelling ? 1 : 0,
        input.updatedAt,
      );
      upsertDefaultUserAppPreferencesStmt.run(
        input.defaultUserId,
        '{}',
        '{}',
        input.updatedAt,
      );
      input.reportModule('systemSettingsBytes', 85, 'RUNNING');
      input.markCoreDataCommitted();

      return {
        deletedSessions,
        deletedStatsSessions,
        deletedStatsTags,
        deletedStatsMonthly,
        deletedStatsPools,
        deletedStatsSymbols,
        deletedStatsTimeframes,
        deletedProjects,
        deletedPortableProjectPreviews,
        deletedSpecialTrainingDrawCursors,
        deletedSpecialTrainingScopeIndexes,
        deletedSpecialTrainingLedger,
        deletedSpecialTrainingBanks,
        deletedSpecialTrainingHistoryQuestions,
        deletedSpecialTrainingHistorySessions,
        deletedSpecialTrainingQuestionSnapshots,
        deletedSpecialTrainingStatsProjection,
        deletedReplayNotes,
        deletedSimulationBatches,
        deletedBacktestEquityPoints,
        deletedBacktestFills,
        deletedBacktestResults,
        deletedBacktestBatches,
        deletedLocalDataSourceFiles,
        deletedLocalDataImportJobs,
        deletedLocalDataSources,
        deletedPortableSourceManifests,
        deletedTransfers,
        deletedInstruments,
      };
    });
    return tx();
  };

  return {
    readActiveBacktestBatch: (): ActiveBacktestBatchRow | null =>
      (readActiveBacktestBatchStmt.get() as ActiveBacktestBatchRow | undefined) ??
      null,
    hasActiveLocalDataSourceMutation: (): boolean =>
      toCount(
        countActiveLocalDataSourceMutationsStmt.get() as
          | { count?: unknown }
          | undefined,
      ) > 0,
    readResetAllStoredDataPostState,
    runResetAllStoredDataMutation,
  };
};
