// SPDX-License-Identifier: GPL-3.0-only

import {
  evaluateExpressionInState,
  executeAstProgram,
} from "../ast/evaluator.js";
import {
  AstExecutionError,
  type AstAssignmentExpression,
  type AstExecutionState,
  type AstExpression,
  type AstFunctionCall,
  type AstRuntimeValue,
} from "../ast/types.js";
import {
  createBandDescriptor,
  createDrawIconDescriptor,
  createDrawKLineDescriptor,
  createDrawLineDescriptor,
  createDrawNumberDescriptor,
  createDrawSlDescriptor,
  createDrawTextDescriptor,
  isSupportedPlotColorDirective,
  createLinePlotDescriptor,
  createStickLineDescriptor,
} from "../plot/semantics.js";
import type { RenderInstruction } from "../plot/types.js";
import type {
  BooleanOperand,
  NumericOperand,
  NumericSeries,
} from "../runtime/index.js";
import { CUSTOM_INDICATOR_ICON_TYPE } from "./iconTypes.js";
import {
  CUSTOM_INDICATOR_RUNTIME_LIMITS,
  buildRuntimeCacheKey,
  buildRuntimeStats,
  readRuntimeCache,
  touchRuntimeCache,
} from "./runtimeCache.js";
import type {
  CompiledIndicator,
  IndicatorExecutionResult,
  IndicatorRuntimeExecuteInput,
  IndicatorRuntimeError,
} from "./types.js";

const CUSTOM_INDICATOR_EXECUTION_FAILED_MESSAGE = "CUSTOM_INDICATOR_EXECUTION_FAILED";
const normalizeKey = (value: string): string => value.trim().toUpperCase();
const resolveBoundedExecutionLimit = (
  requested: number | undefined,
  maximum: number,
): number =>
  Number.isFinite(requested)
    ? Math.min(maximum, Math.max(1, Math.floor(Number(requested))))
    : maximum;

const toNumericSeries = (
  value: AstRuntimeValue,
  length: number,
): NumericSeries => {
  if (Array.isArray(value)) {
    const series = new Array<number>(length).fill(Number.NaN);
    for (let index = 0; index < length; index += 1) {
      const item = value[index];
      if (typeof item === "boolean") {
        series[index] = item ? 1 : 0;
        continue;
      }
      const numeric = Number(item);
      series[index] = Number.isFinite(numeric) ? numeric : Number.NaN;
    }
    return series;
  }

  if (typeof value === "boolean") {
    return new Array<number>(length).fill(value ? 1 : 0);
  }

  const numeric = Number(value);
  return new Array<number>(length).fill(
    Number.isFinite(numeric) ? numeric : Number.NaN,
  );
};

const toNumericOperand = (
  value: AstRuntimeValue,
  length: number,
): NumericOperand => {
  if (Array.isArray(value)) {
    const series = new Array<number>(length).fill(Number.NaN);
    for (let index = 0; index < length; index += 1) {
      const item = value[index];
      if (typeof item === "boolean") {
        series[index] = item ? 1 : 0;
        continue;
      }
      const numeric = Number(item);
      series[index] = Number.isFinite(numeric) ? numeric : Number.NaN;
    }
    return series;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const toConditionOperand = (
  value: AstRuntimeValue,
  length: number,
): BooleanOperand | NumericOperand => {
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "boolean")
  ) {
    const series = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) {
      series[index] = Boolean(value[index]);
    }
    return series;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return toNumericOperand(value, length);
};

const toTextValue = (
  value: AstRuntimeValue | undefined,
  fallback: string,
): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return fallback;
};

const nowMs = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
};

const buildRuntimeError = (
  code: string,
  message: string,
  meta: Partial<IndicatorRuntimeError> = {},
): IndicatorRuntimeError => ({
  stage: "runtime",
  code,
  message,
  statementIndex:
    typeof meta.statementIndex === "number" ? meta.statementIndex : undefined,
  statementTarget: meta.statementTarget,
  statementOperator: meta.statementOperator,
  line: typeof meta.line === "number" ? meta.line : undefined,
  column: typeof meta.column === "number" ? meta.column : undefined,
  causeMessage: meta.causeMessage,
});

const asFunctionCall = (expression: AstExpression): AstFunctionCall | null =>
  expression.type === "FunctionCall" ? expression : null;

