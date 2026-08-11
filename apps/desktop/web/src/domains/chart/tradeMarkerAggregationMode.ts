// SPDX-License-Identifier: GPL-3.0-only

const normalizePeriodKey = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

export const shouldAggregateTradeMarkersByPeriod = (
  displayPeriod: unknown,
  baseDisplayPeriod: unknown,
): boolean => {
  const normalizedDisplayPeriod = normalizePeriodKey(displayPeriod);
  const normalizedBaseDisplayPeriod = normalizePeriodKey(baseDisplayPeriod);
  return Boolean(
    normalizedDisplayPeriod &&
      normalizedBaseDisplayPeriod &&
      normalizedDisplayPeriod !== normalizedBaseDisplayPeriod,
  );
};
