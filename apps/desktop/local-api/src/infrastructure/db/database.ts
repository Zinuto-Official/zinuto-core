// SPDX-License-Identifier: GPL-3.0-only

import { createId } from "../../kernel/id.js";
import { nowIso } from "../../kernel/time.js";
import {
  DEFAULT_ALLOW_LONG_MARGIN_TRADING,
  DEFAULT_ALLOW_SHORT_SELLING,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_CONTRACT_MULTIPLIER,
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_INITIAL_BANK_BALANCE,
  DEFAULT_INITIAL_SECURITIES_BALANCE,
  DEFAULT_LONG_FINANCING_ANNUAL_RATE,
  DEFAULT_LONG_INITIAL_MARGIN_RATIO,
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_MAKER_FEE_RATE,
  DEFAULT_MIN_TRADE_STEP,
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_POSITION_COST_MODE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_SECURITIES_ACCOUNT_ID,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_MODE,
  DEFAULT_STAMP_DUTY_SINGLE_SIDE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_TRADING_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
  DEFAULT_TRADE_SETTLEMENT_MODE,
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
  DEFAULT_TRANSACTION_LEVY_RATE,
  DEFAULT_TRANSFER_FEE_RATE,
  DEFAULT_USER_ID,
} from "./defaults.js";
import {
  generateSystemSeedBars,
  getSystemSeedStorageEstimatesByPoolId,
  getSystemSeedStorageEstimate,
  listSystemSeedInstruments,
  listSystemSeedSymbols,
  resolveSystemSeedInstrumentMetadata,
  resolveSystemSeedBaseTimeframe,
  resolveSystemSeedMarketPresetId,
  SYSTEM_BARS_SEED_VERSION,
  SYSTEM_SEED_MARKET_PRESET_ID,
  SYSTEM_SEED_MIN_TRADE_STEP,
  SYSTEM_SEED_TIME_ZONE,
  type SystemSeedBaseTimeframe,
  type SystemSeedInstrumentDefinition,
} from "./systemSeedBars.js";
import { DB_SCHEMA_VERSION } from "./database/constants.js";
import { upgradeSupportedCoreSchema } from "./database/coreSchemaUpgrade.js";
import {
  DESKTOP_STORAGE_LAYOUT,
  resolveDatabaseLocation,
} from "./database/location.js";
import { openDatabaseWithoutDestructiveRecovery } from "./database/recovery.js";
import { runStartupPreflight } from "./database/startupPreflight.js";
import { startStartupSchemaUpgradeProgress } from "./database/startupSchemaUpgradeProgress.js";
import { probeAndUpgradeMarketSchema } from "./marketDatabase/schemaUpgrade.js";
import {
  createDatabaseMaintenanceApi,
} from "./database/maintenance.js";
import { schemaSql } from "./database/schemaSql.js";
export type { DatabaseStorageFootprint } from "./database/maintenance.js";

export {
  DEFAULT_ALLOW_LONG_MARGIN_TRADING,
  DEFAULT_ALLOW_SHORT_SELLING,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_CONTRACT_MULTIPLIER,
  DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
  DEFAULT_FUNDING_RATE,
  DEFAULT_INITIAL_BANK_BALANCE,
  DEFAULT_INITIAL_SECURITIES_BALANCE,
  DEFAULT_LONG_FINANCING_ANNUAL_RATE,
  DEFAULT_LONG_INITIAL_MARGIN_RATIO,
  DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_MAKER_FEE_RATE,
  DEFAULT_MIN_TRADE_STEP,
  DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_POSITION_COST_MODE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_SECURITIES_ACCOUNT_ID,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_MODE,
  DEFAULT_STAMP_DUTY_SINGLE_SIDE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_TRADING_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_ID,
  DEFAULT_TRADE_AMOUNT_INCLUDES_FEES,
  DEFAULT_TRADE_SETTLEMENT_MODE,
  DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
  DEFAULT_TRANSACTION_LEVY_RATE,
  DEFAULT_TRANSFER_FEE_RATE,
  DEFAULT_USER_ID,
  generateSystemSeedBars,
  getSystemSeedStorageEstimatesByPoolId,
  getSystemSeedStorageEstimate,
  listSystemSeedInstruments,
  listSystemSeedSymbols,
  resolveSystemSeedInstrumentMetadata,
  resolveSystemSeedBaseTimeframe,
  resolveSystemSeedMarketPresetId,
  SYSTEM_BARS_SEED_VERSION,
  SYSTEM_SEED_MARKET_PRESET_ID,
  SYSTEM_SEED_MIN_TRADE_STEP,
  SYSTEM_SEED_TIME_ZONE,
};
export type { SystemSeedBaseTimeframe, SystemSeedInstrumentDefinition };

