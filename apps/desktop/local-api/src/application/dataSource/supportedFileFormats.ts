// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { convertNativeImportPathToWirePath } from '../../domain/dataSource/importPathSemantics.js';

export type SupportedImportFileFormat = 'csv' | 'json' | 'parquet' | 'xlsx';
export type SupportedBaseTimeframe = '1m' | '5m' | '1h' | '1d';

const SUPPORTED_IMPORT_FILE_EXTENSION_LIST: SupportedImportFileFormat[] = ['csv', 'json', 'parquet', 'xlsx'];
const SUPPORTED_IMPORT_FILE_EXTENSIONS = new Set<string>(SUPPORTED_IMPORT_FILE_EXTENSION_LIST);

const normalizePathLike = (input: string): string =>
  convertNativeImportPathToWirePath(String(input || '').trim()).toLowerCase();

export const resolveSupportedImportFileFormat = (filePathLike: string): SupportedImportFileFormat | null => {
  const ext = path.extname(String(filePathLike || '')).trim().replace(/^\./, '').toLowerCase();
  if (!ext) {
    return null;
  }
  return SUPPORTED_IMPORT_FILE_EXTENSIONS.has(ext) ? (ext as SupportedImportFileFormat) : null;
};

export const isSupportedImportFileName = (filePathLike: string): boolean => Boolean(resolveSupportedImportFileFormat(filePathLike));

const toHintTimeframe = (hint: string): SupportedBaseTimeframe | null => {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === '1m' || normalized === '1min' || normalized === '1minute' || normalized === 'm1') {
    return '1m';
  }
  if (normalized === '5m' || normalized === '5min' || normalized === '5minute' || normalized === 'm5') {
    return '5m';
  }
  if (normalized === '1h' || normalized === '60m' || normalized === '60min' || normalized === 'h1' || normalized === '1hour') {
    return '1h';
  }
  if (normalized === '1d' || normalized === '1day' || normalized === 'day' || normalized === 'daily' || normalized === 'd1') {
    return '1d';
  }
  return null;
};

export const resolveTimeframeFromPathHints = (filePathLike: string): SupportedBaseTimeframe | null => {
  const normalized = normalizePathLike(filePathLike);
  if (!normalized) {
    return null;
  }
  const hintMatches = normalized.match(/(?:^|[^a-z0-9])((?:1m|5m|1h|1d|1min|5min|60m|60min|1hour|day|daily|1day|m1|m5|h1|d1))(?:$|[^a-z0-9])/g);
  if (!hintMatches?.length) {
    return null;
  }
  for (const raw of hintMatches) {
    const candidate = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    const resolved = toHintTimeframe(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};
