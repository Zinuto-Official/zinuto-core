// SPDX-License-Identifier: GPL-3.0-only

import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import {
  getCustomIndicatorEngineCopy,
} from '@/domains/custom-indicator/indicator/customIndicatorEngineText';
import {
  APP_UI_BASE_LANGUAGE,
  type AppUiLanguage,
} from '@/ui/config/uiConfig';
import type {
  CompiledIndicator,
  IndicatorCompileError,
  IndicatorParameterDefinition,
  IndicatorRuntimeError
} from '@/domains/custom-indicator/indicator/types';

const ERROR_CODE_TEXT_REGEX = /^[A-Z][A-Z0-9_]+$/;

const normalizeKey = (value: string): string => value.trim().toUpperCase();

const getSourceLineByNumber = (source: string, line: number): string => {
  if (!Number.isFinite(line) || line < 1) {
    return '';
  }
  const lines = String(source ?? '').split('\n');
  const hit = lines[line - 1] ?? '';
  return hit.trim();
};

export type ScriptIssueItem = {
  id: string;
  message: string;
  line?: number;
  column?: number;
};

export type CompiledScriptState = {
  templateName: string;
  displayName: string;
  compiled: CompiledIndicator;
  calcParams: number[];
};

export type CompileStateResult = {
  state: CompiledScriptState | null;
  stale?: boolean;
  compileErrors: IndicatorCompileError[];
  compileMessages: string[];
  parameterWarnings: string[];
  nextParameterDefinitions: IndicatorParameterDefinition[];
  nextParameterInputs: Record<string, string>;
};

export type CustomIndicatorErrorContext =
  | 'catalog-load'
  | 'market-load'
  | 'profile-read'
  | 'profile-write'
  | 'profile-save'
  | 'script-run'
  | 'script-save'
  | 'script-apply'
  | 'script-restore'
  | 'ai-reference-load'
  | 'ai-reference-viewer'
  | 'clipboard-copy';

const resolveContextFallbackMessage = (
  context: CustomIndicatorErrorContext | undefined,
  fallback?: string
): string => {
  if (fallback?.trim()) {
    return fallback.trim();
  }
  switch (context) {
    case 'catalog-load':
      return tt('appText.initialization');
    case 'market-load':
      return tt('appText.loading');
    case 'profile-read':
      return tt('appText.loading');
    case 'profile-write':
    case 'profile-save':
    case 'script-save':
      return tt('appText.request');
    case 'script-apply':
    case 'script-restore':
    case 'ai-reference-load':
    case 'ai-reference-viewer':
      return tt('appText.loading');
    case 'clipboard-copy':
      return tt('appText.request');
    case 'script-run':
    default:
      return tt('appText.customIndicatorExecution');
  }
};

const resolveCodeMessage = (
  code: string,
  context: CustomIndicatorErrorContext | undefined
): string => {
  switch (code) {
    case 'PROFILE_SOURCE_EMPTY':
    case 'INDICATOR_SOURCE_EMPTY':
      return tt('appText.result');
    case 'PROFILE_SOURCE_TOO_LONG':
    case 'INDICATOR_SOURCE_TOO_LONG':
    case 'TOKEN_COUNT_EXCEEDED':
    case 'STATEMENT_COUNT_EXCEEDED':
      return tt('appText.scriptParsing');
    case 'SCRIPT_STATEMENT_LIMIT_EXCEEDED':
    case 'STATEMENT_LIMIT_EXCEEDED':
      return tt('appText.scriptStatementCountExceedsRuntimeLimit');
    case 'PROFILE_NAME_EMPTY':
    case 'INDICATOR_NAME_EMPTY':
    case 'PARAMETER_NAME_EMPTY':
    case 'PARAMETER_DUPLICATE':
    case 'PARAMETER_DEFAULT_INVALID':
    case 'PARAMETER_COUNT_EXCEEDED':
    case 'PARAM_OVERRIDE_INVALID':
      return tt('appText.request');
    case 'PROFILE_STORAGE_LIMIT_EXCEEDED':
      return tt('appText.request');
    case 'PROFILE_STORAGE_READ_FAILED':
      return tt('appText.loading');
    case 'PROFILE_STORAGE_WRITE_FAILED':
    case 'STORAGE_WRITE_FAILED':
      return tt('appText.request');
    case 'PROFILE_SAVE_FAILED':
      return tt('appText.request');
    case 'WORKER_TIMEOUT':
    case 'WORKER_CRASH':
    case 'WORKER_DISPOSED':
    case 'WORKER_EXECUTION_FAILED':
      return tt('appText.customIndicatorExecution');
    case 'BAR_COUNT_EXCEEDED':
    case 'OUTPUT_MISSING':
    case 'RUNTIME_UNKNOWN':
    case 'RUNTIME_ERROR':
    case 'EXECUTION_FAILED':
    case 'CUSTOM_INDICATOR_EXECUTION_FAILED':
      return tt('appText.customIndicatorExecution');
    default:
      if (code.startsWith('WORKER_')) {
        return tt('appText.customIndicatorExecution');
      }
      if (
        code.startsWith('RUNTIME_') ||
        code.endsWith('_FAILED') ||
        code.endsWith('_ERROR')
      ) {
        return resolveContextFallbackMessage(context);
      }
      if (
        code.startsWith('PARSER_') ||
        code.startsWith('INDICATOR_') ||
        code.startsWith('PARAMETER_')
      ) {
        return tt('appText.scriptParsing');
      }
      return '';
  }
};

