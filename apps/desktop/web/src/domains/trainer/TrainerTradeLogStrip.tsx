// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toTimeZoneDateKey, toTimeZoneDateTime } from "@zinuto/shared/timezone";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { attachStableElementResizeObserver } from "@/domains/chart/chartStableResize";
import { SurfaceCard } from "@/ui/primitives/surface-card";

type TradeLogFill = {
  id: string;
  side: "BUY" | "SELL";
  fill_time?: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

type TrainerTradeLogStripProps = {
  emptyText: string;
  timeFallbackText: string;
  buyLabel: string;
  sellLabel: string;
  buyStatsText: string;
  sellStatsText: string;
  statsSeparatorText: string;
  rows: Array<{ fill: TradeLogFill; sequence: string }>;
  baseTimeframe: BaseTimeframe;
  timeZone?: string | null;
  formatMoney: (value: number, digits?: number) => string;
  formatTradeLogQuantityText: (quantity: number) => string;
  surface?: "card" | "flush";
};

const formatTradeLogTime = (
  value: string | undefined,
  baseTimeframe: BaseTimeframe,
  timeZone: string | null | undefined,
  fallback: string,
): string => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  const formatted =
    baseTimeframe === "1d"
      ? toTimeZoneDateKey(raw, timeZone ?? undefined)
      : toTimeZoneDateTime(raw, timeZone ?? undefined, false);
  return formatted || fallback;
};

export const TrainerTradeLogStrip = ({
  emptyText,
  timeFallbackText,
  buyLabel,
  sellLabel,
  buyStatsText,
  sellStatsText,
  statsSeparatorText,
  rows,
  baseTimeframe,
  timeZone,
  formatMoney,
  formatTradeLogQuantityText,
  surface = "card",
}: TrainerTradeLogStripProps) => {
  const orderedRows = useMemo(() => [...rows].reverse(), [rows]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [hasLeftOverflow, setHasLeftOverflow] = useState(false);
  const [hasRightOverflow, setHasRightOverflow] = useState(false);
  const latestFillKey =
    orderedRows.length > 0
      ? `${orderedRows[orderedRows.length - 1]?.fill.id ?? ""}:${orderedRows.length}`
      : "empty";

  const updateOverflowHints = useCallback(() => {
    const node = listRef.current;
    if (!node) {
      setHasLeftOverflow(false);
      setHasRightOverflow(false);
      return;
    }
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const nextHasLeftOverflow = node.scrollLeft > 1;
    const nextHasRightOverflow = node.scrollLeft < maxScrollLeft - 1;
    setHasLeftOverflow((current) =>
      current === nextHasLeftOverflow ? current : nextHasLeftOverflow,
    );
    setHasRightOverflow((current) =>
      current === nextHasRightOverflow ? current : nextHasRightOverflow,
    );
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    node.scrollLeft = node.scrollWidth;
    const rafId = window.requestAnimationFrame(() => {
      updateOverflowHints();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [latestFillKey, updateOverflowHints]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    const handleOverflowChange = () => {
      updateOverflowHints();
    };
    node.addEventListener("scroll", handleOverflowChange, { passive: true });
    const resizeObserverHandle = attachStableElementResizeObserver(
      node,
      handleOverflowChange,
    );
    resizeObserverHandle.force();
    return () => {
      node.removeEventListener("scroll", handleOverflowChange);
      resizeObserverHandle.disconnect();
    };
  }, [updateOverflowHints]);

  const Wrapper = surface === "card" ? SurfaceCard : "div";

  return (
    <Wrapper
      data-surface={surface}
      className="trade-log trade-log-strip"
    >
      <div className="trade-log-strip-shell">
        <div className="trade-log-strip-summary">
          <span className="trade-log-strip-summary-text">
            <span className="trade-side-tone-buy">{buyStatsText}</span>
            {sellStatsText ? (
              <>
                <span className="trade-log-side-stats-separator">
                  {statsSeparatorText}
                </span>
                <span className="trade-side-tone-sell">{sellStatsText}</span>
              </>
            ) : null}
          </span>
        </div>

        <div
          className="trade-log-strip-list-viewport"
          data-has-left-overflow={hasLeftOverflow ? "true" : "false"}
          data-has-right-overflow={hasRightOverflow ? "true" : "false"}
        >
          <div ref={listRef} className="trade-log-strip-list">
            {orderedRows.length ? (
              orderedRows.map(({ fill, sequence }) => {
                const sequenceValue =
                  sequence.length > 1 ? sequence.slice(1) : sequence;
                const sideLabel = fill.side === "BUY" ? buyLabel : sellLabel;
                const fillPrice = Number.isFinite(fill.fill_price) ? fill.fill_price : 0;
                const fillQty = Number.isFinite(fill.fill_qty) ? fill.fill_qty : 0;
                const contractMultiplier =
                  Number.isFinite(fill.contract_multiplier) && fill.contract_multiplier > 0
                    ? fill.contract_multiplier
                    : 1;
                const fee = Number.isFinite(fill.fee) ? fill.fee : 0;
                const tax = Number.isFinite(fill.tax) ? fill.tax : 0;
                const slippage = Number.isFinite(fill.slippage) ? fill.slippage : 0;
                const grossAmount = fillPrice * fillQty * contractMultiplier;
                const tradingCost = fee + tax + slippage;
                const settledAmount =
                  fill.side === "BUY"
                    ? grossAmount + tradingCost
                    : grossAmount - tradingCost;
                return (
                  <article key={fill.id} className="trade-log-pill">
                    <div className="trade-log-pill-head">
                      <span
                        className={`trade-log-pill-side ${
                          fill.side === "BUY" ? "buy" : "sell"
                        }`}
                      >
                        {sideLabel}
                      </span>
                      <span className="trade-log-pill-seq">
                        {sequenceValue}
                      </span>
                    </div>
                    <span className="trade-log-pill-time">
                      {formatTradeLogTime(
                        fill.fill_time,
                        baseTimeframe,
                        timeZone,
                        timeFallbackText,
                      )}
                    </span>
                    <div className="trade-log-pill-metrics">
                      <span className="trade-log-pill-metric">
                        {formatMoney(fillPrice, 3)}
                      </span>
                      <span className="trade-log-pill-metric">
                        {formatTradeLogQuantityText(fillQty)}
                      </span>
                      <span className="trade-log-pill-metric is-amount">
                        {formatMoney(settledAmount)}
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-text trade-log-empty trade-log-strip-empty">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      </div>
    </Wrapper>
  );
};
