// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartTopBar } from "../../src/ui/components/ChartTopBar";
import { DrawingToolbar } from "../../src/ui/components/DrawingToolbar";
import { MainChartPanel } from "../../src/ui/components/MainChartPanel";
import { TradingManualActionDeck } from "../../src/ui/components/TradingManualActionDeck";
import { WorkbenchRailSection } from "../../src/ui/components/WorkbenchRailSection";
import { TrainerTradeLogStrip } from "../../src/domains/trainer/TrainerTradeLogStrip";
import { readCssWithImports } from "./readCssWithImports";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");
const readCssSource = (relativePath: string): string =>
  readCssWithImports(new URL(relativePath, import.meta.url));
const readTrainerLayoutCss = (): string =>
  [
    readCssSource(
      "../../src/styles/layout/workspace-overrides/03-trainer-layout-refresh.css",
    ),
    readCssSource(
      "../../src/styles/layout/workspace-overrides/03-trainer-layout-refresh-shell.css",
    ),
  ].join("\n");

test("trainer live workspace surface primitives support the flush rail layout", () => {
  const html = renderToStaticMarkup(
    <>
      <ChartTopBar
        surface="flush"
        left={<span>Pool · Symbol · 2024-01-02</span>}
        center={
          <div className="trainer-inline-chart-toolbar">
            <span className="chart-period-btn active">1d</span>
            <span className="chart-period-btn">1w</span>
          </div>
        }
        right={<span>2 bars/s</span>}
      />
      <DrawingToolbar
        surface="flush"
        density="compact"
        tools={<div className="draw-tool-cursor-row">cursor</div>}
        controls={<div className="tool-cell">controls</div>}
        actions={<div className="draw-toolbar-danger-actions">actions</div>}
        note={<div className="draw-toolbar-bottom">note</div>}
      />
      <MainChartPanel surface="flush">
        <div>chart</div>
      </MainChartPanel>
      <WorkbenchRailSection
        surface="flush"
        title="当前持仓"
        actions={<span>结束训练</span>}
      >
        <div>section</div>
      </WorkbenchRailSection>
    </>,
  );

  const flushSurfaceCount = (html.match(/data-surface="flush"/g) ?? []).length;
  assert.equal(flushSurfaceCount, 4);
  assert.match(html, /trainer-inline-chart-toolbar/);
  assert.match(html, /data-density="compact"/);
});

test("trainer trade log strip can render as a frameless workspace band", () => {
  const html = renderToStaticMarkup(
    <TrainerTradeLogStrip
      emptyText="No Trades"
      timeFallbackText="--"
      buyLabel="Buy"
      sellLabel="Sell"
      buyStatsText="Buy 1"
      sellStatsText="Sell 1"
      statsSeparatorText="/"
      rows={[
        {
          sequence: "B1",
          fill: {
            id: "fill-1",
            side: "BUY",
            fill_time: "2024-01-02T09:30:00Z",
            fill_price: 12.34,
            fill_qty: 100,
            contract_multiplier: 1,
            fee: 1.2,
            tax: 0,
            slippage: 0.3,
          },
        },
      ]}
      baseTimeframe="1d"
      timeZone="Asia/Shanghai"
      formatMoney={(value, digits = 2) => value.toFixed(digits)}
      formatTradeLogQuantityText={(quantity) => `${quantity} shares`}
      surface="flush"
    />,
  );

  assert.match(html, /data-surface="flush"/);
  assert.match(html, /trade-log-pill/);
  assert.doesNotMatch(html, /data-surface-card="default"/);
});

