// SPDX-License-Identifier: GPL-3.0-only

import {
  backendRuntimeBuildId,
  backendRuntimeIntegrityStatus,
  backendRuntimeManifestDigest,
  type BackendRuntimeIntegrityStatus,
} from "./runtimeInfo.js";
import type { DesktopReleaseChannel } from "./releaseChannel.js";
import type { ZinutoVersionMatrix } from "@zinuto/shared/versionRegistry";
import { buildDesktopVersionMatrix } from "./versionMatrix.js";

export type { DesktopReleaseChannel } from "./releaseChannel.js";

export type StartupBlockReason =
  | "INSUFFICIENT_DISK_SPACE"
  | "LOCAL_DATA_NEEDS_ATTENTION";

export type LocalDataIssueReason =
  | "SCHEMA_MISMATCH"
  | "DATABASE_CORRUPTED"
  | null;

export type StartupMode = "READY" | "BLOCKED";

export type BackendStartupStorageLayout = {
  appRootDir: string;
  coreDataDir: string;
  marketDataDir: string;
  cacheDir: string;
  tempDir: string;
  dbPath: string;
  marketDbPath: string;
  duckdbTempDir: string;
};

export type BackendSecurityIntegrity = {
  runtimeIntegrityStatus: BackendRuntimeIntegrityStatus;
  runtimeManifestDigest: string;
};

export type BackendStartupStatus = {
  mode: StartupMode;
  channel: DesktopReleaseChannel;
  runtimeBuildId: string;
  checkedAt: string;
  startupAllowed: boolean;
  blockReason: StartupBlockReason | null;
  blockMessage: string | null;
  blockDetails: Record<string, string>;
  versions: ZinutoVersionMatrix;
  localDataIssueReason: LocalDataIssueReason;
  requiredHeadroomBytes: number;
  availableHeadroomBytes: number | null;
  storageLayout: BackendStartupStorageLayout | null;
  localDataStatus: "CURRENT" | "NEEDS_ATTENTION";
  securityIntegrity: BackendSecurityIntegrity;
};

export const buildBackendSecurityIntegrity = (): BackendSecurityIntegrity => ({
  runtimeIntegrityStatus: backendRuntimeIntegrityStatus,
  runtimeManifestDigest: backendRuntimeManifestDigest,
});

let startupStatus: BackendStartupStatus = {
  mode: "READY",
  channel: "community",
  runtimeBuildId: backendRuntimeBuildId,
  checkedAt: new Date().toISOString(),
  startupAllowed: true,
  blockReason: null,
  blockMessage: null,
  blockDetails: {},
  versions: buildDesktopVersionMatrix({
    localDataStatus: "CURRENT",
    coreSchemaVersion: null,
    marketSchemaVersion: null,
  }),
  localDataIssueReason: null,
  requiredHeadroomBytes: 0,
  availableHeadroomBytes: null,
  storageLayout: null,
  localDataStatus: "CURRENT",
  securityIntegrity: buildBackendSecurityIntegrity(),
};

export const setBackendStartupStatus = (
  nextStatus: BackendStartupStatus,
): BackendStartupStatus => {
  startupStatus = {
    ...nextStatus,
    runtimeBuildId: nextStatus.runtimeBuildId || backendRuntimeBuildId,
    checkedAt: nextStatus.checkedAt || new Date().toISOString(),
    securityIntegrity: nextStatus.securityIntegrity || buildBackendSecurityIntegrity(),
  };
  return startupStatus;
};

export const getBackendStartupStatus = (): BackendStartupStatus => startupStatus;

export const isBackendStartupBlocked = (): boolean =>
  startupStatus.mode === "BLOCKED" || !startupStatus.startupAllowed;
