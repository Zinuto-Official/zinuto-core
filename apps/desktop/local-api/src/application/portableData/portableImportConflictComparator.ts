// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { desktopCustomIndicatorProfileSchema } from '@zinuto/shared/contracts-desktop/api';
import { appError } from '../../kernel/appError.js';
import { nowIso } from '../../kernel/time.js';
import {
  getCustomIndicatorProfileById,
  getLocalSourceNameById,
  getPortablePayloadJsonByKey,
  getReplayNoteById,
  getSpecialTrainingQuestionById,
  getSpecialTrainingSessionById,
  getTrainingProjectById,
} from '../ports/infrastructure/db/portableData/portableDataRepository.js';
import {
  arePortablePayloadsEqual,
  parsePayloadJson,
  readBundleRows,
} from '../portableDataPackage.js';
import type { PortableExportDomain } from '../portableDataModel.js';
import {
  buildPortableReplayArchiveReplacementMap,
  normalizeOptionalNumber,
  normalizePortableReplayNoteType,
  normalizePortableTrainingProjectForImport,
  normalizeText,
  remapPortableReplayNoteSourceId,
  sanitizeSettingsBundle,
} from './helpers.js';
import type { PortableMarketImportPlan } from './importMarketData.js';
import type {
  ExportNoteBundle,
  ExportSettingsBundle,
  ExportSpecialTrainingQuestionBundle,
  ExportSpecialTrainingSessionBundle,
  ExportTrainingProjectBundle,
} from './types.js';

export type PortableImportConflictCounts = Partial<
  Record<PortableExportDomain, number>
>;

type ConflictComparatorContext = {
  payloadDb: Database.Database;
  selectedDomains: readonly PortableExportDomain[];
  marketImport: PortableMarketImportPlan;
};

const parsePortableJsonColumn = (
  value: unknown,
  fallback: Record<string, string> | unknown[],
): unknown => {
  if (typeof value === 'string') {
    return parsePayloadJson<unknown>(value, fallback);
  }
  return value ?? fallback;
};

const parseCustomIndicatorProfile = (
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
    createdAt: normalizeText(payload.created_at ?? payload.createdAt) || nowIso(),
    updatedAt: normalizeText(payload.updated_at ?? payload.updatedAt) || nowIso(),
  });
  if (!parsed.success) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return parsed.data;
};

const resolveSettingsConflicts = (payloadDb: Database.Database): number => {
  const row = getPortablePayloadJsonByKey({
    payloadDb,
    tableName: 'portable_export_settings',
    keyColumn: 'domain_key',
    key: 'SETTINGS',
  });
  const bundle = parsePayloadJson<ExportSettingsBundle | null>(row?.payload_json, null);
  return bundle
    && !arePortablePayloadsEqual(bundle, sanitizeSettingsBundle())
    ? 1
    : 0;
};

const resolveCustomIndicatorConflicts = (payloadDb: Database.Database): number =>
  readBundleRows<{ id: string; payload_json: string }>(
    payloadDb,
    'portable_export_custom_indicators',
  ).reduce((count, row) => {
    const payload = parsePayloadJson<Record<string, unknown>>(row.payload_json, {});
    const profile = parseCustomIndicatorProfile(row.id, payload);
    const existing = getCustomIndicatorProfileById(profile.id);
    return existing
      && !arePortablePayloadsEqual(existing, payload)
      ? count + 1
      : count;
  }, 0);

