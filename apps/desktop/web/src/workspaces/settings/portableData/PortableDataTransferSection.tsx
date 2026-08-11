// SPDX-License-Identifier: GPL-3.0-only
import { useCallback, useMemo, useState } from "react";
import {
  api,
  type PortableExportDomain,
  type PortableExportPreview,
  type PortableImportPreview,
  type PortableImportResult,
} from "@/api";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { InlineFeedback } from "@/ui/primitives/inline-feedback";
import { AppModal } from "@/ui/components/AppModal";
import { AppIcon } from "@/assets/graphics";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import {
  getPortableDataTransferCopy,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import { useTimedUiFeedback } from "@/ui/hooks/useTimedUiFeedback";
import { useI18n } from "@/frontend-kernel/i18n";
import { formatStorageBytes } from "@/frontend-kernel/uiOptions";
import { PageSummaryGrid, StandardModalFrame } from "@/ui/components";
import { SettingsPanelCard } from "@/workspaces/settings/settings/SystemSettingsCards";
import {
  buildPortableDomainOptions,
  formatPortableTransferCount,
  getDefaultExportDomains,
  normalizePortableTransferSourceRows,
  type ExportStep,
  type ImportStep,
  type PortableDataTransferSectionProps,
  type PortableTransferSourceRow,
} from "@/workspaces/settings/portableData/portableDataTransferModel";
import { PortableImportDialog } from "@/workspaces/settings/portableData/PortableImportDialog";

export const PortableDataTransferSection = ({
  exportEnabled,
  importEnabled,
  onNavigateToDataForRebind,
}: PortableDataTransferSectionProps) => {
  const { locale, formatDateTime, t } = useI18n();
  const language = locale as AppUiLanguage;
  const copy = useMemo(() => getPortableDataTransferCopy(language), [language]);
  const domainOptions = useMemo(() => buildPortableDomainOptions(copy), [copy]);
  const { feedback, clearFeedback, showFeedback } =
    useTimedUiFeedback<"portable-transfer">();

  const [marketSourceRows, setMarketSourceRows] = useState<
    PortableTransferSourceRow[]
  >([]);
  const [isLoadingMarketSources, setIsLoadingMarketSources] = useState(false);

  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const [exportStep, setExportStep] = useState<ExportStep>("SELECT");
  const [importStep, setImportStep] = useState<ImportStep>("PICK");

  const [exportDomains, setExportDomains] = useState<PortableExportDomain[]>(
    getDefaultExportDomains,
  );
  const [importDomains, setImportDomains] = useState<PortableExportDomain[]>(
    [],
  );

  const [selectedMarketSourceIds, setSelectedMarketSourceIds] = useState<
    string[]
  >([]);
  const [exportPreview, setExportPreview] =
    useState<PortableExportPreview | null>(null);
  const [importPreview, setImportPreview] =
    useState<PortableImportPreview | null>(null);
  const [importResult, setImportResult] = useState<PortableImportResult | null>(
    null,
  );

  const [exportPath, setExportPath] = useState("");
  const [importPath, setImportPath] = useState("");
  const [exportLegalConfirmed, setExportLegalConfirmed] = useState(false);
  const [importLegalConfirmed, setImportLegalConfirmed] = useState(false);
  const [
    importSettingsOverwriteConfirmed,
    setImportSettingsOverwriteConfirmed,
  ] = useState(false);
  const [isExportLegalExpanded, setIsExportLegalExpanded] = useState(false);
  const [isImportLegalExpanded, setIsImportLegalExpanded] = useState(false);

  const [isRunningExportPreview, setIsRunningExportPreview] = useState(false);
  const [isRunningImportInspect, setIsRunningImportInspect] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadMarketSources = useCallback(async () => {
    setIsLoadingMarketSources(true);
    try {
      const rows = await api.listLocalDataSources();
      const normalized = normalizePortableTransferSourceRows(rows);
      setMarketSourceRows(normalized);
      setSelectedMarketSourceIds(normalized.map((row) => row.id));
    } catch (error) {
      console.error("[portable-data-transfer] source list load failed", error);
      showFeedback({
        autoHideMs: 5000,
        message: t("appText.request"),
        scope: "portable-transfer",
        tone: "error",
      });
    } finally {
      setIsLoadingMarketSources(false);
    }
  }, [showFeedback, t]);

  const openExportDialog = useCallback(() => {
    if (!exportEnabled) {
      return;
    }
    clearFeedback();
    setExportDomains(getDefaultExportDomains());
    setMarketSourceRows([]);
    setSelectedMarketSourceIds([]);
    setExportPreview(null);
    setExportPath("");
    setExportLegalConfirmed(false);
    setIsExportLegalExpanded(false);
    setExportStep("SELECT");
    setIsExportDialogOpen(true);
    void loadMarketSources();
  }, [clearFeedback, exportEnabled, loadMarketSources]);

  const openImportDialog = useCallback(() => {
    if (!importEnabled) {
      return;
    }
    clearFeedback();
    setImportPreview(null);
    setImportResult(null);
    setImportDomains([]);
    setImportPath("");
    setImportLegalConfirmed(false);
    setImportSettingsOverwriteConfirmed(false);
    setIsImportLegalExpanded(false);
    setImportStep("PICK");
    setIsImportDialogOpen(true);
  }, [clearFeedback, importEnabled]);

  const toggleExportDomain = useCallback((domain: PortableExportDomain) => {
    setExportDomains((current) =>
      current.includes(domain)
        ? current.filter((item) => item !== domain)
        : [...current, domain],
    );
    if (domain === "MARKET_DATA") {
      setExportLegalConfirmed(false);
    }
  }, []);

  const toggleImportDomain = useCallback((domain: PortableExportDomain) => {
    setImportDomains((current) =>
      current.includes(domain)
        ? current.filter((item) => item !== domain)
        : [...current, domain],
    );
    if (domain === "MARKET_DATA") {
      setImportLegalConfirmed(false);
    }
    if (domain === "SETTINGS") {
      setImportSettingsOverwriteConfirmed(false);
    }
  }, []);

  const toggleMarketSource = useCallback((sourceId: string) => {
    setSelectedMarketSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((item) => item !== sourceId)
        : [...current, sourceId],
    );
  }, []);

  const runExportPreview = useCallback(async () => {
    if (exportDomains.length <= 0) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noDomainsSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    if (
      exportDomains.includes("MARKET_DATA") &&
      selectedMarketSourceIds.length <= 0
    ) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noSourcesSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    setIsRunningExportPreview(true);
    try {
      const preview = await api.previewPortableExport({
        domains: exportDomains,
        marketSourceIds: exportDomains.includes("MARKET_DATA")
          ? selectedMarketSourceIds
          : [],
      });
      setExportPreview(preview);
      setExportStep("PREVIEW");
      clearFeedback();
    } catch (error) {
      console.error("[portable-data-transfer] export preview failed", error);
      showFeedback({
        autoHideMs: 5000,
        message: t("appText.request"),
        scope: "portable-transfer",
        tone: "error",
      });
    } finally {
      setIsRunningExportPreview(false);
    }
  }, [
    clearFeedback,
    copy.noDomainsSelected,
    copy.noSourcesSelected,
    exportDomains,
    selectedMarketSourceIds,
    showFeedback,
    t,
  ]);

  const pickExportPath = useCallback(async () => {
    const picked = await api.pickPortableExportTargetPath();
    if (picked) {
      setExportPath(picked);
    }
  }, []);

  const executeExport = useCallback(async () => {
    if (exportDomains.length <= 0) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noDomainsSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    if (
      exportDomains.includes("MARKET_DATA") &&
      selectedMarketSourceIds.length <= 0
    ) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noSourcesSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    const resolvedPath =
      exportPath || (await api.pickPortableExportTargetPath());
    if (!resolvedPath) {
      return;
    }
    setExportPath(resolvedPath);
    setIsExporting(true);
    try {
      const result = await api.executePortableExport({
        outputPath: resolvedPath,
        domains: exportDomains,
        marketSourceIds: exportDomains.includes("MARKET_DATA")
          ? selectedMarketSourceIds
          : [],
        legalConfirmedForMarketData:
          !exportDomains.includes("MARKET_DATA") || exportLegalConfirmed,
      });
      setExportPath(result.outputPath);
      clearFeedback();
      setExportStep("SUCCESS");
    } catch (error) {
      console.error("[portable-data-transfer] export failed", error);
      showFeedback({
        autoHideMs: 5000,
        message: t("appText.request"),
        scope: "portable-transfer",
        tone: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    clearFeedback,
    copy.noDomainsSelected,
    copy.noSourcesSelected,
    exportDomains,
    exportLegalConfirmed,
    exportPath,
    selectedMarketSourceIds,
    showFeedback,
    t,
  ]);

  const pickImportPackage = useCallback(async () => {
    const picked = await api.pickPortableImportPackagePath();
    if (!picked) {
      return;
    }
    setImportPath(picked);
    setIsRunningImportInspect(true);
    try {
      const preview = await api.inspectPortableImportPackage({
        inputPath: picked,
      });
      setImportPreview(preview);
      setImportDomains(preview.manifest.selectedDomains);
      setImportLegalConfirmed(false);
      setImportSettingsOverwriteConfirmed(false);
      setIsImportLegalExpanded(false);
      setImportStep("OVERVIEW");
      clearFeedback();
    } catch (error) {
      console.error(
        "[portable-data-transfer] package inspection failed",
        error,
      );
      showFeedback({
        autoHideMs: 5000,
        message: t("appText.importPreviewFailed"),
        scope: "portable-transfer",
        tone: "error",
      });
    } finally {
      setIsRunningImportInspect(false);
    }
  }, [clearFeedback, showFeedback, t]);

  const executeImport = useCallback(async () => {
    if (!importPath) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noPackageSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    if (importDomains.length <= 0) {
      showFeedback({
        autoHideMs: 4000,
        message: copy.noDomainsSelected,
        scope: "portable-transfer",
        tone: "info",
      });
      return;
    }
    setIsImporting(true);
    try {
      const result = await api.executePortableImport({
        inputPath: importPath,
        previewGeneration: importPreview?.previewGeneration ?? "",
        domains: importDomains,
        settingsConflictMode: importSettingsOverwriteConfirmed
          ? "REPLACE_TARGET"
          : "KEEP_LOCAL",
        legalConfirmedForMarketData:
          !importDomains.includes("MARKET_DATA") || importLegalConfirmed,
      });
      setImportResult(result);
      setImportStep("RESULT");
      clearFeedback();
    } catch (error) {
      console.error("[portable-data-transfer] import failed", error);
      showFeedback({
        autoHideMs: 5000,
        message: t("common.status.importFailed"),
        scope: "portable-transfer",
        tone: "error",
      });
    } finally {
      setIsImporting(false);
    }
  }, [
    clearFeedback,
    copy.noDomainsSelected,
    copy.noPackageSelected,
    importDomains,
    importLegalConfirmed,
    importPath,
    importPreview?.previewGeneration,
    importSettingsOverwriteConfirmed,
    showFeedback,
    t,
  ]);

  const fullRestoreCount = useMemo(
    () =>
      (exportPreview?.marketSources ?? []).reduce(
        (sum, item) =>
          sum +
          Math.max(
            0,
            item.linkedTrainingProjectCount +
              item.linkedSpecialTrainingQuestionCount,
          ),
        0,
      ),
    [exportPreview?.marketSources],
  );

  const rebindCount =
    importResult?.marketImport.pendingRebindSourceIds.length ?? 0;
  const selectedExportMarketSourceCount = selectedMarketSourceIds.length;
  const exportSelectedCount = exportDomains.length;
  const importSelectedCount = importDomains.length;
  const isExportMarketDataSelected = exportDomains.includes("MARKET_DATA");
  const hasNoSelectedExportMarketSources =
    isExportMarketDataSelected && selectedExportMarketSourceCount <= 0;
  const canContinueExportSelection =
    !isRunningExportPreview &&
    !isLoadingMarketSources &&
    exportDomains.length > 0 &&
    !hasNoSelectedExportMarketSources;
  const isImportMarketDataSelected = importDomains.includes("MARKET_DATA");
  const isImportSettingsSelected = importDomains.includes("SETTINGS");
  const displayedImportMarketSources = isImportMarketDataSelected
    ? (importPreview?.marketSources ?? [])
    : [];

  return (
    <>
      <div className="portable-transfer-section">
        <div className="portable-transfer-action-grid">
          <Button
            type="button"
            variant="outline"
            className="portable-transfer-card"
            disabled={!exportEnabled}
            onClick={openExportDialog}
          >
            <span className="portable-transfer-card-icon" aria-hidden="true">
              <AppIcon name="actionArrowUp" className="size-5" />
            </span>
            <strong>{copy.exportCardTitle}</strong>
            <span>{copy.exportCardBody}</span>
            <em>{copy.exportCardPrep}</em>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="portable-transfer-card is-primary"
            disabled={!importEnabled}
            onClick={openImportDialog}
          >
            <span className="portable-transfer-card-icon" aria-hidden="true">
              <AppIcon name="actionArrowDown" className="size-5" />
            </span>
            <strong>{copy.importCardTitle}</strong>
            <span>{copy.importCardBody}</span>
            <em>{copy.importCardPrep}</em>
          </Button>
        </div>
      </div>

      <AppModal
        open={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        preset="workflow"
        className="portable-transfer-modal-surface"
        showCloseButton={false}
        accessibilityTitle={copy.exportDialogTitle}
        accessibilityDescription={copy.offlineValidationHint}
      >
        <StandardModalFrame
          variant="workflow"
          className="data-config-transfer-dialog"
          bodyClassName="data-config-transfer-dialog-body"
          footerClassName="csv-preview-modal-actions"
          title={copy.exportDialogTitle}
          description={copy.offlineValidationHint}
          actions={
            <>
              {exportStep === "SELECT" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsExportDialogOpen(false)}
                  >
                    {copy.finishAction}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void runExportPreview();
                    }}
                    disabled={!canContinueExportSelection}
                  >
                    {copy.nextAction}
                  </Button>
                </>
              ) : null}
              {exportStep === "PREVIEW" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setExportStep("SELECT")}
                  >
                    {copy.backAction}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setExportStep("CONFIRM")}
                    disabled={exportDomains.length <= 0}
                  >
                    {copy.nextAction}
                  </Button>
                </>
              ) : null}
              {exportStep === "CONFIRM" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setExportStep("PREVIEW")}
                    disabled={isExporting}
                  >
                    {copy.backAction}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void executeExport();
                    }}
                    disabled={
                      isExporting ||
                      exportDomains.length <= 0 ||
                      (isExportMarketDataSelected && !exportLegalConfirmed)
                    }
                  >
                    {copy.exportNowAction}
                  </Button>
                </>
              ) : null}
              {exportStep === "SUCCESS" ? (
                <Button
                  type="button"
                  onClick={() => setIsExportDialogOpen(false)}
                >
                  {copy.finishAction}
                </Button>
              ) : null}
            </>
          }
        >
          <InlineFeedback feedback={feedback} onDismiss={clearFeedback} />
          <div className="portable-transfer-stage-row">
            <span
              className={`portable-transfer-stage ${exportStep === "SELECT" ? "is-active" : ""}`}
            >
              {copy.exportSelectStepTitle}
            </span>
            <span
              className={`portable-transfer-stage ${exportStep === "PREVIEW" ? "is-active" : ""}`}
            >
              {copy.exportPreviewStepTitle}
            </span>
            <span
              className={`portable-transfer-stage ${exportStep === "CONFIRM" ? "is-active" : ""}`}
            >
              {copy.exportConfirmStepTitle}
            </span>
            <span
              className={`portable-transfer-stage ${exportStep === "SUCCESS" ? "is-active" : ""}`}
            >
              {copy.exportSuccessStepTitle}
            </span>
          </div>
          <div className="data-config-transfer-dialog-grid">
            {exportStep === "SELECT" ? (
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
                      exportSelectedCount,
                    )}
                    description={copy.migrateSummaryLine}
                  />
                  <SettingsPanelCard
                    soft
                    title={copy.selectedMarketSourcesTitle}
                    value={formatPortableTransferCount(
                      language,
                      selectedExportMarketSourceCount,
                    )}
                    description={copy.marketContextHint}
                  />
                </PageSummaryGrid>
                <div className="data-config-transfer-field">
                  <div
                    className="data-config-transfer-checklist"
                    role="group"
                    aria-label={copy.selectedDomainsTitle}
                  >
                    {domainOptions.map((option) => (
                      <label
                        key={`portable-export-domain-${option.domain}`}
                        className="data-config-transfer-check"
                      >
                        <Checkbox
                          checked={exportDomains.includes(option.domain)}
                          onChange={() => toggleExportDomain(option.domain)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {isExportMarketDataSelected ? (
                  <div className="data-config-transfer-field">
                    <div
                      className="data-config-transfer-checklist"
                      role="group"
                      aria-label={copy.selectedMarketSourcesTitle}
                    >
                      {isLoadingMarketSources ? (
                        <span className="portable-transfer-muted">
                          {copy.previewAction}
                        </span>
                      ) : (
                        marketSourceRows.map((source) => (
                          <label
                            key={`portable-export-source-${source.id}`}
                            className="data-config-transfer-check"
                          >
                            <Checkbox
                              checked={selectedMarketSourceIds.includes(
                                source.id,
                              )}
                              onChange={() => toggleMarketSource(source.id)}
                            />
                            <span>
                              {formatDotJoinedText(language, [
                                source.name,
                                source.baseTimeframe,
                                `${formatPortableTransferCount(language, source.symbolCount)} ${copy.symbolsUnitLabel}`,
                                `${formatPortableTransferCount(language, source.barCount)} ${copy.importedBarsLabel}`,
                              ])}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
                {exportDomains.length <= 0 ? (
                  <div className="portable-transfer-inline-note">
                    {copy.noDomainsSelected}
                  </div>
                ) : null}
                {hasNoSelectedExportMarketSources && !isLoadingMarketSources ? (
                  <div className="portable-transfer-inline-note">
                    {copy.noSourcesSelected}
                  </div>
                ) : null}
              </>
            ) : null}

            {exportStep === "PREVIEW" && exportPreview ? (
              <>
                <PageSummaryGrid
                  columns={3}
                  className="portable-transfer-dialog-summary-grid"
                >
                  <SettingsPanelCard
                    soft
                    title={copy.selectedDomainsTitle}
                    value={formatPortableTransferCount(
                      language,
                      exportPreview.totalItems,
                    )}
                    description={copy.exportPreviewStepTitle}
                  />
                  <SettingsPanelCard
                    soft
                    title={copy.outputPathLabel}
                    value={formatStorageBytes(exportPreview.estimatedBytes)}
                    description={copy.trustEncrypted}
                  />
                  <SettingsPanelCard
                    soft
                    title={copy.restoreCountsLabel}
                    value={formatPortableTransferCount(
                      language,
                      fullRestoreCount,
                    )}
                    description={copy.marketContextHint}
                  />
                </PageSummaryGrid>
                <div
                  className="data-config-transfer-preview"
                  role="group"
                  aria-label={copy.selectedDomainsTitle}
                >
                  <div className="data-config-transfer-preview-list">
                    {exportPreview.domains.map((item) => (
                      <div
                        key={`portable-export-preview-${item.domain}`}
                        className="data-config-transfer-preview-item"
                      >
                        <strong>
                          {domainOptions.find(
                            (option) => option.domain === item.domain,
                          )?.label || item.domain}
                        </strong>
                        <span>
                          {formatDotJoinedText(language, [
                            formatPortableTransferCount(
                              language,
                              item.itemCount,
                            ),
                            formatStorageBytes(item.estimatedBytes),
                          ])}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {exportPreview.marketSources.length > 0 ? (
                  <div className="data-config-transfer-preview">
                    <span className="data-config-transfer-preview-title">
                      {copy.selectedMarketSourcesTitle}
                    </span>
                    <div className="data-config-transfer-preview-list">
                      {exportPreview.marketSources.map((item) => (
                        <div
                          key={`portable-export-market-preview-${item.sourceId}`}
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
                <div className="portable-transfer-inline-note">
                  {`${copy.restoreCountsLabel} ${formatPortableTransferCount(
                    language,
                    fullRestoreCount,
                  )}`}
                </div>
              </>
            ) : null}

            {exportStep === "CONFIRM" ? (
              <>
                <PageSummaryGrid
                  columns={2}
                  className="portable-transfer-dialog-summary-grid"
                >
                  <SettingsPanelCard
                    soft
                    title={copy.outputPathLabel}
                    value={exportPath || "--"}
                    description={copy.trustEncrypted}
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void pickExportPath();
                        }}
                      >
                        {copy.pickExportPath}
                      </Button>
                    }
                    className="portable-transfer-path-card"
                  />
                  <SettingsPanelCard
                    soft
                    title={copy.nonDestructiveHint}
                    description={copy.offlineValidationHint}
                    iconName="shield"
                  />
                </PageSummaryGrid>
                {isExportMarketDataSelected ? (
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
                          setIsExportLegalExpanded((current) => !current)
                        }
                      >
                        {isExportLegalExpanded
                          ? copy.backAction
                          : copy.previewAction}
                      </Button>
                    </div>
                    {isExportLegalExpanded ? (
                      <p className="data-config-transfer-legal-body">
                        {copy.legalNotice}
                      </p>
                    ) : null}
                    <label className="data-config-transfer-check">
                      <Checkbox
                        checked={exportLegalConfirmed}
                        onChange={(event) =>
                          setExportLegalConfirmed(event.currentTarget.checked)
                        }
                      />
                      <span>{copy.legalConfirmLabel}</span>
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}

            {exportStep === "SUCCESS" ? (
              <SettingsPanelCard
                className="portable-transfer-result"
                title={copy.exportSuccess}
                value={exportPath}
                description={copy.stepImport}
                iconName="check"
              />
            ) : null}
          </div>
        </StandardModalFrame>
      </AppModal>

      <PortableImportDialog
        clearFeedback={clearFeedback}
        copy={copy}
        displayedImportMarketSources={displayedImportMarketSources}
        domainOptions={domainOptions}
        executeImport={executeImport}
        feedback={feedback}
        formatDateTime={formatDateTime}
        importDomains={importDomains}
        importLegalConfirmed={importLegalConfirmed}
        importPath={importPath}
        importPreview={importPreview}
        importResult={importResult}
        importSelectedCount={importSelectedCount}
        importSettingsOverwriteConfirmed={importSettingsOverwriteConfirmed}
        importStep={importStep}
        isImportLegalExpanded={isImportLegalExpanded}
        isImportDialogOpen={isImportDialogOpen}
        isImportMarketDataSelected={isImportMarketDataSelected}
        isImportSettingsSelected={isImportSettingsSelected}
        isImporting={isImporting}
        isRunningImportInspect={isRunningImportInspect}
        language={language}
        onNavigateToDataForRebind={onNavigateToDataForRebind}
        pickImportPackage={pickImportPackage}
        rebindCount={rebindCount}
        setImportLegalConfirmed={setImportLegalConfirmed}
        setImportSettingsOverwriteConfirmed={
          setImportSettingsOverwriteConfirmed
        }
        setImportStep={setImportStep}
        setIsImportDialogOpen={setIsImportDialogOpen}
        setIsImportLegalExpanded={setIsImportLegalExpanded}
        toggleImportDomain={toggleImportDomain}
      />
    </>
  );
};
