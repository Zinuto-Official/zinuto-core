// SPDX-License-Identifier: GPL-3.0-only

import type {
  Bar,
  BooleanSeries,
  NumericSeries,
  RuntimeSeriesContext,
} from '../runtime/index.js';

export type AstNumberLiteral = {
  type: 'NumberLiteral';
  value: number;
};

export type AstStringLiteral = {
  type: 'StringLiteral';
  value: string;
};

export type AstIdentifier = {
  type: 'Identifier';
  name: string;
};

export type AstBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | '!='
  | 'AND'
  | 'OR';

export type AstBinaryExpression = {
  type: 'BinaryExpression';
  operator: AstBinaryOperator;
  left: AstExpression;
  right: AstExpression;
};

export type AstUnaryOperator = '+' | '-' | 'NOT';

export type AstUnaryExpression = {
  type: 'UnaryExpression';
  operator: AstUnaryOperator;
  argument: AstExpression;
};

export type AstFunctionCall = {
  type: 'FunctionCall';
  callee: string;
  args: AstExpression[];
  line?: number;
  column?: number;
};

export type AstAssignmentOperator = ':=' | ':';

export type AstAssignmentExpression = {
  type: 'AssignmentExpression';
  target: string;
  operator: AstAssignmentOperator;
  expression: AstExpression;
  directives?: string[];
  line?: number;
  column?: number;
};

export type AstExpression =
  | AstNumberLiteral
  | AstStringLiteral
  | AstIdentifier
  | AstBinaryExpression
  | AstUnaryExpression
  | AstFunctionCall;

export type AstStatement = AstAssignmentExpression;

export type AstProgram = {
  type: 'Program';
  body: AstStatement[];
};

export type AstRuntimeValue = number | boolean | string | NumericSeries | BooleanSeries;

export type AstVariableTable = Record<string, AstRuntimeValue>;

export type AstExecutionLimits = {
  maxStatements: number;
  maxOperations: number;
};

export type AstExecutionContext = {
  bars: Bar[];
  variables?: AstVariableTable;
  limits?: Partial<AstExecutionLimits>;
};

export type AstExecutionStats = {
  statementsExecuted: number;
  operationsExecuted: number;
};

export type AstExecutionState = {
  runtimeSeries: RuntimeSeriesContext;
  variables: AstVariableTable;
  outputs: AstVariableTable;
  intermediateCache: AstVariableTable;
  limits: AstExecutionLimits;
  statementsExecuted: number;
  operationsExecuted: number;
};

type AstExecutionErrorCode =
  | 'STATEMENT_LIMIT_EXCEEDED'
  | 'OPERATION_LIMIT_EXCEEDED'
  | 'STATEMENT_EXECUTION_FAILED';

type AstExecutionErrorMeta = {
  statementIndex?: number;
  statementTarget?: string;
  statementOperator?: AstAssignmentOperator;
  statementLine?: number;
  statementColumn?: number;
  causeMessage?: string;
};

export class AstExecutionError extends Error {
  readonly code: AstExecutionErrorCode;
  readonly statementIndex?: number;
  readonly statementTarget?: string;
  readonly statementOperator?: AstAssignmentOperator;
  readonly statementLine?: number;
  readonly statementColumn?: number;
  readonly causeMessage?: string;

  constructor(code: AstExecutionErrorCode, message: string, meta: AstExecutionErrorMeta = {}) {
    super(message);
    this.name = 'AstExecutionError';
    this.code = code;
    this.statementIndex = meta.statementIndex;
    this.statementTarget = meta.statementTarget;
    this.statementOperator = meta.statementOperator;
    this.statementLine = meta.statementLine;
    this.statementColumn = meta.statementColumn;
    this.causeMessage = meta.causeMessage;
  }
}

export type AstExecutionResult = {
  outputs: AstVariableTable;
  variables: AstVariableTable;
  intermediateCache: AstVariableTable;
  state: AstExecutionState;
  stats: AstExecutionStats;
};
