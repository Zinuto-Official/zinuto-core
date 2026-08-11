// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import type {
  DesktopAkshareAcquisitionInstrument,
  DesktopAkshareAcquisitionInstrumentCatalog,
  DesktopCcxtAcquisitionMarketCatalog,
  DesktopMarketDataAcquisitionConnectorCatalog,
  DesktopMarketDataAcquisitionJob,
  DesktopMarketDataAcquisitionJobCreateRequest,
} from "@zinuto/shared/contracts-desktop/api";

export type MarketDataAcquisitionConnectorCatalog =
  DesktopMarketDataAcquisitionConnectorCatalog;
export type MarketDataAcquisitionConnector =
  MarketDataAcquisitionConnectorCatalog["connectors"][number];
export type MarketDataAcquisitionConnectorId =
  MarketDataAcquisitionConnector["id"];
export type MarketDataAcquisitionTimeframe =
  MarketDataAcquisitionConnector["supportedTimeframes"][number];
export type MarketDataAcquisitionRequest =
  DesktopMarketDataAcquisitionJobCreateRequest;
export type MarketDataAcquisitionJob = DesktopMarketDataAcquisitionJob;
export type MarketDataAcquisitionJobStatus = MarketDataAcquisitionJob["status"];
export type MarketDataAcquisitionJobStage =
  MarketDataAcquisitionJob["progress"]["stage"];
export type CcxtAcquisitionMarketCatalog = DesktopCcxtAcquisitionMarketCatalog;
export type CcxtAcquisitionMarket =
  CcxtAcquisitionMarketCatalog["markets"][number];
export type AkshareAcquisitionInstrumentCatalog =
  DesktopAkshareAcquisitionInstrumentCatalog;
export type AkshareAcquisitionInstrument =
  DesktopAkshareAcquisitionInstrument;

export const createMarketDataAcquisitionApi = (request: ApiRequester) => ({
  listMarketDataAcquisitionConnectors: (options?: ApiRequestOptions) =>
    request<MarketDataAcquisitionConnectorCatalog>(
      "/api/v1/data-sources/acquisition-connectors",
      options,
    ),
  listAkshareAcquisitionInstruments: (options?: ApiRequestOptions) =>
    request<AkshareAcquisitionInstrumentCatalog>(
      "/api/v1/data-sources/acquisition-connectors/akshare/instruments",
      options,
    ),
  listCcxtAcquisitionMarkets: (
    exchangeId: "binance" | "okx",
    query = "",
    options?: ApiRequestOptions,
  ) => {
    const search = new URLSearchParams({ exchangeId });
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery) {
      search.set("query", normalizedQuery);
    }
    return request<CcxtAcquisitionMarketCatalog>(
      `/api/v1/data-sources/acquisition-connectors/ccxt/markets?${search.toString()}`,
      options,
    );
  },
  createMarketDataAcquisitionJob: (
    payload: MarketDataAcquisitionRequest,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionJob>(
      "/api/v1/data-sources/acquisition-jobs",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  getMarketDataAcquisitionJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionJob>(
      `/api/v1/data-sources/acquisition-jobs/${encodeURIComponent(jobId)}`,
      options,
    ),
  cancelMarketDataAcquisitionJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionJob>(
      `/api/v1/data-sources/acquisition-jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({}),
        ...options,
      },
    ),
  discardMarketDataAcquisitionJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<{ discarded: true }>(
      `/api/v1/data-sources/acquisition-jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        ...options,
      },
    ),
});
