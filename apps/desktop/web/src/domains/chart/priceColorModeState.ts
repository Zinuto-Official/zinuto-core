// SPDX-License-Identifier: GPL-3.0-only

import { resolvePriceColorPalette } from "@/ui/theme/visual/priceColorTokens";

export type PriceColorMode = "RED_UP_GREEN_DOWN" | "GREEN_UP_RED_DOWN";

let globalPriceColorMode: PriceColorMode = "RED_UP_GREEN_DOWN";

export const setGlobalPriceColorMode = (mode: PriceColorMode) => {
  globalPriceColorMode = mode;
};

export const getGlobalPriceColorMode = (): PriceColorMode =>
  globalPriceColorMode;

export const getPriceColorPalette = (
  mode: PriceColorMode = globalPriceColorMode,
) => resolvePriceColorPalette(mode);
