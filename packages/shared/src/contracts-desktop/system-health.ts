// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import { ZINUTO_VERSION_DOMAINS } from "../versionRegistry.js";
import {
  nonEmptyTrimmedStringSchema,
  nonNegativeNumberSchema,
  nullableTrimmedStringSchema,
  pathStringSchema,
  positiveIntSchema,
} from "./api-primitives.js";

const desktopStartupStorageLayoutSchema = z.object({
  appRootDir: nonEmptyTrimmedStringSchema,
  coreDataDir: nonEmptyTrimmedStringSchema,
  marketDataDir: nonEmptyTrimmedStringSchema,
  cacheDir: nonEmptyTrimmedStringSchema,
  tempDir: nonEmptyTrimmedStringSchema,
  dbPath: nonEmptyTrimmedStringSchema,
  marketDbPath: nonEmptyTrimmedStringSchema,
  duckdbTempDir: nonEmptyTrimmedStringSchema,
});

const desktopVersionComponentSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  label: nonEmptyTrimmedStringSchema,
  technicalVersion: nonEmptyTrimmedStringSchema,
  displayVersion: nullableTrimmedStringSchema.optional(),
  source: nullableTrimmedStringSchema.optional(),
  status: z.enum(["CURRENT", "NEEDS_ATTENTION", "RESET", "UNKNOWN"]).optional(),
});

const desktopVersionEntrySchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  domain: z.enum(ZINUTO_VERSION_DOMAINS),
  label: nonEmptyTrimmedStringSchema,
  displayVersion: nonEmptyTrimmedStringSchema,
  technicalVersion: nonEmptyTrimmedStringSchema,
  visibility: z.enum(["summary", "diagnostic"]),
  source: nonEmptyTrimmedStringSchema,
  status: z.enum(["CURRENT", "NEEDS_ATTENTION", "RESET", "UNKNOWN"]).optional(),
  components: z.array(desktopVersionComponentSchema),
});

const desktopVersionMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: nonEmptyTrimmedStringSchema,
  entries: z.array(desktopVersionEntrySchema),
});

export const desktopSecurityIntegritySchema = z.object({
  runtimeIntegrityStatus: z.enum(["MANIFEST_DIGESTED", "UNVERIFIED", "FAILED"]),
  runtimeManifestDigest: nonEmptyTrimmedStringSchema.max(128),
});

export const desktopSystemStartupStatusSchema = z.object({
  mode: z.enum(["READY", "BLOCKED"]),
  channel: z.literal("community"),
  runtimeBuildId: nonEmptyTrimmedStringSchema,
  checkedAt: nonEmptyTrimmedStringSchema,
  startupAllowed: z.boolean(),
  blockReason: z
    .enum(["INSUFFICIENT_DISK_SPACE", "LOCAL_DATA_NEEDS_ATTENTION"])
    .nullable(),
  blockMessage: nullableTrimmedStringSchema,
  blockDetails: z.record(z.string(), z.string()),
  versions: desktopVersionMatrixSchema,
  localDataIssueReason: z
    .enum(["SCHEMA_MISMATCH", "DATABASE_CORRUPTED"])
    .nullable(),
  requiredHeadroomBytes: nonNegativeNumberSchema,
  availableHeadroomBytes: nonNegativeNumberSchema.nullable(),
  storageLayout: desktopStartupStorageLayoutSchema.nullable(),
  localDataStatus: z.enum(["CURRENT", "NEEDS_ATTENTION"]),
  securityIntegrity: desktopSecurityIntegritySchema,
});

export const desktopStartupLocalDataReinitializeRequestSchema = z.object({
  confirmation: z.literal("REINITIALIZE_LOCAL_DATA"),
});

export const desktopStartupLocalDataReinitializeResultSchema = z.object({
  status: z.literal("REINITIALIZED"),
  quarantinePath: pathStringSchema,
  requiresReload: z.boolean(),
  requiresBackendRestart: z.boolean(),
  reason: z.enum(["SCHEMA_MISMATCH", "DATABASE_CORRUPTED"]),
  blockReason: z.literal("LOCAL_DATA_NEEDS_ATTENTION"),
  checkedAt: nonEmptyTrimmedStringSchema,
});

export const desktopSystemHealthSchema = z.object({
  status: z.literal("UP"),
  runtimeBuildId: nonEmptyTrimmedStringSchema,
  pid: positiveIntSchema,
  securityIntegrity: desktopSecurityIntegritySchema,
  startupStatus: desktopSystemStartupStatusSchema,
});