test("trainer trade log strip uses the stable resize observer wrapper", () => {
  const source = readSource("../../src/domains/trainer/TrainerTradeLogStrip.tsx");

  assert.match(source, /attachStableElementResizeObserver/);
  assert.doesNotMatch(source, /new ResizeObserver\(/);
  assert.doesNotMatch(source, /window\.addEventListener\("resize"/);
});

test("desktop root ignores browser ResizeObserver loop notifications", () => {
  const source = readSource("../../src/app-shell/mainApp.ts");
  const guardCallIndex = source.indexOf("installResizeObserverLoopErrorGuard();");
  const bootCallIndex = source.indexOf("void startApp()");

  assert.match(
    source,
    /ResizeObserver loop completed with undelivered notifications\./,
  );
  assert.match(source, /ResizeObserver loop limit exceeded/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(
    source,
    /const onWindowError = \(event: ErrorEvent\) => \{[\s\S]*?isResizeObserverLoopErrorEvent\(event\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;[\s\S]*?console\.error\('\[zinuto-frontend-window-error\]', errorText\);/,
  );
  assert.doesNotMatch(source, /scheduleGlobalFatalState/);
  assert.notEqual(guardCallIndex, -1);
  assert.notEqual(bootCallIndex, -1);
  assert.ok(guardCallIndex < bootCallIndex);
});

test("manual trading action deck renders disabled reasons as button copy without a shared slot", () => {
  const html = renderToStaticMarkup(
    <TradingManualActionDeck
      buy={{
        tone: "buy",
        buttonClassName: "trade-side-action is-reason-inline",
        disabled: true,
        onClick: () => undefined,
        title: "Insufficient funds",
        ariaLabel: "Insufficient funds",
        label: "Insufficient funds",
      }}
      sell={{
        tone: "sell",
        buttonClassName: "trade-side-action",
        disabled: false,
        onClick: () => undefined,
        label: "Sell / S",
      }}
      next={{
        tone: "next",
        buttonClassName: "trade-next-action",
        disabled: false,
        onClick: () => undefined,
        label: "Next / Space",
      }}
      undo={{
        tone: "ghost",
        buttonClassName: "trade-undo-action",
        disabled: false,
        onClick: () => undefined,
        label: "Undo 5/5",
      }}
    />,
  );

  assert.match(html, /Insufficient funds/);
  assert.match(html, /aria-label="Insufficient funds"/);
  assert.match(html, /is-reason-inline/);
  assert.match(html, /Sell \/ S/);
  assert.doesNotMatch(html, /trade-action-reason-slot/);
  assert.doesNotMatch(html, /trade-action-inline-reason/);
  assert.ok(
    html.indexOf("trade-actions") <
      html.indexOf("trade-next-row"),
  );
});

test("manual trading action deck keeps inline reasons for challenge controls", () => {
  const html = renderToStaticMarkup(
    <TradingManualActionDeck
      buy={{
        tone: "buy",
        buttonClassName: "trade-side-action",
        disabled: true,
        reason: "Wait for the next question",
        onClick: () => undefined,
        label: "Buy + Next",
      }}
      sell={{
        tone: "sell",
        buttonClassName: "trade-side-action",
        disabled: false,
        onClick: () => undefined,
        label: "Sell + Next",
      }}
      next={{
        tone: "next",
        buttonClassName: "trade-next-action",
        disabled: false,
        onClick: () => undefined,
        label: "Next / Space",
      }}
    />,
  );

  assert.match(html, /trade-action-inline-reason/);
  assert.match(html, /Wait for the next question/);
  assert.doesNotMatch(html, /trade-action-reason-slot/);
});

test("trainer live order side buttons reserve the former reason lane and clamp inline reason copy", () => {
  const componentCss = readCssSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );
  const trainerLayoutCss = readTrainerLayoutCss();

  assert.doesNotMatch(componentCss, /trade-action-reason-slot/);
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-order-card \.trade-side-action\s*\{[\s\S]*height:\s*calc\(80px \* var\(--trainer-right-panel-fit-scale, 1\)\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer[\s\S]*\.trainer-live-order-card[\s\S]*\.trade-side-action\.is-reason-inline\s*\{[\s\S]*font-size:\s*var\(--ty-r2\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.trade-side-action\.is-reason-inline[\s\S]*\.ui-button-content\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*-webkit-line-clamp:\s*2;/,
  );
  assert.doesNotMatch(trainerLayoutCss, /trade-action-reason-slot/);
});

test("trainer order blocked buy and sell actions render the backend reason inside disabled buttons", () => {
  const source = [
    readSource("../../src/workspaces/trainer/TrainerWorkspaceSurface.tsx"),
    readSource("../../src/workspaces/trainer/TrainerWorkspaceLiveSurface.tsx"),
  ].join("\n");

  assert.match(
    source,
    /const buyOrderButtonLabel =\s*buyOrderDisabled && buyBlockMessageText\s*\?\s*buyBlockMessageText\s*:\s*tt\("appText\.buy"\);/,
  );
  assert.match(
    source,
    /const sellOrderButtonLabel =\s*sellOrderDisabled && sellBlockMessageText\s*\?\s*sellBlockMessageText\s*:\s*tt\("appText\.sell"\);/,
  );
  assert.match(
    source,
    /buttonClassName: buyOrderButtonClassName,\s*disabled: buyOrderDisabled,[\s\S]*?label: buyOrderButtonLabel,/,
  );
  assert.match(
    source,
    /buttonClassName: sellOrderButtonClassName,\s*disabled: sellOrderDisabled,[\s\S]*?label: sellOrderButtonLabel,/,
  );
  assert.doesNotMatch(
    source,
    /buyAction=\{\{[\s\S]*?reason:\s*buyOrderActionReason/,
  );
  assert.doesNotMatch(
    source,
    /sellAction=\{\{[\s\S]*?reason:\s*sellOrderActionReason/,
  );
});

test("trainer live right rail keeps typography on r1-r4 tokens without height-driven font scaling", () => {
  const componentCss = readCssSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );
  const trainerLayoutCss = readTrainerLayoutCss();
  const liveRailCss = trainerLayoutCss.slice(
    trainerLayoutCss.indexOf(".desktop-main.is-trainer .trainer-live-rail-fieldset"),
    trainerLayoutCss.indexOf(".desktop-main.is-trainer .trainer-free-replay-setup"),
  );

  assert.doesNotMatch(liveRailCss, /--trainer-workspace-r[1-8]\s*:/);
  assert.doesNotMatch(liveRailCss, /font-size:\s*calc\(/);
  assert.doesNotMatch(liveRailCss, /font-size:\s*var\(--ty-r[56]\)/);
  assert.doesNotMatch(liveRailCss, /data-fit-level/);
  assert.doesNotMatch(componentCss, /--trade-undo-action-count-type/);
  assert.doesNotMatch(
    componentCss,
    /\.trade-undo-action-count\s*\{[\s\S]*font-size:\s*calc\(/,
  );

  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-position-section \.workbench-rail-section-title,[\s\S]*\.desktop-main\.is-trainer \.trainer-live-order-section \.workbench-rail-section-title\s*\{[\s\S]*font-size:\s*var\(--ty-r4\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-position-section\s*\{[\s\S]*flex:\s*5\.5 1 0;/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-order-section\s*\{[\s\S]*flex:\s*4\.5 1 0;/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-position-metric-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer\s+\.trainer-live-position-section\s+\.trainer-position-metric-card--hero\s*\{[\s\S]*--trainer-position-value-size:\s*var\(--ty-r3\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer\s+\.trainer-live-position-section\s+\.trainer-position-metric-card--hero\s+\.position-value\.trainer-position-hero-value\s*\{[\s\S]*font-size:\s*var\(--trainer-position-value-size\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer\s+\.trainer-live-position-section\s+\.trainer-position-metric-card\s+:is\(\.position-label, \.position-buying-power-label\)\s*\{[\s\S]*font-size:\s*var\(--ty-r1\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-order-card \.trade-side-action\s*\{[\s\S]*font-size:\s*var\(--ty-r3\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-order-card \.trade-next-action,[\s\S]*\.desktop-main\.is-trainer \.trainer-live-order-card \.trade-undo-action\s*\{[\s\S]*font-size:\s*var\(--ty-r3\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-live-order-card \.trade-next-row\.has-undo-action\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.18fr\) minmax\(0, 0\.82fr\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.position-summary-footer-range\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*white-space:\s*normal;[\s\S]*text-overflow:\s*ellipsis;/,
  );
});

test("special training live order card does not animate high-frequency order updates", () => {
  const trainerLayoutCss = readTrainerLayoutCss();

  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-special-training \.trainer-live-order-card,\s*[\s\S]*?\.desktop-main\.is-special-training \.trainer-live-order-card \*::after\s*\{[\s\S]*?transition:\s*none !important;[\s\S]*?animation:\s*none !important;/,
  );
});

test("market preset overview modal caps to the viewport and scrolls inside the body", () => {
  const componentCss = readCssSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );
  const modalBlock =
    componentCss.match(
      /\.app-modal-surface\.trainer-market-overview-modal\[data-preset="form"\]\s*\{[\s\S]*?\n\}/,
    )?.[0] ?? "";
  const frameBlock =
    componentCss.match(
      /\.trainer-market-overview-modal\s*>\s*\.ui-standard-modal\s*\{[\s\S]*?\n\}/,
    )?.[0] ?? "";
  const bodyBlock =
    componentCss.match(
      /\.trainer-market-overview-body\s*\{[\s\S]*?\n\}/,
    )?.[0] ?? "";

  assert.match(
    modalBlock,
    /height:\s*min\(720px,\s*calc\(100vh - 72px\)\);/,
  );
  assert.match(modalBlock, /max-height:\s*calc\(100vh - 72px\);/);
  assert.match(modalBlock, /display:\s*grid;/);
  assert.match(modalBlock, /overflow:\s*hidden;/);
  assert.match(frameBlock, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/);
  assert.match(frameBlock, /overflow:\s*hidden;/);
  assert.match(bodyBlock, /min-height:\s*0;/);
  assert.match(bodyBlock, /align-content:\s*start;/);
  assert.match(bodyBlock, /overflow-y:\s*auto;/);
  assert.match(bodyBlock, /overflow-x:\s*hidden;/);
  assert.match(bodyBlock, /overscroll-behavior:\s*contain;/);
  assert.doesNotMatch(bodyBlock, /height:\s*100%;/);
  assert.doesNotMatch(bodyBlock, /max-height:\s*100%;/);
});

test("trainer current position cost row keeps borrow financing cost in a stable sibling slot", () => {
  const source = [
    readSource("../../src/workspaces/trainer/TrainerWorkspaceSurface.tsx"),
    readSource("../../src/workspaces/trainer/TrainerWorkspaceLiveSurface.tsx"),
  ].join("\n");
  const componentCss = readCssSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );
  const trainerLayoutCss = readTrainerLayoutCss();

  assert.match(source, /trainer-position-metric-grid/);
  assert.match(source, /trainer-position-grid-divider/);
  assert.match(source, /trainer-position-carry-cost-item/);
  assert.match(source, /const hasCarryCost = Math\.abs\(shortFee\) > 1e-8;/);
  assert.doesNotMatch(source, /trainer-position-hero-grid/);
  assert.doesNotMatch(source, /trainer-position-cost-grid/);
  assert.match(source, /hasCarryCost \? "" : " is-zero"/);
  assert.match(source, /label=\{shortFeeLabel\}/);
  assert.doesNotMatch(source, /showCarryCostSummary/);
  assert.doesNotMatch(source, /position-sub-leverage-align/);
  assert.ok(
    source.indexOf("trainer-position-carry-cost-item") <
      source.indexOf("trainer-live-order-section"),
  );

  assert.match(
    componentCss,
    /\.position-metric-meta\.is-empty\s*\{[\s\S]*visibility:\s*hidden;/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-position-grid-divider\s*\{[\s\S]*grid-column:\s*1 \/ -1;/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer\s+\.position-summary-footer-item\.trainer-position-footer-item\s*\{[\s\S]*gap:\s*var\(--trainer-position-metric-inner-gap\);/,
  );
  assert.match(
    trainerLayoutCss,
    /\.desktop-main\.is-trainer \.trainer-position-carry-cost-item\.is-zero \.position-label,[\s\S]*\.desktop-main\.is-trainer \.trainer-position-carry-cost-item\.is-zero \.position-value/,
  );
});
