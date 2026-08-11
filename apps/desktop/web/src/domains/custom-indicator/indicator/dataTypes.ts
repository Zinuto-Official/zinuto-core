// SPDX-License-Identifier: GPL-3.0-only

export type Bar = {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
};

export type Series<T> = T[];

export type NumericSeries = Series<number>;
export type BooleanSeries = Series<boolean>;

export type NumericOperand = number | NumericSeries;
export type BooleanOperand = boolean | BooleanSeries;

export type RuntimeFieldAlias =
  | 'OPEN'
  | 'O'
  | 'HIGH'
  | 'H'
  | 'LOW'
  | 'L'
  | 'CLOSE'
  | 'C'
  | 'VOL'
  | 'V'
  | 'AMOUNT';

export type RuntimeSeriesContext = {
  length: number;
  bars: Bar[];
  OPEN: NumericSeries;
  O: NumericSeries;
  HIGH: NumericSeries;
  H: NumericSeries;
  LOW: NumericSeries;
  L: NumericSeries;
  CLOSE: NumericSeries;
  C: NumericSeries;
  VOL: NumericSeries;
  V: NumericSeries;
  AMOUNT: NumericSeries;
};
