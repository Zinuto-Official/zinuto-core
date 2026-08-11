// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { getTradingSettingsText } from "@/ui/config/uiConfig";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";

export type TradingSettingsSectionFormState = Pick<
  ReplayTrainerSettingsPanelProps,
  | "tradingAssetClass"
  | "commissionRateInput"
  | "onCommissionRateInputChange"
  | "commissionMinimumFeeInput"
  | "onCommissionMinimumFeeInputChange"
  | "platformFeeRateInput"
  | "onPlatformFeeRateInputChange"
  | "platformFeeMinimumFeeInput"
  | "onPlatformFeeMinimumFeeInputChange"
  | "transactionLevyRateInput"
  | "onTransactionLevyRateInputChange"
  | "transactionLevyMinimumFeeInput"
  | "onTransactionLevyMinimumFeeInputChange"
  | "transferFeeRateInput"
  | "onTransferFeeRateInputChange"
  | "regulatoryFeeRateInput"
  | "onRegulatoryFeeRateInputChange"
  | "stampDutyRateInput"
  | "onStampDutyRateInputChange"
  | "stampDutyMode"
  | "onStampDutyModeChange"
  | "slippageRateInput"
  | "onSlippageRateInputChange"
  | "makerFeeRateInput"
  | "onMakerFeeRateInputChange"
  | "takerFeeRateInput"
  | "onTakerFeeRateInputChange"
  | "fundingRateInput"
  | "onFundingRateInputChange"
  | "contractMultiplierInput"
  | "onContractMultiplierInputChange"
  | "longInitialMarginRatioInput"
  | "onLongInitialMarginRatioInputChange"
  | "longMaintenanceMarginRatioInput"
  | "onLongMaintenanceMarginRatioInputChange"
  | "longFinancingAnnualRateInput"
  | "onLongFinancingAnnualRateInputChange"
  | "shortInitialMarginRatioInput"
  | "onShortInitialMarginRatioInputChange"
  | "shortMaintenanceMarginRatioInput"
  | "onShortMaintenanceMarginRatioInputChange"
  | "shortBorrowAnnualRateInput"
  | "onShortBorrowAnnualRateInputChange"
  | "replaySettingsStampDutyOptions"
  | "percentSymbol"
>;

export type TradingSettingsDrawerFormState = TradingSettingsSectionFormState &
  Pick<
    ReplayTrainerSettingsPanelProps,
    | "tradeSettlementMode"
    | "onTradeSettlementModeChange"
    | "replaySettingsSettlementModeOptions"
    | "allowLongMarginTrading"
    | "onAllowLongMarginTradingChange"
    | "replaySettingsAllowLongOptions"
    | "allowShortSelling"
    | "onAllowShortSellingChange"
    | "replaySettingsAllowShortOptions"
    | "minTradeStepInput"
    | "onMinTradeStepInputChange"
  >;

type RenderInputWithSuffixOptions = {
  suffixTone?: "default" | "placeholder";
  hideSuffixWhenValuePresent?: boolean;
};

export type RenderTradingSettingsInputWithSuffix = (
  value: string,
  onChange: (value: string) => void,
  placeholder: string,
  suffix: string,
  options?: RenderInputWithSuffixOptions,
) => ReactNode;

type TradingSettingsText = ReturnType<typeof getTradingSettingsText>;

type TradingSettingsSurfaceProps = {
  title: string;
  children: ReactNode;
};

const TradingSettingsSurface = ({
  title,
  children,
}: TradingSettingsSurfaceProps) => (
  <section className="trading-settings-sheet-section-surface">
    <div className="trading-settings-sheet-section-header">
      <h3 className="trading-settings-sheet-section-title">{title}</h3>
    </div>
    <div className="trading-settings-sheet-section-body">{children}</div>
  </section>
);

type TradingSettingsSubgroupProps = {
  title: string;
  columns?: "single" | "double";
  children: ReactNode;
};

const TradingSettingsSubgroup = ({
  title,
  columns = "double",
  children,
}: TradingSettingsSubgroupProps) => {
  const hasTitle = String(title || "").trim().length > 0;
  return (
    <section className="trading-rules-subgroup">
      {hasTitle ? (
        <div className="trading-rules-subgroup-header">
          <h4 className="trading-rules-subgroup-title">{title}</h4>
        </div>
      ) : null}
      <div
        className={`trading-rules-field-grid ${columns === "single" ? "is-single-column" : ""}`}
      >
        {children}
      </div>
    </section>
  );
};

type TradingSettingsFieldProps = {
  label: string;
  children: ReactNode;
};

