// SPDX-License-Identifier: GPL-3.0-only

import { APP_LOCALE_BASE, isAppLocale, type AppLocale } from '@zinuto/shared/i18n';
import { IndicatorCompiler } from './customIndicatorEngine/indicator/compiler.js';
import { IndicatorRuntime } from './customIndicatorEngine/indicator/runtime.js';
import {
  buildParameterDefinitionsFromInputs,
  deriveScriptOutputDefinitions,
  deriveScriptParameterDefinitions,
} from './customIndicatorEngine/indicator/sourceMetadata.js';
import type {
  CompiledIndicator,
  IndicatorCompileError,
  IndicatorDefinition,
  IndicatorExecutionResult,
  IndicatorParameterDefinition,
  IndicatorRuntimeError,
  IndicatorRuntimeExecuteInput,
} from './customIndicatorEngine/indicator/types.js';

const CUSTOM_SCRIPT_TEMPLATE_NAME = '__ZINUTO_CUSTOM_FORMULA_PREVIEW__';

export type CustomIndicatorCompiledPayload = Omit<CompiledIndicator, 'program'>;

export type CustomIndicatorCompiledScriptState = {
  templateName: string;
  displayName: string;
  compiled: CustomIndicatorCompiledPayload;
  calcParams: number[];
};

export type CompileCustomIndicatorScriptRequest = {
  source: string;
  parameters?: IndicatorParameterDefinition[];
  parameterInputs?: Record<string, string>;
  invalidParamLabel?: string;
  displayName?: string;
  language?: AppLocale;
};

export type CompileCustomIndicatorScriptResult = {
  state: CustomIndicatorCompiledScriptState | null;
  compileErrors: IndicatorCompileError[];
  compileMessages: string[];
  parameterWarnings: string[];
  nextParameterDefinitions: IndicatorParameterDefinition[];
  nextParameterInputs: Record<string, string>;
};

export type ExecuteCustomIndicatorScriptRequest = {
  compiled: CustomIndicatorCompiledPayload;
  input: IndicatorRuntimeExecuteInput;
  language?: AppLocale;
};

const compiler = new IndicatorCompiler();
const runtime = new IndicatorRuntime();

const normalizeKey = (value: string): string => value.trim().toUpperCase();
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeLanguage = (language: unknown): AppLocale =>
  isAppLocale(language) ? language : APP_LOCALE_BASE;

const toPublicCompiledIndicator = (
  compiled: CompiledIndicator,
): CustomIndicatorCompiledPayload => ({
  definition: compiled.definition,
  outputKeys: [...compiled.outputKeys],
  parameterDefaults: { ...compiled.parameterDefaults },
});

const normalizeParameterDefinitions = (
  definitions: IndicatorParameterDefinition[],
): IndicatorParameterDefinition[] =>
  definitions.map((parameter) => ({
    ...parameter,
    name: normalizeKey(parameter.name),
  }));

const buildParameterInputMap = (
  definitions: IndicatorParameterDefinition[],
  source?: Record<string, string>,
): Record<string, string> => {
  const normalizedSource = Object.entries(source ?? {}).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const normalizedKey = normalizeKey(rawKey);
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = String(rawValue);
    return acc;
  }, {});
  return definitions.reduce<Record<string, string>>((acc, parameter) => {
    const key = normalizeKey(parameter.name);
    if (normalizedSource[key] !== undefined) {
      acc[key] = String(normalizedSource[key]);
      return acc;
    }
    acc[key] = String(parameter.defaultValue);
    return acc;
  }, {});
};

const resolveCalcParamsWithWarnings = (
  parameters: IndicatorParameterDefinition[],
  parameterInputs: Record<string, string>,
  invalidParamLabel: string,
): { calcParams: number[]; warnings: string[] } => {
  const warnings: string[] = [];
  const calcParams = parameters.map((parameter) => {
    const raw = (parameterInputs[parameter.name] ?? '').trim();
    const fallback = Number(parameter.defaultValue);
    const parsed = Number(raw);
    let numeric = Number.isFinite(parsed) ? parsed : fallback;

    if (raw && !Number.isFinite(parsed)) {
      warnings.push(`${invalidParamLabel}: ${parameter.name}`);
    }

    const min = Number.isFinite(parameter.min) ? Number(parameter.min) : -Number.MAX_SAFE_INTEGER;
    const max = Number.isFinite(parameter.max) ? Number(parameter.max) : Number.MAX_SAFE_INTEGER;
    if (numeric < min || numeric > max) {
      warnings.push(`${invalidParamLabel}: ${parameter.name}`);
    }
    numeric = clamp(numeric, min, max);
    return numeric;
  });

  return {
    calcParams,
    warnings: Array.from(new Set(warnings)),
  };
};

