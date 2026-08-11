// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
  isBuiltInTradingMarketPresetId,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClass,
} from "./trading.js";
import type {
  TradingCalendarConfig,
  TradingCalendarWeekday,
} from "./tradingCalendar.js";

export type MarketPresetCalendarDefinition = {
  presetId: BuiltInTradingMarketPresetId;
  assetClass: TradingAssetClass;
  timeZone: string;
  calendar: TradingCalendarConfig;
};

const WEEKDAY_TRADING_DAYS: TradingCalendarWeekday[] = [1, 2, 3, 4, 5];
const FOREX_TRADING_DAYS: TradingCalendarWeekday[] = [7, 1, 2, 3, 4];
const ALL_TRADING_DAYS: TradingCalendarWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const DAY_MINUTES = 24 * 60;

const session = (
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  crossesMidnight = false,
): TradingCalendarConfig["sessions"][number] => ({
  startMinute: startHour * 60 + startMinute,
  endMinute: endHour * 60 + endMinute,
  crossesMidnight,
});

const allDaySession = (): TradingCalendarConfig["sessions"][number] => ({
  startMinute: 0,
  endMinute: DAY_MINUTES,
  crossesMidnight: false,
});

const stockCalendar = (
  sessions: TradingCalendarConfig["sessions"],
): TradingCalendarConfig => ({
  tradingDays: [...WEEKDAY_TRADING_DAYS],
  sessions,
});

const weekdayAllDayCalendar = (): TradingCalendarConfig => ({
  tradingDays: [...WEEKDAY_TRADING_DAYS],
  sessions: [allDaySession()],
});

const forexCalendar = (): TradingCalendarConfig => ({
  tradingDays: [...FOREX_TRADING_DAYS],
  sessions: [session(17, 0, 16, 59, true)],
});

const cryptoCalendar = (): TradingCalendarConfig => ({
  tradingDays: [...ALL_TRADING_DAYS],
  sessions: [allDaySession()],
});

export const MARKET_PRESET_CALENDAR_DEFINITIONS: Record<
  BuiltInTradingMarketPresetId,
  MarketPresetCalendarDefinition
> = {
  A_SHARE: {
    presetId: "A_SHARE",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.A_SHARE,
    timeZone: "Asia/Shanghai",
    calendar: stockCalendar([
      session(9, 30, 11, 30),
      session(13, 0, 15, 0),
    ]),
  },
  HK_STOCK: {
    presetId: "HK_STOCK",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.HK_STOCK,
    timeZone: "Asia/Hong_Kong",
    calendar: stockCalendar([
      session(9, 30, 12, 0),
      session(13, 0, 16, 0),
    ]),
  },
  US_STOCK: {
    presetId: "US_STOCK",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.US_STOCK,
    timeZone: "America/New_York",
    calendar: stockCalendar([session(9, 30, 16, 0)]),
  },
  JP_STOCK: {
    presetId: "JP_STOCK",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.JP_STOCK,
    timeZone: "Asia/Tokyo",
    calendar: stockCalendar([
      session(9, 0, 11, 30),
      session(12, 30, 15, 30),
    ]),
  },
  KR_STOCK: {
    presetId: "KR_STOCK",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.KR_STOCK,
    timeZone: "Asia/Seoul",
    calendar: stockCalendar([session(9, 0, 15, 30)]),
  },
  TW_STOCK: {
    presetId: "TW_STOCK",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.TW_STOCK,
    timeZone: "Asia/Taipei",
    calendar: stockCalendar([session(9, 0, 13, 30)]),
  },
  FUTURES_COMMODITY: {
    presetId: "FUTURES_COMMODITY",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.FUTURES_COMMODITY,
    timeZone: "Etc/UTC",
    calendar: weekdayAllDayCalendar(),
  },
  FUTURES_FINANCIAL: {
    presetId: "FUTURES_FINANCIAL",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.FUTURES_FINANCIAL,
    timeZone: "Etc/UTC",
    calendar: weekdayAllDayCalendar(),
  },
  FOREX_STANDARD_LOT: {
    presetId: "FOREX_STANDARD_LOT",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.FOREX_STANDARD_LOT,
    timeZone: "America/New_York",
    calendar: forexCalendar(),
  },
  FOREX_MICRO_LOT: {
    presetId: "FOREX_MICRO_LOT",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.FOREX_MICRO_LOT,
    timeZone: "America/New_York",
    calendar: forexCalendar(),
  },
  CRYPTO_SPOT: {
    presetId: "CRYPTO_SPOT",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.CRYPTO_SPOT,
    timeZone: "Etc/UTC",
    calendar: cryptoCalendar(),
  },
  CRYPTO_USDT_PERP: {
    presetId: "CRYPTO_USDT_PERP",
    assetClass: BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID.CRYPTO_USDT_PERP,
    timeZone: "Etc/UTC",
    calendar: cryptoCalendar(),
  },
};

const cloneTradingCalendarConfig = (
  calendar: TradingCalendarConfig,
): TradingCalendarConfig => ({
  tradingDays: [...calendar.tradingDays],
  sessions: calendar.sessions.map((item) => ({ ...item })),
});

export const normalizeMarketPresetId = (
  value: unknown,
): BuiltInTradingMarketPresetId | null => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return isBuiltInTradingMarketPresetId(normalized) ? normalized : null;
};

export const resolveMarketPresetCalendarDefinition = (
  presetId: unknown,
): MarketPresetCalendarDefinition | null => {
  const normalized = normalizeMarketPresetId(presetId);
  if (!normalized) {
    return null;
  }
  const definition = MARKET_PRESET_CALENDAR_DEFINITIONS[normalized];
  return {
    ...definition,
    calendar: cloneTradingCalendarConfig(definition.calendar),
  };
};

export const resolveMarketPresetTradingCalendarConfig = (
  presetId: unknown,
): TradingCalendarConfig | null =>
  resolveMarketPresetCalendarDefinition(presetId)?.calendar ?? null;

export const resolveMarketPresetTimeZone = (
  presetId: unknown,
): string | null => resolveMarketPresetCalendarDefinition(presetId)?.timeZone ?? null;
