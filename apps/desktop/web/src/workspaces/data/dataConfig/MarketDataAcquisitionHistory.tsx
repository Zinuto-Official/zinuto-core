// SPDX-License-Identifier: GPL-3.0-only

import type { MarketDataAcquisitionJobSummary } from "@/api";
import { Button } from "@/ui/primitives/button";
import {
  resolveMarketDataAcquisitionErrorMessageKey,
  readMarketDataAcquisitionValidationDetail,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";
import { marketAcquisitionMarketLabelKey } from "@/workspaces/data/dataConfig/marketAcquisitionPresentation";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;

type MarketDataAcquisitionHistoryProps = {
  jobs: MarketDataAcquisitionJobSummary[];
  loading: boolean;
  locale: string;
  tt: Translate;
  ttf: TranslateFormatted;
  onRemove: (jobId: string) => void;
  onResume: (job: MarketDataAcquisitionJobSummary) => void;
};

const historyStatusKey = (
  status: MarketDataAcquisitionJobSummary["status"],
): string => {
  switch (status) {
    case "QUEUED":
      return "appText.marketDataAcquisitionStageQueued";
    case "RUNNING":
      return "appText.marketDataAcquisitionRunningTitle";
    case "READY_TO_SAVE":
      return "appText.marketDataAcquisitionReadyToSaveTitle";
    case "CANCELED":
      return "appText.marketDataAcquisitionCanceledTitle";
    default:
      return "appText.marketDataAcquisitionFailedTitle";
  }
};

export const MarketDataAcquisitionHistory = ({
  jobs,
  loading,
  locale,
  tt,
  ttf,
  onRemove,
  onResume,
}: MarketDataAcquisitionHistoryProps) => (
  <section
    className="market-data-acquisition-history"
    aria-busy={loading}
  >
    <h2 className="market-data-acquisition-history-title">
      {tt("appText.marketDataAcquisitionHistoryTitle")}
    </h2>
    {jobs.length === 0 ? (
      <p className="market-data-acquisition-history-empty">
        {loading
          ? tt("appText.marketDataAcquisitionStageConnecting")
          : tt("appText.marketDataAcquisitionHistoryEmpty")}
      </p>
    ) : (
      <ul className="market-data-acquisition-history-list">
        {jobs.map((entry) => {
          const errorKey = entry.error
            ? resolveMarketDataAcquisitionErrorMessageKey(
                entry.error.code,
                entry.error.args,
              )
            : null;
          const errorDetail = entry.error
            ? readMarketDataAcquisitionValidationDetail(
                entry.error.code,
                entry.error.args,
              )
            : null;
          return (
            <li
              key={entry.id}
              className="market-data-acquisition-history-item"
            >
              <div className="market-data-acquisition-history-item-head">
                <strong>
                  {tt(marketAcquisitionMarketLabelKey(entry.marketId))}
                </strong>
                <span
                  className="market-data-acquisition-history-status"
                  data-status={entry.status.toLowerCase()}
                >
                  {tt(historyStatusKey(entry.status))}
                </span>
              </div>
              <p className="market-data-acquisition-history-meta">
                <span>
                  {ttf(
                    "appText.marketDataAcquisitionHistorySymbolsLabel",
                    [entry.symbolCount],
                  )}
                </span>
                <span>{entry.timeframe}</span>
                <span>
                  {ttf(
                    "appText.marketDataAcquisitionHistoryUpdatedLabel",
                    [new Date(entry.updatedAt).toLocaleString(locale)],
                  )}
                </span>
              </p>
              {errorKey ? (
                <p
                  className="market-data-acquisition-history-error"
                  role="status"
                >
                  {tt(errorKey)}
                  {errorDetail
                    ? ` ${ttf(errorDetail.key, errorDetail.params)}`
                    : ""}
                </p>
              ) : null}
              <div className="market-data-acquisition-history-actions">
                {entry.status === "RUNNING" ||
                entry.status === "QUEUED" ||
                entry.status === "READY_TO_SAVE" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onResume(entry)}
                  >
                    {tt(
                      entry.status === "READY_TO_SAVE"
                        ? "appText.marketDataAcquisitionHistoryResumeSave"
                        : "appText.marketDataAcquisitionHistoryResume",
                    )}
                  </Button>
                ) : null}
                {entry.status === "FAILED" ||
                entry.status === "CANCELED" ||
                entry.status === "READY_TO_SAVE" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(entry.id)}
                  >
                    {tt("appText.marketDataAcquisitionHistoryRemove")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
