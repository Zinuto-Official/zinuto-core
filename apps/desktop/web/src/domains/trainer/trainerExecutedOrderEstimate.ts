// SPDX-License-Identifier: GPL-3.0-only

import type {
  TrainerActionSide as Side,
  TrainerSessionRuntimeResult as SessionRuntimeResult,
} from '@/domains/trainer/trainerActionOrchestratorTypes';

const toFiniteRuntimeNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const resolveExecutedOrderEstimate = (
  result: SessionRuntimeResult,
  side: Side,
): { qty: number; cashEffect: number } | null => {
  const runtimeDelta = toRecord(result.runtimeDelta);
  const actionState = toRecord(runtimeDelta?.actionState);
  const runConclusion = toRecord(actionState?.runConclusion);
  const execution =
    toRecord(actionState?.execution) ??
    toRecord(runConclusion?.lastActionExecution);
  if (!execution || execution.side !== side || execution.statusCode !== 'FILLED') {
    return null;
  }
  const qty = Math.max(0, toFiniteRuntimeNumber(execution.qty));
  if (qty <= 0) {
    return null;
  }
  return {
    qty,
    cashEffect: toFiniteRuntimeNumber(execution.cashEffect),
  };
};
