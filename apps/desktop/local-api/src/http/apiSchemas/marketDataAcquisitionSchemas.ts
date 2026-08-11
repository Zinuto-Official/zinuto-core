// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { desktopMarketDataAcquisitionJobCreateRequestSchema } from '@zinuto/shared/contracts-desktop/api';

export const marketDataAcquisitionJobCreateSchema =
  desktopMarketDataAcquisitionJobCreateRequestSchema;

export const ccxtAcquisitionMarketQuerySchema = z
  .object({
    exchangeId: z.enum(['binance', 'okx']),
    query: z.string().trim().max(64).optional().default(''),
  })
  .strict();
