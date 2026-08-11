// SPDX-License-Identifier: GPL-3.0-only

import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { formatMessage, type AppLocale } from '@zinuto/shared/i18n';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { FontSizePreset } from '@/frontend-kernel/typography';

type CsvFieldLabelKey = 'date' | 'time' | 'open' | 'high' | 'low' | 'close' | 'volume';

const storageBytesFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatStorageBytes = (value: number): string => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = size;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${storageBytesFormatter.format(current)} ${units[index]}`;
};

export const getFontSizePresetOptions = (
  language: AppLocale,
): Array<{ key: FontSizePreset; label: string }> => [
  {
    key: 'SMALL',
    label: formatMessage(language, 'settings.general.fontSize.option.small'),
  },
  {
    key: 'STANDARD',
    label: formatMessage(language, 'settings.general.fontSize.option.standard'),
  },
  {
    key: 'LARGE',
    label: formatMessage(language, 'settings.general.fontSize.option.large'),
  },
];

export const getCsvFieldLabels = (): Record<CsvFieldLabelKey, string> => ({
  date: tt('appText.dateTime'),
  time: tt('appText.time2'),
  open: tt('appText.open'),
  close: tt('appText.close'),
  high: tt('appText.high'),
  low: tt('appText.low'),
  volume: tt('appText.volume')
});

export const getBaseTimeframeLabels = (): Record<BaseTimeframe, string> => ({
  '1m': tt('uiConfig.displayPeriod.1m'),
  '5m': tt('uiConfig.displayPeriod.5m'),
  '1h': tt('uiConfig.displayPeriod.1h'),
  '1d': tt('uiConfig.displayPeriod.1d')
});

export const REPLAY_NOTE_DEFAULT_TITLE_PREFIX = (): string => tt('appText.zinutoInd');
