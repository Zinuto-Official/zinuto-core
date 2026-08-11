// SPDX-License-Identifier: GPL-3.0-only

import {
  buildZinutoVersionMatrix,
  ZINUTO_CONTRACT_VERSIONS,
  ZINUTO_RULE_CONTENT_VERSIONS,
  ZINUTO_SEMANTIC_VERSION_CODES,
  ZINUTO_SOFTWARE_VERSION,
  type ZinutoVersionEntry,
  type ZinutoVersionMatrix,
  type ZinutoVersionStatus,
} from "@zinuto/shared/versionRegistry";
import {
  DB_SCHEMA_VERSION,
  MARKET_SCHEMA_VERSION,
} from "../infrastructure/db/database/constants.js";
import {
  SYSTEM_BARS_SEED_VERSION,
  SYSTEM_FX_1M_2025Q1_SEED_VERSION,
  SYSTEM_WIKI_EOD_SEED_VERSION,
} from "../infrastructure/db/systemSeedBars.js";
import {
  backendNodeRuntimeVersion,
  backendRuntimeBuildId,
  desktopAppVersion,
} from "./runtimeInfo.js";

type DesktopVersionMatrixInput = {
  localDataStatus: ZinutoVersionStatus;
  coreSchemaVersion: string | null;
  marketSchemaVersion: string | null;
};

const DESKTOP_PRODUCT_NAME = "Zinuto Core";

const joinTechnicalVersions = (items: Record<string, string>): string =>
  Object.entries(items)
    .map(([label, version]) => `${label}=${version}`)
    .join("; ");

