// SPDX-License-Identifier: GPL-3.0-only

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileCustomIndicatorDefinition,
  compileCustomIndicatorScript,
  executeCustomIndicatorScript,
} from '../../src/application/customIndicatorRuntimeService.js';
import { getCustomIndicatorSystemDefaultTemplates } from '../../src/application/customIndicatorEngine/indicator/systemDefaults.js';
import { CUSTOM_INDICATOR_RUNTIME_LIMITS } from '../../src/application/customIndicatorEngine/indicator/runtimeCache.js';
import { parseIndicatorScript } from '../../src/application/customIndicatorEngine/parser/index.js';
import {
  desktopCustomIndicatorCompileResultSchema,
  desktopCustomIndicatorExecuteResultSchema,
} from '@zinuto/shared/contracts-desktop/api';

const SAMPLE_BARS = [
  { time: 1, open: 10, high: 11, low: 9, close: 10.2, volume: 100 },
  { time: 2, open: 10.2, high: 11.4, low: 9.8, close: 10.9, volume: 120 },
  { time: 3, open: 10.9, high: 11.7, low: 10.1, close: 10.4, volume: 90 },
  { time: 4, open: 10.4, high: 11.2, low: 10.0, close: 10.95, volume: 130 },
  { time: 5, open: 10.95, high: 11.9, low: 10.4, close: 11.5, volume: 150 },
  { time: 6, open: 11.5, high: 12.1, low: 10.8, close: 11.1, volume: 110 },
];

const SOURCE = `
MID: MA(C, 3), COLORBLUE, LINETHICK4;
BAR: STICKLINE(C > O, O, C, 2, 0), COLORRED;
TXT: DRAWTEXT(C > O, L, 'BUY'), COLOR00C2FF;
`.trim();

const UNSUPPORTED_RENDER_SOURCE = `
SEG: DRAWLINE(CROSS(C, MA(C, 2)), L, CROSS(MA(C, 2), C), H, 1), COLORCYAN;
SLOPE: DRAWSL(CROSS(C, MA(C, 2)), L, 0.5, 4, 0), COLORGREEN;
KX: DRAWKLINE(H, O, L, C);
BANDX: DRAWBAND(HHV(H, 3), LLV(L, 3), 'COLORBLUE');
`.trim();

test('custom indicator parser keeps equality as comparison, not assignment', () => {
  const { program } = parseIndicatorScript('EQ: C = O;');
  const expression = program.body[0]?.expression;
  assert.equal(expression?.type, 'BinaryExpression');
  assert.equal(expression?.type === 'BinaryExpression' ? expression.operator : null, '==');
});

test('custom indicator parser rejects bare variable assignments with equals', () => {
  assert.throws(
    () => parseIndicatorScript('N = 20;\nOUT: MA(C, N);'),
    /assignment|operator|赋值|代入|할당|asignación/i,
  );
});

test('local-api compiler and runtime emit normalized render instructions for futu-style scripts', () => {
  const compileResult = compileCustomIndicatorScript({
    source: SOURCE,
    displayName: 'TEST_FUTU_RENDER',
  });
  desktopCustomIndicatorCompileResultSchema.parse(compileResult);
  assert.equal(compileResult.state !== null, true);

  const result = executeCustomIndicatorScript({
    compiled: compileResult.state!.compiled,
    input: {
      bars: SAMPLE_BARS,
    },
  });
  desktopCustomIndicatorExecuteResultSchema.parse(result);

  assert.equal(result.ok, true);
  const instructionByName = new Map(
    result.renderInstructions.map((instruction) => [instruction.name, instruction]),
  );

  assert.equal(instructionByName.get('MID')?.primitive, 'line');
  assert.equal(instructionByName.get('MID')?.style.lineWidth, 4);
  assert.equal(instructionByName.get('BAR')?.primitive, 'histogram');
  assert.equal(instructionByName.get('TXT')?.primitive, 'textMarker');
});

test('local-api runtime evaluates draw parameters against the executed state', () => {
  const compileResult = compileCustomIndicatorScript({
    source: `
DELTA:=C-O;
MARK: DRAWNUMBER(C > O, H, DELTA), COLORRED;
`.trim(),
    displayName: 'TEST_DRAWNUMBER_STATE_REUSE',
  });
  assert.equal(compileResult.state !== null, true);

  const result = executeCustomIndicatorScript({
    compiled: compileResult.state!.compiled,
    input: {
      bars: SAMPLE_BARS,
    },
  });

  assert.equal(result.ok, true);
  const marker = result.renderInstructions.find(
    (instruction) => instruction.name === 'MARK',
  );
  assert.equal(marker?.primitive, 'numberMarker');
  assert.deepEqual(
    marker?.primitive === 'numberMarker' ? marker.numberSeries.slice(0, 3) : [],
    [
      SAMPLE_BARS[0]!.close - SAMPLE_BARS[0]!.open,
      SAMPLE_BARS[1]!.close - SAMPLE_BARS[1]!.open,
      SAMPLE_BARS[2]!.close - SAMPLE_BARS[2]!.open,
    ],
  );
});

test('local-api compiler rejects futu drawing functions whose render path is not implemented', () => {
  const compileResult = compileCustomIndicatorScript({
    source: UNSUPPORTED_RENDER_SOURCE,
    displayName: 'TEST_UNSUPPORTED_PARTIAL_RENDER',
  });

  assert.equal(compileResult.state, null);
  assert.ok(
    compileResult.compileErrors.some((error) =>
      error.code === 'FUTU_FUNCTION_UNSUPPORTED_RENDER' &&
      /fail-closed render guard: (DRAWLINE|DRAWSL|DRAWKLINE|DRAWBAND)/.test(
        error.message,
      ),
    ),
  );
});

