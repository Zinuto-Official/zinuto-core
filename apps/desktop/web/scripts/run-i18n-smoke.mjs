// SPDX-License-Identifier: GPL-3.0-only

import {
  I18N_SMOKE_SUITE,
  runBrowserHarnessSuites,
} from "./browser-harness-runner.mjs";

process.exitCode = await runBrowserHarnessSuites([I18N_SMOKE_SUITE]);
