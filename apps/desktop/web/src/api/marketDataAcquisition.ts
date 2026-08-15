// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import type {
  DesktopAkshareAcquisitionInstrument,
  DesktopAkshareAcquisitionInstrumentCatalog,
  DesktopCcxtAcquisitionMarketCatalog,
  DesktopMarketDataAcquisitionCatalog,
  DesktopMarketDataAcquisitionConnectorCatalog,
  DesktopMarketDataAcquisitionInstrumentCatalog,
  DesktopMarketDataAcquisitionJob,
  DesktopMarketDataAcquisitionJobCreateRequest,
  DesktopMarketDataAcquisitionJobList,
  DesktopMarketDataAcquisitionJobSummary,
  DesktopMarketDataAcquisitionMarketId,
  DesktopMarketDataAcquisitionMarketJob,
  DesktopMarketDataAcquisitionMarketJobCreateRequest,
  DesktopMarketDataAcquisitionSourcePlanId,
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
export type MarketDataAcquisitionCatalog = DesktopMarketDataAcquisitionCatalog;
export type MarketDataAcquisitionAssetClass =
  MarketDataAcquisitionCatalog["assetClasses"][number];
export type MarketDataAcquisitionMarket =
  MarketDataAcquisitionCatalog["markets"][number];
export type MarketDataAcquisitionMarketId = DesktopMarketDataAcquisitionMarketId;
export type MarketDataAcquisitionSourcePlanId =
  DesktopMarketDataAcquisitionSourcePlanId;
export type MarketDataAcquisitionInstrumentCatalog =
  DesktopMarketDataAcquisitionInstrumentCatalog;
export type MarketDataAcquisitionInstrument =
  MarketDataAcquisitionInstrumentCatalog["instruments"][number];
export type MarketDataAcquisitionMarketRequest =
  DesktopMarketDataAcquisitionMarketJobCreateRequest;
export type MarketDataAcquisitionMarketJob =
  DesktopMarketDataAcquisitionMarketJob;
export type MarketDataAcquisitionJobSummary =
  DesktopMarketDataAcquisitionJobSummary;
export type MarketDataAcquisitionJobList = DesktopMarketDataAcquisitionJobList;

export const createMarketDataAcquisitionApi = (request: ApiRequester) => ({
  listMarketDataAcquisitionCatalog: (options?: ApiRequestOptions) =>
    request<MarketDataAcquisitionCatalog>(
      "/api/v1/data-sources/acquisition-catalog",
      options,
    ),
  listMarketDataAcquisitionMarketInstruments: (
    marketId: MarketDataAcquisitionMarketId,
    input: {
      sourcePlanId?: MarketDataAcquisitionSourcePlanId | null;
      query?: string;
      cursor?: string;
      refresh?: boolean;
    } = {},
    options?: ApiRequestOptions,
  ) => {
    const search = new URLSearchParams();
    if (input.sourcePlanId) search.set("sourcePlanId", input.sourcePlanId);
    if (input.query?.trim()) search.set("query", input.query.trim());
    if (input.cursor) search.set("cursor", input.cursor);
    if (input.refresh) search.set("refresh", "true");
    const suffix = search.size ? `?${search.toString()}` : "";
    return request<MarketDataAcquisitionInstrumentCatalog>(
      `/api/v1/data-sources/acquisition-markets/${encodeURIComponent(marketId)}/instruments${suffix}`,
      options,
    );
  },
  createMarketDataAcquisitionMarketJob: (
    payload: MarketDataAcquisitionMarketRequest,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionMarketJob>(
      "/api/v1/data-sources/acquisition-market-jobs",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  getMarketDataAcquisitionMarketJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionMarketJob>(
      `/api/v1/data-sources/acquisition-market-jobs/${encodeURIComponent(jobId)}`,
      options,
    ),
  listMarketDataAcquisitionMarketJobs: (options?: ApiRequestOptions) =>
    request<MarketDataAcquisitionJobList>(
      "/api/v1/data-sources/acquisition-market-jobs",
      options,
    ),
  cancelMarketDataAcquisitionMarketJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<MarketDataAcquisitionMarketJob>(
      `/api/v1/data-sources/acquisition-market-jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({}),
        ...options,
      },
    ),
  discardMarketDataAcquisitionMarketJob: (
    jobId: string,
    options?: ApiRequestOptions,
  ) =>
    request<{ discarded: true }>(
      `/api/v1/data-sources/acquisition-market-jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        ...options,
      },
    ),
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
