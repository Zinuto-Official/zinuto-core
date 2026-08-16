// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  hasApiErrorCode,
  type MarketDataAcquisitionInstrument,
  type MarketDataAcquisitionInstrumentCatalog,
  type MarketDataAcquisitionMarket,
  type MarketDataAcquisitionSourcePlanId,
} from "@/api";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { Spinner } from "@/ui/primitives/loading";
import { MARKET_DATA_ACQUISITION_MAX_SYMBOLS } from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;
type CacheState = MarketDataAcquisitionInstrumentCatalog["cacheState"];

type MarketAcquisitionInstrumentPickerProps = {
  describedBy?: string;
  disabled: boolean;
  invalid?: boolean;
  locale: string;
  market: MarketDataAcquisitionMarket;
  sourcePlanId: MarketDataAcquisitionSourcePlanId;
  value: MarketDataAcquisitionInstrument[];
  onValuesChange: (value: MarketDataAcquisitionInstrument[]) => void;
  tt: Translate;
  ttf: TranslateFormatted;
};

type LoadTrigger = {
  revision: number;
  forceRefresh: boolean;
};

type DirectoryLoadMode = "INITIAL" | "SEARCH" | "REFRESH" | "MORE";

const SEARCH_DEBOUNCE_MS = 200;
const DIRECTORY_LOAD_TIMEOUT_MS = 60_000;
const DIRECTORY_LOAD_COUNTDOWN_INTERVAL_MS = 1_000;
const DIRECTORY_LOAD_TIMEOUT_ERROR_CODE = "BACKEND_HTTP_REQUEST_TIMEOUT";

