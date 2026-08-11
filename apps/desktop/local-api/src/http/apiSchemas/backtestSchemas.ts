// SPDX-License-Identifier: GPL-3.0-only

import {
  desktopBacktestBatchCreateRequestSchema,
  desktopBacktestBatchRunRequestSchema,
} from '@zinuto/shared/contracts-desktop/api';

export const createBacktestBatchSchema =
  desktopBacktestBatchCreateRequestSchema;

export const runBacktestBatchSchema =
  desktopBacktestBatchRunRequestSchema;
