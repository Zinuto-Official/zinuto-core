// SPDX-License-Identifier: GPL-3.0-only

import { DESKTOP_LOCAL_API_ROUTES } from "@zinuto/shared/contracts-desktop/http-api";

export type ApiInFlightGetCoalescingInput = {
  method: string;
  path: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  hasExternalSignal: boolean;
};

export const API_IN_FLIGHT_GET_COALESCING_MAX_ENTRIES = 64;

export const isApiInFlightGetCoalescingAllowedPath = (path: string): boolean => {
  const normalizedPath = String(path || "").trim();
  const pathname = normalizedPath.split("?")[0] ?? "";
  // System settings — safe to coalesce (stable between mutations)
  if (
    pathname === DESKTOP_LOCAL_API_ROUTES.marketInstruments ||
    pathname === "/api/v1/system/app-preferences" ||
    pathname === "/api/v1/system/startup-status" ||
    pathname === "/api/v1/system/storage-usage" ||
    pathname === DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySettingsTrading ||
    pathname === DESKTOP_LOCAL_API_ROUTES.dataSources ||
    pathname === "/api/v1/system/dev-simulation/capabilities"
  ) {
    return true;
  }
  // Market data bars — safe to coalesce (immutable historical data)
  // Training stats — safe to coalesce (aggregate, infrequent updates)
  return (
    /^\/api\/v1\/market\/instruments\/[^/]+\/bars\/frame$/u.test(pathname) ||
    /^\/api\/v1\/market\/instruments\/[^/]+\/bars\/range$/u.test(pathname) ||
    pathname === DESKTOP_LOCAL_API_ROUTES.trainingFreeReplayStartPointOverview ||
    pathname === "/api/v1/training/stats" ||
    pathname === "/api/v1/training/stats/summary" ||
    pathname === "/api/v1/training/special/stats" ||
    pathname === "/api/v1/training/special/stats/summary"
  );
};

const stableHeaderEntries = (
  headers: Record<string, string>,
): Array<[string, string]> =>
  Object.entries(headers)
    .map(([key, value]) => [key.trim().toLowerCase(), String(value)] as [string, string])
    .filter(([key]) => Boolean(key))
    .sort(([left], [right]) => left.localeCompare(right));

export const resolveApiInFlightGetCoalescingKey = (
  input: ApiInFlightGetCoalescingInput,
): string | null => {
  const method = String(input.method || "GET").trim().toUpperCase();
  if (method !== "GET" || input.hasExternalSignal || input.body.length > 0) {
    return null;
  }
  const path = String(input.path || "").trim();
  if (!isApiInFlightGetCoalescingAllowedPath(path)) {
    return null;
  }
  return JSON.stringify({
    method,
    path,
    headers: stableHeaderEntries(input.headers),
    timeoutMs: input.timeoutMs,
  });
};

export const resolveApiGetResponseCacheTtlMs = (path: string): number => {
  const pathname = String(path || "").trim().split("?")[0] ?? "";

  // Acquisition directories own their seven-day cache in the local runtime.
  // Keep this browser response uncached so refresh=true always reaches it.
  if (
    /^\/api\/v1\/data-sources\/acquisition-markets\/[^/]+\/instruments$/u.test(
      pathname,
    )
  ) {
    return 0;
  }
  if (
    pathname === "/api/v1/training/stats/summary" ||
    pathname === "/api/v1/training/special/stats/summary"
  ) {
    return 30_000;
  }
  // Instruments list — changes rarely
  if (pathname === DESKTOP_LOCAL_API_ROUTES.marketInstruments) {
    return 30_000;
  }
  // App preferences — changes rarely
  if (pathname === "/api/v1/system/app-preferences") {
    return 15_000;
  }
  // System startup status — stable after initial load
  if (pathname === "/api/v1/system/startup-status") {
    return 60_000;
  }
  // Storage usage owns freshness in the backend SWR. A response TTL here can
  // pin the initial WARMING snapshot and prevent its bounded follow-up read.
  // Trading settings — changes infrequently
  if (pathname === DESKTOP_LOCAL_API_ROUTES.trainingFreeReplaySettingsTrading) {
    return 15_000;
  }
  // Data sources — no response cache (status changes during import/sync)
  return 0;
};

export const trimApiInFlightGetCoalescingMap = <T>(
  map: Map<string, T>,
  maxEntries = API_IN_FLIGHT_GET_COALESCING_MAX_ENTRIES,
): void => {
  while (map.size > maxEntries) {
    const firstKey = map.keys().next().value as string | undefined;
    if (!firstKey) {
      return;
    }
    map.delete(firstKey);
  }
};
