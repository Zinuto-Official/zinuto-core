// SPDX-License-Identifier: GPL-3.0-only

import { IndicatorParserError, parseIndicatorScript } from '../parser/index.js';
import {
  APP_UI_BASE_LANGUAGE,
  formatCustomIndicatorEngineTemplate,
  getCustomIndicatorEngineCopy,
  type AppUiLanguage,
} from './customIndicatorEngineText.js';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import type { AstExpression, AstProgram } from '../ast/types.js';
import {
  FUTU_VENDOR_FORMULA_ADAPTER,
  getFutuCapabilityEntry,
} from '../functions/library.js';
import {
  extractScriptParametersFromProgram,
  normalizeIndicatorOutputDefinition,
} from './sourceMetadata.js';
import { isSupportedPlotDirective } from '../plot/semantics.js';
import type {
  CompiledIndicator,
  IndicatorCompileError,
  IndicatorCompileResult,
  IndicatorParameterDefinition,
  IndicatorDefinition
} from './types.js';

const normalizeKey = (value: string): string => value.trim().toUpperCase();
export const INDICATOR_COMPILE_LIMITS = Object.freeze({
  sourceLength: INPUT_LIMITS.formulaSourceChars,
  statementCount: 800,
  tokenCount: 16_000,
  parameterCount: 64,
  outputCount: 24
});

const buildCompileError = (
  stage: IndicatorCompileError['stage'],
  code: string,
  message: string,
  line?: number,
  column?: number
): IndicatorCompileError => ({ stage, code, message, line, column });

type UnsupportedFunctionCall = {
  name: string;
  line?: number;
  column?: number;
};

type UnsupportedPlotDirective = {
  outputKey: string;
  directive: string;
  line?: number;
  column?: number;
};

const visitFunctionCallsInExpression = (
  expression: AstExpression,
  visit: (name: string, line?: number, column?: number) => void
) => {
  if (expression.type === 'FunctionCall') {
    visit(expression.callee, expression.line, expression.column);
    expression.args.forEach((arg) => visitFunctionCallsInExpression(arg, visit));
    return;
  }
  if (expression.type === 'UnaryExpression') {
    visitFunctionCallsInExpression(expression.argument, visit);
    return;
  }
  if (expression.type === 'BinaryExpression') {
    visitFunctionCallsInExpression(expression.left, visit);
    visitFunctionCallsInExpression(expression.right, visit);
  }
};