const buildRuntimeCompileError = (
  compileErrors: readonly IndicatorCompileError[],
): IndicatorRuntimeError => {
  const first = compileErrors[0];
  return {
    stage: 'runtime',
    code: 'COMPILE_FAILED',
    message: first?.message ?? 'CUSTOM_INDICATOR_COMPILE_FAILED',
    line: first?.line,
    column: first?.column,
    causeMessage: first?.code,
  };
};

export const buildCustomIndicatorDefinitionFromProfile = (profile: {
  name: string;
  source: string;
  parameterInputs?: Record<string, string>;
}): IndicatorDefinition => ({
  name: profile.name,
  source: profile.source,
  parameters: buildParameterDefinitionsFromInputs(profile.parameterInputs ?? {}, []),
  outputs: deriveScriptOutputDefinitions(profile.source),
});

export const compileCustomIndicatorDefinition = (
  definition: IndicatorDefinition,
  language?: AppLocale,
): { ok: true; compiled: CustomIndicatorCompiledPayload } | { ok: false; errors: IndicatorCompileError[] } => {
  const compileResult = compiler.compile(definition, normalizeLanguage(language));
  if (!compileResult.ok || !compileResult.compiled) {
    return {
      ok: false,
      errors: compileResult.errors,
    };
  }
  return {
    ok: true,
    compiled: toPublicCompiledIndicator(compileResult.compiled),
  };
};

export const compileCustomIndicatorScript = (
  request: CompileCustomIndicatorScriptRequest,
): CompileCustomIndicatorScriptResult => {
  const language = normalizeLanguage(request.language);
  const scriptSource = String(request.source ?? '');
  const previousParameters = normalizeParameterDefinitions(request.parameters ?? []);
  const nextParameterDefinitions = normalizeParameterDefinitions(
    deriveScriptParameterDefinitions(scriptSource, previousParameters),
  );
  const nextParameterInputs = buildParameterInputMap(
    nextParameterDefinitions,
    request.parameterInputs,
  );
  const definition: IndicatorDefinition = {
    name: 'CUSTOM_SCRIPT',
    source: scriptSource,
    parameters: nextParameterDefinitions,
    outputs: deriveScriptOutputDefinitions(scriptSource),
  };

  const compileResult = compiler.compile(definition, language);
  const compileErrors = compileResult.ok ? [] : compileResult.errors;
  const compileMessages = compileResult.ok
    ? []
    : compileErrors.map((error) => error.message);

  if (!compileResult.ok || !compileResult.compiled) {
    return {
      state: null,
      compileErrors,
      compileMessages,
      parameterWarnings: [],
      nextParameterDefinitions,
      nextParameterInputs,
    };
  }

  const compiledParameters = normalizeParameterDefinitions(compileResult.compiled.definition.parameters);
  const compiledParameterInputs = buildParameterInputMap(compiledParameters, nextParameterInputs);
  const { calcParams, warnings } = resolveCalcParamsWithWarnings(
    compiledParameters,
    compiledParameterInputs,
    request.invalidParamLabel?.trim() || 'Invalid parameter',
  );

  return {
    state: {
      templateName: CUSTOM_SCRIPT_TEMPLATE_NAME,
      displayName: String(request.displayName || '').trim() || 'CUSTOM',
      compiled: toPublicCompiledIndicator(compileResult.compiled),
      calcParams,
    },
    compileErrors: [],
    compileMessages,
    parameterWarnings: warnings,
    nextParameterDefinitions: compiledParameters,
    nextParameterInputs: compiledParameterInputs,
  };
};

export const executeCustomIndicatorScript = (
  request: ExecuteCustomIndicatorScriptRequest,
): IndicatorExecutionResult => {
  const compileResult = compiler.compile(
    request.compiled.definition,
    normalizeLanguage(request.language),
  );
  if (!compileResult.ok || !compileResult.compiled) {
    return {
      ok: false,
      outputs: {},
      renderInstructions: [],
      params: { ...request.compiled.parameterDefaults },
      errors: [buildRuntimeCompileError(compileResult.errors)],
    };
  }
  return runtime.execute(compileResult.compiled, request.input);
};
