// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { resolveDesktopAppDataDir } from "../../../runtime/desktopRuntime.js";
import { DB_FILE_NAME, MARKET_DB_FILE_NAME } from "./constants.js";

export type DatabaseLocation = {
  dataDir: string;
  dbPath: string;
};

export type DesktopStorageLayout = {
  appRootDir: string;
  coreDataDir: string;
  marketDataDir: string;
  cacheDir: string;
  tempDir: string;
  dbPath: string;
  marketDbPath: string;
  duckdbTempDir: string;
};

const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const toAbsPath = (rawPath: string): string => path.resolve(rawPath);

const buildStorageLayout = ({
  appRootDir,
  coreDataDir,
  marketDataDir,
  cacheDir,
  tempDir,
  dbPath,
  marketDbPath,
}: {
  appRootDir: string;
  coreDataDir: string;
  marketDataDir: string;
  cacheDir: string;
  tempDir: string;
  dbPath: string;
  marketDbPath: string;
}): DesktopStorageLayout => ({
  appRootDir,
  coreDataDir,
  marketDataDir,
  cacheDir,
  tempDir,
  dbPath,
  marketDbPath,
  duckdbTempDir: path.join(tempDir, "duckdb-tmp"),
});

export const resolveDesktopStorageLayout = (): DesktopStorageLayout => {
  const explicitDbPathRaw =
    typeof process.env.ZINUTO_DB_PATH === "string"
      ? process.env.ZINUTO_DB_PATH.trim()
      : "";
  if (explicitDbPathRaw) {
    const explicitDbPath = toAbsPath(explicitDbPathRaw);
    const explicitDataDir = path.dirname(explicitDbPath);
    const cacheDir = path.join(explicitDataDir, "cache");
    const tempDir = path.join(explicitDataDir, "temp");
    ensureDir(explicitDataDir);
    ensureDir(cacheDir);
    ensureDir(tempDir);
    return buildStorageLayout({
      appRootDir: explicitDataDir,
      coreDataDir: explicitDataDir,
      marketDataDir: explicitDataDir,
      cacheDir,
      tempDir,
      dbPath: explicitDbPath,
      marketDbPath: path.join(explicitDataDir, MARKET_DB_FILE_NAME),
    });
  }

  const configuredDataDirRaw =
    typeof process.env.ZINUTO_DATA_DIR === "string"
      ? process.env.ZINUTO_DATA_DIR.trim()
      : "";
  const appRootDir = configuredDataDirRaw
    ? toAbsPath(configuredDataDirRaw)
    : resolveDesktopAppDataDir();
  const durableRootDir = path.join(appRootDir, "data");
  const coreDataDir = path.join(durableRootDir, "core");
  const marketDataDir = path.join(durableRootDir, "market");
  const cacheDir = path.join(appRootDir, "cache");
  const tempDir = path.join(appRootDir, "temp");

  ensureDir(appRootDir);
  ensureDir(coreDataDir);
  ensureDir(marketDataDir);
  ensureDir(cacheDir);
  ensureDir(tempDir);

  return buildStorageLayout({
    appRootDir,
    coreDataDir,
    marketDataDir,
    cacheDir,
    tempDir,
    dbPath: path.join(coreDataDir, DB_FILE_NAME),
    marketDbPath: path.join(marketDataDir, MARKET_DB_FILE_NAME),
  });
};

const resolvedStorageLayout = resolveDesktopStorageLayout();

export const resolveDatabaseLocation = (): DatabaseLocation => ({
  dataDir: resolvedStorageLayout.coreDataDir,
  dbPath: resolvedStorageLayout.dbPath,
});

export const DESKTOP_STORAGE_LAYOUT = resolvedStorageLayout;
