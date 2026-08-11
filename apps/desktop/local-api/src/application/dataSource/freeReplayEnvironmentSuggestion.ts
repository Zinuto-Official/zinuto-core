// SPDX-License-Identifier: GPL-3.0-only

import type { TradingAssetClass } from '@zinuto/shared/trading';

type InferredAssetClass = TradingAssetClass;
type InferredMarketPresetId =
  | 'A_SHARE'
  | 'HK_STOCK'
  | 'US_STOCK'
  | 'JP_STOCK'
  | 'KR_STOCK'
  | 'TW_STOCK'
  | 'FUTURES_COMMODITY'
  | 'FUTURES_FINANCIAL'
  | 'FOREX_STANDARD_LOT'
  | 'FOREX_MICRO_LOT'
  | 'CRYPTO_SPOT'
  | 'CRYPTO_USDT_PERP';

export type FreeReplayEnvironmentSuggestion = {
  assetClass: InferredAssetClass;
  marketPresetId: InferredMarketPresetId;
};

type InferFreeReplayEnvironmentSuggestionInput = {
  folderName: string;
  folderPath: string;
  files: Array<{
    originalname: string;
    relativePath: string;
    symbol: string;
  }>;
};

const PRESET_ASSET_CLASS_BY_ID: Record<InferredMarketPresetId, InferredAssetClass> = {
  A_SHARE: 'STOCK',
  HK_STOCK: 'STOCK',
  US_STOCK: 'STOCK',
  JP_STOCK: 'STOCK',
  KR_STOCK: 'STOCK',
  TW_STOCK: 'STOCK',
  FUTURES_COMMODITY: 'FUTURES',
  FUTURES_FINANCIAL: 'FUTURES',
  FOREX_STANDARD_LOT: 'FOREX',
  FOREX_MICRO_LOT: 'FOREX',
  CRYPTO_SPOT: 'CRYPTO',
  CRYPTO_USDT_PERP: 'CRYPTO'
};

const PRESET_IDS = Object.keys(PRESET_ASSET_CLASS_BY_ID) as InferredMarketPresetId[];
const IMPORT_INFERENCE_MIN_SCORE = 6;
const IMPORT_INFERENCE_MIN_LEAD = 2;

const CURRENCY_CODES = new Set<string>([
  'AED',
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNH',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'JPY',
  'MXN',
  'NOK',
  'NZD',
  'PLN',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR'
]);

const CRYPTO_STABLE_QUOTES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI'] as const;
const CRYPTO_BASE_HINTS = new Set<string>([
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'DOGE',
  'ADA',
  'AVAX',
  'LTC',
  'LINK',
  'TRX',
  'DOT',
  'MATIC',
  'ATOM',
  'BCH',
  'ETC',
  'ARB',
  'OP',
  'SUI',
  'APT',
  'UNI',
  'NEAR',
  'PEPE',
  'WIF'
]);

