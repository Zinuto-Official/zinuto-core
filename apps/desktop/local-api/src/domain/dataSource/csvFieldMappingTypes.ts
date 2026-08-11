// SPDX-License-Identifier: GPL-3.0-only

export type CsvTimestampMode = 'SINGLE' | 'SPLIT';

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
