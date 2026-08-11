// SPDX-License-Identifier: GPL-3.0-only

type DateBucketLike = {
  date: string;
};

export const toYearFromDateKey = (dateKey: string): number | null => {
  const maybeYear = Number(String(dateKey || "").slice(0, 4));
  return Number.isFinite(maybeYear) && maybeYear >= 1900 && maybeYear <= 2200
    ? maybeYear
    : null;
};

const toMonthFromDateKey = (dateKey: string): number | null => {
  const maybeMonth = Number(String(dateKey || "").slice(5, 7));
  return Number.isFinite(maybeMonth) && maybeMonth >= 1 && maybeMonth <= 12
    ? maybeMonth
    : null;
};

export const buildVisibleMonthNumbersForYear = (
  dayBuckets: readonly DateBucketLike[],
  year: number,
): number[] => {
  let startMonth = 13;
  let endMonth = 0;

  dayBuckets.forEach((item) => {
    if (toYearFromDateKey(item.date) !== year) {
      return;
    }
    const month = toMonthFromDateKey(item.date);
    if (month === null) {
      return;
    }
    if (month < startMonth) {
      startMonth = month;
    }
    if (month > endMonth) {
      endMonth = month;
    }
  });

  if (endMonth < startMonth) {
    return [];
  }

  return Array.from(
    { length: endMonth - startMonth + 1 },
    (_, index) => startMonth + index,
  );
};
