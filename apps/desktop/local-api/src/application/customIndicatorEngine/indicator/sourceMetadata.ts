// SPDX-License-Identifier: GPL-3.0-only

import type { AstAssignmentExpression, AstExpression, AstFunctionCall, AstProgram } from '../ast/types.js';
import { INDICATOR_COLOR_DIRECTIVES } from './indicatorColorDirectives.js';
import { parseIndicatorScript } from '../parser/index.js';
import type { IndicatorOutputDefinition, IndicatorParameterDefinition } from './types.js';
import { normalizePlotDirectives } from '../plot/semantics.js';
import { RENDER_PRIMITIVES, type RenderPrimitive } from '../plot/types.js';
import { resolveFutuSupportState } from '../futu/futuSupportMatrix.js';

const OUTPUT_COLOR_DIRECTIVES = INDICATOR_COLOR_DIRECTIVES.autofill;

const normalizeIndicatorKey = (value: string): string => value.trim().toUpperCase();

const RUNTIME_RESERVED_IDENTIFIER_KEYS = new Set<string>([
  'OPEN',
  'O',
  'HIGH',
  'H',
  'LOW',
  'L',
  'CLOSE',
  'C',
  'VOL',
  'VOLA',
  'V',
  'AMOUNT',
  'TOTALVOL',
  'TOTALAMOUNT',
  'PERIOD',
  'DATE',
  'TIME',
  'TIME2',
  'YEAR',
  'MONTH',
  'WEEKOFYEAR',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'WEEKDAY',
  'TOTALFZNUM',
  'FROMOPEN',
  'CURRBARSCOUNT',
  'TOTALBARSCOUNT',
  'ISLASTBAR',
  'TRUE',
  'FALSE',
  'NULL',
  'DRAWNULL'
]);

const asFunctionCall = (expression: AstExpression): AstFunctionCall | null =>
  expression.type === 'FunctionCall' ? expression : null;

const inferFunctionRenderPrimitive = (expression: AstExpression): RenderPrimitive => {
  const call = asFunctionCall(expression);
  if (!call) {
    return RENDER_PRIMITIVES.line;
  }
  const callee = normalizeIndicatorKey(call.callee);
  if (callee === 'DRAWICON') {
    return RENDER_PRIMITIVES.iconMarker;
  }
  if (callee === 'DRAWTEXT') {
    return RENDER_PRIMITIVES.textMarker;
  }
  if (callee === 'DRAWNUMBER') {
    return RENDER_PRIMITIVES.numberMarker;
  }
  if (callee === 'STICKLINE') {
    return RENDER_PRIMITIVES.histogram;
  }
  if (callee === 'DRAWLINE') {
    return RENDER_PRIMITIVES.segment;
  }
  if (callee === 'DRAWSL') {
    return RENDER_PRIMITIVES.slopeSegment;
  }
  if (callee === 'DRAWKLINE') {
    return RENDER_PRIMITIVES.ohlc;
  }
  if (callee === 'FILLRGN' || callee === 'DRAWBAND') {
    return RENDER_PRIMITIVES.band;
  }
  return RENDER_PRIMITIVES.line;
};

const inferSourceFunctionName = (expression: AstExpression): string | null => {
  const call = asFunctionCall(expression);
  if (!call) {
    return null;
  }
  return normalizeIndicatorKey(call.callee) || null;
};

const inferDrawText = (expression: AstExpression): string | undefined => {
  const call = asFunctionCall(expression);
  if (!call) {
    return undefined;
  }
  if (normalizeIndicatorKey(call.callee) !== 'DRAWTEXT') {
    return undefined;
  }
  const arg = call.args[2];
  if (!arg) {
    return undefined;
  }
  if (arg.type === 'StringLiteral') {
    return arg.value;
  }
  if (arg.type === 'Identifier') {
    return arg.name;
  }
  return undefined;
};

const inferDrawIconType = (expression: AstExpression): number | undefined => {
  const call = asFunctionCall(expression);
  if (!call) {
    return undefined;
  }
  if (normalizeIndicatorKey(call.callee) !== 'DRAWICON') {
    return undefined;
  }
  const arg = call.args[2];
  if (!arg || arg.type !== 'NumberLiteral') {
    return undefined;
  }
  const rounded = Math.floor(Number(arg.value));
  if (!Number.isFinite(rounded)) {
    return undefined;
  }
  return rounded;
};

const normalizeDirectiveList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeIndicatorKey(String(item ?? '')))
    .filter((item) => Boolean(item));
};

