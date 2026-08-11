// SPDX-License-Identifier: GPL-3.0-only

import type { ApiDesktopWorkspaceReadModel } from "@/api";
import type {
  IndicatorDefinition,
  IndicatorParameterDefinition,
} from "@/domains/custom-indicator/indicator/types";
import type { Instrument } from "@/domains/training/types";
import type { BaseTimeframe } from "@/domains/trainer/trainerTypes";
import type { AppDisplayPeriodKey } from "@/ui/config/uiConfig";

export type CustomIndicatorSystemDefaultTemplate = {
  id: string;
  definition: IndicatorDefinition;
};

export type CustomIndicatorSystemDefaultsFacts = {
  defaultTemplateId: string | null;
  volumeTemplateId: string | null;
  templates: CustomIndicatorSystemDefaultTemplate[];
};

export type CustomIndicatorValidationSamplePoolFact = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  symbolCount: number;
  symbols: string[];
  disabled: boolean;
  locked: boolean;
  lockReason: string | null;
  defaultSymbol: string | null;
  defaultDisplayPeriod: AppDisplayPeriodKey;
  displayPeriodOptions: AppDisplayPeriodKey[];
};

export type CustomIndicatorValidationInstrumentFact = Instrument & {
  samplePoolIds: string[];
  defaultDisplayPeriod: AppDisplayPeriodKey;
  displayPeriodOptions: AppDisplayPeriodKey[];
};

export type CustomIndicatorValidationReadinessFacts = {
  statusCode: string;
  reasonCode: string | null;
  readySourceCount: number;
  sourceCount: number;
  symbolCount: number;
  defaultInstrumentId: string | null;
};

