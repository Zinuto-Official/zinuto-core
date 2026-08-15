// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import {
  desktopMarketDataAcquisitionJobCreateRequestSchema,
  desktopMarketDataAcquisitionMarketIdSchema,
  desktopMarketDataAcquisitionMarketJobCreateRequestSchema,
  desktopMarketDataAcquisitionSourcePlanIdSchema,
} from '@zinuto/shared/contracts-desktop/api';

export const marketDataAcquisitionJobCreateSchema =
  desktopMarketDataAcquisitionJobCreateRequestSchema;
export const marketDataAcquisitionMarketJobCreateSchema =
  desktopMarketDataAcquisitionMarketJobCreateRequestSchema;

export const ccxtAcquisitionMarketQuerySchema = z
  .object({
    exchangeId: z.enum(['binance', 'okx']),
    query: z.string().trim().max(64).optional().default(''),
  })
  .strict();

export const marketAcquisitionInstrumentsQuerySchema = z
  .object({
    sourcePlanId: desktopMarketDataAcquisitionSourcePlanIdSchema.optional(),
    query: z.string().trim().max(64).optional().default(''),
    cursor: z.string().trim().regex(/^\d+$/u).max(16).optional().default('0'),
    refresh: z.enum(['true', 'false']).optional().default('false'),
  })
  .strict()
  .transform((input) => ({ ...input, refresh: input.refresh === 'true' }));

export const marketAcquisitionMarketParamsSchema = z
  .object({ marketId: desktopMarketDataAcquisitionMarketIdSchema })
  .strict();