export const normalizeIndicatorOutputDefinition = (
  output: IndicatorOutputDefinition
): IndicatorOutputDefinition => {
  const key = normalizeIndicatorKey(output.key);
  const sourceFunction = normalizeIndicatorKey(output.sourceFunction ?? '') || null;
  const directives = normalizeDirectiveList(output.directives);

  let style = output.style;
  let directiveFamilies = output.directiveFamilies;
  try {
    const normalized = normalizePlotDirectives(directives, output.style);
    style = normalized.style;
    directiveFamilies = [...normalized.directiveFamilies];
  } catch {
    style = output.style;
    directiveFamilies = output.directiveFamilies;
  }

  return {
    ...output,
    key,
    title: output.title || key,
    directives,
    renderPrimitive: output.renderPrimitive ?? RENDER_PRIMITIVES.line,
    style,
    directiveFamilies,
    sourceFunction,
    supportState: output.supportState ?? (sourceFunction ? resolveFutuSupportState(sourceFunction) : 'full')
  };
};

const inferImplicitParameterDefaultValue = (key: string): number => {
  const normalized = normalizeIndicatorKey(key);
  if (/^TH.*(?:K)?HI/.test(normalized) || /(?:K)?HIGH$/.test(normalized)) {
    return 85;
  }
  if (/^TH.*(?:K)?LO/.test(normalized) || /(?:K)?LOW$/.test(normalized)) {
    return 15;
  }
  if (normalized === 'KK' || normalized === 'DD') {
    return 3;
  }
  if (/^M\d*$/.test(normalized)) {
    return 3;
  }
  if (/^NBB\d*$/.test(normalized)) {
    return 20;
  }
  if (/^N\d*$/.test(normalized)) {
    return 9;
  }
  return 1;
};

const collectExpressionIdentifiers = (expression: AstExpression, receiver: string[]) => {
  if (expression.type === 'Identifier') {
    const key = normalizeIndicatorKey(expression.name);
    if (key) {
      receiver.push(key);
    }
    return;
  }

  if (expression.type === 'UnaryExpression') {
    collectExpressionIdentifiers(expression.argument, receiver);
    return;
  }

  if (expression.type === 'BinaryExpression') {
    collectExpressionIdentifiers(expression.left, receiver);
    collectExpressionIdentifiers(expression.right, receiver);
    return;
  }

  if (expression.type === 'FunctionCall') {
    expression.args.forEach((arg) => collectExpressionIdentifiers(arg, receiver));
  }
};

