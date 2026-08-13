// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import Database from "better-sqlite3";
import {
  buildBackendSecurityIntegrity,
  type BackendStartupStatus,
  setBackendStartupStatus,
} from "../../../runtime/startupStatus.js";
import { resolveDesktopReleaseChannel } from "../../../runtime/releaseChannel.js";
import {
  CORE_SCHEMA_STARTUP_SCRATCH_BYTES,
  DB_SCHEMA_VERSION,
  GLOBAL_STARTUP_MIN_FREE_BYTES,
  MARKET_SCHEMA_VERSION,
  MARKET_STARTUP_SCRATCH_BYTES,
} from "./constants.js";
import { buildDesktopVersionMatrix } from "../../../runtime/versionMatrix.js";
import type { CoreSchemaUpgradeResult } from "./coreSchemaUpgrade.js";
import type { DesktopStorageLayout } from "./location.js";
import type { MarketSchemaUpgradeResult } from "../marketDatabase/schemaUpgrade.js";
import { inspectCoreSchemaManifest } from "./coreSchemaManifest.js";

const readAvailableBytes = (targetDir: string): number | null => {
  try {
    const statfs = fs.statfsSync(targetDir);
    const availableBlocks = Number(statfs.bavail ?? Number.NaN);
    const blockSize = Number(statfs.bsize ?? Number.NaN);
    if (!Number.isFinite(availableBlocks) || !Number.isFinite(blockSize)) {
      return null;
    }
    return Math.max(0, Math.floor(availableBlocks * blockSize));
  } catch {
    return null;
  }
};

const probeCoreSchemaVersion = (
  dbFilePath: string,
): {
  schemaVersion: string | null;
  isCurrent: boolean;
  isCorrupted: boolean;
  missingSchemaRequirements: string[];
} => {
  if (!fs.existsSync(dbFilePath)) {
    return {
      schemaVersion: null,
      isCurrent: true,
      isCorrupted: false,
      missingSchemaRequirements: [],
    };
  }
  let db: Database.Database | null = null;
  try {
    db = new Database(dbFilePath, {
      readonly: true,
      fileMustExist: true,
    });
    const quickCheck = (
      db.pragma("quick_check") as Array<Record<string, unknown>>
    ).map((row) => String(Object.values(row)[0] ?? "").trim().toLowerCase());
    if (quickCheck.length !== 1 || quickCheck[0] !== "ok") {
      return {
        schemaVersion: null,
        isCurrent: false,
        isCorrupted: true,
        missingSchemaRequirements: [],
      };
    }
    const hasAppMetaTable =
      Number(
        db
          .prepare(
            "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
          )
          .pluck()
          .get() ?? 0,
      ) > 0;
    if (!hasAppMetaTable) {
      return {
        schemaVersion: null,
        isCurrent: false,
        isCorrupted: false,
        missingSchemaRequirements: [],
      };
    }
    const schemaVersion = String(
      db
        .prepare("SELECT value FROM app_meta WHERE key = 'db_schema_version'")
        .pluck()
        .get() ?? "",
    ).trim();
    const missingSchemaRequirements = inspectCoreSchemaManifest(
      db,
      DB_SCHEMA_VERSION,
    );
    return {
      schemaVersion: schemaVersion || null,
      isCurrent:
        schemaVersion === DB_SCHEMA_VERSION &&
        missingSchemaRequirements.length === 0,
      isCorrupted: false,
      missingSchemaRequirements,
    };
  } catch {
    return {
      schemaVersion: null,
      isCurrent: false,
      isCorrupted: true,
      missingSchemaRequirements: [],
    };
  } finally {
    db?.close();
  }
};

