// SPDX-License-Identifier: GPL-3.0-only

import type {
  BuiltInTradingMarketPresetId,
  TradingAssetClass,
} from "./trading.js";

export type ImportMarketPresetRule = {
  presetId: BuiltInTradingMarketPresetId;
  assetClass: TradingAssetClass;
  defaultTimeZone: string;
  symbolPatterns: RegExp[];
  pathKeywords: string[];
};

export const IMPORT_MARKET_PRESET_RULES: Record<
  BuiltInTradingMarketPresetId,
  ImportMarketPresetRule
> = {
  A_SHARE: {
    presetId: "A_SHARE",
    assetClass: "STOCK",
    defaultTimeZone: "Asia/Shanghai",
    symbolPatterns: [/^(?:SH|SZ|BJ)[._-]?\d{5,6}$/i, /^\d{6}\.(?:SH|SZ|SS)$/i],
    pathKeywords: [
      "a股",
      "a-share",
      "ashare",
      "沪深",
      "shse",
      "szse",
      "china stock",
    ],
  },
  HK_STOCK: {
    presetId: "HK_STOCK",
    assetClass: "STOCK",
    defaultTimeZone: "Asia/Hong_Kong",
    symbolPatterns: [/^\d{4,5}\.HK$/i, /^HK[._-]?\d{4,5}$/i],
    pathKeywords: ["港股", "hong kong", "hongkong", "hkex", "hang seng"],
  },
  US_STOCK: {
    presetId: "US_STOCK",
    assetClass: "STOCK",
    defaultTimeZone: "America/New_York",
    symbolPatterns: [/^[A-Z]{1,5}(?:\.US)?$/i, /^US\.[A-Z]{1,5}$/i],
    pathKeywords: [
      "美股",
      "us stock",
      "nasdaq",
      "nyse",
      "amex",
      "wall street",
      "yahoo",
    ],
  },
  JP_STOCK: {
    presetId: "JP_STOCK",
    assetClass: "STOCK",
    defaultTimeZone: "Asia/Tokyo",
    symbolPatterns: [/^\d{4}\.(?:JP|T)$/i, /^JP\.\d{4}$/i],
    pathKeywords: ["日股", "japan stock", "tokyo stock", "nikkei", "tse"],
  },
  KR_STOCK: {
    presetId: "KR_STOCK",
    assetClass: "STOCK",
    defaultTimeZone: "Asia/Seoul",
    symbolPatterns: [/^\d{6}\.(?:KR|KS|KQ)$/i, /^KR\.\d{6}$/i],
    pathKeywords: ["韩股", "korea stock", "krx", "kospi", "kosdaq"],
  },
  TW_STOCK: {
    presetId: "TW_STOCK",
    assetClass: "STOCK",
    defaultTimeZone: "Asia/Taipei",
    symbolPatterns: [/^\d{4}\.(?:TW|TWO|TPE|TWSE)$/i, /^TW\.\d{4}$/i],
    pathKeywords: ["台股", "taiwan stock", "twse", "tpex"],
  },
  FUTURES_COMMODITY: {
    presetId: "FUTURES_COMMODITY",
    assetClass: "FUTURES",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [
      /^(?:CL|NG|GC|SI|HG|RB|SC|AU|AG|CU|AL|ZN|NI|RU|M|Y|P)\d{3,6}$/i,
    ],
    pathKeywords: [
      "commodity",
      "futures",
      "期货",
      "cme",
      "shfe",
      "dce",
      "czce",
      "ine",
    ],
  },
  FUTURES_FINANCIAL: {
    presetId: "FUTURES_FINANCIAL",
    assetClass: "FUTURES",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [/^(?:ES|MES|NQ|MNQ|YM|RTY|IF|IH|IC|IM|TF|TS|TL)\w{1,6}$/i],
    pathKeywords: [
      "financial futures",
      "index futures",
      "bond futures",
      "股指",
      "国债",
      "cme",
      "cffex",
    ],
  },
  FOREX_STANDARD_LOT: {
    presetId: "FOREX_STANDARD_LOT",
    assetClass: "FOREX",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [/^[A-Z]{3}[A-Z]{3}$/i, /^[A-Z]{3}\/[A-Z]{3}$/i],
    pathKeywords: ["forex", "fx", "oanda", "mt5", "metatrader", "standard lot"],
  },
  FOREX_MICRO_LOT: {
    presetId: "FOREX_MICRO_LOT",
    assetClass: "FOREX",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [/^[A-Z]{3}[A-Z]{3}$/i, /^[A-Z]{3}\/[A-Z]{3}$/i],
    pathKeywords: [
      "forex",
      "fx",
      "micro lot",
      "micro-lot",
      "mini lot",
      "微型手",
    ],
  },
  CRYPTO_SPOT: {
    presetId: "CRYPTO_SPOT",
    assetClass: "CRYPTO",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [
      /^(?:BTC|ETH|BNB|SOL|XRP|DOGE|ADA|AVAX|LTC|LINK).*(?:USDT|USDC|USD|BTC|ETH)$/i,
    ],
    pathKeywords: [
      "crypto",
      "spot",
      "binance",
      "okx",
      "bybit",
      "coinbase",
      "现货",
    ],
  },
  CRYPTO_USDT_PERP: {
    presetId: "CRYPTO_USDT_PERP",
    assetClass: "CRYPTO",
    defaultTimeZone: "Etc/UTC",
    symbolPatterns: [/^(?:BTC|ETH|BNB|SOL|XRP|DOGE|ADA|AVAX|LTC|LINK).*USDT$/i],
    pathKeywords: [
      "perp",
      "perpetual",
      "swap",
      "binance futures",
      "okx swap",
      "永续",
      "合约",
    ],
  },
};

