// SPDX-License-Identifier: GPL-3.0-only

export const MARKET_PRICE_STORAGE_SQL = 'DOUBLE';
export const MARKET_VOLUME_STORAGE_SQL = 'DOUBLE';

const qualify = (columnName: string, qualifier?: string): string =>
  qualifier ? `${qualifier}.${columnName}` : columnName;

export const buildOhlcvSelectDoubleSql = (qualifier?: string): string =>
  [
    `CAST(${qualify('open', qualifier)} AS DOUBLE) AS open`,
    `CAST(${qualify('high', qualifier)} AS DOUBLE) AS high`,
    `CAST(${qualify('low', qualifier)} AS DOUBLE) AS low`,
    `CAST(${qualify('close', qualifier)} AS DOUBLE) AS close`,
    `CAST(${qualify('volume', qualifier)} AS DOUBLE) AS volume`,
  ].join(',\n            ');

export const buildOhlcvStorageCastSql = (qualifier?: string): string =>
  [
    `CAST(${qualify('open', qualifier)} AS ${MARKET_PRICE_STORAGE_SQL}) AS open`,
    `CAST(${qualify('high', qualifier)} AS ${MARKET_PRICE_STORAGE_SQL}) AS high`,
    `CAST(${qualify('low', qualifier)} AS ${MARKET_PRICE_STORAGE_SQL}) AS low`,
    `CAST(${qualify('close', qualifier)} AS ${MARKET_PRICE_STORAGE_SQL}) AS close`,
    `CAST(${qualify('volume', qualifier)} AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume`,
  ].join(',\n       ');
