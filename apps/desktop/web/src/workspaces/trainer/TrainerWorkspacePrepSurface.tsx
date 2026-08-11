// SPDX-License-Identifier: GPL-3.0-only

import { AppIcon, VendorIcon } from "@/assets/graphics";
import type {
  TrainerStartPointInlineHistoryStatus,
  TrainerStartPointWindowPayload,
} from "@/domains/trainer/trainerStartPointTypes";
import { FeatureLockLabel } from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { SearchSelectField } from "@/ui/primitives/search-select-field";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { SelectField } from "@/ui/primitives/select-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import {
  TrainerStartPointInlineHistory,
} from "@/workspaces/trainer/TrainerStartPointDrawer";
import type { TrainerWorkspacePageProps } from "@/workspaces/trainer/trainerWorkspaceSurfaceTypes";
import type { ReactNode } from "react";

type TrainerPrepWorkspaceSurfaceProps = {
  freeReplaySetup: TrainerWorkspacePageProps["freeReplaySetup"];
  prepDisabled: boolean;
  isBusy: boolean;
  isActive: boolean;
  isPreparingAction: boolean;
  isTradingAssetWindowOpen: boolean;
  isStartPointWindowOpen: boolean;
  effectivePrepMode: TrainerWorkspacePageProps["freeReplaySetup"]["selectedMode"];
  activeModeIndicatorTransform: string;
  launchFxDisabled: boolean;
  randomLabel: string;
  blindBoxShowLabel: string;
  blindBoxHideLabel: string;
  isBlindBoxHidden: boolean;
  showBlindBoxStatusPill: boolean;
  prepFooterHelperText: string;
  environmentRuleDetailsLabel: string;
  trainerStartPointWindowPayload: TrainerStartPointWindowPayload | null;
  trainerStartPointInlineHistoryPayload:
    | (TrainerStartPointWindowPayload & { isDisabled: boolean })
    | null;
  visibleStartPointInlineHistoryStatus:
    | TrainerStartPointInlineHistoryStatus
    | null;
  canUseFocusedStartPoint: boolean;
  handleStartPrepSession: () => void;
  handleStartPointInlineHistoryStatusChange: (
    status: TrainerStartPointInlineHistoryStatus | null,
  ) => void;
  openStartPointWindow: () => void;
  openTradingAssetSettingsDrawer: () => void;
};

const TrainerPrepWorkspaceBackdrop = ({
  children,
}: {
  children?: ReactNode;
}) => (
  <div className="app-shell trainer-prep-backdrop-shell">
    <section
      className="left-panel card trainer-prep-backdrop-panel"
      aria-hidden="true"
    >
      <div className="trainer-prep-backdrop-chart">
        <div className="trainer-prep-backdrop-chart-grid" />
        <div className="trainer-prep-backdrop-chart-grid is-secondary" />
      </div>
    </section>
    <section
      className="right-panel card right-panel-no-head trainer-prep-backdrop-side-panel"
      aria-hidden="true"
    >
      <div className="trainer-prep-backdrop-side-stack">
        <div className="trainer-prep-backdrop-side-card is-wide" />
        <div className="trainer-prep-backdrop-side-card" />
        <div className="trainer-prep-backdrop-side-card" />
      </div>
    </section>
    {children ? (
      <div className="trainer-prep-inline-layer">{children}</div>
    ) : null}
  </div>
);

