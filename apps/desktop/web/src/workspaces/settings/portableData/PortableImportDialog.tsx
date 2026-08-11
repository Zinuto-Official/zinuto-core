// SPDX-License-Identifier: GPL-3.0-only

import type { Dispatch, SetStateAction } from "react";
import type {
  PortableExportDomain,
  PortableImportPreview,
  PortableImportResult,
} from "@/api";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { InlineFeedback } from "@/ui/primitives/inline-feedback";
import { AppModal } from "@/ui/components/AppModal";
import { PageSummaryGrid, StandardModalFrame } from "@/ui/components";
import { SettingsPanelCard } from "@/workspaces/settings/settings/SystemSettingsCards";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import { formatStorageBytes } from "@/frontend-kernel/uiOptions";
import type { useI18n } from "@/frontend-kernel/i18n";
import type {
  AppUiLanguage,
  getPortableDataTransferCopy,
} from "@/ui/config/uiConfig";
import type { UiFeedback } from "@/ui/hooks/useTimedUiFeedback";
import {
  formatPortableTransferCount,
  type ImportStep,
  type PortableDomainOption,
} from "@/workspaces/settings/portableData/portableDataTransferModel";

export const PortableImportDialog = ({
  clearFeedback,
  copy,
  displayedImportMarketSources,
  domainOptions,
  executeImport,
  feedback,
  formatDateTime,
  importDomains,
  importLegalConfirmed,
  importPath,
  importPreview,
  importResult,
  importSelectedCount,
  importSettingsOverwriteConfirmed,
  importStep,
  isImportLegalExpanded,
  isImportDialogOpen,
  isImportMarketDataSelected,
  isImportSettingsSelected,
  isImporting,
  isRunningImportInspect,
  language,
  onNavigateToDataForRebind,
  pickImportPackage,
  rebindCount,
  setImportLegalConfirmed,
  setImportSettingsOverwriteConfirmed,
  setImportStep,
  setIsImportDialogOpen,
  setIsImportLegalExpanded,
  toggleImportDomain,
}: {
  clearFeedback: () => void;
  copy: ReturnType<typeof getPortableDataTransferCopy>;
  displayedImportMarketSources: PortableImportPreview["marketSources"];
  domainOptions: PortableDomainOption[];
  executeImport: () => Promise<void>;
  feedback: UiFeedback<"portable-transfer"> | null;
  formatDateTime: ReturnType<typeof useI18n>["formatDateTime"];
  importDomains: PortableExportDomain[];
  importLegalConfirmed: boolean;
  importPath: string;
  importPreview: PortableImportPreview | null;
  importResult: PortableImportResult | null;
  importSelectedCount: number;
  importSettingsOverwriteConfirmed: boolean;
  importStep: ImportStep;
  isImportLegalExpanded: boolean;
  isImportDialogOpen: boolean;
  isImportMarketDataSelected: boolean;
  isImportSettingsSelected: boolean;
  isImporting: boolean;
  isRunningImportInspect: boolean;
  language: AppUiLanguage;
  onNavigateToDataForRebind?: (sourceIds: string[]) => void;
  pickImportPackage: () => Promise<void>;
  rebindCount: number;
  setImportLegalConfirmed: Dispatch<SetStateAction<boolean>>;
  setImportSettingsOverwriteConfirmed: Dispatch<SetStateAction<boolean>>;
  setImportStep: Dispatch<SetStateAction<ImportStep>>;
  setIsImportDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportLegalExpanded: Dispatch<SetStateAction<boolean>>;
  toggleImportDomain: (domain: PortableExportDomain) => void;
}) => (
  <AppModal
    open={isImportDialogOpen}
    onClose={() => setIsImportDialogOpen(false)}
    preset="workflow"
    className="portable-transfer-modal-surface"
    showCloseButton={false}
    accessibilityTitle={copy.importDialogTitle}
    accessibilityDescription={copy.offlineValidationHint}
  >
    <StandardModalFrame
      variant="workflow"
      className="data-config-transfer-dialog"
      bodyClassName="data-config-transfer-dialog-body"
      footerClassName="csv-preview-modal-actions"
      title={copy.importDialogTitle}
      description={copy.offlineValidationHint}
      actions={
        <>
          {importStep === "PICK" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsImportDialogOpen(false)}
            >
              {copy.finishAction}
            </Button>
          ) : null}
          {importStep === "OVERVIEW" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImportStep("PICK")}
              >
                {copy.backAction}
              </Button>
              <Button type="button" onClick={() => setImportStep("SELECT")}>
                {copy.nextAction}
              </Button>
            </>
          ) : null}
          {importStep === "SELECT" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImportStep("OVERVIEW")}
                disabled={isImporting}
              >
                {copy.backAction}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void executeImport();
                }}
                disabled={
                  isImporting ||
                  importDomains.length <= 0 ||
                  (importDomains.includes("MARKET_DATA") &&
                    !importLegalConfirmed)
                }
              >
                {copy.importNowAction}
              </Button>
            </>
          ) : null}
          {importStep === "RESULT" && importResult ? (
            <>
              {rebindCount > 0 ? (
                <Button
                  type="button"
                  onClick={() => {
                    onNavigateToDataForRebind?.(
                      importResult.marketImport.pendingRebindSourceIds,
                    );
                    setIsImportDialogOpen(false);
                  }}
                >
                  {copy.goToDataAction}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={rebindCount > 0 ? "outline" : "default"}
                onClick={() => setIsImportDialogOpen(false)}
              >
                {copy.finishAction}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <InlineFeedback feedback={feedback} onDismiss={clearFeedback} />
      <div className="portable-transfer-stage-row">
        <span
          className={`portable-transfer-stage ${importStep === "PICK" ? "is-active" : ""}`}
        >
          {copy.importPickStepTitle}
        </span>
        <span
          className={`portable-transfer-stage ${importStep === "OVERVIEW" ? "is-active" : ""}`}
        >
          {copy.importOverviewStepTitle}
        </span>
        <span
          className={`portable-transfer-stage ${importStep === "SELECT" ? "is-active" : ""}`}
        >
          {copy.importSelectStepTitle}
        </span>
        <span
          className={`portable-transfer-stage ${importStep === "RESULT" ? "is-active" : ""}`}
        >
          {copy.importResultStepTitle}
        </span>
      </div>
      <div className="data-config-transfer-dialog-grid">
        {importStep === "PICK" ? (
          <SettingsPanelCard
            className="portable-transfer-result"
            title={copy.importCardTitle}
            description={copy.pickPackageHint}
            iconName="shield"
            action={
              <Button
                type="button"
                onClick={() => {
                  void pickImportPackage();
                }}
                disabled={isRunningImportInspect}
              >
                {copy.pickImportFile}
              </Button>
            }
          />
        ) : null}

        {importStep === "OVERVIEW" && importPreview ? (
          <>
            <PageSummaryGrid
              columns={3}
              className="portable-transfer-dialog-summary-grid"
            >
              <SettingsPanelCard
                soft
                title={copy.inputPathLabel}
                value={importPath}
                description={formatDotJoinedText(language, [
                  formatDateTime(importPreview.manifest.exportedAt),
                  copy.trustOffline,
                ])}
                className="portable-transfer-path-card"
              />
              <SettingsPanelCard
                soft
                title={copy.selectedDomainsTitle}
                value={formatPortableTransferCount(
                  language,
                  importPreview.totalItems,
                )}
                description={formatStorageBytes(importPreview.payloadBytes)}
              />
              <SettingsPanelCard
                soft
                title={copy.restoreCountsLabel}
                value={formatPortableTransferCount(
                  language,
                  importPreview.fullRestoreCounts.trainingProjects +
                    importPreview.fullRestoreCounts.specialTrainingQuestions,
                )}
                description={copy.marketContextHint}
              />
            </PageSummaryGrid>
            <div
              className="data-config-transfer-field"
              role="group"
              aria-label={copy.inputPathLabel}
            >
              <strong>{importPath}</strong>
            </div>
            <div
              className="data-config-transfer-preview"
              role="group"
              aria-label={copy.selectedDomainsTitle}
            >
              <div className="data-config-transfer-preview-list">
                {importPreview.domains.map((item) => (
                  <div
                    key={`portable-import-overview-${item.domain}`}
                    className="data-config-transfer-preview-item"
                  >
                    <strong>
                      {domainOptions.find(
                        (option) => option.domain === item.domain,
                      )?.label || item.domain}
                    </strong>
                    <span>
                      {formatDotJoinedText(language, [
                        formatPortableTransferCount(language, item.itemCount),
                        `${formatPortableTransferCount(language, item.conflictCount)} ${copy.conflictsLabel}`,
                      ])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="portable-transfer-inline-note">
              {formatDotJoinedText(language, [
                formatDateTime(importPreview.manifest.exportedAt),
                formatStorageBytes(importPreview.payloadBytes),
                copy.trustOffline,
              ])}
            </div>
          </>
        ) : null}

        {importStep === "SELECT" && importPreview ? (
          <>
            <PageSummaryGrid
              columns={2}
              className="portable-transfer-dialog-summary-grid"
            >
              <SettingsPanelCard
                soft
                title={copy.selectedDomainsTitle}
                value={formatPortableTransferCount(
                  language,
                  importSelectedCount,
                )}
                description={copy.nonDestructiveHint}
              />
              {isImportMarketDataSelected ? (
                <SettingsPanelCard
                  soft
                  title={copy.selectedMarketSourcesTitle}
                  value={formatPortableTransferCount(
                    language,
                    displayedImportMarketSources.length,
                  )}
                  description={copy.marketContextHint}
                />
              ) : null}
            </PageSummaryGrid>
            <div className="data-config-transfer-field">
              <div
                className="data-config-transfer-checklist"
                role="group"
                aria-label={copy.selectedDomainsTitle}
              >
                {domainOptions
                  .filter((option) =>
                    importPreview.manifest.selectedDomains.includes(
                      option.domain,
                    ),
                  )
                  .map((option) => (
                    <label
                      key={`portable-import-domain-${option.domain}`}
                      className="data-config-transfer-check"
                    >
                      <Checkbox
                        checked={importDomains.includes(option.domain)}
                        onChange={() => toggleImportDomain(option.domain)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="portable-transfer-inline-note">
              {copy.nonDestructiveHint}
            </div>
            {importDomains.length <= 0 ? (
              <div className="portable-transfer-inline-note">
                {copy.noDomainsSelected}
              </div>
            ) : null}
            {isImportSettingsSelected ? (
              <div className="data-config-transfer-legal">
                <div className="data-config-transfer-legal-head">
                  <span className="data-config-transfer-legal-title">
                    {copy.settingsOverwriteTitle}
                  </span>
                </div>
                <p className="data-config-transfer-legal-body">
                  {copy.settingsOverwriteNotice}
                </p>
                <label className="data-config-transfer-check">
                  <Checkbox
                    checked={importSettingsOverwriteConfirmed}
                    onChange={(event) =>
                      setImportSettingsOverwriteConfirmed(
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <span>{copy.settingsOverwriteConfirmLabel}</span>
                </label>
              </div>
            ) : null}
            {isImportMarketDataSelected &&
            displayedImportMarketSources.length > 0 ? (
              <div
                className="data-config-transfer-preview"
                role="group"
                aria-label={copy.selectedMarketSourcesTitle}
              >
                <div className="data-config-transfer-preview-list">
                  {displayedImportMarketSources.map((item) => (
                    <div
                      key={`portable-import-source-${item.sourceId}`}
                      className="data-config-transfer-preview-item"
                    >
                      <strong>{item.sourceName}</strong>
                      <span>
                        {formatDotJoinedText(language, [
                          `${formatPortableTransferCount(language, item.symbolCount)} ${copy.symbolsUnitLabel}`,
                          `${formatPortableTransferCount(language, item.barCount)} ${copy.importedBarsLabel}`,
                          `${copy.restoreCountsLabel} ${formatPortableTransferCount(
                            language,
                            item.linkedTrainingProjectCount +
                              item.linkedSpecialTrainingQuestionCount,
                          )}`,
                        ])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {isImportMarketDataSelected ? (
              <div className="data-config-transfer-legal">
                <div className="data-config-transfer-legal-head">
                  <span className="data-config-transfer-legal-title">
                    {copy.legalTitle}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setIsImportLegalExpanded((current) => !current)
                    }
                  >
                    {isImportLegalExpanded
                      ? copy.backAction
                      : copy.previewAction}
                  </Button>
                </div>
                {isImportLegalExpanded ? (
                  <p className="data-config-transfer-legal-body">
                    {copy.legalNotice}
                  </p>
                ) : null}
                <label className="data-config-transfer-check">
                  <Checkbox
                    checked={importLegalConfirmed}
                    onChange={(event) =>
                      setImportLegalConfirmed(event.currentTarget.checked)
                    }
                  />
                  <span>{copy.legalConfirmLabel}</span>
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {importStep === "RESULT" && importResult ? (
          <>
            <SettingsPanelCard
              className="portable-transfer-result"
              title={copy.importSuccess}
              description={copy.nonDestructiveHint}
              iconName="check"
            >
              <div className="portable-transfer-result-stats">
                <span>
                  {`${copy.importedSourceLabel} ${formatPortableTransferCount(
                    language,
                    importResult.marketImport.importedSources,
                  )}`}
                </span>
                <span>
                  {`${copy.reusedSourceLabel} ${formatPortableTransferCount(
                    language,
                    importResult.marketImport.reusedSources,
                  )}`}
                </span>
                <span>
                  {`${copy.importedBarsLabel} ${formatPortableTransferCount(
                    language,
                    importResult.marketImport.importedBars,
                  )}`}
                </span>
                <span>
                  {`${copy.remapLabel} ${formatPortableTransferCount(
                    language,
                    importResult.remappedIds.notes +
                      importResult.remappedIds.trainingProjects +
                      importResult.remappedIds.specialTrainingSessions +
                      importResult.remappedIds.specialTrainingQuestions,
                  )}`}
                </span>
                <span>
                  {`${copy.pendingRebindLabel} ${formatPortableTransferCount(
                    language,
                    rebindCount,
                  )}`}
                </span>
              </div>
            </SettingsPanelCard>
            {rebindCount > 0 ? (
              <SettingsPanelCard
                soft
                className="portable-transfer-result-cta"
                title={copy.rebindBannerTitle}
                description={copy.rebindBannerBody}
                iconName="flag"
              />
            ) : null}
          </>
        ) : null}
      </div>
    </StandardModalFrame>
  </AppModal>
);
