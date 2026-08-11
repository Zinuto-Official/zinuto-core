// SPDX-License-Identifier: GPL-3.0-only

import type { FontSizePreset, UiLanguage } from "@/frontend-kernel/typography";
import { useEffect } from 'react';
import { setGlobalTradeColorTheme, type TradeColorThemeToken } from '@/ui/theme/visualColors';
import { setGlobalDecimalDisplay } from '@/ui/formatting/format';
import {
  setGlobalPriceColorMode,
  type PriceColorMode,
} from '@/domains/chart/priceColorModeState';
import { setGlobalTypographyContext } from '@/frontend-kernel/typography';

type UseChartGlobalDisplaySyncArgs = {
  showGlobalDecimals: boolean;
  priceColorMode: PriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
  language: UiLanguage;
  fontSizePreset: FontSizePreset;
};

export const useChartGlobalDisplaySync = ({
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
  language,
  fontSizePreset,
}: UseChartGlobalDisplaySyncArgs) => {
  useEffect(() => {
    setGlobalDecimalDisplay(showGlobalDecimals);
  }, [showGlobalDecimals]);

  useEffect(() => {
    setGlobalPriceColorMode(priceColorMode);
  }, [priceColorMode]);

  useEffect(() => {
    setGlobalTradeColorTheme(tradeColorTheme);
  }, [tradeColorTheme]);

  useEffect(() => {
    setGlobalTypographyContext({
      language,
      fontSizePreset,
    });
  }, [fontSizePreset, language]);
};
