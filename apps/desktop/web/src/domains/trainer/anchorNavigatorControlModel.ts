// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { frontendRuntimeLimits } from "@/frontend-kernel/runtimeLimits";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import type {
  FreeReplayAdvancePeriod,
  FreeReplayStartPointOverviewRange,
} from "@/domains/training/types";
import { formatMessage } from "@zinuto/shared/i18n";
import { formatMarketDateByLocale, toMarketDateKey } from "@zinuto/shared/marketTime";
import type { AnchorOverviewBar, AnchorOverviewWindow, WeekStartMode } from "@/domains/trainer/anchorNavigatorControlTypes";

export const START_POINT_OVERVIEW_PAGE_LIMIT =
  DESKTOP_API_LIMITS.startPointOverviewBarsMax;
export const MAP_MAX_BARS = 8_000;
export const ANCHOR_OVERVIEW_CACHE_MAX_ENTRIES =
  frontendRuntimeLimits.anchorOverviewCacheEntries;
export const MAP_SVG_WIDTH = 860;
export const MAP_SVG_HEIGHT = 340;
export const STATUS_TREND_SVG_HEIGHT = 84;
// Keep a tiny horizontal gutter to avoid stroke clipping at the panel border.
export const MAP_SVG_PADDING_X = 2;
export const MAP_SVG_PADDING_Y = 20;
export const WEEKDAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAY_SUNDAY_UTC_MS = Date.UTC(2024, 0, 7);
export const WEEK_START_UTC_DAY: Record<WeekStartMode, number> = {
  MONDAY: 1,
  SATURDAY: 6,
  SUNDAY: 0,
};

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const toDateKey = (ts: string): string => {
  return toMarketDateKey(ts);
};

export const toMonthFromDateKey = (dateKey: string): number | null => {
  const maybeMonth = Number(String(dateKey || "").slice(5, 7));
  return Number.isFinite(maybeMonth) && maybeMonth >= 1 && maybeMonth <= 12
    ? maybeMonth
    : null;
};

