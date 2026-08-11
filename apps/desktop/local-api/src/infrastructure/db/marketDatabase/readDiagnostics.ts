// SPDX-License-Identifier: GPL-3.0-only

type MarketReadDiagnostics = {
  fullRawReadCount: number;
  rangeReadCount: number;
  displayContainingReadCount: number;
  displayIndexReadCount: number;
};

let marketReadDiagnostics: MarketReadDiagnostics = {
  fullRawReadCount: 0,
  rangeReadCount: 0,
  displayContainingReadCount: 0,
  displayIndexReadCount: 0,
};

export const resetMarketReadDiagnostics = (): void => {
  marketReadDiagnostics = {
    fullRawReadCount: 0,
    rangeReadCount: 0,
    displayContainingReadCount: 0,
    displayIndexReadCount: 0,
  };
};

export const getMarketReadDiagnostics = (): MarketReadDiagnostics => ({
  ...marketReadDiagnostics,
});

export const incrementMarketReadDiagnostic = (key: keyof MarketReadDiagnostics): void => {
  marketReadDiagnostics[key] += 1;
};
