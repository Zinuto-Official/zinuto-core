// SPDX-License-Identifier: GPL-3.0-only

import { createElement, useCallback, useMemo, type ReactNode } from 'react';
import { formatMoneyFixed } from '@/ui/formatting/format';
import { getTradingSettingsText } from '@/ui/config/uiConfig';
import { AppIcon } from '@/assets/graphics';
import { TRADE_MARKER_DENSITY_LEVELS } from '@/domains/chart/overlays/tradeMarkerDensityRules';
import { formatMessageByLanguage } from '@/frontend-kernel/i18n/messageRuntime';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  listBuiltInTradingMarketPresetIdsByAssetClass,
  type TradingAssetClassId,
  type TradingMarketPresetId
} from '@/domains/trainer/tradingMarketPresets';

type UiLanguage = 'en' | 'zh-CN' | 'ja' | 'ko' | 'es';

type UseReplaySettingsViewModelParams = {
  language: UiLanguage;
  tradingAssetClass: TradingAssetClassId;
  tradeMarkerDensityLevelSuffix: string;
};

export const useReplaySettingsViewModel = ({
  language,
  tradingAssetClass,
  tradeMarkerDensityLevelSuffix
}: UseReplaySettingsViewModelParams) => {
  const tt = useCallback(
    (key: AppTextKey) => formatMessageByLanguage(language, key),
    [language]
  );
  const tradingText = getTradingSettingsText(language);

  const replaySettingsDensityOptions = useMemo(
    () =>
      TRADE_MARKER_DENSITY_LEVELS.map((option) => ({
        value: String(option.level),
        label: `${formatMoneyFixed(option.level, 0)}${tradeMarkerDensityLevelSuffix}`
      })),
    [tradeMarkerDensityLevelSuffix]
  );

  const replaySettingsStampDutyOptions = useMemo(
    () => [
      { value: 'BUY' as const, label: tradingText.stampDutyModeOptionLabels.BUY },
      { value: 'SELL' as const, label: tradingText.stampDutyModeOptionLabels.SELL },
      { value: 'DOUBLE' as const, label: tradingText.stampDutyModeOptionLabels.DOUBLE }
    ],
    [tradingText.stampDutyModeOptionLabels]
  );

  const replaySettingsSettlementModeOptions = useMemo(
    () => [
      { value: 'T0' as const, label: tradingText.tradeSettlementModeOptionLabels.T0 },
      { value: 'T1' as const, label: tradingText.tradeSettlementModeOptionLabels.T1 }
    ],
    [tradingText.tradeSettlementModeOptionLabels]
  );

  const replaySettingsFreeReplayEndSettlementModeOptions = useMemo(
    () => [
      {
        value: 'FORCE_CLOSE' as const,
        label: tradingText.freeReplayEndSettlementModeOptionLabels.FORCE_CLOSE
      },
      {
        value: 'CURRENT_TOTAL_ASSET' as const,
        label: tradingText.freeReplayEndSettlementModeOptionLabels.CURRENT_TOTAL_ASSET
      }
    ],
    [tradingText.freeReplayEndSettlementModeOptionLabels]
  );

  const replaySettingsAssetClassOptions = useMemo<
    Array<{ value: TradingAssetClassId; label: string; icon: ReactNode }>
  >(
    () => [
      {
        value: 'STOCK',
        label: tradingText.assetClassLabels.STOCK,
        icon: createElement(AppIcon, { name: 'assetStock', className: 'size-4' })
      },
      {
        value: 'FUTURES',
        label: tradingText.assetClassLabels.FUTURES,
        icon: createElement(AppIcon, { name: 'assetFutures', className: 'size-4' })
      },
      {
        value: 'FOREX',
        label: tradingText.assetClassLabels.FOREX,
        icon: createElement(AppIcon, { name: 'assetForex', className: 'size-4' })
      },
      {
        value: 'CRYPTO',
        label: tradingText.assetClassLabels.CRYPTO,
        icon: createElement(AppIcon, { name: 'assetCrypto', className: 'size-4' })
      }
    ],
    [tradingText.assetClassLabels]
  );

  const replaySettingsMarketPresetOptions = useMemo<Array<{ value: TradingMarketPresetId; label: string }>>(
    () =>
      listBuiltInTradingMarketPresetIdsByAssetClass(tradingAssetClass).map((presetId) => ({
        value: presetId,
        label: tradingText.marketPresetLabels[presetId]
      })),
    [tradingAssetClass, tradingText.marketPresetLabels]
  );

  const replaySettingsPositionCostOptions = useMemo(
    () => [
      { value: 'DILUTED' as const, label: tt('appText.dilutedCost') },
      { value: 'AVERAGE_OPEN' as const, label: tt('appText.averageCost') }
    ],
    [language]
  );

  const replaySettingsTradeAmountOptions = useMemo(
    () => [
      { value: 'EXCLUDE_FEES' as const, label: tt('appText.excludingFees') },
      { value: 'INCLUDE_FEES' as const, label: tt('appText.includingFees') }
    ],
    [language]
  );

  const replaySettingsAllowShortOptions = useMemo(
    () => [
      { value: 'ALLOW' as const, label: tradingText.allowShortSellingOptionLabels.ALLOW },
      { value: 'DISALLOW' as const, label: tradingText.allowShortSellingOptionLabels.DISALLOW }
    ],
    [tradingText.allowShortSellingOptionLabels]
  );
  const replaySettingsAllowLongOptions = useMemo(
    () => [
      {
        value: 'ALLOW' as const,
        label: tradingText.allowLongMarginTradingOptionLabels.ALLOW,
      },
      {
        value: 'DISALLOW' as const,
        label: tradingText.allowLongMarginTradingOptionLabels.DISALLOW,
      },
    ],
    [tradingText.allowLongMarginTradingOptionLabels],
  );

  return {
    replaySettingsDensityOptions,
    replaySettingsStampDutyOptions,
    replaySettingsFreeReplayEndSettlementModeOptions,
    replaySettingsSettlementModeOptions,
    replaySettingsAssetClassOptions,
    replaySettingsMarketPresetOptions,
    replaySettingsPositionCostOptions,
    replaySettingsAllowLongOptions,
    replaySettingsAllowShortOptions,
    replaySettingsTradeAmountOptions
  };
};
