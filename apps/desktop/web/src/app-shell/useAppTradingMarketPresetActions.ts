// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { SystemPoolTradingBindingById } from '@/app-shell/appRootPoolTradingBinding';
import {
  ADD_TRADING_FEE_TEMPLATE_OPTION_ID,
  areTradingMarketPresetValuesEqual,
  isBuiltInTradingMarketPresetId,
  normalizeTradingMarketPresetTemplateName,
  resolveBuiltInTradingMarketPresetAssetClass,
  type BuiltInTradingMarketPresetId,
  type TradingAssetClassId,
  type TradingCustomFeeTemplateMeta,
  type TradingMarketPresetLabelOverridesById,
  type TradingMarketPresetId,
  type TradingMarketPresetValues
} from '@/domains/trainer/tradingMarketPresets';

type TradingMarketPresetValuesByKey = Record<TradingMarketPresetId, TradingMarketPresetValues>;

type UseAppTradingMarketPresetActionsArgs = {
  tradingMarketPresetKey: TradingMarketPresetId;
  tradingAssetClass: TradingAssetClassId;
  activeTradingMarketPresetValues: TradingMarketPresetValues;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
  resolveTradingMarketPresetValues: (presetId: TradingMarketPresetId) => TradingMarketPresetValues;
  resolveTradingMarketPresetValuesForAssetClass: (
    presetId: TradingMarketPresetId,
    assetClass: TradingAssetClassId
  ) => TradingMarketPresetValues;
  resolveFallbackTradingMarketPresetId: (
    assetClass: TradingAssetClassId,
    options?: {
      excludeId?: string;
    }
  ) => TradingMarketPresetId;
  createTradingCustomTemplateFromCurrent: (nameInput?: string) => void;
  applyTradingMarketPresetValues: (values: TradingMarketPresetValues) => void;
  listVisibleBuiltInTradingMarketPresetIdsByAssetClass: (
    assetClass: TradingAssetClassId
  ) => BuiltInTradingMarketPresetId[];
  setTradingMarketPresetValuesByKey: Dispatch<SetStateAction<TradingMarketPresetValuesByKey>>;
  setTradingMarketPresetCustomTemplates: Dispatch<SetStateAction<TradingCustomFeeTemplateMeta[]>>;
  setTradingMarketPresetLabelOverridesById: Dispatch<SetStateAction<TradingMarketPresetLabelOverridesById>>;
  setHiddenBuiltInTradingMarketPresetIds: Dispatch<SetStateAction<BuiltInTradingMarketPresetId[]>>;
  setSystemPoolTradingBindingById: Dispatch<SetStateAction<SystemPoolTradingBindingById>>;
  setTradingMarketPresetKey: Dispatch<SetStateAction<TradingMarketPresetId>>;
};