const CHINA_FINANCIAL_FUTURE_PREFIXES = ['IF', 'IH', 'IC', 'IM', 'TF', 'TS', 'TL'] as const;
const CHINA_COMMODITY_FUTURE_PREFIXES = [
  'AU',
  'AG',
  'CU',
  'AL',
  'ZN',
  'PB',
  'NI',
  'SN',
  'RB',
  'HC',
  'I',
  'J',
  'JM',
  'M',
  'Y',
  'P',
  'OI',
  'RM',
  'CF',
  'SR',
  'TA',
  'MA',
  'FG',
  'SA',
  'UR',
  'AP',
  'CJ',
  'LH',
  'SC',
  'LU',
  'BU',
  'FU',
  'RU',
  'NR',
  'EB',
  'EG',
  'PG',
  'PP',
  'V',
  'L',
  'C',
  'CS',
  'A',
  'B',
  'JD',
  'PK',
  'SM',
  'SF',
  'SS',
  'SP',
  'BR'
] as const;
const GLOBAL_FINANCIAL_FUTURE_PREFIXES = ['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'NKD', 'ZB', 'ZN', 'ZF', 'ZT', 'UB', 'VX'] as const;
const GLOBAL_COMMODITY_FUTURE_PREFIXES = ['CL', 'NG', 'GC', 'SI', 'HG', 'PA', 'PL', 'RB', 'HO', 'ZC', 'ZS', 'ZW', 'ZM', 'ZL', 'KC', 'CT', 'SB', 'OJ', 'LE', 'HE', 'GF'] as const;
const FUTURES_MONTH_CODES = 'FGHJKMNQUVXZ';

const MARKET_KEYWORDS_BY_PRESET: Record<InferredMarketPresetId, string[]> = {
  A_SHARE: ['a股', 'a-share', 'ashare', '沪深', '上证', '深证', '科创', '创业板', 'china stock', 'cn stock'],
  HK_STOCK: ['港股', 'hong kong', 'hongkong', 'hk stock', 'hkex', '恒生', 'hang seng'],
  US_STOCK: ['美股', 'us stock', 'nasdaq', 'nyse', 'amex', 'wall street'],
  JP_STOCK: ['日股', 'japan stock', 'tokyo stock', 'nikkei', 'tse'],
  KR_STOCK: ['韩股', 'korea stock', 'krx', 'kospi', 'kosdaq'],
  TW_STOCK: ['台股', 'taiwan stock', 'twse', 'tpex'],
  FUTURES_COMMODITY: ['商品期货', 'commodity futures', 'commodity', 'energy futures', 'metal futures', 'agri futures', '原油', '黄金', '白银', '黑色', '农产品'],
  FUTURES_FINANCIAL: ['金融期货', 'financial futures', 'index futures', 'bond futures', 'treasury futures', '股指', '国债'],
  FOREX_STANDARD_LOT: ['standard lot', '标准手'],
  FOREX_MICRO_LOT: ['micro lot', 'micro-lot', 'micro', 'mini lot', '迷你手', '微型手'],
  CRYPTO_SPOT: ['spot', '现货'],
  CRYPTO_USDT_PERP: ['perp', 'perpetual', 'swap', '永续', '合约', 'binance futures', 'okx swap']
};

type SymbolFacts = {
  symbolUpper: string;
  compactAlpha: string;
  compactAlphaNumeric: string;
  compactDigits: string;
};

const buildSymbolFacts = (value: string): SymbolFacts => {
  const symbolUpper = String(value || '').trim().toUpperCase();
  return {
    symbolUpper,
    compactAlpha: symbolUpper.replace(/[^A-Z]/g, ''),
    compactAlphaNumeric: symbolUpper.replace(/[^A-Z0-9]/g, ''),
    compactDigits: symbolUpper.replace(/\D/g, '')
  };
};

const normalizeLowerText = (...values: string[]): string =>
  values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => Boolean(value))
    .join(' ');

const hasKeyword = (text: string, keywords: string[]): boolean => keywords.some((keyword) => text.includes(keyword));

const addScore = (scores: Map<InferredMarketPresetId, number>, presetId: InferredMarketPresetId, weight: number) => {
  if (weight <= 0) {
    return;
  }
  scores.set(presetId, (scores.get(presetId) ?? 0) + weight);
};

const matchesAny = (value: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(value));

const isForexPairSymbol = (facts: SymbolFacts): boolean => {
  if (facts.compactAlpha.length !== 6) {
    return false;
  }
  const base = facts.compactAlpha.slice(0, 3);
  const quote = facts.compactAlpha.slice(3, 6);
  return CURRENCY_CODES.has(base) && CURRENCY_CODES.has(quote);
};

const isCryptoPairSymbol = (facts: SymbolFacts): boolean => {
  const value = facts.compactAlphaNumeric;
  if (!value) {
    return false;
  }
  if (CRYPTO_STABLE_QUOTES.some((quote) => value.endsWith(quote) && value.length > quote.length)) {
    return true;
  }
  if (!value.endsWith('USD') || value.length <= 3) {
    return false;
  }
  const base = value.slice(0, -3);
  return CRYPTO_BASE_HINTS.has(base);
};

const isCryptoPerpText = (text: string): boolean =>
  hasKeyword(text, ['perp', 'perpetual', 'swap', '永续', '合约']) || /\bperp\b/.test(text);

const isForexMicroText = (text: string): boolean =>
  hasKeyword(text, ['micro lot', 'micro-lot', 'micro', 'mini lot', '迷你手', '微型手', '1000']);

