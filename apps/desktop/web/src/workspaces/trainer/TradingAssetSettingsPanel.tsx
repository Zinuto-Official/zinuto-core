// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { getTradingSettingsText } from "@/ui/config/uiConfig";
import { VendorIcon } from "@/assets/graphics";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";
import {
  TradingBasicRulesSettingsSheetSection,
  TradingFrictionSettingsSheetSection,
  TradingLeverageSettingsSheetSection,
  type RenderTradingSettingsInputWithSuffix,
} from "@/workspaces/trainer/TradingSettingsGroupedSections";
import {
  TradingSettingsSheetLayout,
  type TradingSettingsSheetSection,
} from "@/workspaces/trainer/TradingSettingsSheetLayout";

type TradingSettingsText = ReturnType<typeof getTradingSettingsText>;

type TradingAssetSettingsPanelProps = {
  tradingSettingsText: TradingSettingsText;
  trainerSettingsPanel: ReplayTrainerSettingsPanelProps;
  tt: (key: AppTextKey) => string;
  copy?: {
    headerTitle?: string;
    headerDescription?: string;
    presetNameLabel?: string;
  };
};

export const TradingAssetSettingsPanel = ({
  tradingSettingsText,
  trainerSettingsPanel,
  tt,
  copy,
}: TradingAssetSettingsPanelProps) => {
  const [editingPresetId, setEditingPresetId] = useState("");
  const [editingPresetDraftName, setEditingPresetDraftName] = useState("");
  const [armedDeletePresetId, setArmedDeletePresetId] = useState("");
  const [isResetDefaultsArmed, setIsResetDefaultsArmed] = useState(false);
  const editingPresetInputRef = useRef<HTMLInputElement | null>(null);
  const canceledPresetRenameIdRef = useRef("");

  const marketPresetChipById = useMemo(
    () =>
      new Map(
        trainerSettingsPanel.marketPresetChips.map(
          (item) => [item.id, item] as const,
        ),
      ),
    [trainerSettingsPanel.marketPresetChips],
  );

  const activePreset = useMemo(
    () =>
      trainerSettingsPanel.marketPresetChips.find((chip) => chip.isSelected) ??
      trainerSettingsPanel.marketPresetChips[0] ??
      null,
    [trainerSettingsPanel.marketPresetChips],
  );

  const resolvedHeaderTitle =
    String(copy?.headerTitle || "").trim() ||
    tradingSettingsText.activeTemplateLabel;
  const activePresetLabel =
    activePreset?.label ?? trainerSettingsPanel.activeTradingMarketPresetLabel;
  const activeAssetClassLabel =
    trainerSettingsPanel.replaySettingsAssetClassOptions.find(
      (option) => option.value === trainerSettingsPanel.tradingAssetClass,
    )?.label ?? trainerSettingsPanel.tradingAssetClass;

  const renderInputWithSuffix: RenderTradingSettingsInputWithSuffix = (
    value,
    onChange,
    placeholder,
    suffix,
    options,
  ) => (
    <div
      className={[
        "settings-inline-input-with-suffix",
        options?.suffixTone === "placeholder" ? "is-suffix-placeholder" : "",
        options?.hideSuffixWhenValuePresent &&
        String(value || "").trim().length > 0
          ? "has-value"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Input
        className="replay-settings-v2-input replay-settings-v2-control-sm settings-inline-input-control trading-rules-input"
        density="compact"
        value={value}
        maxLength={INPUT_LIMITS.orderInputChars}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <span className="settings-inline-input-suffix">{suffix}</span>
    </div>
  );

  const cancelEditingPreset = useCallback(() => {
    if (editingPresetId) {
      canceledPresetRenameIdRef.current = editingPresetId;
    }
    setEditingPresetId("");
    setEditingPresetDraftName("");
  }, [editingPresetId]);

  const clearPresetManageState = useCallback(() => {
    setArmedDeletePresetId("");
    setIsResetDefaultsArmed(false);
    cancelEditingPreset();
  }, [cancelEditingPreset]);

  const commitPresetRename = useCallback(
    (presetId: string, draftValue = editingPresetDraftName) => {
      const normalizedPresetId = String(presetId || "").trim();
      if (!normalizedPresetId || !marketPresetChipById.has(normalizedPresetId)) {
        cancelEditingPreset();
        return;
      }
      trainerSettingsPanel.onRenameTradingMarketPresetById(
        normalizedPresetId,
        String(draftValue ?? "").trim(),
      );
      cancelEditingPreset();
    },
    [
      cancelEditingPreset,
      editingPresetDraftName,
      marketPresetChipById,
      trainerSettingsPanel,
    ],
  );

  const startEditingPreset = useCallback(
    (presetId: string) => {
      const normalizedPresetId = String(presetId || "").trim();
      const preset = marketPresetChipById.get(normalizedPresetId);
      if (!preset) {
        return;
      }
      canceledPresetRenameIdRef.current = "";
      setArmedDeletePresetId("");
      setIsResetDefaultsArmed(false);
      setEditingPresetId(normalizedPresetId);
      setEditingPresetDraftName(preset.label);
    },
    [marketPresetChipById],
  );

  const handlePresetChipSelect = useCallback(
    (presetId: string) => {
      setArmedDeletePresetId("");
      setIsResetDefaultsArmed(false);
      if (editingPresetId && editingPresetId !== presetId) {
        cancelEditingPreset();
      }
      trainerSettingsPanel.onSelectTradingMarketPreset(presetId);
    },
    [cancelEditingPreset, editingPresetId, trainerSettingsPanel],
  );

  const handlePresetEditInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!editingPresetId) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitPresetRename(editingPresetId);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearPresetManageState();
      }
    },
    [clearPresetManageState, commitPresetRename, editingPresetId],
  );

  const handlePresetEditInputBlur = useCallback(
    (presetId: string, draftValue: string) => {
      const normalizedPresetId = String(presetId || "").trim();
      if (!normalizedPresetId || editingPresetId !== normalizedPresetId) {
        return;
      }
      if (canceledPresetRenameIdRef.current === normalizedPresetId) {
        canceledPresetRenameIdRef.current = "";
        return;
      }
      commitPresetRename(normalizedPresetId, draftValue);
    },
    [commitPresetRename, editingPresetId],
  );

  const handlePresetDeleteAction = useCallback(
    (presetId: string) => {
      const normalizedPresetId = String(presetId || "").trim();
      const preset = marketPresetChipById.get(normalizedPresetId);
      if (!preset || !preset.canDelete) {
        return;
      }
      cancelEditingPreset();
      setIsResetDefaultsArmed(false);
      if (armedDeletePresetId === normalizedPresetId) {
        trainerSettingsPanel.onDeleteTradingMarketPresetById(normalizedPresetId);
        setArmedDeletePresetId("");
        return;
      }
      setArmedDeletePresetId(normalizedPresetId);
    },
    [
      armedDeletePresetId,
      cancelEditingPreset,
      marketPresetChipById,
      trainerSettingsPanel,
    ],
  );

  const handleResetDefaultsAction = useCallback(() => {
    setArmedDeletePresetId("");
    cancelEditingPreset();
    if (isResetDefaultsArmed) {
      trainerSettingsPanel.onResetAllTradingAssetParameters();
      setIsResetDefaultsArmed(false);
      return;
    }
    setIsResetDefaultsArmed(true);
  }, [
    cancelEditingPreset,
    isResetDefaultsArmed,
    trainerSettingsPanel,
  ]);

  const handleSaveAsNewTemplate = useCallback(() => {
    trainerSettingsPanel.onSaveTradingMarketPresetAsNew("");
    clearPresetManageState();
  }, [clearPresetManageState, trainerSettingsPanel]);

  const handleCreateTemplate = useCallback(() => {
    trainerSettingsPanel.onCreateTradingMarketPresetFromCurrent();
    clearPresetManageState();
  }, [clearPresetManageState, trainerSettingsPanel]);

  const handleUpdateCurrentTemplate = useCallback(() => {
    trainerSettingsPanel.onSaveTradingMarketPresetToCurrent();
    clearPresetManageState();
  }, [clearPresetManageState, trainerSettingsPanel]);

  useEffect(() => {
    if (!editingPresetId) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      editingPresetInputRef.current?.focus({ preventScroll: true });
      editingPresetInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [editingPresetId]);

  useEffect(() => {
    if (!editingPresetId && !armedDeletePresetId && !isResetDefaultsArmed) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      clearPresetManageState();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    armedDeletePresetId,
    clearPresetManageState,
    editingPresetId,
    isResetDefaultsArmed,
  ]);

  useEffect(() => {
    if (!armedDeletePresetId && !isResetDefaultsArmed) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-preset-manage-root="true"]')) {
        return;
      }
      setArmedDeletePresetId("");
      setIsResetDefaultsArmed(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [
    armedDeletePresetId,
    isResetDefaultsArmed,
  ]);

  useEffect(() => {
    if (editingPresetId && activePreset?.id !== editingPresetId) {
      cancelEditingPreset();
      return;
    }
    if (editingPresetId && !marketPresetChipById.has(editingPresetId)) {
      cancelEditingPreset();
    }
    if (armedDeletePresetId && !marketPresetChipById.has(armedDeletePresetId)) {
      setArmedDeletePresetId("");
    }
  }, [
    armedDeletePresetId,
    activePreset?.id,
    cancelEditingPreset,
    editingPresetId,
    marketPresetChipById,
  ]);

  const sections = useMemo<TradingSettingsSheetSection[]>(
    () => [
      {
        id: "MARKET",
        label: tradingSettingsText.panelBasicRulesTitle,
        content: (
          <TradingBasicRulesSettingsSheetSection
            formState={trainerSettingsPanel}
            tradingSettingsText={tradingSettingsText}
            renderInputWithSuffix={renderInputWithSuffix}
            tt={tt}
          />
        ),
      },
      {
        id: "FRICTION",
        label: tradingSettingsText.panelFrictionTitle,
        content: (
          <TradingFrictionSettingsSheetSection
            formState={trainerSettingsPanel}
            tradingSettingsText={tradingSettingsText}
            renderInputWithSuffix={renderInputWithSuffix}
            tt={tt}
          />
        ),
      },
      {
        id: "LEVERAGE",
        label: tradingSettingsText.panelLeverageTitle,
        content: (
          <TradingLeverageSettingsSheetSection
            formState={trainerSettingsPanel}
            tradingSettingsText={tradingSettingsText}
            renderInputWithSuffix={renderInputWithSuffix}
            tt={tt}
          />
        ),
      },
    ],
    [
      renderInputWithSuffix,
      tradingSettingsText,
      trainerSettingsPanel,
      tt,
    ],
  );

  const isActivePresetDeleteArmed = activePreset?.id === armedDeletePresetId;
  const activePresetBadgeLabel = activePreset
    ? activePreset.isBuiltIn
      ? tradingSettingsText.builtInTemplateBadgeLabel
      : tradingSettingsText.customTemplateBadgeLabel
    : "";
  const canMutateTemplate = !trainerSettingsPanel.isBusy;
  const canUpdateCurrentTemplate =
    canMutateTemplate &&
    Boolean(activePreset) &&
    trainerSettingsPanel.canSaveTradingMarketPresetToCurrent &&
    !trainerSettingsPanel.isSaveDisabled;
  const canSaveAsNewTemplate =
    canMutateTemplate &&
    trainerSettingsPanel.isTradingMarketPresetDirty &&
    !trainerSettingsPanel.isSaveDisabled;
  const isApplyDisabled =
    trainerSettingsPanel.isBusy ||
    Boolean(trainerSettingsPanel.isSaveDisabled) ||
    trainerSettingsPanel.isSavingTradingSettings;

  return (
    <TradingSettingsSheetLayout
      title={
        <div className="trading-rules-window-header">
          <div className="trading-rules-window-title">
            <span className="trading-rules-window-title-kicker">
              {tradingSettingsText.rulesSummaryTitle}
            </span>
            <strong>{resolvedHeaderTitle}</strong>
          </div>
          <div className="trading-rules-window-status">
            {activePresetBadgeLabel ? (
              <span className="trading-settings-sheet-status-pill">
                {activePresetBadgeLabel}
              </span>
            ) : null}
            {trainerSettingsPanel.isTradingMarketPresetDirty ? (
              <span className="trading-settings-sheet-status-pill is-dirty">
                {tradingSettingsText.drawerDirtyStateLabel}
              </span>
            ) : null}
          </div>
        </div>
      }
      description={
        <div className="trading-rules-window-breadcrumb">
          <span>{activeAssetClassLabel}</span>
          <VendorIcon name="chevronRight" aria-hidden="true" />
          <strong>{activePresetLabel}</strong>
        </div>
      }
      sidebar={
        <div
          className="trading-rules-sidebar-content"
          data-preset-manage-root="true"
        >
          <section className="trading-rules-sidebar-section">
            <div className="trading-settings-sheet-toolbar-title">
              {tradingSettingsText.assetClassSectionTitle}
            </div>
            <div className="trading-rules-sidebar-list">
              {trainerSettingsPanel.replaySettingsAssetClassOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`trading-rules-sidebar-row ${option.value === trainerSettingsPanel.tradingAssetClass ? "is-selected" : ""}`}
                  onClick={() => {
                    clearPresetManageState();
                    trainerSettingsPanel.onTradingAssetClassChange(option.value);
                  }}
                >
                  <span className="trading-rules-sidebar-row-label">
                    {option.label}
                  </span>
                </Button>
              ))}
            </div>
          </section>

          <section className="trading-rules-sidebar-section is-template-list">
            <div className="trading-rules-sidebar-section-header">
              <div className="trading-settings-sheet-toolbar-title">
                {tradingSettingsText.marketPresetsSectionTitle}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="trading-rules-sidebar-title-action"
                onClick={handleCreateTemplate}
                disabled={!canMutateTemplate}
              >
                <VendorIcon name="plus" />
                <span>{tradingSettingsText.addPresetActionLabel}</span>
              </Button>
            </div>
            <div className="trading-rules-template-list">
              {trainerSettingsPanel.marketPresetChips.map((chip) => {
                const isEditingPreset = chip.id === editingPresetId;
                const isSelectedPreset = chip.isSelected;
                const usageSummary = tt(
                  "appText.presetReferencedOneMoreSamplePoolsDataSources",
                );
                const usageFallbackHint = chip.canDelete
                  ? tt("appText.ifDeleteThoseSamplePoolsDataSourcesSwitch")
                  : "";
                return (
                  <div
                    key={chip.id}
                    data-preset-manage-root="true"
                    className={[
                      "trading-rules-template-row",
                      chip.isSelected ? "is-selected" : "",
                      chip.isUsedBySamplePool ? "is-used" : "",
                      chip.id === armedDeletePresetId ? "is-delete-armed" : "",
                      isEditingPreset ? "is-editing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {isSelectedPreset ? (
                      <div className="trading-rules-template-edit-row">
                        <Input
                          ref={editingPresetInputRef}
                          className="replay-settings-v2-input replay-settings-v2-control-sm trading-rules-current-template-input"
                          density="compact"
                          value={
                            isEditingPreset
                              ? editingPresetDraftName
                              : chip.label
                          }
                          maxLength={INPUT_LIMITS.tradingPresetNameChars}
                          onFocus={() => startEditingPreset(chip.id)}
                          onChange={(event) => {
                            if (!isEditingPreset) {
                              startEditingPreset(chip.id);
                            }
                            setEditingPresetDraftName(event.target.value);
                          }}
                          onKeyDown={handlePresetEditInputKeyDown}
                          onBlur={(event) =>
                            handlePresetEditInputBlur(
                              chip.id,
                              event.currentTarget.value,
                            )
                          }
                          placeholder={tradingSettingsText.presetNamePlaceholder}
                          aria-label={tradingSettingsText.presetNameLabel}
                          title={chip.label}
                        />
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="trading-rules-template-row-trigger"
                        onClick={() => handlePresetChipSelect(chip.id)}
                        title={chip.label}
                      >
                        <span className="trading-rules-template-label">
                          {chip.label}
                        </span>
                      </Button>
                    )}
                    {chip.isUsedBySamplePool ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="trading-rules-template-used-dot"
                            data-preset-manage-action="true"
                            aria-label={usageSummary}
                          />
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="center"
                          className="trading-settings-sheet-preset-tooltip"
                        >
                          <div className="trading-settings-sheet-preset-tooltip-body">
                            <p>{usageSummary}</p>
                            {usageFallbackHint ? (
                              <p>{usageFallbackHint}</p>
                            ) : null}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {activePreset ? (
              <div className="trading-rules-template-actions">
                {canUpdateCurrentTemplate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="trading-rules-template-action"
                    onClick={handleUpdateCurrentTemplate}
                  >
                    <VendorIcon name="check" />
                    <span>
                      {tradingSettingsText.updateCurrentTemplateActionLabel}
                    </span>
                  </Button>
                ) : null}
                {canSaveAsNewTemplate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="trading-rules-template-action"
                    onClick={handleSaveAsNewTemplate}
                  >
                    <VendorIcon name="plus" />
                    <span>
                      {tradingSettingsText.saveAsReusableTemplateActionLabel}
                    </span>
                  </Button>
                ) : null}
                {activePreset.canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`trading-rules-template-action is-danger ${
                      isActivePresetDeleteArmed ? "is-armed" : ""
                    }`}
                    onClick={() => handlePresetDeleteAction(activePreset.id)}
                    disabled={!canMutateTemplate}
                  >
                    <VendorIcon name="trash2" />
                    <span>
                      {isActivePresetDeleteArmed
                        ? tt("appText.confirmDelete3")
                        : tradingSettingsText.deletePresetActionLabel}
                    </span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`trading-rules-template-action ${
                    isResetDefaultsArmed ? "is-danger is-armed" : ""
                  }`}
                  onClick={handleResetDefaultsAction}
                  disabled={!canMutateTemplate}
                >
                  <VendorIcon
                    name={isResetDefaultsArmed ? "alertTriangle" : "shield"}
                  />
                  <span>
                    {isResetDefaultsArmed
                      ? tradingSettingsText.confirmResetDefaultsActionLabel
                      : tradingSettingsText.resetAllPresetParamsActionLabel}
                  </span>
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      }
      sections={sections}
      footerActions={
        <div
          className="trading-rules-action-bar"
          data-preset-manage-root="true"
        >
          <Button
            type="button"
            variant="default"
            size="sm"
            loading={trainerSettingsPanel.isSavingTradingSettings}
            loadingLabel={tradingSettingsText.applyTradingSettingsActionLabel}
            onClick={trainerSettingsPanel.onSave}
            disabled={isApplyDisabled}
          >
            <VendorIcon name="check" />
            <span>{tradingSettingsText.applyTradingSettingsActionLabel}</span>
          </Button>
        </div>
      }
      headerClassName="trading-settings-sheet-header"
      bodyClassName="trading-settings-sheet-body"
      footerClassName="trading-rules-footer"
      sectionsClassName="trading-rules-window-sections"
    />
  );
};
