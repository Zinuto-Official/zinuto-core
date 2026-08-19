// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { appError } from '../../kernel/appError.js';

export const parseSymbolFromFileName = (fileName: string): string => {
  const stem = path.basename(fileName, path.extname(fileName)).trim();
  const separatorIndex = stem.lastIndexOf('·');
  const symbol = (
    separatorIndex > 0 ? stem.slice(separatorIndex + 1) : stem
  ).trim().toUpperCase();
  if (!symbol || symbol.length > INPUT_LIMITS.symbolChars) {
    throw appError('CSV_FILENAME_INVALID', { fileName });
  }
  return symbol;
};

export const normalizeSourceName = (rawName: string): string => {
  const normalized = String(rawName ?? '').trim();
  if (normalized) {
    if (normalized.length > INPUT_LIMITS.generalNameChars) {
      throw appError('LOCAL_DATA_SOURCE_NAME_TOO_LONG', { max: INPUT_LIMITS.generalNameChars });
    }
    return normalized;
  }
  return `source-${Date.now()}`;
};
