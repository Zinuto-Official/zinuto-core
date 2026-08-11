// SPDX-License-Identifier: GPL-3.0-only

import { registerIndicator } from 'klinecharts';
import type { CompiledIndicator } from '@/domains/custom-indicator/indicator/types';
import {
  appendRenderInstructionRangeRows,
  buildCompiledIndicatorFigure,
  buildCompiledIndicatorRenderRangeFigures,
  buildCompiledIndicatorTooltipDataSource,
} from '@/domains/custom-indicator/indicator/chartPresentation';
import {
  buildCompiledIndicatorDrawCallback,
  type IndicatorRenderExtendData,
} from '@/domains/custom-indicator/indicator/renderAdapter';
import {
  readOrExecuteCustomIndicatorExecution,
  toCustomIndicatorExecutionBars,
} from '@/domains/custom-indicator/indicator/backendExecutionCache';

type RegisterCompiledIndicatorRuntimeArgs = {
  runtimeName: string;
  shortName?: string;
  calcParams?: number[];
  precision?: number;
  compiled: CompiledIndicator;
};

const toOutputRows = (
  compiled: CompiledIndicator,
  outputSeries: Record<string, number[]>,
  length: number
): Record<string, number | null>[] =>
  Array.from({ length }).map((_item, index) => {
    const row: Record<string, number | null> = {};
    compiled.outputKeys.forEach((outputKey) => {
      const value = outputSeries[outputKey]?.[index];
      row[outputKey] = Number.isFinite(value) ? Number(value) : null;
    });
    return row;
  });

const toEmptyRows = (compiled: CompiledIndicator, length: number): Record<string, number | null>[] =>
  Array.from({ length }).map(() => {
    const row: Record<string, number | null> = {};
    compiled.outputKeys.forEach((outputKey) => {
      row[outputKey] = null;
    });
    return row;
  });

const resolveCalcParams = (
  compiled: CompiledIndicator,
  rawCalcParams: number[],
  fallbackCalcParams: number[]
): number[] =>
  compiled.definition.parameters.map((parameter, index) => {
    const explicit = rawCalcParams[index];
    if (Number.isFinite(explicit)) {
      return explicit;
    }
    const fallback = fallbackCalcParams[index];
    if (Number.isFinite(fallback)) {
      return fallback;
    }
    return Number(compiled.parameterDefaults[parameter.name]);
  });

const toParameterOverrides = (
  compiled: CompiledIndicator,
  calcParams: number[]
): Record<string, number> => {
  const overrides: Record<string, number> = {};
  compiled.definition.parameters.forEach((parameter, index) => {
    const numeric = Number(calcParams[index]);
    if (Number.isFinite(numeric)) {
      overrides[parameter.name] = numeric;
    }
  });
  return overrides;
};

export const registerCompiledIndicatorRuntime = ({
  runtimeName,
  shortName,
  calcParams = [],
  precision = 3,
  compiled,
}: RegisterCompiledIndicatorRuntimeArgs) => {
  registerIndicator<Record<string, number | null>, number, IndicatorRenderExtendData>({
    name: runtimeName,
    shortName: shortName || runtimeName,
    calcParams: [...calcParams],
    precision,
    createTooltipDataSource: buildCompiledIndicatorTooltipDataSource(compiled),
    figures: compiled.definition.outputs
      .map((output) => buildCompiledIndicatorFigure(output))
      .filter((figure): figure is NonNullable<typeof figure> => Boolean(figure))
      .concat(buildCompiledIndicatorRenderRangeFigures()),
    draw: buildCompiledIndicatorDrawCallback(),
    calc: async (dataList, indicator) => {
      const rawCalcParams = Array.isArray(indicator.calcParams) ? indicator.calcParams.map((value) => Number(value)) : [];
      const resolvedCalcParams = resolveCalcParams(compiled, rawCalcParams, calcParams);
      const executionBars = toCustomIndicatorExecutionBars(dataList);
      const executionResult = await readOrExecuteCustomIndicatorExecution(
        compiled,
        executionBars,
        toParameterOverrides(compiled, resolvedCalcParams),
      );
      if (!executionResult) {
        indicator.extendData = { renderInstructions: [] };
        return toEmptyRows(compiled, dataList.length);
      }
      indicator.extendData = {
        renderInstructions: executionResult.renderInstructions,
      };

      if (!executionResult.ok) {
        return toEmptyRows(compiled, dataList.length);
      }

      return appendRenderInstructionRangeRows(
        toOutputRows(compiled, executionResult.outputs, dataList.length),
        executionResult.renderInstructions,
      );
    }
  });
};
