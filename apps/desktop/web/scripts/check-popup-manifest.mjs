#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import { collectPopupManifestIssues } from "./popup-manifest-rules.mjs";

const issues = collectPopupManifestIssues();

for (const issue of issues) {
  console.error(`[popup-manifest] ${issue}`);
}

if (issues.length > 0) {
  process.exit(1);
}

console.log("[popup-manifest] secondary popup source manifest passed");
