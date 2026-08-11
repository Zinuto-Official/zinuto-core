// SPDX-License-Identifier: GPL-3.0-only

import {
  formatCustomIndicatorEngineTemplate,
  APP_UI_BASE_LANGUAGE,
  getCustomIndicatorEngineCopy,
  type CustomIndicatorEngineCopy,
  type AppUiLanguage,
} from '../indicator/customIndicatorEngineText.js';
import type {
  AstAssignmentExpression,
  AstBinaryExpression,
  AstBinaryOperator,
  AstExpression,
  AstFunctionCall,
  AstProgram,
  AstUnaryExpression,
  AstUnaryOperator
} from '../ast/types.js';
import { IndicatorParserError } from './types.js';
import type { ParsedIndicatorScript, ParserErrorCode, ParserToken, ParserTokenType } from './types.js';
import { tokenizeIndicatorScript } from './tokenizer.js';

class IndicatorScriptParser {
  private readonly tokens: ParserToken[];
  private readonly copy: CustomIndicatorEngineCopy;
  private index = 0;
  private autoOutputCounter = 1;
  private readonly declaredTargets = new Set<string>();

  constructor(tokens: ParserToken[], copy: CustomIndicatorEngineCopy) {
    this.tokens = tokens;
    this.copy = copy;
  }

  parseProgram(): AstProgram {
    const body: AstAssignmentExpression[] = [];

    while (!this.isAtEnd()) {
      if (this.match('semicolon')) {
        continue;
      }
      body.push(this.parseStatement());
    }

    return {
      type: 'Program',
      body
    };
  }

  private parseStatement(): AstAssignmentExpression {
    const firstToken = this.expect(
      'identifier',
      this.copy.parser.expectedStatementIdentifier,
    );

    if (this.check('eq')) {
      throw this.createError(
        this.peek(),
        'EXPECTED_TOKEN',
        this.copy.parser.expectedAssignmentOperator,
      );
    }

    if (this.check('assign') || this.check('output')) {
      const operatorToken = this.consume();
      if (!operatorToken || (operatorToken.type !== 'assign' && operatorToken.type !== 'output')) {
        throw this.createError(
          operatorToken,
          'EXPECTED_TOKEN',
          this.copy.parser.expectedAssignmentOperator,
        );
      }

      const expression = this.parseExpression();
      const directives: string[] = [];
      if (operatorToken.type === 'output') {
        while (this.match('comma')) {
          const directiveToken = this.expect(
            'identifier',
            this.copy.parser.expectedPlotDirective,
          );
          const directive = directiveToken.value.trim().toUpperCase();
          if (!directive) {
            throw this.createError(
              directiveToken,
              'EXPECTED_TOKEN',
              this.copy.parser.plotDirectiveCannotBeEmpty,
            );
          }
          directives.push(directive);
        }
      }
      this.expect(
        'semicolon',
        this.copy.parser.expectedSemicolonAfterStatement,
      );

      const assignment: AstAssignmentExpression = {
        type: 'AssignmentExpression',
        target: firstToken.value,
        operator: operatorToken.type === 'assign' ? ':=' : ':',
        expression,
        directives: directives.length ? directives : undefined,
        line: firstToken.line,
        column: firstToken.column
      };
      this.trackDeclaredTarget(assignment.target);
      return assignment;
    }

    if (!this.check('lparen')) {
      throw this.createError(
        this.peek(),
        'EXPECTED_TOKEN',
        this.copy.parser.expectedStatementOrFunctionCall,
      );
    }

    const expression = this.parseFunctionCallWithCallee(firstToken);
    const directives: string[] = [];
    while (this.match('comma')) {
      const directiveToken = this.expect(
        'identifier',
        this.copy.parser.expectedPlotDirective,
      );
      const directive = directiveToken.value.trim().toUpperCase();
      if (!directive) {
        throw this.createError(
          directiveToken,
          'EXPECTED_TOKEN',
          this.copy.parser.plotDirectiveCannotBeEmpty,
        );
      }
      directives.push(directive);
    }
    this.expect(
      'semicolon',
      this.copy.parser.expectedSemicolonAfterStatement,
    );

    const autoTarget = this.allocateAutoOutputTarget();
    return {
      type: 'AssignmentExpression',
      target: autoTarget,
      operator: ':',
      expression,
      directives: directives.length ? directives : undefined,
      line: firstToken.line,
      column: firstToken.column
    };
  }

