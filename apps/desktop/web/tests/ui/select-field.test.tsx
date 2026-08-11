// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchSelectField } from "../../src/ui/primitives/search-select-field";
import { SelectField } from "../../src/ui/primitives/select-field";

const readFrontendSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("SelectField is backed by the shared Radix select primitives", () => {
  const source = readFrontendSource("../../src/ui/primitives/select-field.tsx");

  assert.match(source, /from "@\/ui\/primitives\/select"/);
  assert.match(source, /<Select\b/);
  assert.match(source, /<SelectTrigger\b/);
  assert.match(source, /<SelectContent\b/);
  assert.match(source, /<SelectItem\b/);
  assert.doesNotMatch(source, /<select\b/);
  assert.doesNotMatch(source, /SelectHTMLAttributes/);
  assert.doesNotMatch(source, /event\.target\.value/);
});

test("SelectField leaves selected text ownership to Radix", () => {
  const selectFieldSource = readFrontendSource(
    "../../src/ui/primitives/select-field.tsx",
  );
  const searchSelectFieldSource = readFrontendSource(
    "../../src/ui/primitives/search-select-field.tsx",
  );
  const html = renderToStaticMarkup(
    <SelectField
      value="b"
      aria-label="Pool"
      options={[
        { value: "", label: "All pools" },
        { value: "a", label: "Pool A" },
        { value: "b", label: "Pool B", disabled: true },
      ]}
      groups={[{ id: "system", label: "System" }]}
    />,
  );

  assert.match(html, /data-slot="select-trigger"/);
  assert.match(html, /aria-label="Pool"/);
  assert.doesNotMatch(html, /<option/);
  assert.match(selectFieldSource, /<SelectValue placeholder=\{displayPlaceholder\} \/>/);
  assert.match(
    searchSelectFieldSource,
    /<SelectValue placeholder=\{displayPlaceholder\} \/>/,
  );
  assert.doesNotMatch(selectFieldSource, /displayValue/);
  assert.doesNotMatch(searchSelectFieldSource, /displayValue/);
});

test("Select content caps long lists and keeps the option viewport scrollable", () => {
  const source = readFrontendSource("../../src/ui/primitives/select.tsx");

  assert.match(source, /--ui-select-resolved-content-max-height/);
  assert.match(source, /var\(--ui-select-content-max-height,\s*16rem\)/);
  assert.match(source, /data-slot="select-viewport"/);
  assert.match(source, /overflowY:\s*"auto"/);
  assert.match(source, /overscrollBehavior:\s*"contain"/);
});

test("SelectField dropdowns default to the trigger width", () => {
  const selectFieldSource = readFrontendSource(
    "../../src/ui/primitives/select-field.tsx",
  );
  const searchSelectFieldSource = readFrontendSource(
    "../../src/ui/primitives/search-select-field.tsx",
  );

  assert.match(selectFieldSource, /contentWidth = "trigger"/);
  assert.match(searchSelectFieldSource, /contentWidth = "trigger"/);
  assert.doesNotMatch(selectFieldSource, /contentWidth = "min-trigger"/);
  assert.doesNotMatch(searchSelectFieldSource, /contentWidth = "min-trigger"/);
  assert.match(
    selectFieldSource,
    /max-w-\[var\(--radix-select-trigger-width\)\]/,
  );
  assert.match(
    searchSelectFieldSource,
    /max-w-\[var\(--radix-select-trigger-width\)\]/,
  );
});

test("SelectField exposes unresolved controlled values instead of falling back", () => {
  const html = renderToStaticMarkup(
    <SelectField
      value="missing-pool"
      placeholder="Choose pool"
      aria-label="Pool"
      options={[{ value: "pool-a", label: "Pool A" }]}
    />,
  );

  assert.match(html, /data-invalid-value="true"/);
  assert.match(html, /missing-pool/);
  assert.doesNotMatch(html, /Pool A/);
});

test("SelectField keeps its Radix root controlled while supporting defaults", () => {
  const source = readFrontendSource("../../src/ui/primitives/select-field.tsx");

  assert.match(source, /const \[uncontrolledValue, setUncontrolledValue\]/u);
  assert.match(source, /value=\{encodedValue \?\? ""\}/u);
  assert.doesNotMatch(source, /defaultValue=\{encodedDefaultValue\}/u);
  assert.doesNotMatch(source, /<SelectValue[\s\S]*>\s*\{displayValue\}/);
});

test("SelectField can keep an empty-state dropdown interactive", () => {
  const disabledEmptyHtml = renderToStaticMarkup(
    <SelectField
      value=""
      aria-label="Strategy indicator"
      placeholder="No saved indicators"
      emptyLabel="No saved indicators"
      options={[]}
    />,
  );
  const interactiveEmptyHtml = renderToStaticMarkup(
    <SelectField
      value=""
      aria-label="Strategy indicator"
      placeholder="No saved indicators"
      emptyLabel="No saved indicators"
      options={[]}
      openWhenEmpty
    />,
  );

  assert.match(disabledEmptyHtml, /\bdisabled=""/);
  assert.doesNotMatch(interactiveEmptyHtml, /\bdisabled=""/);
  assert.match(interactiveEmptyHtml, /No saved indicators/);
});

test("SearchSelectField uses the same select trigger and keeps search in the shared component", () => {
  const source = readFrontendSource(
    "../../src/ui/primitives/search-select-field.tsx",
  );
  const html = renderToStaticMarkup(
    <SearchSelectField
      value="msft"
      aria-label="Symbol"
      searchPlaceholder="Search symbols"
      placeholder="Symbol"
      onValueChange={() => undefined}
      options={[
        { value: "aapl", label: "AAPL" },
        { value: "msft", label: "MSFT" },
      ]}
    />,
  );

  assert.match(source, /<SelectTrigger\b/);
  assert.match(source, /<SelectContent\b/);
  assert.match(source, /<Input\b/);
  assert.match(html, /data-slot="select-trigger"/);
  assert.doesNotMatch(source, /<SelectValue[\s\S]*>\s*\{displayValue\}/);
  assert.doesNotMatch(source, /TrainerSymbolSearchSelect/);
});
