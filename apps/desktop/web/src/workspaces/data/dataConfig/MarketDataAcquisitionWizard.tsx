// SPDX-License-Identifier: GPL-3.0-only

import { useState, type RefObject } from "react";
import type {
  MarketDataAcquisitionConnector,
  MarketDataAcquisitionConnectorId,
  MarketDataAcquisitionTimeframe,
} from "@/api";
import { VendorIcon, type VendorIconName } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import { DatePicker } from "@/ui/primitives/date-picker";
import { RadioGroup, RadioItem } from "@/ui/primitives/radio-group";
import { SelectField } from "@/ui/primitives/select-field";
import { AkshareInstrumentPicker } from "@/workspaces/data/dataConfig/AkshareInstrumentPicker";
import { CcxtMarketPicker } from "@/workspaces/data/dataConfig/CcxtMarketPicker";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;
export type AcquisitionWizardStep = 1 | 2 | 3;

type AcquisitionWizardFieldErrors = {
  endDate?: string;
  folder?: string;
  projects?: string;
  source?: string;
  startDate?: string;
  symbols?: string;
  timeframe?: string;
};

type AcquisitionFolderGrant = {
  displayPath: string;
  grantId: string;
};

type MarketDataAcquisitionWizardProps = {
  adjustment: "none" | "qfq" | "hfq";
  akshareInstrumentKind: "A_SHARE" | "INDEX";
  akshareSymbols: string[];
  ccxtSymbols: string[];
  connectors: MarketDataAcquisitionConnector[];
  connectorsLoading: boolean;
  endDate: string;
  exchangeId: "binance" | "okx";
  fieldErrors: AcquisitionWizardFieldErrors;
  folderGrant: AcquisitionFolderGrant | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  locale: string;
  providerId: MarketDataAcquisitionConnectorId;
  resultSourceLabel: string;
  selectedConnector: MarketDataAcquisitionConnector | null;
  selectedSymbols: string[];
  startDate: string;
  timeframe: MarketDataAcquisitionTimeframe;
  timeframeOptions: Array<{ label: string; value: string }>;
  tt: Translate;
  ttf: TranslateFormatted;
  wizardStep: AcquisitionWizardStep;
  onAdjustmentChange: (value: "none" | "qfq" | "hfq") => void;
  onAkshareKindChange: (kind: "A_SHARE" | "INDEX") => void;
  onAkshareSymbolsChange: (values: string[]) => void;
  onCcxtSymbolsChange: (values: string[]) => void;
  onChooseFolder: () => void;
  onExchangeChange: (value: "binance" | "okx") => void;
  onOpenProject: (url: string) => void;
  onProviderChange: (provider: MarketDataAcquisitionConnectorId) => void;
  onRetryConnectors: () => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onTimeframeChange: (value: MarketDataAcquisitionTimeframe) => void;
};

const AcquisitionFieldError = ({
  id,
  message,
}: {
  id: string;
  message?: string;
}) =>
  message ? (
    <small id={id} className="market-data-acquisition-field-error" role="alert">
      {message}
    </small>
  ) : null;

const TASK_OPTIONS: ReadonlyArray<{
  description: string;
  icon: VendorIconName;
  id: MarketDataAcquisitionConnectorId;
  title: string;
}> = [
  {
    id: "akshare",
    icon: "chartCandlestick",
    title: "appText.marketDataAcquisitionTaskAShareTitle",
    description: "appText.marketDataAcquisitionTaskAShareDescription",
  },
  {
    id: "ccxt",
    icon: "globe2",
    title: "appText.marketDataAcquisitionTaskCryptoTitle",
    description: "appText.marketDataAcquisitionTaskCryptoDescription",
  },
];

