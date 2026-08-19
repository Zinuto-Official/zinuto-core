// SPDX-License-Identifier: GPL-3.0-only

import { useRef, useState } from "react";
import type {
  MarketDataAcquisitionCatalog,
  MarketDataAcquisitionInstrument,
  MarketDataAcquisitionMarketId,
  MarketDataAcquisitionSourcePlanId,
  MarketDataAcquisitionTimeframe,
} from "../src/api";
import { noop } from "./i18nWorkspacePreviewSupport";
import { api } from "../src/api";
import { VendorIcon } from "../src/assets/graphics";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import { StandardModalFrame } from "../src/ui/components";
import { Button } from "../src/ui/primitives/button";
import { MarketDataAcquisitionResult } from "../src/workspaces/data/dataConfig/MarketDataAcquisitionResult";
import {
  MarketDataAcquisitionStepper,
  MarketDataAcquisitionWizard,
  type AcquisitionWizardStep,
} from "../src/workspaces/data/dataConfig/MarketDataAcquisitionWizard";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";

const previewCatalog: MarketDataAcquisitionCatalog = {
  providers: [
    {
      id: "akshare",
      name: "AKShare",
      version: "1.18.91",
      license: "MIT",
      projectUrl: "https://github.com/akfamily/akshare",
      docsUrl: "https://akshare.akfamily.xyz/",
      termsUrl: "https://about.eastmoney.com/home/protocol",
      termsRevision: "preview-2026-08",
      available: true,
      unavailabilityCode: null,
    },
    {
      id: "ccxt",
      name: "CCXT",
      version: "4.5.73",
      license: "MIT",
      projectUrl: "https://github.com/ccxt/ccxt",
      docsUrl: "https://github.com/ccxt/ccxt/wiki/manual",
      termsUrl: "https://www.binance.com/en/terms",
      termsRevision: "preview-2026-08",
      available: true,
      unavailabilityCode: null,
    },
    {
      id: "financedatareader",
      name: "FinanceDataReader",
      version: "0.9.202",
      license: "MIT",
      projectUrl: "https://github.com/FinanceData/FinanceDataReader",
      docsUrl: "https://github.com/FinanceData/FinanceDataReader",
      termsUrl: "https://finance.yahoo.com/legal/terms.html",
      termsRevision: "preview-2026-08",
      available: true,
      unavailabilityCode: null,
    },
  ],
  assetClasses: [
    {
      id: "STOCKS_AND_INDICES",
      marketIds: [
        "CN_A_SHARE",
        "HK_STOCKS",
        "KR_STOCKS",
        "US_STOCKS",
        "JP_STOCKS",
        "VN_STOCKS",
        "GLOBAL_INDICES",
      ],
    },
    { id: "FOREX", marketIds: ["FOREX"] },
    {
      id: "COMMODITIES_AND_RATES",
      marketIds: ["COMMODITY_FUTURES", "RATE_FUTURES"],
    },
    { id: "CRYPTO", marketIds: ["CRYPTO_SPOT"] },
  ],
  markets: [
    {
      id: "CN_A_SHARE",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "Asia/Shanghai",
      supportedTimeframes: ["1m", "5m", "1h", "1d"],
      adjustmentOptions: ["none", "qfq", "hfq"],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "CN_A_SHARE_SMART",
          providerChain: ["akshare", "financedatareader"],
          fallbackPolicy: "WHOLE_INSTRUMENT_DAILY_UNADJUSTED_ONLY",
          available: true,
        },
      ],
    },
    {
      id: "HK_STOCKS",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "Asia/Hong_Kong",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "FDR_HKEX",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "KR_STOCKS",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "Asia/Seoul",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "FDR_KRX",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "US_STOCKS",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "America/New_York",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "FDR_US_STOCKS",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "JP_STOCKS",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "Asia/Tokyo",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "FDR_TSE",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "VN_STOCKS",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "Asia/Ho_Chi_Minh",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "FDR_HOSE",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "GLOBAL_INDICES",
      assetClassId: "STOCKS_AND_INDICES",
      timeZone: "UTC",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "PRESET",
      sourcePlans: [
        {
          id: "FDR_GLOBAL_INDICES",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "FOREX",
      assetClassId: "FOREX",
      timeZone: "UTC",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "PRESET",
      sourcePlans: [
        {
          id: "FDR_FOREX",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "COMMODITY_FUTURES",
      assetClassId: "COMMODITIES_AND_RATES",
      timeZone: "America/New_York",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "PRESET",
      sourcePlans: [
        {
          id: "FDR_COMMODITY_FUTURES",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "RATE_FUTURES",
      assetClassId: "COMMODITIES_AND_RATES",
      timeZone: "America/New_York",
      supportedTimeframes: ["1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "PRESET",
      sourcePlans: [
        {
          id: "FDR_RATE_FUTURES",
          providerChain: ["financedatareader"],
          fallbackPolicy: "NONE",
          available: true,
        },
      ],
    },
    {
      id: "CRYPTO_SPOT",
      assetClassId: "CRYPTO",
      timeZone: "UTC",
      supportedTimeframes: ["1m", "5m", "1h", "1d"],
      adjustmentOptions: [],
      instrumentDiscovery: "CATALOG",
      sourcePlans: [
        {
          id: "CCXT_BINANCE_SMART",
          providerChain: ["ccxt", "financedatareader"],
          fallbackPolicy: "WHOLE_INSTRUMENT_DAILY_ONLY",
          available: true,
        },
      ],
    },
  ],
};

const previewInstruments: Record<
  MarketDataAcquisitionMarketId,
  MarketDataAcquisitionInstrument[]
> = {
  CN_A_SHARE: [
    {
      symbol: "000001",
      sourceSymbol: "000001",
      name: "平安银行",
      marketId: "CN_A_SHARE",
      exchangeId: "SZ",
      sourcePlanIds: ["CN_A_SHARE_SMART"],
    },
    {
      symbol: "600519",
      sourceSymbol: "600519",
      name: "贵州茅台",
      marketId: "CN_A_SHARE",
      exchangeId: "SH",
      sourcePlanIds: ["CN_A_SHARE_SMART"],
    },
  ],
  HK_STOCKS: [],
  KR_STOCKS: [],
  US_STOCKS: [
    {
      symbol: "AAPL",
      sourceSymbol: "AAPL",
      name: "Apple Inc.",
      marketId: "US_STOCKS",
      exchangeId: "NASDAQ",
      sourcePlanIds: ["FDR_US_STOCKS"],
    },
    {
      symbol: "IBM",
      sourceSymbol: "IBM",
      name: "IBM",
      marketId: "US_STOCKS",
      exchangeId: "NYSE",
      sourcePlanIds: ["FDR_US_STOCKS"],
    },
    {
      symbol: "SPY",
      sourceSymbol: "SPY",
      name: "SPDR S&P 500 ETF",
      marketId: "US_STOCKS",
      exchangeId: "AMEX",
      sourcePlanIds: ["FDR_US_STOCKS"],
    },
  ],
  JP_STOCKS: [
    {
      symbol: "7203",
      sourceSymbol: "7203",
      name: "TOYOTA MOTOR CORPORATION",
      marketId: "JP_STOCKS",
      exchangeId: "TSE",
      sourcePlanIds: ["FDR_TSE"],
    },
  ],
  VN_STOCKS: [],
  GLOBAL_INDICES: [
    {
      symbol: "^GSPC",
      sourceSymbol: "^GSPC",
      name: "S&P 500",
      marketId: "GLOBAL_INDICES",
      exchangeId: null,
      sourcePlanIds: ["FDR_GLOBAL_INDICES"],
    },
  ],
  FOREX: [
    {
      symbol: "USD/KRW",
      sourceSymbol: "USD/KRW",
      name: "US Dollar / Korean Won",
      marketId: "FOREX",
      exchangeId: null,
      sourcePlanIds: ["FDR_FOREX"],
    },
  ],
  COMMODITY_FUTURES: [
    {
      symbol: "GC=F",
      sourceSymbol: "GC=F",
      name: "Gold futures",
      marketId: "COMMODITY_FUTURES",
      exchangeId: null,
      sourcePlanIds: ["FDR_COMMODITY_FUTURES"],
    },
  ],
  RATE_FUTURES: [],
  CRYPTO_SPOT: [
    {
      symbol: "BTC/USDT",
      sourceSymbol: "BTC/USDT",
      name: "BTC/USDT",
      marketId: "CRYPTO_SPOT",
      exchangeId: "binance",
      sourcePlanIds: ["CCXT_BINANCE_SMART"],
    },
  ],
};

type PreviewMarketDataAcquisitionProps = {
  formatStorageBytes: (value: number) => string;
  locale: string;
  scenario: string;
  tt: (key: string) => string;
  ttf: (key: string, values?: Array<unknown>) => string;
};

export const PreviewMarketDataAcquisition = ({
  formatStorageBytes: formatPreviewStorageBytes,
  locale: previewLocale,
  scenario,
  tt: acquisitionTt,
  ttf: acquisitionTtf,
}: PreviewMarketDataAcquisitionProps) => {
  const initialStep: AcquisitionWizardStep =
    scenario === "catalog" || scenario === "catalog-paged"
      ? 3
      : scenario === "settings"
        ? 4
        : 1;
  const [wizardStep, setWizardStep] =
    useState<AcquisitionWizardStep>(initialStep);
  const [assetClassId, setAssetClassId] =
    useState<(typeof previewCatalog.assetClasses)[number]["id"]>(
      "STOCKS_AND_INDICES",
    );
  const [marketId, setMarketId] =
    useState<MarketDataAcquisitionMarketId>("CN_A_SHARE");
  const [sourcePlanId, setSourcePlanId] =
    useState<MarketDataAcquisitionSourcePlanId>("CN_A_SHARE_SMART");
  const [thirdPartyUseConfirmed, setThirdPartyUseConfirmed] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState<
    MarketDataAcquisitionInstrument[]
  >(previewInstruments.CN_A_SHARE);
  const [adjustment, setAdjustment] = useState<"none" | "qfq" | "hfq" | null>(
    "none",
  );
  const [timeframe, setTimeframe] =
    useState<MarketDataAcquisitionTimeframe>("1d");
  const [startDate, setStartDate] = useState("2025-07-25");
  const [endDate, setEndDate] = useState("2026-07-25");
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const market =
    previewCatalog.markets.find((entry) => entry.id === marketId) ?? null;
  const resultSourceLabel = "China A shares · AKShare → FinanceDataReader";
  const isSaved = scenario === "saved";
  const isFailed = scenario === "failed";

  api.listMarketDataAcquisitionMarketInstruments = async (
    requestedMarketId,
    input = {},
  ) => ({
    marketId: requestedMarketId,
    instruments: previewInstruments[requestedMarketId].filter(
      (instrument) =>
        !input.query ||
        instrument.symbol.includes(input.query.toUpperCase()) ||
        instrument.name.toUpperCase().includes(input.query.toUpperCase()),
    ),
    nextCursor:
      scenario === "catalog-paged" && !input.cursor
        ? "preview-next-page"
        : null,
    cachedAt:
      previewCatalog.markets.find((entry) => entry.id === requestedMarketId)
        ?.instrumentDiscovery === "PRESET"
        ? null
        : "2026-08-15T08:00:00.000Z",
    cacheState:
      previewCatalog.markets.find((entry) => entry.id === requestedMarketId)
        ?.instrumentDiscovery === "PRESET"
        ? "BUNDLED"
        : "FRESH",
  });

  const formActions =
    wizardStep === 1 ? (
      <>
        <Button type="button" variant="outline" onClick={noop}>
          {acquisitionTt("appText.cancel")}
        </Button>
        <Button type="button" onClick={() => setWizardStep(2)}>
          {acquisitionTt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : wizardStep === 2 ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardStep(1)}
        >
          {acquisitionTt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button
          type="button"
          disabled={!thirdPartyUseConfirmed}
          onClick={() => setWizardStep(3)}
        >
          {acquisitionTt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : wizardStep === 3 ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardStep(2)}
        >
          {acquisitionTt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button type="button" onClick={() => setWizardStep(4)}>
          {acquisitionTt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardStep(3)}
        >
          {acquisitionTt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button type="button" disabled={!thirdPartyUseConfirmed} onClick={noop}>
          {acquisitionTt("appText.marketDataAcquisitionStartDownload")}
        </Button>
      </>
    );
  const stateActions = isSaved ? (
    <>
      <Button type="button" variant="outline" onClick={noop}>
        {acquisitionTt("appText.marketDataAcquisitionOpenFolder")}
      </Button>
      <Button type="button" variant="outline" onClick={noop}>
        {acquisitionTt("appText.marketDataAcquisitionImportLater")}
      </Button>
      <Button type="button" onClick={noop}>
        {acquisitionTt("appText.marketDataAcquisitionReviewAndImport")}
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={noop}>
        {acquisitionTt("appText.close2")}
      </Button>
      <Button type="button" variant="outline" onClick={noop}>
        {acquisitionTt("appText.marketDataAcquisitionAdjustSettings")}
      </Button>
      <Button type="button" onClick={noop}>
        {acquisitionTt("appText.marketDataAcquisitionRetryDownload")}
      </Button>
    </>
  );

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-market-data-acquisition">
      <StandardModalFrame
        title={
          <div className="market-data-acquisition-header-content">
            <div className="market-data-acquisition-title-row">
              <h1>
                {acquisitionTt("appText.marketDataAcquisitionDialogTitle")}
              </h1>
              {!isSaved && !isFailed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="market-data-acquisition-history-trigger"
                  aria-label={acquisitionTt(
                    "appText.marketDataAcquisitionHistoryTitle",
                  )}
                  title={acquisitionTt(
                    "appText.marketDataAcquisitionHistoryTitle",
                  )}
                  onClick={noop}
                >
                  <VendorIcon name="clock" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            {!isSaved && !isFailed ? (
              <MarketDataAcquisitionStepper
                tt={acquisitionTt}
                wizardStep={wizardStep}
              />
            ) : null}
          </div>
        }
        variant="workflow"
        className="market-data-acquisition-dialog"
        headerClassName="market-data-acquisition-header"
        bodyClassName={`market-data-acquisition-body${
          !isSaved && !isFailed && wizardStep === 3
            ? " market-data-acquisition-body--instrument-selection"
            : ""
        }`}
        footerClassName="market-data-acquisition-footer"
        actions={isSaved || isFailed ? stateActions : formActions}
      >
        {isSaved ? (
          <MarketDataAcquisitionResult
            endDate={endDate}
            fileCount={2}
            formattedBytes={formatPreviewStorageBytes(18_600_000)}
            instrumentCount={selectedInstruments.length}
            outputPath="~/Documents/Zinuto/Market Data"
            sourceLabel={resultSourceLabel}
            startDate={startDate}
            timeframe={timeframe}
            tt={acquisitionTt}
            ttf={acquisitionTtf}
          />
        ) : isFailed ? (
          <section
            className="market-data-acquisition-state-page"
            role="alert"
            aria-live="polite"
          >
            <span
              className="market-data-acquisition-state-icon"
              data-tone="danger"
              aria-hidden="true"
            >
              <VendorIcon name="alertTriangle" />
            </span>
            <div>
              <h2>
                {acquisitionTt("appText.marketDataAcquisitionFailedTitle")}
              </h2>
              <p>{acquisitionTt("appText.marketDataAcquisitionJobFailed")}</p>
            </div>
            <div className="market-data-acquisition-state-boundary">
              <VendorIcon name="folderCheck" aria-hidden="true" />
              <span>
                {acquisitionTt(
                  "appText.marketDataAcquisitionStateBoundaryNotice",
                )}
              </span>
            </div>
          </section>
        ) : (
          <MarketDataAcquisitionWizard
            adjustment={adjustment}
            assetClassId={assetClassId}
            catalog={previewCatalog}
            catalogLoading={false}
            endDate={endDate}
            fieldErrors={{}}
            folderGrant={{
              grantId: "preview-folder-grant",
              displayPath: "~/Documents/Zinuto/Market Data",
            }}
            headingRef={headingRef}
            locale={previewLocale}
            market={market}
            selectedInstruments={selectedInstruments}
            sourcePlanId={sourcePlanId}
            startDate={startDate}
            thirdPartyUseConfirmed={thirdPartyUseConfirmed}
            timeframe={timeframe}
            tt={acquisitionTt}
            ttf={acquisitionTtf}
            wizardStep={wizardStep}
            onAdjustmentChange={setAdjustment}
            onAssetClassChange={(value) => {
              setAssetClassId(value);
              setMarketId("CN_A_SHARE");
              setSourcePlanId("CN_A_SHARE_SMART");
              setThirdPartyUseConfirmed(false);
              setSelectedInstruments(previewInstruments.CN_A_SHARE);
            }}
            onChooseFolder={noop}
            onEndDateChange={setEndDate}
            onInstrumentsChange={setSelectedInstruments}
            onMarketChange={(value) => {
              const nextMarket = previewCatalog.markets.find(
                (entry) => entry.id === value,
              );
              const nextPlan =
                nextMarket?.sourcePlans[0]?.id ?? "CN_A_SHARE_SMART";
              setMarketId(value);
              setSourcePlanId(nextPlan);
              setThirdPartyUseConfirmed(false);
              setSelectedInstruments(previewInstruments[value]);
              setTimeframe(
                nextMarket?.supportedTimeframes.includes("1d") ? "1d" : "1m",
              );
              setAdjustment(
                nextMarket?.adjustmentOptions.includes("none") ? "none" : null,
              );
            }}
            onOpenProject={noop}
            onRetryCatalog={noop}
            onSourcePlanChange={(value) => {
              setSourcePlanId(value);
              setThirdPartyUseConfirmed(false);
            }}
            onStartDateChange={setStartDate}
            onThirdPartyUseConfirmedChange={setThirdPartyUseConfirmed}
            onTimeframeChange={setTimeframe}
          />
        )}
      </StandardModalFrame>
    </section>
  );
};