const TradingSettingsField = ({
  label,
  children,
}: TradingSettingsFieldProps) => (
  <div className="trading-rules-field">
    <span className="trading-rules-field-label">{label}</span>
    {children}
  </div>
);

type TradingSettingsSurfaceSectionProps = {
  formState: TradingSettingsDrawerFormState;
  tradingSettingsText: TradingSettingsText;
  renderInputWithSuffix: RenderTradingSettingsInputWithSuffix;
  tt: (key: AppTextKey) => string;
};

export const TradingBasicRulesSettingsSheetSection = ({
  formState,
  tradingSettingsText,
  renderInputWithSuffix,
  tt,
}: TradingSettingsSurfaceSectionProps) => {
  const minTradeStepUnitPlaceholder =
    tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass[
      formState.tradingAssetClass
    ] ?? tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass.STOCK;

  return (
    <TradingSettingsSurface
      title={tradingSettingsText.panelBasicRulesTitle}
    >
      <div className="trading-rules-field-grid">
        <TradingSettingsField label={tradingSettingsText.tradeSettlementModeLabel}>
          <SegmentedControl
            size="sm"
            className="trading-rules-segmented-control"
            gridTemplateColumns="repeat(2, minmax(0, 1fr))"
            options={formState.replaySettingsSettlementModeOptions}
            value={formState.tradeSettlementMode}
            onChange={(value) =>
              formState.onTradeSettlementModeChange(value as "T0" | "T1")
            }
          />
        </TradingSettingsField>
        <TradingSettingsField
          label={
            tradingSettingsText.allowLongMarginTradingLabelByAssetClass[
              formState.tradingAssetClass
            ]
          }
        >
          <SegmentedControl
            size="sm"
            className="trading-rules-segmented-control"
            gridTemplateColumns="repeat(2, minmax(0, 1fr))"
            options={formState.replaySettingsAllowLongOptions}
            value={formState.allowLongMarginTrading ? "ALLOW" : "DISALLOW"}
            onChange={(value) =>
              formState.onAllowLongMarginTradingChange(value === "ALLOW")
            }
          />
        </TradingSettingsField>
        <TradingSettingsField
          label={
            tradingSettingsText.allowShortSellingLabelByAssetClass[
              formState.tradingAssetClass
            ]
          }
        >
          <SegmentedControl
            size="sm"
            className="trading-rules-segmented-control"
            gridTemplateColumns="repeat(2, minmax(0, 1fr))"
            options={formState.replaySettingsAllowShortOptions}
            value={formState.allowShortSelling ? "ALLOW" : "DISALLOW"}
            onChange={(value) =>
              formState.onAllowShortSellingChange(value === "ALLOW")
            }
          />
        </TradingSettingsField>
        <TradingSettingsField label={tradingSettingsText.minTradeStepLabel}>
          {renderInputWithSuffix(
            formState.minTradeStepInput,
            formState.onMinTradeStepInputChange,
            tt("appText.message0581"),
            minTradeStepUnitPlaceholder,
            {
              suffixTone: "placeholder",
              hideSuffixWhenValuePresent: true,
            },
          )}
        </TradingSettingsField>
      </div>
    </TradingSettingsSurface>
  );
};

