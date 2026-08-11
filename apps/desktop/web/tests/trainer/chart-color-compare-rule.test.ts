// SPDX-License-Identifier: GPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";

import { createMainChartStyles } from "../../src/domains/chart/display";

test("main chart candle colors use previous close for price direction", () => {
  const styles = createMainChartStyles("dark", "RED_UP_GREEN_DOWN") as {
    candle: {
      bar: { compareRule?: string };
      priceMark: { last: { compareRule?: string } };
    };
  };

  assert.equal(styles.candle.bar.compareRule, "previous_close");
  assert.equal(styles.candle.priceMark.last.compareRule, "previous_close");
});

test("main chart labels match the market info legend size", () => {
  const styles = createMainChartStyles(
    "dark",
    "RED_UP_GREEN_DOWN",
    undefined,
    "CANDLE",
    "zh-CN",
  ) as {
    candle: {
      priceMark: {
        high: { textSize?: number };
        low: { textSize?: number };
        last: { text?: { size?: number } };
      };
      tooltip: { legend: { size: number } };
    };
    indicator: {
      tooltip: {
        title: { size: number };
        legend: { size: number };
      };
    };
    yAxis: { tickText: { size: number } };
    xAxis: { tickText: { size: number } };
    crosshair: {
      horizontal: { text: { size: number } };
      vertical: { text: { size: number } };
    };
  };
  const marketInfoSize = styles.candle.tooltip.legend.size;

  assert.equal(styles.yAxis.tickText.size, marketInfoSize);
  assert.equal(styles.xAxis.tickText.size, marketInfoSize);
  assert.equal(styles.candle.priceMark.high.textSize, marketInfoSize);
  assert.equal(styles.candle.priceMark.low.textSize, marketInfoSize);
  assert.equal(styles.candle.priceMark.last.text?.size, marketInfoSize);
  assert.equal(styles.crosshair.horizontal.text.size, marketInfoSize);
  assert.equal(styles.crosshair.vertical.text.size, marketInfoSize);
  assert.equal(styles.indicator.tooltip.title.size, marketInfoSize);
  assert.equal(styles.indicator.tooltip.legend.size, marketInfoSize);
});
