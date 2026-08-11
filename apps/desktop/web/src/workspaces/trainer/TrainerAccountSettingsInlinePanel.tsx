// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { useI18n } from "@/frontend-kernel/i18n";
import { VendorIcon } from "@/assets/graphics";
import type { TrainerMarketPresetEditorModel } from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";

type TrainerAccountSettingsInlinePanelProps = {
  active: boolean;
  editor: TrainerMarketPresetEditorModel;
  tt: (key: AppTextKey) => string;
  panelId?: string;
  className?: string;
};

type AccountFieldProps = {
  label: string;
  children: ReactNode;
};

const AccountField = ({ label, children }: AccountFieldProps) => (
  <div className="settings-fees-grid-item">
    <span className="settings-fees-grid-item-label">{label}</span>
    {children}
  </div>
);

export const TrainerAccountSettingsInlinePanel = ({
  active,
  editor,
  tt,
  panelId,
  className,
}: TrainerAccountSettingsInlinePanelProps) => {
  const { t } = useI18n();
  const lastAutoSavedSignatureRef = useRef("");
  const {
    trainerSettingsPanel,
    tradingSettingsText,
    autoSaveSignature,
    isAutoSaving,
    onAutoSave,
  } = editor;

  const panelTitle = t("trainer.position.accountSettings");

  const renderInputWithSuffix = useMemo(
    () =>
      (
        value: string,
        onChange: (value: string) => void,
        placeholder: string,
        suffix: string,
        options?: {
          disabled?: boolean;
          note?: string;
        },
      ) => (
        <div className="settings-inline-input-with-help">
          <div className="settings-inline-input-with-suffix">
            <Input
              className="replay-settings-v2-input replay-settings-v2-control-sm settings-inline-input-control"
              density="compact"
              value={value}
              maxLength={INPUT_LIMITS.orderInputChars}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              disabled={options?.disabled}
            />
            <span className="settings-inline-input-suffix">{suffix}</span>
          </div>
          {options?.note ? (
            <Tooltip delay={0}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="settings-inline-input-help-trigger"
                  aria-label={options.note}
                >
                  <VendorIcon
                    name="circleHelp"
                    className="settings-inline-input-help-icon"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{options.note}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ),
    [],
  );

  useEffect(() => {
    if (!active) {
      lastAutoSavedSignatureRef.current = "";
      return;
    }
    if (!lastAutoSavedSignatureRef.current) {
      lastAutoSavedSignatureRef.current = autoSaveSignature;
      return;
    }
    if (
      lastAutoSavedSignatureRef.current === autoSaveSignature ||
      isAutoSaving
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastAutoSavedSignatureRef.current = autoSaveSignature;
      onAutoSave();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [active, autoSaveSignature, isAutoSaving, onAutoSave]);

  return (
    <div
      id={panelId}
      className={[
        "trainer-market-preset-surface",
        "trainer-account-settings-panel",
        "is-inline",
        "is-compact",
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
        </div>
      </div>

      <div className="trainer-market-preset-surface-body">
        <section className="replay-settings-v2-card settings-fees-group-card trainer-market-preset-quick-card">
          <div className="settings-fees-grid settings-fees-grid-account-base trainer-market-preset-quick-toggle-grid">
            <AccountField label={tt("appText.initialAvailableCash")}>
              {renderInputWithSuffix(
                trainerSettingsPanel.initialSecuritiesInput,
                trainerSettingsPanel.onInitialSecuritiesInputChange,
                tt("appText.enterInitialAvailableFunds"),
                "",
                trainerSettingsPanel.isInitialSecuritiesEditable
                  ? undefined
                  : {
                      disabled: true,
                      note: trainerSettingsPanel.initialSecuritiesLockedReason,
                    },
              )}
            </AccountField>
            <AccountField
              label={tradingSettingsText.freeReplayEndSettlementModeLabel}
            >
              <SegmentedControl
                className="replay-settings-v2-seg"
                options={
                  trainerSettingsPanel.replaySettingsFreeReplayEndSettlementModeOptions
                }
                value={trainerSettingsPanel.freeReplayEndSettlementMode}
                onChange={(value) =>
                  trainerSettingsPanel.onFreeReplayEndSettlementModeChange(
                    value as "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET",
                  )
                }
              />
            </AccountField>
          </div>
        </section>

        <section className="replay-settings-v2-card settings-fees-group-card trainer-market-preset-quick-card">
          <div className="settings-fees-panel-stack trainer-market-preset-quick-stack">
            <section className="settings-fees-subgroup">
              <div className="settings-fees-grid settings-fees-subgroup-grid">
                <AccountField label={tt("appText.positionCost")}>
                  <SegmentedControl
                    className="replay-settings-v2-seg settings-fees-grid-seg"
                    options={trainerSettingsPanel.replaySettingsPositionCostOptions}
                    value={trainerSettingsPanel.positionCostMode}
                    onChange={(value) =>
                      trainerSettingsPanel.onPositionCostModeChange(
                        value as "DILUTED" | "AVERAGE_OPEN",
                      )
                    }
                  />
                </AccountField>
                <AccountField label={tt("appText.tradeAmountBasis")}>
                  <SegmentedControl
                    className="replay-settings-v2-seg settings-fees-grid-seg"
                    options={trainerSettingsPanel.replaySettingsTradeAmountOptions}
                    value={
                      trainerSettingsPanel.tradeAmountIncludesFees
                        ? "INCLUDE_FEES"
                        : "EXCLUDE_FEES"
                    }
                    onChange={(value) =>
                      trainerSettingsPanel.onTradeAmountIncludesFeesChange(
                        value === "INCLUDE_FEES",
                      )
                    }
                  />
                </AccountField>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};
