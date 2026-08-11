// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo, useState } from "react";
import { api, type AkshareAcquisitionInstrument } from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { Spinner } from "@/ui/primitives/loading";
import { useMarketDataCatalog } from "@/workspaces/data/dataConfig/marketDataAcquisitionCache";
import { MARKET_DATA_ACQUISITION_MAX_SYMBOLS } from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;
type AkshareInstrumentKind = "A_SHARE" | "INDEX";

type AkshareInstrumentPickerProps = {
  describedBy?: string;
  disabled: boolean;
  invalid?: boolean;
  kind: AkshareInstrumentKind;
  locale: string;
  onKindChange: (kind: AkshareInstrumentKind) => void;
  onValuesChange: (symbols: string[]) => void;
  symbols: string[];
  tt: Translate;
  ttf: TranslateFormatted;
};

const resolveExchangeLabel = (tt: Translate, exchangeId: string): string => {
  const key = `appText.marketDataAcquisitionExchange${String(
    exchangeId || "",
  ).trim()}`;
  const label = tt(key);
  if (!label || label === key) {
    return tt("appText.marketDataAcquisitionExchangeLabel");
  }
  return label;
};

const isAkshareInstrument = (
  value: unknown,
): value is AkshareAcquisitionInstrument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const instrument = value as Record<string, unknown>;
  return (
    typeof instrument.symbol === "string" &&
    /^(?:[0-9]{6}|INDEX-[0-9]{6})$/u.test(instrument.symbol) &&
    typeof instrument.name === "string" &&
    instrument.name.length > 0 &&
    ["SH", "SZ", "BJ"].includes(String(instrument.exchangeId)) &&
    ["A_SHARE", "INDEX"].includes(String(instrument.kind))
  );
};

