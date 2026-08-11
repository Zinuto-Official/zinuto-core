// SPDX-License-Identifier: GPL-3.0-only

import {
  formatCustomIndicatorEngineTemplate,
  getCustomIndicatorEngineCopy,
  type AppUiLanguage,
  type CustomIndicatorEngineCopy,
} from '../indicator/customIndicatorEngineText.js';
import { IndicatorParserError } from './types.js';
import type { ParserToken, ParserTokenType } from './types.js';

const isWhitespace = (char: string): boolean => /\s/.test(char);
const isDigit = (char: string): boolean => /[0-9]/.test(char);
const isIdentifierStart = (char: string): boolean => /[\p{L}_]/u.test(char);
const isIdentifierPart = (char: string): boolean => /[\p{L}\p{N}_]/u.test(char);

type Cursor = {
  index: number;
  line: number;
  column: number;
};

const createCursor = (): Cursor => ({
  index: 0,
  line: 1,
  column: 1
});

const advance = (source: string, cursor: Cursor): string => {
  const char = source[cursor.index] ?? '';
  cursor.index += 1;
  if (char === '\n') {
    cursor.line += 1;
    cursor.column = 1;
  } else {
    cursor.column += 1;
  }
  return char;
};

const peek = (source: string, cursor: Cursor, offset = 0): string => source[cursor.index + offset] ?? '';

const pushToken = (
  tokens: ParserToken[],
  type: ParserTokenType,
  value: string,
  line: number,
  column: number
) => {
  tokens.push({ type, value, line, column });
};

const readComment = (
  source: string,
  cursor: Cursor,
  copy: CustomIndicatorEngineCopy,
) => {
  const startLine = cursor.line;
  const startColumn = cursor.column;
  advance(source, cursor); // consume {
  while (cursor.index < source.length) {
    const char = peek(source, cursor);
    if (char === '}') {
      advance(source, cursor);
      return;
    }
    advance(source, cursor);
  }
  throw new IndicatorParserError(
    'UNTERMINATED_COMMENT',
    copy.parser.unterminatedCommentBlock,
    startLine,
    startColumn
  );
};

const readNumber = (
  source: string,
  cursor: Cursor,
  copy: CustomIndicatorEngineCopy,
): ParserToken => {
  const line = cursor.line;
  const column = cursor.column;
  const startIndex = cursor.index;
  let dotCount = 0;
  let digitCount = 0;

  while (cursor.index < source.length) {
    const char = peek(source, cursor);
    if (isDigit(char)) {
      digitCount += 1;
      advance(source, cursor);
      continue;
    }
    if (char === '.') {
      dotCount += 1;
      advance(source, cursor);
      continue;
    }
    break;
  }

  const raw = source.slice(startIndex, cursor.index);
  if (!raw || dotCount > 1 || digitCount === 0) {
    throw new IndicatorParserError(
      'INVALID_NUMBER',
      formatCustomIndicatorEngineTemplate(
        copy.parser.invalidNumberLiteral,
        [raw || '-'],
      ),
      line,
      column,
    );
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new IndicatorParserError(
      'INVALID_NUMBER',
      formatCustomIndicatorEngineTemplate(
        copy.parser.invalidNumberLiteral,
        [raw],
      ),
      line,
      column,
    );
  }

  return {
    type: 'number',
    value: raw,
    line,
    column
  };
};

const readIdentifierOrKeyword = (source: string, cursor: Cursor): ParserToken => {
  const line = cursor.line;
  const column = cursor.column;
  const start = cursor.index;

  advance(source, cursor);
  while (cursor.index < source.length && isIdentifierPart(peek(source, cursor))) {
    advance(source, cursor);
  }

  const raw = source.slice(start, cursor.index);
  const upper = raw.toUpperCase();
  if (upper === 'AND') {
    return { type: 'and', value: raw, line, column };
  }
  if (upper === 'OR') {
    return { type: 'or', value: raw, line, column };
  }
  if (upper === 'NOT') {
    return { type: 'not', value: raw, line, column };
  }

  return {
    type: 'identifier',
    value: raw,
    line,
    column
  };
};

