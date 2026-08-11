// SPDX-License-Identifier: GPL-3.0-only

import type { Chart } from "klinecharts";
import { useMemo, useRef } from "react";

import { ttByLanguage, ttfByLanguage } from "@/frontend-kernel/i18n/messageRuntime";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { formatMoney } from "@/ui/formatting/format";
import { TRADE_MARKER_DENSITY_DEFAULT_RATIO } from "@/domains/chart/overlays/tradeMarkerDensityRules";
import {
  createSystemMarkerRenderer,
  type TradeMarkerCompactState,
} from "@/domains/chart/systemMarkerRendering";
import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";

export const useArchivedSystemMarkerRenderer = (
  language: UiLanguage,
): SystemMarkerRenderer => {
  const visibleBarCountCacheRef = useRef<WeakMap<Chart, number>>(new WeakMap());
  const compactStateCacheRef = useRef<WeakMap<Chart, TradeMarkerCompactState>>(new WeakMap());

  return useMemo(
    () =>
      createSystemMarkerRenderer({
        tradeMarkerDensityRatio: TRADE_MARKER_DENSITY_DEFAULT_RATIO,
        resolveTradeAmountIncludesFees: (snapshot) =>
          snapshot.sessionTradingSettings?.tradeAmountIncludesFees === true,
        replayNotes: [],
        formatMoney,
        tt: (key) => ttByLanguage(language, key),
        ttf: (key, values) => ttfByLanguage(language, key, values),
        caches: {
          visibleBarCountCache: visibleBarCountCacheRef.current,
          compactStateCache: compactStateCacheRef.current,
        },
      }),
    [language],
  );
};
