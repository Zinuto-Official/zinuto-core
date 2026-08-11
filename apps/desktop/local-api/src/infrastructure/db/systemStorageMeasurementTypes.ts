// SPDX-License-Identifier: GPL-3.0-only

import type { DatabaseStorageUsageSummary } from './storageUsageSummary.js';
import type { MarketStorageUsageSummary } from './marketStorageUsage.js';

export type SystemStorageMeasurementWorkerInput = {
  dbPath: string;
  marketDbPath: string;
  cacheDir: string;
  tempDir: string;
};

export type SystemStorageMeasurementWorkerResult = {
  metaUsage: DatabaseStorageUsageSummary;
  marketUsage: MarketStorageUsageSummary;
  cacheBytes: number;
  tempBytes: number;
};

export type SystemStorageMeasurementWorkerMessage =
  | {
      type: 'RESULT';
      value: SystemStorageMeasurementWorkerResult;
    }
  | {
      type: 'ERROR';
      message: string;
    };
