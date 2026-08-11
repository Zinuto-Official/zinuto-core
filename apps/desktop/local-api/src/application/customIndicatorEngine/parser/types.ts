// SPDX-License-Identifier: GPL-3.0-only

import type { AstProgram } from '../ast/types.js';

export type ParserTokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'percent'
  | 'caret'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'semicolon'
  | 'assign'
  | 'output'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'and'
  | 'or'
  | 'not'
  | 'eof';

export type ParserToken = {
  type: ParserTokenType;
  value: string;
  line: number;
  column: number;
};

export type ParserErrorCode =
  | 'UNEXPECTED_CHAR'
  | 'UNTERMINATED_COMMENT'
  | 'UNTERMINATED_STRING'
  | 'INVALID_NUMBER'
  | 'UNEXPECTED_TOKEN'
  | 'EXPECTED_TOKEN'
  | 'UNEXPECTED_EOF'
  | 'INVALID_STATEMENT';

export class IndicatorParserError extends Error {
  readonly code: ParserErrorCode;
  readonly line: number;
  readonly column: number;

  constructor(code: ParserErrorCode, message: string, line: number, column: number) {
    super(message);
    this.name = 'IndicatorParserError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

export type ParsedIndicatorScript = {
  program: AstProgram;
  tokens: ParserToken[];
};