export type ImportTimeZoneRuleEvidenceCode =
  | "EXCHANGE_KEYWORD"
  | "VENDOR_HINT"
  | "MARKET_SYMBOL_STRONG"
  | "MARKET_SYMBOL_WEAK"
  | "PATH_KEYWORD"
  | "TIMESTAMP_OFFSET"
  | "TIMESTAMP_IANA"
  | "SESSION_WINDOW_MATCH"
  | "PRESET_DEFAULT"
  | "SYSTEM_TIME_ZONE";

export type ImportTimeZoneRuleEvidence = {
  code: ImportTimeZoneRuleEvidenceCode;
  timeZone: string;
  score: number;
};

export type ImportTimeZoneRuleInput = {
  folderName: string;
  folderPath: string;
  files: Array<{
    originalname: string;
    relativePath: string;
    symbol: string;
  }>;
  marketPresetId?: string | null;
  timestampSamples?: string[];
  systemTimeZone?: string;
};

type ImportTimeZoneKeywordRule = {
  timeZone: string;
  score: number;
  code: ImportTimeZoneRuleEvidenceCode;
  keywords: string[];
};

type ImportTimeZoneSymbolRule = {
  timeZone: string;
  score: number;
  code: ImportTimeZoneRuleEvidenceCode;
  patterns: RegExp[];
};

const IMPORT_TIME_ZONE_PRESET_SCORE_BY_ID: Partial<
  Record<BuiltInTradingMarketPresetId, number>
> = {
  A_SHARE: 76,
  HK_STOCK: 76,
  US_STOCK: 76,
  JP_STOCK: 76,
  KR_STOCK: 76,
  TW_STOCK: 76,
  FUTURES_COMMODITY: 24,
  FUTURES_FINANCIAL: 24,
  FOREX_STANDARD_LOT: 28,
  FOREX_MICRO_LOT: 28,
  CRYPTO_SPOT: 70,
  CRYPTO_USDT_PERP: 70,
};

