// SPDX-License-Identifier: GPL-3.0-only

import type Database from "better-sqlite3";
import { desktopCustomIndicatorProfileSchema } from "@zinuto/shared/contracts-desktop/api";
import {
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "@zinuto/shared/input-limits";
import { normalizeReplayNoteColorTokens } from "@zinuto/shared/replayNoteColors";
import {
  REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
  normalizeReplayNoteDocument,
  stringifyReplayNoteDocument,
} from "@zinuto/shared/replayNoteDocument";
import { appError } from "../../kernel/appError.js";
import { runtimeLimits } from "../../kernel/runtimeLimits.js";
import { nowIso } from "../../kernel/time.js";
import { parsePayloadJson, readBundleRows } from "../portableDataPackage.js";
import {
  countPortableMarketOrphanBars,
  getPortablePayloadJsonByKey,
} from "../ports/infrastructure/db/portableData/portableDataRepository.js";
import { decodeCanonicalBase64GzipJson } from "../replayNotePayloadCodec.js";
import type { PortableExportDomain } from "../portableDataModel.js";
import { buildPortableMarketPayloadFingerprint } from "./marketPayloadFingerprint.js";
import {
  normalizePortableReplayNoteType,
  normalizeText,
  rewritePortableReplayContextArchive,
} from "./helpers.js";
import { parsePortableUserSettingsRow } from "./portableSettingsPayload.js";
import type {
  ExportNoteBundle,
  ExportSettingsBundle,
  ExportSpecialTrainingQuestionBundle,
  ExportSpecialTrainingSessionBundle,
  ExportTrainingProjectBundle,
} from "./types.js";

const parsePortableJsonColumn = (
  value: unknown,
  fallback: Record<string, string> | unknown[],
): unknown => {
  if (typeof value === "string") {
    return parsePayloadJson<unknown>(value, fallback);
  }
  return value ?? fallback;
};

export const parsePortableCustomIndicatorProfile = (
  rowId: unknown,
  payload: Record<string, unknown>,
) => {
  const parsed = desktopCustomIndicatorProfileSchema.safeParse({
    id: normalizeText(rowId),
    name: normalizeText(payload.name),
    source: normalizeText(payload.source),
    parameterInputs: parsePortableJsonColumn(
      payload.parameter_inputs_json ?? payload.parameterInputs,
      {},
    ),
    revisions: parsePortableJsonColumn(
      payload.revisions_json ?? payload.revisions,
      [],
    ),
    createdAt:
      normalizeText(payload.created_at ?? payload.createdAt) || nowIso(),
    updatedAt:
      normalizeText(payload.updated_at ?? payload.updatedAt) || nowIso(),
  });
  if (!parsed.success) {
    throw appError("PORTABLE_PACKAGE_TAMPERED");
  }
  return parsed.data;
};

const NOTE_DOCUMENT_MAX_SOURCE_BYTES = INPUT_LIMITS.noteContentChars * 8;
const NOTE_DOCUMENT_MAX_COMPRESSED_BYTES =
  NOTE_DOCUMENT_MAX_SOURCE_BYTES + 64 * 1024;
const NOTE_ATTACHMENT_MAX_COMPRESSED_BYTES =
  INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes + 64 * 1024;

const requireExactPayloadNumber = (value: unknown, expected: number): void => {
  if (!Number.isSafeInteger(value) || Number(value) !== expected) {
    throw appError("PORTABLE_DATA_IMPORT_INVALID");
  }
};

export const validatePortableReplayNotePayloads = (
  bundle: ExportNoteBundle,
): void => {
  if (bundle.content) {
    if (
      normalizeText(bundle.content.document_encoding).toUpperCase() !==
        "GZIP_JSON_V1" ||
      Number(bundle.content.document_schema_version) !==
        REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION
    ) {
      throw appError("PORTABLE_DATA_IMPORT_INVALID");
    }
    try {
      const decoded = decodeCanonicalBase64GzipJson(
        bundle.content.document_payload,
        {
          maxCompressedBytes: NOTE_DOCUMENT_MAX_COMPRESSED_BYTES,
          maxSourceBytes: NOTE_DOCUMENT_MAX_SOURCE_BYTES,
        },
      );
      const normalized = normalizeReplayNoteDocument(decoded.value);
      if (
        stringifyReplayNoteDocument(normalized) !== decoded.jsonText ||
        normalizeText(bundle.content.document_hash) !== decoded.sha256
      ) {
        throw appError("PORTABLE_DATA_IMPORT_INVALID");
      }
      requireExactPayloadNumber(
        bundle.content.payload_bytes,
        decoded.payloadBytes,
      );
    } catch {
      throw appError("PORTABLE_DATA_IMPORT_INVALID");
    }
  }

  if (!Array.isArray(bundle.attachments)) {
    throw appError("PORTABLE_DATA_IMPORT_INVALID");
  }
  for (const attachment of bundle.attachments) {
    const payload = attachment.payload_blob;
    if (payload === null || payload === undefined || payload === "") {
      if (
        normalizeText(attachment.payload_encoding) ||
        Number(attachment.source_bytes ?? 0) !== 0 ||
        Number(attachment.payload_bytes ?? 0) !== 0
      ) {
        throw appError("PORTABLE_DATA_IMPORT_INVALID");
      }
      continue;
    }
    if (
      normalizeText(attachment.payload_encoding).toUpperCase() !==
      "GZIP_JSON_V1"
    ) {
      throw appError("PORTABLE_DATA_IMPORT_INVALID");
    }
    try {
      const decoded = decodeCanonicalBase64GzipJson(payload, {
        maxCompressedBytes: NOTE_ATTACHMENT_MAX_COMPRESSED_BYTES,
        maxSourceBytes: INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes,
      });
      requireExactPayloadNumber(attachment.source_bytes, decoded.sourceBytes);
      requireExactPayloadNumber(attachment.payload_bytes, decoded.payloadBytes);
    } catch {
      throw appError("PORTABLE_DATA_IMPORT_INVALID");
    }
  }

  if (bundle.contextArchive) {
    const validated = rewritePortableReplayContextArchive(
      bundle.contextArchive,
      new Map(),
    );
    if (
      !validated ||
      Number(validated.source_bytes) >
        runtimeLimits.replayNoteSnapshotSourceMaxBytes ||
      Number(validated.archive_bytes) >
        runtimeLimits.replayNoteSnapshotCompressedMaxBytes
    ) {
      throw appError("PORTABLE_DATA_IMPORT_INVALID");
    }
  }
};

export const validatePortableImportDomainPayloads = (
  payloadDb: Database.Database,
  domains: readonly PortableExportDomain[],
): void => {
  domains.forEach((domain) => {
    switch (domain) {
      case "SETTINGS": {
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
        if (bundle?.userSettings) {
          parsePortableUserSettingsRow(bundle.userSettings);
        }
        break;
      }
      case "CUSTOM_INDICATORS":
        readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_custom_indicators",
        ).forEach((row) => {
          parsePayloadJson<Record<string, unknown>>(row.payload_json, {});
        });
        break;
      case "NOTES":
        readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_notes",
        ).forEach((row) => {
          const bundle = parsePayloadJson<ExportNoteBundle>(row.payload_json, {
            note: {},
            content: null,
            meta: null,
            colors: [],
            attachments: [],
            contextArchive: null,
          });
          normalizePortableReplayNoteType(bundle.note?.type);
          validatePortableReplayNotePayloads(bundle);
          if (Array.isArray(bundle.colors)) {
            bundle.colors.forEach((colorRow) => {
              const colorToken = normalizeReplayNoteColorTokens([
                colorRow.color_token,
              ])[0];
              if (!colorToken) {
                throw appError("PORTABLE_DATA_IMPORT_INVALID");
              }
            });
          }
        });
        break;
      case "TRAINING_HISTORY":
        readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_training_projects",
        ).forEach((row) => {
          parsePayloadJson<ExportTrainingProjectBundle>(row.payload_json, {
            project: {},
            replayRef: null,
            replayFills: [],
            replayCashAdjustments: [],
            portablePreview: null,
            sourceManifestHash: "",
            exportSourceId: "",
            exportInstrumentId: "",
          });
        });
        break;
      case "SPECIAL_TRAINING_HISTORY":
        readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_special_training_sessions",
        ).forEach((row) => {
          parsePayloadJson<ExportSpecialTrainingSessionBundle>(
            row.payload_json,
            { session: {} },
          );
        });
        readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_special_training_questions",
        ).forEach((row) => {
          parsePayloadJson<ExportSpecialTrainingQuestionBundle>(
            row.payload_json,
            {
              question: {},
              snapshotArchive: null,
              sourceManifestHash: "",
              exportSourceId: "",
              exportInstrumentId: "",
            },
          );
        });
        break;
      case "MARKET_DATA": {
        const sourceRows = readBundleRows<{
          source_id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_market_sources");
        const sourceIds = new Set<string>();
        sourceRows.forEach((row) => {
          const sourceId = normalizeText(row.source_id);
          const source = parsePayloadJson<Record<string, unknown>>(
            row.payload_json,
            {},
          );
          const claimedFingerprint = normalizeText(source.fingerprintHash);
          if (
            !sourceId ||
            normalizeText(source.sourceId) !== sourceId ||
            claimedFingerprint !==
              buildPortableMarketPayloadFingerprint({ payloadDb, sourceId })
          ) {
            throw appError("PORTABLE_PACKAGE_TAMPERED");
          }
          sourceIds.add(sourceId);
        });
        const instrumentRows = readBundleRows<{
          instrument_id: string;
          source_id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_market_instruments");
        const instrumentIds = new Set<string>();
        instrumentRows.forEach((row) => {
          const instrumentId = normalizeText(row.instrument_id);
          const sourceId = normalizeText(row.source_id);
          const instrument = parsePayloadJson<Record<string, unknown>>(
            row.payload_json,
            {},
          );
          if (
            !instrumentId ||
            !sourceIds.has(sourceId) ||
            normalizeText(instrument.exportInstrumentId) !== instrumentId ||
            normalizeText(instrument.sourceId) !== sourceId
          ) {
            throw appError("PORTABLE_PACKAGE_TAMPERED");
          }
          instrumentIds.add(instrumentId);
        });
        const orphanBars = countPortableMarketOrphanBars(payloadDb);
        const ledgerRows = readBundleRows<{
          source_id: string;
          row_id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_market_file_ledgers");
        ledgerRows.forEach((row) => {
          const sourceId = normalizeText(row.source_id);
          const rowId = normalizeText(row.row_id);
          const ledger = parsePayloadJson<Record<string, unknown>>(
            row.payload_json,
            {},
          );
          const exportInstrumentId = normalizeText(ledger.exportInstrumentId);
          if (
            !sourceIds.has(sourceId) ||
            !rowId ||
            normalizeText(ledger.sourceId) !== sourceId ||
            (exportInstrumentId && !instrumentIds.has(exportInstrumentId))
          ) {
            throw appError("PORTABLE_PACKAGE_TAMPERED");
          }
        });
        const manifestRows = readBundleRows<{
          source_id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_source_manifests");
        if (manifestRows.length !== sourceRows.length || orphanBars !== 0) {
          throw appError("PORTABLE_PACKAGE_TAMPERED");
        }
        manifestRows.forEach((row) => {
          const sourceId = normalizeText(row.source_id);
          const manifest = parsePayloadJson<Record<string, unknown>>(
            row.payload_json,
            {},
          );
          const sourceRow = sourceRows.find(
            (candidate) => normalizeText(candidate.source_id) === sourceId,
          );
          const source = sourceRow
            ? parsePayloadJson<Record<string, unknown>>(
                sourceRow.payload_json,
                {},
              )
            : null;
          if (
            !source ||
            normalizeText(manifest.sourceId) !== sourceId ||
            normalizeText(manifest.fingerprintHash) !==
              normalizeText(source.fingerprintHash)
          ) {
            throw appError("PORTABLE_PACKAGE_TAMPERED");
          }
        });
        break;
      }
    }
  });
};
