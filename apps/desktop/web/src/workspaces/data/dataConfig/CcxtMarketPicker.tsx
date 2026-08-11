// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useState } from "react";
import { api, type CcxtAcquisitionMarket } from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { Spinner } from "@/ui/primitives/loading";
import { useMarketDataCatalog } from "@/workspaces/data/dataConfig/marketDataAcquisitionCache";
import { MARKET_DATA_ACQUISITION_MAX_SYMBOLS } from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";

type CcxtMarketPickerProps = {
  disabled: boolean;
  exchangeId: "binance" | "okx";
  locale: string;
  onValuesChange: (symbols: string[]) => void;
  symbols: string[];
  invalid?: boolean;
  describedBy?: string;
  tt: (key: string) => string;
  ttf: (key: string, values?: Array<unknown>) => string;
};

const VISIBLE_RESULTS_LIMIT = 80;
const POPULAR_MARKETS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "DOGE/USDT",
  "BTC/USDC",
  "ETH/USDC",
] as const;

type MarketFilter = "POPULAR" | "USDT" | "USDC" | "ALL";

const isCcxtMarket = (value: unknown): value is CcxtAcquisitionMarket => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const market = value as Record<string, unknown>;
  return (
    typeof market.symbol === "string" &&
    market.symbol.length >= 3 &&
    market.symbol.length <= 64 &&
    typeof market.base === "string" &&
    market.base.length > 0 &&
    typeof market.quote === "string" &&
    market.quote.length > 0 &&
    market.active === true
  );
};

