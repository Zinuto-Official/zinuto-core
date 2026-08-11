// SPDX-License-Identifier: GPL-3.0-only

import type { CsvFieldMapping } from '../../domain/dataSource/csvFieldMappingTypes.js';

const DEFAULT_FIELD_MAPPING: CsvFieldMapping = {
  timestampMode: 'SINGLE',
  date: 'date',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: ''
};

const normalizeStoredFieldMapping = (value: unknown): CsvFieldMapping => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_FIELD_MAPPING };
  }
  const source = value as Record<string, unknown>;
  const timestampModeRaw = typeof source.timestampMode === 'string' ? source.timestampMode.trim().toUpperCase() : '';
  const timestampMode: CsvFieldMapping['timestampMode'] = timestampModeRaw === 'SPLIT' ? 'SPLIT' : 'SINGLE';
  const date = typeof source.date === 'string' ? source.date.trim() : '';
  const time = typeof source.time === 'string' ? source.time.trim() : '';
  const open = typeof source.open === 'string' ? source.open.trim() : '';
  const high = typeof source.high === 'string' ? source.high.trim() : '';
  const low = typeof source.low === 'string' ? source.low.trim() : '';
  const close = typeof source.close === 'string' ? source.close.trim() : '';
  const volume = typeof source.volume === 'string' ? source.volume.trim() : '';
  if (!date || (timestampMode === 'SPLIT' && !time) || !open || !high || !low || !close) {
    return { ...DEFAULT_FIELD_MAPPING };
  }
  return { timestampMode, date, time: timestampMode === 'SPLIT' ? time : '', open, high, low, close, volume };
};

export const parseStoredFieldMappingJson = (rawJson: string | null | undefined): CsvFieldMapping => {
  const raw = typeof rawJson === 'string' ? rawJson.trim() : '';
  if (!raw) {
    return { ...DEFAULT_FIELD_MAPPING };
  }
  try {
    return normalizeStoredFieldMapping(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FIELD_MAPPING };
  }
};
