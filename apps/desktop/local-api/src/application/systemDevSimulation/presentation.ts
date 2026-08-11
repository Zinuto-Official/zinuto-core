// SPDX-License-Identifier: GPL-3.0-only

import type { SystemDevSimulationCopyLanguage } from "@zinuto/shared/systemDevSimulationCopy";
import type { SystemDevSimulationFreeReplayArchetype } from "@zinuto/shared/systemDevSimulationProfiles";
import type { SpecialTrainingModeId } from "../specialTrainingService.js";

type DisplayLanguage = SystemDevSimulationCopyLanguage;
type BacktestStyle = "TREND" | "PULLBACK" | "REVERSAL";

type PresentationCopy = {
  timeframe: Record<string, string>;
  freeReplay: Record<SystemDevSimulationFreeReplayArchetype, string>;
  fastDecisionBank: string;
  riskDisciplineBank: string;
  indicators: Record<string, string>;
  backtests: Record<BacktestStyle, string>;
};

const PRESENTATION_COPY: Record<DisplayLanguage, PresentationCopy> = {
  "zh-CN": {
    timeframe: { "1m": "1 分钟", "5m": "5 分钟", "15m": "15 分钟", "30m": "30 分钟", "1h": "1 小时", "4h": "4 小时", "1d": "日线", "1w": "周线" },
    freeReplay: {
      TREND_CONTINUATION: "趋势跟随",
      FALSE_BREAKOUT: "突破失败复盘",
      RANGE_ROTATION: "区间交易",
      MEAN_REVERSION: "均值回归",
      SHORT_OPPORTUNITY: "空头机会",
      SCALE_IN_OUT: "分批进出",
      WATCH_ONLY: "观察清单",
      FORCED_EXIT: "强制离场复盘",
    },
    fastDecisionBank: "盘感练习",
    riskDisciplineBank: "风险复盘",
    indicators: { MACD: "趋势动能", VOL: "成交量结构", ATR: "波动区间", SAR: "趋势跟踪", KDJ: "拐点观察", RSI: "强弱观察" },
    backtests: { TREND: "均线趋势", PULLBACK: "回踩跟随", REVERSAL: "结构反转" },
  },
  en: {
    timeframe: { "1m": "1 min", "5m": "5 min", "15m": "15 min", "30m": "30 min", "1h": "1 hour", "4h": "4 hours", "1d": "Daily", "1w": "Weekly" },
    freeReplay: {
      TREND_CONTINUATION: "Trend Follow-through",
      FALSE_BREAKOUT: "Failed Breakout Review",
      RANGE_ROTATION: "Range Rotation",
      MEAN_REVERSION: "Mean Reversion",
      SHORT_OPPORTUNITY: "Short Setup",
      SCALE_IN_OUT: "Scale In / Out",
      WATCH_ONLY: "Watchlist Review",
      FORCED_EXIT: "Forced Exit Review",
    },
    fastDecisionBank: "Market Sense",
    riskDisciplineBank: "Risk Review",
    indicators: { MACD: "Trend Momentum", VOL: "Volume Structure", ATR: "Volatility Range", SAR: "Trend Tracking", KDJ: "Turning Point", RSI: "Strength Watch" },
    backtests: { TREND: "Moving Average Trend", PULLBACK: "Pullback Follow-through", REVERSAL: "Structure Reversal" },
  },
  ja: {
    timeframe: { "1m": "1分", "5m": "5分", "15m": "15分", "30m": "30分", "1h": "1時間", "4h": "4時間", "1d": "日足", "1w": "週足" },
    freeReplay: {
      TREND_CONTINUATION: "トレンド追随",
      FALSE_BREAKOUT: "ブレイク失敗の振り返り",
      RANGE_ROTATION: "レンジ回転",
      MEAN_REVERSION: "平均回帰",
      SHORT_OPPORTUNITY: "ショート機会",
      SCALE_IN_OUT: "分割エントリー・決済",
      WATCH_ONLY: "ウォッチリスト確認",
      FORCED_EXIT: "強制決済の振り返り",
    },
    fastDecisionBank: "相場感トレーニング",
    riskDisciplineBank: "リスク振り返り",
    indicators: { MACD: "トレンドモメンタム", VOL: "出来高構造", ATR: "ボラティリティ幅", SAR: "トレンド追跡", KDJ: "転換点観察", RSI: "強弱確認" },
    backtests: { TREND: "移動平均トレンド", PULLBACK: "押し目追随", REVERSAL: "構造反転" },
  },
  ko: {
    timeframe: { "1m": "1분", "5m": "5분", "15m": "15분", "30m": "30분", "1h": "1시간", "4h": "4시간", "1d": "일봉", "1w": "주봉" },
    freeReplay: {
      TREND_CONTINUATION: "추세 추종",
      FALSE_BREAKOUT: "돌파 실패 복기",
      RANGE_ROTATION: "박스권 순환",
      MEAN_REVERSION: "평균 회귀",
      SHORT_OPPORTUNITY: "숏 기회",
      SCALE_IN_OUT: "분할 진입·청산",
      WATCH_ONLY: "관찰 목록 점검",
      FORCED_EXIT: "강제 청산 복기",
    },
    fastDecisionBank: "시장 감각 훈련",
    riskDisciplineBank: "리스크 복기",
    indicators: { MACD: "추세 모멘텀", VOL: "거래량 구조", ATR: "변동성 구간", SAR: "추세 추적", KDJ: "전환점 관찰", RSI: "강도 확인" },
    backtests: { TREND: "이동평균 추세", PULLBACK: "눌림목 추종", REVERSAL: "구조 반전" },
  },
  es: {
    timeframe: { "1m": "1 min", "5m": "5 min", "15m": "15 min", "30m": "30 min", "1h": "1 hora", "4h": "4 horas", "1d": "Diario", "1w": "Semanal" },
    freeReplay: {
      TREND_CONTINUATION: "Seguimiento de tendencia",
      FALSE_BREAKOUT: "Revisión de ruptura fallida",
      RANGE_ROTATION: "Rotación en rango",
      MEAN_REVERSION: "Reversión a la media",
      SHORT_OPPORTUNITY: "Oportunidad corta",
      SCALE_IN_OUT: "Entradas y salidas parciales",
      WATCH_ONLY: "Revisión de lista",
      FORCED_EXIT: "Revisión de salida forzada",
    },
    fastDecisionBank: "Lectura de mercado",
    riskDisciplineBank: "Revisión de riesgo",
    indicators: { MACD: "Impulso de tendencia", VOL: "Estructura de volumen", ATR: "Rango de volatilidad", SAR: "Seguimiento de tendencia", KDJ: "Punto de giro", RSI: "Fuerza relativa" },
    backtests: { TREND: "Tendencia de medias", PULLBACK: "Seguimiento del retroceso", REVERSAL: "Reversión de estructura" },
  },
};

