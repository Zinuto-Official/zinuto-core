// SPDX-License-Identifier: GPL-3.0-only

export type OperatorSummary = {
  operatorKind: "HUMAN";
  operationMode: null;
  operatorSource: null;
  clientLabel: string | null;
  modelLabel: string | null;
  runId: string | null;
  actionCount: number;
  orderCount: number;
  decisionCount: number;
  decisionSecondsUsed: number;
  nonTradeActionCount: number;
  errorActionCount: number;
  forcedLiquidationCount: number;
};
