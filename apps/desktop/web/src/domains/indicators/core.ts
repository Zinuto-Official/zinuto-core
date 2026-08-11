// SPDX-License-Identifier: GPL-3.0-only

export type SignalIndicatorName = string;

export const INDICATOR_NONE_VALUE = 'NONE' as const;
export const DEFAULT_SIGNAL_TOP_INDICATOR: SignalIndicatorName = 'KDJ';
export const DEFAULT_SIGNAL_BOTTOM_INDICATOR: SignalIndicatorName = 'MACD';

export const MAIN_NATIVE_INDICATOR_WHITELIST = ['CF_MA2', 'MA', 'EMA', 'BOLL', 'SAR'] as const;
type MainNativeIndicatorName = (typeof MAIN_NATIVE_INDICATOR_WHITELIST)[number];

const isSignalIndicatorName = (value: unknown): value is SignalIndicatorName =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeIndicatorCalcParams = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
};

const normalizeMainNativeIndicatorName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return INDICATOR_NONE_VALUE;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return INDICATOR_NONE_VALUE;
  }
  return normalized;
};

const isMainNativeIndicatorName = (value: unknown): value is MainNativeIndicatorName =>
  typeof value === 'string' &&
  (MAIN_NATIVE_INDICATOR_WHITELIST as readonly string[]).includes(value);

export const resolveMainNativeIndicatorState = (value: unknown): string => {
  const normalized = normalizeMainNativeIndicatorName(value);
  return isMainNativeIndicatorName(normalized) ? normalized : INDICATOR_NONE_VALUE;
};

export const resolveSignalIndicatorState = (
  value: unknown,
  fallback: SignalIndicatorName = INDICATOR_NONE_VALUE
): SignalIndicatorName => (isSignalIndicatorName(value) ? value : fallback);

export type SubIndicatorToggleState = {
  showSubIndicators: boolean;
  signalTopIndicator: SignalIndicatorName;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: SignalIndicatorName;
  signalBottomIndicatorParams: number[];
};

export const resolveSubIndicatorToggleState = ({
  showSubIndicators,
  signalTopIndicator,
  signalTopIndicatorParams,
  signalBottomIndicator,
  signalBottomIndicatorParams
}: SubIndicatorToggleState): SubIndicatorToggleState => {
  if (showSubIndicators) {
    return {
      showSubIndicators: false,
      signalTopIndicator,
      signalTopIndicatorParams,
      signalBottomIndicator,
      signalBottomIndicatorParams
    };
  }

  if (
    signalTopIndicator === INDICATOR_NONE_VALUE &&
    signalBottomIndicator === INDICATOR_NONE_VALUE
  ) {
    return {
      showSubIndicators: true,
      signalTopIndicator: DEFAULT_SIGNAL_TOP_INDICATOR,
      signalTopIndicatorParams: [],
      signalBottomIndicator: DEFAULT_SIGNAL_BOTTOM_INDICATOR,
      signalBottomIndicatorParams: []
    };
  }

  return {
    showSubIndicators: true,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams
  };
};

export const isSameNumericArray = (left: number[], right: number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