export const TradingFrictionSettingsSheetSection = ({
  formState,
  tradingSettingsText,
  renderInputWithSuffix,
  tt,
}: TradingSettingsSurfaceSectionProps) => {
  const isStockAssetClass = formState.tradingAssetClass === "STOCK";
  const tradingFrictionAssetClassForLabel: "FUTURES" | "FOREX" | "CRYPTO" =
    formState.tradingAssetClass === "FUTURES" ||
    formState.tradingAssetClass === "FOREX" ||
    formState.tradingAssetClass === "CRYPTO"
      ? formState.tradingAssetClass
      : "CRYPTO";
  const usesFuturesUnitCostInputs = formState.tradingAssetClass === "FUTURES";
  const makerFeeRateLabel =
    tradingSettingsText.makerFeeRateLabelByAssetClass[
      tradingFrictionAssetClassForLabel
    ];
  const takerFeeRateLabel =
    tradingSettingsText.takerFeeRateLabelByAssetClass[
      tradingFrictionAssetClassForLabel
    ];
  const fundingRateLabel =
    tradingSettingsText.fundingRateLabelByAssetClass[
      tradingFrictionAssetClassForLabel
    ];

  return (
    <TradingSettingsSurface
      title={tradingSettingsText.panelFrictionTitle}
    >
      <div className="trading-rules-section-stack">
        {isStockAssetClass ? (
          <>
            <TradingSettingsSubgroup
              title={tradingSettingsText.panelFrictionBrokerageGroupTitle}
            >
              <TradingSettingsField label={tradingSettingsText.commissionRateLabel}>
                {renderInputWithSuffix(
                  formState.commissionRateInput,
                  formState.onCommissionRateInputChange,
                  tt("appText.message0370"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField
                label={tradingSettingsText.commissionMinimumFeeLabel}
              >
                {renderInputWithSuffix(
                  formState.commissionMinimumFeeInput,
                  formState.onCommissionMinimumFeeInputChange,
                  tt("appText.message0581"),
                  "",
                )}
              </TradingSettingsField>
              <TradingSettingsField label={tradingSettingsText.platformFeeRateLabel}>
                {renderInputWithSuffix(
                  formState.platformFeeRateInput,
                  formState.onPlatformFeeRateInputChange,
                  tt("appText.message0581"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField
                label={tradingSettingsText.platformFeeMinimumFeeLabel}
              >
                {renderInputWithSuffix(
                  formState.platformFeeMinimumFeeInput,
                  formState.onPlatformFeeMinimumFeeInputChange,
                  tt("appText.message0581"),
                  "",
                )}
              </TradingSettingsField>
            </TradingSettingsSubgroup>

            <TradingSettingsSubgroup
              title={tradingSettingsText.panelFrictionStatutoryGroupTitle}
            >
              <TradingSettingsField
                label={tradingSettingsText.transactionLevyRateLabel}
              >
                {renderInputWithSuffix(
                  formState.transactionLevyRateInput,
                  formState.onTransactionLevyRateInputChange,
                  tt("appText.message0581"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField
                label={tradingSettingsText.transactionLevyMinimumFeeLabel}
              >
                {renderInputWithSuffix(
                  formState.transactionLevyMinimumFeeInput,
                  formState.onTransactionLevyMinimumFeeInputChange,
                  tt("appText.message0581"),
                  "",
                )}
              </TradingSettingsField>
              <TradingSettingsField label={tradingSettingsText.transferFeeRateLabel}>
                {renderInputWithSuffix(
                  formState.transferFeeRateInput,
                  formState.onTransferFeeRateInputChange,
                  tt("appText.message0371"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField
                label={tradingSettingsText.regulatoryFeeRateLabel}
              >
                {renderInputWithSuffix(
                  formState.regulatoryFeeRateInput,
                  formState.onRegulatoryFeeRateInputChange,
                  tt("appText.message0371"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
            </TradingSettingsSubgroup>

            <TradingSettingsSubgroup
              title={tradingSettingsText.panelFrictionTaxAndExecutionGroupTitle}
            >
              <TradingSettingsField label={tradingSettingsText.stampDutyRateLabel}>
                {renderInputWithSuffix(
                  formState.stampDutyRateInput,
                  formState.onStampDutyRateInputChange,
                  tt("appText.message0373"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField label={tradingSettingsText.stampDutyModeLabel}>
                <SegmentedControl
                  size="sm"
                  className="trading-rules-segmented-control"
                  gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                  options={formState.replaySettingsStampDutyOptions}
                  value={formState.stampDutyMode}
                  onChange={(value) =>
                    formState.onStampDutyModeChange(
                      value as "BUY" | "SELL" | "DOUBLE",
                    )
                  }
                />
              </TradingSettingsField>
              <TradingSettingsField label={tradingSettingsText.slippageRateLabel}>
                {renderInputWithSuffix(
                  formState.slippageRateInput,
                  formState.onSlippageRateInputChange,
                  tt("appText.message0372"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
            </TradingSettingsSubgroup>
          </>
        ) : (
          <>
            <TradingSettingsSubgroup
              title={tradingSettingsText.panelFrictionExchangeGroupTitle}
            >
              <TradingSettingsField label={makerFeeRateLabel}>
                {renderInputWithSuffix(
                  formState.makerFeeRateInput,
                  formState.onMakerFeeRateInputChange,
                  tt("appText.message0370"),
                  usesFuturesUnitCostInputs ? "" : formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField label={takerFeeRateLabel}>
                {renderInputWithSuffix(
                  formState.takerFeeRateInput,
                  formState.onTakerFeeRateInputChange,
                  tt("appText.message0370"),
                  usesFuturesUnitCostInputs ? "" : formState.percentSymbol,
                )}
              </TradingSettingsField>
            </TradingSettingsSubgroup>

            <TradingSettingsSubgroup
              title={tradingSettingsText.panelFrictionFundingGroupTitle}
            >
              <TradingSettingsField label={fundingRateLabel}>
                {renderInputWithSuffix(
                  formState.fundingRateInput,
                  formState.onFundingRateInputChange,
                  tt("appText.message0370"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
              <TradingSettingsField label={tradingSettingsText.slippageRateLabel}>
                {renderInputWithSuffix(
                  formState.slippageRateInput,
                  formState.onSlippageRateInputChange,
                  tt("appText.message0372"),
                  formState.percentSymbol,
                )}
              </TradingSettingsField>
            </TradingSettingsSubgroup>
          </>
        )}
      </div>
    </TradingSettingsSurface>
  );
};

export const TradingLeverageSettingsSheetSection = ({
  formState,
  tradingSettingsText,
  renderInputWithSuffix,
  tt,
}: TradingSettingsSurfaceSectionProps) => {
  const leverageAssetClassForLabel:
    | "STOCK"
    | "FUTURES"
    | "FOREX"
    | "CRYPTO" =
    formState.tradingAssetClass === "STOCK" ||
    formState.tradingAssetClass === "FUTURES" ||
    formState.tradingAssetClass === "FOREX" ||
    formState.tradingAssetClass === "CRYPTO"
      ? formState.tradingAssetClass
      : "STOCK";
  const contractMultiplierLabel =
    tradingSettingsText.contractMultiplierLabelByAssetClass[
      leverageAssetClassForLabel
    ];
  const shouldShowContractMultiplier =
    formState.tradingAssetClass === "FUTURES" ||
    formState.tradingAssetClass === "FOREX";

  return (
    <TradingSettingsSurface
      title={tradingSettingsText.panelLeverageTitle}
    >
      <div className="trading-rules-section-stack">
        {shouldShowContractMultiplier ? (
          <TradingSettingsSubgroup
            title={tradingSettingsText.panelLeverageContractGroupTitle}
            columns="single"
          >
            <TradingSettingsField label={contractMultiplierLabel}>
              <Input
                className="replay-settings-v2-input replay-settings-v2-control-sm trading-rules-input"
                density="compact"
                value={formState.contractMultiplierInput}
                onChange={(event) =>
                  formState.onContractMultiplierInputChange(event.target.value)
                }
                placeholder={tt("appText.message0581")}
              />
            </TradingSettingsField>
          </TradingSettingsSubgroup>
        ) : null}

        <TradingSettingsSubgroup
          title={tradingSettingsText.panelLeverageLongGroupTitle}
        >
          <TradingSettingsField
            label={tradingSettingsText.longInitialMarginRatioLabel}
          >
            {renderInputWithSuffix(
              formState.longInitialMarginRatioInput,
              formState.onLongInitialMarginRatioInputChange,
              "100",
              formState.percentSymbol,
            )}
          </TradingSettingsField>
          <TradingSettingsField
            label={tradingSettingsText.longMaintenanceMarginRatioLabel}
          >
            {renderInputWithSuffix(
              formState.longMaintenanceMarginRatioInput,
              formState.onLongMaintenanceMarginRatioInputChange,
              "100",
              formState.percentSymbol,
            )}
          </TradingSettingsField>
          <TradingSettingsField
            label={tradingSettingsText.longFinancingAnnualRateLabel}
          >
            {renderInputWithSuffix(
              formState.longFinancingAnnualRateInput,
              formState.onLongFinancingAnnualRateInputChange,
              tt("appText.message0371"),
              formState.percentSymbol,
            )}
          </TradingSettingsField>
        </TradingSettingsSubgroup>

        <TradingSettingsSubgroup
          title={tradingSettingsText.panelLeverageShortGroupTitle}
        >
          <TradingSettingsField
            label={tradingSettingsText.shortInitialMarginRatioLabel}
          >
            {renderInputWithSuffix(
              formState.shortInitialMarginRatioInput,
              formState.onShortInitialMarginRatioInputChange,
              "10",
              formState.percentSymbol,
            )}
          </TradingSettingsField>
          <TradingSettingsField
            label={tradingSettingsText.shortMaintenanceMarginRatioLabel}
          >
            {renderInputWithSuffix(
              formState.shortMaintenanceMarginRatioInput,
              formState.onShortMaintenanceMarginRatioInputChange,
              "5",
              formState.percentSymbol,
            )}
          </TradingSettingsField>
          <TradingSettingsField
            label={tradingSettingsText.shortBorrowAnnualRateLabel}
          >
            {renderInputWithSuffix(
              formState.shortBorrowAnnualRateInput,
              formState.onShortBorrowAnnualRateInputChange,
              tt("appText.message0371"),
              formState.percentSymbol,
            )}
          </TradingSettingsField>
        </TradingSettingsSubgroup>
      </div>
    </TradingSettingsSurface>
  );
};
