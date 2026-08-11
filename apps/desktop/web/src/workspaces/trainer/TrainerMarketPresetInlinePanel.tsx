// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import { getTradingSettingsText } from "@/ui/config/uiConfig";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";

export type TrainerMarketPresetPanelMode = "LONG" | "SHORT";

export type TrainerMarketPresetEditorModel = {
  activeMarketPresetLabel: string;
  trainerSettingsPanel: ReplayTrainerSettingsPanelProps;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
  autoSaveSignature: string;
  isAutoSaving: boolean;
  onAutoSave: () => void;
};

type TrainerMarketPresetInlinePanelProps = {
  mode: TrainerMarketPresetPanelMode;
  editor: TrainerMarketPresetEditorModel;
  panelId?: string;
  className?: string;
};

type ReadonlyField = {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted";
};

type TrainerMarketPresetSurfaceProps = {
  mode: TrainerMarketPresetPanelMode;
  editor: TrainerMarketPresetEditorModel;
  className?: string;
  panelId?: string;
};

const appendSuffix = (value: string, suffix: string): string => {
  const normalizedValue = String(value || "").trim();
  const normalizedSuffix = String(suffix || "").trim();
  if (!normalizedValue || !normalizedSuffix) {
    return normalizedValue || "-";
  }
  return `${normalizedValue}${normalizedSuffix}`;
};

const findOptionLabel = (
  options: Array<{ value: string; label: string }>,
  value: string,
): string => options.find((option) => option.value === value)?.label ?? value;

const ReadonlyField = ({ label, value, tone = "default" }: ReadonlyField) => {
  return (
    <div
      className="settings-fees-grid-item trainer-market-preset-readonly-field"
      data-tone={tone}
    >
      <span className="settings-fees-grid-item-label">{label}</span>
      <span className="trainer-market-preset-readonly-value">{value}</span>
    </div>
  );
};

const resolveTrainerMarketPresetTitle = (
  mode: TrainerMarketPresetPanelMode,
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>,
) =>
  mode === "LONG"
    ? tradingSettingsText.panelLeverageLongGroupTitle
    : tradingSettingsText.panelLeverageShortGroupTitle;

const TrainerMarketPresetSurface = ({
  mode,
  editor,
  className,
  panelId,
}: TrainerMarketPresetSurfaceProps) => {
  const {
    activeMarketPresetLabel,
    trainerSettingsPanel,
    tradingSettingsText,
  } = editor;

  const longAllowLabel =
    tradingSettingsText.allowLongMarginTradingLabelByAssetClass[
      trainerSettingsPanel.tradingAssetClass
    ];
  const shortAllowLabel =
    tradingSettingsText.allowShortSellingLabelByAssetClass[
      trainerSettingsPanel.tradingAssetClass
    ];
  const panelTitle = useMemo(
    () => resolveTrainerMarketPresetTitle(mode, tradingSettingsText),
    [mode, tradingSettingsText],
  );

  const quickSection = useMemo(() => {
    const percentSymbol = trainerSettingsPanel.percentSymbol;

    if (mode === "LONG") {
      const permissionValue = trainerSettingsPanel.allowLongMarginTrading
        ? "ALLOW"
        : "DISALLOW";
      return (
        <section className="replay-settings-v2-card settings-fees-group-card trainer-market-preset-quick-card">
          <div className="settings-fees-panel-stack trainer-market-preset-quick-stack">
            <section className="settings-fees-subgroup">
              <div className="settings-fees-grid settings-fees-subgroup-grid trainer-market-preset-readonly-grid">
                <ReadonlyField
                  label={longAllowLabel}
                  value={findOptionLabel(
                    trainerSettingsPanel.replaySettingsAllowLongOptions,
                    permissionValue,
                  )}
                  tone={
                    trainerSettingsPanel.allowLongMarginTrading
                      ? "accent"
                      : "muted"
                  }
                />
                {trainerSettingsPanel.allowLongMarginTrading ? (
                  <>
                    <ReadonlyField
                      label={tradingSettingsText.longInitialMarginRatioLabel}
                      value={appendSuffix(
                        trainerSettingsPanel.longInitialMarginRatioInput,
                        percentSymbol,
                      )}
                    />
                    <ReadonlyField
                      label={tradingSettingsText.longMaintenanceMarginRatioLabel}
                      value={appendSuffix(
                        trainerSettingsPanel.longMaintenanceMarginRatioInput,
                        percentSymbol,
                      )}
                    />
                    <ReadonlyField
                      label={tradingSettingsText.longFinancingAnnualRateLabel}
                      value={appendSuffix(
                        trainerSettingsPanel.longFinancingAnnualRateInput,
                        percentSymbol,
                      )}
                    />
                  </>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      );
    }

    const permissionValue = trainerSettingsPanel.allowShortSelling
      ? "ALLOW"
      : "DISALLOW";
    return (
      <section className="replay-settings-v2-card settings-fees-group-card trainer-market-preset-quick-card">
        <div className="settings-fees-panel-stack trainer-market-preset-quick-stack">
          <section className="settings-fees-subgroup">
            <div className="settings-fees-grid settings-fees-subgroup-grid trainer-market-preset-readonly-grid">
              <ReadonlyField
                label={shortAllowLabel}
                value={findOptionLabel(
                  trainerSettingsPanel.replaySettingsAllowShortOptions,
                  permissionValue,
                )}
                tone={
                  trainerSettingsPanel.allowShortSelling ? "accent" : "muted"
                }
              />
              {trainerSettingsPanel.allowShortSelling ? (
                <>
                  <ReadonlyField
                    label={tradingSettingsText.shortInitialMarginRatioLabel}
                    value={appendSuffix(
                      trainerSettingsPanel.shortInitialMarginRatioInput,
                      percentSymbol,
                    )}
                  />
                  <ReadonlyField
                    label={tradingSettingsText.shortMaintenanceMarginRatioLabel}
                    value={appendSuffix(
                      trainerSettingsPanel.shortMaintenanceMarginRatioInput,
                      percentSymbol,
                    )}
                  />
                  <ReadonlyField
                    label={tradingSettingsText.shortBorrowAnnualRateLabel}
                    value={appendSuffix(
                      trainerSettingsPanel.shortBorrowAnnualRateInput,
                      percentSymbol,
                    )}
                  />
                </>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
  }, [
    longAllowLabel,
    mode,
    shortAllowLabel,
    trainerSettingsPanel,
    tradingSettingsText,
  ]);

  return (
    <div
      id={panelId}
      className={[
        "trainer-market-preset-surface",
        "is-inline",
        "is-compact",
        "is-readonly",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label={panelTitle}
    >
      <div className="trainer-market-preset-surface-header">
        <div className="trainer-market-preset-surface-title-row">
          <h3 className="trainer-market-preset-surface-title">{panelTitle}</h3>
          <span
            className="trainer-market-preset-surface-preset-pill"
            title={activeMarketPresetLabel}
          >
            {activeMarketPresetLabel}
          </span>
        </div>
      </div>

      <div className="trainer-market-preset-surface-body">{quickSection}</div>
    </div>
  );
};

export const TrainerMarketPresetInlinePanel = ({
  mode,
  editor,
  panelId,
  className,
}: TrainerMarketPresetInlinePanelProps) => {
  return (
    <TrainerMarketPresetSurface
      mode={mode}
      editor={editor}
      panelId={panelId}
      className={className}
    />
  );
};