const IMPORT_TIME_ZONE_KEYWORD_RULES: ImportTimeZoneKeywordRule[] = [
  {
    timeZone: "Asia/Shanghai",
    score: 70,
    code: "EXCHANGE_KEYWORD",
    keywords: [
      "shfe",
      "dce",
      "czce",
      "cffex",
      "ine",
      "上期所",
      "大商所",
      "郑商所",
      "中金所",
      "上海期货",
    ],
  },
  {
    timeZone: "America/Chicago",
    score: 70,
    code: "EXCHANGE_KEYWORD",
    keywords: ["cme", "cbot", "nymex", "comex", "globex"],
  },
  {
    timeZone: "America/New_York",
    score: 52,
    code: "EXCHANGE_KEYWORD",
    keywords: ["nasdaq", "nyse", "amex", "arca", "iex"],
  },
  {
    timeZone: "Asia/Hong_Kong",
    score: 52,
    code: "EXCHANGE_KEYWORD",
    keywords: ["hkex", "hang seng", "恒生"],
  },
  {
    timeZone: "Asia/Tokyo",
    score: 52,
    code: "EXCHANGE_KEYWORD",
    keywords: ["tse", "jpx", "tokyo stock", "nikkei"],
  },
  {
    timeZone: "Asia/Seoul",
    score: 52,
    code: "EXCHANGE_KEYWORD",
    keywords: ["krx", "kospi", "kosdaq"],
  },
  {
    timeZone: "Asia/Taipei",
    score: 52,
    code: "EXCHANGE_KEYWORD",
    keywords: ["twse", "tpex"],
  },
  {
    timeZone: "Asia/Shanghai",
    score: 58,
    code: "VENDOR_HINT",
    keywords: ["tushare", "akshare", "baostock"],
  },
  {
    timeZone: "Etc/UTC",
    score: 78,
    code: "VENDOR_HINT",
    keywords: ["binance", "okx", "bybit", "coinbase", "kraken"],
  },
  {
    timeZone: "America/New_York",
    score: 18,
    code: "VENDOR_HINT",
    keywords: ["yahoo"],
  },
  {
    timeZone: "Etc/UTC",
    score: 82,
    code: "PATH_KEYWORD",
    keywords: ["utc", "gmt", "zulu"],
  },
  {
    timeZone: "America/New_York",
    score: 82,
    code: "PATH_KEYWORD",
    keywords: [
      "new york",
      "new-york",
      "ny close",
      "eastern time",
      "est",
      "edt",
    ],
  },
  {
    timeZone: "America/Chicago",
    score: 82,
    code: "PATH_KEYWORD",
    keywords: ["chicago time", "central time", "cst", "cdt"],
  },
  {
    timeZone: "Asia/Shanghai",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: [
      "a股",
      "a-share",
      "ashare",
      "沪深",
      "china stock",
      "cn stock",
      "中国期货",
    ],
  },
  {
    timeZone: "Asia/Hong_Kong",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: ["港股", "hong kong", "hongkong", "hk stock"],
  },
  {
    timeZone: "America/New_York",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: ["美股", "us stock", "wall street"],
  },
  {
    timeZone: "Asia/Tokyo",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: ["日股", "japan stock"],
  },
  {
    timeZone: "Asia/Seoul",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: ["韩股", "korea stock"],
  },
  {
    timeZone: "Asia/Taipei",
    score: 42,
    code: "PATH_KEYWORD",
    keywords: ["台股", "taiwan stock"],
  },
];

const IMPORT_TIME_ZONE_SYMBOL_RULES: ImportTimeZoneSymbolRule[] = [
  {
    timeZone: "Asia/Shanghai",
    score: 88,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [
      /^(?:SH|SZ|BJ)[._-]?\d{5,6}$/i,
      /^\d{6}\.(?:SH|SZ|SS)$/i,
      /^(?:SHSE|SZSE)[._-]?\d{6}$/i,
      /^INDEX[._-]?\d{6}$/i,
    ],
  },
  {
    timeZone: "Asia/Hong_Kong",
    score: 95,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [/^\d{4,5}\.HK$/i, /^HK\.\d{4,5}$/i, /^HK[._-]?\d{4,5}$/i],
  },
  {
    timeZone: "America/New_York",
    score: 95,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [/^[A-Z]{1,5}\.US$/i, /^US\.[A-Z]{1,5}$/i],
  },
  {
    timeZone: "Asia/Tokyo",
    score: 95,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [/^\d{4}\.(?:JP|T)$/i, /^JP\.\d{4}$/i],
  },
  {
    timeZone: "Asia/Seoul",
    score: 95,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [/^\d{6}\.(?:KR|KS|KQ)$/i, /^KR\.\d{6}$/i],
  },
  {
    timeZone: "Asia/Taipei",
    score: 95,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [/^\d{4}\.(?:TW|TWO|TPE|TWSE)$/i, /^TW\.\d{4}$/i],
  },
  {
    timeZone: "Asia/Shanghai",
    score: 92,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [
      /^(?:IF|IH|IC|IM|TF|TS|TL|AU|AG|CU|AL|ZN|PB|NI|SN|RB|HC|SC|LU|BU|FU|RU|NR)\d{3,6}$/i,
    ],
  },
  {
    timeZone: "America/Chicago",
    score: 92,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [
      /^(?:ES|MES|NQ|MNQ|YM|MYM|RTY|M2K|ZB|ZN|ZF|ZT|UB|CL|NG|GC|SI|HG|PA|PL|RB|HO|ZC|ZS|ZW|ZM|ZL|KC|CT|SB|OJ|LE|HE|GF)[FGHJKMNQUVXZ]\d{1,2}$/i,
    ],
  },
  {
    timeZone: "Etc/UTC",
    score: 90,
    code: "MARKET_SYMBOL_STRONG",
    patterns: [
      /^(?:BTC|ETH|BNB|SOL|XRP|DOGE|ADA|AVAX|LTC|LINK|TRX|DOT|MATIC|ATOM|BCH|ETC|ARB|OP|SUI|APT).*(?:USDT|USDC|USD|BTC|ETH)$/i,
    ],
  },
  {
    timeZone: "Asia/Shanghai",
    score: 38,
    code: "MARKET_SYMBOL_WEAK",
    patterns: [/^\d{6}$/],
  },
  {
    timeZone: "America/New_York",
    score: 34,
    code: "MARKET_SYMBOL_WEAK",
    patterns: [/^[A-Z]{1,5}$/],
  },
];

