// SPDX-License-Identifier: GPL-3.0-only

import type {
  DirectiveFamily,
  NormalizedPlotStyle,
  PlotDirective,
  RenderInstruction,
  RenderPrimitive,
} from '@/workspaces/custom-indicator/plot/types';
import type { Bar, NumericSeries } from '@/domains/custom-indicator/indicator/dataTypes';
import type { FutuCapabilitySupportState } from '@/domains/custom-indicator/indicator/supportTypes';

export type IndicatorParameterDefinition = {
  name: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
};

export type IndicatorOutputDefinition = {
  key: string;
  title: string;
  directives?: Array<PlotDirective | string>;
  renderPrimitive?: RenderPrimitive;
  style?: Partial<NormalizedPlotStyle>;
  directiveFamilies?: DirectiveFamily[];
  plotText?: string;
  iconType?: number;
  sourceFunction?: string | null;
  supportState?: FutuCapabilitySupportState;
};

export type IndicatorDefinition = {
  name: string;
  source: string;
  parameters: IndicatorParameterDefinition[];
  outputs: IndicatorOutputDefinition[];
};

export type IndicatorCompileError = {
  stage: 'parse' | 'validate';
  code: string;
  message: string;
  line?: number;
  column?: number;
};

export type IndicatorRuntimeError = {
  stage: 'runtime';
  code: string;
  message: string;
  statementIndex?: number;
  statementTarget?: string;
  statementOperator?: string;
  line?: number;
  column?: number;
  causeMessage?: string;
};

export type IndicatorExecutionRuntimeStats = {
  durationMs: number;
  statementsExecuted: number;
  operationsExecuted: number;
  fromCache: boolean;
};

export type CompiledIndicator = {
  definition: IndicatorDefinition;
  outputKeys: string[];
  parameterDefaults: Record<string, number>;
};

export type IndicatorCompileResult = {
  ok: boolean;
  compiled?: CompiledIndicator;
  errors: IndicatorCompileError[];
};

export type IndicatorExecutionResult = {
  ok: boolean;
  outputs: Record<string, NumericSeries>;
  renderInstructions: RenderInstruction[];
  params: Record<string, number>;
  runtimeStats?: IndicatorExecutionRuntimeStats;
  errors: IndicatorRuntimeError[];
};

export type IndicatorRuntimeExecuteInput = {
  bars: Bar[];
  parameterOverrides?: Record<string, number>;
  executionLimits?: {
    maxStatements?: number;
    maxOperations?: number;
    maxBars?: number;
  };
};