const buildOutputStatementMap = (
  compiled: CompiledIndicator,
): Map<string, AstAssignmentExpression> => {
  const map = new Map<string, AstAssignmentExpression>();
  compiled.program.body.forEach((statement) => {
    if (statement.operator !== ":") {
      return;
    }
    map.set(normalizeKey(statement.target), statement);
  });
  return map;
};

const evaluateOutputCallArg = (
  call: AstFunctionCall,
  index: number,
  executionState: AstExecutionState,
): AstRuntimeValue | undefined => {
  const expression = call.args[index];
  if (!expression) {
    return undefined;
  }
  try {
    return evaluateExpressionInState(expression, {
      ...executionState,
      operationsExecuted: 0,
      statementsExecuted: 0,
    });
  } catch {
    return undefined;
  }
};

const buildRenderInstructions = (
  compiled: CompiledIndicator,
  outputSeries: Record<string, NumericSeries>,
  barsLength: number,
  executionState: AstExecutionState,
): RenderInstruction[] => {
  const outputStatementMap = buildOutputStatementMap(compiled);
  return compiled.definition.outputs.map((outputDef) => {
    const key = normalizeKey(outputDef.key);
    const series =
      outputSeries[key] ?? new Array<number>(barsLength).fill(Number.NaN);
    const directives = [...(outputDef.directives ?? [])];
    const title = outputDef.title || key;
    const outputStatement = outputStatementMap.get(key);
    const outputCall = outputStatement
      ? asFunctionCall(outputStatement.expression)
      : null;
    const outputCallName = outputCall ? normalizeKey(outputCall.callee) : "";

    if (outputCall && outputCallName === "DRAWICON") {
      const conditionOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const priceOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const iconOperand = evaluateOutputCallArg(outputCall, 2, executionState);
      return createDrawIconDescriptor(
        title,
        toConditionOperand(conditionOperand, barsLength),
        toNumericOperand(priceOperand, barsLength),
        iconOperand === undefined
          ? (outputDef.iconType ?? CUSTOM_INDICATOR_ICON_TYPE.BUY)
          : toNumericOperand(iconOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "DRAWTEXT") {
      const conditionOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const priceOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const textOperand = evaluateOutputCallArg(outputCall, 2, executionState);
      return createDrawTextDescriptor(
        title,
        toConditionOperand(conditionOperand, barsLength),
        toNumericOperand(priceOperand, barsLength),
        toTextValue(textOperand, outputDef.plotText || key),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "DRAWNUMBER") {
      const conditionOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const priceOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const numberOperand =
        evaluateOutputCallArg(outputCall, 2, executionState) ?? series;
      return createDrawNumberDescriptor(
        title,
        toConditionOperand(conditionOperand, barsLength),
        toNumericOperand(priceOperand, barsLength),
        toNumericOperand(numberOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "STICKLINE") {
      const conditionOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const price1Operand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const price2Operand =
        evaluateOutputCallArg(outputCall, 2, executionState) ?? series;
      const widthOperand =
        evaluateOutputCallArg(outputCall, 3, executionState) ?? 1;
      const emptyOperand =
        evaluateOutputCallArg(outputCall, 4, executionState) ?? 0;
      return createStickLineDescriptor(
        title,
        toConditionOperand(conditionOperand, barsLength),
        toNumericOperand(price1Operand, barsLength),
        toNumericOperand(price2Operand, barsLength),
        toNumericOperand(widthOperand, barsLength),
        toNumericOperand(emptyOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "DRAWLINE") {
      const condition1Operand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const price1Operand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const condition2Operand =
        evaluateOutputCallArg(outputCall, 2, executionState) ?? series;
      const price2Operand =
        evaluateOutputCallArg(outputCall, 3, executionState) ?? series;
      const extendOperand =
        evaluateOutputCallArg(outputCall, 4, executionState) ?? 0;
      return createDrawLineDescriptor(
        title,
        toConditionOperand(condition1Operand, barsLength),
        toNumericOperand(price1Operand, barsLength),
        toConditionOperand(condition2Operand, barsLength),
        toNumericOperand(price2Operand, barsLength),
        toNumericOperand(extendOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "DRAWSL") {
      const conditionOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const priceOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const slopeOperand =
        evaluateOutputCallArg(outputCall, 2, executionState) ?? 0;
      const lengthOperand =
        evaluateOutputCallArg(outputCall, 3, executionState) ?? 0;
      const directOperand =
        evaluateOutputCallArg(outputCall, 4, executionState) ?? 0;
      return createDrawSlDescriptor(
        title,
        toConditionOperand(conditionOperand, barsLength),
        toNumericOperand(priceOperand, barsLength),
        toNumericOperand(slopeOperand, barsLength),
        toNumericOperand(lengthOperand, barsLength),
        toNumericOperand(directOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (outputCall && outputCallName === "DRAWKLINE") {
      const highOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const openOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const lowOperand =
        evaluateOutputCallArg(outputCall, 2, executionState) ?? series;
      const closeOperand =
        evaluateOutputCallArg(outputCall, 3, executionState) ?? series;
      return createDrawKLineDescriptor(
        title,
        toNumericOperand(highOperand, barsLength),
        toNumericOperand(openOperand, barsLength),
        toNumericOperand(lowOperand, barsLength),
        toNumericOperand(closeOperand, barsLength),
        directives,
        outputDef.style,
      );
    }

    if (
      outputCall &&
      (outputCallName === "FILLRGN" || outputCallName === "DRAWBAND")
    ) {
      const upperOperand =
        evaluateOutputCallArg(outputCall, 0, executionState) ?? series;
      const lowerOperand =
        evaluateOutputCallArg(outputCall, 1, executionState) ?? series;
      const colorOperand1 = evaluateOutputCallArg(
        outputCall,
        2,
        executionState,
      );
      const colorOperand2 = evaluateOutputCallArg(
        outputCall,
        3,
        executionState,
      );
      const bandDirectives = [...directives];
      [colorOperand1, colorOperand2].forEach((colorValue) => {
        if (typeof colorValue !== "string") {
          return;
        }
        const normalized = colorValue.trim().toUpperCase();
        if (!normalized) {
          return;
        }
        if (isSupportedPlotColorDirective(normalized)) {
          bandDirectives.push(normalized);
        }
      });
      return createBandDescriptor(
        title,
        toNumericOperand(upperOperand, barsLength),
        toNumericOperand(lowerOperand, barsLength),
        bandDirectives,
        outputDef.style,
      );
    }

    switch (outputDef.renderPrimitive) {
      case "iconMarker": {
        const condition = series.map((value) => Number.isFinite(value));
        return createDrawIconDescriptor(
          title,
          condition,
          series,
          outputDef.iconType ?? CUSTOM_INDICATOR_ICON_TYPE.BUY,
          directives,
          outputDef.style,
        );
      }
      case "textMarker": {
        const condition = series.map((value) => Number.isFinite(value));
        return createDrawTextDescriptor(
          title,
          condition,
          series,
          outputDef.plotText || key,
          directives,
          outputDef.style,
        );
      }
      case "numberMarker": {
        const condition = series.map((value) => Number.isFinite(value));
        return createDrawNumberDescriptor(
          title,
          condition,
          series,
          series,
          directives,
          outputDef.style,
        );
      }
      case "segment": {
        const condition = series.map((value) => Number.isFinite(value));
        return createDrawLineDescriptor(
          title,
          condition,
          series,
          condition,
          series,
          0,
          directives,
          outputDef.style,
        );
      }
      case "slopeSegment": {
        const condition = series.map((value) => Number.isFinite(value));
        return createDrawSlDescriptor(
          title,
          condition,
          series,
          0,
          0,
          0,
          directives,
          outputDef.style,
        );
      }
      case "ohlc":
        return createDrawKLineDescriptor(
          title,
          series,
          series,
          series,
          series,
          directives,
          outputDef.style,
        );
      case "band":
        return createBandDescriptor(title, series, series, directives, outputDef.style);
      case "histogram": {
        if (normalizeKey(outputDef.sourceFunction ?? "") !== "STICKLINE") {
          if (
            !directives.some(
              (directive) => String(directive).toUpperCase() === "STICK",
            )
          ) {
            directives.push("STICK");
          }
          return createLinePlotDescriptor(title, series, directives, outputDef.style);
        }
        const condition = series.map((value) => Number.isFinite(value));
        return createStickLineDescriptor(
          title,
          condition,
          series,
          series,
          1,
          0,
          directives,
          outputDef.style,
        );
      }
      case "line":
      default:
        return createLinePlotDescriptor(title, series, directives, outputDef.style);
    }
  });
};

export class IndicatorRuntime {
  execute(
    compiled: CompiledIndicator,
    input: IndicatorRuntimeExecuteInput,
  ): IndicatorExecutionResult {
    const startMs = nowMs();
    const errors: IndicatorRuntimeError[] = [];
    const params: Record<string, number> = {
      ...compiled.parameterDefaults,
    };
    const rawBars = Array.isArray(input.bars) ? input.bars : [];
    const runtimeBarsMax = resolveBoundedExecutionLimit(
      input.executionLimits?.maxBars,
      CUSTOM_INDICATOR_RUNTIME_LIMITS.barsMax,
    );
    if (rawBars.length > runtimeBarsMax) {
      errors.push(
        buildRuntimeError(
          "BAR_COUNT_EXCEEDED",
          `Runtime bar count exceeded: ${String(rawBars.length)} > ${String(runtimeBarsMax)}`,
        ),
      );
      return {
        ok: false,
        outputs: {},
        renderInstructions: [],
        params,
        runtimeStats: buildRuntimeStats(nowMs() - startMs, 0, 0, false),
        errors,
      };
    }
    const bars = rawBars;

    Object.entries(input.parameterOverrides ?? {}).forEach(([key, value]) => {
      const normalizedKey = normalizeKey(key);
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        errors.push(
          buildRuntimeError(
            "PARAM_OVERRIDE_INVALID",
            `Invalid parameter override: ${normalizedKey}`,
          ),
        );
        return;
      }
      params[normalizedKey] = numeric;
    });

    if (errors.length > 0) {
      return {
        ok: false,
        outputs: {},
        renderInstructions: [],
        params,
        runtimeStats: buildRuntimeStats(nowMs() - startMs, 0, 0, false),
        errors,
      };
    }

    const statementLimit = resolveBoundedExecutionLimit(
      input.executionLimits?.maxStatements,
      CUSTOM_INDICATOR_RUNTIME_LIMITS.astMaxStatements,
    );
    const operationLimit = resolveBoundedExecutionLimit(
      input.executionLimits?.maxOperations,
      CUSTOM_INDICATOR_RUNTIME_LIMITS.astMaxOperations,
    );
    const cacheKey = buildRuntimeCacheKey(
      compiled,
      bars,
      params,
      statementLimit,
      operationLimit,
    );
    const cached = readRuntimeCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const execution = executeAstProgram(compiled.program, {
        bars,
        variables: params,
        limits: {
          maxStatements: statementLimit,
          maxOperations: operationLimit,
        },
      });

      const outputSeries: Record<string, NumericSeries> = {};
      compiled.outputKeys.forEach((outputKey) => {
        const rawValue = execution.outputs[outputKey];
        if (rawValue === undefined) {
          errors.push(
            buildRuntimeError(
              "OUTPUT_MISSING",
              `Output series missing: ${outputKey}`,
            ),
          );
          return;
        }
        outputSeries[outputKey] = toNumericSeries(rawValue, bars.length);
      });

      if (errors.length > 0) {
        return {
          ok: false,
          outputs: outputSeries,
          renderInstructions: [],
          params,
          runtimeStats: buildRuntimeStats(
            nowMs() - startMs,
            execution.stats.statementsExecuted,
            execution.stats.operationsExecuted,
            false,
          ),
          errors,
        };
      }

      const renderInstructions = buildRenderInstructions(
        compiled,
        outputSeries,
        bars.length,
        execution.state,
      );
      const nextResult: IndicatorExecutionResult = {
        ok: true,
        outputs: outputSeries,
        renderInstructions,
        params,
        runtimeStats: buildRuntimeStats(
          nowMs() - startMs,
          execution.stats.statementsExecuted,
          execution.stats.operationsExecuted,
          false,
        ),
        errors: [],
      };
      touchRuntimeCache(cacheKey, nextResult);
      return nextResult;
    } catch (error) {
      if (error instanceof AstExecutionError) {
        errors.push(
          buildRuntimeError(error.code, error.message, {
            statementIndex: error.statementIndex,
            statementTarget: error.statementTarget,
            statementOperator: error.statementOperator,
            line: error.statementLine,
            column: error.statementColumn,
            causeMessage: error.causeMessage,
          }),
        );
      } else {
        errors.push(
          buildRuntimeError(
            "EXECUTION_FAILED",
            error instanceof Error ? error.message : CUSTOM_INDICATOR_EXECUTION_FAILED_MESSAGE,
          ),
        );
      }
      return {
        ok: false,
        outputs: {},
        renderInstructions: [],
        params,
        runtimeStats: buildRuntimeStats(nowMs() - startMs, 0, 0, false),
        errors,
      };
    }
  }
}