const IMPORT_TIME_ZONE_EXPLICIT_ZONE_ALIASES: Array<{
  timeZone: string;
  patterns: RegExp[];
}> = [
  { timeZone: "Etc/UTC", patterns: [/\b(?:UTC|GMT|ZULU)\b/i] },
  {
    timeZone: "America/New_York",
    patterns: [/\bAmerica\/New_York\b/i, /\b(?:US\/Eastern|Eastern Time)\b/i],
  },
  {
    timeZone: "America/Chicago",
    patterns: [/\bAmerica\/Chicago\b/i, /\b(?:US\/Central|Central Time)\b/i],
  },
  { timeZone: "Asia/Shanghai", patterns: [/\bAsia\/Shanghai\b/i] },
  { timeZone: "Asia/Hong_Kong", patterns: [/\bAsia\/Hong_Kong\b/i] },
  { timeZone: "Asia/Tokyo", patterns: [/\bAsia\/Tokyo\b/i] },
  { timeZone: "Asia/Seoul", patterns: [/\bAsia\/Seoul\b/i] },
  { timeZone: "Asia/Taipei", patterns: [/\bAsia\/Taipei\b/i] },
];

const IMPORT_TIME_ZONE_SESSION_WINDOWS: Record<
  string,
  Array<{ startMinute: number; endMinute: number }>
> = {
  "America/New_York": [{ startMinute: 9 * 60 + 30, endMinute: 16 * 60 + 15 }],
  "Asia/Shanghai": [
    { startMinute: 9 * 60 + 30, endMinute: 11 * 60 + 45 },
    { startMinute: 13 * 60, endMinute: 15 * 60 + 15 },
  ],
  "Asia/Hong_Kong": [{ startMinute: 9 * 60 + 30, endMinute: 16 * 60 + 15 }],
  "Asia/Tokyo": [{ startMinute: 9 * 60, endMinute: 15 * 60 + 30 }],
  "Asia/Seoul": [{ startMinute: 9 * 60, endMinute: 15 * 60 + 45 }],
  "Asia/Taipei": [{ startMinute: 9 * 60, endMinute: 13 * 60 + 45 }],
};

const IMPORT_TIME_ZONE_OFFSET_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const IMPORT_TIME_ZONE_NUMERIC_EPOCH_RE = /^[+-]?\d{10,13}$/;
const IMPORT_TIME_ZONE_NAIVE_TIME_RE =
  /(?:^|\D)(\d{1,2})(?::?([0-5]\d))(?::?[0-5]\d)?(?:\.\d{1,3})?(?:\D|$)/;

const normalizeImportTimeZoneRuleText = (...values: string[]): string =>
  values
    .map((value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/[_.-]+/g, " ")
        .replace(/\s+/g, " "),
    )
    .filter((value) => Boolean(value))
    .join(" ");

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isAsciiWordCharacter = (value: string): boolean => /[a-z0-9]/.test(value);

const hasImportTimeZoneRuleKeyword = (
  text: string,
  keyword: string,
): boolean => {
  const normalizedKeyword = normalizeImportTimeZoneRuleText(keyword);
  if (!normalizedKeyword) {
    return false;
  }
  const escapedKeyword = escapeRegExp(normalizedKeyword).replace(
    /\s+/g,
    "\\s+",
  );
  const startsWithAsciiWord = isAsciiWordCharacter(normalizedKeyword[0] ?? "");
  const endsWithAsciiWord = isAsciiWordCharacter(
    normalizedKeyword[normalizedKeyword.length - 1] ?? "",
  );
  const prefix = startsWithAsciiWord ? "(?:^|[^a-z0-9])" : "";
  const suffix = endsWithAsciiWord ? "(?=$|[^a-z0-9])" : "";
  return new RegExp(`${prefix}${escapedKeyword}${suffix}`).test(text);
};

