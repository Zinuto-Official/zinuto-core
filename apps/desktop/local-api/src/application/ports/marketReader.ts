// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import type { MarketBarFrame, OhlcvBar } from '../../domain/models.js';

export type MarketFrameReadOptions = {
  displayPeriod?: DisplayPeriodKey | string;
  anchorRawIndex?: number;
  anchorDisplayIndex?: number;
  direction?: 'FORWARD' | 'BACKWARD';
  before?: number;
  after?: number;
  maxDisplayBars?: number;
};

export type MarketReaderPort = {
  getBarCount(instrumentId: string): Promise<number>;
  getBarsByInstrumentId(instrumentId: string): Promise<OhlcvBar[]>;
  getBarsByInstrumentIdRange(
    instrumentId: string,
    offset: number,
    limit: number,
  ): Promise<OhlcvBar[]>;
  getBarsFrameByInstrumentId(
    instrumentId: string,
    offset: number,
    limit: number,
    options?: MarketFrameReadOptions,
  ): Promise<MarketBarFrame>;
};
