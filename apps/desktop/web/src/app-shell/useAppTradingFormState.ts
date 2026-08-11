// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react';
import { api } from '@/api';
import { DEFAULT_POOL_LOT_SIZE, getBuiltInSamplePools } from '@/domains/trainer/samplePools';
import { DEFAULT_TRADING_SETTINGS_FORM_VALUES } from '@/domains/trainer/tradingSettingsFormDomain';
import {
  applyTrainerTradingFormFactsFromReadModel,
  normalizeTradingAssetClass,
  normalizeTradingCustomFeeTemplates,
  normalizeTradingMarketPresetId,
  normalizeTradingMarketPresetValuesByKey
} from '@/domains/trainer/tradingMarketPresets';
import type {
  CustomSamplePool,
  UiSettings
} from "@/frontend-kernel/appTypes";
import {
  DEFAULT_RATIO_PRESET_INPUTS,
  normalizeFixedRatioPresetOption,
  normalizePoolLotSizeMap
} from '@/domains/trainer/tradingFormUtils';
import type { TradingSettings } from '@/domains/training/types';

type TradeInputMode = 'LOT' | 'AMOUNT' | 'RATIO';
type OrderPriceMode = 'CUR_CLOSE' | 'NEXT_OPEN';

const isOrderInputMode = (value: unknown): value is TradeInputMode =>
  value === 'LOT' || value === 'AMOUNT' || value === 'RATIO';

const normalizePriceMode = (
  value: unknown,
  fallback: OrderPriceMode,
): OrderPriceMode =>
  value === 'CUR_CLOSE' || value === 'NEXT_OPEN' ? value : fallback;

type UseAppTradingFormStateArgs = {
  persistedUi: UiSettings;
  customSamplePools: CustomSamplePool[];
  defaultTradingSettings: TradingSettings;
};

