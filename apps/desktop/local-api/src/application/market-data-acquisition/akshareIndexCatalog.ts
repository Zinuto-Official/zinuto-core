// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopAkshareAcquisitionInstrument } from '@zinuto/shared/contracts-desktop/api';

/**
 * Curated indexes accepted by the pinned AKShare `index_zh_a_hist` runtime.
 * The public symbol remains namespaced so imported index data cannot collide
 * with an A-share carrying the same six-digit code.
 */
export const AKSHARE_INDEX_ACQUISITION_INSTRUMENTS = [
  { symbol: 'INDEX-000001', name: '上证指数', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-000016', name: '上证50', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-000300', name: '沪深300', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-000688', name: '科创50', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-000852', name: '中证1000', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-000905', name: '中证500', exchangeId: 'SH', kind: 'INDEX' },
  { symbol: 'INDEX-399001', name: '深证成指', exchangeId: 'SZ', kind: 'INDEX' },
  { symbol: 'INDEX-399006', name: '创业板指', exchangeId: 'SZ', kind: 'INDEX' },
  { symbol: 'INDEX-399330', name: '深证100', exchangeId: 'SZ', kind: 'INDEX' },
  { symbol: 'INDEX-899050', name: '北证50', exchangeId: 'BJ', kind: 'INDEX' },
] as const satisfies readonly DesktopAkshareAcquisitionInstrument[];