export const formatDateByLanguage = (value: string, language: UiLanguage): string => {
  const formatted = formatMarketDateByLocale(value, language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (!formatted) {
    return value;
  }
  return formatted;
};

export const formatTimeByLanguage = (value: string, language: UiLanguage): string => {
  const formatted = formatMarketDateByLocale(value, language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatted || String(value || "").slice(11, 16);
};

export const formatDayListDateByLanguage = (
  value: string,
  language: UiLanguage,
): string => {
  const formatted = formatMarketDateByLocale(value, language, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  return formatted || formatDateByLanguage(value, language);
};

export const formatAnchorTs = (
  value: string | null,
  language: UiLanguage,
  baseTimeframe: FreeReplayAdvancePeriod,
): string => {
  if (!value) {
    return formatMessage(language, "common.placeholder.none");
  }
  const isDateOnlyPeriod =
    baseTimeframe === "1d" ||
    baseTimeframe === "1w" ||
    baseTimeframe === "1month" ||
    baseTimeframe === "1year";
  const formatted = formatMarketDateByLocale(value, language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(isDateOnlyPeriod
      ? {}
      : {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
  });
  return formatted || value;
};

export const sampleBarsForMap = (
  bars: AnchorOverviewBar[],
  maxCount: number,
): AnchorOverviewBar[] => {
  if (bars.length <= maxCount) {
    return bars;
  }
  const sampled: AnchorOverviewBar[] = [];
  const span = bars.length - 1;
  const step = span / Math.max(1, maxCount - 1);
  let previous = -1;
  for (let index = 0; index < maxCount; index += 1) {
    const approx = Math.round(index * step);
    const next = Math.max(previous + 1, Math.min(span, approx));
    sampled.push(bars[next]);
    previous = next;
  }
  return sampled;
};

export const normalizeAnchorOverviewRangeBars = (
  range: FreeReplayStartPointOverviewRange,
  fallbackOffset = 0,
): AnchorOverviewBar[] => {
  const resolvedOffset = Math.max(
    0,
    Math.floor(Number(range.offset) || fallbackOffset),
  );
  const displayPeriod = range.displayPeriod ?? range.effectiveTimeframe;
  return (range.bars ?? [])
    .map((item, localIndex) => {
      const close = Number(item.close);
      if (!Number.isFinite(close)) {
        return null;
      }
      const fallbackIndex = resolvedOffset + localIndex;
      const rawStartNumber = Number(item.startRawIndex);
      const rawEndNumber = Number(item.endRawIndex);
      const trainingStartNumber = Number(item.startTrainingIndex);
      const trainingEndNumber = Number(item.endTrainingIndex);
      const startRawIndex = Math.max(
        0,
        Math.floor(
          Number.isFinite(rawStartNumber) ? rawStartNumber : fallbackIndex,
        ),
      );
      const endRawIndex = Math.max(
        startRawIndex,
        Math.floor(Number.isFinite(rawEndNumber) ? rawEndNumber : startRawIndex),
      );
      const startTrainingIndex = Math.max(
        0,
        Math.floor(
          Number.isFinite(trainingStartNumber)
            ? trainingStartNumber
            : fallbackIndex,
        ),
      );
      const endTrainingIndex = Math.max(
        startTrainingIndex,
        Math.floor(
          Number.isFinite(trainingEndNumber)
            ? trainingEndNumber
            : startTrainingIndex,
        ),
      );
      return {
        index: fallbackIndex,
        applyAnchorIndex: Math.max(
          0,
          Math.floor(Number(item.endRawIndex) || endRawIndex),
        ),
        displayPeriod,
        startRawIndex,
        endRawIndex,
        startTrainingIndex,
        endTrainingIndex,
        ts: String(item.ts ?? ""),
        startTs: String(item.startTs || item.ts || ""),
        endTs: String(item.endTs || item.ts || ""),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close,
        volume: Number(item.volume),
      };
    })
    .filter((item): item is AnchorOverviewBar => Boolean(item));
};

export const buildAnchorOverviewWindow = (
  range: FreeReplayStartPointOverviewRange,
  fallbackOffset: number,
  hintedTotal = 0,
): AnchorOverviewWindow => {
  const bars = normalizeAnchorOverviewRangeBars(range, fallbackOffset);
  const total = Math.max(
    0,
    Math.floor(Number(range.total) || 0),
    Math.floor(Number(hintedTotal) || 0),
  );
  const trainingTotal = Math.max(
    0,
    Math.floor(Number(range.trainingTotal) || Number(range.total) || 0),
  );
  const expectedTotal = bars.length
    ? Math.max(total, bars[bars.length - 1].index + 1)
    : total;
  return {
    offset: bars.length > 0 ? bars[0].index : Math.max(0, fallbackOffset),
    total: expectedTotal,
    trainingTotal,
    displayPeriod: range.displayPeriod ?? range.effectiveTimeframe,
    bars,
    isComplete:
      bars.length > 0 && bars[0].index === 0 && bars.length >= expectedTotal,
  };
};

export const formatMonthShortByLanguage = (
  year: number,
  month: number,
  language: UiLanguage,
): string => {
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (!Number.isFinite(date.getTime())) {
    return String(month);
  }
  try {
    return new Intl.DateTimeFormat(language, {
      month: "short",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return String(month);
  }
};

export const buildMapPath = (
  bars: AnchorOverviewBar[],
  width: number,
  height: number,
): {
  linePath: string;
  areaPath: string;
} => {
  if (!bars.length) {
    return { linePath: "", areaPath: "" };
  }
  const closes = bars
    .map((item) => Number(item.close))
    .filter((value) => Number.isFinite(value));
  if (!closes.length) {
    return { linePath: "", areaPath: "" };
  }
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const valueRange = Math.max(1e-6, maxClose - minClose);
  const innerWidth = Math.max(1, width - MAP_SVG_PADDING_X * 2);
  const innerHeight = Math.max(1, height - MAP_SVG_PADDING_Y * 2);
  const points = bars.map((item, index) => {
    const close = Number.isFinite(item.close) ? Number(item.close) : minClose;
    const x =
      MAP_SVG_PADDING_X +
      (bars.length <= 1
        ? innerWidth * 0.5
        : (index / (bars.length - 1)) * innerWidth);
    const y =
      MAP_SVG_PADDING_Y + ((maxClose - close) / valueRange) * innerHeight;
    return { x, y };
  });
  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const baselineY = height - MAP_SVG_PADDING_Y;
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `M${first.x.toFixed(2)} ${baselineY.toFixed(2)} ${points
    .map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
  return { linePath, areaPath };
};

export const readCachedOverviewWindow = (
  cache: Map<string, AnchorOverviewWindow>,
  key: string,
): AnchorOverviewWindow | null => {
  const cached = cache.get(key) ?? null;
  if (!cached) {
    return null;
  }
  cache.delete(key);
  cache.set(key, cached);
  return cached;
};

export const writeCachedOverviewWindow = (
  cache: Map<string, AnchorOverviewWindow>,
  key: string,
  value: AnchorOverviewWindow,
): void => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > ANCHOR_OVERVIEW_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) {
      break;
    }
    cache.delete(oldest);
  }
};
