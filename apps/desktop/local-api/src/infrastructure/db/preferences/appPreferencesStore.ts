// SPDX-License-Identifier: GPL-3.0-only

import { db, DEFAULT_USER_ID } from "../database.js";

export type AppPreferencesRow = {
  user_id: string;
  ui_settings_json: string;
  data_pool_removed_symbols_json: string;
  updated_at: string;
};

const ensurePreferencesRowStmt = db.prepare(
  `INSERT OR IGNORE INTO user_app_preferences (
    user_id, ui_settings_json, data_pool_removed_symbols_json, updated_at
  ) VALUES (?,?,?,?)`,
);

const getPreferencesRowStmt = db.prepare(
  `SELECT user_id, ui_settings_json, data_pool_removed_symbols_json, updated_at
   FROM user_app_preferences
   WHERE user_id = ?`,
);

const updateUiSettingsStmt = db.prepare(
  `UPDATE user_app_preferences
   SET ui_settings_json = ?, updated_at = ?
   WHERE user_id = ?`,
);

const updateRemovedSymbolsStmt = db.prepare(
  `UPDATE user_app_preferences
   SET data_pool_removed_symbols_json = ?, updated_at = ?
   WHERE user_id = ?`,
);

const ensurePreferencesRow = (updatedAt: string): void => {
  ensurePreferencesRowStmt.run(DEFAULT_USER_ID, "{}", "{}", updatedAt);
};

export const readAppPreferencesRow = (updatedAt: string): AppPreferencesRow => {
  ensurePreferencesRow(updatedAt);
  const row = getPreferencesRowStmt.get(DEFAULT_USER_ID) as
    | AppPreferencesRow
    | undefined;
  if (row) {
    return row;
  }
  return {
    user_id: DEFAULT_USER_ID,
    ui_settings_json: "{}",
    data_pool_removed_symbols_json: "{}",
    updated_at: updatedAt,
  };
};

export const updateAppUiSettingsJson = (
  uiSettingsJson: string,
  updatedAt: string,
): void => {
  ensurePreferencesRow(updatedAt);
  updateUiSettingsStmt.run(uiSettingsJson, updatedAt, DEFAULT_USER_ID);
};

export const updateDataPoolRemovedSymbolsJson = (
  removedSymbolsJson: string,
  updatedAt: string,
): void => {
  ensurePreferencesRow(updatedAt);
  updateRemovedSymbolsStmt.run(removedSymbolsJson, updatedAt, DEFAULT_USER_ID);
};