const isFiniteLiteralNumber = (expression?: AstExpression): number | null => {
  if (!expression || expression.type !== 'NumberLiteral') {
    return null;
  }
  const numeric = Number(expression.value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseInputCallParameterMeta = (
  expression: AstExpression
): Pick<IndicatorParameterDefinition, 'defaultValue' | 'min' | 'max' | 'step'> | null => {
  const call = asFunctionCall(expression);
  if (!call || normalizeIndicatorKey(call.callee) !== 'INPUT') {
    return null;
  }

  if (!call.args.length) {
    return null;
  }

  const defaultArgIndex = call.args[0]?.type === 'StringLiteral' ? 1 : 0;
  const defaultValue = isFiniteLiteralNumber(call.args[defaultArgIndex]);
  if (defaultValue === null) {
    return null;
  }

  const minValue = isFiniteLiteralNumber(call.args[defaultArgIndex + 1]);
  const maxValue = isFiniteLiteralNumber(call.args[defaultArgIndex + 2]);
  const stepValue = isFiniteLiteralNumber(call.args[defaultArgIndex + 3]);

  const meta: Pick<IndicatorParameterDefinition, 'defaultValue' | 'min' | 'max' | 'step'> = {
    defaultValue
  };
  if (minValue !== null) {
    meta.min = minValue;
  }
  if (maxValue !== null) {
    meta.max = maxValue;
  }
  if (stepValue !== null && stepValue > 0) {
    meta.step = stepValue;
  }
  return meta;
};

const parseParameterDeclarationMeta = (
  statement: AstAssignmentExpression
): Pick<IndicatorParameterDefinition, 'defaultValue' | 'min' | 'max' | 'step'> | null => {
  if (statement.operator !== ':=') {
    return null;
  }

  const literalValue = isFiniteLiteralNumber(statement.expression);
  if (literalValue !== null) {
    return {
      defaultValue: literalValue
    };
  }

  return parseInputCallParameterMeta(statement.expression);
};

const mergeParameterDefinition = (
  key: string,
  fallback: IndicatorParameterDefinition | null,
  scriptMeta: Pick<IndicatorParameterDefinition, 'defaultValue' | 'min' | 'max' | 'step'>
): IndicatorParameterDefinition => {
  const defaultValue = Number(scriptMeta.defaultValue);
  const normalizedDefault = Number.isFinite(defaultValue)
    ? defaultValue
    : Number.isFinite(Number(fallback?.defaultValue))
      ? Number(fallback?.defaultValue)
      : 0;

  const min = Number.isFinite(Number(scriptMeta.min))
    ? Number(scriptMeta.min)
    : Number.isFinite(Number(fallback?.min))
      ? Number(fallback?.min)
      : undefined;
  const max = Number.isFinite(Number(scriptMeta.max))
    ? Number(scriptMeta.max)
    : Number.isFinite(Number(fallback?.max))
      ? Number(fallback?.max)
      : undefined;
  const step = Number.isFinite(Number(scriptMeta.step))
    ? Number(scriptMeta.step)
    : Number.isFinite(Number(fallback?.step))
      ? Number(fallback?.step)
      : undefined;

  const normalizedMin =
    min !== undefined && max !== undefined ?
    Math.min(min, max) :
    min;
  const normalizedMax =
    min !== undefined && max !== undefined ?
    Math.max(min, max) :
    max;

  return {
    name: key,
    defaultValue: normalizedDefault,
    min: normalizedMin,
    max: normalizedMax,
    step: step !== undefined && step > 0 ? step : undefined
  };
};

type ScriptParameterExtractionResult = {
  parameters: IndicatorParameterDefinition[];
  executableProgram: AstProgram;
  declarationTargets: string[];
};

export const extractScriptParametersFromProgram = (
  program: AstProgram,
  fallback: IndicatorParameterDefinition[] = []
): ScriptParameterExtractionResult => {
  const fallbackByKey = new Map<string, IndicatorParameterDefinition>();
  const normalizedFallback = fallback
    .map((parameter) => {
      const name = normalizeIndicatorKey(parameter.name);
      if (!name) {
        return null;
      }
      return {
        ...parameter,
        name
      } satisfies IndicatorParameterDefinition;
    })
    .filter((item): item is IndicatorParameterDefinition => Boolean(item));

  normalizedFallback.forEach((parameter) => {
    fallbackByKey.set(parameter.name, parameter);
  });

  const executableBody: AstProgram['body'] = [];
  const declarationTargets: string[] = [];
  const declarationSet = new Set<string>();
  const scriptByKey = new Map<string, IndicatorParameterDefinition>();
  const declaredTargetSet = new Set<string>();

  program.body.forEach((statement) => {
    const key = normalizeIndicatorKey(statement.target);
    if (key) {
      declaredTargetSet.add(key);
    }
  });

  program.body.forEach((statement) => {
    const key = normalizeIndicatorKey(statement.target);
    const meta = parseParameterDeclarationMeta(statement);
    if (!key || !meta) {
      executableBody.push(statement);
      return;
    }

    const fallbackDefinition = fallbackByKey.get(key) ?? null;
    const merged = mergeParameterDefinition(
      key,
      fallbackDefinition ? { ...fallbackDefinition, name: key } : null,
      {
        ...meta
      }
    );
    scriptByKey.set(key, merged);
    if (!declarationSet.has(key)) {
      declarationSet.add(key);
      declarationTargets.push(key);
    }
  });

  const referencedIdentifiers: string[] = [];
  executableBody.forEach((statement) => {
    collectExpressionIdentifiers(statement.expression, referencedIdentifiers);
  });
  const referencedParameterKeys: string[] = [];
  const referencedSet = new Set<string>();
  referencedIdentifiers.forEach((key) => {
    if (!key || referencedSet.has(key)) {
      return;
    }
    if (declaredTargetSet.has(key)) {
      return;
    }
    if (RUNTIME_RESERVED_IDENTIFIER_KEYS.has(key)) {
      return;
    }
    referencedSet.add(key);
    referencedParameterKeys.push(key);
  });

  const scriptParameterKeys: string[] = [];
  const scriptParameterSet = new Set<string>();
  declarationTargets.forEach((key) => {
    if (!key || scriptParameterSet.has(key)) {
      return;
    }
    scriptParameterSet.add(key);
    scriptParameterKeys.push(key);
  });
  referencedParameterKeys.forEach((key) => {
    if (scriptParameterSet.has(key)) {
      return;
    }
    scriptParameterSet.add(key);
    scriptParameterKeys.push(key);
  });

  const parameters: IndicatorParameterDefinition[] = [];
  if (scriptParameterKeys.length > 0) {
    scriptParameterKeys.forEach((key) => {
      const scriptDefinition = scriptByKey.get(key);
      if (scriptDefinition) {
        parameters.push({
          ...scriptDefinition,
          name: key
        });
        return;
      }
      const fallbackDefinition = fallbackByKey.get(key);
      parameters.push({
        name: key,
        defaultValue: Number.isFinite(Number(fallbackDefinition?.defaultValue))
          ? Number(fallbackDefinition?.defaultValue)
          : inferImplicitParameterDefaultValue(key),
        min: Number.isFinite(Number(fallbackDefinition?.min)) ? Number(fallbackDefinition?.min) : undefined,
        max: Number.isFinite(Number(fallbackDefinition?.max)) ? Number(fallbackDefinition?.max) : undefined,
        step: Number.isFinite(Number(fallbackDefinition?.step)) && Number(fallbackDefinition?.step) > 0
          ? Number(fallbackDefinition?.step)
          : undefined
      });
    });
  } else {
    normalizedFallback.forEach((parameter) => {
      parameters.push({
        ...parameter,
        name: parameter.name
      });
    });
  }

  return {
    parameters,
    executableProgram: {
      type: 'Program',
      body: executableBody
    },
    declarationTargets
  };
};

export const deriveScriptParameterDefinitions = (
  source: string,
  fallback: IndicatorParameterDefinition[] = []
): IndicatorParameterDefinition[] => {
  try {
    const parsed = parseIndicatorScript(source);
    const extracted = extractScriptParametersFromProgram(parsed.program, fallback);
    return extracted.parameters.map((parameter) => ({
      ...parameter,
      name: normalizeIndicatorKey(parameter.name)
    }));
  } catch {
    return fallback.map((parameter) => ({
      ...parameter,
      name: normalizeIndicatorKey(parameter.name)
    }));
  }
};

export const deriveScriptOutputDefinitions = (source: string): IndicatorOutputDefinition[] => {
  try {
    const parsed = parseIndicatorScript(source);
    const { executableProgram } = extractScriptParametersFromProgram(parsed.program);
    const outputStatements = executableProgram.body.filter((statement) => statement.operator === ':');

    return outputStatements.map((statement, index) => {
      const key = normalizeIndicatorKey(statement.target);
      const functionRenderPrimitive = inferFunctionRenderPrimitive(statement.expression);
      const directivesFromScript = normalizeDirectiveList(statement.directives);

      let renderPrimitive = functionRenderPrimitive;
      let directives = [...directivesFromScript];
      const hideInternalAutoTitle =
        /^LINE\d+$/.test(key) &&
        functionRenderPrimitive !== RENDER_PRIMITIVES.line;

      if (!directives.length) {
        const colorDirective = OUTPUT_COLOR_DIRECTIVES[index % OUTPUT_COLOR_DIRECTIVES.length];
        directives = [colorDirective, 'LINETHICK2'];
      }

      if (renderPrimitive === RENDER_PRIMITIVES.line && directives.some((directive) => directive === 'STICK')) {
        renderPrimitive = RENDER_PRIMITIVES.histogram;
      }

      return normalizeIndicatorOutputDefinition({
        key,
        title: hideInternalAutoTitle ? '' : key,
        directives,
        renderPrimitive,
        plotText: inferDrawText(statement.expression),
        iconType: inferDrawIconType(statement.expression),
        sourceFunction: inferSourceFunctionName(statement.expression)
      });
    });
  } catch {
    return [];
  }
};

export const buildParameterDefinitionsFromInputs = (
  parameterInputs: Record<string, string>,
  fallback: IndicatorParameterDefinition[] = []
): IndicatorParameterDefinition[] => {
  const fallbackMap = new Map<string, IndicatorParameterDefinition>();
  fallback.forEach((parameter) => {
    const key = normalizeIndicatorKey(parameter.name);
    if (!key) {
      return;
    }
    fallbackMap.set(key, {
      ...parameter,
      name: key
    });
  });

  const inputMap = new Map<string, string>();
  Object.entries(parameterInputs ?? {}).forEach(([rawName, rawValue]) => {
    const key = normalizeIndicatorKey(rawName);
    if (!key) {
      return;
    }
    inputMap.set(key, String(rawValue ?? ''));
  });

  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  fallbackMap.forEach((_value, key) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    orderedKeys.push(key);
  });
  inputMap.forEach((_value, key) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    orderedKeys.push(key);
  });

  return orderedKeys.map((key) => {
    const fallbackDef = fallbackMap.get(key);
    const inputRaw = inputMap.get(key);
    const inputNumeric = Number(inputRaw);
    const defaultValue =
      Number.isFinite(inputNumeric) ? inputNumeric :
      Number.isFinite(Number(fallbackDef?.defaultValue)) ? Number(fallbackDef?.defaultValue) :
      0;

    const min = Number(fallbackDef?.min);
    const max = Number(fallbackDef?.max);
    const step = Number(fallbackDef?.step);

    return {
      name: key,
      defaultValue,
      min: Number.isFinite(min) ? min : undefined,
      max: Number.isFinite(max) ? max : undefined,
      step: Number.isFinite(step) && step > 0 ? step : undefined
    } satisfies IndicatorParameterDefinition;
  });
};
