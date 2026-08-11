// SPDX-License-Identifier: GPL-3.0-only

import type Database from "better-sqlite3";
import { nowIso } from "../../kernel/time.js";
import {
  arePortablePayloadsEqual,
  parsePayloadJson,
  readBundleRows,
} from "../portableDataPackage.js";
import {
  getCustomIndicatorProfileById,
  getPortablePayloadJsonByKey,
  upsertCustomIndicatorProfileRow,
  upsertPortableUserAppPreferencesRow,
  upsertPortableUserSettingsRow,
} from "../ports/infrastructure/db/portableData/portableDataRepository.js";
import type {
  PortableImportConflictMode,
  PortableImportSettingsConflictMode,
} from "../portableDataModel.js";
import { normalizeText, sanitizeSettingsBundle } from "./helpers.js";
import { parsePortableCustomIndicatorProfile } from "./importDomainPayloadValidation.js";
import type { ExportSettingsBundle } from "./types.js";

export type ImportDomainCounters = {
  imported: number;
  skipped: number;
  conflicts: number;
};

export const importPortableSettingsDomain = ({
  payloadDb,
  settingsConflictMode,
}: {
  payloadDb: Database.Database;
  settingsConflictMode: PortableImportSettingsConflictMode;
}): ImportDomainCounters => {
  const row = getPortablePayloadJsonByKey({
    payloadDb,
    tableName: "portable_export_settings",
    keyColumn: "domain_key",
    key: "SETTINGS",
  });
  const bundle = parsePayloadJson<ExportSettingsBundle | null>(
    row?.payload_json,
    null,
  );
  if (!bundle) {
    return { imported: 0, skipped: 0, conflicts: 0 };
  }
  const same = arePortablePayloadsEqual(bundle, sanitizeSettingsBundle());
  if (same) {
    return { imported: 0, skipped: 1, conflicts: 0 };
  }
  if (settingsConflictMode !== "REPLACE_TARGET") {
    return { imported: 0, skipped: 1, conflicts: 1 };
  }
  if (bundle.userSettings) {
    const rowRecord = bundle.userSettings;
    upsertPortableUserSettingsRow({
      initialSecuritiesBalance: Number(
        rowRecord.initial_securities_balance ?? 0,
      ),
      initialBankBalance: Number(rowRecord.initial_bank_balance ?? 0),
      assetClass: normalizeText(rowRecord.asset_class) || "STOCK",
      marketPresetId: normalizeText(rowRecord.market_preset_id) || "A_SHARE",
      minTradeStep: Number(rowRecord.min_trade_step ?? 0),
      commissionRate: Number(rowRecord.commission_rate ?? 0),
      makerFeeRate: Number(rowRecord.maker_fee_rate ?? 0),
      takerFeeRate: Number(rowRecord.taker_fee_rate ?? 0),
      fundingRate: Number(rowRecord.funding_rate ?? 0),
      contractMultiplier: Number(rowRecord.contract_multiplier ?? 1),
      transferFeeRate: Number(rowRecord.transfer_fee_rate ?? 0),
      regulatoryFeeRate: Number(rowRecord.regulatory_fee_rate ?? 0),
      platformFeeRate: Number(rowRecord.platform_fee_rate ?? 0),
      transactionLevyRate: Number(rowRecord.transaction_levy_rate ?? 0),
      slippageRate: Number(rowRecord.slippage_rate ?? 0),
      stampDutyRate: Number(rowRecord.stamp_duty_rate ?? 0),
      commissionMinimumFee: Number(rowRecord.commission_minimum_fee ?? 0),
      platformFeeMinimumFee: Number(rowRecord.platform_fee_minimum_fee ?? 0),
      transactionLevyMinimumFee: Number(
        rowRecord.transaction_levy_minimum_fee ?? 0,
      ),
      longFinancingAnnualRate: Number(
        rowRecord.long_financing_annual_rate ?? 0,
      ),
      longInitialMarginRatio: Number(rowRecord.long_initial_margin_ratio ?? 0),
      longMaintenanceMarginRatio: Number(
        rowRecord.long_maintenance_margin_ratio ?? 0,
      ),
      shortBorrowAnnualRate: Number(rowRecord.short_borrow_annual_rate ?? 0),
      shortInitialMarginRatio: Number(
        rowRecord.short_initial_margin_ratio ?? 0,
      ),
      shortMaintenanceMarginRatio: Number(
        rowRecord.short_maintenance_margin_ratio ?? 0,
      ),
      stampDutyMode: normalizeText(rowRecord.stamp_duty_mode) || "SINGLE",
      stampDutySingleSide:
        normalizeText(rowRecord.stamp_duty_single_side) || "SELL",
      positionCostMode:
        normalizeText(rowRecord.position_cost_mode) || "DILUTED",
      tradeSettlementMode:
        normalizeText(rowRecord.trade_settlement_mode) || "T0",
      freeReplayEndSettlementMode:
        normalizeText(rowRecord.free_replay_end_settlement_mode) ||
        "FORCE_CLOSE",
      tradeAmountIncludesFees: Number(
        rowRecord.trade_amount_includes_fees ?? 0,
      ),
      allowLongMarginTrading: Number(rowRecord.allow_long_margin_trading ?? 0),
      allowShortSelling: Number(rowRecord.allow_short_selling ?? 0),
      updatedAt: nowIso(),
    });
  }
  if (bundle.userAppPreferences) {
    const rowRecord = bundle.userAppPreferences;
    upsertPortableUserAppPreferencesRow({
      uiSettingsJson: normalizeText(rowRecord.ui_settings_json) || "{}",
      dataPoolRemovedSymbolsJson:
        normalizeText(rowRecord.data_pool_removed_symbols_json) || "{}",
      updatedAt: nowIso(),
    });
  }
  return { imported: 1, skipped: 0, conflicts: 1 };
};

export const importPortableCustomIndicatorsDomain = ({
  payloadDb,
  conflictMode,
}: {
  payloadDb: Database.Database;
  conflictMode: PortableImportConflictMode;
}): ImportDomainCounters => {
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  readBundleRows<{ id: string; payload_json: string }>(
    payloadDb,
    "portable_export_custom_indicators",
  ).forEach((row) => {
    const payload = parsePayloadJson<Record<string, unknown>>(
      row.payload_json,
      {},
    );
    const profile = parsePortableCustomIndicatorProfile(row.id, payload);
    const existing = getCustomIndicatorProfileById(profile.id);
    if (existing) {
      const same = arePortablePayloadsEqual(existing, payload);
      if (same) {
        skipped += 1;
        return;
      }
      conflicts += 1;
      if (conflictMode !== "REPLACE_DOMAIN") {
        skipped += 1;
        return;
      }
    }
    upsertCustomIndicatorProfileRow({
      id: profile.id,
      name: profile.name,
      source: profile.source,
      parameterInputsJson: JSON.stringify(profile.parameterInputs),
      revisionsJson: JSON.stringify(profile.revisions ?? []),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
    imported += 1;
  });
  return { imported, skipped, conflicts };
};
