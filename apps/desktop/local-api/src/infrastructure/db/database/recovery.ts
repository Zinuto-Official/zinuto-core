// SPDX-License-Identifier: GPL-3.0-only

import Database from "better-sqlite3";

export const openDatabaseWithoutDestructiveRecovery = (
  dbFilePath: string,
): Database.Database => new Database(dbFilePath);
