// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import { APP_LOCALES } from "../i18n.js";
import {
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
} from "../input-limits.js";
import {
  finiteNumberSchema,
  idStringSchema,
  jsonRecordSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  nullableTrimmedStringSchema,
  positiveIntSchema,
  trimmedStringSchema,
} from "./api-primitives.js";

export const desktopWorkspaceIdSchema = z.enum([
  "command-center",
  "trainer",
  "history-review-console",
  "challenge-stats",
  "special-training",
  "data-management",
  "notes",
  "settings",
  "custom-indicator",
  "strategy-backtest",
]);
export const desktopWorkspaceReadModelToneSchema = z.enum([
  "neutral",
  "ready",
  "loading",
  "warning",
  "danger",
  "locked",
]);
export const desktopWorkspaceCopyRefSchema = z
  .object({
    copyKey: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.recordKeyChars),
    copyArgs: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .max(16)
      .optional(),
  })
  .strict();
export const desktopWorkspaceReadModelActionSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
    enabled: z.boolean(),
    reasonCode: nullableTrimmedStringSchema,
    priority: z.number().int().min(0).max(100),
    copy: desktopWorkspaceCopyRefSchema.optional(),
    facts: jsonRecordSchema.optional(),
  })
  .strict();
export const desktopWorkspaceReadModelSectionSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars),
    statusCode: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    reasonCode: nullableTrimmedStringSchema,
    tone: desktopWorkspaceReadModelToneSchema,
    priority: z.number().int().min(0).max(100),
    copy: desktopWorkspaceCopyRefSchema.optional(),
    facts: jsonRecordSchema,
    actions: z.array(desktopWorkspaceReadModelActionSchema).max(64),
  })
  .strict();
export const desktopWorkspaceReadModelSchema = z
  .object({
    workspaceId: desktopWorkspaceIdSchema,
    generatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    statusCode: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    reasonCode: nullableTrimmedStringSchema,
    tone: desktopWorkspaceReadModelToneSchema,
    priority: z.number().int().min(0).max(100),
    copy: desktopWorkspaceCopyRefSchema.optional(),
    facts: jsonRecordSchema,
    actions: z.array(desktopWorkspaceReadModelActionSchema).max(64),
    sections: z.array(desktopWorkspaceReadModelSectionSchema).max(64),
  })
  .strict();

const customIndicatorLanguageSchema = z.enum(APP_LOCALES).optional();
const customIndicatorFormulaSourceSchema = z
  .string()
  .max(INPUT_LIMITS.formulaSourceChars);
const nonEmptyCustomIndicatorFormulaSourceSchema =
  customIndicatorFormulaSourceSchema.refine(
    (value) => value.trim().length > 0,
    { message: "CUSTOM_INDICATOR_SOURCE_REQUIRED" },
  );
const customIndicatorParameterDefinitionSchema = z
  .object({
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
    defaultValue: finiteNumberSchema,
    min: finiteNumberSchema.optional(),
    max: finiteNumberSchema.optional(),
    step: finiteNumberSchema.optional(),
  })
  .strict();
const customIndicatorOutputDefinitionSchema = z
  .object({
    key: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
    title: trimmedStringSchema.max(INPUT_LIMITS.customIndicatorProfileNameChars),
    directives: z
      .array(z.union([z.string(), jsonRecordSchema]))
      .max(32)
      .optional(),
    renderPrimitive: trimmedStringSchema
      .max(INPUT_LIMITS.shortCodeChars)
      .optional(),
    style: jsonRecordSchema.optional(),
    directiveFamilies: z.array(jsonRecordSchema).max(32).optional(),
    plotText: trimmedStringSchema
      .max(INPUT_LIMITS.parameterValueChars)
      .optional(),
    iconType: finiteNumberSchema.optional(),
    sourceFunction: trimmedStringSchema
      .max(INPUT_LIMITS.parameterKeyChars)
      .nullable()
      .optional(),
    supportState: trimmedStringSchema
      .max(INPUT_LIMITS.shortCodeChars)
      .optional(),
  })
  .strict();
const customIndicatorDefinitionSchema = z
  .object({
    name: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.customIndicatorProfileNameChars),
    source: customIndicatorFormulaSourceSchema,
    parameters: z.array(customIndicatorParameterDefinitionSchema).max(64),
    outputs: z.array(customIndicatorOutputDefinitionSchema).max(24),
  })
  .strict();
