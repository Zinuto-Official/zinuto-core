// SPDX-License-Identifier: GPL-3.0-only

import { performance } from 'node:perf_hooks';
import {
  executeSessionAction as executeSessionActionCore,
  getSessionRuntimeDelta as getSessionRuntimeDeltaCore,
  getSessionOrderQuote as getSessionOrderQuoteCore,
  placeOrder as placeOrderCore,
} from './core.js';
import { ensureReplaySessionDataGrant } from '../trainingDataAccessService.js';

export const executeSessionAction: typeof executeSessionActionCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return executeSessionActionCore(sessionId, ...args);
};

export const executeSessionActionWithRuntimeDelta = async (
  sessionId: Parameters<typeof executeSessionActionCore>[0],
  payload: Parameters<typeof executeSessionActionCore>[1],
  fillCursor?: string | null,
) => {
  const accessStartedAtMs = performance.now();
  await ensureReplaySessionDataGrant(sessionId);
  const accessEndedAtMs = performance.now();
  const actionStartedAtMs = performance.now();
  const result = await executeSessionActionCore(sessionId, payload);
  const actionEndedAtMs = performance.now();
  const deltaStartedAtMs = performance.now();
  const runtimeDelta = await getSessionRuntimeDeltaCore(
    sessionId,
    result,
    fillCursor,
  );
  const deltaEndedAtMs = performance.now();
  return {
    result,
    runtimeDelta,
    timings: {
      accessMs: accessEndedAtMs - accessStartedAtMs,
      actionMs: actionEndedAtMs - actionStartedAtMs,
      deltaMs: deltaEndedAtMs - deltaStartedAtMs,
    },
  };
};

export const placeOrder: typeof placeOrderCore = async (sessionId, ...args) => {
  await ensureReplaySessionDataGrant(sessionId);
  return placeOrderCore(sessionId, ...args);
};

export const getSessionOrderQuote: typeof getSessionOrderQuoteCore = async (
  sessionId,
  ...args
) => {
  await ensureReplaySessionDataGrant(sessionId);
  return getSessionOrderQuoteCore(sessionId, ...args);
};