const normalizeImportTimeZoneSymbolText = (value: string): string =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();

const normalizeImportTimeZoneScore = (score: number): number =>
  Math.max(0, Math.min(100, Math.round(score)));

const pushImportTimeZoneEvidence = (
  evidence: ImportTimeZoneRuleEvidence[],
  code: ImportTimeZoneRuleEvidenceCode,
  timeZone: string,
  score: number,
): void => {
  const normalizedScore = normalizeImportTimeZoneScore(score);
  if (!timeZone || normalizedScore <= 0) {
    return;
  }
  evidence.push({ code, timeZone, score: normalizedScore });
};

const isForexPairRuleSymbol = (symbol: string): boolean =>
  /^[A-Z]{6}$/.test(symbol) &&
  [
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "NZD",
    "CAD",
    "CHF",
    "CNH",
    "CNY",
  ].includes(symbol.slice(0, 3)) &&
  [
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "AUD",
    "NZD",
    "CAD",
    "CHF",
    "CNH",
    "CNY",
  ].includes(symbol.slice(3, 6));

const isExplicitTimestampRuleSample = (raw: string): boolean => {
  const normalized = String(raw || "").trim();
  return (
    IMPORT_TIME_ZONE_OFFSET_RE.test(normalized) ||
    /\b(?:UTC|GMT|ZULU)\b/i.test(normalized) ||
    IMPORT_TIME_ZONE_NUMERIC_EPOCH_RE.test(normalized)
  );
};

const parseTimestampRuleSampleMs = (raw: string): number => {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return Number.NaN;
  }
  if (IMPORT_TIME_ZONE_NUMERIC_EPOCH_RE.test(normalized)) {
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
      return Number.NaN;
    }
    return Math.trunc(
      Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric,
    );
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN;
};

const getTimeZoneRuleMinuteOfDay = (
  timestampMs: number,
  timeZone: string,
): { minuteOfDay: number; weekday: number } | null => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestampMs));
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const weekdayText = String(
      parts.find((part) => part.type === "weekday")?.value || "",
    );
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      weekdayText,
    );
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || weekday < 0) {
      return null;
    }
    return { minuteOfDay: hour * 60 + minute, weekday };
  } catch {
    return null;
  }
};

const parseNaiveTimeZoneRuleMinuteOfDay = (raw: string): number | null => {
  const normalized = String(raw || "").trim();
  if (
    /^\d{8}$/.test(normalized) ||
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(normalized)
  ) {
    return null;
  }
  const match = normalized.match(IMPORT_TIME_ZONE_NAIVE_TIME_RE);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute)
  ) {
    return null;
  }
  return hour * 60 + minute;
};

const isMinuteInImportTimeZoneSession = (
  minuteOfDay: number,
  timeZone: string,
): boolean =>
  (IMPORT_TIME_ZONE_SESSION_WINDOWS[timeZone] ?? []).some(
    (window) =>
      minuteOfDay >= window.startMinute && minuteOfDay <= window.endMinute,
  );

const addTimestampRuleEvidence = (
  evidence: ImportTimeZoneRuleEvidence[],
  timestampSamples: string[],
): void => {
  const samples = timestampSamples
    .map((sample) => String(sample || "").trim())
    .filter(Boolean);
  if (!samples.length) {
    return;
  }
  samples.forEach((sample) => {
    IMPORT_TIME_ZONE_EXPLICIT_ZONE_ALIASES.forEach((alias) => {
      if (alias.patterns.some((pattern) => pattern.test(sample))) {
        pushImportTimeZoneEvidence(
          evidence,
          "TIMESTAMP_IANA",
          alias.timeZone,
          100,
        );
      }
    });
    if (isExplicitTimestampRuleSample(sample)) {
      pushImportTimeZoneEvidence(evidence, "TIMESTAMP_OFFSET", "Etc/UTC", 100);
    }
  });
};