const resolveStampDutyStorageByMode = (
  mode: "BUY" | "SELL" | "DOUBLE",
): { mode: "SINGLE" | "DOUBLE"; singleSide: "BUY" | "SELL" } => {
  if (mode === "DOUBLE") {
    return { mode: "DOUBLE", singleSide: "SELL" };
  }
  if (mode === "BUY") {
    return { mode: "SINGLE", singleSide: "BUY" };
  }
  return { mode: "SINGLE", singleSide: "SELL" };
};

const resolvedDatabaseLocation = resolveDatabaseLocation();
export const DB_DATA_DIR = resolvedDatabaseLocation.dataDir;
export const DB_FILE_PATH = resolvedDatabaseLocation.dbPath;
export const STORAGE_LAYOUT = DESKTOP_STORAGE_LAYOUT;
export const MARKET_DB_FILE_PATH = STORAGE_LAYOUT.marketDbPath;
export const DUCKDB_TEMP_DIR = STORAGE_LAYOUT.duckdbTempDir;
export const BACKEND_STARTUP_PROGRESS = startStartupSchemaUpgradeProgress();
const isolatedCoreMaintenanceRuntime =
  process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT === "1";
const startupSchemaUpgradeResults = await (async () => {
  if (isolatedCoreMaintenanceRuntime) {
    // Retention workers need one isolated SQLite connection to the already
    // validated core schema. They must not replay schema repair, seed writes,
    // or probe the DuckDB file that the main runtime legitimately keeps open.
    BACKEND_STARTUP_PROGRESS.update("RUNTIME_BOOTSTRAP");
    BACKEND_STARTUP_PROGRESS.heartbeat();
    return { core: undefined, market: undefined };
  }
  BACKEND_STARTUP_PROGRESS.update("CORE_SCHEMA");
  const core = upgradeSupportedCoreSchema(STORAGE_LAYOUT);
  const market = await probeAndUpgradeMarketSchema(STORAGE_LAYOUT, {
    onProgress: (phase) => {
      BACKEND_STARTUP_PROGRESS.update(`MARKET_${phase}`);
    },
  });
  BACKEND_STARTUP_PROGRESS.update("RUNTIME_BOOTSTRAP");
  // Heartbeat before the synchronous SQLite open so the shell never sees a
  // stale RUNTIME_BOOTSTRAP record while the event loop is blocked.
  BACKEND_STARTUP_PROGRESS.heartbeat();
  return { core, market };
})();
export const CORE_SCHEMA_UPGRADE_RESULT = startupSchemaUpgradeResults.core;
export const MARKET_SCHEMA_UPGRADE_RESULT = startupSchemaUpgradeResults.market;
export const STARTUP_PREFLIGHT_STATUS = runStartupPreflight(STORAGE_LAYOUT, {
  core: CORE_SCHEMA_UPGRADE_RESULT,
  market: MARKET_SCHEMA_UPGRADE_RESULT,
}, {
  requireMarketData: !isolatedCoreMaintenanceRuntime,
});

export const db = STARTUP_PREFLIGHT_STATUS.startupAllowed
  ? openDatabaseWithoutDestructiveRecovery(DB_FILE_PATH)
  : (null as unknown as import("better-sqlite3").Database);
const maintenanceApi = STARTUP_PREFLIGHT_STATUS.startupAllowed
  ? createDatabaseMaintenanceApi({
      db,
      dbFilePath: DB_FILE_PATH,
    })
  : {
      getDatabaseStorageFootprint: () => ({
        dbBytes: 0,
        walBytes: 0,
        shmBytes: 0,
        totalBytes: 0,
      }),
      checkpointDatabaseStorage: () => ({
        dbBytes: 0,
        walBytes: 0,
        shmBytes: 0,
        totalBytes: 0,
      }),
      reclaimDatabaseStorage: () => ({
        dbBytes: 0,
        walBytes: 0,
        shmBytes: 0,
        totalBytes: 0,
      }),
      runDatabaseMaintenance: () => ({
        footprintBefore: {
          dbBytes: 0,
          walBytes: 0,
          shmBytes: 0,
          totalBytes: 0,
        },
        footprintAfter: {
          dbBytes: 0,
          walBytes: 0,
          shmBytes: 0,
          totalBytes: 0,
        },
        reclaimedBytes: 0,
      }),
      getDatabaseStorageUsageSummary: () => ({
        measuredAt: new Date().toISOString(),
        source: "PHYSICAL_FALLBACK" as const,
        categories: {
          trainingDataBytes: 0,
          replayNotesBytes: 0,
          marketDataBytes: 0,
          systemSettingsBytes: 0,
          statsDataBytes: 0,
          otherBytes: 0,
        },
        logicalTotalBytes: 0,
        physicalFootprint: {
          dbBytes: 0,
          walBytes: 0,
          shmBytes: 0,
          totalBytes: 0,
        },
        physicalTotalBytes: 0,
      }),
    };

