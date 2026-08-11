// SPDX-License-Identifier: GPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../src/ui/primitives/button";
import { InlineFeedback } from "../../src/ui/primitives/inline-feedback";
import {
  InlineLoadingState,
  PageLoadingState,
} from "../../src/ui/primitives/loading";

test("text buttons expose busy state and render the loading overlay label", () => {
  const html = renderToStaticMarkup(
    <Button loading loadingLabel="Saving Changes">
      Save Changes
    </Button>,
  );

  assert.match(html, /data-loading="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Saving Changes/);
  assert.match(html, /ui-button-loading/);
  assert.match(html, /ui-button-loading-placeholder/);
  assert.match(html, /ui-button-loading-overlay/);
  assert.match(html, /ui-button-loading-label/);
  assert.doesNotMatch(html, /absolute inset-0 inline-flex items-center justify-center gap-2/);
});

test("icon buttons replace children with a spinner-only loading state", () => {
  const html = renderToStaticMarkup(
    <Button size="icon-sm" loading loadingLabel="Loading Icon">
      <span>Original Icon</span>
    </Button>,
  );

  assert.match(html, /data-size="icon-sm"/);
  assert.doesNotMatch(html, /Original Icon/);
  assert.doesNotMatch(html, /Loading Icon/);
  assert.doesNotMatch(html, /ui-button-loading-overlay/);
});

test("button loading and spinner states are backed by shared component css", () => {
  const css = readFileSync(
    new URL("../../src/styles/components/ui-system-business.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.ui-button-loading-overlay\s*{/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\.ui-button-loading-placeholder\s*{/);
  assert.match(css, /opacity:\s*0/);
  assert.match(css, /\.ui-spinner-glyph\s*{/);
  assert.match(css, /border-top-color:\s*currentColor/);
});

test("inline feedback reserves a stable lane and keeps dismiss controls in grid", () => {
  const html = renderToStaticMarkup(
    <InlineFeedback
      feedback={{
        autoHideMs: null,
        id: 1,
        message: "Local save could not be completed",
        tone: "error",
      }}
      onDismiss={() => undefined}
      reserveSpace
      slotClassName="settings-save-feedback-slot"
    />,
  );

  assert.match(html, /ui-inline-feedback-slot/);
  assert.match(html, /settings-save-feedback-slot/);
  assert.match(html, /data-has-feedback="true"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /ui-inline-feedback-dismiss/);
  assert.match(html, /ui-inline-feedback-message/);
});

test("popup primitives reuse the shared inline feedback stylesheet", () => {
  const css = readFileSync(
    new URL("../../src/styles/popup-ui-primitives.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /@import "\.\/components\/inline-feedback\.css";/);
  assert.doesNotMatch(css, /^\.ui-inline-feedback\s*{/m);
  assert.doesNotMatch(css, /^\.ui-inline-feedback-message\s*{/m);
});

test("inline and page loading states expose polite status semantics", () => {
  const inlineHtml = renderToStaticMarkup(
    <InlineLoadingState label="Refreshing Data" />,
  );
  const pageHtml = renderToStaticMarkup(
    <PageLoadingState label="Loading Dashboard" title="Dashboard" />,
  );

  assert.match(inlineHtml, /role="status"/);
  assert.match(inlineHtml, /aria-live="polite"/);
  assert.match(inlineHtml, /Refreshing Data/);

  assert.match(pageHtml, /role="status"/);
  assert.match(pageHtml, /aria-live="polite"/);
  assert.match(pageHtml, /Loading Dashboard/);
  assert.match(pageHtml, /Dashboard/);
});
