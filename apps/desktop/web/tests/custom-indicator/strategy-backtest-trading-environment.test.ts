// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { ReplayTrainerSettingsPanelProps } from "../../src/domains/trainer/ReplayTrainerSettingsPanel";
import {
  buildStrategyBacktestTradingSettingsFromPanel,
  resolveStrategyBacktestEnvironmentSuggestion,
  shouldApplyStrategyBacktestEnvironmentSuggestion,
} from "../../src/workspaces/strategy-backtest/strategyBacktestTradingEnvironment";

const noop = () => undefined;

const createPanel = (
  overrides: Partial<ReplayTrainerSettingsPanelProps> = {},
): ReplayTrainerSettingsPanelProps =>
  ({
    tradingAssetClass: "FUTURES",
    marketPresetChips: [
      {
        id: "FUTURES_COMMODITY",
        label: "Commodity Futures",
        isBuiltIn: true,
        isCustom: false,
        isSelected: false,
        isUsedBySamplePool: false,
        canDelete: false,
      },
      {
        id: "FUTURES_FINANCIAL",
        label: "Financial Futures",
        isBuiltIn: true,
        isCustom: false,
        isSelected: true,
        isUsedBySamplePool: false,
        canDelete: false,
      },
    ],
    minTradeStepInput: "3",
    commissionRateInput: "0.02",
    makerFeeRateInput: "0.01",
    takerFeeRateInput: "0.03",
    fundingRateInput: "0.04",
    contractMultiplierInput: "10",
    transferFeeRateInput: "0",
    regulatoryFeeRateInput: "0.001",
    platformFeeRateInput: "0.002",
    transactionLevyRateInput: "0.003",
    slippageRateInput: "0.05",
    stampDutyRateInput: "0",
    commissionMinimumFeeInput: "1",
    platformFeeMinimumFeeInput: "2",
    transactionLevyMinimumFeeInput: "3",
    longFinancingAnnualRateInput: "4",
    longInitialMarginRatioInput: "120",
    longMaintenanceMarginRatioInput: "100",
    shortBorrowAnnualRateInput: "5",
    shortInitialMarginRatioInput: "160",
    shortMaintenanceMarginRatioInput: "130",
    stampDutyMode: "SELL",
    positionCostMode: "DILUTED",
    tradeSettlementMode: "T0",
    freeReplayEndSettlementMode: "FORCE_CLOSE",
    tradeAmountIncludesFees: true,
    allowLongMarginTrading: true,
    allowShortSelling: true,
    replaySettingsAssetClassOptions: [],
    replaySettingsSettlementModeOptions: [],
    replaySettingsAllowShortOptions: [],
    activeTradingMarketPresetLabel: "Financial Futures",
    onTradingAssetClassChange: noop,
    onSelectTradingMarketPreset: noop,
    ...overrides,
  } as ReplayTrainerSettingsPanelProps);

test("strategy backtest environment suggestion comes from the sample pool market preset", () => {
  assert.deepEqual(
    resolveStrategyBacktestEnvironmentSuggestion({
      assetClass: "FOREX",
      marketPresetId: "FOREX_MICRO_LOT",
    }),
    {
      assetClass: "FOREX",
      marketPresetId: "FOREX_MICRO_LOT",
    },
  );
  assert.deepEqual(
    resolveStrategyBacktestEnvironmentSuggestion({
      assetClass: "CRYPTO",
    }),
    {
      assetClass: "CRYPTO",
      marketPresetId: "CRYPTO_SPOT",
    },
  );
});

test("strategy backtest sample-pool suggestion does not overwrite a touched environment", () => {
  const current = {
    assetClass: "STOCK" as const,
    marketPresetId: "US_STOCK",
  };
  const suggestion = {
    assetClass: "FOREX" as const,
    marketPresetId: "FOREX_STANDARD_LOT",
  };

  assert.equal(
    shouldApplyStrategyBacktestEnvironmentSuggestion({
      current,
      suggestion,
      touched: false,
    }),
    true,
  );
  assert.equal(
    shouldApplyStrategyBacktestEnvironmentSuggestion({
      current,
      suggestion,
      touched: true,
    }),
    false,
  );
});

test("strategy backtest trading settings use the selected panel preset and rules", () => {
  const result = buildStrategyBacktestTradingSettingsFromPanel(
    createPanel(),
    250000,
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.tradingSettings.assetClass, "FUTURES");
  assert.equal(result.tradingSettings.marketPresetId, "FUTURES_FINANCIAL");
  assert.equal(result.tradingSettings.initialSecuritiesBalance, 250000);
  assert.equal(result.tradingSettings.minTradeStep, 3);
  assert.equal(result.tradingSettings.contractMultiplier, 10);
  assert.equal(result.tradingSettings.tradeSettlementMode, "T0");
  assert.equal(result.tradingSettings.allowShortSelling, true);
  assert.equal(result.tradingSettings.tradeAmountIncludesFees, true);
});