const buildTrainingProjectTargetIds = (
  payloadDb: Database.Database,
  marketImport: PortableMarketImportPlan,
): { conflictCount: number; targetIds: Map<string, string> } => {
  let conflictCount = 0;
  const targetIds = new Map<string, string>();
  const sourceNameCache = new Map<string, string>();
  const resolveSourceName = (sourceId: string): string => {
    if (!sourceId) return '';
    if (!sourceNameCache.has(sourceId)) {
      sourceNameCache.set(sourceId, normalizeText(getLocalSourceNameById(sourceId)?.name));
    }
    return sourceNameCache.get(sourceId) ?? '';
  };
  readBundleRows<{ id: string; payload_json: string }>(
    payloadDb,
    'portable_export_training_projects',
  ).forEach((row) => {
    const bundle = parsePayloadJson<ExportTrainingProjectBundle>(row.payload_json, {
      project: {},
      replayRef: null,
      replayFills: [],
      replayCashAdjustments: [],
      portablePreview: null,
      sourceManifestHash: '',
      exportSourceId: '',
      exportInstrumentId: '',
    });
    const project = { ...(bundle.project ?? {}) };
    const id = normalizeText(project.id) || normalizeText(row.id);
    const exportedSourceId = normalizeText(project.sample_pool_id)
      || normalizeText(project.samplePoolId);
    const mappedSourceId = marketImport.exportSourceIdToTargetSourceId.get(exportedSourceId) ?? '';
    const importedName = normalizeText(project.name) || 'Imported Training';
    const importedProject = normalizePortableTrainingProjectForImport(project, {
      targetProjectId: id,
      targetName: importedName,
      mappedSamplePoolId: mappedSourceId,
      mappedSamplePoolName: resolveSourceName(mappedSourceId)
        || normalizeText(project.sample_pool_name)
        || normalizeText(project.samplePoolName),
    });
    const existing = getTrainingProjectById(id);
    const same = existing
      && arePortablePayloadsEqual(
        normalizePortableTrainingProjectForImport(existing, {
          targetProjectId: id,
          targetName: normalizeText(existing.name),
          mappedSamplePoolId: normalizeText(existing.sample_pool_id),
          mappedSamplePoolName: normalizeText(existing.sample_pool_name),
        }),
        importedProject,
      );
    if (existing && !same) {
      conflictCount += 1;
      targetIds.set(id, `portable-preview:training:${id}`);
    } else {
      targetIds.set(id, id);
    }
  });
  return { conflictCount, targetIds };
};

const buildSpecialTrainingTargetIds = (
  payloadDb: Database.Database,
  marketImport: PortableMarketImportPlan,
): {
  conflictCount: number;
  sessionTargetIds: Map<string, string>;
  questionTargetIds: Map<string, string>;
} => {
  let conflictCount = 0;
  const sessionTargetIds = new Map<string, string>();
  const questionTargetIds = new Map<string, string>();
  readBundleRows<{ id: string; payload_json: string }>(
    payloadDb,
    'portable_export_special_training_sessions',
  ).forEach((row) => {
    const bundle = parsePayloadJson<ExportSpecialTrainingSessionBundle>(row.payload_json, {
      session: {},
    });
    const session = { ...(bundle.session ?? {}) };
    const id = normalizeText(session.id) || normalizeText(row.id);
    const existing = getSpecialTrainingSessionById(id);
    const same = existing
      && arePortablePayloadsEqual(existing, session);
    if (existing && !same) {
      conflictCount += 1;
      sessionTargetIds.set(id, `portable-preview:session:${id}`);
    } else {
      sessionTargetIds.set(id, id);
    }
  });
  readBundleRows<{ id: string; payload_json: string }>(
    payloadDb,
    'portable_export_special_training_questions',
  ).forEach((row) => {
    const bundle = parsePayloadJson<ExportSpecialTrainingQuestionBundle>(row.payload_json, {
      question: {},
      snapshotArchive: null,
      sourceManifestHash: '',
      exportSourceId: '',
      exportInstrumentId: '',
    });
    const question = { ...(bundle.question ?? {}) };
    const id = normalizeText(question.id) || normalizeText(row.id);
    const originalSessionId = normalizeText(question.session_id)
      || normalizeText(question.sessionId);
    const rebound = marketImport.exportInstrumentIdToBinding.get(
      normalizeText(bundle.exportInstrumentId),
    );
    const normalizedCandidate = {
      ...question,
      id,
      session_id: sessionTargetIds.get(originalSessionId) ?? originalSessionId,
      instrument_id: rebound?.instrumentId || '',
      bars_version_token: rebound?.barsVersionToken
        || normalizeText(question.bars_version_token),
    };
    const existing = getSpecialTrainingQuestionById(id);
    const same = existing
      && arePortablePayloadsEqual(existing, normalizedCandidate);
    if (existing && !same) {
      conflictCount += 1;
      questionTargetIds.set(id, `portable-preview:question:${id}`);
    } else {
      questionTargetIds.set(id, id);
    }
  });
  return { conflictCount, sessionTargetIds, questionTargetIds };
};