const inspectCoreData = (
  storageLayout: DesktopStorageLayout,
  upgradeResult?: CoreSchemaUpgradeResult,
): {
  schemaVersion: string | null;
  isCurrent: boolean;
  issueReason: BackendStartupStatus["localDataIssueReason"];
  missingSchemaRequirements: string[];
  upgradeStatus: CoreSchemaUpgradeResult["status"] | null;
  upgradeFailureReason: CoreSchemaUpgradeResult["failureReason"];
} => {
  const coreProbe = probeCoreSchemaVersion(storageLayout.dbPath);
  if (coreProbe.isCurrent) {
    return {
      schemaVersion: coreProbe.schemaVersion ?? DB_SCHEMA_VERSION,
      isCurrent: true,
      issueReason: null,
      missingSchemaRequirements: [],
      upgradeStatus: upgradeResult?.status ?? null,
      upgradeFailureReason: upgradeResult?.failureReason ?? null,
    };
  }
  if (upgradeResult?.failureReason === "INSUFFICIENT_DISK_SPACE") {
    return {
      schemaVersion: coreProbe.schemaVersion ?? upgradeResult.fromVersion,
      isCurrent: false,
      issueReason: null,
      missingSchemaRequirements: coreProbe.missingSchemaRequirements,
      upgradeStatus: upgradeResult.status,
      upgradeFailureReason: upgradeResult.failureReason,
    };
  }
  const issueReason = coreProbe.isCorrupted
    ? "DATABASE_CORRUPTED"
    : "SCHEMA_MISMATCH";
  return {
    schemaVersion: coreProbe.schemaVersion,
    isCurrent: false,
    issueReason,
    missingSchemaRequirements: coreProbe.missingSchemaRequirements,
    upgradeStatus: upgradeResult?.status ?? null,
    upgradeFailureReason: upgradeResult?.failureReason ?? null,
  };
};

type InspectedMarketData = {
  schemaVersion: string | null;
  isCurrent: boolean;
  issueReason: BackendStartupStatus["localDataIssueReason"];
  missingSchemaRequirements: string[];
  upgradeStatus: MarketSchemaUpgradeResult["status"] | "NOT_PROBED";
  requiredHeadroomBytes: number | null;
  availableHeadroomBytes: number | null;
};

const inspectMarketData = (
  storageLayout: DesktopStorageLayout,
  upgradeResult?: MarketSchemaUpgradeResult,
): InspectedMarketData => {
  if (upgradeResult) {
    return {
      schemaVersion: upgradeResult.schemaVersion,
      isCurrent: upgradeResult.isCurrent,
      issueReason: upgradeResult.issueReason,
      missingSchemaRequirements: upgradeResult.missingSchemaRequirements,
      upgradeStatus: upgradeResult.status,
      requiredHeadroomBytes: upgradeResult.requiredHeadroomBytes,
      availableHeadroomBytes: upgradeResult.availableHeadroomBytes,
    };
  }
  if (!fs.existsSync(storageLayout.marketDbPath)) {
    return {
      schemaVersion: MARKET_SCHEMA_VERSION,
      isCurrent: true,
      issueReason: null,
      missingSchemaRequirements: [],
      upgradeStatus: "NOT_PROBED",
      requiredHeadroomBytes: null,
      availableHeadroomBytes: null,
    };
  }
  return {
    schemaVersion: null,
    isCurrent: false,
    issueReason: "SCHEMA_MISMATCH",
    missingSchemaRequirements: ["market:<startup-probe-required>"],
    upgradeStatus: "NOT_PROBED",
    requiredHeadroomBytes: null,
    availableHeadroomBytes: null,
  };
};

const computeRequiredHeadroomBytes = ({
  requireMarketData = true,
}: {
  requireMarketData?: boolean;
} = {}): number =>
  GLOBAL_STARTUP_MIN_FREE_BYTES +
  (requireMarketData
    ? Math.max(CORE_SCHEMA_STARTUP_SCRATCH_BYTES, MARKET_STARTUP_SCRATCH_BYTES)
    : CORE_SCHEMA_STARTUP_SCRATCH_BYTES);