test('local-api compiler rejects unsupported plot directives before chart presentation runs', () => {
  const compileResult = compileCustomIndicatorScript({
    source: 'X: CLOSE, COLORSTICK;',
    displayName: 'TEST_UNSUPPORTED_PLOT_DIRECTIVE',
  });

  assert.equal(compileResult.state, null);
  assert.ok(
    compileResult.compileErrors.some(
      (error) =>
        error.code === 'PLOT_DIRECTIVE_UNSUPPORTED' &&
        /COLORSTICK/.test(error.message),
    ),
  );
});

test('custom indicator parameters are normalized, warned, and clamped before execution', () => {
  const compileResult = compileCustomIndicatorScript({
    source: `
N:=INPUT(5, 1, 10, 1);
OUT: MA(C, N);
`.trim(),
    parameterInputs: { n: '99' },
    invalidParamLabel: 'Invalid parameter',
    displayName: 'TEST_PARAMETER_CLAMP',
  });

  assert.ok(compileResult.state);
  assert.deepEqual(compileResult.nextParameterInputs, { N: '99' });
  assert.deepEqual(compileResult.state.calcParams, [10]);
  assert.deepEqual(compileResult.parameterWarnings, ['Invalid parameter: N']);

  const execution = executeCustomIndicatorScript({
    compiled: compileResult.state.compiled,
    input: {
      bars: SAMPLE_BARS,
      parameterOverrides: { N: compileResult.state.calcParams[0]! },
    },
  });
  assert.equal(execution.ok, true);
  assert.equal(execution.params.N, 10);
});

test('every system indicator template compiles and executes through the custom runtime', () => {
  getCustomIndicatorSystemDefaultTemplates().forEach((template) => {
    const compileResult = compileCustomIndicatorScript({
      source: template.definition.source,
      parameters: template.definition.parameters,
      displayName: template.definition.name,
    });
    assert.ok(compileResult.state, `${template.id} should compile`);
    const execution = executeCustomIndicatorScript({
      compiled: compileResult.state.compiled,
      input: { bars: SAMPLE_BARS },
    });
    assert.equal(execution.ok, true, `${template.id} should execute`);
    assert.ok(
      Object.keys(execution.outputs).length > 0,
      `${template.id} should expose output series`,
    );
  });
});

test('runtime cache invalidates when a reused bars array is mutated', () => {
  const compileResult = compileCustomIndicatorScript({
    source: 'CACHE_MUTATION_OUT: C;',
    displayName: 'TEST_CACHE_MUTATION',
  });
  assert.ok(compileResult.state);
  const bars = SAMPLE_BARS.map((bar) => ({ ...bar }));

  const first = executeCustomIndicatorScript({
    compiled: compileResult.state.compiled,
    input: { bars },
  });
  bars[0]!.close = 123.45;
  const second = executeCustomIndicatorScript({
    compiled: compileResult.state.compiled,
    input: { bars },
  });

  assert.equal(first.outputs.CACHE_MUTATION_OUT?.[0], SAMPLE_BARS[0]!.close);
  assert.equal(second.outputs.CACHE_MUTATION_OUT?.[0], 123.45);
  assert.equal(second.runtimeStats?.fromCache, false);
});

test('runtime cache isolates render metadata for identical formula source', () => {
  const source = 'CACHE_STYLE_OUT: C;';
  const red = compileCustomIndicatorDefinition({
    name: 'CACHE_STYLE_RED',
    source,
    parameters: [],
    outputs: [
      { key: 'CACHE_STYLE_OUT', title: 'Red', directives: ['COLORRED'] },
    ],
  });
  const green = compileCustomIndicatorDefinition({
    name: 'CACHE_STYLE_GREEN',
    source,
    parameters: [],
    outputs: [
      { key: 'CACHE_STYLE_OUT', title: 'Green', directives: ['COLORGREEN'] },
    ],
  });
  assert.equal(red.ok, true);
  assert.equal(green.ok, true);
  if (!red.ok || !green.ok) {
    return;
  }

  const redResult = executeCustomIndicatorScript({
    compiled: red.compiled,
    input: { bars: SAMPLE_BARS },
  });
  const greenResult = executeCustomIndicatorScript({
    compiled: green.compiled,
    input: { bars: SAMPLE_BARS },
  });

  assert.notEqual(
    redResult.renderInstructions[0]?.style.color,
    greenResult.renderInstructions[0]?.style.color,
  );
  assert.equal(greenResult.runtimeStats?.fromCache, false);
});

test('caller execution limits cannot raise the runtime bar ceiling', () => {
  const compileResult = compileCustomIndicatorScript({
    source: 'LIMIT_OUT: C;',
    displayName: 'TEST_LIMIT_CEILING',
  });
  assert.ok(compileResult.state);
  const bars = new Array(CUSTOM_INDICATOR_RUNTIME_LIMITS.barsMax + 1).fill({
    time: 1,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  });
  const execution = executeCustomIndicatorScript({
    compiled: compileResult.state.compiled,
    input: {
      bars,
      executionLimits: {
        maxBars: CUSTOM_INDICATOR_RUNTIME_LIMITS.barsMax + 1,
      },
    },
  });

  assert.equal(execution.ok, false);
  assert.equal(execution.errors[0]?.code, 'BAR_COUNT_EXCEEDED');
});
