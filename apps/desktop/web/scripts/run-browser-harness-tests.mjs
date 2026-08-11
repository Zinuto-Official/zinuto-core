// SPDX-License-Identifier: GPL-3.0-only

import {
  HOT_INTERACTION_SUITE,
  I18N_SMOKE_SUITE,
  runBrowserHarnessSuites,
} from "./browser-harness-runner.mjs";

process.exitCode = await runBrowserHarnessSuites([
  HOT_INTERACTION_SUITE,
  I18N_SMOKE_SUITE,
]);