export const resolveCustomIndicatorProductMessage = (
  error: unknown,
  options: {
    context?: CustomIndicatorErrorContext;
    fallback?: string;
  } = {}
): string => {
  const code = resolveDisplayErrorCode(error, '');
  if (code === 'PROFILE_STORAGE_LIMIT_EXCEEDED' && error && typeof error === 'object') {
    const explicitMessage = String((error as { message?: unknown }).message ?? '').trim();
    if (explicitMessage) {
      return explicitMessage;
    }
  }
  const mapped = code ? resolveCodeMessage(code, options.context) : '';
  if (mapped) {
    return mapped;
  }
  return resolveContextFallbackMessage(options.context, options.fallback);
};

export const normalizeParameterDefinitions = (
  definitions: IndicatorParameterDefinition[]
): IndicatorParameterDefinition[] =>
  definitions.map((parameter) => ({
    ...parameter,
    name: normalizeKey(parameter.name)
  }));

export const normalizeErrorCodeText = (value: unknown): string => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) {
    return '';
  }
  return ERROR_CODE_TEXT_REGEX.test(normalized) ? normalized : '';
};

export const resolveDisplayErrorCode = (error: unknown, fallbackCode: string): string => {
  if (error && typeof error === 'object') {
    const maybeCode = normalizeErrorCodeText((error as { code?: unknown }).code);
    if (maybeCode) {
      return maybeCode;
    }
  }
  if (error instanceof Error) {
    const codeFromMessage = normalizeErrorCodeText(error.message);
    if (codeFromMessage) {
      return codeFromMessage;
    }
  }
  return normalizeErrorCodeText(fallbackCode) || 'UNKNOWN_ERROR';
};

export const buildParameterInputMap = (
  definitions: IndicatorParameterDefinition[],
  source?: Record<string, string>
): Record<string, string> => {
  const normalizedSource = Object.entries(source ?? {}).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const normalizedKey = normalizeKey(rawKey);
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = String(rawValue);
    return acc;
  }, {});
  return definitions.reduce<Record<string, string>>((acc, parameter) => {
    const key = normalizeKey(parameter.name);
    if (normalizedSource[key] !== undefined) {
      acc[key] = String(normalizedSource[key]);
      return acc;
    }
    acc[key] = String(parameter.defaultValue);
    return acc;
  }, {});
};

export const resolveSourceCursorOffset = (source: string, line: number, column: number): number => {
  const normalizedLine = Math.max(1, Math.floor(line));
  const normalizedColumn = Math.max(1, Math.floor(column));
  const lines = String(source ?? '').split('\n');
  const cappedLineIndex = Math.min(Math.max(0, normalizedLine - 1), Math.max(0, lines.length - 1));
  let offset = 0;
  for (let index = 0; index < cappedLineIndex; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  const lineText = lines[cappedLineIndex] ?? '';
  const columnOffset = Math.min(lineText.length, Math.max(0, normalizedColumn - 1));
  return offset + columnOffset;
};

export const formatCompileErrorMessage = (
  error: IndicatorCompileError,
  source: string,
  language: AppUiLanguage = APP_UI_BASE_LANGUAGE,
): ScriptIssueItem => {
  const engineCopy = getCustomIndicatorEngineCopy(language);
  const line = Number.isFinite(error.line) ? Number(error.line) : undefined;
  const column = Number.isFinite(error.column) ? Number(error.column) : undefined;
  const code = normalizeErrorCodeText(error.code) || 'COMPILE_ERROR';
  const dotSeparator = ` ${engineCopy.format.bulletSeparator} `;
  const position = line
    ? `${engineCopy.format.linePrefix}${String(line)}${
        column ? ` ${engineCopy.format.columnPrefix}${String(column)}` : ''
      }`
    : '';
  const excerpt = line ? getSourceLineByNumber(source, line) : '';
  const baseMessage = error.message.trim() || resolveCustomIndicatorProductMessage(error, {
    context: 'script-run'
  });
  const message = `${position ? `${position}${dotSeparator}` : ''}${baseMessage}${excerpt ? ` ${engineCopy.format.snippetSeparator} ${excerpt}` : ''}`;
  return {
    id: `${code}:${String(line ?? 0)}:${String(column ?? 0)}:${message}`,
    message,
    line,
    column
  };
};

export const formatRuntimeErrorMessage = (error: IndicatorRuntimeError, source: string): ScriptIssueItem => {
  const line = Number.isFinite(error.line) ? Number(error.line) : undefined;
  const column = Number.isFinite(error.column) ? Number(error.column) : undefined;
  const code = normalizeErrorCodeText(error.code) || 'RUNTIME_ERROR';
  const dotSeparator = ` ${tt('appText.message0664')} `;
  const statementMeta =
    typeof error.statementIndex === 'number' && error.statementIndex > 0
      ? `#${String(error.statementIndex)} ${error.statementTarget ?? ''} ${error.statementOperator ?? ''}`.trim()
      : '';
  const position = line ? `L${String(line)}${column ? ` C${String(column)}` : ''}` : '';
  const excerpt = line ? getSourceLineByNumber(source, line) : '';
  const parts = [
    `${position ? `${position}${dotSeparator}` : ''}${resolveCustomIndicatorProductMessage(error, {
      context: 'script-run'
    })}`
  ];
  if (statementMeta) {
    parts.push(`[${statementMeta}]`);
  }
  if (excerpt) {
    parts.push(`| ${excerpt}`);
  }
  const message = parts.join(' ');
  return {
    id: `${code}:${String(line ?? 0)}:${String(column ?? 0)}:${String(error.statementIndex ?? 0)}:${message}`,
    message,
    line,
    column
  };
};

export const issueArraysEqual = (left: ScriptIssueItem[], right: ScriptIssueItem[]): boolean =>
  left.length === right.length &&
  left.every(
    (value, index) =>
      value.message === right[index]?.message &&
      value.line === right[index]?.line &&
      value.column === right[index]?.column
  );
