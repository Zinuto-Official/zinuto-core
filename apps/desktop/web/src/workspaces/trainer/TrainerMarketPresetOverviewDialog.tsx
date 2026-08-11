// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import { getTradingSettingsText } from "@/ui/config/uiConfig";
import { AppModal } from "@/ui/components/AppModal";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { StandardModalFrame } from "@/ui/components";

type TrainerMarketPresetOverviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeMarketPresetLabel: string;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
  trainerSettingsPanel: ReplayTrainerSettingsPanelProps;
  tt: (key: AppTextKey) => string;
};

type OverviewField = {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted";
};

type OverviewSection = {
  title: string;
  fields: OverviewField[];
};

const EMPTY_VALUE = "-";

const normalizeDisplayValue = (value: unknown): string => {
  const normalized = String(value ?? "").trim();
  return normalized || EMPTY_VALUE;
};

const appendSuffix = (value: unknown, suffix?: string): string => {
  const normalizedValue = normalizeDisplayValue(value);
  const normalizedSuffix = String(suffix ?? "").trim();
  if (!normalizedSuffix || normalizedValue === EMPTY_VALUE) {
    return normalizedValue;
  }
  return `${normalizedValue}${normalizedSuffix}`;
};

const findOptionLabel = (
  options: Array<{ value: string; label: string }>,
  value: string,
): string =>
  options.find((option) => option.value === value)?.label ??
  normalizeDisplayValue(value);

const isPresentValue = (value: string): boolean => {
  const numeric = Number(value);
  return !Number.isFinite(numeric) || Math.abs(numeric) > 1e-12;
};

const buildCompactFields = (fields: OverviewField[]): OverviewField[] =>
  fields.filter((field) => isPresentValue(field.value));

const OverviewStat = ({ label, value, tone = "default" }: OverviewField) => (
  <div className="trainer-market-overview-stat" data-tone={tone}>
    <span className="trainer-market-overview-stat-label">{label}</span>
    <span className="trainer-market-overview-stat-value">{value}</span>
  </div>
);

const OverviewSectionBlock = ({ title, fields }: OverviewSection) => (
  <section className="trainer-market-overview-section">
    <h3 className="trainer-market-overview-section-title">{title}</h3>
    <div className="trainer-market-overview-field-grid">
      {fields.map((field) => (
        <OverviewStat
          key={`${field.label}-${field.value}`}
          label={field.label}
          value={field.value}
          tone={field.tone}
        />
      ))}
    </div>
  </section>
);