const collectUnsupportedFutuFunctions = (program: AstProgram): UnsupportedFunctionCall[] => {
  const unsupported: UnsupportedFunctionCall[] = [];
  const seen = new Set<string>();

  program.body.forEach((statement) => {
    visitFunctionCallsInExpression(statement.expression, (rawName, line, column) => {
      const name = normalizeKey(rawName);
      const capability = FUTU_VENDOR_FORMULA_ADAPTER.getCapabilityByName(name);
      if (
        !name ||
        (capability?.callable &&
          capability.syntaxAccepted &&
          capability.runtimeImplemented &&
          capability.renderImplemented)
      ) {
        return;
      }
      const dedupeKey = `${name}:${String(line ?? 0)}:${String(column ?? 0)}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      unsupported.push({
        name,
        line,
        column
      });
    });
  });

  return unsupported;
};

const collectUnsupportedPlotDirectives = (
  program: AstProgram,
): UnsupportedPlotDirective[] => {
  const unsupported: UnsupportedPlotDirective[] = [];
  const seen = new Set<string>();

  program.body.forEach((statement) => {
    if (statement.operator !== ':') {
      return;
    }
    const outputKey = normalizeKey(statement.target);
    (statement.directives ?? []).forEach((rawDirective) => {
      const directive = normalizeKey(rawDirective);
      if (!directive || isSupportedPlotDirective(directive)) {
        return;
      }
      const dedupeKey = [
        outputKey,
        directive,
        String(statement.line ?? 0),
        String(statement.column ?? 0),
      ].join(':');
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      unsupported.push({
        outputKey,
        directive,
        line: statement.line,
        column: statement.column,
      });
    });
  });

  return unsupported;
};

const buildUnsupportedPlotDirectiveKey = (
  outputKey: string,
  directive: string,
): string => `${outputKey}:${directive}`;

export class IndicatorCompiler {
  compile(
    definition: IndicatorDefinition,
    language: AppUiLanguage = APP_UI_BASE_LANGUAGE,
  ): IndicatorCompileResult {
    const compilerCopy = getCustomIndicatorEngineCopy(language).compiler;
    const compileMessage = (
      key: keyof typeof compilerCopy,
      values: ReadonlyArray<string | number> = [],
    ): string =>
      formatCustomIndicatorEngineTemplate(compilerCopy[key], values);
    const errors: IndicatorCompileError[] = [];

    const indicatorName = (definition.name || '').trim();
    if (!indicatorName) {
      errors.push(buildCompileError('validate', 'INDICATOR_NAME_EMPTY', compileMessage('indicatorNameCannotBeEmpty')));
    }

    const source = String(definition.source ?? '');
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      errors.push(buildCompileError('validate', 'INDICATOR_SOURCE_EMPTY', compileMessage('indicatorSourceCannotBeEmpty')));
    }
    if (source.length > INDICATOR_COMPILE_LIMITS.sourceLength) {
      errors.push(
        buildCompileError(
          'validate',
          'INDICATOR_SOURCE_TOO_LONG',
          compileMessage('indicatorSourceTooLong', [
            source.length,
            INDICATOR_COMPILE_LIMITS.sourceLength,
          ])
        )
      );
    }

    const parameterNameSet = new Set<string>();
    const explicitParameters: IndicatorParameterDefinition[] = [];
    const rawParameters = definition.parameters ?? [];
    if (rawParameters.length > INDICATOR_COMPILE_LIMITS.parameterCount) {
      errors.push(
        buildCompileError(
          'validate',
          'PARAMETER_COUNT_EXCEEDED',
          compileMessage('parameterCountExceeded', [
            rawParameters.length,
            INDICATOR_COMPILE_LIMITS.parameterCount,
          ])
        )
      );
    }

    rawParameters.forEach((parameter) => {
      const key = normalizeKey(parameter.name);
      if (!key) {
        errors.push(buildCompileError('validate', 'PARAMETER_NAME_EMPTY', compileMessage('parameterNameCannotBeEmpty')));
        return;
      }
      if (parameterNameSet.has(key)) {
        errors.push(buildCompileError('validate', 'PARAMETER_DUPLICATE', compileMessage('duplicatedParameter', [key])));
        return;
      }
      parameterNameSet.add(key);
      const numericDefault = Number(parameter.defaultValue);
      if (!Number.isFinite(numericDefault)) {
        errors.push(buildCompileError('validate', 'PARAMETER_DEFAULT_INVALID', compileMessage('invalidDefaultValueForParameter', [key])));
        return;
      }
      const min = Number(parameter.min);
      const max = Number(parameter.max);
      const step = Number(parameter.step);
      const normalizedMin =
        Number.isFinite(min) && Number.isFinite(max) ?
        Math.min(min, max) :
        (Number.isFinite(min) ? min : undefined);
      const normalizedMax =
        Number.isFinite(min) && Number.isFinite(max) ?
        Math.max(min, max) :
        (Number.isFinite(max) ? max : undefined);

      explicitParameters.push({
        ...parameter,
        name: key,
        defaultValue: numericDefault,
        min: normalizedMin,
        max: normalizedMax,
        step: Number.isFinite(step) && step > 0 ? step : undefined
      });
    });

    let parsedProgram: CompiledIndicator['program'] | null = null;
    let resolvedParameters = [...explicitParameters];
    if (source) {
      try {
        const parsed = parseIndicatorScript(source, language);
        if (parsed.tokens.length > INDICATOR_COMPILE_LIMITS.tokenCount) {
          errors.push(
            buildCompileError(
              'validate',
              'TOKEN_COUNT_EXCEEDED',
              compileMessage('tokenCountExceeded', [
                parsed.tokens.length,
                INDICATOR_COMPILE_LIMITS.tokenCount,
              ])
            )
          );
        }
        if (parsed.program.body.length > INDICATOR_COMPILE_LIMITS.statementCount) {
          errors.push(
            buildCompileError(
              'validate',
              'STATEMENT_COUNT_EXCEEDED',
              compileMessage('statementCountExceeded', [
                parsed.program.body.length,
                INDICATOR_COMPILE_LIMITS.statementCount,
              ])
            )
          );
        }
        const extracted = extractScriptParametersFromProgram(parsed.program, explicitParameters);
        resolvedParameters = extracted.parameters.map((parameter) => ({
          ...parameter,
          name: normalizeKey(parameter.name)
        }));
        parsedProgram = extracted.executableProgram;
      } catch (error) {
        if (error instanceof IndicatorParserError) {
          errors.push(
            buildCompileError('parse', error.code, error.message, error.line, error.column)
          );
        } else {
          errors.push(
            buildCompileError(
              'parse',
              'PARSER_UNKNOWN_ERROR',
              error instanceof Error ? error.message : compileMessage('parserUnknownError'),
            )
          );
        }
      }
    }

    if (!parsedProgram) {
      return {
        ok: false,
        errors
      };
    }

    if (resolvedParameters.length > INDICATOR_COMPILE_LIMITS.parameterCount) {
      errors.push(
        buildCompileError(
          'validate',
          'PARAMETER_COUNT_EXCEEDED',
          compileMessage('parameterCountExceeded', [
            resolvedParameters.length,
            INDICATOR_COMPILE_LIMITS.parameterCount,
          ])
        )
      );
    }

    collectUnsupportedFutuFunctions(parsedProgram).forEach((unsupported) => {
      const capability = getFutuCapabilityEntry(unsupported.name);
      const blockedReason = capability?.dataScopeBlockedReason ?? null;
      const renderBlocked =
        Boolean(
          capability &&
            capability.syntaxAccepted &&
            capability.runtimeImplemented &&
            !capability.renderImplemented,
        );
      errors.push(
        buildCompileError(
          'validate',
          blockedReason ?
            'FUTU_FUNCTION_UNSUPPORTED_DATA_SCOPE' :
          renderBlocked ?
            'FUTU_FUNCTION_UNSUPPORTED_RENDER' :
            'FUTU_FUNCTION_UNSUPPORTED',
          blockedReason ?
            compileMessage('unsupportedFunctionInCurrentDataScope', [
              unsupported.name,
              getCustomIndicatorEngineCopy(language).blockedReasonLabels[
                blockedReason
              ] ?? blockedReason,
            ]) :
          renderBlocked ?
            compileMessage('unsupportedRenderFunction', [unsupported.name]) :
            compileMessage('unsupportedFunction', [unsupported.name]),
          unsupported.line,
          unsupported.column
        )
      );
    });

    const scriptUnsupportedPlotDirectives =
      collectUnsupportedPlotDirectives(parsedProgram);
    scriptUnsupportedPlotDirectives.forEach((unsupported) => {
      errors.push(
        buildCompileError(
          'validate',
          'PLOT_DIRECTIVE_UNSUPPORTED',
          compileMessage('unsupportedPlotDirective', [
            unsupported.directive,
            unsupported.outputKey,
          ]),
          unsupported.line,
          unsupported.column
        )
      );
    });

    const parameterDefaults: Record<string, number> = {};
    resolvedParameters.forEach((parameter) => {
      const key = normalizeKey(parameter.name);
      const numericDefault = Number(parameter.defaultValue);
      if (!Number.isFinite(numericDefault)) {
        errors.push(buildCompileError('validate', 'PARAMETER_DEFAULT_INVALID', compileMessage('invalidDefaultValueForParameter', [key])));
        return;
      }
      parameterDefaults[key] = numericDefault;
    });

    const scriptOutputKeys = parsedProgram.body
      .filter((statement) => statement.operator === ':')
      .map((statement) => normalizeKey(statement.target));
    const scriptUnsupportedPlotDirectiveKeys = new Set(
      scriptUnsupportedPlotDirectives.map((unsupported) =>
        buildUnsupportedPlotDirectiveKey(
          unsupported.outputKey,
          unsupported.directive,
        ),
      ),
    );

    if (!scriptOutputKeys.length) {
      errors.push(buildCompileError('validate', 'OUTPUT_EMPTY', compileMessage('outputRequired')));
    }
    if (scriptOutputKeys.length > INDICATOR_COMPILE_LIMITS.outputCount) {
      errors.push(
        buildCompileError(
          'validate',
          'OUTPUT_COUNT_EXCEEDED',
          compileMessage('outputCountExceeded', [
            scriptOutputKeys.length,
            INDICATOR_COMPILE_LIMITS.outputCount,
          ])
        )
      );
    }
    const scriptOutputKeySet = new Set<string>();
    scriptOutputKeys.forEach((outputKey) => {
      if (scriptOutputKeySet.has(outputKey)) {
        errors.push(buildCompileError('validate', 'OUTPUT_DUPLICATE_IN_SCRIPT', compileMessage('duplicatedOutputInScript', [outputKey])));
        return;
      }
      scriptOutputKeySet.add(outputKey);
    });

    const definedOutputKeySet = new Set<string>();
    (definition.outputs ?? []).forEach((output) => {
      const key = normalizeKey(output.key);
      if (!key) {
        errors.push(buildCompileError('validate', 'OUTPUT_KEY_EMPTY', compileMessage('outputKeyCannotBeEmpty')));
        return;
      }
      if (definedOutputKeySet.has(key)) {
        errors.push(buildCompileError('validate', 'OUTPUT_DUPLICATE', compileMessage('duplicatedOutputDefinition', [key])));
        return;
      }
      definedOutputKeySet.add(key);
      const outputDirectives = Array.isArray(output.directives)
        ? output.directives
        : [];
      outputDirectives.forEach((rawDirective) => {
        const directive = normalizeKey(String(rawDirective ?? ''));
        if (
          !directive ||
          isSupportedPlotDirective(directive) ||
          scriptUnsupportedPlotDirectiveKeys.has(
            buildUnsupportedPlotDirectiveKey(key, directive),
          )
        ) {
          return;
        }
        errors.push(
          buildCompileError(
            'validate',
            'PLOT_DIRECTIVE_UNSUPPORTED',
            compileMessage('unsupportedPlotDirective', [directive, key])
          )
        );
      });
      if (!scriptOutputKeys.includes(key)) {
        errors.push(buildCompileError('validate', 'OUTPUT_NOT_FOUND', compileMessage('outputDefinitionNotFound', [key])));
      }
    });

    scriptOutputKeys.forEach((outputKey) => {
      if (!definedOutputKeySet.has(outputKey)) {
        errors.push(
          buildCompileError('validate', 'OUTPUT_DEFINITION_MISSING', compileMessage('outputDefinitionMetadataMissing', [outputKey]))
        );
      }
    });

    if (errors.length > 0) {
      return {
        ok: false,
        errors
      };
    }

    const normalizedDefinition: IndicatorDefinition = {
      ...definition,
      name: indicatorName,
      source,
      parameters: resolvedParameters.map((parameter) => ({
        ...parameter,
        name: normalizeKey(parameter.name)
      })),
      outputs: (definition.outputs ?? []).map((output) =>
        normalizeIndicatorOutputDefinition({
          ...output,
          key: normalizeKey(output.key),
          title: output.title || normalizeKey(output.key),
        }),
      )
    };

    return {
      ok: true,
      compiled: {
        definition: normalizedDefinition,
        program: parsedProgram,
        outputKeys: scriptOutputKeys,
        parameterDefaults
      },
      errors: []
    };
  }
}
