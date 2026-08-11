// SPDX-License-Identifier: GPL-3.0-only

import colorCenterSource from '@/ui/theme/visual/colorCenter.json';
import type { ThemeModeToken } from '@/ui/theme/visual/types';

export type VisualColorCategory =
  | 'surfaces'
  | 'text'
  | 'actions'
  | 'status'
  | 'recognition'
  | 'brand'
  | 'icons'
  | 'price'
  | 'annotation'
  | 'noteColors'
  | 'common'
  | 'chart'
  | 'overlay'
  | 'indicator'
  | 'assets';

export type VisualColorCenterEntry = {
  id: string;
  category: VisualColorCategory;
  usage: string;
  dark: string;
  light: string;
};

const COLOR_CENTER = Object.freeze(
  colorCenterSource.map((entry) => Object.freeze({ ...entry })) as readonly VisualColorCenterEntry[]
);

const COLOR_CENTER_BY_ID = Object.freeze(
  Object.fromEntries(COLOR_CENTER.map((entry) => [entry.id, entry]))
) as Readonly<Record<string, VisualColorCenterEntry>>;

const normalizeHex = (value: string): string => {
  const normalized = value.trim().replace(/^#/, '');
  if (normalized.length === 3) {
    return normalized
      .split('')
      .map((segment) => `${segment}${segment}`)
      .join('');
  }
  return normalized;
};

const getVisualColorCenterEntry = (id: string): VisualColorCenterEntry => {
  const entry = COLOR_CENTER_BY_ID[id];
  if (!entry) {
    throw new Error(`Unknown visual color token: ${id}`);
  }
  return entry;
};

export const resolveVisualColorValue = (id: string, themeMode: ThemeModeToken): string => {
  const entry = getVisualColorCenterEntry(id);
  return themeMode === 'dark' ? entry.dark : entry.light;
};

export const hexToRgbChannels = (value: string): string => {
  const hex = normalizeHex(value);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`hexToRgbChannels expected a 6-digit hex color, received: ${value}`);
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
};

export const resolveVisualHexChannels = (id: string, themeMode: ThemeModeToken): string =>
  hexToRgbChannels(resolveVisualColorValue(id, themeMode));

export const toUpperHexDirective = (id: string): string => {
  const value = resolveVisualColorValue(id, 'light');
  if (!value.startsWith('#')) {
    throw new Error(`Color directive requires a hex value, received: ${value}`);
  }
  return `COLOR${normalizeHex(value).toUpperCase()}`;
};
