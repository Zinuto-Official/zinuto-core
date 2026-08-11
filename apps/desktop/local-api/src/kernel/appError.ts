// SPDX-License-Identifier: GPL-3.0-only

type AppErrorArgs = Record<string, string | number | boolean | null>;
type AppErrorStage =
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'STARTUP'
  | 'IMPORT'
  | 'ACQUISITION'
  | 'SYNC_CHECK'
  | 'SYSTEM';

class AppError extends Error {
  code: string;
  status: number;
  stage: AppErrorStage;
  args?: AppErrorArgs;

  constructor(code: string, status = 400, args?: AppErrorArgs, stage?: AppErrorStage) {
    super(code);
    this.name = 'AppError';
    this.code = String(code || '').trim() || 'UNKNOWN_APP_ERROR';
    this.status = Number.isFinite(status) ? Math.max(400, Math.floor(status)) : 400;
    this.stage = stage ?? resolveAppErrorStage(this.code, this.status);
    this.args = args;
  }
}

const resolveAppErrorStage = (code: string, status: number): AppErrorStage => {
  if (status === 401 || code.includes('UNAUTHORIZED')) {
    return 'AUTHORIZATION';
  }
  if (code.includes('STARTUP')) {
    return 'STARTUP';
  }
  if (code.includes('SYNC') || code.includes('INCREMENTAL')) {
    return 'SYNC_CHECK';
  }
  if (code.includes('IMPORT') || code.startsWith('CSV_')) {
    return 'IMPORT';
  }
  if (
    code.includes('ACQUISITION') ||
    code.startsWith('AKSHARE_') ||
    code.startsWith('CCXT_')
  ) {
    return 'ACQUISITION';
  }
  if (
    code.includes('INVALID') ||
    code.includes('REQUIRED') ||
    code.includes('MISSING') ||
    code.includes('RANGE_LIMIT') ||
    code.endsWith('_LIMIT_EXCEEDED')
  ) {
    return 'VALIDATION';
  }
  return 'SYSTEM';
};

export const appError = (code: string, args?: AppErrorArgs, status = 400): AppError =>
new AppError(code, status, args);

export const dynamicAppError = (code: string, args?: AppErrorArgs, status = 400): AppError =>
new AppError(code, status, args);

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;