const resolveCopy = (language: DisplayLanguage): PresentationCopy =>
  PRESENTATION_COPY[language] ?? PRESENTATION_COPY["zh-CN"];

const displayTimeframe = (language: DisplayLanguage, timeframe: string): string =>
  resolveCopy(language).timeframe[timeframe] ?? timeframe;

export const buildRealisticFreeReplayProjectName = (input: {
  language: DisplayLanguage;
  fallbackName: string;
  symbol: string;
  timeframe: string;
  archetype: SystemDevSimulationFreeReplayArchetype;
}): string => {
  const copy = resolveCopy(input.language);
  return `${input.fallbackName} · ${input.symbol} · ${copy.freeReplay[input.archetype]} · ${displayTimeframe(input.language, input.timeframe)}`;
};

export const buildRealisticTrainingBankName = (input: {
  language: DisplayLanguage;
  modeId: SpecialTrainingModeId;
  symbol: string;
  timeframe: string;
}): string => {
  const copy = resolveCopy(input.language);
  const title = input.modeId === "fast-decision-training"
    ? copy.fastDecisionBank
    : copy.riskDisciplineBank;
  return `${title} · ${input.symbol} · ${displayTimeframe(input.language, input.timeframe)}`;
};

export const buildRealisticIndicatorName = (input: {
  language: DisplayLanguage;
  templateId: string;
  ordinal: number;
}): string => {
  const copy = resolveCopy(input.language);
  const label = copy.indicators[input.templateId] ?? input.templateId;
  return input.ordinal > 1
    ? `${input.templateId} · ${label} ${input.ordinal}`
    : `${input.templateId} · ${label}`;
};

export const buildRealisticBacktestName = (input: {
  language: DisplayLanguage;
  symbol: string;
  timeframe: string;
  style: BacktestStyle;
}): string => {
  const copy = resolveCopy(input.language);
  return `${input.symbol} · ${copy.backtests[input.style]} · ${displayTimeframe(input.language, input.timeframe)}`;
};

export const resolveRealisticBacktestStyle = (index: number): BacktestStyle =>
  (["TREND", "PULLBACK", "REVERSAL"] as const)[Math.abs(index) % 3]!;
