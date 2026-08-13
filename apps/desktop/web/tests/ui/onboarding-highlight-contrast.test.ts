// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const onboardingCss = readFileSync(
  new URL(
    "../../src/styles/components/onboarding-tour.css",
    import.meta.url,
  ),
  "utf8",
);

test("onboarding highlight labels keep an opaque contrast surface", () => {
  const frameStart = onboardingCss.indexOf(
    ".desktop-onboarding-highlight-frame {",
  );
  const primaryToneStart = onboardingCss.indexOf(
    ".desktop-onboarding-highlight-frame[data-tone=\"primary\"]",
    frameStart,
  );
  const labelStart = onboardingCss.indexOf(
    ".desktop-onboarding-highlight-label {",
    primaryToneStart,
  );
  const mediaStart = onboardingCss.indexOf("@media", labelStart);
  assert.ok(frameStart >= 0);
  assert.ok(primaryToneStart > frameStart);
  assert.ok(labelStart > primaryToneStart);
  assert.ok(mediaStart > labelStart);

  const frameCss = onboardingCss.slice(frameStart, primaryToneStart);
  const labelCss = onboardingCss.slice(labelStart, mediaStart);
  assert.match(
    frameCss,
    /--desktop-onboarding-highlight-label-bg:\s*var\(--text-t1\);/u,
  );
  assert.match(
    frameCss,
    /--desktop-onboarding-highlight-label-fg:\s*var\(--surface-s1\);/u,
  );
  assert.doesNotMatch(frameCss, /highlight-label-bg:\s*color-mix/u);
  assert.match(
    frameCss,
    /border:\s*3px solid var\(--desktop-onboarding-highlight-accent\);/u,
  );
  assert.match(
    frameCss,
    /0 0 0 2px var\(--desktop-onboarding-highlight-accent\)/u,
  );
  assert.match(
    labelCss,
    /background:\s*var\(--desktop-onboarding-highlight-label-bg\);/u,
  );
  assert.match(
    labelCss,
    /color:\s*var\(--desktop-onboarding-highlight-label-fg\);/u,
  );
});
