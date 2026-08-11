// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { appError } from "../../../kernel/appError.js";
import type { BackendStartupStatus } from "../../../runtime/startupStatus.js";
import { DB_SCHEMA_VERSION } from "./constants.js";
import type { DesktopStorageLayout } from "./location.js";
import { schemaSql } from "./schemaSql.js";
import { runStartupPreflight } from "./startupPreflight.js";

export const STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION =
  "REINITIALIZE_LOCAL_DATA";

export type StartupLocalDataReinitializeRequest = {
  confirmation: typeof STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION;
};

export type StartupLocalDataReinitializeResult = {
  status: "REINITIALIZED";
  quarantinePath: string;
  requiresReload: boolean;
  requiresBackendRestart: boolean;
  reason: Exclude<BackendStartupStatus["localDataIssueReason"], null>;
  blockReason: "LOCAL_DATA_NEEDS_ATTENTION";
  checkedAt: string;
};

const SIDE_CAR_SUFFIXES = ["", "-wal", "-shm"] as const;

const normalizePath = (value: string): string => path.resolve(value);

const samePath = (left: string, right: string): boolean =>
  normalizePath(left) === normalizePath(right);

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const movePathIntoQuarantine = ({
  sourcePath,
  targetPath,
}: {
  sourcePath: string;
  targetPath: string;
}): boolean => {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.renameSync(sourcePath, targetPath);
  return true;
};

const quarantineFileSet = ({
  filePath,
  quarantinePath,
  label,
}: {
  filePath: string;
  quarantinePath: string;
  label: string;
}): boolean => {
  let moved = false;
  for (const suffix of SIDE_CAR_SUFFIXES) {
    const sourcePath = `${filePath}${suffix}`;
    const baseName = suffix ? `${path.basename(filePath)}${suffix}` : path.basename(filePath);
    moved =
      movePathIntoQuarantine({
        sourcePath,
        targetPath: path.join(quarantinePath, "files", label, baseName),
      }) || moved;
  }
  return moved;
};

const quarantineDurableData = (
  storageLayout: DesktopStorageLayout,
  quarantinePath: string,
): void => {
  const coreDataDir = normalizePath(storageLayout.coreDataDir);
  const marketDataDir = normalizePath(storageLayout.marketDataDir);

  if (!samePath(coreDataDir, marketDataDir)) {
    movePathIntoQuarantine({
      sourcePath: coreDataDir,
      targetPath: path.join(quarantinePath, "core"),
    });
    movePathIntoQuarantine({
      sourcePath: marketDataDir,
      targetPath: path.join(quarantinePath, "market"),
    });
    return;
  }

  quarantineFileSet({
    filePath: storageLayout.dbPath,
    quarantinePath,
    label: "core",
  });
  quarantineFileSet({
    filePath: storageLayout.marketDbPath,
    quarantinePath,
    label: "market",
  });
};

const createFreshCoreDatabase = (storageLayout: DesktopStorageLayout): void => {
  ensureDir(storageLayout.coreDataDir);
  ensureDir(storageLayout.marketDataDir);
  ensureDir(storageLayout.cacheDir);
  ensureDir(storageLayout.tempDir);

  const db = new Database(storageLayout.dbPath);
  try {
    const now = new Date().toISOString();
    db.exec(schemaSql);
    db.prepare(
      `INSERT INTO app_meta (key,value,updated_at)
       VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("app_name", "zinuto", now);
    db.prepare(
      `INSERT INTO app_meta (key,value,updated_at)
       VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("db_file_path", storageLayout.dbPath, now);
    db.prepare(
      `INSERT INTO app_meta (key,value,updated_at)
       VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("db_schema_version", DB_SCHEMA_VERSION, now);
  } finally {
    db.close();
  }
};

const assertReinitializeAllowed = ({
  request,
  startupStatus,
}: {
  request: StartupLocalDataReinitializeRequest;
  startupStatus: BackendStartupStatus;
}): Exclude<BackendStartupStatus["localDataIssueReason"], null> => {
  if (request.confirmation !== STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION) {
    throw appError(
      "STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION_REQUIRED",
      {
        reason: "CONFIRMATION_REQUIRED",
      },
      400,
    );
  }

  if (
    startupStatus.blockReason !== "LOCAL_DATA_NEEDS_ATTENTION" ||
    !startupStatus.localDataIssueReason
  ) {
    throw appError(
      "STARTUP_LOCAL_DATA_REINITIALIZE_UNAVAILABLE",
      {
        reason: startupStatus.blockReason ?? "STARTUP_NOT_BLOCKED",
      },
      409,
    );
  }

  return startupStatus.localDataIssueReason;
};

export const reinitializeStartupLocalData = ({
  request,
  startupStatus,
  storageLayout,
}: {
  request: StartupLocalDataReinitializeRequest;
  startupStatus: BackendStartupStatus;
  storageLayout: DesktopStorageLayout;
}): StartupLocalDataReinitializeResult => {
  const reason = assertReinitializeAllowed({ request, startupStatus });
  const quarantinePath = path.join(
    storageLayout.appRootDir,
    "local-data-quarantine",
    `startup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  );

  ensureDir(quarantinePath);
  quarantineDurableData(storageLayout, quarantinePath);
  createFreshCoreDatabase(storageLayout);

  const nextStatus = runStartupPreflight(storageLayout);
  if (!nextStatus.startupAllowed) {
    throw appError(
      "STARTUP_LOCAL_DATA_REINITIALIZE_FAILED",
      {
        reason: nextStatus.localDataIssueReason ?? nextStatus.blockReason ?? "UNKNOWN",
      },
      500,
    );
  }

  return {
    status: "REINITIALIZED",
    quarantinePath,
    requiresReload: true,
    requiresBackendRestart: true,
    reason,
    blockReason: "LOCAL_DATA_NEEDS_ATTENTION",
    checkedAt: new Date().toISOString(),
  };
};
