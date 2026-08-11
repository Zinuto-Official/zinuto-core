// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { StandardModalFrame } from "../../src/ui/components/StandardModalFrame";
import { readCssWithImports } from "./readCssWithImports";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");
const readCssSource = (relativePath: string): string =>
  readCssWithImports(new URL(relativePath, import.meta.url));

test("alert modal frame defines the short dialog layout contract", () => {
  const css = readCssSource("../../src/styles/components/ui-system-business.css");

  assert.match(
    css,
    /\.ui-standard-modal\[data-variant="alert"\]\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*auto\) auto;[\s\S]*?gap:\s*16px;/,
  );
  assert.match(
    css,
    /\.ui-standard-modal\[data-variant="alert"\]\s+\.ui-standard-modal-header\s*\{[\s\S]*?text-align:\s*left;/,
  );
  assert.match(
    css,
    /\.ui-standard-modal\[data-variant="alert"\]\s+\.ui-standard-modal-title\s*\{[\s\S]*?font-size:\s*var\(--ty-r4\);/,
  );
  assert.match(
    css,
    /\.ui-standard-modal\[data-variant="alert"\]\s+\.ui-standard-modal-description\s*\{[\s\S]*?font-size:\s*var\(--ty-r2\);/,
  );
  assert.match(
    css,
    /\.ui-standard-modal\[data-variant="alert"\]\s+\.ui-standard-modal-actions\s*\{[\s\S]*?align-self:\s*end;[\s\S]*?justify-content:\s*flex-end;/,
  );
});

test("alert modal surfaces size to content inside viewport bounds", () => {
  const popupPrimitivesCss = readCssSource("../../src/styles/popup-ui-primitives.css");
  const refreshCss = readCssSource("../../src/styles/layout/ui-refresh.css");
  const alertSizingPattern =
    /width:\s*fit-content;[\s\S]*?min-width:\s*min\(360px,\s*calc\(100vw - 24px\)\);[\s\S]*?max-width:\s*min\(680px,\s*calc\(100vw - 24px\)\);[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*calc\(100vh - 24px\);/;

  assert.match(
    popupPrimitivesCss,
    /\.app-dialog-content\[data-layout="modal"\]\[data-preset="alert"\]\s*\{[\s\S]*?max-height:\s*calc\(100vh - 24px\);[\s\S]*?\}/,
  );
  assert.match(popupPrimitivesCss, alertSizingPattern);
  assert.match(
    refreshCss,
    /\.app-dialog-content\[data-layout="modal"\]\[data-preset="alert"\],\s*\n\.app-modal-surface\[data-preset="alert"\]\s*\{[\s\S]*?max-height:\s*calc\(100vh - 24px\);[\s\S]*?\}/,
  );
  assert.match(refreshCss, alertSizingPattern);
});

test("utility modal no longer reserves fixed short-dialog height", () => {
  const trainerCss = readCssSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );

  const utilityModalBlocks = [
    ...trainerCss.matchAll(/\.utility-modal\s*\{(?<body>[\s\S]*?)\n\}/g),
  ];
  assert.equal(utilityModalBlocks.length, 0);
});

test("utility order-end prompt keeps alert wiring and a formal action group", () => {
  const source = readSource("../../src/app-shell/AppUtilityDialogs.tsx");

  assert.match(source, /preset="alert"/);
  assert.match(source, /variant="alert"/);
  assert.match(source, /className="ui-standard-modal-action-group"/);

  const html = renderToStaticMarkup(
    <StandardModalFrame
      variant="alert"
      title="No next bar"
      description="This is the last bar, and fill price mode is next open."
      actions={
        <div className="ui-standard-modal-action-group">
          <button type="button">Cancel</button>
          <button type="button">End training</button>
        </div>
      }
    />,
  );

  assert.match(html, /data-variant="alert"/);
  assert.match(html, /class="ui-standard-modal-action-group"/);
  assert.match(html, /End training/);
});
