// SPDX-License-Identifier: GPL-3.0-only

import type { OperatorSummary } from "@zinuto/shared/operatorSummary";

export const buildHumanOperatorSummary = (): OperatorSummary => ({
  operatorKind: "HUMAN",
  operationMode: null,
  operatorSource: null,
  clientLabel: null,
  modelLabel: null,
  runId: null,
  actionCount: 0,
  orderCount: 0,
  decisionCount: 0,
  decisionSecondsUsed: 0,
  nonTradeActionCount: 0,
  errorActionCount: 0,
  forcedLiquidationCount: 0,
});

const normalizeCount = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const normalizeSeconds = (value: unknown): number =>
  Math.max(0, Number(value) || 0);

export const normalizeOperatorSummary = (value: unknown): OperatorSummary => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildHumanOperatorSummary();
  }
  const source = value as Partial<OperatorSummary>;
  return {
    ...buildHumanOperatorSummary(),
    actionCount: normalizeCount(source.actionCount),
    orderCount: normalizeCount(source.orderCount),
    decisionCount: normalizeCount(source.decisionCount),
    decisionSecondsUsed: normalizeSeconds(source.decisionSecondsUsed),
    nonTradeActionCount: normalizeCount(source.nonTradeActionCount),
    errorActionCount: normalizeCount(source.errorActionCount),
    forcedLiquidationCount: normalizeCount(source.forcedLiquidationCount),
  };
};

export const resolveArchivedOperatorSummary = (): OperatorSummary =>
  buildHumanOperatorSummary();
