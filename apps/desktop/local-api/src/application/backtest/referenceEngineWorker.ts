// SPDX-License-Identifier: GPL-3.0-only

import { parentPort } from 'node:worker_threads';
import {
  compileBacktestReferenceStrategy,
  runBacktestReferenceInstrumentFromBars,
  type CompiledBacktestStrategy,
} from './referenceEngineRunner.js';
import type { OhlcvBar } from '../../domain/models.js';
import type {
  BacktestConfig,
  BacktestInstrumentCandidate,
} from './types.js';

type WorkerInitMessage = {
  type: 'INIT';
  strategySource: string;
  parameterInputs?: Record<string, string>;
  displayName: string;
};

type WorkerTaskMessage = {
  type: 'TASK';
  taskId: number;
  config: BacktestConfig;
  instrument: BacktestInstrumentCandidate;
  bars: OhlcvBar[];
};

type WorkerMessage = WorkerInitMessage | WorkerTaskMessage;

let compiled: CompiledBacktestStrategy | null = null;

const post = (message: Record<string, unknown>): void => {
  parentPort?.postMessage(message);
};

parentPort?.on('message', (message: WorkerMessage) => {
  try {
    if (message.type === 'INIT') {
      compiled = compileBacktestReferenceStrategy({
        source: message.strategySource,
        parameterInputs: message.parameterInputs,
        displayName: message.displayName,
      });
      post({ type: 'READY' });
      return;
    }
    if (message.type !== 'TASK') {
      return;
    }
    if (!compiled) {
      throw new Error('BACKTEST_WORKER_NOT_INITIALIZED');
    }
    const outcome = runBacktestReferenceInstrumentFromBars({
      config: message.config,
      instrument: message.instrument,
      bars: message.bars,
      compiled,
    });
    post({
      type: 'RESULT',
      taskId: message.taskId,
      outcome,
    });
  } catch (error) {
    post({
      type: 'ERROR',
      taskId: message.type === 'TASK' ? message.taskId : null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