export const runStartupPreflight = (
  storageLayout: DesktopStorageLayout,
  upgrades: {
    core?: CoreSchemaUpgradeResult;
    market?: MarketSchemaUpgradeResult;
  } = {},
  options: {
    requireMarketData?: boolean;
  } = {},
): BackendStartupStatus => {
  const channel = resolveDesktopReleaseChannel();
  const coreData = inspectCoreData(storageLayout, upgrades.core);
  const marketData = options.requireMarketData === false
    ? {
        schemaVersion: null,
        isCurrent: true,
        issueReason: null,
        missingSchemaRequirements: [],
        upgradeStatus: "NOT_PROBED" as const,
        requiredHeadroomBytes: null,
        availableHeadroomBytes: null,
      }
    : inspectMarketData(storageLayout, upgrades.market);
  const measuredAvailableHeadroomBytes = readAvailableBytes(storageLayout.appRootDir);
  const requiredHeadroomBytes = Math.max(
    computeRequiredHeadroomBytes({
      requireMarketData: options.requireMarketData !== false,
    }),
    upgrades.core?.requiredHeadroomBytes ?? 0,
    marketData.requiredHeadroomBytes ?? 0,
  );
  const reportedAvailableHeadroomBytes = [
    upgrades.core?.availableHeadroomBytes,
    marketData.availableHeadroomBytes,
    measuredAvailableHeadroomBytes,
  ].filter((value): value is number => value !== null && value !== undefined);
  // When statfs cannot be measured, fall back to a conservative lower bound
  // (0 free bytes) instead of exempting the disk check entirely.
  const availableHeadroomBytes = reportedAvailableHeadroomBytes.length
    ? Math.min(...reportedAvailableHeadroomBytes)
    : measuredAvailableHeadroomBytes === null
      ? 0
      : null;

  let mode: BackendStartupStatus["mode"] = "READY";
  let startupAllowed = true;
  let blockReason: BackendStartupStatus["blockReason"] = null;
  let blockMessage: string | null = null;
  const blockDetails: Record<string, string> = {};

  const localDataIssueReason = coreData.issueReason ?? marketData.issueReason;
  const upgradeBlockedByDisk =
    coreData.upgradeFailureReason === "INSUFFICIENT_DISK_SPACE" ||
    marketData.upgradeStatus === "INSUFFICIENT_DISK_SPACE";

  if (localDataIssueReason) {
    mode = "BLOCKED";
    startupAllowed = false;
    blockReason = "LOCAL_DATA_NEEDS_ATTENTION";
    blockMessage =
      "The local durable data store needs attention before startup.";
    blockDetails.issueReason = localDataIssueReason;
    blockDetails.coreSchemaVersion = coreData.schemaVersion ?? "";
    blockDetails.expectedCoreSchemaVersion = DB_SCHEMA_VERSION;
    blockDetails.marketSchemaVersion = marketData.schemaVersion ?? "unknown";
    blockDetails.expectedMarketSchemaVersion = MARKET_SCHEMA_VERSION;
    if (coreData.missingSchemaRequirements.length > 0) {
      blockDetails.missingSchemaRequirements =
        coreData.missingSchemaRequirements.join(",");
    }
    if (marketData.missingSchemaRequirements.length > 0) {
      blockDetails.missingMarketSchemaRequirements =
        marketData.missingSchemaRequirements.join(",");
    }
  } else if (
    upgradeBlockedByDisk ||
    (availableHeadroomBytes !== null &&
      availableHeadroomBytes < requiredHeadroomBytes)
  ) {
    mode = "BLOCKED";
    startupAllowed = false;
    blockReason = "INSUFFICIENT_DISK_SPACE";
    blockMessage =
      "Not enough free disk space is available to complete startup validation safely.";
    blockDetails.requiredHeadroomBytes = String(requiredHeadroomBytes);
    blockDetails.availableHeadroomBytes =
      availableHeadroomBytes === null ? "unknown" : String(availableHeadroomBytes);
  }

  if (coreData.upgradeStatus) {
    blockDetails.coreSchemaUpgradeStatus = coreData.upgradeStatus;
  }
  if (coreData.upgradeFailureReason) {
    blockDetails.coreSchemaUpgradeFailureReason =
      coreData.upgradeFailureReason;
  }
  blockDetails.marketSchemaUpgradeStatus = marketData.upgradeStatus;

  const localDataStatus: BackendStartupStatus["localDataStatus"] =
    coreData.isCurrent && marketData.isCurrent ? "CURRENT" : "NEEDS_ATTENTION";
  const coreSchemaVersion = coreData.schemaVersion ?? "unknown";
  const marketSchemaVersion = marketData.schemaVersion ?? "unknown";

  return setBackendStartupStatus({
    mode,
    channel,
    runtimeBuildId: "",
    checkedAt: new Date().toISOString(),
    startupAllowed,
    blockReason,
    blockMessage,
    blockDetails,
    versions: buildDesktopVersionMatrix({
      localDataStatus,
      coreSchemaVersion,
      marketSchemaVersion,
    }),
    localDataIssueReason,
    requiredHeadroomBytes,
    availableHeadroomBytes,
    storageLayout: {
      appRootDir: storageLayout.appRootDir,
      coreDataDir: storageLayout.coreDataDir,
      marketDataDir: storageLayout.marketDataDir,
      cacheDir: storageLayout.cacheDir,
      tempDir: storageLayout.tempDir,
      dbPath: storageLayout.dbPath,
      marketDbPath: storageLayout.marketDbPath,
      duckdbTempDir: storageLayout.duckdbTempDir,
    },
    localDataStatus,
    securityIntegrity: buildBackendSecurityIntegrity(),
  });
};
