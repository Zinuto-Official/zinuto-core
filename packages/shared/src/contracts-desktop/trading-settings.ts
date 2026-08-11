// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";
import { INPUT_LIMITS } from "../input-limits.js";

const assetClassSchema = z.enum(["STOCK", "FUTURES", "FOREX", "CRYPTO"]);
const tradingPresetNameStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(INPUT_LIMITS.tradingPresetNameChars);
const positiveNumberSchema = z.number().finite().positive();

export const desktopTradingSettingsSchema = z
  .object({
    assetClass: assetClassSchema,
    marketPresetId: tradingPresetNameStringSchema,
    minTradeStep: positiveNumberSchema,
    initialSecuritiesBalance: positiveNumberSchema,
    allowShortSelling: z.boolean(),
    tradeSettlementMode: z.enum(["T0", "T1"]),
    freeReplayEndSettlementMode: z.enum([
      "FORCE_CLOSE",
      "CURRENT_TOTAL_ASSET",
    ]),
  })
  .passthrough();
