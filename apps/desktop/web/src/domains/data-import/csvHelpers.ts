// SPDX-License-Identifier: GPL-3.0-only

export type CsvTimestampMode = 'SINGLE' | 'SPLIT';
export type CsvFieldKey = 'date' | 'time' | 'open' | 'high' | 'low' | 'close' | 'volume';
export type CsvFieldMapping = {
  timestampMode: CsvTimestampMode;
  date: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type CsvBaseFieldKey = Exclude<CsvFieldKey, 'time'>;

export const CSV_FIELD_RENDER_ORDER: CsvBaseFieldKey[] = ['date', 'open', 'close', 'high', 'low', 'volume'];
const CSV_SPLIT_FIELD_RENDER_ORDER: CsvFieldKey[] = ['date', 'time', 'open', 'close', 'high', 'low', 'volume'];

export const resolveCsvFieldRenderOrder = (timestampMode: CsvTimestampMode): CsvFieldKey[] =>
  timestampMode === 'SPLIT' ? [...CSV_SPLIT_FIELD_RENDER_ORDER] : [...CSV_FIELD_RENDER_ORDER];

export const DEFAULT_CSV_FIELD_MAPPING: CsvFieldMapping = {
  timestampMode: 'SINGLE',
  date: 'date',
  time: '',
  open: 'open',
  close: 'close',
  high: 'high',
  low: 'low',
  volume: ''
};

export const normalizeCsvFieldMapping = (value: unknown): CsvFieldMapping | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const timestampModeRaw = String(source.timestampMode ?? '').trim().toUpperCase();
  const timestampMode: CsvTimestampMode = timestampModeRaw === 'SPLIT' ? 'SPLIT' : 'SINGLE';
  const next: CsvFieldMapping = {
    timestampMode,
    date: '',
    time: '',
    open: '',
    high: '',
    low: '',
    close: '',
    volume: ''
  };
  const activeFields = resolveCsvFieldRenderOrder(timestampMode);
  for (const field of activeFields) {
    const raw = typeof source[field] === 'string' ? source[field].trim() : '';
    next[field] = raw as CsvFieldMapping[typeof field];
  }
  if (timestampMode !== 'SPLIT') {
    next.time = '';
  }
  return next;
};
