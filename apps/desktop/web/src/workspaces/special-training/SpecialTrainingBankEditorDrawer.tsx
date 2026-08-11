// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { VendorIcon } from "@/assets/graphics";
import { StandardSheetFrame } from "@/ui/components";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import type {
  SpecialTrainingBankEditorDraft,
  SpecialTrainingBankEditorStep,
} from "@/workspaces/special-training/specialTrainingBankEditorModel";
import {
  SPECIAL_TRAINING_BANK_EDITOR_BACK_ACTION_VARIANT,
  SPECIAL_TRAINING_BANK_EDITOR_CANCEL_ACTION_VARIANT,
  readSpecialTrainingBankEditorPrimaryCta,
} from "@/workspaces/special-training/specialTrainingBankUi";

export type SpecialTrainingBankEditorPoolOption = {
  id: string;
  name: string;
  sourceTimeframeLabel: string;
  symbolCountText: string;
  selected: boolean;
  disabled: boolean;
  disabledReason: string | null;
};

export type SpecialTrainingBankEditorPreviewMetric = {
  key: string;
  label: string;
  value: string;
};

export type SpecialTrainingBankEditorStepItem = {
  id: SpecialTrainingBankEditorStep;
  label: string;
};

export type SpecialTrainingBankEditorWindowPayload = {
  title: string;
  description: string;
  cancelLabel: string;
  backLabel: string;
  nextLabel: string;
  saveLabel: string;
  draft: SpecialTrainingBankEditorDraft;
  steps: SpecialTrainingBankEditorStepItem[];
  step: SpecialTrainingBankEditorStep;
  configTitle: string;
  configHint: string;
  nameLabel: string;
  timeframeLabel: string;
  timeframeHint: string;
  poolsLabel: string;
  poolsHint: string;
  poolsEmptyLabel: string;
  missingPoolsLabel: string;
  sourceTimeframeLabel: string;
  symbolCountLabel: string;
  selectionStatusLabel: string;
  selectionStatusTone: "ready" | "warning";
  autoRemovedNotice: string | null;
  previewTitle: string;
  previewSubtitle: string;
  previewLoading: boolean;
  previewLoadingLabel: string;
  previewErrorLabel: string | null;
  previewSummaryLines: string[];
  previewMetrics: SpecialTrainingBankEditorPreviewMetric[];
  availablePoolOptions: SpecialTrainingBankEditorPoolOption[];
  timeframeOptions: Array<{
    value: BaseTimeframe;
    label: string;
  }>;
  missingPoolIds: string[];
  canGoBack: boolean;
  canSave: boolean;
  nextDisabled: boolean;
  saveDisabled: boolean;
  primaryActionHint: string | null;
};

export type SpecialTrainingBankEditorDrawerProps =
  SpecialTrainingBankEditorWindowPayload & {
    onClose: () => void;
    onStepChange: (step: SpecialTrainingBankEditorStep) => void;
    onNameChange: (value: string) => void;
    onTogglePool: (poolId: string) => void;
    onRemoveMissingPool: (poolId: string) => void;
    onTargetTimeframeChange: (timeframe: BaseTimeframe) => void;
    onBack: () => void;
    onNext: () => void;
    onSave: () => void;
  };

const resolveStepIconName = (step: SpecialTrainingBankEditorStep) =>
  step === "CONFIG" ? "flag" : "eye";

const resolvePreviewIconName = ({
  previewLoading,
  previewErrorLabel,
}: {
  previewLoading: boolean;
  previewErrorLabel: string | null;
}) =>
  previewLoading
    ? "loaderCircle"
    : previewErrorLabel
      ? "alertTriangle"
      : "shield";

const resolveMetricIconName = (metricKey: string) => {
  switch (metricKey) {
    case "available":
      return "check";
    case "completed":
      return "flag";
    default:
      return "circle";
  }
};

