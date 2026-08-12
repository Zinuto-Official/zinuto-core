// SPDX-License-Identifier: GPL-3.0-only

import {
  I18N_SMOKE_SUITE,
  WORKSPACE_NAVIGATION_SUITE,
  runBrowserHarnessSuites,
} from "./browser-harness-runner.mjs";

process.exitCode = await runBrowserHarnessSuites([
  WORKSPACE_NAVIGATION_SUITE,
  I18N_SMOKE_SUITE,
]);
