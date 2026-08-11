// SPDX-License-Identifier: GPL-3.0-only

import { VendorIcon } from "@/assets/graphics";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;

type MarketDataAcquisitionResultProps = {
  endDate: string;
  fileCount: number;
  formattedBytes: string;
  instrumentCount: number;
  outputPath: string;
  sourceLabel: string;
  startDate: string;
  timeframe: string;
  tt: Translate;
  ttf: TranslateFormatted;
};

export const MarketDataAcquisitionResult = ({
  endDate,
  fileCount,
  formattedBytes,
  instrumentCount,
  outputPath,
  sourceLabel,
  startDate,
  timeframe,
  tt,
  ttf,
}: MarketDataAcquisitionResultProps) => (
  <section className="market-data-acquisition-result" role="status">
    <header className="market-data-acquisition-result-head">
      <span className="market-data-acquisition-result-icon" aria-hidden="true">
        <VendorIcon name="check" />
      </span>
      <div>
        <strong>{tt("appText.marketDataAcquisitionDownloadComplete")}</strong>
        <p>{tt("appText.marketDataAcquisitionNextStepDescription")}</p>
        <small>
          {ttf("appText.marketDataAcquisitionSavedSummary", [
            fileCount,
            formattedBytes,
          ])}
        </small>
      </div>
    </header>

    <dl className="market-data-acquisition-result-summary">
      <div>
        <dt>{tt("appText.marketDataAcquisitionSourceLabel")}</dt>
        <dd>{sourceLabel}</dd>
      </div>
      <div>
        <dt>{tt("appText.marketDataAcquisitionSymbolsLabel")}</dt>
        <dd>
          {ttf("appText.marketDataAcquisitionResultInstrumentCountValue0", [
            instrumentCount,
          ])}
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

    <div className="market-data-acquisition-result-path">
      <span>{tt("appText.marketDataAcquisitionSavedPathLabel")}</span>
      <strong>{outputPath}</strong>
    </div>
  </section>
);