export const useAppTradingMarketPresetActions = ({
  tradingMarketPresetKey,
  tradingAssetClass,
  activeTradingMarketPresetValues,
  tradingMarketPresetCustomTemplates,
  resolveTradingMarketPresetValues,
  resolveTradingMarketPresetValuesForAssetClass,
  resolveFallbackTradingMarketPresetId,
  createTradingCustomTemplateFromCurrent,
  applyTradingMarketPresetValues,
  listVisibleBuiltInTradingMarketPresetIdsByAssetClass,
  setTradingMarketPresetValuesByKey,
  setTradingMarketPresetCustomTemplates,
  setTradingMarketPresetLabelOverridesById,
  setHiddenBuiltInTradingMarketPresetIds,
  setSystemPoolTradingBindingById,
  setTradingMarketPresetKey
}: UseAppTradingMarketPresetActionsArgs) => {
  const handleSaveTradingMarketPresetToCurrent = useCallback(() => {
    if (tradingMarketPresetKey === ADD_TRADING_FEE_TEMPLATE_OPTION_ID) {
      return;
    }
    setTradingMarketPresetValuesByKey((current) => {
      const nextPresetValues: TradingMarketPresetValues = {
        ...activeTradingMarketPresetValues,
        assetClass: tradingAssetClass
      };
      const baseline = current[tradingMarketPresetKey] ?? resolveTradingMarketPresetValues(tradingMarketPresetKey);
      if (areTradingMarketPresetValuesEqual(baseline, nextPresetValues)) {
        return current;
      }
      return { ...current, [tradingMarketPresetKey]: nextPresetValues };
    });
  }, [
    activeTradingMarketPresetValues,
    resolveTradingMarketPresetValues,
    setTradingMarketPresetValuesByKey,
    tradingAssetClass,
    tradingMarketPresetKey
  ]);

  const handleSaveTradingMarketPresetAsNew = useCallback(
    (nameInput: string) => createTradingCustomTemplateFromCurrent(nameInput),
    [createTradingCustomTemplateFromCurrent]
  );

  const handleRenameTradingMarketPresetById = useCallback(
    (presetId: string, value: string) => {
      const targetId = String(presetId ?? '').trim();
      if (!targetId) {
        return;
      }
      const nextName = normalizeTradingMarketPresetTemplateName(value);
      if (isBuiltInTradingMarketPresetId(targetId)) {
        setTradingMarketPresetLabelOverridesById((current) => ({
          ...current,
          [targetId]: nextName
        }));
        return;
      }
      setTradingMarketPresetCustomTemplates((current) =>
        current.map((item) => (item.id === targetId ? { ...item, name: nextName } : item))
      );
    },
    [setTradingMarketPresetCustomTemplates, setTradingMarketPresetLabelOverridesById]
  );

  const handleDeleteTradingMarketPresetById = useCallback(
    (presetId: string) => {
      const deletingId = String(presetId ?? '').trim();
      if (!deletingId) {
        return;
      }
      const isDeletingBuiltIn = isBuiltInTradingMarketPresetId(deletingId);
      const deletingAssetClass = isDeletingBuiltIn
        ? resolveBuiltInTradingMarketPresetAssetClass(deletingId)
        : tradingMarketPresetCustomTemplates.find((item) => item.id === deletingId)?.assetClass ?? tradingAssetClass;
      const visibleBuiltInPresetIds = listVisibleBuiltInTradingMarketPresetIdsByAssetClass(deletingAssetClass).filter(
        (presetKey) => presetKey !== deletingId
      );
      const fallbackCustomPresetId =
        tradingMarketPresetCustomTemplates.find(
          (item) => item.assetClass === deletingAssetClass && item.id !== deletingId
        )?.id ?? '';
      const deletingAssetClassFallbackPresetId = visibleBuiltInPresetIds[0] ?? fallbackCustomPresetId;
      if (!deletingAssetClassFallbackPresetId) {
        return;
      }
      const resolveNextPresetIdByAssetClass = (assetClass: TradingAssetClassId): TradingMarketPresetId => {
        if (assetClass === deletingAssetClass) {
          return deletingAssetClassFallbackPresetId;
        }
        return resolveFallbackTradingMarketPresetId(assetClass, {
          excludeId: deletingId
        });
      };

      if (isDeletingBuiltIn) {
        setHiddenBuiltInTradingMarketPresetIds((current) =>
          current.includes(deletingId) ? current : [...current, deletingId]
        );
      }
      setTradingMarketPresetLabelOverridesById((current) => {
        if (!(deletingId in current)) {
          return current;
        }
        const { [deletingId]: _removed, ...rest } = current;
        return rest;
      });
      setTradingMarketPresetCustomTemplates((current) => {
        return current.filter((item) => item.id !== deletingId);
      });
      setTradingMarketPresetValuesByKey((current) => {
        const next = { ...current };
        if (deletingId in next) {
          delete next[deletingId];
        }
        return next;
      });
      setSystemPoolTradingBindingById((current) => {
        let mutated = false;
        const next: SystemPoolTradingBindingById = { ...current };
        Object.entries(current).forEach(([poolId, binding]) => {
          if (String(binding?.marketPresetId || '').trim() !== deletingId) {
            return;
          }
          const nextAssetClass = binding?.assetClass ?? tradingAssetClass;
          const nextPresetId = resolveNextPresetIdByAssetClass(nextAssetClass);
          if (nextPresetId === deletingId) {
            return;
          }
          next[poolId] = {
            assetClass: nextAssetClass,
            marketPresetId: nextPresetId
          };
          mutated = true;
        });
        return mutated ? next : current;
      });
      if (tradingMarketPresetKey === deletingId) {
        const fallbackPresetId = resolveNextPresetIdByAssetClass(tradingAssetClass);
        setTradingMarketPresetKey(fallbackPresetId);
        applyTradingMarketPresetValues(resolveTradingMarketPresetValuesForAssetClass(fallbackPresetId, tradingAssetClass));
      }
    },
    [
      applyTradingMarketPresetValues,
      listVisibleBuiltInTradingMarketPresetIdsByAssetClass,
      resolveFallbackTradingMarketPresetId,
      resolveTradingMarketPresetValuesForAssetClass,
      setHiddenBuiltInTradingMarketPresetIds,
      setTradingMarketPresetLabelOverridesById,
      setSystemPoolTradingBindingById,
      setTradingMarketPresetCustomTemplates,
      setTradingMarketPresetKey,
      setTradingMarketPresetValuesByKey,
      tradingAssetClass,
      tradingMarketPresetCustomTemplates,
      tradingMarketPresetKey
    ]
  );

  return {
    handleSaveTradingMarketPresetToCurrent,
    handleSaveTradingMarketPresetAsNew,
    handleRenameTradingMarketPresetById,
    handleDeleteTradingMarketPresetById
  };
};