export const desktopCustomIndicatorCompiledPayloadSchema = z
  .object({
    definition: customIndicatorDefinitionSchema,
    outputKeys: z
      .array(nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars))
      .max(24),
    parameterDefaults: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      finiteNumberSchema,
    ),
  })
  .strict();
const customIndicatorProfileRevisionSchema = z
  .object({
    source: nonEmptyCustomIndicatorFormulaSourceSchema,
    parameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ),
    savedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopCustomIndicatorProfileSchema = z
  .object({
    id: idStringSchema,
    name: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.customIndicatorProfileNameChars),
    source: nonEmptyCustomIndicatorFormulaSourceSchema,
    parameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ),
    revisions: z
      .array(customIndicatorProfileRevisionSchema)
      .max(INPUT_ARRAY_LIMITS.customIndicatorRevisions)
      .optional(),
    createdAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopCustomIndicatorProfileListSchema = z
  .array(desktopCustomIndicatorProfileSchema)
  .max(INPUT_ARRAY_LIMITS.customIndicatorProfiles);
export const desktopCustomIndicatorProfilesReplaceRequestSchema = z
  .object({
    profiles: z
      .array(desktopCustomIndicatorProfileSchema)
      .max(INPUT_ARRAY_LIMITS.customIndicatorProfiles),
  })
  .strict();
export const desktopCustomIndicatorProfilesReplaceResultSchema = z
  .object({
    storedCount: nonNegativeIntSchema,
    profiles: desktopCustomIndicatorProfileListSchema,
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopCustomIndicatorProfileSaveRequestSchema = z
  .object({
    id: idStringSchema.optional(),
    name: trimmedStringSchema.max(INPUT_LIMITS.customIndicatorProfileNameChars),
    source: nonEmptyCustomIndicatorFormulaSourceSchema,
    parameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ),
  })
  .strict();
export const desktopCustomIndicatorProfileSaveResultSchema = z
  .object({
    storedCount: nonNegativeIntSchema,
    profiles: desktopCustomIndicatorProfileListSchema,
    profile: desktopCustomIndicatorProfileListSchema.element,
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopCustomIndicatorProfileDeleteRequestSchema = z
  .object({
    profileId: idStringSchema,
  })
  .strict();
export const desktopCustomIndicatorProfileDeleteResultSchema = z
  .object({
    storedCount: nonNegativeIntSchema,
    profiles: desktopCustomIndicatorProfileListSchema,
    deletedProfileId: idStringSchema,
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
const customIndicatorBarSchema = z
  .object({
    time: z.union([
      finiteNumberSchema,
      trimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    ]),
    open: finiteNumberSchema,
    high: finiteNumberSchema,
    low: finiteNumberSchema,
    close: finiteNumberSchema,
    volume: finiteNumberSchema,
    amount: finiteNumberSchema.optional(),
  })
  .strict();
export const desktopCustomIndicatorCompileRequestSchema = z
  .object({
    source: customIndicatorFormulaSourceSchema,
    parameters: z.array(customIndicatorParameterDefinitionSchema).max(64).optional(),
    parameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ).optional(),
    invalidParamLabel: trimmedStringSchema
      .max(INPUT_LIMITS.parameterValueChars)
      .optional(),
    displayName: trimmedStringSchema
      .max(INPUT_LIMITS.customIndicatorProfileNameChars)
      .optional(),
    language: customIndicatorLanguageSchema,
  })
  .strict();
export const desktopCustomIndicatorCompileErrorSchema = z
  .object({
    stage: z.enum(["parse", "validate"]),
    code: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    message: trimmedStringSchema.max(INPUT_LIMITS.noteTitleChars * 8),
    line: nonNegativeIntSchema.optional(),
    column: nonNegativeIntSchema.optional(),
  })
  .strict();
export const desktopCustomIndicatorCompileResultSchema = z
  .object({
    state: z
      .object({
        templateName: nonEmptyTrimmedStringSchema
          .max(INPUT_LIMITS.generalNameChars),
        displayName: nonEmptyTrimmedStringSchema
          .max(INPUT_LIMITS.customIndicatorProfileNameChars),
        compiled: desktopCustomIndicatorCompiledPayloadSchema,
        calcParams: z.array(finiteNumberSchema).max(64),
      })
      .strict()
      .nullable(),
    compileErrors: z.array(desktopCustomIndicatorCompileErrorSchema).max(64),
    compileMessages: z
      .array(trimmedStringSchema.max(INPUT_LIMITS.noteTitleChars * 8))
      .max(64),
    parameterWarnings: z
      .array(trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars * 2))
      .max(64),
    nextParameterDefinitions: z
      .array(customIndicatorParameterDefinitionSchema)
      .max(64),
    nextParameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ),
  })
  .strict();
const customIndicatorExecutionLimitsSchema = z
  .object({
    maxStatements: positiveIntSchema.optional(),
    maxOperations: positiveIntSchema.optional(),
    maxBars: positiveIntSchema.optional(),
  })
  .strict();
const customIndicatorSeriesValueSchema = z.union([
  z.custom<number>((value) => typeof value === "number"),
  z.null(),
]);
export const desktopCustomIndicatorExecuteRequestSchema = z
  .object({
    compiled: desktopCustomIndicatorCompiledPayloadSchema,
    input: z
      .object({
        bars: z.array(customIndicatorBarSchema).max(120_000),
        parameterOverrides: z.record(
          trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
          finiteNumberSchema,
        ).optional(),
        executionLimits: customIndicatorExecutionLimitsSchema.optional(),
      })
      .strict(),
    language: customIndicatorLanguageSchema,
  })
  .strict();
const customIndicatorPlotStyleSchema = z
  .object({
    color: trimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    lineWidth: finiteNumberSchema,
    lineStyle: z.enum(["solid", "dot"]),
    visibility: z.enum(["visible", "hidden", "draw-null"]),
    renderMode: z.enum(["line", "stick", "marker", "fill", "custom"]),
    fillColor: trimmedStringSchema
      .max(INPUT_LIMITS.shortCodeChars)
      .nullable(),
    hollow: z.boolean(),
  })
  .strict();
const customIndicatorDirectiveFamilySchema = z
  .object({
    family: z.enum([
      "color",
      "lineWidth",
      "lineStyle",
      "visibility",
      "renderMode",
      "fill",
    ]),
    token: trimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    value: z.union([z.string(), finiteNumberSchema, z.boolean(), z.null()]),
  })
  .strict();
export const desktopCustomIndicatorRenderInstructionSchema = z
  .object({
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
    primitive: z.enum([
      "line",
      "histogram",
      "iconMarker",
      "textMarker",
      "numberMarker",
      "segment",
      "slopeSegment",
      "ohlc",
      "band",
    ]),
    style: customIndicatorPlotStyleSchema,
    directiveFamilies: z.array(customIndicatorDirectiveFamilySchema).max(32),
    visibleMask: z.array(z.boolean()).max(120_000),
    sourceFunction: trimmedStringSchema
      .max(INPUT_LIMITS.parameterKeyChars)
      .nullable(),
    supportState: trimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
  })
  .catchall(z.unknown());
export const desktopCustomIndicatorRuntimeErrorSchema = z
  .object({
    stage: z.literal("runtime"),
    code: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    message: trimmedStringSchema.max(INPUT_LIMITS.noteTitleChars * 8),
    statementIndex: nonNegativeIntSchema.optional(),
    statementTarget: trimmedStringSchema
      .max(INPUT_LIMITS.parameterKeyChars)
      .optional(),
    statementOperator: trimmedStringSchema
      .max(INPUT_LIMITS.shortCodeChars)
      .optional(),
    line: nonNegativeIntSchema.optional(),
    column: nonNegativeIntSchema.optional(),
    causeMessage: trimmedStringSchema
      .max(INPUT_LIMITS.noteTitleChars * 8)
      .optional(),
  })
  .strict();
export const desktopCustomIndicatorRuntimeStatsSchema = z
  .object({
    durationMs: nonNegativeNumberSchema,
    statementsExecuted: nonNegativeIntSchema,
    operationsExecuted: nonNegativeIntSchema,
    fromCache: z.boolean(),
  })
  .strict();
export const desktopCustomIndicatorExecuteResultSchema = z
  .object({
    ok: z.boolean(),
    outputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      z.array(customIndicatorSeriesValueSchema).max(120_000),
    ),
    renderInstructions: z
      .array(desktopCustomIndicatorRenderInstructionSchema)
      .max(24),
    params: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      finiteNumberSchema,
    ),
    runtimeStats: desktopCustomIndicatorRuntimeStatsSchema.optional(),
    errors: z.array(desktopCustomIndicatorRuntimeErrorSchema).max(64),
  })
  .strict();
