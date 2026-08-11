// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DatePicker } from "../../src/ui/primitives/date-picker";

test("DatePicker exposes a controlled text input without removing the calendar trigger", () => {
  const html = renderToStaticMarkup(
    <DatePicker
      value="1962-01-02"
      onChange={() => undefined}
      allowManualInput
      aria-label="Start date"
      aria-invalid
      aria-describedby="start-date-error"
    />,
  );

  assert.match(html, /data-slot="date-picker-input"/);
  assert.match(html, /data-date-picker-calendar-trigger="true"/);
  assert.match(html, /data-density="default"/);
  assert.match(html, /value="1962-01-02"/);
  assert.match(html, /maxLength="10"/);
  assert.match(html, /pattern="\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}"/);
  assert.doesNotMatch(html, /type="date"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="start-date-error"/);
});

test("DatePicker keeps the shared calendar-only trigger as its default", () => {
  const html = renderToStaticMarkup(
    <DatePicker value="2018-03-27" aria-label="End date" />,
  );

  assert.doesNotMatch(html, /data-slot="date-picker-input"/);
  assert.match(html, /2018-03-27/);
});

test("DatePicker owns the manual field geometry instead of inheriting button styling", () => {
  const styles = readFileSync(
    new URL("../../src/styles/components/date-picker.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\[data-slot="date-picker"\] \{/u);
  assert.match(
    styles,
    /\[data-slot="date-picker"\] \[data-date-picker-calendar-trigger="true"\]/u,
  );
  assert.match(styles, /width: 100%;/u);
  assert.match(styles, /border-right: 1px solid var\(--ui-divider\);/u);
});

test("DatePicker supplies its calendar grid geometry to secondary windows", () => {
  const styles = readFileSync(
    new URL("../../src/styles/components/date-picker.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.date-picker-calendar-grid \{/u);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/u);
  assert.match(styles, /\.date-picker-calendar-day \{/u);
});