  private parseExpression(): AstExpression {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): AstExpression {
    let expression = this.parseLogicalAnd();

    while (this.match('or')) {
      const operator = this.previous();
      const right = this.parseLogicalAnd();
      expression = this.buildBinaryExpression(expression, right, this.mapBinaryOperator(operator));
    }

    return expression;
  }

  private parseLogicalAnd(): AstExpression {
    let expression = this.parseComparison();

    while (this.match('and')) {
      const operator = this.previous();
      const right = this.parseComparison();
      expression = this.buildBinaryExpression(expression, right, this.mapBinaryOperator(operator));
    }

    return expression;
  }

  private parseComparison(): AstExpression {
    let expression = this.parseAddSub();

    while (this.match('gt', 'gte', 'lt', 'lte', 'eq', 'neq')) {
      const operator = this.previous();
      const right = this.parseAddSub();
      expression = this.buildBinaryExpression(expression, right, this.mapBinaryOperator(operator));
    }

    return expression;
  }

  private parseAddSub(): AstExpression {
    let expression = this.parseMulDiv();

    while (this.match('plus', 'minus')) {
      const operator = this.previous();
      const right = this.parseMulDiv();
      expression = this.buildBinaryExpression(expression, right, this.mapBinaryOperator(operator));
    }

    return expression;
  }

  private parseMulDiv(): AstExpression {
    let expression = this.parsePow();

    while (this.match('star', 'slash', 'percent')) {
      const operator = this.previous();
      const right = this.parsePow();
      expression = this.buildBinaryExpression(expression, right, this.mapBinaryOperator(operator));
    }

    return expression;
  }

  // '^' should bind tighter than * / % and be right-associative.
  private parsePow(): AstExpression {
    const left = this.parseUnary();
    if (!this.match('caret')) {
      return left;
    }
    const operator = this.previous();
    const right = this.parsePow();
    return this.buildBinaryExpression(left, right, this.mapBinaryOperator(operator));
  }

  private parseUnary(): AstExpression {
    if (this.match('plus', 'minus')) {
      const token = this.previous();
      const operator = this.mapUnaryOperator(token);
      const argument = this.parseUnary();
      const expression: AstUnaryExpression = {
        type: 'UnaryExpression',
        operator,
        argument
      };
      return expression;
    }

    if (this.match('not')) {
      const token = this.previous();
      const normalized = token.value.trim().toUpperCase();
      if (normalized === 'NOT' && this.check('lparen')) {
        return this.parseFunctionCallWithCallee(token);
      }
      const argument = this.parseUnary();
      const expression: AstUnaryExpression = {
        type: 'UnaryExpression',
        operator: this.mapUnaryOperator(token),
        argument
      };
      return expression;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): AstExpression {
    if (this.match('number')) {
      const token = this.previous();
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw this.createError(
          token,
          'INVALID_NUMBER',
          formatCustomIndicatorEngineTemplate(
            this.copy.parser.invalidNumberLiteral,
            [token.value],
          ),
        );
      }
      return {
        type: 'NumberLiteral',
        value
      };
    }

    if (this.match('string')) {
      const token = this.previous();
      return {
        type: 'StringLiteral',
        value: token.value
      };
    }

    if (this.match('identifier', 'and', 'or')) {
      const token = this.previous();
      if (this.check('lparen')) {
        return this.parseFunctionCallWithCallee(token);
      }

      if (token.type !== 'identifier') {
        throw this.createError(
          token,
          'EXPECTED_TOKEN',
          formatCustomIndicatorEngineTemplate(
            this.copy.parser.functionCallMustIncludeArguments,
            [token.value],
          ),
        );
      }

      return {
        type: 'Identifier',
        name: token.value
      };
    }

    if (this.match('lparen')) {
      const expression = this.parseExpression();
      this.expect(
        'rparen',
        this.copy.parser.expectedGroupedExpressionClose,
      );
      return expression;
    }

    const token = this.peek();
    throw this.createError(
      token,
      token?.type === 'eof' ? 'UNEXPECTED_EOF' : 'UNEXPECTED_TOKEN',
      this.copy.parser.expectedExpression,
    );
  }

