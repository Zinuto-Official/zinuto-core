// SPDX-License-Identifier: GPL-3.0-only

import {
  normalizeApiTradingCalendarConfig,
  type ApiTradingCalendarConfig,
  type ApiTradingSessionRange,
} from "@/api";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";

export const TRADING_CALENDAR_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type TradingCalendarWeekday = (typeof TRADING_CALENDAR_WEEKDAYS)[number];

const DAY_MINUTES = 24 * 60;
const MAX_TRADING_SESSIONS = 12;
const ALL_DAY_TRADING_SESSION: ApiTradingSessionRange = {
  startMinute: 0,
  endMinute: DAY_MINUTES,
  crossesMidnight: false,
};
const TRADING_SESSION_DISPLAY_STEP_MINUTES_BY_TIMEFRAME: Record<BaseTimeframe, number> = {
  "1m": 1,
  "5m": 5,
  "1h": 60,
  "1d": 1,
};

const clampMinute = (minuteRaw: number): number =>
  Math.max(0, Math.min(DAY_MINUTES, Math.floor(Number(minuteRaw) || 0)));

const normalizeTradingSessionDraft = (
  session: ApiTradingSessionRange,
): ApiTradingSessionRange | null => {
  const startMinute = clampMinute(session.startMinute);
  const endMinute = clampMinute(session.endMinute);
  if (startMinute >= DAY_MINUTES) {
    return null;
  }
  if (startMinute === 0 && endMinute === DAY_MINUTES) {
    return { startMinute, endMinute, crossesMidnight: false };
  }
  if (startMinute === endMinute || endMinute > DAY_MINUTES) {
    return null;
  }
  const crossesMidnight = Boolean(session.crossesMidnight) || endMinute < startMinute;
  if (!crossesMidnight && endMinute <= startMinute) {
    return null;
  }
  return { startMinute, endMinute, crossesMidnight };
};

const buildNewTradingSessionDraft = (
  sessions: ApiTradingSessionRange[],
): ApiTradingSessionRange => {
  const intervals = sessions
    .flatMap((session) =>
      session.crossesMidnight
        ? [
            { startMinute: session.startMinute, endMinute: DAY_MINUTES },
            { startMinute: 0, endMinute: session.endMinute },
          ]
        : [{ startMinute: session.startMinute, endMinute: session.endMinute }],
    )
    .filter((interval) => interval.endMinute > interval.startMinute)
    .sort(
      (left, right) =>
        left.startMinute - right.startMinute || left.endMinute - right.endMinute,
    );
  const latestEndMinute = intervals.reduce(
    (latest, interval) => Math.max(latest, interval.endMinute),
    0,
  );
  if (latestEndMinute > 0 && latestEndMinute < DAY_MINUTES) {
    return {
      startMinute: latestEndMinute,
      endMinute: Math.min(DAY_MINUTES, latestEndMinute + 60),
      crossesMidnight: false,
    };
  }

  let cursor = 0;
  for (const interval of intervals) {
    if (interval.startMinute > cursor) {
      return {
        startMinute: cursor,
        endMinute: Math.min(interval.startMinute, cursor + 60),
        crossesMidnight: false,
      };
    }
    cursor = Math.max(cursor, interval.endMinute);
  }
  if (cursor < DAY_MINUTES) {
    return {
      startMinute: cursor,
      endMinute: Math.min(DAY_MINUTES, cursor + 60),
      crossesMidnight: false,
    };
  }
  return { startMinute: 0, endMinute: 1, crossesMidnight: false };
};

