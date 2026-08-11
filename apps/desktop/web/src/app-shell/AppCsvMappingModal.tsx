// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCsvMappingPoolNameDrafts } from "@/app-shell/useCsvMappingPoolNameDrafts";
import { Button } from "@/ui/primitives/button";
import { DialogDescription, DialogTitle } from "@/ui/primitives/dialog";
import { Input } from "@/ui/primitives/input";
import { SelectField } from "@/ui/primitives/select-field";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import {
  resolveCsvFieldRenderOrder,
  type CsvFieldKey,
} from "@/domains/data-import/csvHelpers";
import type { CsvPoolNamingStrategy } from "@/app-shell/appCsvImportContracts";
import { formatCurrentMessage } from "@/frontend-kernel/i18n/messageRuntime";
import { AppModal } from "@/ui/components/AppModal";
import {
  buildCsvMappingModalViewModel,
  formatTimeZoneWithUtcOffset,
  shouldDisableCsvPoolNameInput,
} from "@/app-shell/csvMappingModalViewModel";
import { StandardModalFrame } from "@/ui/components";
import type {
  AppCsvMappingModalContentProps,
  AppCsvMappingModalProps,
} from "@/app-shell/AppCsvMappingModalTypes";
export type {
  AppCsvMappingModalProps,
  ConfirmPendingCsvImportOptions,
  CsvImportPlanConfigRow,
} from "@/app-shell/AppCsvMappingModalTypes";
import {
  TradingCalendarEditor,
  formatCompactCount,
  resolveCsvMappingDraftIssueText,
  resolveImportDiagnosticListText,
  resolveImportDiagnosticText,
  resolveImportRuleConfidenceText,
  resolvePlanTimeZoneHintText,
  resolveWarningBannerBodyText,
  type CsvMappingDraftIssue,
} from "@/app-shell/AppCsvMappingModalHelpers";

export const AppCsvMappingModal = (props: AppCsvMappingModalProps) => {
  if (!props.pendingImport) {
    return null;
  }
  return (
    <AppCsvMappingModalContent {...props} pendingImport={props.pendingImport} />
  );
};