export const buildDesktopVersionMatrix = ({
  localDataStatus,
  coreSchemaVersion,
  marketSchemaVersion,
}: DesktopVersionMatrixInput): ZinutoVersionMatrix => {
  const currentDesktopAppVersion =
    desktopAppVersion === "unknown" ? ZINUTO_SOFTWARE_VERSION : desktopAppVersion;
  const coreDataVersion = coreSchemaVersion ?? DB_SCHEMA_VERSION;
  const marketDataVersion = marketSchemaVersion ?? MARKET_SCHEMA_VERSION;

  const entries: ZinutoVersionEntry[] = [
    {
      id: "app.desktop",
      domain: "APP",
      label: "APP_DESKTOP",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.app,
      technicalVersion: currentDesktopAppVersion,
      visibility: "summary",
      source: "tauri.package.version",
      components: [
        {
          id: "app.desktopVersion",
          label: "DESKTOP_APP",
          displayVersion: `${DESKTOP_PRODUCT_NAME} ${currentDesktopAppVersion}`,
          technicalVersion: currentDesktopAppVersion,
          source: "tauri.package.version",
        },
      ],
    },
    {
      id: "data.localStore",
      domain: "DATA",
      label: "DATA_LOCAL_STORE",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.data,
      technicalVersion: joinTechnicalVersions({
        core: coreDataVersion,
        market: marketDataVersion,
      }),
      visibility: "summary",
      source: "backend.db.database.constants",
      status: localDataStatus,
      components: [
        {
          id: "data.coreSqlite",
          label: "CORE_DATA",
          technicalVersion: coreDataVersion,
          source: "backend.db.database.constants.DB_SCHEMA_VERSION",
          status: localDataStatus,
        },
        {
          id: "data.marketDuckDb",
          label: "MARKET_DATA",
          technicalVersion: marketDataVersion,
          source: "backend.db.database.constants.MARKET_SCHEMA_VERSION",
          status: localDataStatus,
        },
      ],
    },
    {
      id: "market.builtinData",
      domain: "MARKET",
      label: "MARKET_BUILTIN_DATA",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.market,
      technicalVersion: SYSTEM_BARS_SEED_VERSION,
      visibility: "summary",
      source: "backend.db.systemSeedBars.SYSTEM_BARS_SEED_VERSION",
      components: [
        {
          id: "market.wikiEod100",
          label: "WIKI",
          technicalVersion: SYSTEM_WIKI_EOD_SEED_VERSION,
          source: "backend.db.systemSeedBars.SYSTEM_WIKI_EOD_SEED_VERSION",
        },
        {
          id: "market.fx1m2025q1",
          label: "FX",
          technicalVersion: SYSTEM_FX_1M_2025Q1_SEED_VERSION,
          source: "backend.db.systemSeedBars.SYSTEM_FX_1M_2025Q1_SEED_VERSION",
        },
      ],
    },
    {
      id: "rules.trainingContent",
      domain: "RULES",
      label: "RULES_TRAINING_CONTENT",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.rules,
      technicalVersion: joinTechnicalVersions({
        trading: ZINUTO_RULE_CONTENT_VERSIONS.tradingRulePresets,
        notes: ZINUTO_RULE_CONTENT_VERSIONS.replayNoteDocumentSchema,
        simulation: ZINUTO_RULE_CONTENT_VERSIONS.systemDevSimulationProfiles,
      }),
      visibility: "summary",
      source: "shared.versionRegistry",
      components: [
        {
          id: "rules.tradingPresets",
          label: "TRADING_RULES",
          technicalVersion: ZINUTO_RULE_CONTENT_VERSIONS.tradingRulePresets,
          source: "shared.trading.TRADING_RULE_PRESET_CATALOG_VERSION",
        },
        {
          id: "rules.replayNoteDocument",
          label: "NOTE_DOCUMENT",
          technicalVersion: ZINUTO_RULE_CONTENT_VERSIONS.replayNoteDocumentSchema,
          source: "shared.replayNoteDocument.REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION",
        },
        {
          id: "rules.systemDevSimulationProfiles",
          label: "SIMULATION_PROFILES",
          technicalVersion:
            ZINUTO_RULE_CONTENT_VERSIONS.systemDevSimulationProfiles,
          source:
            "shared.systemDevSimulationProfiles.SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION",
        },
      ],
    },
    {
      id: "runtime.backend",
      domain: "RUNTIME",
      label: "RUNTIME_BACKEND",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.runtime,
      technicalVersion: backendRuntimeBuildId,
      visibility: "diagnostic",
      source: "src-tauri.gen.runtime-manifest.runtimeBuildId",
      components: [
        {
          id: "runtime.backendBundle",
          label: "BACKEND_BUNDLE",
          technicalVersion: backendRuntimeBuildId,
          source: "src-tauri.gen.runtime-manifest.runtimeBuildId",
        },
        {
          id: "runtime.node",
          label: "NODE",
          technicalVersion: backendNodeRuntimeVersion,
          source: "process.version",
        },
      ],
    },
    {
      id: "api.contracts",
      domain: "API",
      label: "API_CONTRACTS",
      displayVersion: ZINUTO_SEMANTIC_VERSION_CODES.api,
      technicalVersion: joinTechnicalVersions({
        desktop: ZINUTO_CONTRACT_VERSIONS.desktopLocalApi,
        native: ZINUTO_CONTRACT_VERSIONS.nativeBridge,
        schemas: ZINUTO_CONTRACT_VERSIONS.runtimeSchemaBindings,
      }),
      visibility: "diagnostic",
      source: "contracts",
      components: [
        {
          id: "api.desktopLocal",
          label: "DESKTOP_API",
          technicalVersion: ZINUTO_CONTRACT_VERSIONS.desktopLocalApi,
          source: "contracts/openapi/desktop-local-api.v1.yaml",
        },
        {
          id: "api.nativeBridge",
          label: "NATIVE_BRIDGE",
          technicalVersion: ZINUTO_CONTRACT_VERSIONS.nativeBridge,
          source: "contracts/native-bridge/native-bridge.v1.json",
        },
        {
          id: "api.runtimeSchemas",
          label: "RUNTIME_SCHEMAS",
          technicalVersion: ZINUTO_CONTRACT_VERSIONS.runtimeSchemaBindings,
          source: "contracts/runtime-response-schemas.v1.json",
        },
      ],
    },
  ];

  return buildZinutoVersionMatrix(entries);
};
