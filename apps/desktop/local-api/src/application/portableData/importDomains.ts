// SPDX-License-Identifier: GPL-3.0-only

import { nowIso } from "../../kernel/time.js";
import { appError } from "../../kernel/appError.js";
import { createId } from "../../kernel/id.js";
import { normalizeReplayNoteColorTokens } from "@zinuto/shared/replayNoteColors";
import {
  arePortablePayloadsEqual,
  parsePayloadJson,
  readBundleRows,
} from "../portableDataPackage.js";
import {
  getLocalSourceNameById,
  getReplayNoteById,
  getSpecialTrainingQuestionById,
  getSpecialTrainingSessionById,
  getTrainingProjectById,
  insertReplayNoteContentRow,
  insertReplayNoteMetaRow,
  insertReplayNoteRow,
  insertSpecialTrainingQuestionRow,
  insertSpecialTrainingSessionRow,
  insertTrainingProjectRow,
  runPortableDataTransaction,
  upsertReplayNoteAttachmentRow,
  upsertReplayNoteColorRow,
  upsertReplayNoteContextArchiveRow,
  upsertReplayNoteContextRefRow,
  upsertReplayNoteSpecialTrainingContextRefRow,
  upsertTrainingProjectReplayRefRow,
  replaceTrainingProjectReplayDetailRows,
} from "../ports/infrastructure/db/portableData/portableDataRepository.js";
import {
  clearTrainingProjectPortablePreview,
  saveTrainingProjectPortablePreview,
} from "../ports/infrastructure/db/history/replayRefStore.js";
import { saveSpecialTrainingQuestionSnapshotArchive } from "../ports/infrastructure/db/specialTraining/historyStore.js";
import { upsertSpecialTrainingStatsProjectionRowsForQuestions } from "../ports/infrastructure/db/specialTraining/statsProjectionStore.js";
import { syncTrainingStatsSessionFact } from "../trainingStatsService.js";

import type {
  ExportNoteBundle,
  ExportTrainingProjectBundle,
  ExportSpecialTrainingSessionBundle,
  ExportSpecialTrainingQuestionBundle,
} from "./types.js";

import {
  normalizeText,
  normalizePortableReplayNoteType,
  normalizeOptionalNumber,
  normalizePortableTrainingProjectForImport,
  buildPortableReplayArchiveReplacementMap,
  rewritePortableReplayContextArchive,
  remapPortableReplayNoteSourceId,
  upsertPortableSourceManifestRows,
  buildImportedTitleSuffix,
} from "./helpers.js";

import type { PortableExportDomain } from "../portableDataModel.js";
import {
  PORTABLE_IMPORT_EXECUTION_ORDER,
  normalizeManifestDomains,
} from "../portableDataModel.js";
import { comparePortableImportConflicts } from "./portableImportConflictComparator.js";
import {
  importPortableCustomIndicatorsDomain,
  importPortableSettingsDomain,
} from "./importSettingsAndIndicatorDomains.js";

import type {
  ImportDomainContext,
  ImportDomainResult,
} from "./importDomainTypes.js";
export type {
  ImportDomainContext,
  ImportDomainResult,
} from "./importDomainTypes.js";

export {
  validatePortableImportDomainPayloads,
  validatePortableReplayNotePayloads,
} from "./importDomainPayloadValidation.js";