export type CustomIndicatorValidationFacts = {
  allPoolId: string;
  defaultSamplePoolId: string;
  defaultSymbol: string | null;
  defaultInstrumentId: string | null;
  defaultBaseTimeframe: BaseTimeframe;
  defaultDisplayPeriod: AppDisplayPeriodKey;
  samplePools: CustomIndicatorValidationSamplePoolFact[];
  instruments: CustomIndicatorValidationInstrumentFact[];
  readiness: CustomIndicatorValidationReadinessFacts;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const toBoolean = (value: unknown): boolean => value === true;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeBaseTimeframe = (
  value: unknown,
  fallback: BaseTimeframe = "1d",
): BaseTimeframe => {
  const text = normalizeText(value).toLowerCase();
  return text === "1m" || text === "5m" || text === "1h" || text === "1d"
    ? text
    : fallback;
};

const normalizeDisplayPeriod = (
  value: unknown,
  fallback: AppDisplayPeriodKey = "1d",
): AppDisplayPeriodKey => {
  const text = normalizeText(value);
  return text === "1m" ||
    text === "5m" ||
    text === "1h" ||
    text === "1d" ||
    text === "1w" ||
    text === "1month" ||
    text === "1year"
    ? text
    : fallback;
};

const normalizeParameterDefinitions = (
  parameters: unknown,
): IndicatorParameterDefinition[] =>
  Array.isArray(parameters)
    ? parameters.flatMap((parameter) => {
        const row = toRecord(parameter);
        const name = String(row.name ?? "").trim();
        if (!name) {
          return [];
        }
        return [
          {
            name,
            defaultValue:
              typeof row.defaultValue === "number" &&
              Number.isFinite(row.defaultValue)
                ? row.defaultValue
                : 0,
            min:
              typeof row.min === "number" && Number.isFinite(row.min)
                ? row.min
                : undefined,
            max:
              typeof row.max === "number" && Number.isFinite(row.max)
                ? row.max
                : undefined,
          },
        ];
      })
    : [];

const normalizeIndicatorDefinition = (
  definition: unknown,
): IndicatorDefinition | null => {
  const row = toRecord(definition);
  const name = String(row.name ?? "").trim();
  const source = String(row.source ?? "").trim();
  if (!name || !source) {
    return null;
  }
  return {
    name,
    source,
    parameters: normalizeParameterDefinitions(row.parameters),
    outputs: [],
  };
};

export const readCustomIndicatorSystemDefaults = (
  model: ApiDesktopWorkspaceReadModel | null,
): CustomIndicatorSystemDefaultsFacts => {
  const facts = toRecord(model?.facts);
  const systemDefaults = toRecord(facts.systemDefaults);
  const templates = Array.isArray(systemDefaults.templates)
    ? systemDefaults.templates.flatMap((template) => {
        const row = toRecord(template);
        const id = String(row.id ?? "").trim();
        const definition = normalizeIndicatorDefinition(row.definition);
        if (!id || !definition) {
          return [];
        }
        return [{ id, definition }];
      })
    : [];
  return {
    defaultTemplateId:
      String(systemDefaults.defaultTemplateId ?? "").trim() || null,
    volumeTemplateId:
      String(systemDefaults.volumeTemplateId ?? "").trim() || null,
    templates,
  };
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];

const normalizeDisplayPeriodArray = (
  value: unknown,
  fallback: AppDisplayPeriodKey,
): AppDisplayPeriodKey[] => {
  const periods = Array.isArray(value)
    ? value.map((item) => normalizeDisplayPeriod(item, fallback))
    : [];
  return Array.from(new Set(periods.length ? periods : [fallback]));
};

export const readCustomIndicatorValidationFacts = (
  model: ApiDesktopWorkspaceReadModel | null,
): CustomIndicatorValidationFacts => {
  const facts = toRecord(model?.facts);
  const validationData = toRecord(facts.validationData);
  const defaultBaseTimeframe = normalizeBaseTimeframe(
    validationData.defaultBaseTimeframe,
  );
  const defaultDisplayPeriod = normalizeDisplayPeriod(
    validationData.defaultDisplayPeriod,
    defaultBaseTimeframe,
  );
  const samplePools = Array.isArray(validationData.samplePools)
    ? validationData.samplePools.flatMap((item) => {
        const row = toRecord(item);
        const id = normalizeText(row.id);
        if (!id) {
          return [];
        }
        const baseTimeframe = normalizeBaseTimeframe(row.baseTimeframe);
        const poolDefaultPeriod = normalizeDisplayPeriod(
          row.defaultDisplayPeriod,
          baseTimeframe,
        );
        return [{
          id,
          name: normalizeText(row.name) || id,
          baseTimeframe,
          symbolCount: toCount(row.symbolCount),
          symbols: normalizeStringArray(row.symbols),
          disabled: toBoolean(row.disabled),
          locked: toBoolean(row.locked),
          lockReason: normalizeText(row.lockReason) || null,
          defaultSymbol: normalizeText(row.defaultSymbol) || null,
          defaultDisplayPeriod: poolDefaultPeriod,
          displayPeriodOptions: normalizeDisplayPeriodArray(
            row.displayPeriodOptions,
            poolDefaultPeriod,
          ),
        }];
      })
    : [];
  const instruments: CustomIndicatorValidationInstrumentFact[] = Array.isArray(
    validationData.instruments,
  )
    ? validationData.instruments.flatMap((item) => {
        const row = toRecord(item);
        const id = normalizeText(row.id);
        const symbol = normalizeText(row.symbol).toUpperCase();
        if (!id || !symbol) {
          return [];
        }
        const baseTimeframe = normalizeBaseTimeframe(row.baseTimeframe);
        const instrumentDefaultPeriod = normalizeDisplayPeriod(
          row.defaultDisplayPeriod,
          baseTimeframe,
        );
        return [{
          id,
          symbol,
          baseTimeframe,
          name: normalizeText(row.name) || null,
          barCount: toCount(row.barCount),
          scopeKind: row.scopeKind === "LOCAL" ? "LOCAL" : "SYSTEM",
          sourceId: normalizeText(row.sourceId) || null,
          sourceName: normalizeText(row.sourceName) || null,
          displayLabel: normalizeText(row.displayLabel) || symbol,
          samplePoolIds: normalizeStringArray(row.samplePoolIds),
          defaultDisplayPeriod: instrumentDefaultPeriod,
          displayPeriodOptions: normalizeDisplayPeriodArray(
            row.displayPeriodOptions,
            instrumentDefaultPeriod,
          ),
        }];
      })
    : [];
  const allPoolId =
    normalizeText(validationData.allPoolId) ||
    samplePools[0]?.id ||
    "__sample_pool_all__";
  const defaultInstrumentId =
    normalizeText(validationData.defaultInstrumentId) || null;
  const readiness = toRecord(validationData.readiness);
  return {
    allPoolId,
    defaultSamplePoolId:
      normalizeText(validationData.defaultSamplePoolId) || allPoolId,
    defaultSymbol: normalizeText(validationData.defaultSymbol) || null,
    defaultInstrumentId,
    defaultBaseTimeframe,
    defaultDisplayPeriod,
    samplePools,
    instruments,
    readiness: {
      statusCode:
        normalizeText(readiness.statusCode) ||
        (defaultInstrumentId || instruments.length > 0 ? "READY" : "EMPTY"),
      reasonCode: normalizeText(readiness.reasonCode) || null,
      readySourceCount: toCount(readiness.readySourceCount),
      sourceCount: toCount(readiness.sourceCount),
      symbolCount: toCount(readiness.symbolCount),
      defaultInstrumentId:
        normalizeText(readiness.defaultInstrumentId) || defaultInstrumentId,
    },
  };
};
