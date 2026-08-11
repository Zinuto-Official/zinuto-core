// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { readCssWithImports } from "./readCssWithImports";

const pageSource = readFileSync(
  new URL(
    "../../src/workspaces/custom-indicator/CustomIndicatorWorkbenchLayout.tsx",
    import.meta.url,
  ),
  "utf8",
);
const css = readCssWithImports(
  new URL("../../src/styles/pages/ui-custom-indicator.css", import.meta.url),
);

const readCssRuleBody = (pattern: RegExp): string =>
  css.match(pattern)?.groups?.body ?? "";

test("custom indicator create button uses the manager visual selector", () => {
  assert.match(pageSource, /variant="default"/);
  assert.match(pageSource, /custom-indicator-manager-create-btn/);
  assert.match(css, /\.custom-indicator-manager-create-btn\s*\{/);
  assert.match(
    css,
    /\.custom-indicator-manager-create-btn:hover,\s*\n\.custom-indicator-manager-create-btn\[data-slot="button"\]:hover\s*\{/,
  );
  assert.doesNotMatch(
    css.match(/\.custom-indicator-manager-create-btn\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "",
    /visual-white|visual-brand-porcelain|visual-brand-mist/,
  );
});

test("custom indicator manager groups cap expanded lists at half height", () => {
  assert.match(
    pageSource,
    /data-system-collapsed=\{isSystemGroupCollapsed \? "true" : "false"\}/,
  );
  assert.match(
    pageSource,
    /data-custom-collapsed=\{isCustomGroupCollapsed \? "true" : "false"\}/,
  );
  assert.match(pageSource, /data-manager-group="system"/);
  assert.match(pageSource, /data-manager-group="custom"/);
  assert.match(
    pageSource,
    /data-collapsed=\{isSystemGroupCollapsed \? "true" : "false"\}/,
  );
  assert.match(
    pageSource,
    /data-collapsed=\{isCustomGroupCollapsed \? "true" : "false"\}/,
  );

  const groupsBody = readCssRuleBody(
    /\.custom-indicator-manager-groups\s*\{(?<body>[\s\S]*?)\n\}/,
  );
  assert.match(groupsBody, /display:\s*flex;/);
  assert.match(groupsBody, /flex-direction:\s*column;/);
  assert.match(groupsBody, /overflow:\s*hidden;/);
  assert.doesNotMatch(groupsBody, /overflow:\s*auto;/);
  assert.doesNotMatch(groupsBody, /grid-template-rows:/);

  assert.doesNotMatch(
    css,
    /\.custom-indicator-manager-groups\[data-system-collapsed="true"\]\[data-custom-collapsed="false"\]/,
  );
  assert.doesNotMatch(
    css,
    /\.custom-indicator-manager-groups\[data-system-collapsed="false"\]\[data-custom-collapsed="true"\]/,
  );
  assert.doesNotMatch(
    css,
    /\.custom-indicator-manager-groups\[data-system-collapsed="true"\]\[data-custom-collapsed="true"\]/,
  );

  const groupBody = readCssRuleBody(
    /\.custom-indicator-manager-group\s*\{(?<body>[\s\S]*?)\n\}/,
  );
  assert.match(groupBody, /display:\s*flex;/);
  assert.match(groupBody, /flex-direction:\s*column;/);
  assert.match(groupBody, /min-height:\s*0;/);
  assert.doesNotMatch(groupBody, /grid-template-rows:/);
  assert.match(
    css,
    /\.custom-indicator-manager-group\[data-collapsed="false"\]\s*\{[\s\S]*?max-height:\s*calc\(\(100% - var\(--custom-indicator-manager-groups-gap\)\) \/ 2\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.custom-indicator-manager-group\[data-collapsed="true"\]\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/,
  );

  const listBody = readCssRuleBody(
    /\.custom-indicator-manager-list\s*\{(?<body>[\s\S]*?)\n\}/,
  );
  assert.match(listBody, /flex:\s*1 1 auto;/);
  assert.match(listBody, /min-height:\s*0;/);
  assert.match(listBody, /overflow:\s*auto;/);
});
