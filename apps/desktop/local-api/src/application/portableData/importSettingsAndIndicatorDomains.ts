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
import { parsePortableUserSettingsRow } from "./portableSettingsPayload.js";
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
    const settings = parsePortableUserSettingsRow(bundle.userSettings);
    upsertPortableUserSettingsRow({
      ...settings,
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