const AppCsvMappingModalContent = ({
  presentation = "dialog",
  pendingImport,
  pendingFieldMapping,
  pendingPlanConfigRows,
  pendingImportTimeZone,
  pendingImportTimeZoneMode,
  pendingImportScopeStrategy,
  importReadinessSummaryText,
  availableTimeZones,
  isPreparingCsvImportPreview,
  csvFieldLabels,
  baseTimeframeLabels,
  tt,
  ttf,
  onPendingImportTimeZoneChange,
  onConfirmPendingImportTimeZone,
  onResetPendingImportTimeZoneRecommendation,
  onPendingImportTradingCalendarChange,
  onResetPendingImportTradingCalendarRecommendation,
  onPendingImportScopeStrategyChange,
  onUpdatePendingCsvTimestampMode,
  onUpdatePendingCsvMapping,
  onPendingPlanPoolNameChange,
  onPendingPlanSourceIdChange,
  onCancelPendingCsvImport,
  onConfirmPendingCsvImport,
  defaultAdvancedOpen = false,
}: AppCsvMappingModalContentProps) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(defaultAdvancedOpen);
  const confirmSubmissionRef = useRef(false);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);
  const [confirmSubmissionErrorText, setConfirmSubmissionErrorText] =
    useState("");
  const disabled = isPreparingCsvImportPreview || isConfirmSubmitting;
  const effectiveMapping = pendingFieldMapping ?? pendingImport.mapping;
  const draftValidation = pendingImport.draftValidation;
  const activeFieldRenderOrder = resolveCsvFieldRenderOrder(
    effectiveMapping.timestampMode,
  );
  const pendingHeaders = Array.isArray(pendingImport.headers)
    ? pendingImport.headers
    : [];
  const fieldDiagnosticsByField = new Map(
    pendingImport.fieldDiagnostics.map((diagnostic) => [
      diagnostic.field,
      diagnostic,
    ]),
  );
  const mappingIssueByField = new Map<CsvFieldKey, CsvMappingDraftIssue>();
  (draftValidation?.mapping.issues ?? []).forEach((issue) => {
    if (!mappingIssueByField.has(issue.field)) {
      mappingIssueByField.set(issue.field, issue);
    }
  });
  const repairWarnings = Array.isArray(pendingImport.repairSummary?.warnings)
    ? pendingImport.repairSummary.warnings
    : [];
  const timeZoneConfidence =
    pendingImport.timeZoneSuggestion?.confidence ?? "LOW";
  const invalidFieldCount = draftValidation?.mapping.issueCount ?? 0;
  const hasInvalidField = draftValidation
    ? !draftValidation.mapping.valid
    : false;
  const hasInvalidTradingCalendar = draftValidation
    ? !draftValidation.tradingCalendar.valid
    : false;
  const tradingCalendarIssueText = hasInvalidTradingCalendar
    ? tt("appText.tradingCalendarInvalid")
    : "";
  const withParentExampleSubfolder = useMemo(
    () =>
      String(
        pendingImport.planSummaries.find(
          (plan) =>
            plan.strategy === "WITH_PARENT" &&
            Math.max(0, Number(plan.fileCount) || 0) > 0 &&
            Math.max(0, Number(plan.symbolCount) || 0) > 0,
        )?.topLevelSubfolder || "",
      ).trim(),
    [pendingImport.planSummaries],
  );
  const mappingStatusText = hasInvalidField
    ? formatCurrentMessage("appText.mappingStatusValue0Missing", [
        String(invalidFieldCount),
      ])
    : tt("appText.mappingStatusComplete");
  const modalViewModel = buildCsvMappingModalViewModel({
    pendingImport: {
      importEntryMode: pendingImport.importEntryMode,
      planSummaries: pendingImport.planSummaries,
      totalFiles: pendingImport.totalFiles,
      validFiles: pendingImport.validFiles,
      invalidFiles: pendingImport.invalidFiles,
      validSymbolCount: pendingImport.validSymbolCount,
    },
    pendingPlanConfigRows,
    pendingImportTimeZone,
    pendingImportScopeStrategy,
    isAdvancedOpen,
    fieldIssueCount: invalidFieldCount,
    blockingIssueKind: draftValidation?.blockingIssue.kind ?? "none",
    requiresTimeZoneConfirmation:
      draftValidation?.timeZone.confirmationRequired === true,
    tt,
    ttf,
  });
  const {
    availableScopeStrategies,
    environmentTimeZoneValue,
    blockingIssueKind,
    importFileValidationSummary,
    requiresTimeZoneConfirmation,
    samplePoolCount,
    shouldShowAdvancedCard,
    shouldShowAdvancedBody,
    shouldShowAdvancedTargeting,
    shouldShowGlobalTimeZonePicker,
    shouldShowWarningBanner,
    shouldShowPlanTimeZoneInline,
    shouldShowSamplePoolColumnHeader,
    shouldShowScopeStrategySelector,
    compactSummaryMetrics,
    warningBannerBodyText: warningBannerBodyFallbackText,
    warningBannerTitleText,
  } = modalViewModel;
  const showTimeframeInPoolNameLabel = shouldShowSamplePoolColumnHeader;
  const confirmDisabled = disabled || draftValidation?.confirm.enabled !== true;
  const mappingProfileSummaryText = formatCurrentMessage(
    "appText.importMappingRuleProfileValue0",
    [
      `${pendingImport.mappingProfile.priceFamily} / ${resolveImportRuleConfidenceText(
        pendingImport.mappingProfile.confidence,
        tt,
      )}`,
    ],
  );
  const repairWarningsText = repairWarnings.length
    ? formatCurrentMessage("appText.importRepairWarningsValue0", [
        resolveImportDiagnosticListText(repairWarnings, tt),
      ])
    : "";
  const timeZoneEvidenceText = formatCurrentMessage(
    "appText.importTimeZoneEvidenceValue0",
    [
      pendingImport.timeZoneSuggestion.reasons
        .map((reason) => `${reason.code}:${reason.score}`)
        .filter(Boolean)
        .join(", ") || "--",
    ],
  );
  const timeZoneSummaryText = `${timeZoneEvidenceText} ${resolveImportRuleConfidenceText(timeZoneConfidence, tt)}`;
  const timestampModeOptions = useMemo(
    () => [
      { value: "SINGLE" as const, label: tt("appText.singleColumnDatetime") },
      {
        value: "SPLIT" as const,
        label: tt("appText.splitColumnsDatePlusTime"),
      },
    ],
    [tt],
  );
  const importScopeSummaryText =
    pendingImportScopeStrategy === "WITH_PARENT"
      ? ttf("appText.topLevelSubfolderValue0", [
          withParentExampleSubfolder || "--",
        ])
      : tt("appText.wholeFolder");
  const displayEnvironmentTimeZoneValue = formatTimeZoneWithUtcOffset(
    environmentTimeZoneValue,
  );
  const displayTimeZoneOptions = useMemo(
    () =>
      availableTimeZones.map((timeZone) => ({
        value: timeZone,
        label: formatTimeZoneWithUtcOffset(timeZone),
      })),
    [availableTimeZones],
  );
  const timeframeSummaryText =
    Array.from(
      new Set(
        pendingPlanConfigRows
          .map((row) => baseTimeframeLabels[row.baseTimeframe])
          .filter(Boolean),
      ),
    ).join(" / ") ||
    baseTimeframeLabels[pendingImport.detectedTimeframe] ||
    "--";
  const acquisitionAdjustmentText =
    pendingImport.marketDataAcquisitionMetadata?.adjustment === "none"
      ? tt("appText.marketDataAcquisitionAdjustmentNone")
      : pendingImport.marketDataAcquisitionMetadata?.adjustment === "qfq"
        ? tt("appText.marketDataAcquisitionAdjustmentQfq")
        : pendingImport.marketDataAcquisitionMetadata?.adjustment === "hfq"
          ? tt("appText.marketDataAcquisitionAdjustmentHfq")
          : "";
  const warningBannerBody = resolveWarningBannerBodyText({
    blockingIssueKind,
    fallbackText: warningBannerBodyFallbackText,
    mappingProfileSummaryText,
    repairWarningsText,
    timeZoneSummaryText,
  });
  useEffect(() => {
    setIsAdvancedOpen(defaultAdvancedOpen);
  }, [defaultAdvancedOpen, pendingImport.previewToken]);

  useEffect(() => {
    confirmSubmissionRef.current = false;
    setIsConfirmSubmitting(false);
    setConfirmSubmissionErrorText("");
  }, [pendingImport.previewToken]);

  const {
    buildPoolNameConfirmationOptions,
    commitPoolNameDraft,
    poolNameDrafts,
    shouldDeferPoolNameCommit,
    updatePoolNameDraft,
  } = useCsvMappingPoolNameDrafts({
    onPendingPlanPoolNameChange,
    pendingPlanConfigRows,
    presentation,
  });

  const handleConfirmPendingCsvImport = useCallback(() => {
    if (confirmSubmissionRef.current || confirmDisabled) {
      return;
    }
    confirmSubmissionRef.current = true;
    setIsConfirmSubmitting(true);
    setConfirmSubmissionErrorText("");
    const releaseSubmission = () => {
      confirmSubmissionRef.current = false;
      setIsConfirmSubmitting(false);
    };
    try {
      void Promise.resolve(
        onConfirmPendingCsvImport(buildPoolNameConfirmationOptions()),
      ).then(
        (result) => {
          if (result?.accepted === false) {
            setConfirmSubmissionErrorText(
              String(result.reason || "").trim() ||
                tt("appText.importPreviewFailed"),
            );
          }
          releaseSubmission();
        },
        () => {
          setConfirmSubmissionErrorText(tt("appText.importPreviewFailed"));
          releaseSubmission();
        },
      );
    } catch {
      setConfirmSubmissionErrorText(tt("appText.importPreviewFailed"));
      releaseSubmission();
    }
  }, [
    buildPoolNameConfirmationOptions,
    confirmDisabled,
    onConfirmPendingCsvImport,
    tt,
  ]);

  const timeZoneResetAction =
    pendingImportTimeZoneMode === "MANUAL" ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="csv-preview-rule-card-action csv-preview-timezone-reset-action is-ghost"
        onClick={onResetPendingImportTimeZoneRecommendation}
        disabled={disabled}
      >
        <span className="csv-preview-timezone-reset-label">
          {tt("appText.resetRecommended")}
        </span>
      </Button>
    ) : null;

  const modalFrame = (
    <StandardModalFrame
      variant="workflow"
      headerClassName="csv-preview-modal-head"
      bodyClassName="csv-preview-modal-body"
      footerClassName="csv-preview-modal-actions"
      footerMode="between"
      title={
        <div
          className="csv-preview-modal-title"
          data-i18n-slot="cardTitle"
          data-i18n-critical="true"
        >
          {tt("appText.samplePoolImportConfiguration")}
        </div>
      }
      description={
        <div className="csv-preview-modal-sub">
          {importFileValidationSummary}
        </div>
      }
      actions={
        <div className="csv-preview-modal-action-buttons">
          <Button
            variant="ghost"
            onClick={onCancelPendingCsvImport}
            disabled={disabled}
          >
            <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
              {tt("appText.cancel")}
            </span>
          </Button>
          <Button
            variant="default"
            onClick={handleConfirmPendingCsvImport}
            disabled={confirmDisabled}
          >
            <VendorIcon name="check" className="csv-preview-inline-icon" />
            <span data-i18n-slot="buttonLabel" data-i18n-critical="true">
              {tt("appText.confirmBuildSamplePools")}
            </span>
          </Button>
        </div>
      }
    >
      <section className="csv-preview-workbench">
        {confirmSubmissionErrorText ? (
          <section
            className="csv-preview-timezone-status has-warning"
            role="alert"
            aria-live="assertive"
          >
            <div className="csv-preview-status-icon" aria-hidden="true">
              <VendorIcon name="alertTriangle" />
            </div>
            <div className="csv-preview-status-copy">
              <div className="csv-preview-status-title">
                {tt("appText.import")}
              </div>
              <div className="csv-preview-section-hint">
                {confirmSubmissionErrorText}
              </div>
            </div>
          </section>
        ) : null}
        <main className="csv-preview-main-stack">
          <section className="csv-preview-panel csv-preview-field-panel">
            <header className="csv-preview-panel-head">
              <div className="csv-preview-panel-title-block">
                <div>
                  <h3 data-i18n-slot="sectionTitle" data-i18n-critical="true">
                    {tt("appText.fieldMappingConfirmation")}
                  </h3>
                </div>
              </div>
              <SegmentedControl
                className="csv-preview-mapping-segment"
                options={timestampModeOptions}
                value={effectiveMapping.timestampMode}
                onChange={(value) => onUpdatePendingCsvTimestampMode(value)}
                gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                size="sm"
              />
            </header>

            <div className="csv-preview-mapping-grid">
              {activeFieldRenderOrder.map((field) => {
                const selectedHeader = String(
                  effectiveMapping[field] ?? "",
                ).trim();
                const isOptionalField = field === "volume";
                const mappingIssue = mappingIssueByField.get(field) ?? null;
                const diagnostic = fieldDiagnosticsByField.get(field) ?? null;
                const diagnosticCandidateText = diagnostic?.candidates?.length
                  ? diagnostic.candidates
                      .slice(0, 3)
                      .map(
                        (candidate) =>
                          `${candidate.header} (${candidate.score})`,
                      )
                      .join(" / ")
                  : "";
                const isInvalid = Boolean(mappingIssue);
                const diagnosticText = diagnostic
                  ? formatCurrentMessage(
                      "appText.importFieldCandidateValue0ConfidenceValue1",
                      [
                        diagnosticCandidateText ||
                          resolveImportDiagnosticText(diagnostic.reason, tt),
                        resolveImportRuleConfidenceText(
                          diagnostic.confidence,
                          tt,
                        ),
                      ],
                    )
                  : "";
                const mappingIssueText = resolveCsvMappingDraftIssueText({
                  issue: mappingIssue,
                  field,
                  csvFieldLabels,
                  fallbackText: diagnosticText || mappingStatusText,
                  tt,
                  ttf,
                });
                return (
                  <label
                    key={field}
                    className={`csv-preview-mapping-row ${isInvalid ? "is-invalid" : ""}`}
                  >
                    <span className="csv-preview-mapping-label">
                      {csvFieldLabels[field]}
                      {isOptionalField ? (
                        <span className="csv-preview-field-optional">
                          {tt("appText.optional")}
                        </span>
                      ) : null}
                    </span>
                    <SelectField
                      align="start"
                      density="compact"
                      aria-invalid={isInvalid || undefined}
                      value={selectedHeader}
                      disabled={disabled}
                      onValueChange={(nextValue) =>
                        onUpdatePendingCsvMapping(field, nextValue)
                      }
                      options={[
                        {
                          value: "",
                          label: isOptionalField
                            ? tt("appText.volumeNotImportedDefaultZero")
                            : tt("appText.select"),
                        },
                        ...pendingHeaders.map((header) => ({
                          value: header,
                          label: header,
                        })),
                      ]}
                    />
                    <span className="csv-preview-field-issue">
                      {isInvalid ? (
                        <>
                          <VendorIcon
                            name="circleAlert"
                            className="csv-preview-inline-icon"
                          />
                          <span>{mappingIssueText}</span>
                        </>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="csv-preview-panel csv-preview-pool-panel">
            <header className="csv-preview-panel-head">
              <div className="csv-preview-panel-title-block">
                <div>
                  <h3 data-i18n-slot="sectionTitle" data-i18n-critical="true">
                    {tt("appText.rawDataConfiguration")}
                  </h3>
                </div>
              </div>
            </header>

            <div className="csv-preview-pool-config-grid">
              <div className="csv-preview-timezone-block">
                <div className="csv-preview-timezone-control-head">
                  <span className="csv-preview-timezone-field-label">
                    <span className="csv-preview-field-icon" aria-hidden="true">
                      <VendorIcon name="globe2" />
                    </span>
                    <span className="csv-preview-section-label">
                      {tt("appText.timeZone")}
                    </span>
                  </span>
                  {timeZoneResetAction}
                </div>
                {shouldShowGlobalTimeZonePicker ? (
                  <div className="csv-preview-inline-field csv-preview-inline-field-full">
                    <SelectField
                      align="start"
                      density="compact"
                      value={pendingImportTimeZone}
                      disabled={disabled}
                      aria-label={tt("appText.timeZone")}
                      onValueChange={onPendingImportTimeZoneChange}
                      onSelectedValueConfirm={onPendingImportTimeZoneChange}
                      options={displayTimeZoneOptions}
                    />
                  </div>
                ) : (
                  <div className="csv-preview-environment-summary">
                    <span className="csv-preview-environment-value">
                      {displayEnvironmentTimeZoneValue}
                    </span>
                  </div>
                )}

                {requiresTimeZoneConfirmation ? (
                  <div className="csv-preview-invalid-file-hint">
                    <span>
                      {tt("appText.importLowConfidenceTimeZoneConfirm")}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="csv-preview-timezone-confirm-action"
                      onClick={onConfirmPendingImportTimeZone}
                      disabled={disabled}
                    >
                      {tt("appText.confirmCurrentTimeZone")}
                    </Button>
                  </div>
                ) : null}
              </div>

              <TradingCalendarEditor
                calendar={pendingImport.tradingCalendar}
                suggestion={pendingImport.tradingCalendarSuggestion}
                baseTimeframe={pendingImport.detectedTimeframe}
                disabled={disabled}
                tt={tt}
                ttf={ttf}
                onChange={onPendingImportTradingCalendarChange}
                onReset={onResetPendingImportTradingCalendarRecommendation}
                validationIssueText={tradingCalendarIssueText}
              />

              {shouldShowWarningBanner ? (
                <section
                  className="csv-preview-timezone-status has-warning"
                  role={blockingIssueKind === "none" ? "status" : "alert"}
                  aria-live={
                    blockingIssueKind === "none" ? "polite" : "assertive"
                  }
                >
                  <div className="csv-preview-status-icon" aria-hidden="true">
                    <VendorIcon name="alertTriangle" />
                  </div>
                  <div className="csv-preview-status-copy">
                    <div
                      className="csv-preview-status-title"
                      data-i18n-slot="cardTitle"
                      data-i18n-critical="true"
                    >
                      {warningBannerTitleText}
                    </div>
                    <div className="csv-preview-section-hint">
                      {warningBannerBody}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            {shouldShowAdvancedCard ? (
              <div className="csv-preview-advanced-card">
                <Button
                  type="button"
                  variant="ghost"
                  className={`csv-preview-advanced-toggle ${isAdvancedOpen ? "is-open" : ""}`}
                  onClick={() => setIsAdvancedOpen((current) => !current)}
                  disabled={disabled}
                >
                  <span>
                    <VendorIcon
                      name="settings2"
                      className="csv-preview-inline-icon"
                    />
                    {tt("appText.advancedSettings")}
                  </span>
                  <VendorIcon
                    name="chevronDown"
                    className="csv-preview-inline-icon"
                  />
                </Button>

                {shouldShowAdvancedBody ? (
                  <div className="csv-preview-advanced-body">
                    {shouldShowAdvancedTargeting ? (
                      <div className="csv-preview-advanced-section">
                        <div className="csv-preview-rule-card-label">
                          {tt("appText.importTarget")}
                        </div>
                        <div className="csv-preview-plan-list">
                          {pendingPlanConfigRows.map((poolRow) => {
                            if (
                              !poolRow.hasExistingTargetOptions &&
                              poolRow.effectiveTimeZoneSource !==
                                "EXISTING_SOURCE" &&
                              !poolRow.willUpdateExistingSourceTimeZone
                            ) {
                              return null;
                            }
                            return (
                              <div
                                key={`advanced-${poolRow.id}`}
                                className="csv-preview-plan-card"
                              >
                                <div className="csv-preview-plan-card-head">
                                  <span className="csv-preview-plan-card-title">
                                    {showTimeframeInPoolNameLabel
                                      ? baseTimeframeLabels[
                                          poolRow.baseTimeframe
                                        ]
                                      : tt("appText.samplePool")}
                                  </span>
                                  <span className="csv-preview-plan-chip">
                                    {poolRow.poolName ||
                                      poolRow.autoGeneratedPoolName}
                                  </span>
                                </div>

                                {poolRow.hasExistingTargetOptions ? (
                                  <label className="csv-preview-inline-field">
                                    <span className="csv-preview-section-label">
                                      {tt("appText.importTarget")}
                                    </span>
                                    <SelectField
                                      align="start"
                                      density="compact"
                                      value={poolRow.targetSourceId}
                                      disabled={disabled}
                                      title={tt("appText.importTarget")}
                                      aria-label={tt("appText.importTarget")}
                                      onValueChange={(nextValue) =>
                                        onPendingPlanSourceIdChange(
                                          poolRow.previewPlanId,
                                          nextValue,
                                        )
                                      }
                                      options={poolRow.targetSourceOptions.map(
                                        (option) => ({
                                          value: option.sourceId,
                                          label: option.sourceName,
                                        }),
                                      )}
                                    />
                                  </label>
                                ) : null}

                                {shouldShowPlanTimeZoneInline ? (
                                  <div className="csv-preview-import-rule-summary">
                                    <span className="csv-preview-import-rule-summary-label">
                                      {tt("appText.timeZone")}
                                    </span>
                                    <span className="csv-preview-import-rule-summary-value">
                                      {formatTimeZoneWithUtcOffset(
                                        poolRow.effectiveTimeZone,
                                      ) || "--"}
                                    </span>
                                  </div>
                                ) : null}

                                {shouldShowPlanTimeZoneInline ||
                                poolRow.willUpdateExistingSourceTimeZone ? (
                                  <div className="csv-preview-section-hint">
                                    {resolvePlanTimeZoneHintText(poolRow, tt)}
                                  </div>
                                ) : null}

                                {poolRow.willUpdateExistingSourceTimeZone ? (
                                  <div className="csv-preview-invalid-file-hint">
                                    {formatCurrentMessage(
                                      "appText.fullReimportChangeDataSourceTimeZoneValue0",
                                      [poolRow.effectiveTimeZone],
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="csv-preview-advanced-section">
                      {shouldShowScopeStrategySelector ? (
                        <label className="csv-preview-inline-field csv-preview-inline-field-full">
                          <span className="csv-preview-section-label">
                            {tt("appText.chooseBoundScopeSync")}
                          </span>
                          <SelectField
                            align="start"
                            density="compact"
                            value={pendingImportScopeStrategy}
                            disabled={disabled}
                            onValueChange={(nextValue) =>
                              onPendingImportScopeStrategyChange(
                                nextValue as CsvPoolNamingStrategy,
                              )
                            }
                            options={[
                              ...(availableScopeStrategies.includes("FLAT")
                                ? [
                                    {
                                      value: "FLAT",
                                      label: tt("appText.wholeFolder"),
                                    },
                                  ]
                                : []),
                              ...(availableScopeStrategies.includes(
                                "WITH_PARENT",
                              )
                                ? [
                                    {
                                      value: "WITH_PARENT",
                                      label: ttf(
                                        "appText.topLevelSubfolderValue0",
                                        [withParentExampleSubfolder || "--"],
                                      ),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </label>
                      ) : (
                        <div className="csv-preview-import-rule-summary">
                          <span className="csv-preview-import-rule-summary-label">
                            {tt("appText.chooseBoundScopeSync")}
                          </span>
                          <span className="csv-preview-import-rule-summary-value">
                            {importScopeSummaryText}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>

        <aside className="csv-preview-side-stack">
          <section className="csv-preview-summary-panel">
            <header className="csv-preview-summary-head">
              <div>
                <div
                  className="csv-preview-summary-title"
                  data-i18n-slot="cardTitle"
                  data-i18n-critical="true"
                >
                  {tt("appText.importTask")}
                </div>
                <div className="csv-preview-summary-note">
                  {importFileValidationSummary}
                </div>
              </div>
            </header>

            <div className="csv-preview-summary-metrics">
              {compactSummaryMetrics.map((metric) => (
                <div
                  key={metric.id}
                  className={`csv-preview-summary-metric tone-${metric.tone}`}
                >
                  <span>{metric.label}</span>
                  <strong>
                    {metric.id === "symbols"
                      ? formatCompactCount(Number(metric.value))
                      : metric.value}
                  </strong>
                </div>
              ))}
            </div>

            <div className="csv-preview-summary-readiness">
              {importReadinessSummaryText}
            </div>

            <div
              className={`csv-preview-summary-pool-section ${showTimeframeInPoolNameLabel ? "" : "is-single"}`}
            >
              <div className="csv-preview-summary-pool-head">
                <span className="csv-preview-section-label">
                  {tt("appText.samplePool")}
                </span>
                {samplePoolCount > 1 ? (
                  <span className="csv-preview-plan-count">
                    {formatCompactCount(samplePoolCount)}
                  </span>
                ) : null}
              </div>
              {showTimeframeInPoolNameLabel ? (
                <div
                  className="csv-preview-summary-pool-table-head"
                  aria-hidden="true"
                >
                  <span>{tt("appText.period")}</span>
                  <span>{tt("appText.samplePoolName")}</span>
                </div>
              ) : null}
              <div className="csv-preview-summary-pool-list">
                {pendingPlanConfigRows.map((poolRow) => {
                  const poolNameInputValue = shouldDeferPoolNameCommit
                    ? (poolNameDrafts[poolRow.previewPlanId]?.value ??
                      poolRow.poolName)
                    : poolRow.poolName;
                  const poolNameFieldLabel = showTimeframeInPoolNameLabel
                    ? `${tt("appText.samplePool")} ${baseTimeframeLabels[poolRow.baseTimeframe]}`
                    : tt("appText.samplePool");
                  const poolNameCharacterCount = String(
                    poolNameInputValue ?? "",
                  ).length;
                  const poolNameCharacterCountText = ttf(
                    "appText.inputCharacterCountValue0Value1",
                    [
                      String(poolNameCharacterCount),
                      String(INPUT_LIMITS.samplePoolNameChars),
                    ],
                  );
                  const poolNameCharacterCountId = `csv-preview-pool-name-count-${poolRow.previewPlanId}`;
                  return (
                    <label
                      key={poolRow.id}
                      className={`csv-preview-summary-pool-row ${showTimeframeInPoolNameLabel ? "" : "is-single"}`}
                    >
                      {showTimeframeInPoolNameLabel ? (
                        <span className="csv-preview-summary-pool-row-head">
                          <span className="csv-preview-plan-chip">
                            {baseTimeframeLabels[poolRow.baseTimeframe]}
                          </span>
                        </span>
                      ) : null}
                      <span className="csv-preview-summary-pool-name-field">
                        <Input
                          className="csv-preview-pool-name-input csv-preview-summary-pool-name-input"
                          aria-describedby={poolNameCharacterCountId}
                          aria-label={`${poolNameFieldLabel} ${poolNameCharacterCountText}`}
                          value={poolNameInputValue}
                          placeholder={poolRow.autoGeneratedPoolName}
                          maxLength={INPUT_LIMITS.samplePoolNameChars}
                          disabled={shouldDisableCsvPoolNameInput(
                            disabled,
                            pendingImport.importEntryMode,
                          )}
                          onBlur={() => {
                            void commitPoolNameDraft(poolRow.previewPlanId);
                          }}
                          onChange={(event) =>
                            updatePoolNameDraft(
                              poolRow.previewPlanId,
                              event.target.value,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") {
                              return;
                            }
                            event.preventDefault();
                            void commitPoolNameDraft(poolRow.previewPlanId);
                            event.currentTarget.blur();
                          }}
                        />
                        <span
                          id={poolNameCharacterCountId}
                          className="csv-preview-summary-pool-name-count"
                          role="status"
                        >
                          {poolNameCharacterCountText}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <dl className="csv-preview-summary-details">
              <div>
                <dt>{tt("appText.period")}</dt>
                <dd>{timeframeSummaryText}</dd>
              </div>
              <div>
                <dt>{tt("appText.timeZone")}</dt>
                <dd>{displayEnvironmentTimeZoneValue}</dd>
              </div>
              <div>
                <dt>{tt("appText.importScope")}</dt>
                <dd>{importScopeSummaryText}</dd>
              </div>
              {acquisitionAdjustmentText ? (
                <div>
                  <dt>
                    {tt("appText.marketDataAcquisitionRecordedAdjustmentLabel")}
                  </dt>
                  <dd>{acquisitionAdjustmentText}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </section>
    </StandardModalFrame>
  );

  if (presentation === "window") {
    return (
      <div className="csv-mapping-modal csv-mapping-window-surface">
        {modalFrame}
      </div>
    );
  }

  return (
    <AppModal
      open={Boolean(pendingImport)}
      onClose={onCancelPendingCsvImport}
      preset="workflow"
      className="csv-mapping-modal"
    >
      <DialogTitle className="sr-only">
        {tt("appText.samplePoolImportConfiguration")}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {importFileValidationSummary}
      </DialogDescription>
      {modalFrame}
    </AppModal>
  );
};