const isChinaFinancialFutureSymbol = (facts: SymbolFacts): boolean => {
  if (/^T\d{3,6}$/.test(facts.compactAlphaNumeric)) {
    return true;
  }
  return CHINA_FINANCIAL_FUTURE_PREFIXES.some((prefix) => new RegExp(`^${prefix}\\d{3,6}$`).test(facts.compactAlphaNumeric));
};

const isChinaCommodityFutureSymbol = (facts: SymbolFacts): boolean =>
  CHINA_COMMODITY_FUTURE_PREFIXES.some((prefix) => new RegExp(`^${prefix}\\d{3,6}$`).test(facts.compactAlphaNumeric));

const isGlobalFinancialFutureSymbol = (facts: SymbolFacts): boolean =>
  GLOBAL_FINANCIAL_FUTURE_PREFIXES.some((prefix) =>
    new RegExp(`^${prefix}[${FUTURES_MONTH_CODES}]\\d{1,2}$`).test(facts.compactAlphaNumeric)
  );

const isGlobalCommodityFutureSymbol = (facts: SymbolFacts): boolean =>
  GLOBAL_COMMODITY_FUTURE_PREFIXES.some((prefix) =>
    new RegExp(`^${prefix}[${FUTURES_MONTH_CODES}]\\d{1,2}$`).test(facts.compactAlphaNumeric)
  );

const scoreTextKeywords = (text: string, scores: Map<InferredMarketPresetId, number>, weight: number) => {
  PRESET_IDS.forEach((presetId) => {
    if (hasKeyword(text, MARKET_KEYWORDS_BY_PRESET[presetId])) {
      addScore(scores, presetId, weight);
    }
  });
};

const scoreStockSymbol = (facts: SymbolFacts, rawTextUpper: string, scores: Map<InferredMarketPresetId, number>) => {
  const symbolUpper = facts.symbolUpper;
  if (
    matchesAny(symbolUpper, [
      /^(?:SH|SZ|BJ)[._-]?\d{5,6}$/,
      /^\d{6}\.(?:SH|SZ|SS)$/,
      /^(?:SHSE|SZSE)[._-]?\d{6}$/
    ]) ||
    matchesAny(rawTextUpper, [
      /^(?:SH|SZ|BJ)[._-]?\d{5,6}$/,
      /^\d{6}\.(?:SH|SZ|SS)$/,
      /^(?:SHSE|SZSE)[._-]?\d{6}$/
    ])
  ) {
    addScore(scores, 'A_SHARE', 12);
  }
  if (matchesAny(rawTextUpper, [/^\d{4,5}\.HK$/, /^HK\.\d{4,5}$/, /^HK[._-]?\d{4,5}$/])) {
    addScore(scores, 'HK_STOCK', 12);
  }
  if (matchesAny(rawTextUpper, [/^[A-Z]{1,5}\.US$/, /^US\.[A-Z]{1,5}$/])) {
    addScore(scores, 'US_STOCK', 12);
  }
  if (matchesAny(rawTextUpper, [/^\d{4}\.(?:JP|T)$/, /^JP\.\d{4}$/])) {
    addScore(scores, 'JP_STOCK', 12);
  }
  if (matchesAny(rawTextUpper, [/^\d{6}\.(?:KR|KS|KQ)$/, /^KR\.\d{6}$/])) {
    addScore(scores, 'KR_STOCK', 12);
  }
  if (matchesAny(rawTextUpper, [/^\d{4}\.(?:TW|TWO|TPE|TWSE)$/, /^TW\.\d{4}$/])) {
    addScore(scores, 'TW_STOCK', 12);
  }

  if (/^\d{6}$/.test(facts.compactDigits) && facts.compactAlphaNumeric === facts.compactDigits) {
    addScore(scores, 'A_SHARE', 2);
  }
};

const scoreSymbolFacts = (
  facts: SymbolFacts,
  rawTextLower: string,
  rawTextUpper: string,
  scores: Map<InferredMarketPresetId, number>
  ) => {
  scoreStockSymbol(facts, rawTextUpper, scores);

  if (isForexPairSymbol(facts)) {
    addScore(scores, isForexMicroText(rawTextLower) ? 'FOREX_MICRO_LOT' : 'FOREX_STANDARD_LOT', 12);
  }

  if (isCryptoPairSymbol(facts)) {
    addScore(scores, isCryptoPerpText(rawTextLower) ? 'CRYPTO_USDT_PERP' : 'CRYPTO_SPOT', 11);
  }

  if (isChinaFinancialFutureSymbol(facts) || isGlobalFinancialFutureSymbol(facts)) {
    addScore(scores, 'FUTURES_FINANCIAL', 10);
  }

  if (isChinaCommodityFutureSymbol(facts) || isGlobalCommodityFutureSymbol(facts)) {
    addScore(scores, 'FUTURES_COMMODITY', 10);
  }
};

