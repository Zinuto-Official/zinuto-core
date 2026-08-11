// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopBacktestSignalRules } from '@zinuto/shared/contracts-desktop/api';
import { appError } from '../../kernel/appError.js';

type SignalDirection = 'buy' | 'sell' | 'short' | 'cover';
type DirectionSignalRule = NonNullable<DesktopBacktestSignalRules[SignalDirection]>;
type SignalRuleCondition = DirectionSignalRule['conditions'][number];
type SignalRuleOperand = SignalRuleCondition['left'];

const OUTPUT_IDENTIFIER_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const SIGNAL_OUTPUT_BY_DIRECTION: Record<SignalDirection, string> = {
  buy: 'BUY',
  sell: 'SELL',
  short: 'SHORT',
  cover: 'COVER',
};

const PRICE_IDENTIFIER_BY_FIELD: Record<Extract<SignalRuleOperand, { kind: 'PRICE' }>['field'], string> = {
  CLOSE: 'CLOSE',
  OPEN: 'OPEN',
  HIGH: 'HIGH',
  LOW: 'LOW',
  VOLUME: 'VOL',
};

const renderConstant = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw appError('BACKTEST_SIGNAL_RULE_INVALID_CONSTANT');
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  const raw = String(value);
  if (!/[eE]/.test(raw)) {
    return raw;
  }
  return value.toFixed(12).replace(/\.?0+$/, '') || '0';
};

const renderOutputIdentifier = (key: string): string => {
  const normalized = key.trim();
  if (!OUTPUT_IDENTIFIER_PATTERN.test(normalized)) {
    throw appError('BACKTEST_SIGNAL_RULE_INVALID_OUTPUT');
  }
  return normalized;
};

const renderOperand = (operand: SignalRuleOperand): string => {
  switch (operand.kind) {
    case 'OUTPUT':
      return renderOutputIdentifier(operand.key);
    case 'PRICE':
      return PRICE_IDENTIFIER_BY_FIELD[operand.field];
    case 'CONSTANT':
      return renderConstant(operand.value);
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
};

const renderCondition = (condition: SignalRuleCondition): string => {
  const left = renderOperand(condition.left);
  const right = renderOperand(condition.right);
  switch (condition.operator) {
    case 'CROSS_ABOVE':
      return `CROSS(${left}, ${right})`;
    case 'CROSS_BELOW':
      return `CROSSDOWN(${left}, ${right})`;
    case 'GREATER':
      return `(${left} > ${right})`;
    case 'GREATER_EQUAL':
      return `(${left} >= ${right})`;
    case 'LESS':
      return `(${left} < ${right})`;
    case 'LESS_EQUAL':
      return `(${left} <= ${right})`;
    case 'EQUAL':
      return `(${left} = ${right})`;
    default: {
      const exhaustive: never = condition.operator;
      return exhaustive;
    }
  }
};

const renderDirectionRule = (rule: DirectionSignalRule): string | null => {
  if (!rule.conditions.length) {
    return null;
  }
  return rule.conditions.map(renderCondition).join(` ${rule.connector} `);
};

export const composeBacktestStrategySource = (
  indicatorSource: string,
  signalRules?: DesktopBacktestSignalRules,
): string => {
  if (!signalRules) {
    return indicatorSource;
  }

  const signalLines = (Object.keys(SIGNAL_OUTPUT_BY_DIRECTION) as SignalDirection[]).flatMap(
    (direction) => {
      const rule = signalRules[direction];
      if (!rule) {
        return [];
      }
      const expression = renderDirectionRule(rule);
      if (!expression) {
        return [];
      }
      return [`${SIGNAL_OUTPUT_BY_DIRECTION[direction]}: ${expression};`];
    },
  );

  if (!signalLines.length) {
    return indicatorSource;
  }

  const baseSource = indicatorSource.trimEnd();
  if (!baseSource) {
    return signalLines.join('\n');
  }
  // The indicator's final statement may omit its trailing semicolon (EOF terminates it
  // when the indicator stands alone). Once we append signal statements, that prior
  // statement needs an explicit terminator, so insert one when it is missing. A
  // redundant empty statement is tolerated by the grammar, keeping this safe even when
  // the source ends with a trailing block comment after its semicolon.
  const separator = baseSource.endsWith(';') ? '\n' : '\n;\n';
  return `${baseSource}${separator}${signalLines.join('\n')}`;
};