export const MarketAcquisitionInstrumentPicker = ({
  describedBy,
  disabled,
  invalid = false,
  locale,
  market,
  sourcePlanId,
  value,
  onValuesChange,
  tt,
  ttf,
}: MarketAcquisitionInstrumentPickerProps) => {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MarketDataAcquisitionInstrument[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<CacheState | null>(null);
  const [hasLoadedCatalog, setHasLoadedCatalog] = useState(false);
  const [loadMode, setLoadMode] = useState<DirectoryLoadMode | null>(
    "INITIAL",
  );
  const [directoryLoadSecondsRemaining, setDirectoryLoadSecondsRemaining] =
    useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [loadTrigger, setLoadTrigger] = useState<LoadTrigger>({
    revision: 0,
    forceRefresh: false,
  });
  const requestVersion = useRef(0);
  const activeRequestController = useRef<AbortController | null>(null);
  const hasLoadedCatalogRef = useRef(false);

  const selectedSymbols = useMemo(
    () => new Set(value.map((instrument) => instrument.symbol)),
    [value],
  );
  const dynamicCatalog = cacheState !== "BUNDLED";

  const loadPage = useCallback(
    async ({
      cursor,
      append,
      mode,
      requestedQuery,
      forceRefresh,
      controller,
    }: {
      cursor: string;
      append: boolean;
      mode: DirectoryLoadMode;
      requestedQuery: string;
      forceRefresh: boolean;
      controller: AbortController;
    }) => {
      const revision = requestVersion.current + 1;
      requestVersion.current = revision;
      const deadlineAt = Date.now() + DIRECTORY_LOAD_TIMEOUT_MS;
      const updateCountdown = () => {
        if (revision !== requestVersion.current) return;
        setDirectoryLoadSecondsRemaining(
          Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1_000)),
        );
      };
      setLoadMode(mode);
      setLoadFailed(false);
      setLoadTimedOut(false);
      updateCountdown();
      const countdown = window.setInterval(
        updateCountdown,
        DIRECTORY_LOAD_COUNTDOWN_INTERVAL_MS,
      );
      try {
        const result = await api.listMarketDataAcquisitionMarketInstruments(
          market.id,
          {
            sourcePlanId,
            query: requestedQuery,
            cursor,
            refresh: forceRefresh,
          },
          {
            signal: controller.signal,
            timeoutMs: DIRECTORY_LOAD_TIMEOUT_MS,
          },
        );
        if (revision !== requestVersion.current || controller.signal.aborted) {
          return;
        }
        hasLoadedCatalogRef.current = true;
        setHasLoadedCatalog(true);
        setItems((current) =>
          append
            ? [
                ...current,
                ...result.instruments.filter(
                  (entry) =>
                    !current.some((item) => item.symbol === entry.symbol),
                ),
              ]
            : result.instruments,
        );
        setNextCursor(result.nextCursor);
        setCachedAt(result.cachedAt);
        setCacheState(result.cacheState);
      } catch (error) {
        if (!controller.signal.aborted && revision === requestVersion.current) {
          setLoadFailed(true);
          setLoadTimedOut(
            hasApiErrorCode(error, DIRECTORY_LOAD_TIMEOUT_ERROR_CODE),
          );
        }
      } finally {
        window.clearInterval(countdown);
        if (revision === requestVersion.current) {
          setLoadMode(null);
          setDirectoryLoadSecondsRemaining(null);
        }
      }
    },
    [market.id, sourcePlanId],
  );

  useEffect(() => {
    const hasPreviousResult = hasLoadedCatalogRef.current;
    const mode: DirectoryLoadMode = hasPreviousResult
      ? loadTrigger.forceRefresh
        ? "REFRESH"
        : "SEARCH"
      : "INITIAL";
    requestVersion.current += 1;
    activeRequestController.current?.abort();
    const controller = new AbortController();
    activeRequestController.current = controller;
    const requestedQuery = query.trim();
    setLoadMode(mode);
    setLoadFailed(false);
    setLoadTimedOut(false);
    setDirectoryLoadSecondsRemaining(null);
    const timeout = window.setTimeout(
      () => {
        void loadPage({
          cursor: "",
          append: false,
          mode,
          requestedQuery,
          forceRefresh: loadTrigger.forceRefresh,
          controller,
        });
      },
      requestedQuery ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      window.clearTimeout(timeout);
      requestVersion.current += 1;
      controller.abort();
      if (activeRequestController.current === controller) {
        activeRequestController.current = null;
      }
    };
  }, [loadPage, loadTrigger, query]);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      activeRequestController.current?.abort();
    },
    [],
  );

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setLoadTrigger((current) => ({
      revision: current.revision + 1,
      forceRefresh: false,
    }));
  };

  const requestRefresh = () => {
    setLoadTrigger((current) => ({
      revision: current.revision + 1,
      forceRefresh: true,
    }));
  };

  const loadMore = () => {
    if (!nextCursor || loadMode) return;
    requestVersion.current += 1;
    activeRequestController.current?.abort();
    const controller = new AbortController();
    activeRequestController.current = controller;
    setLoadMode("MORE");
    setLoadFailed(false);
    setLoadTimedOut(false);
    setDirectoryLoadSecondsRemaining(null);
    void loadPage({
      cursor: nextCursor,
      append: true,
      mode: "MORE",
      requestedQuery: query.trim(),
      forceRefresh: false,
      controller,
    }).finally(() => {
      if (activeRequestController.current === controller) {
        activeRequestController.current = null;
      }
    });
  };

  const toggle = (instrument: MarketDataAcquisitionInstrument) => {
    if (disabled) return;
    if (selectedSymbols.has(instrument.symbol)) {
      onValuesChange(
        value.filter((entry) => entry.symbol !== instrument.symbol),
      );
      return;
    }
    if (value.length < MARKET_DATA_ACQUISITION_MAX_SYMBOLS) {
      onValuesChange([...value, instrument]);
    }
  };

  const formattedUpdatedAt = useMemo(
    () =>
      cachedAt
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(cachedAt))
        : "",
    [cachedAt, locale],
  );
  const isStale = cacheState === "STALE" || (loadFailed && items.length > 0);
  const catalogLoading = loadMode !== null;
  const initialCatalogLoading = loadMode === "INITIAL" && !hasLoadedCatalog;
  const showRefresh = dynamicCatalog && !catalogLoading;
  const statusMessage = catalogLoading
    ? directoryLoadSecondsRemaining === null
      ? loadMode === "SEARCH"
        ? tt("appText.marketDataAcquisitionCatalogSearching")
        : loadMode === "REFRESH"
          ? tt("appText.marketDataAcquisitionCatalogRefreshing")
          : tt("appText.marketDataAcquisitionInstrumentCatalogLoading")
      : ttf(
          "appText.marketDataAcquisitionInstrumentCatalogLoadingCountdownValue0",
          [directoryLoadSecondsRemaining],
        )
    : loadTimedOut
      ? items.length > 0
        ? tt("appText.marketDataAcquisitionCatalogLoadTimedOutUsingPrevious")
        : tt("appText.marketDataAcquisitionCatalogLoadTimedOut")
      : isStale
        ? tt("appText.marketDataAcquisitionCatalogRefreshFailedUsingCache")
        : loadFailed
          ? tt("appText.marketDataAcquisitionInstrumentsLoadFailed")
          : dynamicCatalog && formattedUpdatedAt
            ? ttf("appText.marketDataAcquisitionCatalogCachedAtValue0", [
                formattedUpdatedAt,
              ])
            : "";
  const statusVisible = Boolean(statusMessage || showRefresh);

  return (
    <div
      className="market-data-acquisition-market-picker"
      aria-invalid={invalid || (loadFailed && !items.length) || undefined}
      aria-describedby={describedBy}
      aria-busy={catalogLoading || undefined}
    >
      <div className="market-data-acquisition-catalog-controls">
        <div className="market-data-acquisition-market-search">
          <Input
            type="search"
            value={query}
            disabled={disabled}
            maxLength={64}
            placeholder={tt(
              "appText.marketDataAcquisitionInstrumentSearchPlaceholder",
            )}
            aria-label={tt(
              "appText.marketDataAcquisitionInstrumentSearchLabel",
            )}
            aria-controls="market-data-acquisition-market-instrument-results"
            onChange={(event) => updateQuery(event.target.value)}
          />
        </div>
      </div>

      <div
        className="market-data-acquisition-catalog-cache-status"
        data-visible={statusVisible ? "true" : "false"}
        data-tone={isStale || loadFailed || loadTimedOut ? "warning" : "neutral"}
        role="status"
        aria-live="polite"
      >
        <span>
          <span className="market-data-acquisition-catalog-status-spinner">
            {catalogLoading ? <Spinner decorative size="sm" /> : null}
          </span>
          <span>{statusMessage}</span>
        </span>
        {showRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={requestRefresh}
          >
            {loadFailed && !items.length
              ? tt("appText.marketDataAcquisitionCatalogRetry")
              : tt("appText.marketDataAcquisitionCatalogRefresh")}
          </Button>
        ) : null}
      </div>

      <div className="market-data-acquisition-catalog-columns">
        <section
          className="market-data-acquisition-catalog-panel"
          aria-labelledby="market-data-acquisition-market-instrument-candidates-title"
        >
          <header>
            <strong id="market-data-acquisition-market-instrument-candidates-title">
              {cacheState === "BUNDLED"
                ? tt("appText.marketDataAcquisitionAvailablePresets")
                : tt("appText.marketDataAcquisitionAvailableInstruments")}
            </strong>
            <span>{items.length}</span>
          </header>
          <div
            id="market-data-acquisition-market-instrument-results"
            className="market-data-acquisition-catalog-list"
            role="group"
            aria-label={tt("appText.marketDataAcquisitionAvailableInstruments")}
            aria-busy={catalogLoading || undefined}
          >
            <div className="market-data-acquisition-catalog-results">
              {loadFailed && !items.length ? (
                <span
                  className="market-data-acquisition-market-message"
                  role="alert"
                >
                  {tt("appText.marketDataAcquisitionInstrumentsLoadFailed")}
                </span>
              ) : initialCatalogLoading ? (
                <span className="market-data-acquisition-market-message">
                  {statusMessage}
                </span>
              ) : !items.length ? (
                <span className="market-data-acquisition-market-message">
                  {tt("appText.marketDataAcquisitionNoInstrumentsFound")}
                </span>
              ) : (
                items.map((instrument) => {
                  const selected = selectedSymbols.has(instrument.symbol);
                  return (
                    <label
                      className="market-data-acquisition-catalog-option"
                      key={instrument.symbol}
                      title={`${instrument.symbol} ${instrument.name}`}
                    >
                      <Checkbox
                        checked={selected}
                        disabled={
                          disabled ||
                          (!selected &&
                            value.length >= MARKET_DATA_ACQUISITION_MAX_SYMBOLS)
                        }
                        onChange={() => toggle(instrument)}
                      />
                      <span>
                        <strong>{instrument.symbol}</strong>
                        <small>{instrument.name}</small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          {nextCursor ? (
            <div className="market-data-acquisition-catalog-load-more">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || catalogLoading}
                onClick={loadMore}
              >
                {loadMode === "MORE" ? <Spinner decorative size="sm" /> : null}
                {tt("appText.marketDataAcquisitionLoadMore")}
              </Button>
            </div>
          ) : null}
        </section>

        <section
          className="market-data-acquisition-catalog-panel"
          aria-labelledby="market-data-acquisition-selected-instruments-title"
        >
          <header>
            <strong id="market-data-acquisition-selected-instruments-title">
              {tt("appText.marketDataAcquisitionSelectedInstruments")}
            </strong>
            <span>
              {ttf("appText.marketDataAcquisitionSelectedCountValue0Value1", [
                value.length,
                MARKET_DATA_ACQUISITION_MAX_SYMBOLS,
              ])}
            </span>
          </header>
          <div className="market-data-acquisition-selected-list">
            {!value.length ? (
              <span className="market-data-acquisition-market-message">
                {tt("appText.marketDataAcquisitionNoInstrumentsSelected")}
              </span>
            ) : (
              value.map((instrument) => (
                <div
                  className="market-data-acquisition-selected-item"
                  key={instrument.symbol}
                  title={`${instrument.symbol} ${instrument.name}`}
                >
                  <span>
                    <strong>{instrument.symbol}</strong>
                    <small>{instrument.name}</small>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => toggle(instrument)}
                  >
                    {tt("appText.marketDataAcquisitionRemoveInstrument")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
