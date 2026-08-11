// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  ADD_TRADING_FEE_TEMPLATE_OPTION_ID,
  normalizeTradingMarketPresetTemplateName,
  type TradingAssetClassId,
  type TradingCustomFeeTemplateMeta,
  type TradingMarketPresetId,
  type TradingMarketPresetValues,
  type TradingMarketPresetValuesByKey
} from '@/domains/trainer/tradingMarketPresets';

type UseAppTradingMarketPresetSelectionActionsArgs = {
  tradingAssetClass: TradingAssetClassId;
  activeTradingMarketPresetValues: TradingMarketPresetValues;
  resolveFallbackTradingMarketPresetId: (
    assetClass: TradingAssetClassId,
    options?: {
      excludeId?: string;
    }
  ) => TradingMarketPresetId;
  resolveTradingMarketPresetValues: (presetId: TradingMarketPresetId) => TradingMarketPresetValues;
  resolveTradingMarketPresetValuesForAssetClass: (
    presetId: TradingMarketPresetId,
    assetClass: TradingAssetClassId
  ) => TradingMarketPresetValues;
  applyTradingMarketPresetValues: (values: TradingMarketPresetValues) => void;
  createTradingCustomTemplateId: () => string;
  buildNextTradingCustomTemplateName: (templates: TradingCustomFeeTemplateMeta[]) => string;
  setTradingAssetClass: Dispatch<SetStateAction<TradingAssetClassId>>;
  setTradingMarketPresetKey: Dispatch<SetStateAction<TradingMarketPresetId>>;
  setTradingMarketPresetCustomTemplates: Dispatch<SetStateAction<TradingCustomFeeTemplateMeta[]>>;
  setTradingMarketPresetValuesByKey: Dispatch<SetStateAction<TradingMarketPresetValuesByKey>>;
};

export const useAppTradingMarketPresetSelectionActions = ({
  tradingAssetClass,
  activeTradingMarketPresetValues,
  resolveFallbackTradingMarketPresetId,
  resolveTradingMarketPresetValues,
  resolveTradingMarketPresetValuesForAssetClass,
  applyTradingMarketPresetValues,
  createTradingCustomTemplateId,
  buildNextTradingCustomTemplateName,
  setTradingAssetClass,
  setTradingMarketPresetKey,
  setTradingMarketPresetCustomTemplates,
  setTradingMarketPresetValuesByKey
}: UseAppTradingMarketPresetSelectionActionsArgs) => {
  const handleTradingAssetClassChange = useCallback(
    (nextClass: TradingAssetClassId) => {
      setTradingAssetClass(nextClass);
      const fallbackPresetId = resolveFallbackTradingMarketPresetId(nextClass);
      setTradingMarketPresetKey(fallbackPresetId);
      applyTradingMarketPresetValues(
        resolveTradingMarketPresetValuesForAssetClass(fallbackPresetId, nextClass)
      );
    },
    [
      applyTradingMarketPresetValues,
      resolveFallbackTradingMarketPresetId,
      resolveTradingMarketPresetValuesForAssetClass,
      setTradingAssetClass,
      setTradingMarketPresetKey
    ]
  );

  const createTradingCustomTemplateFromCurrent = useCallback(
    (nameInput?: string) => {
      const nextTemplateId = createTradingCustomTemplateId();
      const normalizedName = normalizeTradingMarketPresetTemplateName(nameInput);
      setTradingMarketPresetCustomTemplates((current) => [
        ...current,
        {
          id: nextTemplateId,
          name:
            normalizedName ||
            normalizeTradingMarketPresetTemplateName(
              buildNextTradingCustomTemplateName(current),
            ),
          assetClass: tradingAssetClass
        }
      ]);
      setTradingMarketPresetValuesByKey((current) => {
        return {
          ...current,
          [nextTemplateId]: { ...activeTradingMarketPresetValues, assetClass: tradingAssetClass }
        };
      });
      setTradingMarketPresetKey(nextTemplateId);
    },
    [
      activeTradingMarketPresetValues,
      buildNextTradingCustomTemplateName,
      createTradingCustomTemplateId,
      setTradingMarketPresetCustomTemplates,
      setTradingMarketPresetKey,
      setTradingMarketPresetValuesByKey,
      tradingAssetClass
    ]
  );

  const handleCreateTradingMarketPresetFromCurrent = useCallback(
    () => createTradingCustomTemplateFromCurrent(),
    [createTradingCustomTemplateFromCurrent]
  );

  const handleTradingMarketPresetKeyChange = useCallback(
    (nextKey: TradingMarketPresetId) => {
      if (nextKey === ADD_TRADING_FEE_TEMPLATE_OPTION_ID) {
        createTradingCustomTemplateFromCurrent();
        return;
      }
      setTradingMarketPresetKey(nextKey);
      const nextPresetValues = resolveTradingMarketPresetValues(nextKey);
      applyTradingMarketPresetValues(nextPresetValues);
    },
    [applyTradingMarketPresetValues, createTradingCustomTemplateFromCurrent, resolveTradingMarketPresetValues, setTradingMarketPresetKey]
  );

  return {
    createTradingCustomTemplateFromCurrent,
    handleTradingAssetClassChange,
    handleCreateTradingMarketPresetFromCurrent,
    handleTradingMarketPresetKeyChange
  };
};
