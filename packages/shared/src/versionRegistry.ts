// SPDX-License-Identifier: GPL-3.0-only

import { REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION } from "./replayNoteDocument.js";
import { SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION } from "./systemDevSimulationProfiles.js";
import { TRADING_RULE_PRESET_CATALOG_VERSION } from "./trading.js";

export const ZINUTO_SOFTWARE_VERSION = "2.0.10";

export const ZINUTO_VERSION_MATRIX_SCHEMA_VERSION = 1 as const;

export const ZINUTO_VERSION_DOMAINS = [
  "APP",
  "DATA",
  "MARKET",
  "RULES",
  "RUNTIME",
  "API",
] as const;

export type ZinutoVersionDomain = (typeof ZINUTO_VERSION_DOMAINS)[number];

export const ZINUTO_SEMANTIC_VERSION_CODES = Object.freeze({
  app: "APP 2026Q3.2",
  data: "DATA 2026Q3.1",
  market: "MARKET 2026Q3.2",
  rules: "RULES 2026Q3.1",
  runtime: "RUNTIME 2026Q3.2",
  api: "API v1",
});

export const ZINUTO_VERSION_VISIBILITIES = ["summary", "diagnostic"] as const;

export type ZinutoVersionVisibility =
  (typeof ZINUTO_VERSION_VISIBILITIES)[number];

export const ZINUTO_VERSION_STATUSES = [
  "CURRENT",
  "NEEDS_ATTENTION",
  "RESET",
  "UNKNOWN",
] as const;

export type ZinutoVersionStatus = (typeof ZINUTO_VERSION_STATUSES)[number];

export type ZinutoVersionComponent = {
  id: string;
  label: string;
  technicalVersion: string;
  displayVersion?: string | null;
  source?: string | null;
  status?: ZinutoVersionStatus;
};

export type ZinutoVersionEntry = {
  id: string;
  domain: ZinutoVersionDomain;
  label: string;
  displayVersion: string;
  technicalVersion: string;
  visibility: ZinutoVersionVisibility;
  source: string;
  status?: ZinutoVersionStatus;
  components: ZinutoVersionComponent[];
};

export type ZinutoVersionMatrix = {
  schemaVersion: typeof ZINUTO_VERSION_MATRIX_SCHEMA_VERSION;
  generatedAt: string;
  entries: ZinutoVersionEntry[];
};

export const ZINUTO_CONTRACT_VERSIONS = Object.freeze({
  desktopLocalApi: "v1",
  nativeBridge: "v1",
  runtimeSchemaBindings: "v1",
});

export const ZINUTO_RULE_CONTENT_VERSIONS = Object.freeze({
  tradingRulePresets: TRADING_RULE_PRESET_CATALOG_VERSION,
  replayNoteDocumentSchema: `v${REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION}`,
  systemDevSimulationProfiles: `v${SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION}`,
});

export const normalizeZinutoVersionValue = (value: unknown): string => {
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
};

const normalizeZinutoVersionComponent = (
  component: ZinutoVersionComponent,
): ZinutoVersionComponent => ({
  ...component,
  id: normalizeZinutoVersionValue(component.id),
  label: normalizeZinutoVersionValue(component.label),
  technicalVersion: normalizeZinutoVersionValue(component.technicalVersion),
  displayVersion:
    component.displayVersion === null || component.displayVersion === undefined
      ? null
      : normalizeZinutoVersionValue(component.displayVersion),
  source:
    component.source === null || component.source === undefined
      ? null
      : normalizeZinutoVersionValue(component.source),
});

export const buildZinutoVersionMatrix = (
  entries: readonly ZinutoVersionEntry[],
  generatedAt = new Date().toISOString(),
): ZinutoVersionMatrix => ({
  schemaVersion: ZINUTO_VERSION_MATRIX_SCHEMA_VERSION,
  generatedAt,
  entries: entries.map((entry) => ({
    ...entry,
    id: normalizeZinutoVersionValue(entry.id),
    label: normalizeZinutoVersionValue(entry.label),
    displayVersion: normalizeZinutoVersionValue(entry.displayVersion),
    technicalVersion: normalizeZinutoVersionValue(entry.technicalVersion),
    source: normalizeZinutoVersionValue(entry.source),
    components: entry.components.map(normalizeZinutoVersionComponent),
  })),
});
