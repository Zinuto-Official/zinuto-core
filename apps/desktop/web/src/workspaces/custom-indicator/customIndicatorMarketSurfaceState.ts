// SPDX-License-Identifier: GPL-3.0-only

import type {
  CatalogLoadState,
  MarketLoadState,
} from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";

export type CustomIndicatorMarketSurfaceState =
  | "loading"
  | "empty"
  | "error"
  | "ready";

export const resolveCustomIndicatorMarketSurfaceState = ({
  catalogLoadState,
  marketLoadState,
  hasMarketData,
}: {
  catalogLoadState: CatalogLoadState;
  marketLoadState: MarketLoadState;
  hasMarketData: boolean;
}): CustomIndicatorMarketSurfaceState => {
  if (catalogLoadState === "error" || marketLoadState === "error") {
    return "error";
  }
  if (
    catalogLoadState === "idle" ||
    catalogLoadState === "loading" ||
    marketLoadState === "loading"
  ) {
    return "loading";
  }
  if (marketLoadState !== "ready" || !hasMarketData) {
    return "empty";
  }
  return "ready";
};