export const getDatabaseStorageFootprint =
  maintenanceApi.getDatabaseStorageFootprint;
export const checkpointDatabaseStorage =
  maintenanceApi.checkpointDatabaseStorage;
export const reclaimDatabaseStorage = maintenanceApi.reclaimDatabaseStorage;
export const runDatabaseMaintenance = maintenanceApi.runDatabaseMaintenance;
export const getDatabaseStorageUsageSummary =
  maintenanceApi.getDatabaseStorageUsageSummary;

let databaseInitialized = false;
let databaseClosed = false;

const ensureSystemInstrumentEntries = (): void => {
  const seedInstruments = listSystemSeedInstruments();
  const selectBySymbol = db.prepare(
    "SELECT id FROM instruments WHERE symbol = ? AND base_timeframe = ? AND market = 'SYSTEM'",
  );
  const insert = db.prepare(
    "INSERT INTO instruments (id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const update = db.prepare(
    "UPDATE instruments SET name = ?, market = ?, time_zone = ?, min_trade_step = ?, bar_count = ?, time_start_ts = ?, time_end_ts = ?, bars_version_token = ?, created_at = COALESCE(created_at, ?) WHERE id = ?",
  );

  const tx = db.transaction(() => {
    for (const seedInstrument of seedInstruments) {
      const { symbol, baseTimeframe, name, timeZone, minTradeStep } = seedInstrument;
      const seedMetadata = resolveSystemSeedInstrumentMetadata(symbol, baseTimeframe);
      const barCount = seedMetadata?.barCount ?? 0;
      const timeStartTs = seedMetadata?.timeStartTs ?? null;
      const timeEndTs = seedMetadata?.timeEndTs ?? null;
      const barsVersionToken = seedMetadata?.barsVersionToken ?? "";
      const existing = selectBySymbol.get(symbol, baseTimeframe) as
        | { id: string }
        | undefined;
      if (existing?.id) {
        update.run(
          name,
          "SYSTEM",
          timeZone,
          minTradeStep,
          barCount,
          timeStartTs,
          timeEndTs,
          barsVersionToken,
          nowIso(),
          existing.id,
        );
        continue;
      }
      insert.run(
        createId(),
        symbol,
        baseTimeframe,
        name,
        "SYSTEM",
        timeZone,
        minTradeStep,
        barCount,
        timeStartTs,
        timeEndTs,
        barsVersionToken,
        nowIso(),
      );
    }
  });
  tx();
};

const SCHEMA_SQL_BATCH_STATEMENTS = 20;

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const splitSchemaStatements = (sql: string): string[] =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

