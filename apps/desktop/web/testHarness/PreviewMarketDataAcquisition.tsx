// SPDX-License-Identifier: GPL-3.0-only

import { useRef, useState } from "react";
import type {
  MarketDataAcquisitionConnector,
  MarketDataAcquisitionConnectorId,
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
  MarketDataAcquisitionWizard,
  type AcquisitionWizardStep,
} from "../src/workspaces/data/dataConfig/MarketDataAcquisitionWizard";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";

const previewMarketDataAcquisitionConnectors: MarketDataAcquisitionConnector[] =
  [
    {
      id: "akshare",
      version: "1.17.12",
      market: "A_SHARE",
      available: true,
      unavailabilityCode: null,
      supportedTimeframes: ["1m", "5m", "1h", "1d"],
      datasets: [
        "stock_zh_a_hist",
        "stock_zh_a_hist_min_em",
        "index_zh_a_hist",
      ],
      exchanges: [],
      terms: {
        projects: [
          {
            id: "akshare",
            name: "AKShare",
            url: "https://github.com/akfamily/akshare",
            infoUrl: "https://akshare.akfamily.xyz/",
            version: "1.17.12",
            license: "MIT",
          },
        ],
        upstreams: [
          {
            id: "eastmoney",
            upstreamName: "Eastmoney",
            termsUrl: "https://about.eastmoney.com/",
            docsUrl: "https://quote.eastmoney.com/",
            termsRevision: "preview-2026-07",
          },
        ],
      },
    },
    {
      id: "ccxt",
      version: "4.5.4",
      market: "CRYPTO_SPOT",
      available: true,
      unavailabilityCode: null,
      supportedTimeframes: ["1m", "5m", "1h", "1d"],
      datasets: [],
      exchanges: ["binance", "okx"],
      terms: {
        projects: [
          {
            id: "ccxt",
            name: "CCXT",
            url: "https://github.com/ccxt/ccxt",
            infoUrl: "https://docs.ccxt.com/",
            version: "4.5.4",
            license: "MIT",
          },
        ],
        upstreams: [
          {
            id: "binance",
            upstreamName: "Binance",
            termsUrl: "https://www.binance.com/en/terms",
            docsUrl: "https://developers.binance.com/",
            termsRevision: "preview-2026-07",
          },
        ],
      },
    },
  ];

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
    scenario === "catalog" ? 2 : scenario === "settings" ? 3 : 1;
  const [wizardStep, setWizardStep] =
    useState<AcquisitionWizardStep>(initialStep);
  const [providerId, setProviderId] =
    useState<MarketDataAcquisitionConnectorId>("akshare");
  const [akshareInstrumentKind, setAkshareInstrumentKind] = useState<
    "A_SHARE" | "INDEX"
  >("A_SHARE");
  const [akshareSymbols, setAkshareSymbols] = useState(["000001", "600519"]);
  const [ccxtSymbols, setCcxtSymbols] = useState(["BTC/USDT", "ETH/USDT"]);
  const [exchangeId, setExchangeId] = useState<"binance" | "okx">("binance");
  const [adjustment, setAdjustment] = useState<"none" | "qfq" | "hfq">("qfq");
  const [timeframe, setTimeframe] =
    useState<MarketDataAcquisitionTimeframe>("1d");
  const [startDate, setStartDate] = useState("2025-07-25");
  const [endDate, setEndDate] = useState("2026-07-25");
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  api.listAkshareAcquisitionInstruments = async () => ({
    cachedAt: "2026-07-25T08:00:00.000Z",
    instruments: [
      {
        symbol: "000001",
        name: "平安银行",
        exchangeId: "SZ",
        kind: "A_SHARE",
      },
      {
        symbol: "000858",
        name: "五粮液",
        exchangeId: "SZ",
        kind: "A_SHARE",
      },
      {
        symbol: "300750",
        name: "宁德时代",
        exchangeId: "SZ",
        kind: "A_SHARE",
      },
      {
        symbol: "600519",
        name: "贵州茅台",
        exchangeId: "SH",
        kind: "A_SHARE",
      },
      {
        symbol: "601318",
        name: "中国平安",
        exchangeId: "SH",
        kind: "A_SHARE",
      },
      {
        symbol: "688981",
        name: "中芯国际",
        exchangeId: "SH",
        kind: "A_SHARE",
      },
      {
        symbol: "830799",
        name: "艾融软件",
        exchangeId: "BJ",
        kind: "A_SHARE",
      },
      {
        symbol: "INDEX-000001",
        name: "上证指数",
        exchangeId: "SH",
        kind: "INDEX",
      },
      {
        symbol: "INDEX-399001",
        name: "深证成指",
        exchangeId: "SZ",
        kind: "INDEX",
      },
    ],
  });
  api.listCcxtAcquisitionMarkets = async (previewExchangeId) => ({
    exchangeId: previewExchangeId,
    cachedAt: "2026-07-25T08:00:00.000Z",
    markets: [
      { symbol: "BTC/USDT", base: "BTC", quote: "USDT", active: true },
      { symbol: "ETH/USDT", base: "ETH", quote: "USDT", active: true },
      { symbol: "SOL/USDT", base: "SOL", quote: "USDT", active: true },
      { symbol: "BNB/USDT", base: "BNB", quote: "USDT", active: true },
      { symbol: "XRP/USDT", base: "XRP", quote: "USDT", active: true },
      { symbol: "BTC/USDC", base: "BTC", quote: "USDC", active: true },
      { symbol: "ETH/USDC", base: "ETH", quote: "USDC", active: true },
    ],
  });

  const selectedSymbols =
    providerId === "akshare" ? akshareSymbols : ccxtSymbols;
  const selectedConnector =
    previewMarketDataAcquisitionConnectors.find(
      (connector) => connector.id === providerId,
    ) ?? null;
  const resultSourceLabel = acquisitionTt(
    providerId === "akshare"
      ? "appText.marketDataAcquisitionTaskAShareTitle"
      : "appText.marketDataAcquisitionTaskCryptoTitle",
  );
  const isSaved = scenario === "saved";
  const isFailed = scenario === "failed";

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
          disabled={selectedSymbols.length === 0}
          onClick={() => setWizardStep(3)}
        >
          {acquisitionTt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardStep(2)}
        >
          {acquisitionTt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button type="button" onClick={noop}>
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
          <h1>{acquisitionTt("appText.marketDataAcquisitionDialogTitle")}</h1>
        }
        description={acquisitionTt(
          "appText.marketDataAcquisitionDialogDescription",
        )}
        variant="workflow"
        className="market-data-acquisition-dialog"
        headerClassName="market-data-acquisition-header"
        bodyClassName="market-data-acquisition-body"
        footerClassName="market-data-acquisition-footer"
        actions={isSaved || isFailed ? stateActions : formActions}
      >
        {isSaved ? (
          <MarketDataAcquisitionResult
            endDate={endDate}
            fileCount={2}
            formattedBytes={formatPreviewStorageBytes(18_600_000)}
            instrumentCount={selectedSymbols.length}
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
            akshareInstrumentKind={akshareInstrumentKind}
            akshareSymbols={akshareSymbols}
            ccxtSymbols={ccxtSymbols}
            connectors={previewMarketDataAcquisitionConnectors}
            connectorsLoading={false}
            endDate={endDate}
            exchangeId={exchangeId}
            fieldErrors={{}}
            folderGrant={{
              grantId: "preview-folder-grant",
              displayPath: "~/Documents/Zinuto/Market Data",
            }}
            headingRef={headingRef}
            locale={previewLocale}
            providerId={providerId}
            resultSourceLabel={resultSourceLabel}
            selectedConnector={selectedConnector}
            selectedSymbols={selectedSymbols}
            startDate={startDate}
            timeframe={timeframe}
            timeframeOptions={[
              { value: "1m", label: "1m" },
              { value: "5m", label: "5m" },
              { value: "1h", label: "1h" },
              { value: "1d", label: "1d" },
            ]}
            tt={acquisitionTt}
            ttf={acquisitionTtf}
            wizardStep={wizardStep}
            onAdjustmentChange={setAdjustment}
            onAkshareKindChange={(kind) => {
              setAkshareInstrumentKind(kind);
              setAkshareSymbols([]);
            }}
            onAkshareSymbolsChange={setAkshareSymbols}
            onCcxtSymbolsChange={setCcxtSymbols}
            onChooseFolder={noop}
            onEndDateChange={setEndDate}
            onExchangeChange={setExchangeId}
            onOpenProject={noop}
            onProviderChange={setProviderId}
            onRetryConnectors={noop}
            onStartDateChange={setStartDate}
            onTimeframeChange={setTimeframe}
          />
        )}
      </StandardModalFrame>
    </section>
  );
};