  private buildBinaryExpression(
    left: AstExpression,
    right: AstExpression,
    operator: AstBinaryOperator
  ): AstBinaryExpression {
    return {
      type: 'BinaryExpression',
      operator,
      left,
      right
    };
  }

  private mapBinaryOperator(token: ParserToken): AstBinaryOperator {
    switch (token.type) {
      case 'plus':
        return '+';
      case 'minus':
        return '-';
      case 'star':
        return '*';
      case 'slash':
        return '/';
      case 'percent':
        return '%';
      case 'caret':
        return '^';
      case 'gt':
        return '>';
      case 'gte':
        return '>=';
      case 'lt':
        return '<';
      case 'lte':
        return '<=';
      case 'eq':
        return '==';
      case 'neq':
        return '!=';
      case 'and':
        return 'AND';
      case 'or':
        return 'OR';
      default:
        throw this.createError(
          token,
          'UNEXPECTED_TOKEN',
          formatCustomIndicatorEngineTemplate(
            this.copy.parser.unsupportedBinaryOperatorToken,
            [token.type],
          ),
        );
    }
  }

  private mapUnaryOperator(token: ParserToken): AstUnaryOperator {
    switch (token.type) {
      case 'plus':
        return '+';
      case 'minus':
        return '-';
      case 'not':
        return 'NOT';
      default:
        throw this.createError(
          token,
          'UNEXPECTED_TOKEN',
          formatCustomIndicatorEngineTemplate(
            this.copy.parser.unsupportedUnaryOperatorToken,
            [token.type],
          ),
        );
    }
  }

  private match(...types: ParserTokenType[]): boolean {
    if (!types.some((type) => this.check(type))) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private expect(type: ParserTokenType, message: string): ParserToken {
    if (this.check(type)) {
      return this.consume() as ParserToken;
    }
    throw this.createError(this.peek(), this.peek()?.type === 'eof' ? 'UNEXPECTED_EOF' : 'EXPECTED_TOKEN', message);
  }

  private check(type: ParserTokenType): boolean {
    if (this.isAtEnd()) {
      return type === 'eof';
    }
    return this.peek().type === type;
  }

  private consume(): ParserToken | null {
    if (this.isAtEnd()) {
      return null;
    }
    const token = this.tokens[this.index] ?? null;
    this.index += 1;
    return token;
  }

  private previous(): ParserToken {
    return this.tokens[this.index - 1] as ParserToken;
  }

  private peek(): ParserToken {
    return this.tokens[this.index] as ParserToken;
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'eof';
  }

  private parseFunctionCallWithCallee(calleeToken: ParserToken): AstFunctionCall {
    this.expect(
      'lparen',
      this.copy.parser.expectedOpenParenAfterFunctionName,
    );
    const args: AstExpression[] = [];
    if (!this.check('rparen')) {
      do {
        args.push(this.parseExpression());
      } while (this.match('comma'));
    }
    this.expect(
      'rparen',
      this.copy.parser.expectedCloseParenAfterFunctionArguments,
    );
    return {
      type: 'FunctionCall',
      callee: calleeToken.value,
      args,
      line: calleeToken.line,
      column: calleeToken.column
    };
  }

  private trackDeclaredTarget(target: string) {
    const normalized = target.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    this.declaredTargets.add(normalized);
  }

  private allocateAutoOutputTarget(): string {
    let candidate = `LINE${String(this.autoOutputCounter)}`;
    while (this.declaredTargets.has(candidate)) {
      this.autoOutputCounter += 1;
      candidate = `LINE${String(this.autoOutputCounter)}`;
    }
    this.autoOutputCounter += 1;
    this.declaredTargets.add(candidate);
    return candidate;
  }

  private createError(token: ParserToken | null | undefined, code: ParserErrorCode, message: string) {
    const safe = token ?? this.tokens[this.tokens.length - 1];
    return new IndicatorParserError(code, message, safe.line, safe.column);
  }
}

export const parseIndicatorScript = (
  source: string,
  language: AppUiLanguage = APP_UI_BASE_LANGUAGE,
): ParsedIndicatorScript => {
  const copy = getCustomIndicatorEngineCopy(language);
  const tokens = tokenizeIndicatorScript(source, language);
  const parser = new IndicatorScriptParser(tokens, copy);
  const program = parser.parseProgram();
  return {
    tokens,
    program
  };
};
