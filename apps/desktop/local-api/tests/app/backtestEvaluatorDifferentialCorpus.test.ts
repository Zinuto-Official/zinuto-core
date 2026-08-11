// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compileCustomIndicatorScript,
  executeCustomIndicatorScript,
} from '../../src/application/customIndicatorRuntimeService.js';
import { deriveBacktestSignals } from '../../src/application/backtest/signalSemantics.js';
import { parseIndicatorScript } from '../../src/application/customIndicatorEngine/parser/index.js';
import { extractScriptParametersFromProgram } from '../../src/application/customIndicatorEngine/indicator/sourceMetadata.js';
import { BACKTEST_EVALUATOR_SEMANTICS_VERSION } from '../../src/application/backtest/nativeDifferentialParity.js';

type Corpus = {
  schemaVersion: number;
  semanticsVersion: string;
  cases: Array<{
    id: string;
    category: string;
    source: string;
    bars: Array<{
      ts: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }>;
};

const localApiDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const coreRoot = path.resolve(localApiDir, '..', '..', '..');
const engineDir = path.join(coreRoot, 'apps/desktop/backtest-engine');
const enginePath = path.join(
  engineDir,
  'target/debug',
  process.platform === 'win32'
    ? 'open-trading-practice-backtest-engine.exe'
    : 'open-trading-practice-backtest-engine',
);
const corpus = JSON.parse(
  readFileSync(
    path.join(coreRoot, 'contracts/backtest-evaluator-semantics.v1.json'),
    'utf8',
  ),
) as Corpus;

test('versioned native and TypeScript evaluator corpus has zero signal differences', () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.semanticsVersion, BACKTEST_EVALUATOR_SEMANTICS_VERSION);
  assert.deepEqual(
    new Set(corpus.cases.map((item) => item.category)),
    new Set(['non-finite', 'functions', 'dynamic-period', 'seeded-random']),
  );
  execFileSync('cargo', ['build', '--quiet'], {
    cwd: engineDir,
    stdio: 'pipe',
  });

  for (const fixture of corpus.cases) {
    const compiledResult = compileCustomIndicatorScript({
      source: fixture.source,
      parameterInputs: {},
      displayName: fixture.id,
    });
    assert.deepEqual(compiledResult.compileErrors, [], fixture.id);
    assert.ok(compiledResult.state, fixture.id);
    const compiled = compiledResult.state.compiled;
    const parsed = parseIndicatorScript(compiled.definition.source);
    const extracted = extractScriptParametersFromProgram(
      parsed.program,
      compiled.definition.parameters,
    );
    const plan = {
      version: 1,
      semanticsVersion: corpus.semanticsVersion,
      program: extracted.executableProgram,
      parameterOverrides: compiled.parameterDefaults,
      outputKeys: ['BUY', 'SELL', 'SHORT', 'COVER'],
    };
    const tsExecution = executeCustomIndicatorScript({
      compiled,
      input: {
        bars: fixture.bars.map((bar) => ({ ...bar, time: bar.ts })),
        parameterOverrides: {},
      },
    });
    assert.equal(tsExecution.ok, true, fixture.id);
    const expected = deriveBacktestSignals(tsExecution.outputs, fixture.bars.length);
    const native = spawnSync(enginePath, ['--signal-plan'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: path.join(engineDir, 'target/debug/deps'),
        LD_LIBRARY_PATH: path.join(engineDir, 'target/debug/deps'),
      },
      input: JSON.stringify({
        semanticsVersion: corpus.semanticsVersion,
        plan,
        bars: fixture.bars,
      }),
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(native.status, 0, `${fixture.id}: ${native.stderr}`);
    const actual = JSON.parse(native.stdout) as {
      semanticsVersion: string;
      signals: unknown;
      conflicts: unknown;
    };
    assert.equal(actual.semanticsVersion, corpus.semanticsVersion, fixture.id);
    assert.deepEqual(actual.signals, expected.signals, fixture.id);
    assert.deepEqual(actual.conflicts, expected.conflicts, fixture.id);
  }
});