export const SpecialTrainingBankEditorDrawer = ({
  title,
  description,
  cancelLabel,
  backLabel,
  nextLabel,
  saveLabel,
  draft,
  steps,
  step,
  onStepChange,
  configTitle,
  configHint,
  nameLabel,
  timeframeLabel,
  timeframeHint,
  poolsLabel,
  poolsHint,
  poolsEmptyLabel,
  missingPoolsLabel,
  sourceTimeframeLabel,
  symbolCountLabel,
  selectionStatusLabel,
  selectionStatusTone,
  autoRemovedNotice,
  previewTitle,
  previewSubtitle,
  previewLoading,
  previewLoadingLabel,
  previewErrorLabel,
  previewSummaryLines,
  previewMetrics,
  availablePoolOptions,
  timeframeOptions,
  missingPoolIds,
  onNameChange,
  onTogglePool,
  onRemoveMissingPool,
  onTargetTimeframeChange,
  onBack,
  onNext,
  onSave,
  canGoBack,
  canSave,
  nextDisabled,
  saveDisabled,
  primaryActionHint,
  onClose,
}: SpecialTrainingBankEditorDrawerProps) => {
  const primaryAction = readSpecialTrainingBankEditorPrimaryCta({
    canSave,
    nextDisabled,
    saveDisabled,
  });
  const selectedPoolCount =
    availablePoolOptions.filter((pool) => pool.selected).length +
    missingPoolIds.length;
  const previewIconName = resolvePreviewIconName({
    previewLoading,
    previewErrorLabel,
  });

  return (
    <StandardSheetFrame
      className="special-training-bank-editor-drawer"
      headerClassName="special-training-bank-editor-header"
      bodyClassName="special-training-bank-editor-body"
      title={title}
      description={description}
    >
      <div className="special-training-bank-editor-stepper">
        {steps.map((entry, index) => (
          <Button
            key={`special-training-bank-editor-step-${entry.id}`}
            type="button"
            variant="ghost"
            aria-current={entry.id === step ? "step" : undefined}
            className={`special-training-bank-editor-step ${
              entry.id === step ? "is-active" : ""
            }`}
            onClick={() => onStepChange(entry.id)}
          >
            <span className="special-training-bank-editor-step-index">
              {index + 1}
            </span>
            <VendorIcon
              name={resolveStepIconName(entry.id)}
              aria-hidden="true"
            />
            <span>{entry.label}</span>
          </Button>
        ))}
      </div>

      {step === "CONFIG" ? (
        <div className="special-training-bank-editor-section special-training-bank-editor-config">
          <div className="special-training-bank-editor-config-head">
            <div className="special-training-bank-editor-section-copy">
              <strong>{configTitle}</strong>
              <p>{configHint}</p>
            </div>
            <p
              className={`special-training-bank-editor-selection-status is-${selectionStatusTone}`}
            >
              <VendorIcon
                name={selectionStatusTone === "ready" ? "check" : "alertTriangle"}
                aria-hidden="true"
              />
              <span>{selectionStatusLabel}</span>
            </p>
          </div>

          <div className="special-training-bank-editor-config-grid">
            <label className="special-training-bank-editor-field">
              <span className="special-training-bank-editor-field-label">
                {nameLabel}
              </span>
              <Input
                value={draft.name}
                maxLength={INPUT_LIMITS.specialTrainingBankNameChars}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </label>

            <div className="special-training-bank-editor-field">
              <span className="special-training-bank-editor-field-label">
                {timeframeLabel}
              </span>
              <div className="special-training-bank-editor-chip-row">
                {timeframeOptions.map((option) => (
                  <Button
                    key={`special-training-bank-editor-timeframe-${option.value}`}
                    type="button"
                    variant="ghost"
                    className={`special-training-bank-editor-chip ${
                      option.value === draft.targetTimeframe ? "is-active" : ""
                    }`}
                    onClick={() => onTargetTimeframeChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <p className="special-training-bank-editor-inline-hint">
                {timeframeHint}
              </p>
            </div>
          </div>

          {autoRemovedNotice ? (
            <div className="special-training-bank-editor-inline-notice">
              <VendorIcon name="alertTriangle" aria-hidden="true" />
              <span>{autoRemovedNotice}</span>
            </div>
          ) : null}

          {missingPoolIds.length > 0 ? (
            <div className="special-training-bank-editor-missing-list">
              <span className="special-training-bank-editor-field-label">
                {missingPoolsLabel}
              </span>
              {missingPoolIds.map((poolId) => (
                <Button
                  key={`special-training-bank-editor-missing-${poolId}`}
                  type="button"
                  variant="ghost"
                  className="special-training-bank-editor-missing-chip"
                  onClick={() => onRemoveMissingPool(poolId)}
                >
                  <span>{poolId}</span>
                  <VendorIcon name="x" aria-hidden="true" />
                </Button>
              ))}
            </div>
          ) : null}

          <section className="special-training-bank-editor-pool-panel">
            <div className="special-training-bank-editor-pool-panel-head">
              <div className="special-training-bank-editor-section-copy">
                <strong>{poolsLabel}</strong>
                <p>{poolsHint}</p>
              </div>
              <span className="special-training-bank-editor-pool-count">
                {selectedPoolCount}
              </span>
            </div>

            {availablePoolOptions.length > 0 ? (
              <div className="special-training-bank-editor-pool-table">
                {availablePoolOptions.map((pool) => {
                  const checkboxId = `special-training-bank-editor-pool-${pool.id}`;
                  return (
                    <label
                      key={checkboxId}
                      htmlFor={checkboxId}
                      className={`special-training-bank-editor-pool-row ${
                        pool.selected ? "is-selected" : ""
                      } ${pool.disabled ? "is-disabled" : ""}`}
                    >
                      <span className="special-training-bank-editor-pool-check">
                        <Checkbox
                          id={checkboxId}
                          checked={pool.selected}
                          disabled={pool.disabled}
                          onChange={() => onTogglePool(pool.id)}
                        />
                      </span>
                      <span className="special-training-bank-editor-pool-main">
                        <strong>{pool.name}</strong>
                      </span>
                      <span className="special-training-bank-editor-pool-cell">
                        <small>{sourceTimeframeLabel}</small>
                        <strong>{pool.sourceTimeframeLabel}</strong>
                      </span>
                      <span className="special-training-bank-editor-pool-cell">
                        <small>{symbolCountLabel}</small>
                        <strong>{pool.symbolCountText}</strong>
                      </span>
                      <span className="special-training-bank-editor-pool-state">
                        {pool.disabledReason ? (
                          <>
                            <VendorIcon
                              name="alertTriangle"
                              aria-hidden="true"
                            />
                            <span>{pool.disabledReason}</span>
                          </>
                        ) : pool.selected ? (
                          <VendorIcon name="check" aria-hidden="true" />
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="special-training-bank-editor-empty">
                {poolsEmptyLabel}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {step === "PREVIEW" ? (
        <div className="special-training-bank-editor-section special-training-bank-editor-preview">
          <div className="special-training-bank-editor-preview-head">
            <span className="special-training-bank-editor-preview-icon">
              <VendorIcon
                name={previewIconName}
                aria-hidden="true"
                className={previewLoading ? "is-loading" : undefined}
              />
            </span>
            <div className="special-training-bank-editor-section-copy">
              <strong>{previewTitle}</strong>
              <p>{previewSubtitle}</p>
            </div>
          </div>

          {previewErrorLabel ? (
            <div className="special-training-bank-editor-preview-error">
              <VendorIcon name="alertTriangle" aria-hidden="true" />
              <span>{previewErrorLabel}</span>
            </div>
          ) : null}

          {!previewErrorLabel && previewMetrics.length > 0 ? (
            <div className="special-training-bank-editor-preview-metrics">
              {previewMetrics.map((metric) => (
                <article
                  key={`special-training-bank-editor-preview-metric-${metric.key}`}
                  className="special-training-bank-editor-preview-metric"
                >
                  <VendorIcon
                    name={resolveMetricIconName(metric.key)}
                    aria-hidden="true"
                  />
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>
          ) : null}

          {!previewErrorLabel && previewSummaryLines.length > 0 ? (
            <div className="special-training-bank-editor-preview-summary">
              {previewSummaryLines.map((line) => (
                <p key={`special-training-bank-editor-preview-line-${line}`}>
                  <VendorIcon name="circle" aria-hidden="true" />
                  <span>{line}</span>
                </p>
              ))}
            </div>
          ) : null}

          {!previewErrorLabel && previewLoading ? (
            <div className="special-training-bank-editor-empty">
              {previewLoadingLabel}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="special-training-bank-editor-bottom-actions">
        <div className="special-training-bank-editor-bottom-actions-copy">
          {primaryActionHint ? (
            <p className="special-training-bank-editor-action-hint">
              <VendorIcon name="alertTriangle" aria-hidden="true" />
              <span>{primaryActionHint}</span>
            </p>
          ) : null}
        </div>
        <div className="special-training-bank-editor-bottom-actions-main">
          <Button
            type="button"
            variant={SPECIAL_TRAINING_BANK_EDITOR_CANCEL_ACTION_VARIANT}
            className="special-training-bank-editor-cancel"
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={SPECIAL_TRAINING_BANK_EDITOR_BACK_ACTION_VARIANT}
            onClick={onBack}
            disabled={!canGoBack}
          >
            {backLabel}
          </Button>
          {canSave ? (
            <Button
              type="button"
              variant={primaryAction.variant}
              className="special-training-bank-editor-primary-action disabled:opacity-100"
              onClick={onSave}
              disabled={primaryAction.disabled}
            >
              {saveLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant={primaryAction.variant}
              className="special-training-bank-editor-primary-action disabled:opacity-100"
              onClick={onNext}
              disabled={primaryAction.disabled}
            >
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </StandardSheetFrame>
  );
};