const chooseBestPreset = (scores: Map<InferredMarketPresetId, number>): InferredMarketPresetId | null => {
  const ranked = PRESET_IDS
    .map((presetId) => ({
      presetId,
      score: scores.get(presetId) ?? 0
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.presetId.localeCompare(right.presetId, 'en');
    });

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < IMPORT_INFERENCE_MIN_SCORE) {
    return null;
  }
  if (second && best.score - second.score < IMPORT_INFERENCE_MIN_LEAD) {
    return null;
  }
  return best.presetId;
};

export const inferFreeReplayEnvironmentSuggestion = ({
  folderName,
  folderPath,
  files
}: InferFreeReplayEnvironmentSuggestionInput): FreeReplayEnvironmentSuggestion | null => {
  const scores = new Map<InferredMarketPresetId, number>();
  const normalizedFiles = Array.isArray(files) ? files : [];
  const folderTextLower = normalizeLowerText(folderName, folderPath);
  const plainSixDigitSymbolCount = normalizedFiles.filter((file) => /^\d{6}$/.test(String(file.symbol || '').trim())).length;
  const plainUsTickerCount = normalizedFiles.filter((file) => /^[A-Z]{1,5}$/.test(String(file.symbol || '').trim().toUpperCase())).length;
  const forexPairCount = normalizedFiles.filter((file) => isForexPairSymbol(buildSymbolFacts(file.symbol))).length;
  const cryptoPairCount = normalizedFiles.filter((file) => isCryptoPairSymbol(buildSymbolFacts(file.symbol))).length;
  const cryptoPerpCount = normalizedFiles.filter((file) => isCryptoPerpText(normalizeLowerText(file.originalname, file.relativePath))).length;

  scoreTextKeywords(folderTextLower, scores, 8);

  normalizedFiles.forEach((file) => {
    const rawTextUpper = String(file.originalname || file.relativePath || file.symbol || '').trim().toUpperCase();
    const rawTextLower = normalizeLowerText(file.originalname, file.relativePath, file.symbol);
    const signalTextLower = normalizeLowerText(file.originalname, file.relativePath, file.symbol, folderName, folderPath);
    const facts = buildSymbolFacts(file.symbol || file.originalname);
    scoreTextKeywords(rawTextLower, scores, 3);
    scoreSymbolFacts(facts, signalTextLower, rawTextUpper, scores);
  });

  if (normalizedFiles.length > 0) {
    const confidenceBase = normalizedFiles.length >= 3 ? 7 : 5;
    if (plainSixDigitSymbolCount >= Math.min(2, normalizedFiles.length) && plainSixDigitSymbolCount / normalizedFiles.length >= 0.6) {
      addScore(scores, 'A_SHARE', confidenceBase);
    }
    if (plainUsTickerCount >= 3 && plainUsTickerCount / normalizedFiles.length >= 0.6) {
      addScore(scores, 'US_STOCK', confidenceBase);
    }
    if (forexPairCount >= Math.min(2, normalizedFiles.length) && forexPairCount / normalizedFiles.length >= 0.6) {
      addScore(scores, isForexMicroText(folderTextLower) ? 'FOREX_MICRO_LOT' : 'FOREX_STANDARD_LOT', confidenceBase);
    }
    if (cryptoPairCount >= Math.min(2, normalizedFiles.length) && cryptoPairCount / normalizedFiles.length >= 0.6) {
      addScore(scores, cryptoPerpCount > 0 || isCryptoPerpText(folderTextLower) ? 'CRYPTO_USDT_PERP' : 'CRYPTO_SPOT', confidenceBase);
    }
  }

  const presetId = chooseBestPreset(scores);
  if (!presetId) {
    return null;
  }
  return {
    assetClass: PRESET_ASSET_CLASS_BY_ID[presetId],
    marketPresetId: presetId
  };
};
