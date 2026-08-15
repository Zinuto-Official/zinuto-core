// SPDX-License-Identifier: GPL-3.0-only

import type { RefObject } from "react";
import type {
  MarketDataAcquisitionAssetClass,
  MarketDataAcquisitionCatalog,
  MarketDataAcquisitionInstrument,
  MarketDataAcquisitionMarket,
  MarketDataAcquisitionSourcePlanId,
  MarketDataAcquisitionTimeframe,
} from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import { DatePicker } from "@/ui/primitives/date-picker";
import { RadioGroup, RadioItem } from "@/ui/primitives/radio-group";
import { SelectField } from "@/ui/primitives/select-field";
import { Spinner } from "@/ui/primitives/loading";
import { MarketAcquisitionInstrumentPicker } from "@/workspaces/data/dataConfig/MarketAcquisitionInstrumentPicker";
import {
  marketAcquisitionAssetClassDescriptionKey,
  marketAcquisitionAssetClassLabelKey,
  marketAcquisitionMarketLabelKey,
} from "@/workspaces/data/dataConfig/marketAcquisitionPresentation";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;
export type AcquisitionWizardStep = 1 | 2 | 3 | 4;

type AcquisitionWizardFieldErrors = {
  assetClass?: string;
  endDate?: string;
  folder?: string;
  market?: string;
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
  adjustment: "none" | "qfq" | "hfq" | null;
  assetClassId: MarketDataAcquisitionAssetClass["id"] | null;
  catalog: MarketDataAcquisitionCatalog | null;
  catalogLoading: boolean;
  endDate: string;
  fieldErrors: AcquisitionWizardFieldErrors;
  folderGrant: AcquisitionFolderGrant | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  locale: string;
  market: MarketDataAcquisitionMarket | null;
  rangeEstimateWarning?: string | null;
  selectedInstruments: MarketDataAcquisitionInstrument[];
  sourcePlanId: MarketDataAcquisitionSourcePlanId | null;
  startDate: string;
  timeframe: MarketDataAcquisitionTimeframe;
  tt: Translate;
  ttf: TranslateFormatted;
  wizardStep: AcquisitionWizardStep;
  onAdjustmentChange: (value: "none" | "qfq" | "hfq" | null) => void;
  onAssetClassChange: (value: MarketDataAcquisitionAssetClass["id"]) => void;
  onChooseFolder: () => void;
  onEndDateChange: (value: string) => void;
  onInstrumentsChange: (value: MarketDataAcquisitionInstrument[]) => void;
  onMarketChange: (value: MarketDataAcquisitionMarket["id"]) => void;
  onOpenProject: (url: string) => void;
  onRetryCatalog: () => void;
  onSourcePlanChange: (value: MarketDataAcquisitionSourcePlanId) => void;
  onStartDateChange: (value: string) => void;
  onTimeframeChange: (value: MarketDataAcquisitionTimeframe) => void;
};

