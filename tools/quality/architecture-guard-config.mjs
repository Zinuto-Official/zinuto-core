// SPDX-License-Identifier: GPL-3.0-only

export const ALLOWED_TAURI_CUSTOM_COMMANDS = [
  "authorize_market_data_acquisition_folder",
  "backend_http_request",
  "backend_startup_preflight_status",
  "cancel_csv_folder_staging",
  "commit_market_data_acquisition_output",
  "desktop_app_quit",
  "desktop_app_restart",
  "desktop_release_channel",
  "discard_csv_folder_staging",
  "main_window_ready_to_show",
  "save_custom_indicator_ai_conversion_guide",
  "stage_csv_folder_for_import",
];

export const ALLOWED_TAURI_BRIDGE_FILES = [
  "apps/desktop/web/src/api/index.ts",
  "apps/desktop/web/src/api/desktopNativeBridge.ts",
  "apps/desktop/web/src/api/desktopNativeCommands.ts",
  "apps/desktop/web/src/api/desktopSecondaryWindows.ts",
  "apps/desktop/web/src/api/desktopSecondaryWindowGeometry.ts",
  "apps/desktop/web/src/api/desktopViewport.ts",
  "apps/desktop/web/src/domains/data-import/nativeImportHelpers.ts",
  "apps/desktop/web/src/app-shell/useWindowChromeDrag.ts",
];

export const FRONTEND_API_ENTRY_FILE = "apps/desktop/web/src/api/index.ts";
export const FRONTEND_API_DOMAIN_MODULE_ROOT = "apps/desktop/web/src/api/";

export const REQUIRED_DESKTOP_BUNDLE_RESOURCES = {
  "gen/backend-runtime/apps/desktop/local-api/": "apps/desktop/local-api/",
  "gen/backend-runtime/node_modules/": "node_modules/",
  "gen/backtest-engine/": "backtest-engine/",
  "gen/market-data-acquisition/": "market-data-acquisition/",
  "gen/runtime-manifest.json": "runtime-manifest.json",
};

export const REQUIRED_MACOS_BUNDLE_FILES = {
  "MacOS/zinuto-core-node": "runtime/node/bin/node",
  "lib/": "gen/node-runtime-libs/",
};

export const REQUIRED_WINDOWS_BUNDLE_RESOURCES = {
  ...REQUIRED_DESKTOP_BUNDLE_RESOURCES,
  "runtime/node/bin/node.exe": "node-runtime/node.exe",
  "gen/node-runtime-libs/": "node-runtime/",
};

export const REQUIRED_WINDOWS_NSIS_INSTALLER_HOOK =
  "nsis/windows-runtime-resources.nsh";

export const REQUIRED_TAURI_BUILD_COMMAND_FRAGMENT = "prepare-tauri-build.mjs";
export const REQUIRED_TAURI_DEV_COMMAND_FRAGMENT = "run-frontend-tauri-dev.mjs";

const ARCHITECTURE_LINE_BUDGET_SCALE = 1.43;

const scaleLineBudgetValue = (value) =>
  Math.ceil(Number(value) * ARCHITECTURE_LINE_BUDGET_SCALE);

const scaleLineBudgetMap = (budgetMap) =>
  Object.fromEntries(
    Object.entries(budgetMap).map(([key, value]) => [
      key,
      scaleLineBudgetValue(value),
    ]),
  );

const BASE_ARCHITECTURE_MAX_FILE_LINES = {
  css: 1500,
  page: 800,
  hookOrViewModel: 500,
  applicationModule: 700,
  serviceOrStore: 700,
  router: 350,
  genericSource: 1050,
};

export const ARCHITECTURE_MAX_FILE_LINES = scaleLineBudgetMap(
  BASE_ARCHITECTURE_MAX_FILE_LINES,
);

const BASE_ARCHITECTURE_FILE_LINE_ALLOWLIST = {
  // Existing oversized files are frozen at their audited line count. New code
  // must be split by responsibility instead of increasing these ceilings.
};

export const ARCHITECTURE_FILE_LINE_ALLOWLIST =
  BASE_ARCHITECTURE_FILE_LINE_ALLOWLIST;

export const ARCHITECTURE_PRIVATE_MODULE_SEGMENTS = [
  "/boot/",
  "/runtime/",
  "/session-provider/",
  "/dataConfig/",
];

export const ALLOWED_BACKEND_SQLITE_PREPARE_FILES = [
  "apps/desktop/local-api/src/application/portableData/marketPayloadFingerprint.ts",
  "apps/desktop/local-api/src/application/portableDataPackage.ts",
];