const ConnectorDisclosure = ({
  connector,
  errorMessage,
  onOpenProject,
  tt,
  ttf,
}: {
  connector: MarketDataAcquisitionConnector;
  errorMessage?: string;
  onOpenProject: (url: string) => void;
  tt: Translate;
  ttf: TranslateFormatted;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="market-data-acquisition-disclosure">
      <Button
        type="button"
        variant="ghost"
        className="market-data-acquisition-disclosure-trigger"
        aria-expanded={open}
        aria-controls="market-data-acquisition-technical-details"
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((current) => !current)}
      >
        <VendorIcon name="circleHelp" aria-hidden="true" />
        <span>{tt("appText.marketDataAcquisitionTechnicalDisclosure")}</span>
        <VendorIcon name="chevronDown" aria-hidden="true" />
      </Button>
      {open ? (
        <div id="market-data-acquisition-technical-details">
          <p>
            {ttf("appText.marketDataAcquisitionConnectorVersionValue0", [
              connector.version,
            ])}
          </p>
          <div>
            {connector.terms.projects.map((project) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                key={project.id}
                onClick={() => onOpenProject(project.url)}
              >
                <strong>{project.name}</strong>
                <small>
                  {ttf(
                    "appText.marketDataAcquisitionProjectVersionLicenseValue0Value1",
                    [project.version, project.license],
                  )}
                </small>
              </Button>
            ))}
          </div>
          <AcquisitionFieldError
            id="market-data-acquisition-projects-error"
            message={errorMessage}
          />
        </div>
      ) : null}
    </div>
  );
};