export const AkshareInstrumentPicker = ({
  describedBy,
  disabled,
  invalid = false,
  kind,
  locale,
  onKindChange,
  onValuesChange,
  symbols,
  tt,
  ttf,
}: AkshareInstrumentPickerProps) => {
  const [query, setQuery] = useState("");
  const loadCatalog = useCallback(async (signal: AbortSignal) => {
    const result = await api.listAkshareAcquisitionInstruments({ signal });
    return Array.isArray(result.instruments) ? result.instruments : [];
  }, []);
  const {
    items: instruments,
    loadFailed,
    loading,
    refresh,
    refreshing,
    updatedAt,
  } = useMarketDataCatalog({
    cacheId: "akshare",
    isItem: isAkshareInstrument,
    load: loadCatalog,
  });
  const selectedSet = useMemo(() => new Set(symbols), [symbols]);
  const instrumentBySymbol = useMemo(
    () =>
      new Map(instruments.map((instrument) => [instrument.symbol, instrument])),
    [instruments],
  );
  const normalizedQuery = query.trim().toLocaleUpperCase();
  const matchingInstruments = useMemo(
    () =>
      instruments
        .filter(
          (instrument) =>
            instrument.kind === kind &&
            (!normalizedQuery ||
              instrument.symbol.includes(normalizedQuery) ||
              instrument.name.toLocaleUpperCase().includes(normalizedQuery)),
        )
        .sort(
          (left, right) =>
            left.exchangeId.localeCompare(right.exchangeId) ||
            left.symbol.localeCompare(right.symbol),
        ),
    [instruments, kind, normalizedQuery],
  );
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
  const selectionCountLabel = ttf(
    "appText.marketDataAcquisitionSelectedCountValue0Value1",
    [symbols.length, MARKET_DATA_ACQUISITION_MAX_SYMBOLS],
  );

  return (
    <div
      className="market-data-acquisition-market-picker market-data-acquisition-akshare-picker"
      aria-invalid={invalid || (loadFailed && !instruments.length) || undefined}
      aria-describedby={describedBy}
      aria-busy={loading || refreshing || undefined}
    >
      <div className="market-data-acquisition-catalog-controls">
        <div
          className="market-data-acquisition-kind-switch"
          role="group"
          aria-label={tt("appText.marketDataAcquisitionInstrumentKindLabel")}
        >
          {(
            [
              ["A_SHARE", "appText.marketDataAcquisitionInstrumentKindAShare"],
              ["INDEX", "appText.marketDataAcquisitionInstrumentKindIndex"],
            ] as const
          ).map(([value, labelKey]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={kind === value ? "default" : "ghost"}
              className="market-data-acquisition-kind-option"
              data-state={kind === value ? "active" : "inactive"}
              aria-pressed={kind === value}
              disabled={disabled}
              onClick={() => {
                if (value === kind) return;
                setQuery("");
                onKindChange(value);
              }}
            >
              {tt(labelKey)}
            </Button>
          ))}
        </div>

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
            aria-controls="market-data-acquisition-instrument-results"
            onChange={(event) => setQuery(event.target.value)}
          />
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
                : loadFailed && instruments.length
                  ? "appText.marketDataAcquisitionCatalogRefreshFailedUsingCache"
                  : loadFailed
                    ? "appText.marketDataAcquisitionInstrumentsLoadFailed"
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
            loadFailed && !instruments.length
              ? "appText.marketDataAcquisitionCatalogRetry"
              : "appText.marketDataAcquisitionCatalogRefresh",
          )}
        </Button>
      </div>

      <div className="market-data-acquisition-catalog-columns">
        <section
          className="market-data-acquisition-catalog-panel"
          aria-labelledby="market-data-acquisition-instrument-candidates-title"
        >
          <header>
            <strong id="market-data-acquisition-instrument-candidates-title">
              {tt("appText.marketDataAcquisitionAvailableInstruments")}
            </strong>
            <span>{matchingInstruments.length}</span>
          </header>
          <div
            id="market-data-acquisition-instrument-results"
            className="market-data-acquisition-catalog-list"
            role="group"
            aria-label={tt("appText.marketDataAcquisitionAvailableInstruments")}
          >
            {loadFailed && !instruments.length ? (
              <span
                className="market-data-acquisition-market-message"
                role="alert"
              >
                {tt("appText.marketDataAcquisitionInstrumentsLoadFailed")}
              </span>
            ) : !loading && matchingInstruments.length === 0 ? (
              <span className="market-data-acquisition-market-message">
                {tt("appText.marketDataAcquisitionNoInstrumentsFound")}
              </span>
            ) : (
              matchingInstruments.map((instrument) => {
                const selected = selectedSet.has(instrument.symbol);
                return (
                  <label
                    key={instrument.symbol}
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
                      onChange={() => toggleSymbol(instrument.symbol)}
                    />
                    <span>
                      <strong>{instrument.name}</strong>
                      <small>
                        {ttf(
                          "appText.marketDataAcquisitionInstrumentMarketCodeValue0Value1",
                          [
                            resolveExchangeLabel(tt, instrument.exchangeId),
                            instrument.symbol,
                          ],
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
          aria-labelledby="market-data-acquisition-instrument-selected-title"
        >
          <header>
            <strong id="market-data-acquisition-instrument-selected-title">
              {tt("appText.marketDataAcquisitionSelectedInstruments")}
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
                {tt("appText.marketDataAcquisitionNoInstrumentsSelected")}
              </span>
            ) : (
              symbols.map((symbol) => {
                const instrument = instrumentBySymbol.get(symbol);
                const label = instrument?.name || symbol;
                return (
                  <div
                    key={symbol}
                    className="market-data-acquisition-selected-item"
                  >
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {instrument
                          ? ttf(
                              "appText.marketDataAcquisitionInstrumentMarketCodeValue0Value1",
                              [
                                resolveExchangeLabel(tt, instrument.exchangeId),
                                instrument.symbol,
                              ],
                            )
                          : symbol}
                      </small>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled}
                      aria-label={ttf(
                        "appText.marketDataAcquisitionRemoveMarketValue0",
                        [label],
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