export const initDatabase = async (): Promise<void> => {
  if (!STARTUP_PREFLIGHT_STATUS.startupAllowed) {
    return;
  }
  if (databaseClosed) {
    return;
  }
  if (databaseInitialized) {
    return;
  }
  databaseInitialized = true;
  BACKEND_STARTUP_PROGRESS.heartbeat();

  const schemaStatements = splitSchemaStatements(schemaSql);
  for (let offset = 0; offset < schemaStatements.length; offset += SCHEMA_SQL_BATCH_STATEMENTS) {
    db.exec(`${schemaStatements.slice(offset, offset + SCHEMA_SQL_BATCH_STATEMENTS).join(";")};`);
    await yieldToEventLoop();
    BACKEND_STARTUP_PROGRESS.heartbeat();
  }

  const upsertMeta = db.prepare(
    `INSERT INTO app_meta (key,value,updated_at)
     VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );
  const now = nowIso();

  upsertMeta.run("app_name", "zinuto", now);
  upsertMeta.run("db_file_path", DB_FILE_PATH, now);
  upsertMeta.run("db_schema_version", DB_SCHEMA_VERSION, now);

  db.prepare(
    "INSERT OR IGNORE INTO users (id,name,created_at) VALUES (?,?,?)",
  ).run(DEFAULT_USER_ID, "Default User", nowIso());
  await yieldToEventLoop();
  BACKEND_STARTUP_PROGRESS.heartbeat();

  const ensureAccount = db.prepare(
    "INSERT OR IGNORE INTO accounts (id,user_id,kind,balance,currency,created_at) VALUES (?,?,?,?,?,?)",
  );

  ensureAccount.run(
    DEFAULT_SECURITIES_ACCOUNT_ID,
    DEFAULT_USER_ID,
    "SECURITIES",
    DEFAULT_INITIAL_SECURITIES_BALANCE,
    "CNY",
    nowIso(),
  );
  const defaultStampDutyStorage = resolveStampDutyStorageByMode(
    DEFAULT_STAMP_DUTY_MODE,
  );
  db.prepare(
    `INSERT OR IGNORE INTO user_settings (
      user_id,initial_securities_balance,initial_bank_balance,
      asset_class,market_preset_id,min_trade_step,
      commission_rate,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,transaction_levy_rate,slippage_rate,stamp_duty_rate,
      maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,
      commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
      long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,
      short_borrow_annual_rate,short_initial_margin_ratio,short_maintenance_margin_ratio,
      stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    DEFAULT_USER_ID,
    DEFAULT_INITIAL_SECURITIES_BALANCE,
    DEFAULT_INITIAL_BANK_BALANCE,
    DEFAULT_TRADING_ASSET_CLASS,
    DEFAULT_TRADING_MARKET_PRESET_ID,
    DEFAULT_MIN_TRADE_STEP,
    DEFAULT_COMMISSION_RATE,
    DEFAULT_TRANSFER_FEE_RATE,
    DEFAULT_REGULATORY_FEE_RATE,
    DEFAULT_PLATFORM_FEE_RATE,
    DEFAULT_TRANSACTION_LEVY_RATE,
    DEFAULT_SLIPPAGE_RATE,
    DEFAULT_STAMP_DUTY_RATE,
    DEFAULT_MAKER_FEE_RATE,
    DEFAULT_TAKER_FEE_RATE,
    DEFAULT_FUNDING_RATE,
    DEFAULT_CONTRACT_MULTIPLIER,
    DEFAULT_COMMISSION_MINIMUM_FEE,
    DEFAULT_PLATFORM_FEE_MINIMUM_FEE,
    DEFAULT_TRANSACTION_LEVY_MINIMUM_FEE,
    DEFAULT_LONG_FINANCING_ANNUAL_RATE,
    DEFAULT_LONG_INITIAL_MARGIN_RATIO,
    DEFAULT_LONG_MAINTENANCE_MARGIN_RATIO,
    DEFAULT_SHORT_BORROW_ANNUAL_RATE,
    DEFAULT_SHORT_INITIAL_MARGIN_RATIO,
    DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
    defaultStampDutyStorage.mode,
    defaultStampDutyStorage.singleSide,
    DEFAULT_POSITION_COST_MODE,
    DEFAULT_TRADE_SETTLEMENT_MODE,
    DEFAULT_FREE_REPLAY_END_SETTLEMENT_MODE,
    DEFAULT_TRADE_AMOUNT_INCLUDES_FEES ? 1 : 0,
    DEFAULT_ALLOW_LONG_MARGIN_TRADING ? 1 : 0,
    DEFAULT_ALLOW_SHORT_SELLING ? 1 : 0,
    nowIso(),
  );
  db.prepare(
    `INSERT OR IGNORE INTO user_app_preferences (
      user_id, ui_settings_json, data_pool_removed_symbols_json, updated_at
    ) VALUES (?,?,?,?)`,
  ).run(
    DEFAULT_USER_ID,
    "{}",
    "{}",
    nowIso(),
  );
  await yieldToEventLoop();
  BACKEND_STARTUP_PROGRESS.heartbeat();
  ensureSystemInstrumentEntries();
  BACKEND_STARTUP_PROGRESS.heartbeat();
};

export const closeLocalDatabase = (): void => {
  if (!STARTUP_PREFLIGHT_STATUS.startupAllowed || databaseClosed) {
    return;
  }
  try {
    db.close();
  } catch {
    // best-effort shutdown cleanup
  } finally {
    databaseInitialized = false;
    databaseClosed = true;
  }
};

// Isolated maintenance workers open the current schema without replaying schema
// creation or seed writes. The normal runtime keeps the existing eager init.
if (process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT !== "1") {
  await initDatabase();
}