export const MarketDataAcquisitionWizard = ({
  adjustment,
  akshareInstrumentKind,
  akshareSymbols,
  ccxtSymbols,
  connectors,
  connectorsLoading,
  endDate,
  exchangeId,
  fieldErrors,
  folderGrant,
  headingRef,
  locale,
  providerId,
  resultSourceLabel,
  selectedConnector,
  selectedSymbols,
  startDate,
  timeframe,
  timeframeOptions,
  tt,
  ttf,
  wizardStep,
  onAdjustmentChange,
  onAkshareKindChange,
  onAkshareSymbolsChange,
  onCcxtSymbolsChange,
  onChooseFolder,
  onEndDateChange,
  onExchangeChange,
  onOpenProject,
  onProviderChange,
  onRetryConnectors,
  onStartDateChange,
  onTimeframeChange,
}: MarketDataAcquisitionWizardProps) => (
  <>
    <nav
      className="market-data-acquisition-stepper"
      aria-label={tt("appText.marketDataAcquisitionProgressLabel")}
    >
      <ol>
        {(
          [
            [1, "appText.marketDataAcquisitionStepMarket"],
            [2, "appText.marketDataAcquisitionStepInstruments"],
            [3, "appText.marketDataAcquisitionStepSettings"],
          ] as const
        ).map(([step, labelKey]) => (
          <li
            key={step}
            data-state={
              wizardStep === step
                ? "current"
                : wizardStep > step
                  ? "complete"
                  : "pending"
            }
            aria-current={wizardStep === step ? "step" : undefined}
          >
            <span>
              {wizardStep > step ? (
                <VendorIcon name="check" aria-hidden="true" />
              ) : (
                step
              )}
            </span>
            <strong>{tt(labelKey)}</strong>
          </li>
        ))}
      </ol>
    </nav>

    <section
      className="market-data-acquisition-step-panel"
      aria-labelledby="market-data-acquisition-step-title"
    >
      <header className="market-data-acquisition-step-head">
        <small>
          {ttf("appText.marketDataAcquisitionStepValue0Value1", [
            wizardStep,
            3,
          ])}
        </small>
        <h2
          id="market-data-acquisition-step-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {tt(
            wizardStep === 1
              ? "appText.marketDataAcquisitionStepMarketTitle"
              : wizardStep === 2
                ? "appText.marketDataAcquisitionStepInstrumentsTitle"
                : "appText.marketDataAcquisitionStepSettingsTitle",
          )}
        </h2>
        <p>
          {tt(
            wizardStep === 1
              ? "appText.marketDataAcquisitionStepMarketDescription"
              : wizardStep === 2
                ? "appText.marketDataAcquisitionStepInstrumentsDescription"
                : "appText.marketDataAcquisitionStepSettingsDescription",
          )}
        </p>
      </header>

      {wizardStep === 1 ? (
        <div className="market-data-acquisition-task-step">
          <RadioGroup
            className="market-data-acquisition-task-options"
            name="market-data-acquisition-task"
            value={providerId}
            aria-label={tt("appText.marketDataAcquisitionStepMarketTitle")}
            onValueChange={(value) =>
              onProviderChange(value as MarketDataAcquisitionConnectorId)
            }
          >
            {TASK_OPTIONS.map((option) => {
              const connector =
                connectors.find((item) => item.id === option.id) ?? null;
              const unavailable = !connectorsLoading && !connector?.available;
              return (
                <RadioItem
                  key={option.id}
                  className="market-data-acquisition-task-option"
                  value={option.id}
                  disabled={unavailable}
                  label={
                    <>
                      <span
                        className="market-data-acquisition-task-icon"
                        aria-hidden="true"
                      >
                        <VendorIcon name={option.icon} />
                      </span>
                      <span className="market-data-acquisition-task-copy">
                        <strong>{tt(option.title)}</strong>
                        <span>{tt(option.description)}</span>
                        <small>
                          {tt(
                            connectorsLoading
                              ? "appText.marketDataAcquisitionStatusChecking"
                              : connector?.available
                                ? "appText.marketDataAcquisitionStatusAvailable"
                                : "appText.marketDataAcquisitionStatusUnavailable",
                          )}
                        </small>
                      </span>
                    </>
                  }
                />
              );
            })}
          </RadioGroup>
          <AcquisitionFieldError
            id="market-data-acquisition-source-error"
            message={fieldErrors.source}
          />
          {fieldErrors.source ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetryConnectors}
            >
              {tt("appText.marketDataAcquisitionRetryConnectorCheck")}
            </Button>
          ) : null}

          {selectedConnector ? (
            <ConnectorDisclosure
              connector={selectedConnector}
              errorMessage={fieldErrors.projects}
              onOpenProject={onOpenProject}
              tt={tt}
              ttf={ttf}
            />
          ) : null}
          <div className="market-data-acquisition-source-boundary">
            <VendorIcon name="circleAlert" aria-hidden="true" />
            <span>
              {tt("appText.marketDataAcquisitionSourceBoundaryNotice")}
            </span>
          </div>
        </div>
      ) : wizardStep === 2 ? (
        <div className="market-data-acquisition-field market-data-acquisition-symbol-step">
          {providerId === "ccxt" ? (
            <>
              <label className="market-data-acquisition-field">
                <span>{tt("appText.marketDataAcquisitionExchangeLabel")}</span>
                <SelectField
                  value={exchangeId}
                  options={[
                    {
                      value: "binance",
                      label: tt("appText.marketDataAcquisitionExchangeBinance"),
                    },
                    {
                      value: "okx",
                      label: tt("appText.marketDataAcquisitionExchangeOkx"),
                    },
                  ]}
                  onValueChange={(value) =>
                    onExchangeChange(value as "binance" | "okx")
                  }
                />
              </label>
              <CcxtMarketPicker
                key={exchangeId}
                describedBy="market-data-acquisition-symbols-error"
                disabled={false}
                exchangeId={exchangeId}
                invalid={Boolean(fieldErrors.symbols)}
                locale={locale}
                symbols={ccxtSymbols}
                onValuesChange={onCcxtSymbolsChange}
                tt={tt}
                ttf={ttf}
              />
            </>
          ) : (
            <AkshareInstrumentPicker
              describedBy="market-data-acquisition-symbols-error"
              disabled={false}
              invalid={Boolean(fieldErrors.symbols)}
              kind={akshareInstrumentKind}
              locale={locale}
              symbols={akshareSymbols}
              onKindChange={onAkshareKindChange}
              onValuesChange={onAkshareSymbolsChange}
              tt={tt}
              ttf={ttf}
            />
          )}
          <AcquisitionFieldError
            id="market-data-acquisition-symbols-error"
            message={fieldErrors.symbols}
          />
        </div>
      ) : (
        <div className="market-data-acquisition-settings-layout">
          <div className="market-data-acquisition-settings-fields">
            {providerId === "akshare" && akshareInstrumentKind === "A_SHARE" ? (
              <label className="market-data-acquisition-field">
                <span>
                  {tt("appText.marketDataAcquisitionAdjustmentLabel")}
                </span>
                <SelectField
                  value={adjustment}
                  options={[
                    {
                      value: "none",
                      label: tt("appText.marketDataAcquisitionAdjustmentNone"),
                    },
                    {
                      value: "qfq",
                      label: tt("appText.marketDataAcquisitionAdjustmentQfq"),
                    },
                    {
                      value: "hfq",
                      label: tt("appText.marketDataAcquisitionAdjustmentHfq"),
                    },
                  ]}
                  onValueChange={(value) =>
                    onAdjustmentChange(value as "none" | "qfq" | "hfq")
                  }
                />
              </label>
            ) : providerId === "akshare" ? (
              <div className="market-data-acquisition-field market-data-acquisition-readonly-field">
                <span>
                  {tt("appText.marketDataAcquisitionAdjustmentLabel")}
                </span>
                <strong>
                  {tt("appText.marketDataAcquisitionIndexAdjustmentHint")}
                </strong>
              </div>
            ) : null}

            <label className="market-data-acquisition-field">
              <span>{tt("appText.marketDataAcquisitionTimeframeLabel")}</span>
              <SelectField
                value={timeframe}
                options={timeframeOptions}
                aria-invalid={Boolean(fieldErrors.timeframe)}
                aria-describedby="market-data-acquisition-timeframe-error"
                onValueChange={(value) =>
                  onTimeframeChange(value as MarketDataAcquisitionTimeframe)
                }
              />
              <AcquisitionFieldError
                id="market-data-acquisition-timeframe-error"
                message={fieldErrors.timeframe}
              />
            </label>

            <div className="market-data-acquisition-form-grid">
              <label className="market-data-acquisition-field">
                <span>{tt("appText.marketDataAcquisitionStartDateLabel")}</span>
                <DatePicker
                  value={startDate}
                  max={endDate || undefined}
                  allowManualInput
                  locale={locale}
                  aria-label={tt("appText.marketDataAcquisitionStartDateLabel")}
                  aria-invalid={Boolean(fieldErrors.startDate)}
                  aria-describedby="market-data-acquisition-start-date-error"
                  onChange={onStartDateChange}
                />
                <AcquisitionFieldError
                  id="market-data-acquisition-start-date-error"
                  message={fieldErrors.startDate}
                />
              </label>
              <label className="market-data-acquisition-field">
                <span>{tt("appText.marketDataAcquisitionEndDateLabel")}</span>
                <DatePicker
                  value={endDate}
                  min={startDate || undefined}
                  allowManualInput
                  locale={locale}
                  aria-label={tt("appText.marketDataAcquisitionEndDateLabel")}
                  aria-invalid={Boolean(fieldErrors.endDate)}
                  aria-describedby="market-data-acquisition-end-date-error"
                  onChange={onEndDateChange}
                />
                <AcquisitionFieldError
                  id="market-data-acquisition-end-date-error"
                  message={fieldErrors.endDate}
                />
              </label>
            </div>

            <div className="market-data-acquisition-field">
              <div
                className="market-data-acquisition-folder-row"
                role="group"
                aria-labelledby="market-data-acquisition-folder-label"
              >
                <div>
                  <span id="market-data-acquisition-folder-label">
                    {tt("appText.marketDataAcquisitionTargetFolderLabel")}
                  </span>
                  {folderGrant?.displayPath ? <strong>{folderGrant.displayPath}</strong> : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-invalid={Boolean(fieldErrors.folder) || undefined}
                  aria-describedby="market-data-acquisition-folder-error"
                  onClick={onChooseFolder}
                >
                  {tt(
                    folderGrant
                      ? "appText.marketDataAcquisitionChangeFolder"
                      : "appText.marketDataAcquisitionChooseFolder",
                  )}
                </Button>
              </div>
              <AcquisitionFieldError
                id="market-data-acquisition-folder-error"
                message={fieldErrors.folder}
              />
            </div>
          </div>

          <aside className="market-data-acquisition-download-summary">
            <strong>
              {tt("appText.marketDataAcquisitionDownloadSummary")}
            </strong>
            <dl>
              <div>
                <dt>{tt("appText.marketDataAcquisitionStepMarket")}</dt>
                <dd>{resultSourceLabel}</dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionSymbolsLabel")}</dt>
                <dd>
                  {ttf(
                    "appText.marketDataAcquisitionResultInstrumentCountValue0",
                    [selectedSymbols.length],
                  )}
                </dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionTimeframeLabel")}</dt>
                <dd>{timeframe}</dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionDateRangeLabel")}</dt>
                <dd>
                  {ttf("appText.marketDataAcquisitionDateRangeValue0Value1", [
                    startDate,
                    endDate,
                  ])}
                </dd>
              </div>
            </dl>
            <div className="market-data-acquisition-notice">
              <VendorIcon name="folderCheck" aria-hidden="true" />
              <span>
                {tt("appText.marketDataAcquisitionSaveBeforeImportNotice")}
              </span>
            </div>
          </aside>
        </div>
      )}
    </section>
  </>
);