export const CcxtMarketPicker = ({
  disabled,
  exchangeId,
  invalid = false,
  describedBy,
  locale,
  onValuesChange,
  symbols,
  tt,
  ttf,
}: CcxtMarketPickerProps) => {
  const [query, setQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("POPULAR");
  const loadCatalog = useCallback(
    async (signal: AbortSignal) => {
      const result = await api.listCcxtAcquisitionMarkets(exchangeId, "", {
        signal,
      });
      return Array.isArray(result.markets)
        ? result.markets.filter((market) => market.active === true)
        : [];
    },
    [exchangeId],
  );
  const {
    items: markets,
    loadFailed,
    loading,
    refresh,
    refreshing,
    updatedAt,
  } = useMarketDataCatalog({
    cacheId: exchangeId === "binance" ? "ccxt-binance" : "ccxt-okx",
    isItem: isCcxtMarket,
    load: loadCatalog,
  });
  const selectedSet = useMemo(() => new Set(symbols), [symbols]);
  const normalizedQuery = query.trim().toLocaleUpperCase();
  const marketBySymbol = useMemo(
    () => new Map(markets.map((market) => [market.symbol, market])),
    [markets],
  );
  const visibleMarkets = useMemo(() => {
    const popularity = new Map<string, number>(
      POPULAR_MARKETS.map((symbol, index) => [symbol, index]),
    );
    return markets
      .filter((market) => {
        if (
          normalizedQuery &&
          !market.symbol.toLocaleUpperCase().includes(normalizedQuery) &&
          !market.base.toLocaleUpperCase().includes(normalizedQuery) &&
          !market.quote.toLocaleUpperCase().includes(normalizedQuery)
        ) {
          return false;
        }
        if (normalizedQuery) return true;
        if (marketFilter === "POPULAR") {
          return popularity.has(market.symbol);
        }
        if (marketFilter === "USDT" || marketFilter === "USDC") {
          return market.quote === marketFilter;
        }
        return true;
      })
      .sort((left, right) => {
        const leftRank = popularity.get(left.symbol) ?? Number.MAX_SAFE_INTEGER;
        const rightRank =
          popularity.get(right.symbol) ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || left.symbol.localeCompare(right.symbol);
      })
      .slice(0, VISIBLE_RESULTS_LIMIT);
  }, [marketFilter, markets, normalizedQuery]);

  const toggleSymbol = (symbol: string) => {
    if (disabled) return;
    if (selectedSet.has(symbol)) {
      onValuesChange(symbols.filter((item) => item !== symbol));
      return;
    }
    if (symbols.length < MARKET_DATA_ACQUISITION_MAX_SYMBOLS) {
      onValuesChange([...symbols, symbol]);
    }
  };

  const selectionCountLabel = ttf(
    "appText.marketDataAcquisitionSelectedCountValue0Value1",
    [symbols.length, MARKET_DATA_ACQUISITION_MAX_SYMBOLS],
  );
  const updatedAtLabel = useMemo(
    () =>
      updatedAt
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(updatedAt))
        : "",
    [locale, updatedAt],
  );

  return (
    <div
      className="market-data-acquisition-market-picker"
      aria-invalid={invalid || (loadFailed && !markets.length) || undefined}
      aria-describedby={describedBy}
      aria-busy={loading || refreshing || undefined}
    >
      <div className="market-data-acquisition-catalog-controls">
        <div className="market-data-acquisition-market-search">
          <Input
            type="search"
            value={query}
            disabled={disabled}
            maxLength={64}
            placeholder={tt(
              "appText.marketDataAcquisitionMarketSearchPlaceholder",
            )}
            aria-label={tt("appText.marketDataAcquisitionMarketSearchLabel")}
            aria-controls="market-data-acquisition-ccxt-results"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div
          className="market-data-acquisition-market-filters"
          role="group"
          aria-label={tt("appText.marketDataAcquisitionMarketFilterLabel")}
        >
          {(
            [
              ["POPULAR", "appText.marketDataAcquisitionMarketFilterPopular"],
              ["USDT", "appText.marketDataAcquisitionMarketFilterUsdt"],
              ["USDC", "appText.marketDataAcquisitionMarketFilterUsdc"],
              ["ALL", "appText.marketDataAcquisitionMarketFilterAll"],
            ] as const
          ).map(([value, labelKey]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={marketFilter === value ? "secondary" : "outline"}
              className="market-data-acquisition-market-filter"
              data-state={marketFilter === value ? "selected" : "unselected"}
              aria-pressed={marketFilter === value}
              disabled={disabled}
              onClick={() => setMarketFilter(value)}
            >
              {tt(labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div
        className="market-data-acquisition-catalog-cache-status"
        data-tone={loadFailed ? "warning" : "neutral"}
        role="status"
        aria-live="polite"
      >
        <span>
          {loading || refreshing ? <Spinner decorative size="sm" /> : null}
          {ttf(
            loading
              ? "appText.marketDataAcquisitionCatalogLoading"
              : refreshing
                ? "appText.marketDataAcquisitionCatalogRefreshing"
                : loadFailed && markets.length
                  ? "appText.marketDataAcquisitionCatalogRefreshFailedUsingCache"
                  : loadFailed
                    ? "appText.marketDataAcquisitionMarketsLoadFailed"
                    : "appText.marketDataAcquisitionCatalogCachedAtValue0",
            updatedAtLabel ? [updatedAtLabel] : [],
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || loading || refreshing}
          onClick={() => void refresh()}
        >
          {tt(
            loadFailed && !markets.length
              ? "appText.marketDataAcquisitionCatalogRetry"
              : "appText.marketDataAcquisitionCatalogRefresh",
          )}
        </Button>
      </div>

      <div
        className="market-data-acquisition-catalog-columns"
        data-search-all-markets={normalizedQuery ? "true" : undefined}
      >
        <section
          className="market-data-acquisition-catalog-panel"
          aria-labelledby="market-data-acquisition-market-candidates-title"
        >
          <header>
            <strong id="market-data-acquisition-market-candidates-title">
              {tt("appText.marketDataAcquisitionAvailableMarkets")}
            </strong>
            <span>{visibleMarkets.length}</span>
          </header>
          <div
            id="market-data-acquisition-ccxt-results"
            className="market-data-acquisition-catalog-list"
            role="group"
            aria-label={tt("appText.marketDataAcquisitionAvailableMarkets")}
          >
            {loadFailed && !markets.length ? (
              <span
                className="market-data-acquisition-market-message"
                role="alert"
              >
                {tt("appText.marketDataAcquisitionMarketsLoadFailed")}
              </span>
            ) : !loading && visibleMarkets.length === 0 ? (
              <span className="market-data-acquisition-market-message">
                {tt("appText.marketDataAcquisitionNoMarketsFound")}
              </span>
            ) : (
              visibleMarkets.map((market) => {
                const selected = selectedSet.has(market.symbol);
                return (
                  <label
                    key={market.symbol}
                    className="market-data-acquisition-catalog-option"
                    data-selected={selected || undefined}
                  >
                    <Checkbox
                      checked={selected}
                      disabled={
                        disabled ||
                        (!selected &&
                          symbols.length >= MARKET_DATA_ACQUISITION_MAX_SYMBOLS)
                      }
                      onChange={() => toggleSymbol(market.symbol)}
                    />
                    <span>
                      <strong>{market.symbol}</strong>
                      <small>
                        {ttf(
                          "appText.marketDataAcquisitionMarketBaseQuoteValue0Value1",
                          [market.base, market.quote],
                        )}
                      </small>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </section>

        <section
          className="market-data-acquisition-catalog-panel market-data-acquisition-selected-panel"
          aria-labelledby="market-data-acquisition-market-selected-title"
        >
          <header>
            <strong id="market-data-acquisition-market-selected-title">
              {tt("appText.marketDataAcquisitionSelectedMarkets")}
            </strong>
            <div>
              <span aria-live="polite">{selectionCountLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || symbols.length === 0}
                onClick={() => onValuesChange([])}
              >
                {tt("appText.marketDataAcquisitionClearAll")}
              </Button>
            </div>
          </header>
          <div className="market-data-acquisition-selected-list">
            {symbols.length === 0 ? (
              <span className="market-data-acquisition-market-message">
                {tt("appText.marketDataAcquisitionNoMarketsSelected")}
              </span>
            ) : (
              symbols.map((symbol) => {
                const market = marketBySymbol.get(symbol);
                return (
                  <div
                    key={symbol}
                    className="market-data-acquisition-selected-item"
                  >
                    <span>
                      <strong>{symbol}</strong>
                      {market ? (
                        <small>
                          {ttf(
                            "appText.marketDataAcquisitionMarketBaseQuoteValue0Value1",
                            [market.base, market.quote],
                          )}
                        </small>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled}
                      aria-label={ttf(
                        "appText.marketDataAcquisitionRemoveMarketValue0",
                        [symbol],
                      )}
                      onClick={() => toggleSymbol(symbol)}
                    >
                      <VendorIcon name="x" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