export const formatTradingMinute = (minuteRaw: number): string => {
  const minute = clampMinute(minuteRaw);
  if (minute === DAY_MINUTES) {
    return "24:00";
  }
  const hour = Math.floor(minute / 60);
  const part = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(part).padStart(2, "0")}`;
};

export const resolveTradingCalendarDisplayStepMinutes = (
  baseTimeframe?: BaseTimeframe | null,
): number =>
  TRADING_SESSION_DISPLAY_STEP_MINUTES_BY_TIMEFRAME[baseTimeframe ?? "1m"] ?? 1;

export const isDailyTradingCalendarTimeframe = (
  baseTimeframe?: BaseTimeframe | null,
): boolean => baseTimeframe === "1d";

const getTradingSessionDurationMinutes = (
  session: ApiTradingSessionRange,
): number => {
  if (!session.crossesMidnight) {
    return session.endMinute - session.startMinute;
  }
  return DAY_MINUTES - session.startMinute + session.endMinute;
};

export const isTradingSessionAlignedToTimeframe = (
  session: ApiTradingSessionRange,
  baseTimeframe?: BaseTimeframe | null,
): boolean => {
  if (isDailyTradingCalendarTimeframe(baseTimeframe)) {
    return true;
  }
  if (session.startMinute === 0 && session.endMinute === DAY_MINUTES) {
    return true;
  }
  const stepMinutes = resolveTradingCalendarDisplayStepMinutes(baseTimeframe);
  return getTradingSessionDurationMinutes(session) % stepMinutes === 0;
};

export const formatTradingSessionEndMinute = (
  session: ApiTradingSessionRange,
  _baseTimeframe?: BaseTimeframe | null,
): string =>
  formatTradingMinute(
    session.startMinute === 0 && session.endMinute === DAY_MINUTES
      ? DAY_MINUTES
      : session.endMinute,
  );

export const parseTradingMinuteInput = (
  value: string,
  options: { allowEndOfDay?: boolean } = {},
): number | null => {
  const normalized = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (hour === 24 && minute === 0 && options.allowEndOfDay) {
    return DAY_MINUTES;
  }
  if (hour < 0 || hour > 23) {
    return null;
  }
  return hour * 60 + minute;
};

export const buildTradingSessionRangeFromInput = (
  startValue: string,
  endValue: string,
  baseTimeframe?: BaseTimeframe | null,
): ApiTradingSessionRange | null => {
  const startMinute = parseTradingMinuteInput(startValue);
  const endDisplayMinute = parseTradingMinuteInput(endValue, { allowEndOfDay: true });
  if (startMinute === null || endDisplayMinute === null) {
    return null;
  }
  const endMinute = endDisplayMinute;
  if (startMinute === 0 && endMinute === DAY_MINUTES) {
    return { startMinute, endMinute, crossesMidnight: false };
  }
  if (startMinute === endMinute || startMinute >= DAY_MINUTES) {
    return null;
  }
  const session = {
    startMinute,
    endMinute,
    crossesMidnight: endMinute < startMinute,
  };
  return isTradingSessionAlignedToTimeframe(session, baseTimeframe) ? session : null;
};

export const formatTradingSessionRange = (
  session: ApiTradingSessionRange,
  baseTimeframe?: BaseTimeframe | null,
): string =>
  `${formatTradingMinute(session.startMinute)}-${formatTradingSessionEndMinute(session, baseTimeframe)}`;

export const normalizeTradingCalendarDraft = (
  calendar: ApiTradingCalendarConfig,
): ApiTradingCalendarConfig => {
  const fallback = normalizeApiTradingCalendarConfig(calendar);
  const tradingDays = Array.from(
    new Set(
      (Array.isArray(calendar.tradingDays) ? calendar.tradingDays : fallback.tradingDays)
        .map((weekday) => Math.floor(Number(weekday)))
        .filter((weekday): weekday is TradingCalendarWeekday =>
          TRADING_CALENDAR_WEEKDAYS.includes(weekday as TradingCalendarWeekday),
        ),
    ),
  ).sort((left, right) => left - right);
  const sessions = (Array.isArray(calendar.sessions)
    ? calendar.sessions
    : fallback.sessions)
    .map((session) => normalizeTradingSessionDraft(session))
    .filter((session): session is ApiTradingSessionRange => Boolean(session))
    .slice(0, MAX_TRADING_SESSIONS);
  return {
    tradingDays: tradingDays.length ? tradingDays : fallback.tradingDays,
    sessions: sessions.length ? sessions : fallback.sessions,
  };
};

export const normalizeTradingCalendarForSubmit = (
  calendar: ApiTradingCalendarConfig,
  baseTimeframe?: BaseTimeframe | null,
): ApiTradingCalendarConfig => {
  const normalized = normalizeApiTradingCalendarConfig(calendar);
  if (isDailyTradingCalendarTimeframe(baseTimeframe)) {
    return {
      ...normalized,
      sessions: [{ ...ALL_DAY_TRADING_SESSION }],
    };
  }
  return normalized;
};

export const updateTradingCalendarDay = (
  calendar: ApiTradingCalendarConfig,
  weekday: TradingCalendarWeekday,
  enabled: boolean,
): ApiTradingCalendarConfig => {
  const currentDays = new Set(calendar.tradingDays);
  if (enabled) {
    currentDays.add(weekday);
  } else {
    if (currentDays.size <= 1) {
      return normalizeTradingCalendarDraft(calendar);
    }
    currentDays.delete(weekday);
  }
  return {
    ...calendar,
    tradingDays: Array.from(currentDays).sort((left, right) => left - right),
  };
};

export const updateTradingCalendarSession = (
  calendar: ApiTradingCalendarConfig,
  index: number,
  session: ApiTradingSessionRange,
): ApiTradingCalendarConfig => {
  const sessions = calendar.sessions.map((item, itemIndex) =>
    itemIndex === index ? session : item,
  );
  return normalizeTradingCalendarDraft({ ...calendar, sessions });
};

export const addTradingCalendarSession = (
  calendar: ApiTradingCalendarConfig,
): ApiTradingCalendarConfig => {
  const current = normalizeTradingCalendarDraft(calendar);
  if (current.sessions.length >= MAX_TRADING_SESSIONS) {
    return current;
  }
  return {
    ...current,
    sessions: [
      ...current.sessions,
      buildNewTradingSessionDraft(current.sessions),
    ],
  };
};

export const removeTradingCalendarSession = (
  calendar: ApiTradingCalendarConfig,
  index: number,
): ApiTradingCalendarConfig => {
  const current = normalizeTradingCalendarDraft(calendar);
  if (current.sessions.length <= 1) {
    return current;
  }
  return normalizeTradingCalendarDraft({
    ...current,
    sessions: current.sessions.filter((_, itemIndex) => itemIndex !== index),
  });
};

export const formatTradingCalendarSummary = (
  calendar: ApiTradingCalendarConfig,
  weekdayLabels: Record<TradingCalendarWeekday, string>,
  language: AppUiLanguage,
  baseTimeframe?: BaseTimeframe | null,
): string => {
  const normalized = normalizeTradingCalendarDraft(calendar);
  const dayText = normalized.tradingDays
    .map((weekday) => weekdayLabels[weekday])
    .filter(Boolean)
    .join(" ");
  if (isDailyTradingCalendarTimeframe(baseTimeframe)) {
    return formatDotJoinedText(language, [dayText]);
  }
  const sessionText = normalized.sessions
    .map((session) => formatTradingSessionRange(session, baseTimeframe))
    .join(" / ");
  return formatDotJoinedText(language, [dayText, sessionText]);
};