export const TrainerMarketPresetOverviewDialog = ({
  open,
  onOpenChange,
  activeMarketPresetLabel,
  tradingSettingsText,
  trainerSettingsPanel,
  tt,
}: TrainerMarketPresetOverviewDialogProps) => {
  const assetClass = trainerSettingsPanel.tradingAssetClass;
  const percentSymbol = trainerSettingsPanel.percentSymbol;
  const minTradeStepUnit =
    tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass[assetClass] ??
    tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass.STOCK;
  const settlementLabel = findOptionLabel(
    trainerSettingsPanel.replaySettingsSettlementModeOptions,
    trainerSettingsPanel.tradeSettlementMode,
  );
  const longPermissionLabel = findOptionLabel(
    trainerSettingsPanel.replaySettingsAllowLongOptions,
    trainerSettingsPanel.allowLongMarginTrading ? "ALLOW" : "DISALLOW",
  );
  const shortPermissionLabel = findOptionLabel(
    trainerSettingsPanel.replaySettingsAllowShortOptions,
    trainerSettingsPanel.allowShortSelling ? "ALLOW" : "DISALLOW",
  );
  const stampDutyModeLabel = findOptionLabel(
    trainerSettingsPanel.replaySettingsStampDutyOptions,
    trainerSettingsPanel.stampDutyMode,
  );
  const frictionAssetClass =
    assetClass === "FUTURES" ||
    assetClass === "FOREX" ||
    assetClass === "CRYPTO"
      ? assetClass
      : "CRYPTO";
  const usesFuturesUnitCostInputs = assetClass === "FUTURES";
  const shouldShowStockFriction = assetClass === "STOCK";
  const shouldShowContractMultiplier =
    assetClass === "FUTURES" || assetClass === "FOREX";

  const overviewFields: OverviewField[] = [
    {
      label: tradingSettingsText.marketPresetsSectionTitle,
      value: normalizeDisplayValue(activeMarketPresetLabel),
      tone: "accent",
    },
    {
      label: tradingSettingsText.assetClassSectionTitle,
      value:
        tradingSettingsText.assetClassLabels[assetClass] ??
        normalizeDisplayValue(assetClass),
    },
    {
      label: tradingSettingsText.tradeSettlementModeLabel,
      value: settlementLabel,
      tone: "accent",
    },
    {
      label: tradingSettingsText.minTradeStepLabel,
      value: appendSuffix(
        trainerSettingsPanel.minTradeStepInput,
        minTradeStepUnit,
      ),
    },
    {
      label:
        tradingSettingsText.allowLongMarginTradingLabelByAssetClass[assetClass],
      value: longPermissionLabel,
      tone: trainerSettingsPanel.allowLongMarginTrading ? "accent" : "muted",
    },
    {
      label: tradingSettingsText.allowShortSellingLabelByAssetClass[assetClass],
      value: shortPermissionLabel,
      tone: trainerSettingsPanel.allowShortSelling ? "accent" : "muted",
    },
  ];

  const basicFields: OverviewField[] = [
    {
      label: tradingSettingsText.tradeSettlementModeLabel,
      value: settlementLabel,
    },
    {
      label: tradingSettingsText.minTradeStepLabel,
      value: appendSuffix(
        trainerSettingsPanel.minTradeStepInput,
        minTradeStepUnit,
      ),
    },
    {
      label: tradingSettingsText.freeReplayEndSettlementModeLabel,
      value: findOptionLabel(
        trainerSettingsPanel.replaySettingsFreeReplayEndSettlementModeOptions,
        trainerSettingsPanel.freeReplayEndSettlementMode,
      ),
    },
    ...(shouldShowContractMultiplier
      ? [
          {
            label:
              tradingSettingsText.contractMultiplierLabelByAssetClass[
                assetClass
              ],
            value: normalizeDisplayValue(
              trainerSettingsPanel.contractMultiplierInput,
            ),
          },
        ]
      : []),
  ];

  const stockFrictionFields: OverviewField[] = [
    {
      label: tradingSettingsText.commissionRateLabel,
      value: appendSuffix(trainerSettingsPanel.commissionRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.commissionMinimumFeeLabel,
      value: normalizeDisplayValue(
        trainerSettingsPanel.commissionMinimumFeeInput,
      ),
    },
    {
      label: tradingSettingsText.platformFeeRateLabel,
      value: appendSuffix(trainerSettingsPanel.platformFeeRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.platformFeeMinimumFeeLabel,
      value: normalizeDisplayValue(
        trainerSettingsPanel.platformFeeMinimumFeeInput,
      ),
    },
    {
      label: tradingSettingsText.transactionLevyRateLabel,
      value: appendSuffix(trainerSettingsPanel.transactionLevyRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.transactionLevyMinimumFeeLabel,
      value: normalizeDisplayValue(
        trainerSettingsPanel.transactionLevyMinimumFeeInput,
      ),
    },
    {
      label: tradingSettingsText.transferFeeRateLabel,
      value: appendSuffix(trainerSettingsPanel.transferFeeRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.regulatoryFeeRateLabel,
      value: appendSuffix(trainerSettingsPanel.regulatoryFeeRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.stampDutyRateLabel,
      value: appendSuffix(trainerSettingsPanel.stampDutyRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.stampDutyModeLabel,
      value: stampDutyModeLabel,
    },
    {
      label: tradingSettingsText.slippageRateLabel,
      value: appendSuffix(trainerSettingsPanel.slippageRateInput, percentSymbol),
    },
  ];

  const nonStockFrictionFields: OverviewField[] = [
    {
      label: tradingSettingsText.makerFeeRateLabelByAssetClass[frictionAssetClass],
      value: appendSuffix(
        trainerSettingsPanel.makerFeeRateInput,
        usesFuturesUnitCostInputs ? "" : percentSymbol,
      ),
    },
    {
      label: tradingSettingsText.takerFeeRateLabelByAssetClass[frictionAssetClass],
      value: appendSuffix(
        trainerSettingsPanel.takerFeeRateInput,
        usesFuturesUnitCostInputs ? "" : percentSymbol,
      ),
    },
    {
      label: tradingSettingsText.fundingRateLabelByAssetClass[frictionAssetClass],
      value: appendSuffix(trainerSettingsPanel.fundingRateInput, percentSymbol),
    },
    {
      label: tradingSettingsText.slippageRateLabel,
      value: appendSuffix(trainerSettingsPanel.slippageRateInput, percentSymbol),
    },
  ];

  const leverageFields: OverviewField[] = [
    {
      label: tradingSettingsText.allowLongMarginTradingLabelByAssetClass[assetClass],
      value: longPermissionLabel,
      tone: trainerSettingsPanel.allowLongMarginTrading ? "accent" : "muted",
    },
    ...(trainerSettingsPanel.allowLongMarginTrading
      ? [
          {
            label: tradingSettingsText.longInitialMarginRatioLabel,
            value: appendSuffix(
              trainerSettingsPanel.longInitialMarginRatioInput,
              percentSymbol,
            ),
          },
          {
            label: tradingSettingsText.longMaintenanceMarginRatioLabel,
            value: appendSuffix(
              trainerSettingsPanel.longMaintenanceMarginRatioInput,
              percentSymbol,
            ),
          },
          {
            label: tradingSettingsText.longFinancingAnnualRateLabel,
            value: appendSuffix(
              trainerSettingsPanel.longFinancingAnnualRateInput,
              percentSymbol,
            ),
          },
        ]
      : []),
    {
      label: tradingSettingsText.allowShortSellingLabelByAssetClass[assetClass],
      value: shortPermissionLabel,
      tone: trainerSettingsPanel.allowShortSelling ? "accent" : "muted",
    },
    ...(trainerSettingsPanel.allowShortSelling
      ? [
          {
            label: tradingSettingsText.shortInitialMarginRatioLabel,
            value: appendSuffix(
              trainerSettingsPanel.shortInitialMarginRatioInput,
              percentSymbol,
            ),
          },
          {
            label: tradingSettingsText.shortMaintenanceMarginRatioLabel,
            value: appendSuffix(
              trainerSettingsPanel.shortMaintenanceMarginRatioInput,
              percentSymbol,
            ),
          },
          {
            label: tradingSettingsText.shortBorrowAnnualRateLabel,
            value: appendSuffix(
              trainerSettingsPanel.shortBorrowAnnualRateInput,
              percentSymbol,
            ),
          },
        ]
      : []),
  ];

  const sections: OverviewSection[] = [
    {
      title: tt("appText.overview"),
      fields: overviewFields,
    },
    {
      title: tradingSettingsText.panelBasicRulesTitle,
      fields: basicFields,
    },
    {
      title: tradingSettingsText.panelFrictionTitle,
      fields: buildCompactFields(
        shouldShowStockFriction ? stockFrictionFields : nonStockFrictionFields,
      ),
    },
    {
      title: tradingSettingsText.panelLeverageTitle,
      fields: leverageFields,
    },
  ];

  return (
    <AppModal
      open={open}
      onClose={() => onOpenChange(false)}
      preset="form"
      className="trainer-market-overview-modal"
      showCloseButton
      accessibilityTitle={activeMarketPresetLabel}
      accessibilityDescription={null}
    >
      <StandardModalFrame
        title={activeMarketPresetLabel}
        variant="form"
        bodyClassName="trainer-market-overview-body"
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {tt("appText.close2")}
          </Button>
        }
      >
          {sections.map((section) => (
            <OverviewSectionBlock
              key={section.title}
              title={section.title}
              fields={section.fields}
            />
          ))}
      </StandardModalFrame>
    </AppModal>
  );
};
