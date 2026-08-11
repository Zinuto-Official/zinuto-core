// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopMarketDataAcquisitionConnectorCatalog,
  DesktopMarketDataAcquisitionJob,
  DesktopMarketDataAcquisitionJobCreateRequest,
} from '@zinuto/shared/contracts-desktop/api';

export type AcquisitionRequest = DesktopMarketDataAcquisitionJobCreateRequest;
export type AcquisitionJob = DesktopMarketDataAcquisitionJob;
export type AcquisitionConnectorCatalog = DesktopMarketDataAcquisitionConnectorCatalog;

export type CanonicalMarketBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AcquisitionFetchInput = {
  jobId: string;
  request: AcquisitionRequest;
  symbol: string;
  signal: AbortSignal;
  onRetryWait?: (progress: { attempt: number; retryAfterMs: number }) => void;
  onRetryResume?: () => void;
};

export type AcquisitionConnectorAdapter = {
  readonly id: 'akshare' | 'ccxt';
  isAvailable(): boolean;
  fetchSymbol(input: AcquisitionFetchInput): Promise<CanonicalMarketBar[]>;
  finishJob?(jobId: string): Promise<void>;
};

export type CcxtAcquisitionMarket = {
  symbol: string;
  base: string;
  quote: string;
  active: true;
};

export type CcxtAcquisitionAdapter = AcquisitionConnectorAdapter & {
  readonly id: 'ccxt';
  listMarkets(
    exchangeId: 'binance' | 'okx',
    query: string,
  ): Promise<{ markets: CcxtAcquisitionMarket[]; cachedAt: string }>;
};

export type AcquisitionManifestFile = {
  relativePath: string;
  kind: 'DATA' | 'SOURCE_NOTICE';
  bytes: number;
  sha256: string;
};

export type AcquisitionManifest = {
  schemaVersion: 1;
  jobId: string;
  connectorId: 'akshare' | 'ccxt';
  outputFolderName: string;
  createdAt: string;
  request: {
    market: 'A_SHARE' | 'CRYPTO_SPOT';
    timeframe: '1m' | '5m' | '1h' | '1d';
    startAt: string;
    endAt: string;
    adjustment: 'none' | 'qfq' | 'hfq' | null;
    exchangeId: 'binance' | 'okx' | null;
    symbols: string[];
  };
  fileCount: number;
  totalBytes: number;
  files: AcquisitionManifestFile[];
};

export class AcquisitionRuntimeError extends Error {
  readonly code: string;
  readonly args: Record<string, string | number | boolean | null>;

  constructor(
    code: string,
    args: Record<string, string | number | boolean | null> = {},
  ) {
    super(code);
    this.name = 'AcquisitionRuntimeError';
    this.code = code;
    this.args = args;
  }
}

export const throwIfAcquisitionCanceled = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new AcquisitionRuntimeError('ACQUISITION_CANCELED');
  }
};