const readStringLiteral = (
  source: string,
  cursor: Cursor,
  copy: CustomIndicatorEngineCopy,
): ParserToken => {
  const quote = peek(source, cursor);
  const line = cursor.line;
  const column = cursor.column;
  advance(source, cursor); // consume quote

  let value = '';
  while (cursor.index < source.length) {
    const char = peek(source, cursor);
    if (!char) {
      break;
    }
    if (char === quote) {
      advance(source, cursor);
      return {
        type: 'string',
        value,
        line,
        column
      };
    }
    if (char === '\\') {
      advance(source, cursor); // consume slash
      const escaped = peek(source, cursor);
      if (!escaped) {
        break;
      }
      switch (escaped) {
        case 'n':
          value += '\n';
          break;
        case 'r':
          value += '\r';
          break;
        case 't':
          value += '\t';
          break;
        case '\\':
          value += '\\';
          break;
        case '\'':
          value += '\'';
          break;
        case '"':
          value += '"';
          break;
        default:
          value += escaped;
          break;
      }
      advance(source, cursor);
      continue;
    }
    value += char;
    advance(source, cursor);
  }

  throw new IndicatorParserError(
    'UNTERMINATED_STRING',
    copy.parser.unterminatedStringLiteral,
    line,
    column
  );
};

export const tokenizeIndicatorScript = (
  source: string,
  language: AppUiLanguage,
): ParserToken[] => {
  const tokens: ParserToken[] = [];
  const cursor = createCursor();
  const copy = getCustomIndicatorEngineCopy(language);

  while (cursor.index < source.length) {
    const char = peek(source, cursor);

    if (!char) {
      break;
    }

    if (isWhitespace(char)) {
      advance(source, cursor);
      continue;
    }

    if (char === '{') {
      readComment(source, cursor, copy);
      continue;
    }

    const line = cursor.line;
    const column = cursor.column;

    if (isDigit(char) || (char === '.' && isDigit(peek(source, cursor, 1)))) {
      tokens.push(readNumber(source, cursor, copy));
      continue;
    }

    if (isIdentifierStart(char)) {
      tokens.push(readIdentifierOrKeyword(source, cursor));
      continue;
    }

    if (char === '\'' || char === '"') {
      tokens.push(readStringLiteral(source, cursor, copy));
      continue;
    }

    if (char === ':') {
      if (peek(source, cursor, 1) === '=') {
        advance(source, cursor);
        advance(source, cursor);
        pushToken(tokens, 'assign', ':=', line, column);
        continue;
      }
      advance(source, cursor);
      pushToken(tokens, 'output', ':', line, column);
      continue;
    }

    if (char === ';') {
      advance(source, cursor);
      pushToken(tokens, 'semicolon', ';', line, column);
      continue;
    }

    if (char === ',') {
      advance(source, cursor);
      pushToken(tokens, 'comma', ',', line, column);
      continue;
    }

    if (char === '(') {
      advance(source, cursor);
      pushToken(tokens, 'lparen', '(', line, column);
      continue;
    }

    if (char === ')') {
      advance(source, cursor);
      pushToken(tokens, 'rparen', ')', line, column);
      continue;
    }

    if (char === '+') {
      advance(source, cursor);
      pushToken(tokens, 'plus', '+', line, column);
      continue;
    }

    if (char === '-') {
      advance(source, cursor);
      pushToken(tokens, 'minus', '-', line, column);
      continue;
    }

    if (char === '*') {
      advance(source, cursor);
      pushToken(tokens, 'star', '*', line, column);
      continue;
    }

    if (char === '/') {
      advance(source, cursor);
      pushToken(tokens, 'slash', '/', line, column);
      continue;
    }

    if (char === '%') {
      advance(source, cursor);
      pushToken(tokens, 'percent', '%', line, column);
      continue;
    }

    if (char === '^') {
      advance(source, cursor);
      pushToken(tokens, 'caret', '^', line, column);
      continue;
    }

    if (char === '>' && peek(source, cursor, 1) === '=') {
      advance(source, cursor);
      advance(source, cursor);
      pushToken(tokens, 'gte', '>=', line, column);
      continue;
    }

    if (char === '<' && peek(source, cursor, 1) === '=') {
      advance(source, cursor);
      advance(source, cursor);
      pushToken(tokens, 'lte', '<=', line, column);
      continue;
    }

    if (char === '=') {
      advance(source, cursor);
      pushToken(tokens, 'eq', '=', line, column);
      continue;
    }

    if (char === '<' && peek(source, cursor, 1) === '>') {
      advance(source, cursor);
      advance(source, cursor);
      pushToken(tokens, 'neq', '<>', line, column);
      continue;
    }

    if (char === '>') {
      advance(source, cursor);
      pushToken(tokens, 'gt', '>', line, column);
      continue;
    }

    if (char === '<') {
      advance(source, cursor);
      pushToken(tokens, 'lt', '<', line, column);
      continue;
    }

    throw new IndicatorParserError(
      'UNEXPECTED_CHAR',
      formatCustomIndicatorEngineTemplate(
        copy.parser.unexpectedCharacter,
        [char],
      ),
      line,
      column,
    );
  }

  tokens.push({
    type: 'eof',
    value: '',
    line: cursor.line,
    column: cursor.column
  });

  return tokens;
};