export const TrainerWorkspacePrepSurface = ({
  freeReplaySetup,
  prepDisabled,
  isBusy,
  isActive,
  isPreparingAction,
  isTradingAssetWindowOpen,
  isStartPointWindowOpen,
  effectivePrepMode,
  activeModeIndicatorTransform,
  launchFxDisabled,
  randomLabel,
  blindBoxShowLabel,
  blindBoxHideLabel,
  isBlindBoxHidden,
  showBlindBoxStatusPill,
  prepFooterHelperText,
  environmentRuleDetailsLabel,
  trainerStartPointWindowPayload,
  trainerStartPointInlineHistoryPayload,
  visibleStartPointInlineHistoryStatus,
  canUseFocusedStartPoint,
  handleStartPrepSession,
  handleStartPointInlineHistoryStatusChange,
  openStartPointWindow,
  openTradingAssetSettingsDrawer,
}: TrainerPrepWorkspaceSurfaceProps) => {
  const samplePoolAndSymbolSection = (
    <section
      className={`trainer-free-replay-section trainer-prep-selection-section trainer-prep-selection-section-${effectivePrepMode.toLowerCase()}`}
    >
      <div className="trainer-prep-selection-card">
        <div className="trainer-prep-selection-field">
          <span className="trainer-free-replay-section-label">
            <span data-i18n-slot="sectionLabel" data-i18n-critical="true">
              {freeReplaySetup.samplePoolLabel}
            </span>
          </span>
          <SelectField
            className={`trainer-free-replay-select trainer-prep-pool-select ${
              freeReplaySetup.samplePoolOptions.length ? "" : "is-empty"
            }`}
            value={freeReplaySetup.selectedSamplePoolId}
            disabled={prepDisabled || !freeReplaySetup.samplePoolOptions.length}
            onValueChange={freeReplaySetup.onSelectSamplePool}
            options={
              freeReplaySetup.samplePoolOptions.length
                ? freeReplaySetup.samplePoolOptions.map((option) => ({
                    value: option.value,
                    label: (
                      <FeatureLockLabel locked={option.locked}>
                        {option.label}
                      </FeatureLockLabel>
                    ),
                    textValue: option.label,
                  }))
                : [{ value: "", label: freeReplaySetup.noSamplePoolLabel }]
            }
          />
        </div>

        <div className="trainer-prep-selection-field">
          <span className="trainer-free-replay-section-label">
            {freeReplaySetup.symbolLabel}
          </span>
          {effectivePrepMode === "FOCUSED" ? (
            <SearchSelectField
              value={freeReplaySetup.selectedSymbolId}
              options={freeReplaySetup.symbolOptions.map((option) => ({
                value: option.value,
                label: (
                  <FeatureLockLabel locked={option.locked}>
                    {option.label}
                  </FeatureLockLabel>
                ),
                textValue: option.label,
                disabled: option.locked,
              }))}
              placeholder={freeReplaySetup.noSymbolLabel}
              searchPlaceholder={freeReplaySetup.symbolSearchPlaceholder}
              onValueChange={freeReplaySetup.onSelectSymbol}
              disabled={prepDisabled}
              className={`trainer-free-replay-select trainer-prep-pool-select ${
                freeReplaySetup.availableSymbolCount > 0 ? "" : "is-empty"
              }`}
            />
          ) : (
            <SelectField
              className="trainer-free-replay-select trainer-prep-pool-select"
              value="__random_symbol__"
              disabled
              aria-label={freeReplaySetup.symbolLabel}
              options={[{ value: "__random_symbol__", label: randomLabel }]}
            />
          )}
        </div>
      </div>
    </section>
  );

  const environmentRulesSummary = (
    <div className="trainer-prep-rule-summary">
      <div className="trainer-prep-rule-summary-inner">
        <div className="trainer-prep-rule-head">
          <div className="trainer-prep-environment-copy">
            <span className="trainer-free-replay-section-label">
              {freeReplaySetup.environmentRulesTitle}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="trainer-prep-environment-action"
            onClick={openTradingAssetSettingsDrawer}
            aria-label={freeReplaySetup.environmentActionLabel}
            aria-haspopup="dialog"
            aria-expanded={isTradingAssetWindowOpen}
            title={freeReplaySetup.environmentActionLabel}
          >
            <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
              {environmentRuleDetailsLabel}
            </span>
            <AppIcon
              name="actionChevronRight"
              className="trainer-prep-environment-action-icon"
              aria-hidden="true"
            />
          </Button>
        </div>
        <div className="trainer-prep-rule-grid">
          {freeReplaySetup.environmentRuleCards.map((card) => (
            <div key={card.id} className="trainer-prep-rule-card">
              <span className="trainer-prep-rule-card-label">{card.label}</span>
              <span className="trainer-prep-rule-card-value">{card.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const environmentSection = (
    <section
      className="trainer-free-replay-section trainer-prep-environment-section"
      data-onboarding-target="FREE_REPLAY_PREP_CONFIG"
    >
      <div className="trainer-prep-environment-card">
        <div className="trainer-prep-environment-copy">
          <span className="trainer-free-replay-section-label">
            <span data-i18n-slot="cardTitle" data-i18n-critical="true">
              {freeReplaySetup.environmentTitle}
            </span>
          </span>
        </div>
        <div className="trainer-prep-environment-stack">
          <div className="trainer-prep-environment-field">
            <span className="trainer-prep-environment-field-label">
              {freeReplaySetup.environmentAssetLabel}
            </span>
            <SegmentedControl
              className="trainer-prep-environment-asset-seg"
              size="sm"
              gridTemplateColumns="repeat(4, minmax(0, 1fr))"
              options={freeReplaySetup.environmentAssetOptions}
              value={freeReplaySetup.selectedEnvironmentAssetClass}
              onChange={(value) =>
                freeReplaySetup.onSelectEnvironmentAssetClass(value as any)
              }
            />
          </div>
          <div className="trainer-prep-environment-field">
            <span className="trainer-prep-environment-field-label">
              {freeReplaySetup.environmentPresetLabel}
            </span>
            <div className="trainer-prep-environment-preset-control">
              <SelectField
                className="trainer-free-replay-select trainer-prep-pool-select trainer-prep-environment-preset-select"
                value={freeReplaySetup.selectedEnvironmentPresetId}
                disabled={
                  prepDisabled || !freeReplaySetup.environmentPresetOptions.length
                }
                onValueChange={freeReplaySetup.onSelectEnvironmentPreset}
                options={freeReplaySetup.environmentPresetOptions}
              />
              <Button
                type="button"
                variant="field"
                size="icon"
                className="trainer-prep-environment-preset-gear"
                onClick={openTradingAssetSettingsDrawer}
                aria-label={freeReplaySetup.environmentActionLabel}
                aria-haspopup="dialog"
                title={freeReplaySetup.environmentActionLabel}
              >
                <AppIcon
                  name="settingsGear"
                  className="trainer-prep-environment-preset-gear-icon"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
          <label className="trainer-prep-environment-sync">
            <Checkbox
              checked={freeReplaySetup.persistEnvironmentToPool}
              disabled={prepDisabled}
              onChange={(event) =>
                freeReplaySetup.onPersistEnvironmentToPoolChange(
                  event.target.checked,
                )
              }
            />
            <span className="trainer-prep-environment-sync-copy">
              <span className="trainer-prep-environment-sync-label">
                {freeReplaySetup.persistEnvironmentToPoolLabel}
              </span>
              <span className="trainer-prep-environment-sync-hint">
                {freeReplaySetup.persistEnvironmentToPoolHint}
              </span>
            </span>
          </label>
        </div>
        {environmentRulesSummary}
      </div>
    </section>
  );

  const minimumBaseTimeframeSection = (
    <section className="trainer-free-replay-section">
      <span className="trainer-free-replay-section-label">
        <span data-i18n-slot="sectionLabel" data-i18n-critical="true">
          {freeReplaySetup.minimumBaseTimeframeLabel}
        </span>
      </span>
      <SegmentedControl
        className="trainer-prep-timeframe-seg"
        size="sm"
        gridTemplateColumns="repeat(4, minmax(0, 1fr))"
        options={freeReplaySetup.minimumBaseTimeframeOptions.map((option) => ({
          ...option,
          disabled: prepDisabled || option.disabled,
        }))}
        value={freeReplaySetup.selectedMinimumBaseTimeframe}
        onChange={(value) =>
          freeReplaySetup.onSelectMinimumBaseTimeframe(value as any)
        }
      />
    </section>
  );

  const prepConfigPanel = (
    <section
      className="trainer-prep-config-dialog trainer-prep-inline-surface"
      aria-label={freeReplaySetup.dialogTitle}
    >
      <div className="trainer-prep-config-dialog-body">
        <h2 className="sr-only">{freeReplaySetup.dialogTitle}</h2>
        {freeReplaySetup.dialogSubtitle ? (
          <p className="sr-only">{freeReplaySetup.dialogSubtitle}</p>
        ) : null}
        <div className="trainer-prep-top-row">
          <div className="trainer-prep-mode-switch-wrap">
            <div
              className="trainer-prep-mode-switch"
              role="tablist"
              aria-label={freeReplaySetup.modeLabel}
            >
              <span
                className="trainer-prep-mode-switch-indicator"
                aria-hidden="true"
                style={{ transform: activeModeIndicatorTransform }}
              />
              {freeReplaySetup.modeOptions.map((option) => {
                const isActive = option.value === freeReplaySetup.selectedMode;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    role="tab"
                    aria-selected={isActive}
                    className={`${isActive ? "is-active" : ""}`}
                    disabled={prepDisabled}
                    onClick={() => freeReplaySetup.onSelectMode(option.value)}
                  >
                    <span data-i18n-slot="tabLabel" data-i18n-critical="true">
                      {option.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
          {freeReplaySetup.showResumeAction ? (
            <div style={{ gridColumn: 3, justifySelf: "end" }}>
              <Button
                type="button"
                variant="ghost"
                disabled={launchFxDisabled || freeReplaySetup.resumeDisabled}
                onClick={freeReplaySetup.onResume}
              >
                <span className="trainer-free-replay-resume-btn-main">
                  <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
                    {freeReplaySetup.resumeLabel}
                  </span>
                </span>
              </Button>
            </div>
          ) : null}
        </div>
        <div className="trainer-prep-console-shell">
          <div className="trainer-prep-console-core">
            <div
              className={`trainer-prep-console-columns trainer-prep-console-columns-${effectivePrepMode.toLowerCase()}`}
            >
              <div className="trainer-prep-console-column trainer-prep-console-column-left">
                {samplePoolAndSymbolSection}
                <div
                  className={`trainer-prep-mode-panel trainer-prep-mode-panel-${effectivePrepMode.toLowerCase()}`}
                >
                  {effectivePrepMode === "RANDOM" ? (
                    <>
                      {minimumBaseTimeframeSection}

                      <section className="trainer-free-replay-section trainer-free-replay-blindbox-section">
                        <div className="trainer-prep-blindbox-head">
                          <span className="trainer-free-replay-section-label">
                            <span
                              data-i18n-slot="sectionLabel"
                              data-i18n-critical="true"
                            >
                              {freeReplaySetup.blindBoxLabel}
                            </span>
                          </span>
                          <span
                            className={`trainer-free-replay-blindbox-pill ${
                              showBlindBoxStatusPill ? "" : "is-inactive"
                            }`}
                            aria-hidden={!showBlindBoxStatusPill}
                          >
                            <AppIcon name="actionHidden" aria-hidden="true" />
                            <span
                              data-i18n-slot="statusLabel"
                              data-i18n-critical="true"
                            >
                              {freeReplaySetup.blindBoxActiveLabel}
                            </span>
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className={`trainer-free-replay-blindbox-toggle trainer-prep-blindbox-toggle ${
                            isBlindBoxHidden ? "is-hidden" : "is-visible"
                          }`}
                          disabled={prepDisabled}
                          aria-pressed={isBlindBoxHidden}
                          onClick={() =>
                            freeReplaySetup.onSelectBlindBox(
                              isBlindBoxHidden ? "SHOW" : "HIDE",
                            )
                          }
                        >
                          <span
                            className={`trainer-free-replay-blindbox-toggle-label ${
                              !isBlindBoxHidden ? "is-active" : ""
                            }`}
                          >
                            <span
                              data-i18n-slot="toggleLabel"
                              data-i18n-critical="true"
                            >
                              {blindBoxShowLabel}
                            </span>
                          </span>
                          <span
                            className="trainer-free-replay-blindbox-switch"
                            aria-hidden="true"
                          >
                            <span className="trainer-free-replay-blindbox-switch-thumb" />
                          </span>
                          <span
                            className={`trainer-free-replay-blindbox-toggle-label ${
                              isBlindBoxHidden ? "is-active" : ""
                            }`}
                          >
                            <span
                              data-i18n-slot="toggleLabel"
                              data-i18n-critical="true"
                            >
                              {blindBoxHideLabel}
                            </span>
                          </span>
                        </Button>
                      </section>
                    </>
                  ) : (
                    <>
                      {minimumBaseTimeframeSection}

                      {trainerStartPointWindowPayload ? (
                        <section
                          className={`trainer-free-replay-section trainer-prep-start-point-section ${
                            trainerStartPointInlineHistoryPayload
                              ? "has-inline-control"
                              : "is-empty"
                          }`}
                        >
                          <div className="trainer-prep-start-point-head">
                            <span className="trainer-free-replay-section-label">
                              {freeReplaySetup.startPointLabel}
                            </span>
                            {visibleStartPointInlineHistoryStatus ? (
                              <span
                                className="trainer-prep-start-point-status-text"
                                title={visibleStartPointInlineHistoryStatus.anchorText}
                              >
                                <span>
                                  {visibleStartPointInlineHistoryStatus.anchorText}
                                </span>
                              </span>
                            ) : null}
                            <span
                              className="trainer-prep-start-point-head-spacer"
                              aria-hidden="true"
                            />
                            <Tooltip delay={0}>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={prepDisabled || !canUseFocusedStartPoint}
                                  aria-label={freeReplaySetup.startPointLabel}
                                  aria-haspopup="dialog"
                                  aria-expanded={isStartPointWindowOpen}
                                  onClick={openStartPointWindow}
                                >
                                  <VendorIcon
                                    name="chevronDown"
                                    className="trainer-prep-start-point-detail-icon"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={6}>
                                {freeReplaySetup.startPointLabel}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {canUseFocusedStartPoint &&
                          trainerStartPointInlineHistoryPayload ? (
                            <div className="trainer-prep-start-point-inline-control">
                              <TrainerStartPointInlineHistory
                                payload={trainerStartPointInlineHistoryPayload}
                                isActive={isActive}
                                onApplyAnchor={freeReplaySetup.onApplyStartPoint}
                                onStatusChange={
                                  handleStartPointInlineHistoryStatusChange
                                }
                              />
                            </div>
                          ) : null}
                          {!canUseFocusedStartPoint ||
                          !trainerStartPointInlineHistoryPayload ? (
                            <div className="trainer-prep-start-point-empty">
                              <span>{freeReplaySetup.startPointEmptyText}</span>
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              <div className="trainer-prep-console-column trainer-prep-console-column-right">
                {environmentSection}
              </div>
            </div>
          </div>

          <div className="trainer-free-replay-setup-footer trainer-prep-console-footer">
            <div className="trainer-prep-summary-block">
              <span className="trainer-prep-summary-label">
                {freeReplaySetup.summaryLabel}
              </span>
              <p className="trainer-prep-summary-text">
                <span data-i18n-slot="summaryText" data-i18n-critical="true">
                  {freeReplaySetup.summaryText}
                </span>
              </p>
              <p className="trainer-prep-summary-helper">
                <span data-i18n-slot="helperText" data-i18n-critical="true">
                  {prepFooterHelperText}
                </span>
              </p>
            </div>
            <div className="trainer-free-replay-start-block trainer-prep-start-block">
              <Button
                type="button"
                variant="default"
                size="lg"
                disabled={launchFxDisabled || freeReplaySetup.startDisabled}
                loading={isBusy || isPreparingAction}
                loadingLabel={freeReplaySetup.startLabel}
                onClick={handleStartPrepSession}
              >
                <AppIcon
                  name={freeReplaySetup.startButtonIconName}
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
                  {freeReplaySetup.startLabel}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <TrainerPrepWorkspaceBackdrop>{prepConfigPanel}</TrainerPrepWorkspaceBackdrop>
  );
};