type MarketDataAcquisitionStepperProps = {
  tt: Translate;
  wizardStep: AcquisitionWizardStep;
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

const sourceLabel = (
  sourcePlan: MarketDataAcquisitionMarket["sourcePlans"][number],
  catalog: MarketDataAcquisitionCatalog,
): string =>
  sourcePlan.providerChain
    .map(
      (providerId) =>
        catalog.providers.find((entry) => entry.id === providerId)?.name ??
        providerId,
    )
    .join(" / ");

export const MarketDataAcquisitionStepper = ({
  tt,
  wizardStep,
}: MarketDataAcquisitionStepperProps) => (
  <nav
    className="market-data-acquisition-stepper"
    aria-label={tt("appText.marketDataAcquisitionProgressLabel")}
  >
    <ol>
      {(
        [
          [1, "appText.marketDataAcquisitionStepAssetClass"],
          [2, "appText.marketDataAcquisitionStepMarketAndSource"],
          [3, "appText.marketDataAcquisitionStepInstruments"],
          [4, "appText.marketDataAcquisitionStepParameters"],
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
);

export const MarketDataAcquisitionWizard = ({
  adjustment,
  assetClassId,
  catalog,
  catalogLoading,
  endDate,
  fieldErrors,
  folderGrant,
  headingRef,
  locale,
  market,
  rangeEstimateWarning,
  selectedInstruments,
  sourcePlanId,
  startDate,
  timeframe,
  tt,
  ttf,
  wizardStep,
  onAdjustmentChange,
  onAssetClassChange,
  onChooseFolder,
  onEndDateChange,
  onInstrumentsChange,
  onMarketChange,
  onOpenProject,
  onRetryCatalog,
  onSourcePlanChange,
  onStartDateChange,
  onTimeframeChange,
}: MarketDataAcquisitionWizardProps) => {
  const assetClasses = catalog?.assetClasses ?? [];
  const availableMarkets = assetClassId
    ? (catalog?.markets.filter(
        (entry) => entry.assetClassId === assetClassId,
      ) ?? [])
    : [];
  const selectedPlan =
    market?.sourcePlans.find((entry) => entry.id === sourcePlanId) ?? null;
  const providers = selectedPlan
    ? selectedPlan.providerChain
        .map((providerId) =>
          catalog?.providers.find((entry) => entry.id === providerId),
        )
        .filter((provider): provider is NonNullable<typeof provider> =>
          Boolean(provider),
        )
    : [];
  const stepTitleKey =
    wizardStep === 1
      ? "appText.marketDataAcquisitionStepAssetClassTitle"
      : wizardStep === 2
        ? "appText.marketDataAcquisitionStepMarketAndSourceTitle"
        : wizardStep === 3
          ? "appText.marketDataAcquisitionStepInstrumentsTitle"
          : "appText.marketDataAcquisitionStepParametersTitle";
  const stepDescriptionKey =
    wizardStep === 1
      ? "appText.marketDataAcquisitionStepAssetClassDescription"
      : wizardStep === 2
        ? "appText.marketDataAcquisitionStepMarketAndSourceDescription"
        : wizardStep === 3
          ? "appText.marketDataAcquisitionStepInstrumentsDescription"
          : "appText.marketDataAcquisitionStepParametersDescription";

  return (
    <section
      className="market-data-acquisition-step-panel"
      aria-labelledby="market-data-acquisition-step-title"
    >
      <header className="market-data-acquisition-step-head">
        <h2
          id="market-data-acquisition-step-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {tt(stepTitleKey)}
        </h2>
        <p>{tt(stepDescriptionKey)}</p>
      </header>

      {wizardStep === 1 ? (
        <div className="market-data-acquisition-task-step">
          <RadioGroup
            value={assetClassId ?? ""}
            aria-label={tt("appText.marketDataAcquisitionStepAssetClassTitle")}
            className="market-data-acquisition-task-options"
            onValueChange={(value) =>
              onAssetClassChange(value as MarketDataAcquisitionAssetClass["id"])
            }
          >
            {assetClasses.map((assetClass) => (
              <RadioItem
                className="market-data-acquisition-task-option"
                key={assetClass.id}
                value={assetClass.id}
                disabled={catalogLoading}
                label={
                  <>
                    <span className="market-data-acquisition-task-icon">
                      <VendorIcon
                        name={
                          assetClass.id === "CRYPTO"
                            ? "globe2"
                            : "chartCandlestick"
                        }
                        aria-hidden="true"
                      />
                    </span>
                    <span className="market-data-acquisition-task-copy">
                      <strong>
                        {tt(marketAcquisitionAssetClassLabelKey(assetClass.id))}
                      </strong>
                      <span>
                        {tt(
                          marketAcquisitionAssetClassDescriptionKey(
                            assetClass.id,
                          ),
                        )}
                      </span>
                      <small>
                        {ttf("appText.marketDataAcquisitionMarketCountValue0", [
                          assetClass.marketIds.length,
                        ])}
                      </small>
                    </span>
                  </>
                }
              />
            ))}
          </RadioGroup>
          {catalogLoading ? (
            <div
              className="market-data-acquisition-market-message"
              role="status"
            >
              <Spinner decorative size="sm" />
              {tt("appText.marketDataAcquisitionCatalogLoading")}
            </div>
          ) : null}
          {!catalogLoading && !assetClasses.length ? (
            <div
              className="market-data-acquisition-market-message"
              role="alert"
            >
              {tt("appText.marketDataAcquisitionCatalogLoadFailed")}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRetryCatalog}
              >
                {tt("appText.marketDataAcquisitionCatalogRetry")}
              </Button>
            </div>
          ) : null}
          <AcquisitionFieldError
            id="market-data-acquisition-asset-class-error"
            message={fieldErrors.assetClass}
          />
        </div>
      ) : wizardStep === 2 ? (
        <div className="market-data-acquisition-task-step">
          <RadioGroup
            value={market?.id ?? ""}
            aria-label={tt("appText.marketDataAcquisitionMarketLabel")}
            className="market-data-acquisition-market-options"
            onValueChange={(value) =>
              onMarketChange(value as MarketDataAcquisitionMarket["id"])
            }
          >
            {availableMarkets.map((entry) => {
              const available = entry.sourcePlans.some(
                (plan) => plan.available,
              );
              return (
                <RadioItem
                  className="market-data-acquisition-market-option"
                  key={entry.id}
                  value={entry.id}
                  disabled={!available}
                  label={
                    <span className="market-data-acquisition-task-copy">
                      <strong>
                        {tt(marketAcquisitionMarketLabelKey(entry.id))}
                      </strong>
                    </span>
                  }
                />
              );
            })}
          </RadioGroup>
          <AcquisitionFieldError
            id="market-data-acquisition-market-error"
            message={fieldErrors.market}
          />

          {market ? (
            <div className="market-data-acquisition-source-plan">
              {market.sourcePlans.length > 1 ? (
                <label className="market-data-acquisition-field">
                  <span>
                    {tt("appText.marketDataAcquisitionSourcePlanLabel")}
                  </span>
                  <SelectField
                    value={sourcePlanId ?? ""}
                    options={market.sourcePlans.map((plan) => ({
                      value: plan.id,
                      label: catalog ? sourceLabel(plan, catalog) : plan.id,
                      disabled: !plan.available,
                    }))}
                    aria-invalid={Boolean(fieldErrors.source)}
                    aria-describedby="market-data-acquisition-source-error"
                    onValueChange={(value) =>
                      onSourcePlanChange(
                        value as MarketDataAcquisitionSourcePlanId,
                      )
                    }
                  />
                </label>
              ) : selectedPlan && catalog ? (
                <div className="market-data-acquisition-field">
                  <span>
                    {tt("appText.marketDataAcquisitionSourcePlanLabel")}
                  </span>
                  <strong>{sourceLabel(selectedPlan, catalog)}</strong>
                </div>
              ) : null}
              {selectedPlan && catalog ? (
                <div className="market-data-acquisition-source-details">
                  <p>
                    {tt("appText.marketDataAcquisitionSourceBoundaryNotice")}
                  </p>
                  <div>
                    {providers.map((provider) => (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        key={provider.id}
                        onClick={() => onOpenProject(provider.projectUrl)}
                      >
                        {ttf(
                          "appText.marketDataAcquisitionProviderVersionValue0Value1",
                          [provider.name, provider.version],
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <AcquisitionFieldError
                id="market-data-acquisition-source-error"
                message={fieldErrors.source}
              />
            </div>
          ) : null}
        </div>
      ) : wizardStep === 3 ? (
        market && sourcePlanId ? (
          <div className="market-data-acquisition-task-step">
            <MarketAcquisitionInstrumentPicker
              key={`${market.id}:${sourcePlanId}`}
              describedBy="market-data-acquisition-symbols-error"
              disabled={false}
              invalid={Boolean(fieldErrors.symbols)}
              locale={locale}
              market={market}
              sourcePlanId={sourcePlanId}
              value={selectedInstruments}
              onValuesChange={onInstrumentsChange}
              tt={tt}
              ttf={ttf}
            />
            <AcquisitionFieldError
              id="market-data-acquisition-symbols-error"
              message={fieldErrors.symbols}
            />
          </div>
        ) : (
          <div className="market-data-acquisition-market-message" role="alert">
            {tt("appText.marketDataAcquisitionMarketSelectionRequired")}
          </div>
        )
      ) : (
        <div className="market-data-acquisition-settings-layout">
          <div className="market-data-acquisition-settings-fields">
            {market?.adjustmentOptions.length ? (
              <label className="market-data-acquisition-field">
                <span>
                  {tt("appText.marketDataAcquisitionAdjustmentLabel")}
                </span>
                <SelectField
                  value={adjustment ?? "none"}
                  options={market.adjustmentOptions.map((option) => ({
                    value: option,
                    label: tt(
                      option === "qfq"
                        ? "appText.marketDataAcquisitionAdjustmentQfq"
                        : option === "hfq"
                          ? "appText.marketDataAcquisitionAdjustmentHfq"
                          : "appText.marketDataAcquisitionAdjustmentNone",
                    ),
                  }))}
                  onValueChange={(value) =>
                    onAdjustmentChange(value as "none" | "qfq" | "hfq")
                  }
                />
              </label>
            ) : null}

            <label className="market-data-acquisition-field">
              <span>{tt("appText.marketDataAcquisitionTimeframeLabel")}</span>
              <SelectField
                value={timeframe}
                options={(market?.supportedTimeframes ?? []).map((value) => ({
                  value,
                  label: value,
                }))}
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

            {rangeEstimateWarning ? (
              <p
                className="market-data-acquisition-range-warning"
                role="status"
              >
                <VendorIcon name="alertTriangle" aria-hidden="true" />
                <span>{rangeEstimateWarning}</span>
              </p>
            ) : null}

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
                  {folderGrant?.displayPath ? (
                    <strong>{folderGrant.displayPath}</strong>
                  ) : null}
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
                <dt>{tt("appText.marketDataAcquisitionStepAssetClass")}</dt>
                <dd>
                  {assetClassId
                    ? tt(marketAcquisitionAssetClassLabelKey(assetClassId))
                    : ""}
                </dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionMarketLabel")}</dt>
                <dd>
                  {market ? tt(marketAcquisitionMarketLabelKey(market.id)) : ""}
                </dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionSourcePlanLabel")}</dt>
                <dd>
                  {selectedPlan && catalog
                    ? sourceLabel(selectedPlan, catalog)
                    : ""}
                </dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionSymbolsLabel")}</dt>
                <dd>
                  {ttf(
                    "appText.marketDataAcquisitionResultInstrumentCountValue0",
                    [selectedInstruments.length],
                  )}
                </dd>
              </div>
              <div>
                <dt>{tt("appText.marketDataAcquisitionTimeframeLabel")}</dt>
                <dd>{timeframe}</dd>
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
  );
};
