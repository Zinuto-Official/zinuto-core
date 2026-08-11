// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readCssWithImports } from "./readCssWithImports";

import { ToolbarIconButton } from "../../src/ui/components/ToolbarIconButton";

const readFrontendSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("shared tooltip waits for Floating UI positioning before opening motion", () => {
  const source = readFrontendSource("../../src/ui/primitives/tooltip.tsx");
  const uiSystemSource = readFrontendSource("../../src/ui/primitives/ui-system.ts");

  assert.doesNotMatch(source, /@radix-ui\/react-tooltip/);
  assert.doesNotMatch(source, /TooltipPrimitive/);
  assert.match(source, /@floating-ui\/dom/);
  assert.match(source, /computePosition/);
  assert.match(source, /autoUpdate/);
  assert.match(source, /floatingOffset/);
  assert.match(source, /flip\(\{ padding: collisionPadding \}\)/);
  assert.match(source, /shift\(\{ padding: collisionPadding \}\)/);
  assert.match(source, /createPortal/);
  assert.match(source, /useStableMergedRefs/);
  assert.match(source, /triggerRef\.current = node/);
  assert.match(source, /window\.addEventListener\("blur", handleWindowBlur\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /window\.removeEventListener\("blur", handleWindowBlur\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(source, /onClick:[\s\S]*context\.close/);
  assert.doesNotMatch(source, /triggerVersion/);
  assert.doesNotMatch(source, /setTriggerVersion/);
  assert.match(source, /sideOffset = 6/);
  assert.match(source, /collisionPadding = 8/);
  assert.match(source, /position:\s*"fixed"/);
  assert.match(
    source,
    /data-state=\{positionState\.isPositioned \? "open" : undefined\}/,
  );
  assert.match(
    source,
    /positionState\.isPositioned && uiAnchoredFloatMotionClassName/,
  );
  assert.match(
    source,
    /visibility: positionState\.isPositioned \? "visible" : "hidden"/,
  );
  assert.match(source, /if \(!isOpen \|\| !resolvedContainer\)/);
  assert.match(
    source,
    /\[isOpen, resolvedContainer, side, triggerRef, updatePosition\]/,
  );
  assert.match(source, /style=\{\{ \.\.\.style, \.\.\.floatingPositionStyle \}\}/);
  assert.doesNotMatch(source, /zinuto-tooltip-position/);
  assert.doesNotMatch(source, /requestPositionUpdate/);
  assert.doesNotMatch(source, /resolveTooltipPosition/);
  assert.doesNotMatch(source, /style=\{\{ \.\.\.positionStyle, \.\.\.style \}\}/);
  assert.doesNotMatch(source, /window\.addEventListener\("resize"/);
  assert.doesNotMatch(source, /window\.addEventListener\("scroll"/);
  assert.match(uiSystemSource, /export const uiAnchoredFloatMotionClassName = \[/);
  assert.match(uiSystemSource, /"transition-\[opacity,transform\]"/);
  assert.doesNotMatch(uiSystemSource, /transition-all/);
});

test("shared action tooltip triggers keep aria labels without native title tooltips", () => {
  const toolbarHtml = renderToStaticMarkup(
    <ToolbarIconButton label="Open Settings">
      <span aria-hidden="true">S</span>
    </ToolbarIconButton>,
  );
  const tagChipSource = readFrontendSource("../../src/ui/components/TagChip.tsx");
  const sidebarNavSource = readFrontendSource(
    "../../src/ui/components/SidebarNav.tsx",
  );
  const indicatorReferenceSource = readFrontendSource(
    "../../src/workspaces/custom-indicator/dialogs/CustomIndicatorReferenceCenterDialog.tsx",
  );

  assert.match(toolbarHtml, /aria-label="Open Settings"/);
  assert.doesNotMatch(toolbarHtml, /\stitle=/);
  assert.match(tagChipSource, /<TooltipTrigger asChild>\{actionButton\}<\/TooltipTrigger>/);
  assert.doesNotMatch(tagChipSource, /title=\{actionLabel\}/);
  assert.match(sidebarNavSource, /<TooltipTrigger asChild>/);
  assert.doesNotMatch(sidebarNavSource, /title=\{itemLabel\}/);
  assert.match(indicatorReferenceSource, /custom-indicator-reference-ai-guide-button/);
  assert.match(indicatorReferenceSource, /<TooltipTrigger asChild>/);
  assert.match(indicatorReferenceSource, /customIndicatorAiGuideDownloadTooltip/);
  assert.doesNotMatch(
    indicatorReferenceSource,
    /title=\{ui\.customIndicatorAiGuideDownloadTooltip\}/,
  );
  assert.match(indicatorReferenceSource, /role="status"/);
  assert.match(indicatorReferenceSource, /aria-live="polite"/);
});

test("obsolete global pseudo tooltip css is not available to ordinary controls", () => {
  const trainerCss = readFrontendSource(
    "../../src/styles/components/trainer-and-indicators.css",
  );
  const consistencyCss = readCssWithImports(
    new URL(
      "../../src/styles/core/ui-global-consistency.css",
      import.meta.url,
    ),
  );

  assert.doesNotMatch(trainerCss, /\.global-hover-tooltip/);
  assert.doesNotMatch(trainerCss, /\.icon-btn\[data-tip\]/);
  assert.doesNotMatch(consistencyCss, /\.global-hover-tooltip/);
  assert.match(consistencyCss, /\[data-slot='tooltip-content'\]/);
});
