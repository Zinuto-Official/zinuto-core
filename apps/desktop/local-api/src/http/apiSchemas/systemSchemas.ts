// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { INPUT_SERIALIZED_LIMITS } from '@zinuto/shared/input-limits';
import {
  desktopCustomIndicatorCompileRequestSchema,
  desktopCustomIndicatorProfileDeleteRequestSchema,
  desktopCustomIndicatorProfileSaveRequestSchema,
  desktopCustomIndicatorExecuteRequestSchema,
  desktopCustomIndicatorProfilesReplaceRequestSchema,
} from '@zinuto/shared/contracts-desktop/api';
import {
  boundedRecordSchema,
  idSchema,
} from './common.js';

export const systemDevSimulationStartSchema = z.object({
  profileId: z.enum(["REALISTIC", "STRESS"]),
  repeatMode: z.enum(["REPLACE", "APPEND"]),
  seed: z.string().trim().min(1).max(128),
  targets: z.object({
    freeReplayTarget: z.number().int().min(0).max(3000),
    fastDecisionTarget: z.number().int().min(0).max(600),
    riskDisciplineTarget: z.number().int().min(0).max(600),
    independentCustomNotes: z.number().int().min(0).max(500),
    customIndicatorProfiles: z.number().int().min(0).max(1000),
    realBacktestBatches: z.number().int().min(0).max(500),
  }).strict(),
}).strict();

export const systemDevSimulationCancelSchema = z.object({
  jobId: idSchema,
});

export const historyRetentionWindowSchema = z.enum([
  "ONE_MONTH",
  "SIX_MONTHS",
  "ONE_YEAR",
  "THREE_YEARS",
  "FOREVER",
]);

const historyRetentionTargetsSchema = z.object({
  freeReplayDetails: z.boolean().optional(),
  challengeDetails: z.boolean().optional(),
  noteText: z.boolean().optional(),
});

export const historyRetentionPolicyUpdateSchema = z.object({
  retentionWindow: historyRetentionWindowSchema.optional(),
  targets: historyRetentionTargetsSchema.optional(),
});

export const appPreferencesUiSettingsSchema = z.object({
  uiSettings: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.appPreferencesBytes).optional(),
});

export const appPreferencesDataPoolRemovedSymbolsSchema = z.object({
  dataPoolRemovedSymbolsBySourceId: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.appPreferencesBytes).optional(),
});

export const replaceCustomIndicatorProfilesSchema =
  desktopCustomIndicatorProfilesReplaceRequestSchema;

export const saveCustomIndicatorProfileSchema =
  desktopCustomIndicatorProfileSaveRequestSchema;

export const deleteCustomIndicatorProfileSchema =
  desktopCustomIndicatorProfileDeleteRequestSchema;

export const compileCustomIndicatorScriptSchema =
  desktopCustomIndicatorCompileRequestSchema;

export const executeCustomIndicatorScriptSchema =
  desktopCustomIndicatorExecuteRequestSchema;