const resolveNoteConflicts = (input: {
  payloadDb: Database.Database;
  marketImport: PortableMarketImportPlan;
  projectTargetIds: Map<string, string>;
  questionTargetIds: Map<string, string>;
}): number => {
  const archiveReplacements = buildPortableReplayArchiveReplacementMap({
    projectIdMap: input.projectTargetIds,
    questionIdMap: input.questionTargetIds,
    sourceIdMap: input.marketImport.exportSourceIdToTargetSourceId,
    instrumentIdMap: input.marketImport.exportInstrumentIdToBinding,
  });
  return readBundleRows<{ id: string; payload_json: string }>(
    input.payloadDb,
    'portable_export_notes',
  ).reduce((count, row) => {
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
    const id = normalizeText(note.id) || normalizeText(row.id);
    const originalProjectId = normalizeText(note.training_project_id)
      || normalizeText(note.trainingProjectId);
    const targetProjectId = originalProjectId
      ? input.projectTargetIds.get(originalProjectId) ?? originalProjectId
      : '';
    const sourceKind = normalizeText(note.source_kind || note.sourceKind).toUpperCase();
    const targetSourceId = remapPortableReplayNoteSourceId({
      sourceKind,
      sourceId: normalizeText(note.source_id) || normalizeText(note.sourceId),
      projectIdMap: input.projectTargetIds,
      questionIdMap: input.questionTargetIds,
    });
    const originalContextSessionId = normalizeText(note.context_session_id)
      || normalizeText(note.contextSessionId);
    const normalizedNote = {
      ...note,
      id,
      training_project_id: targetProjectId || null,
      source_kind: sourceKind || null,
      source_id: targetSourceId,
      context_session_id: archiveReplacements.get(originalContextSessionId)
        || (noteType === 'FREE_REPLAY' && targetProjectId
          ? targetProjectId
          : sourceKind === 'SPECIAL_TRAINING_QUESTION' && targetSourceId
            ? targetSourceId
            : originalContextSessionId)
        || null,
      context_cursor_index: normalizeOptionalNumber(
        note.context_cursor_index ?? note.contextCursorIndex,
      ),
    };
    const existing = getReplayNoteById(id);
    return existing
      && !arePortablePayloadsEqual(existing, normalizedNote)
      ? count + 1
      : count;
  }, 0);
};

export const comparePortableImportConflicts = (
  ctx: ConflictComparatorContext,
): PortableImportConflictCounts => {
  const selected = new Set(ctx.selectedDomains);
  const result: PortableImportConflictCounts = {};
  if (selected.has('SETTINGS')) {
    result.SETTINGS = resolveSettingsConflicts(ctx.payloadDb);
  }
  if (selected.has('CUSTOM_INDICATORS')) {
    result.CUSTOM_INDICATORS = resolveCustomIndicatorConflicts(ctx.payloadDb);
  }
  if (selected.has('MARKET_DATA')) {
    result.MARKET_DATA = ctx.marketImport.result.reusedSources;
  }
  const training = selected.has('TRAINING_HISTORY')
    ? buildTrainingProjectTargetIds(ctx.payloadDb, ctx.marketImport)
    : { conflictCount: 0, targetIds: new Map<string, string>() };
  if (selected.has('TRAINING_HISTORY')) {
    result.TRAINING_HISTORY = training.conflictCount;
  }
  const special = selected.has('SPECIAL_TRAINING_HISTORY')
    ? buildSpecialTrainingTargetIds(ctx.payloadDb, ctx.marketImport)
    : {
      conflictCount: 0,
      sessionTargetIds: new Map<string, string>(),
      questionTargetIds: new Map<string, string>(),
    };
  if (selected.has('SPECIAL_TRAINING_HISTORY')) {
    result.SPECIAL_TRAINING_HISTORY = special.conflictCount;
  }
  if (selected.has('NOTES')) {
    result.NOTES = resolveNoteConflicts({
      payloadDb: ctx.payloadDb,
      marketImport: ctx.marketImport,
      projectTargetIds: training.targetIds,
      questionTargetIds: special.questionTargetIds,
    });
  }
  return result;
};