const addSessionRuleEvidence = (
  evidence: ImportTimeZoneRuleEvidence[],
  timestampSamples: string[],
): void => {
  const candidateTimeZones = Array.from(
    new Set(
      evidence
        .filter(
          (item) =>
            item.timeZone !== "Etc/UTC" && item.code !== "SYSTEM_TIME_ZONE",
        )
        .map((item) => item.timeZone),
    ),
  );
  if (!candidateTimeZones.length || !timestampSamples.length) {
    return;
  }

  candidateTimeZones.forEach((timeZone) => {
    if (!IMPORT_TIME_ZONE_SESSION_WINDOWS[timeZone]) {
      return;
    }
    const explicitSamples = timestampSamples
      .map((sample) => String(sample || "").trim())
      .filter((sample) => isExplicitTimestampRuleSample(sample));
    if (explicitSamples.length) {
      const matches = explicitSamples.filter((sample) => {
        const parsed = parseTimestampRuleSampleMs(sample);
        if (!Number.isFinite(parsed)) {
          return false;
        }
        const local = getTimeZoneRuleMinuteOfDay(parsed, timeZone);
        return (
          Boolean(local) &&
          local!.weekday >= 1 &&
          local!.weekday <= 5 &&
          isMinuteInImportTimeZoneSession(local!.minuteOfDay, timeZone)
        );
      }).length;
      if (matches >= Math.ceil(explicitSamples.length * 0.6)) {
        pushImportTimeZoneEvidence(
          evidence,
          "SESSION_WINDOW_MATCH",
          timeZone,
          36,
        );
      }
      return;
    }

    const naiveMinutes = timestampSamples
      .map((sample) => parseNaiveTimeZoneRuleMinuteOfDay(sample))
      .filter((minute): minute is number => minute !== null);
    if (!naiveMinutes.length) {
      return;
    }
    const matches = naiveMinutes.filter((minute) =>
      isMinuteInImportTimeZoneSession(minute, timeZone),
    ).length;
    if (matches >= Math.ceil(naiveMinutes.length * 0.6)) {
      pushImportTimeZoneEvidence(
        evidence,
        "SESSION_WINDOW_MATCH",
        timeZone,
        16,
      );
    }
  });
};

export const inferImportTimeZoneRuleEvidence = ({
  folderName,
  folderPath,
  files,
  marketPresetId,
  timestampSamples,
  systemTimeZone,
}: ImportTimeZoneRuleInput): ImportTimeZoneRuleEvidence[] => {
  const evidence: ImportTimeZoneRuleEvidence[] = [];
  const normalizedFiles = Array.isArray(files) ? files : [];
  const text = normalizeImportTimeZoneRuleText(
    folderName,
    folderPath,
    ...normalizedFiles.flatMap((file) => [
      file.originalname,
      file.relativePath,
      file.symbol,
    ]),
  );

  IMPORT_TIME_ZONE_KEYWORD_RULES.forEach((rule) => {
    if (
      rule.keywords.some((keyword) =>
        hasImportTimeZoneRuleKeyword(text, keyword),
      )
    ) {
      pushImportTimeZoneEvidence(
        evidence,
        rule.code,
        rule.timeZone,
        rule.score,
      );
    }
  });

  normalizedFiles.forEach((file) => {
    const symbol = normalizeImportTimeZoneSymbolText(
      file.symbol || file.originalname,
    );
    if (!symbol || isForexPairRuleSymbol(symbol)) {
      return;
    }
    IMPORT_TIME_ZONE_SYMBOL_RULES.forEach((rule) => {
      if (rule.patterns.some((pattern) => pattern.test(symbol))) {
        pushImportTimeZoneEvidence(
          evidence,
          rule.code,
          rule.timeZone,
          rule.score,
        );
      }
    });
  });

  const presetRule = resolveImportMarketPresetRule(
    String(marketPresetId || ""),
  );
  const presetScore =
    presetRule?.presetId &&
    IMPORT_TIME_ZONE_PRESET_SCORE_BY_ID[presetRule.presetId];
  if (presetRule && presetScore) {
    pushImportTimeZoneEvidence(
      evidence,
      "PRESET_DEFAULT",
      presetRule.defaultTimeZone,
      presetScore,
    );
  }

  addTimestampRuleEvidence(evidence, timestampSamples ?? []);
  addSessionRuleEvidence(evidence, timestampSamples ?? []);

  if (systemTimeZone) {
    pushImportTimeZoneEvidence(
      evidence,
      "SYSTEM_TIME_ZONE",
      systemTimeZone,
      20,
    );
  }

  return evidence;
};

export const resolveImportMarketPresetRule = (
  marketPresetId: string,
): ImportMarketPresetRule | null => {
  const normalized = String(marketPresetId ?? "").trim();
  if (!normalized) {
    return null;
  }
  return (
    IMPORT_MARKET_PRESET_RULES[normalized as BuiltInTradingMarketPresetId] ??
    null
  );
};
