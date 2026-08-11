// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useCallback } from 'react';
import {
  formatBuySellCountText,
  formatCountWithUnitText,
  formatLabelValueText,
  formatLotsAndSharesText,
  formatSlashJoinedText,
  isCompactScriptLanguage
} from '@/ui/formatting/i18nDisplay';
import { formatMessageByLanguage } from '@/frontend-kernel/i18n/messageRuntime';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';

type UseLocalizedDisplayTextModelResult = {
  compactScriptLanguage: boolean;
  withLabelValue: (label: string, value: string | number) => string;
  withCountUnit: (count: string | number, unit: string) => string;
  withLotsAndShares: (lots: string | number, shares: string | number) => string;
  withBuySellCount: (buyCount: string | number, sellCount: string | number) => string;
};

export const useLocalizedDisplayTextModel = (
  language: UiLanguage
): UseLocalizedDisplayTextModelResult => {
  const tt = useCallback(
    (key: AppTextKey) => formatMessageByLanguage(language, key),
    [language]
  );
  const compactScriptLanguage = isCompactScriptLanguage(language);

  const withLabelValue = useCallback(
    (label: string, value: string | number) => formatLabelValueText(language, label, value),
    [language]
  );

  const withCountUnit = useCallback(
    (count: string | number, unit: string) => formatCountWithUnitText(language, count, unit),
    [language]
  );

  const withLotsAndShares = useCallback(
    (lots: string | number, shares: string | number) =>
      formatLotsAndSharesText(language, lots, tt('appText.lots2'), shares, tt('appText.shares')),
    [language]
  );

  const withBuySellCount = useCallback(
    (buyCount: string | number, sellCount: string | number) => {
      if (compactScriptLanguage) {
        const compactSellLabelRaw = tt('appText.timesSell');
        const compactSellLabel =
          compactSellLabelRaw.includes('/') ? (compactSellLabelRaw.split('/').pop() || '').trim() : tt('appText.sell3');
        const sellLabel = compactSellLabel || tt('appText.sell3');
        return formatSlashJoinedText(language, [`${tt('appText.buy2')} ${buyCount}`, `${sellLabel} ${sellCount}`]);
      }
      return formatBuySellCountText(language, tt('appText.buy2'), tt('appText.sell3'), buyCount, sellCount, tt('appText.times'));
    },
    [compactScriptLanguage, language]
  );

  return {
    compactScriptLanguage,
    withLabelValue,
    withCountUnit,
    withLotsAndShares,
    withBuySellCount
  };
};