export const useAppTradingFormState = ({
  persistedUi,
  customSamplePools,
  defaultTradingSettings
}: UseAppTradingFormStateArgs) => {
  const [buyTradeInputMode, setBuyTradeInputMode] = useState<TradeInputMode>(() => {
    const value = persistedUi.buyTradeInputMode;
    return isOrderInputMode(value) ? value : 'RATIO';
  });
  const [buyLotInput, setBuyLotInput] = useState(() => (typeof persistedUi.buyLotInput === 'string' ? persistedUi.buyLotInput : '1'));
  const [buyAmountInput, setBuyAmountInput] = useState(() =>
    typeof persistedUi.buyAmountInput === 'string' ? persistedUi.buyAmountInput : '10,000'
  );
  const [buyRatioPresetInputs, setBuyRatioPresetInputs] = useState<string[]>(() => [...DEFAULT_RATIO_PRESET_INPUTS]);
  const [sellRatioPresetInputs, setSellRatioPresetInputs] = useState<string[]>(() => [...DEFAULT_RATIO_PRESET_INPUTS]);
  const [buyRatioInput, setBuyRatioInput] = useState<string>(() =>
    normalizeFixedRatioPresetOption(persistedUi.buyRatioInput, '25')
  );
  const [buyPriceMode, setBuyPriceMode] = useState<OrderPriceMode>(() =>
    normalizePriceMode(persistedUi.buyPriceMode, 'NEXT_OPEN')
  );
  const [sellTradeInputMode, setSellTradeInputMode] = useState<TradeInputMode>(() => {
    const value = persistedUi.sellTradeInputMode;
    return isOrderInputMode(value) ? value : 'RATIO';
  });
  const [sellLotInput, setSellLotInput] = useState(() => (typeof persistedUi.sellLotInput === 'string' ? persistedUi.sellLotInput : '1'));
  const [sellAmountInput, setSellAmountInput] = useState(() =>
    typeof persistedUi.sellAmountInput === 'string' ? persistedUi.sellAmountInput : '10,000'
  );
  const [sellRatioInput, setSellRatioInput] = useState<string>(() =>
    normalizeFixedRatioPresetOption(persistedUi.sellRatioInput, '50')
  );
  const [sellPriceMode, setSellPriceMode] = useState<OrderPriceMode>(() =>
    normalizePriceMode(persistedUi.sellPriceMode, 'NEXT_OPEN')
  );
  const [lotSizeByPool, setLotSizeByPool] = useState<Record<string, number>>(() => {
    const normalized = normalizePoolLotSizeMap(persistedUi.lotSizeByPool);
    const seeded: Record<string, number> = { ...normalized };
    getBuiltInSamplePools().forEach((pool) => {
      const preset = Number.isFinite(seeded[pool.id]) ? Math.floor(seeded[pool.id]) : pool.lotSize;
      seeded[pool.id] = Math.max(1, preset || pool.lotSize);
    });
    customSamplePools.forEach((pool) => {
      if (Number.isFinite(seeded[pool.id])) {
        seeded[pool.id] = Math.max(1, Math.floor(seeded[pool.id]));
        return;
      }
      seeded[pool.id] = DEFAULT_POOL_LOT_SIZE;
    });
    return seeded;
  });

  const [initialSecuritiesInput, setInitialSecuritiesInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.initialSecuritiesInput
  );
  const [tradingAssetClass, setTradingAssetClass] = useState(() =>
    normalizeTradingAssetClass(persistedUi.tradingAssetClass ?? defaultTradingSettings.assetClass, 'STOCK')
  );
  const [commissionRateInput, setCommissionRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.commissionRateInput
  );
  const [minTradeStepInput, setMinTradeStepInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.minTradeStepInput
  );
  const [makerFeeRateInput, setMakerFeeRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.makerFeeRateInput
  );
  const [takerFeeRateInput, setTakerFeeRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.takerFeeRateInput
  );
  const [fundingRateInput, setFundingRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.fundingRateInput
  );
  const [contractMultiplierInput, setContractMultiplierInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.contractMultiplierInput
  );
  const [transferFeeRateInput, setTransferFeeRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.transferFeeRateInput
  );
  const [regulatoryFeeRateInput, setRegulatoryFeeRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.regulatoryFeeRateInput
  );
  const [platformFeeRateInput, setPlatformFeeRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.platformFeeRateInput
  );
  const [transactionLevyRateInput, setTransactionLevyRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.transactionLevyRateInput
  );
  const [slippageRateInput, setSlippageRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.slippageRateInput
  );
  const [stampDutyRateInput, setStampDutyRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.stampDutyRateInput
  );
  const [commissionMinimumFeeInput, setCommissionMinimumFeeInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.commissionMinimumFeeInput
  );
  const [platformFeeMinimumFeeInput, setPlatformFeeMinimumFeeInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.platformFeeMinimumFeeInput
  );
  const [transactionLevyMinimumFeeInput, setTransactionLevyMinimumFeeInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.transactionLevyMinimumFeeInput
  );
  const [longFinancingAnnualRateInput, setLongFinancingAnnualRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longFinancingAnnualRateInput
  );
  const [longInitialMarginRatioInput, setLongInitialMarginRatioInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput
  );
  const [longMaintenanceMarginRatioInput, setLongMaintenanceMarginRatioInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longMaintenanceMarginRatioInput
  );
  const [shortBorrowAnnualRateInput, setShortBorrowAnnualRateInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortBorrowAnnualRateInput
  );
  const [shortInitialMarginRatioInput, setShortInitialMarginRatioInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortInitialMarginRatioInput
  );
  const [shortMaintenanceMarginRatioInput, setShortMaintenanceMarginRatioInput] = useState<string>(
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortMaintenanceMarginRatioInput
  );
  const [stampDutyMode, setStampDutyMode] = useState<'BUY' | 'SELL' | 'DOUBLE'>(defaultTradingSettings.stampDutyMode);
  const [positionCostMode, setPositionCostMode] = useState<'DILUTED' | 'AVERAGE_OPEN'>(defaultTradingSettings.positionCostMode);
  const [tradeSettlementMode, setTradeSettlementMode] = useState<'T0' | 'T1'>(defaultTradingSettings.tradeSettlementMode);
  const [freeReplayEndSettlementMode, setFreeReplayEndSettlementMode] = useState(
    defaultTradingSettings.freeReplayEndSettlementMode
  );
  const [tradeAmountIncludesFees, setTradeAmountIncludesFees] = useState(false);
  const [allowLongMarginTrading, setAllowLongMarginTrading] = useState(
    Boolean(defaultTradingSettings.allowLongMarginTrading),
  );
  const [allowShortSelling, setAllowShortSelling] = useState(Boolean(defaultTradingSettings.allowShortSelling));
  const [tradingMarketPresetKey, setTradingMarketPresetKey] = useState(() =>
    normalizeTradingMarketPresetId(persistedUi.tradingMarketPresetKey, tradingAssetClass)
  );
  const [tradingMarketPresetValuesByKey, setTradingMarketPresetValuesByKey] = useState(() =>
    normalizeTradingMarketPresetValuesByKey(persistedUi.tradingMarketPresetValuesByKey)
  );
  const [tradingMarketPresetCustomTemplates, setTradingMarketPresetCustomTemplates] = useState(() =>
    normalizeTradingCustomFeeTemplates(persistedUi.tradingMarketPresetCustomTemplates)
  );
  const [tradingSettings, setTradingSettings] = useState<TradingSettings>(defaultTradingSettings);
  const [isSavingTradingSettings, setIsSavingTradingSettings] = useState(false);
  const tradingAssetClassRef = useRef(tradingAssetClass);

  useEffect(() => {
    tradingAssetClassRef.current = tradingAssetClass;
  }, [tradingAssetClass]);

  useEffect(() => {
    let active = true;
    void api
      .getWorkspaceReadModel('trainer')
      .then((readModel) => {
        const applied = applyTrainerTradingFormFactsFromReadModel(readModel);
        if (!active || !applied) {
          return;
        }
        setTradingMarketPresetValuesByKey((current) =>
          normalizeTradingMarketPresetValuesByKey(current)
        );
        setTradingMarketPresetKey((current) =>
          normalizeTradingMarketPresetId(
            current,
            tradingAssetClassRef.current,
          )
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return {
    buyTradeInputMode,
    setBuyTradeInputMode,
    buyLotInput,
    setBuyLotInput,
    buyAmountInput,
    setBuyAmountInput,
    buyRatioPresetInputs,
    setBuyRatioPresetInputs,
    sellRatioPresetInputs,
    setSellRatioPresetInputs,
    buyRatioInput,
    setBuyRatioInput,
    buyPriceMode,
    setBuyPriceMode,
    sellTradeInputMode,
    setSellTradeInputMode,
    sellLotInput,
    setSellLotInput,
    sellAmountInput,
    setSellAmountInput,
    sellRatioInput,
    setSellRatioInput,
    sellPriceMode,
    setSellPriceMode,
    lotSizeByPool,
    setLotSizeByPool,
    initialSecuritiesInput,
    setInitialSecuritiesInput,
    tradingAssetClass,
    setTradingAssetClass,
    minTradeStepInput,
    setMinTradeStepInput,
    commissionRateInput,
    setCommissionRateInput,
    makerFeeRateInput,
    setMakerFeeRateInput,
    takerFeeRateInput,
    setTakerFeeRateInput,
    fundingRateInput,
    setFundingRateInput,
    contractMultiplierInput,
    setContractMultiplierInput,
    transferFeeRateInput,
    setTransferFeeRateInput,
    regulatoryFeeRateInput,
    setRegulatoryFeeRateInput,
    platformFeeRateInput,
    setPlatformFeeRateInput,
    transactionLevyRateInput,
    setTransactionLevyRateInput,
    slippageRateInput,
    setSlippageRateInput,
    stampDutyRateInput,
    setStampDutyRateInput,
    commissionMinimumFeeInput,
    setCommissionMinimumFeeInput,
    platformFeeMinimumFeeInput,
    setPlatformFeeMinimumFeeInput,
    transactionLevyMinimumFeeInput,
    setTransactionLevyMinimumFeeInput,
    longFinancingAnnualRateInput,
    setLongFinancingAnnualRateInput,
    longInitialMarginRatioInput,
    setLongInitialMarginRatioInput,
    longMaintenanceMarginRatioInput,
    setLongMaintenanceMarginRatioInput,
    shortBorrowAnnualRateInput,
    setShortBorrowAnnualRateInput,
    shortInitialMarginRatioInput,
    setShortInitialMarginRatioInput,
    shortMaintenanceMarginRatioInput,
    setShortMaintenanceMarginRatioInput,
    stampDutyMode,
    setStampDutyMode,
    positionCostMode,
    setPositionCostMode,
    tradeSettlementMode,
    setTradeSettlementMode,
    freeReplayEndSettlementMode,
    setFreeReplayEndSettlementMode,
    tradeAmountIncludesFees,
    setTradeAmountIncludesFees,
    allowLongMarginTrading,
    setAllowLongMarginTrading,
    allowShortSelling,
    setAllowShortSelling,
    tradingMarketPresetKey,
    setTradingMarketPresetKey,
    tradingMarketPresetValuesByKey,
    setTradingMarketPresetValuesByKey,
    tradingMarketPresetCustomTemplates,
    setTradingMarketPresetCustomTemplates,
    tradingSettings,
    setTradingSettings,
    isSavingTradingSettings,
    setIsSavingTradingSettings
  };
};