export const executePortableImportDomains = (
  ctx: ImportDomainContext,
): ImportDomainResult => {
  const {
    payloadDb,
    selectedDomains,
    conflictMode,
    settingsConflictMode,
    marketImport,
  } = ctx;

  const importedCountByDomain: Partial<Record<PortableExportDomain, number>> =
    {};
  const skippedCountByDomain: Partial<Record<PortableExportDomain, number>> =
    {};
  const conflictCountByDomain: Partial<Record<PortableExportDomain, number>> =
    {};
  const projectIdMap = new Map<string, string>();
  const specialSessionIdMap = new Map<string, string>();
  const questionIdMap = new Map<string, string>();
  let remappedNotes = 0;
  let remappedTrainingProjects = 0;
  let remappedSpecialSessions = 0;
  let remappedSpecialQuestions = 0;
  const rebind = {
    trainingProjectRefsUpdated: 0,
    specialTrainingQuestionsUpdated: 0,
  };
  const localSourceNameCache = new Map<string, string>();
  const resolveLocalSourceName = (sourceId: string): string => {
    const normalizedSourceId = normalizeText(sourceId);
    if (!normalizedSourceId) {
      return "";
    }
    if (localSourceNameCache.has(normalizedSourceId)) {
      return localSourceNameCache.get(normalizedSourceId) ?? "";
    }
    const row = getLocalSourceNameById(normalizedSourceId);
    const resolvedName = normalizeText(row?.name);
    localSourceNameCache.set(normalizedSourceId, resolvedName);
    return resolvedName;
  };

  const manifestDomains = normalizeManifestDomains(
    marketImport.portableManifestRows.length > 0
      ? selectedDomains
      : selectedDomains,
  );
  const selectedImportDomains = selectedDomains.filter((domain) =>
    manifestDomains.includes(domain),
  );
  const selectedImportDomainSet = new Set(selectedImportDomains);
  const orderedImportDomains = PORTABLE_IMPORT_EXECUTION_ORDER.filter(
    (domain) => selectedImportDomainSet.has(domain),
  );
  const expectedConflictCountByDomain = comparePortableImportConflicts({
    payloadDb,
    selectedDomains: selectedImportDomains,
    marketImport,
  });

  runPortableDataTransaction(() => {
    for (const domain of orderedImportDomains) {
      if (domain === "SETTINGS") {
        const counters = importPortableSettingsDomain({
          payloadDb,
          settingsConflictMode,
        });
        importedCountByDomain[domain] = counters.imported;
        skippedCountByDomain[domain] = counters.skipped;
        conflictCountByDomain[domain] = counters.conflicts;
        continue;
      }

      if (domain === "CUSTOM_INDICATORS") {
        const counters = importPortableCustomIndicatorsDomain({
          payloadDb,
          conflictMode,
        });
        importedCountByDomain[domain] = counters.imported;
        skippedCountByDomain[domain] = counters.skipped;
        conflictCountByDomain[domain] = counters.conflicts;
        continue;
      }

      if (domain === "MARKET_DATA") {
        upsertPortableSourceManifestRows(
          marketImport.portableManifestRows,
          conflictMode,
        );
        importedCountByDomain[domain] = marketImport.result.importedSources;
        skippedCountByDomain[domain] = marketImport.result.reusedSources;
        conflictCountByDomain[domain] = marketImport.result.reusedSources;
        continue;
      }

      if (domain === "TRAINING_HISTORY") {
        let imported = 0;
        let skipped = 0;
        let conflicts = 0;
        const rows = readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_training_projects",
        );
        rows.forEach((row) => {
          const bundle = parsePayloadJson<ExportTrainingProjectBundle>(
            row.payload_json,
            {
              project: {},
              replayRef: null,
              replayFills: [],
              replayCashAdjustments: [],
              portablePreview: null,
              sourceManifestHash: "",
              exportSourceId: "",
              exportInstrumentId: "",
            },
          );
          const project = { ...(bundle.project ?? {}) };
          const originalProjectId =
            normalizeText(project.id) || normalizeText(row.id);
          let targetProjectId = originalProjectId;
          const exportedSamplePoolId =
            normalizeText(project.sample_pool_id) ||
            normalizeText(project.samplePoolId);
          const mappedSamplePoolId =
            marketImport.exportSourceIdToTargetSourceId.get(
              exportedSamplePoolId,
            ) ?? "";
          const exportedSamplePoolName =
            normalizeText(project.sample_pool_name) ||
            normalizeText(project.samplePoolName);
          const mappedSamplePoolName =
            resolveLocalSourceName(mappedSamplePoolId) ||
            exportedSamplePoolName;
          const importedProjectName =
            normalizeText(project.name) || "Imported Training";
          const importedProject = normalizePortableTrainingProjectForImport(
            project,
            {
              targetProjectId: originalProjectId,
              targetName: importedProjectName,
              mappedSamplePoolId,
              mappedSamplePoolName,
            },
          );
          const reboundInstrument =
            marketImport.exportInstrumentIdToBinding.get(
              normalizeText(bundle.exportInstrumentId),
            ) ?? null;
          const existing = getTrainingProjectById(originalProjectId);
          if (existing) {
            const same = arePortablePayloadsEqual(
              normalizePortableTrainingProjectForImport(existing, {
                targetProjectId: originalProjectId,
                targetName: normalizeText(existing.name),
                mappedSamplePoolId: normalizeText(existing.sample_pool_id),
                mappedSamplePoolName: normalizeText(existing.sample_pool_name),
              }),
              importedProject,
            );
            if (same) {
              skipped += 1;
              projectIdMap.set(originalProjectId, originalProjectId);
              return;
            }
            conflicts += 1;
            targetProjectId = createId();
            remappedTrainingProjects += 1;
          }
          projectIdMap.set(originalProjectId, targetProjectId);
          const normalizedProject = normalizePortableTrainingProjectForImport(
            project,
            {
              targetProjectId,
              targetName:
                conflicts > 0 && targetProjectId !== originalProjectId
                  ? `${normalizeText(project.name) || "Imported Training"}${buildImportedTitleSuffix()}`
                  : normalizeText(project.name) || "Imported Training",
              mappedSamplePoolId,
              mappedSamplePoolName,
            },
          );
          insertTrainingProjectRow({
            ...normalizedProject,
          });
          if (bundle.replayRef) {
            const replayRefRecord = bundle.replayRef as Record<string, unknown>;
            const replayRef = {
              ...replayRefRecord,
              project_id: targetProjectId,
              instrument_id: reboundInstrument?.instrumentId ?? "",
            };
            if (reboundInstrument?.instrumentId) {
              rebind.trainingProjectRefsUpdated += 1;
            }
            upsertTrainingProjectReplayRefRow({
              projectId: targetProjectId,
              baseTimeframe: normalizeText(replayRefRecord.base_timeframe),
              instrumentId: normalizeText(replayRef.instrument_id),
              barsVersionToken:
                reboundInstrument?.barsVersionToken ||
                normalizeText(replayRefRecord.bars_version_token),
              startTs: normalizeText(replayRefRecord.start_ts) || null,
              endTs: normalizeText(replayRefRecord.end_ts) || null,
              entryIndex: Number(replayRefRecord.entry_index ?? 0),
              cursorIndex: Number(replayRefRecord.cursor_index ?? 0),
              historyBars: Number(replayRefRecord.history_bars ?? 0),
              settingsJson:
                normalizeText(replayRefRecord.settings_json) || "{}",
              payloadBlob: replayRefRecord.payload_blob
                ? Buffer.from(String(replayRefRecord.payload_blob), "base64")
                : null,
              payloadEncoding: normalizeText(replayRefRecord.payload_encoding),
              createdAt: normalizeText(replayRefRecord.created_at) || nowIso(),
              updatedAt: normalizeText(replayRefRecord.updated_at) || nowIso(),
            });
            const replayFills = Array.isArray(bundle.replayFills)
              ? bundle.replayFills
              : [];
            const replayCashAdjustments = Array.isArray(
              bundle.replayCashAdjustments,
            )
              ? bundle.replayCashAdjustments
              : [];
            replaceTrainingProjectReplayDetailRows(
              targetProjectId,
              replayFills.map((fill, index) => ({
                projectId: targetProjectId,
                fillIndex: Math.max(
                  0,
                  Math.floor(Number(fill.fill_index ?? 0) || 0),
                ),
                rowSeq: Math.max(
                  1,
                  Math.floor(Number(fill.row_seq ?? index + 1) || index + 1),
                ),
                side: normalizeText(fill.side) === "SELL" ? "SELL" : "BUY",
                fillTime: normalizeText(fill.fill_time),
                fillPrice: Number(fill.fill_price ?? 0),
                fillQty: Number(fill.fill_qty ?? 0),
                contractMultiplier: Math.max(
                  Number.EPSILON,
                  Number(fill.contract_multiplier ?? 1) || 1,
                ),
                fee: Math.max(0, Number(fill.fee ?? 0) || 0),
                tax: Math.max(0, Number(fill.tax ?? 0) || 0),
                slippage: Math.max(0, Number(fill.slippage ?? 0) || 0),
                createdAt: normalizeText(fill.created_at) || nowIso(),
              })),
              replayCashAdjustments.map((adjustment, index) => ({
                projectId: targetProjectId,
                barIndex: Math.max(
                  0,
                  Math.floor(Number(adjustment.bar_index ?? 0) || 0),
                ),
                rowSeq: Math.max(
                  1,
                  Math.floor(
                    Number(adjustment.row_seq ?? index + 1) || index + 1,
                  ),
                ),
                kind:
                  normalizeText(adjustment.kind) === "SHORT_BORROW"
                    ? "SHORT_BORROW"
                    : normalizeText(adjustment.kind) === "FUNDING"
                      ? "FUNDING"
                      : "LONG_FINANCING",
                amount: Number(adjustment.amount ?? 0) || 0,
                ts: normalizeText(adjustment.ts),
                createdAt: normalizeText(adjustment.created_at) || nowIso(),
              })),
            );
          }
          if (bundle.portablePreview) {
            saveTrainingProjectPortablePreview(
              targetProjectId,
              bundle.portablePreview,
              nowIso(),
              normalizeText(
                (bundle as { sourceManifestHash?: unknown }).sourceManifestHash,
              ),
            );
          } else {
            clearTrainingProjectPortablePreview(targetProjectId);
          }
          syncTrainingStatsSessionFact(targetProjectId);
          imported += 1;
        });
        importedCountByDomain[domain] = imported;
        skippedCountByDomain[domain] = skipped;
        conflictCountByDomain[domain] = conflicts;
        continue;
      }

      if (domain === "SPECIAL_TRAINING_HISTORY") {
        let imported = 0;
        let skipped = 0;
        let conflicts = 0;
        const sessionRows = readBundleRows<{
          id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_special_training_sessions");
        sessionRows.forEach((row) => {
          const bundle = parsePayloadJson<ExportSpecialTrainingSessionBundle>(
            row.payload_json,
            { session: {} },
          );
          const session = { ...(bundle.session ?? {}) };
          const originalSessionId =
            normalizeText(session.id) || normalizeText(row.id);
          let targetSessionId = originalSessionId;
          let targetChallengeId =
            normalizeText(session.challenge_id) ||
            normalizeText(session.challengeId);
          const existing = getSpecialTrainingSessionById(originalSessionId);
          if (existing) {
            const same = arePortablePayloadsEqual(existing, session);
            if (same) {
              skipped += 1;
              specialSessionIdMap.set(originalSessionId, originalSessionId);
              return;
            }
            conflicts += 1;
            targetSessionId = createId();
            targetChallengeId = `${targetChallengeId || targetSessionId}-imported`;
            remappedSpecialSessions += 1;
          }
          specialSessionIdMap.set(originalSessionId, targetSessionId);
          const sessionTimeframe = normalizeText(session.timeframe) || "1d";
          const sessionFinishedAt =
            normalizeText(session.finished_at) ||
            normalizeText(session.finishedAt) ||
            nowIso();
          insertSpecialTrainingSessionRow({
            id: targetSessionId,
            challengeId: targetChallengeId,
            bankId:
              normalizeText(session.bank_id) || normalizeText(session.bankId),
            bankName:
              normalizeText(session.bank_name) ||
              normalizeText(session.bankName),
            modeId:
              normalizeText(session.mode_id) || normalizeText(session.modeId),
            simulationBatchId:
              normalizeText(session.simulation_batch_id) ||
              normalizeText(session.simulationBatchId) ||
              null,
            sourceTag:
              normalizeText(session.source_tag) ||
              normalizeText(session.sourceTag),
            timeframe: sessionTimeframe,
            minimumBaseTimeframe:
              normalizeText(session.minimum_base_timeframe) ||
              normalizeText(session.minimumBaseTimeframe) ||
              sessionTimeframe,
            sourceTimeframe:
              normalizeText(session.source_timeframe) ||
              normalizeText(session.sourceTimeframe) ||
              sessionTimeframe,
            questionCount: Number(
              session.question_count ?? session.questionCount ?? 0,
            ),
            completedQuestionCount: Number(
              session.completed_question_count ??
                session.completedQuestionCount ??
                0,
            ),
            passedQuestionCount: Number(
              session.passed_question_count ?? session.passedQuestionCount ?? 0,
            ),
            failedQuestionCount: Number(
              session.failed_question_count ?? session.failedQuestionCount ?? 0,
            ),
            missedQuestionCount: Number(
              session.missed_question_count ?? session.missedQuestionCount ?? 0,
            ),
            timedOutQuestionCount: Number(
              session.timed_out_question_count ??
                session.timedOutQuestionCount ??
                0,
            ),
            decisionSecondsTotal: Number(
              session.decision_seconds_total ??
                session.decisionSecondsTotal ??
                0,
            ),
            decisionSecondsAverage: Number(
              session.decision_seconds_average ??
                session.decisionSecondsAverage ??
                0,
            ),
            maxConsecutivePasses: Number(
              session.max_consecutive_passes ??
                session.maxConsecutivePasses ??
                0,
            ),
            configJson:
              normalizeText(session.config_json) ||
              JSON.stringify(session.config ?? {}),
            sessionSummaryJson:
              normalizeText(session.session_summary_json) ||
              JSON.stringify(session.sessionSummary ?? null),
            operatorSummaryJson:
              normalizeText(session.operator_summary_json) ||
              JSON.stringify(session.operatorSummary ?? null),
            createdAt:
              normalizeText(session.created_at) ||
              normalizeText(session.createdAt) ||
              nowIso(),
            finishedAt: sessionFinishedAt,
            updatedAt:
              normalizeText(session.updated_at) ||
              normalizeText(session.updatedAt) ||
              sessionFinishedAt,
          });
          imported += 1;
        });
        const questionRows = readBundleRows<{
          id: string;
          payload_json: string;
        }>(payloadDb, "portable_export_special_training_questions");
        questionRows.forEach((row) => {
          const bundle = parsePayloadJson<ExportSpecialTrainingQuestionBundle>(
            row.payload_json,
            {
              question: {},
              snapshotArchive: null,
              sourceManifestHash: "",
              exportSourceId: "",
              exportInstrumentId: "",
            },
          );
          const question = { ...(bundle.question ?? {}) };
          const originalQuestionId =
            normalizeText(question.id) || normalizeText(row.id);
          let targetQuestionId = originalQuestionId;
          const targetSessionId =
            specialSessionIdMap.get(
              normalizeText(question.session_id) ||
                normalizeText(question.sessionId),
            ) ??
            (normalizeText(question.session_id) ||
              normalizeText(question.sessionId));
          const reboundInstrument =
            marketImport.exportInstrumentIdToBinding.get(
              normalizeText(bundle.exportInstrumentId),
            ) ?? null;
          const normalizedExistingQuestionCandidate = {
            ...question,
            id: originalQuestionId,
            session_id: targetSessionId,
            instrument_id: reboundInstrument?.instrumentId || "",
            bars_version_token:
              reboundInstrument?.barsVersionToken ||
              normalizeText(question.bars_version_token),
          };
          const existing = getSpecialTrainingQuestionById(originalQuestionId);
          if (existing) {
            const same = arePortablePayloadsEqual(
              existing,
              normalizedExistingQuestionCandidate,
            );
            if (same) {
              skipped += 1;
              questionIdMap.set(originalQuestionId, originalQuestionId);
              return;
            }
            conflicts += 1;
            targetQuestionId = createId();
            remappedSpecialQuestions += 1;
          }
          questionIdMap.set(originalQuestionId, targetQuestionId);
          if (reboundInstrument?.instrumentId) {
            rebind.specialTrainingQuestionsUpdated += 1;
          }
          const questionBaseTimeframe =
            normalizeText(question.base_timeframe) ||
            normalizeText(question.baseTimeframe) ||
            "1d";
          const questionWindowBarCount = Number(
            question.window_bar_count ?? question.windowBarCount ?? 0,
          );
          const detailBlob = question.detail_blob
            ? Buffer.from(String(question.detail_blob), "base64")
            : null;
          const detailExpiredAt =
            normalizeText(question.detail_expired_at) ||
            normalizeText(question.detailExpiredAt) ||
            null;
          insertSpecialTrainingQuestionRow({
            id: targetQuestionId,
            sessionId: targetSessionId,
            questionOrder: Number(
              question.question_order ?? question.questionOrder ?? 0,
            ),
            modeId:
              normalizeText(question.mode_id) || normalizeText(question.modeId),
            sourceTag:
              normalizeText(question.source_tag) ||
              normalizeText(question.sourceTag),
            symbol: normalizeText(question.symbol),
            baseTimeframe: questionBaseTimeframe,
            effectiveTimeframe:
              normalizeText(question.effective_timeframe) ||
              normalizeText(question.effectiveTimeframe) ||
              questionBaseTimeframe,
            minimumBaseTimeframe:
              normalizeText(question.minimum_base_timeframe) ||
              normalizeText(question.minimumBaseTimeframe) ||
              questionBaseTimeframe,
            instrumentId: reboundInstrument?.instrumentId || "",
            barsVersionToken:
              reboundInstrument?.barsVersionToken ||
              normalizeText(question.bars_version_token),
            windowStartTs: normalizeText(question.window_start_ts) || null,
            windowEndTs: normalizeText(question.window_end_ts) || null,
            windowBarCount: questionWindowBarCount,
            sourceWindowBarCount: Number(
              question.source_window_bar_count ??
                question.sourceWindowBarCount ??
                questionWindowBarCount,
            ),
            startIndex: Number(question.start_index ?? 0),
            endIndex: Number(question.end_index ?? 0),
            minTradeStep: Number(question.min_trade_step ?? 0),
            settlementStatus:
              normalizeText(question.settlement_status) || "SETTLED",
            score: Number(question.score ?? 0),
            passed: Number(question.passed ?? 0),
            initialTotal: Number(question.initial_total ?? 0),
            totalPnl: Number(question.total_pnl ?? 0),
            finalTotalAsset: Number(question.final_total_asset ?? 0),
            returnRate: Number(question.return_rate ?? 0),
            usedOperations: Number(question.used_operations ?? 0),
            maxOperations: Number(question.max_operations ?? 0),
            maxDrawdownRatio: Number(question.max_drawdown_ratio ?? 0),
            performanceRate: Number(question.performance_rate ?? 0),
            grade: normalizeText(question.grade),
            detailBlob,
            detailEncoding:
              normalizeText(question.detail_encoding) || "GZIP_JSON_V2_COMPACT",
            detailExpiredAt,
            createdAt: normalizeText(question.created_at) || nowIso(),
            settledAt: normalizeText(question.settled_at) || nowIso(),
            updatedAt: normalizeText(question.updated_at) || nowIso(),
          });
          if (detailBlob && !detailExpiredAt) {
            upsertSpecialTrainingStatsProjectionRowsForQuestions(
              [targetQuestionId],
              "",
            );
          }
          if (bundle.snapshotArchive) {
            saveSpecialTrainingQuestionSnapshotArchive(
              targetQuestionId,
              bundle.snapshotArchive,
              nowIso(),
              normalizeText(
                (bundle as { sourceManifestHash?: unknown }).sourceManifestHash,
              ),
            );
          }
        });
        importedCountByDomain[domain] = imported;
        skippedCountByDomain[domain] = skipped;
        conflictCountByDomain[domain] = conflicts;
        continue;
      }

      if (domain === "NOTES") {
        let imported = 0;
        let skipped = 0;
        let conflicts = 0;
        const replayArchiveIdReplacements =
          buildPortableReplayArchiveReplacementMap({
            projectIdMap,
            questionIdMap,
            sourceIdMap: marketImport.exportSourceIdToTargetSourceId,
            instrumentIdMap: marketImport.exportInstrumentIdToBinding,
          });
        const rows = readBundleRows<{ id: string; payload_json: string }>(
          payloadDb,
          "portable_export_notes",
        );
        rows.forEach((row) => {
          const bundle = parsePayloadJson<ExportNoteBundle>(row.payload_json, {
            note: {},
            content: null,
            meta: null,
            colors: [],
            attachments: [],
            contextArchive: null,
          });
          const note = { ...(bundle.note ?? {}) };
          const noteType = normalizePortableReplayNoteType(note.type);
          const originalNoteId =
            normalizeText(note.id) || normalizeText(row.id);
          const originalTrainingProjectId =
            normalizeText(note.training_project_id) ||
            normalizeText(note.trainingProjectId);
          const targetTrainingProjectId = originalTrainingProjectId
            ? (projectIdMap.get(originalTrainingProjectId) ??
              originalTrainingProjectId)
            : "";
          const sourceKind = normalizeText(
            note.source_kind || note.sourceKind,
          ).toUpperCase();
          const originalSourceId =
            normalizeText(note.source_id) || normalizeText(note.sourceId);
          const targetSourceId = remapPortableReplayNoteSourceId({
            sourceKind,
            sourceId: originalSourceId,
            projectIdMap,
            questionIdMap,
          });
          const originalContextSessionId =
            normalizeText(note.context_session_id) ||
            normalizeText(note.contextSessionId);
          const targetContextSessionId =
            replayArchiveIdReplacements.get(originalContextSessionId) ||
            (noteType === "FREE_REPLAY" && targetTrainingProjectId
              ? targetTrainingProjectId
              : sourceKind === "SPECIAL_TRAINING_QUESTION" && targetSourceId
                ? targetSourceId
                : originalContextSessionId);
          const contextCursorIndex = normalizeOptionalNumber(
            note.context_cursor_index ?? note.contextCursorIndex,
          );
          let targetNoteId = originalNoteId;
          let normalizedNote: Record<string, unknown> = {
            ...note,
            id: targetNoteId,
            training_project_id: targetTrainingProjectId || null,
            source_kind: sourceKind || null,
            source_id: targetSourceId,
            context_session_id: targetContextSessionId || null,
            context_cursor_index: contextCursorIndex,
          };
          const existing = getReplayNoteById(originalNoteId);
          if (existing) {
            const same = arePortablePayloadsEqual(existing, normalizedNote);
            if (same) {
              skipped += 1;
              return;
            }
            conflicts += 1;
            targetNoteId = createId();
            remappedNotes += 1;
            normalizedNote = {
              ...normalizedNote,
              id: targetNoteId,
              title: `${normalizeText(note.title) || "Imported Note"}${buildImportedTitleSuffix()}`,
            };
          }
          bundle.note = normalizedNote;
          bundle.content = bundle.content
            ? { ...bundle.content, note_id: targetNoteId }
            : null;
          bundle.meta = bundle.meta
            ? { ...bundle.meta, note_id: targetNoteId }
            : null;
          bundle.colors = Array.isArray(bundle.colors)
            ? bundle.colors.map((colorRow) => ({
                ...colorRow,
                note_id: targetNoteId,
              }))
            : [];
          bundle.attachments = Array.isArray(bundle.attachments)
            ? bundle.attachments.map((attachmentRow) => {
                const refKind = normalizeText(
                  attachmentRow.ref_kind,
                ).toUpperCase();
                const refId = normalizeText(attachmentRow.ref_id);
                const remappedRefId =
                  refKind === "TRAINING_PROJECT"
                    ? (projectIdMap.get(refId) ?? refId)
                    : refKind === "SPECIAL_TRAINING_QUESTION" ||
                        refKind === "QUESTION"
                      ? (questionIdMap.get(refId) ?? refId)
                      : refId;
                return {
                  ...attachmentRow,
                  note_id: targetNoteId,
                  ref_id: remappedRefId || null,
                };
              })
            : [];
          bundle.contextArchive = rewritePortableReplayContextArchive(
            bundle.contextArchive
              ? { ...bundle.contextArchive, note_id: targetNoteId }
              : null,
            replayArchiveIdReplacements,
          );
          insertReplayNoteRow({
            id: targetNoteId,
            title: normalizeText(
              (bundle.note as Record<string, unknown>).title,
            ),
            type: noteType,
            simulationBatchId:
              normalizeText(
                (bundle.note as Record<string, unknown>).simulation_batch_id,
              ) || null,
            sourceKind:
              normalizeText(
                (bundle.note as Record<string, unknown>).source_kind,
              ) || null,
            sourceId:
              normalizeText(
                (bundle.note as Record<string, unknown>).source_id,
              ) || null,
            contentPreview: normalizeText(
              (bundle.note as Record<string, unknown>).content_preview,
            ),
            trainingProjectId:
              normalizeText(
                (bundle.note as Record<string, unknown>).training_project_id,
              ) || null,
            contextDisplayPeriod:
              normalizeText(
                (bundle.note as Record<string, unknown>).context_display_period,
              ) || null,
            hasContextReplay: Number(
              (bundle.note as Record<string, unknown>).has_context_replay ?? 0,
            ),
            contextExpiredAt:
              normalizeText(
                (bundle.note as Record<string, unknown>).context_expired_at,
              ) ||
              normalizeText(
                (bundle.note as Record<string, unknown>).contextExpiredAt,
              ) ||
              null,
            contextSessionId:
              normalizeText(
                (bundle.note as Record<string, unknown>).context_session_id,
              ) || null,
            contextCursorIndex,
            createdAt:
              normalizeText(
                (bundle.note as Record<string, unknown>).created_at,
              ) || nowIso(),
            updatedAt:
              normalizeText(
                (bundle.note as Record<string, unknown>).updated_at,
              ) || nowIso(),
          });
          if (
            targetTrainingProjectId &&
            contextCursorIndex !== null &&
            getTrainingProjectById(targetTrainingProjectId)
          ) {
            upsertReplayNoteContextRefRow({
              noteId: targetNoteId,
              trainingProjectId: targetTrainingProjectId,
              contextCursorIndex,
              windowBars: 240,
              createdAt:
                normalizeText(
                  (bundle.note as Record<string, unknown>).created_at,
                ) || nowIso(),
              updatedAt:
                normalizeText(
                  (bundle.note as Record<string, unknown>).updated_at,
                ) || nowIso(),
            });
          }
          if (
            sourceKind === "SPECIAL_TRAINING_QUESTION" &&
            targetSourceId &&
            getSpecialTrainingQuestionById(targetSourceId)
          ) {
            upsertReplayNoteSpecialTrainingContextRefRow({
              noteId: targetNoteId,
              questionId: targetSourceId,
              createdAt:
                normalizeText(
                  (bundle.note as Record<string, unknown>).created_at,
                ) || nowIso(),
              updatedAt:
                normalizeText(
                  (bundle.note as Record<string, unknown>).updated_at,
                ) || nowIso(),
            });
          }
          if (bundle.content) {
            insertReplayNoteContentRow({
              noteId: targetNoteId,
              documentSchemaVersion: Number(
                bundle.content.document_schema_version ?? 1,
              ),
              documentEncoding:
                normalizeText(bundle.content.document_encoding) ||
                "GZIP_JSON_V1",
              documentPayload: bundle.content.document_payload
                ? Buffer.from(String(bundle.content.document_payload), "base64")
                : Buffer.alloc(0),
              documentHash: normalizeText(bundle.content.document_hash),
              contentPreview: normalizeText(bundle.content.content_preview),
              textChars: Number(bundle.content.text_chars ?? 0),
              payloadBytes: Number(bundle.content.payload_bytes ?? 0),
              updatedAt: normalizeText(bundle.content.updated_at) || nowIso(),
            });
          }
          if (bundle.meta) {
            insertReplayNoteMetaRow({
              noteId: targetNoteId,
              metaJson: normalizeText(bundle.meta.meta_json) || "null",
              metaSummaryJson:
                normalizeText(bundle.meta.meta_summary_json) || "null",
              createdAt: normalizeText(bundle.meta.created_at) || nowIso(),
              updatedAt: normalizeText(bundle.meta.updated_at) || nowIso(),
            });
          }
          if (Array.isArray(bundle.colors)) {
            bundle.colors.forEach((colorRow) => {
              const colorToken = normalizeReplayNoteColorTokens([
                colorRow.color_token,
              ])[0];
              if (!colorToken) {
                throw appError("PORTABLE_DATA_IMPORT_INVALID");
              }
              upsertReplayNoteColorRow({
                noteId: targetNoteId,
                colorToken,
                sortIndex: Number(colorRow.sort_index ?? 0),
                createdAt: normalizeText(colorRow.created_at) || nowIso(),
                updatedAt: normalizeText(colorRow.updated_at) || nowIso(),
              });
            });
          }
          if (Array.isArray(bundle.attachments)) {
            bundle.attachments.forEach((attachmentRow) => {
              upsertReplayNoteAttachmentRow({
                noteId: targetNoteId,
                attachmentRefId: normalizeText(attachmentRow.attachment_ref_id),
                attachmentKind: normalizeText(attachmentRow.attachment_kind),
                summaryJson:
                  normalizeText(attachmentRow.summary_json) || "null",
                refKind: normalizeText(attachmentRow.ref_kind) || null,
                refId: normalizeText(attachmentRow.ref_id) || null,
                payloadEncoding:
                  normalizeText(attachmentRow.payload_encoding) || null,
                payloadBlob: attachmentRow.payload_blob
                  ? Buffer.from(String(attachmentRow.payload_blob), "base64")
                  : null,
                sourceBytes: Number(attachmentRow.source_bytes ?? 0),
                payloadBytes: Number(attachmentRow.payload_bytes ?? 0),
                sortIndex: Number(attachmentRow.sort_index ?? 0),
                createdAt: normalizeText(attachmentRow.created_at) || nowIso(),
                updatedAt: normalizeText(attachmentRow.updated_at) || nowIso(),
              });
            });
          }
          if (bundle.contextArchive) {
            upsertReplayNoteContextArchiveRow({
              noteId: targetNoteId,
              archiveEncoding:
                normalizeText(bundle.contextArchive.archive_encoding) ||
                "GZIP_BINARY",
              archivePayload: bundle.contextArchive.archive_payload
                ? Buffer.from(
                    String(bundle.contextArchive.archive_payload),
                    "base64",
                  )
                : Buffer.alloc(0),
              sourceBytes: Number(bundle.contextArchive.source_bytes ?? 0),
              archiveBytes: Number(bundle.contextArchive.archive_bytes ?? 0),
              createdAt:
                normalizeText(bundle.contextArchive.created_at) || nowIso(),
              updatedAt:
                normalizeText(bundle.contextArchive.updated_at) || nowIso(),
            });
          }
          imported += 1;
        });
        importedCountByDomain[domain] = imported;
        skippedCountByDomain[domain] = skipped;
        conflictCountByDomain[domain] = conflicts;
        continue;
      }
    }
    for (const domain of orderedImportDomains) {
      if (
        Number(conflictCountByDomain[domain] ?? 0) !==
        Number(expectedConflictCountByDomain[domain] ?? 0)
      ) {
        throw appError("PORTABLE_DATA_IMPORT_INVALID", {
          reason: "CONFLICT_COMPARATOR_DRIFT",
          domain,
        });
      }
    }
    ctx.onBeforeTransactionCommit?.();
  });

  return {
    importedCountByDomain,
    skippedCountByDomain,
    conflictCountByDomain,
    projectIdMap,
    specialSessionIdMap,
    questionIdMap,
    remappedNotes,
    remappedTrainingProjects,
    remappedSpecialSessions,
    remappedSpecialQuestions,
    rebind,
  };
};
