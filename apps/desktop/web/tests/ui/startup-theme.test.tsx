// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bootstrapInitialMainDesktopViewport } from "../../src/api/desktopViewport";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const readDesktopShellSource = (relativePath: string): string =>
  readFileSync(new URL(`../../../shell/${relativePath}`, import.meta.url), "utf8");

test("desktop startup shares one initial viewport bootstrap promise", async () => {
  const firstBootstrap = bootstrapInitialMainDesktopViewport();
  const secondBootstrap = bootstrapInitialMainDesktopViewport();

  assert.strictEqual(secondBootstrap, firstBootstrap);
  assert.equal((await firstBootstrap).source, "browser");
});

test("desktop startup applies the selected app theme before preferences hydrate", () => {
  const indexHtml = readFileSync(
    new URL("../../index.html", import.meta.url),
    "utf8",
  );
  const uiBootstrapSource = readSource(
    "src/app-shell/useAppUiBootstrapState.ts",
  );
  const rootBootstrapSource = readSource(
    "src/app-shell/boot/AppRootBootstrap.tsx",
  );
  const bootShellSource = readSource(
    "src/app-shell/AppRootBootShell.tsx",
  );
  const appPreferencesSource = readSource(
    "src/app-shell/appPreferencesModel.ts",
  );
  const runtimePersistenceSource = readSource(
    "src/app-shell/runtime/useRuntimeAppPersistence.ts",
  );
  const startupCss = readSource("src/styles/startup.css");
  const themeTokenSource = readSource("src/ui/theme/themeTokens.ts");
  const themeProviderSource = readSource("src/ui/theme/ThemeProvider.tsx");

  assert.match(indexHtml, /const fallbackThemeMode = "light";/u);
  assert.match(indexHtml, /href="\/src\/styles\/startup\.css"/u);
  assert.match(indexHtml, /"zinuto\.themeMode\.boot\.v1"/u);
  assert.match(indexHtml, /root\.setAttribute\("data-theme", initialTheme\)/u);
  assert.match(indexHtml, /root\.classList\.add\(`theme-\$\{initialTheme\}`\)/u);
  assert.ok(
    indexHtml.indexOf("zinuto.themeMode.boot.v1") <
      indexHtml.indexOf("zinuto.appPreferences.boot.v1"),
  );
  assert.match(startupCss, /--zinuto-startup-shell-rgb: 231 237 245;/u);
  assert.match(startupCss, /--zinuto-startup-text-rgb: 23 32 51;/u);
  assert.match(startupCss, /--zinuto-startup-shell-rgb: 11 17 26;/u);
  assert.match(startupCss, /--zinuto-startup-text-rgb: 245 247 250;/u);
  assert.match(
    startupCss,
    /background: rgb\(var\(--zinuto-startup-shell-rgb\)\) !important;/u,
  );
  assert.match(startupCss, /--color-window-bg/u);
  assert.match(startupCss, /--color-text-primary/u);
  assert.match(
    uiBootstrapSource,
    /const resolvedThemeMode:[\s\S]*?: 'light';/u,
  );
  assert.match(bootShellSource, /resolveBootLoadingTheme/u);
  assert.match(bootShellSource, /GLOBAL_COLOR_ARCHITECTURE\[theme\]\.surfaces\.s5/u);
  assert.match(bootShellSource, /GLOBAL_COLOR_ARCHITECTURE\[theme\]\.text\.t1/u);
  assert.match(bootShellSource, /theme-\$\{theme\}/u);
  assert.match(bootShellSource, /COMMUNITY_STARTUP_PRODUCT_NAME = "Zinuto Core"/u);
  assert.match(bootShellSource, /zinutoDesktopProductName/u);
  assert.match(bootShellSource, /zinuto-startup__logo-image/u);
  assert.doesNotMatch(bootShellSource, /StartupMarketTraceGraphic/u);
  assert.doesNotMatch(bootShellSource, /zinuto-startup__logo-sheen/u);
  assert.doesNotMatch(startupCss, /zinuto-startup__market/u);
  assert.doesNotMatch(startupCss, /zinuto-startup__logo-sheen/u);
  assert.doesNotMatch(startupCss, /zinuto-startup-icon-enter/u);
  assert.doesNotMatch(startupCss, /motion-startup-icon-enter/u);
  assert.doesNotMatch(bootShellSource, /tt\("appText\.zinuto"/u);
  assert.match(rootBootstrapSource, /buildRuntimeFailureFallbackBootPreferences/u);
  assert.match(rootBootstrapSource, /<StartupExitOverlay>/u);
  assert.match(bootShellSource, /return "light";/u);
  assert.match(appPreferencesSource, /APP_THEME_MODE_BOOT_CACHE_KEY/u);
  assert.match(appPreferencesSource, /resolveAppStartupTheme/u);
  assert.match(runtimePersistenceSource, /writeCachedAppThemeMode\(themeMode\)/u);
  assert.match(themeTokenSource, /FALLBACK_THEME: ThemeMode = 'light'/u);
  assert.match(themeProviderSource, /resolvedMode: 'light'/u);
  assert.match(themeProviderSource, /useLayoutEffect/u);
  assert.match(themeProviderSource, /root\.dataset\.zinutoInitialTheme = resolvedMode/u);
});

test("desktop preboot localizes status and settles its busy state", () => {
  const preReactBootstrapSource = readSource(
    "src/frontend-kernel/preReactBootstrap.ts",
  );
  const indexHtml = readSource("index.html");
  const startupCss = readSource("src/styles/startup.css");
  const secondaryWindowHtml = readSource("secondary-window.html");

  assert.match(indexHtml, /<html lang="en">/u);
  assert.match(indexHtml, /"zinuto:ui-language"/u);
  assert.match(indexHtml, /"zh-CN"/u);
  assert.match(indexHtml, /loading: "Loading\.\.\."/u);
  assert.match(indexHtml, /loading: "加载中\.\.\."/u);
  assert.match(indexHtml, /loading: "読み込み中\.\.\."/u);
  assert.match(indexHtml, /loading: "로드 중\.\.\."/u);
  assert.match(indexHtml, /loading: "Cargando\.\.\."/u);
  assert.match(indexHtml, /aria-label="Loading\.\.\."/u);
  assert.match(indexHtml, />Zinuto Core<\/strong>/u);
  assert.match(indexHtml, /data-zinuto-startup-surface/u);
  assert.match(indexHtml, /zinuto-startup__logo-image/u);
  assert.doesNotMatch(indexHtml, /zinuto-startup__market/u);
  assert.doesNotMatch(indexHtml, /zinuto-startup__logo-sheen/u);
  assert.match(indexHtml, /data-zinuto-startup-copy-visible="false"/u);
  assert.match(indexHtml, /zinuto:startup-surface-visible/u);
  assert.match(indexHtml, /normalizedVisibleAtMs \+ 1200 - performance\.now\(\)/u);
  assert.match(startupCss, /font-size: var\(--ty-r5, 23\.52px\)/u);
  assert.match(startupCss, /font-size: var\(--ty-r1, 14\.7px\)/u);
  assert.match(startupCss, /prefers-reduced-motion: reduce/u);
  assert.match(startupCss, /:root\[data-motion="reduced"\]/u);
  assert.doesNotMatch(indexHtml, /zinuto-preboot__skeleton/u);
  assert.match(indexHtml, /data-zinuto-preboot-status/u);
  assert.match(indexHtml, /setAttribute\("aria-busy", "false"\)/u);

  assert.match(secondaryWindowHtml, /loading: "Loading\.\.\."/u);
  assert.match(secondaryWindowHtml, /loading: "加载中\.\.\."/u);
  assert.match(secondaryWindowHtml, /loading: "読み込み中\.\.\."/u);
  assert.match(secondaryWindowHtml, /loading: "로드 중\.\.\."/u);
  assert.match(secondaryWindowHtml, /loading: "Cargando\.\.\."/u);
  assert.match(secondaryWindowHtml, /aria-label="Loading\.\.\."/u);
  assert.match(secondaryWindowHtml, />Zinuto Core<\/strong>/u);
  assert.match(secondaryWindowHtml, /font-size: 35px;/u);
  assert.match(secondaryWindowHtml, /font-size: 16px;/u);
  assert.doesNotMatch(secondaryWindowHtml, /zinuto-preboot__skeleton/u);
  assert.match(secondaryWindowHtml, /aria-label="Retry loading Zinuto Core"/u);
  assert.match(secondaryWindowHtml, /data-zinuto-preboot-status/u);
  assert.match(secondaryWindowHtml, /visibility: hidden;/u);
  assert.match(
    secondaryWindowHtml,
    /data-zinuto-bootstrap-state="failed"[\s\S]*?visibility: visible;/u,
  );
  assert.match(secondaryWindowHtml, /aria-hidden="true"/u);
  assert.match(
    secondaryWindowHtml,
    /removeAttribute\("aria-hidden"\)/u,
  );
  assert.match(secondaryWindowHtml, /setAttribute\("aria-busy", "false"\)/u);
  assert.match(
    preReactBootstrapSource,
    /updatePreReactBootstrapStatus\("loading"\)/u,
  );
  assert.match(
    preReactBootstrapSource,
    /updatePreReactBootstrapStatus\("failed"\)/u,
  );
  assert.match(
    preReactBootstrapSource,
    /updatePreReactBootstrapStatus\("ready"\)/u,
  );
});

test("desktop chrome follows the selected UI language", () => {
  const mainSource = readSource("src/main.ts");
  const persistenceSource = readSource(
    "src/app-shell/runtime/runtimeStartupPersistence.ts",
  );
  const nativeCommandsSource = readSource("src/api/desktopNativeCommands.ts");
  const shellMainSource = readDesktopShellSource("src/main.rs");
  const shellLanguageSource = readDesktopShellSource(
    "src/platform/desktop_ui_language.rs",
  );

  assert.match(
    mainSource,
    /syncNativeDesktopUiLanguage\(initialLanguage\)/u,
  );
  assert.match(
    persistenceSource,
    /syncNativeDesktopUiLanguage\(language\)/u,
  );
  assert.match(
    nativeCommandsSource,
    /DESKTOP_UI_LANGUAGE_EVENT = "zinuto:\/\/desktop-ui-language"/u,
  );
  assert.match(
    nativeCommandsSource,
    /eventModule\.emit\(DESKTOP_UI_LANGUAGE_EVENT/u,
  );
  assert.match(shellMainSource, /setup_desktop_ui_language_listener\(app\)/u);
  assert.match(shellMainSource, /tray\.set_menu\(Some\(menu\)\)/u);
  assert.match(shellLanguageSource, /training_center: "Training Center"/u);
  assert.match(shellLanguageSource, /training_center: "训练中心"/u);
  assert.match(shellLanguageSource, /data_management: "Data Management"/u);
  assert.match(shellLanguageSource, /data_management: "数据管理"/u);
});

test("desktop startup bootstraps viewport before mounting app shell", () => {
  const bootstrapSource = readSource("src/main.ts");
  const preReactBootstrapSource = readSource(
    "src/frontend-kernel/preReactBootstrap.ts",
  );
  const mainSource = readSource("src/app-shell/mainApp.ts");
  const workspaceUiStateSource = readSource(
    "src/app-shell/useAppWorkspaceUiState.ts",
  );
  const viewportThemeSource = readSource(
    "src/app-shell/useAppViewportAndSystemTheme.ts",
  );
  const runtimeAppHostSource = readSource(
    "src/app-shell/runtime/RuntimeAppHost.tsx",
  );
  const rootBootstrapSource = readSource(
    "src/app-shell/boot/AppRootBootstrap.tsx",
  );
  const bootShellSource = readSource(
    "src/app-shell/AppRootBootShell.tsx",
  );
  const viewportApiSource = readSource("src/api/desktopViewport.ts");
  const commandCenterPageSource = readSource(
    "src/workspaces/command-center/TrainingCommandCenterPage.tsx",
  );
  const shellMainSource = readDesktopShellSource("src/main.rs");
  const tauriConfigSource = readDesktopShellSource("tauri.conf.json");

  assert.match(
    bootstrapSource,
    /void runPreReactBootstrap\(\{[\s\S]*?loadPrimaryLocale:[\s\S]*?ensureLocaleCatalog\(initialLanguage\)[\s\S]*?loadFallbackLocale:[\s\S]*?ensureLocaleCatalog\("en"\)[\s\S]*?loadApplication:[\s\S]*?import\("@\/app-shell\/mainApp"\)/u,
  );
  const eagerViewportOffset = bootstrapSource.indexOf(
    "void bootstrapInitialMainDesktopViewport()",
  );
  const preReactBootstrapOffset = bootstrapSource.indexOf(
    "void runPreReactBootstrap({",
  );
  assert.ok(eagerViewportOffset >= 0);
  assert.ok(preReactBootstrapOffset > eagerViewportOffset);
  assert.doesNotMatch(bootstrapSource, /^await\s/mu);
  assert.match(
    mainSource,
    /settleStartupTaskWithin\([\s\S]*?bootstrapDesktopViewport\(\)[\s\S]*?loadMainAppLocale\(\)[\s\S]*?renderApp\(\);/u,
  );
  assert.match(mainSource, /await loadLocaleWithFallback\(\{/u);
  assert.doesNotMatch(
    mainSource,
    /settleStartupTaskWithin\([\s\S]*?ensureLocaleCatalog\(getCurrentUiLanguage\(\)\)/u,
  );
  assert.match(mainSource, /STARTUP_TASK_DEADLINE_MS\s*=\s*1_500/u);
  assert.match(preReactBootstrapSource, /PRE_REACT_BOOTSTRAP_WATCHDOG_MS\s*=\s*8_000/u);
  assert.match(preReactBootstrapSource, /loadLocaleWithFallback/u);
  assert.match(preReactBootstrapSource, /revealPreReactBootstrapFailure/u);
  assert.match(mainSource, /notifyMainWindowReadyAfterStableBootPaint/u);
  assert.match(mainSource, /document\.querySelector\('\.app-root'\)/u);
  assert.match(mainSource, /notifyDesktopMainWindowReadyToShow/u);
  assert.match(mainSource, /markStartupSurfaceVisible/u);
  const stablePaintOffset = mainSource.indexOf(
    "const notifyMainWindowReadyAfterStableBootPaint",
  );
  const startupVisibleOffset = mainSource.indexOf(
    "markStartupSurfaceVisible();",
    stablePaintOffset,
  );
  const nativeWindowNotificationOffset = mainSource.indexOf(
    "notifyDesktopMainWindowReadyToShow()",
    stablePaintOffset,
  );
  assert.ok(stablePaintOffset >= 0);
  assert.ok(startupVisibleOffset > stablePaintOffset);
  assert.ok(nativeWindowNotificationOffset > startupVisibleOffset);
  assert.match(
    mainSource.slice(stablePaintOffset, nativeWindowNotificationOffset + 80),
    /settleStartupTaskWithin\([\s\S]*?notifyDesktopMainWindowReadyToShow\(\)/u,
  );
  assert.match(mainSource, /AppRootBootShell/u);
  assert.match(mainSource, /fallback:\s*createElement\(AppRootBootShell\)/u);
  assert.match(mainSource, /RetryableLazyModuleSurface/u);
  assert.match(mainSource, /moduleName:\s*'MAIN_APP_BOOT'/u);
  assert.doesNotMatch(mainSource, /Suspense,\s*\{\s*fallback:\s*null\s*\}/u);
  assert.match(mainSource, /waitForAnimationFrame\(\);\s*await waitForAnimationFrame\(\)/u);
  assert.doesNotMatch(mainSource, /document\.fonts\?\.ready/u);
  assert.match(mainSource, /bootstrapInitialMainDesktopViewport/u);
  assert.doesNotMatch(mainSource, /scheduleDesktopViewportStartupSettling/u);
  assert.doesNotMatch(mainSource, /applyZoom:\s*false/u);
  assert.doesNotMatch(
    mainSource,
    /requestAnimationFrame\([\s\S]{0,160}bootstrapDesktopViewport/u,
  );
  assert.match(workspaceUiStateSource, /readMainDesktopViewportState/u);
  assert.match(
    workspaceUiStateSource,
    /initialDesktopViewport\.cssViewportScale/u,
  );
  assert.match(workspaceUiStateSource, /initialDesktopViewport\.layoutMode/u);
  assert.match(viewportThemeSource, /bootstrapMainDesktopViewport/u);
  assert.doesNotMatch(viewportThemeSource, /setTimeout\(/u);
  assert.match(viewportThemeSource, /\{ applyZoom: true \}/u);
  assert.match(
    viewportThemeSource,
    /const handleViewportChange = \(\) => \{/u,
  );
  assert.match(viewportThemeSource, /subscribeDesktopViewportChanges\(handleViewportChange\)/u);
  assert.doesNotMatch(viewportThemeSource, /handleFocus/u);
  assert.doesNotMatch(viewportThemeSource, /visibilitychange/u);
  assert.doesNotMatch(viewportThemeSource, /applyViewportState\(false\)/u);
  assert.match(viewportThemeSource, /currentRequestToken !== requestToken/u);
  assert.doesNotMatch(viewportThemeSource, /viewport\.source === 'browser'/u);
  assert.match(
    viewportThemeSource,
    /frameId = window\.requestAnimationFrame\(\(\) => \{\s*frameId = 0;\s*applyViewportState\(\);/u,
  );
  assert.doesNotMatch(
    viewportThemeSource,
    /const handleViewportChange = \(\) => \{\s*window\.cancelAnimationFrame\(frameId\);\s*applyViewportState\(\);/u,
  );
  assert.doesNotMatch(viewportThemeSource, /applyDesktopWebviewZoom/u);
  assert.doesNotMatch(runtimeAppHostSource, /MainWindowReadySignal/u);
  assert.doesNotMatch(runtimeAppHostSource, /document\.fonts\?\.ready/u);
  assert.doesNotMatch(runtimeAppHostSource, /notifyDesktopMainWindowReadyToShow/u);
  assert.match(bootShellSource, /readMainDesktopViewportState/u);
  assert.match(bootShellSource, /buildTypographyCssVariables/u);
  assert.match(
    bootShellSource,
    /font-size-\$\{fontSizePreset\.toLowerCase\(\)\}/u,
  );
  assert.match(bootShellSource, /layout-\$\{viewportLayoutMode\}/u);
  assert.match(bootShellSource, /"--viewport-scale": viewportScale\.toFixed\(4\)/u);
  assert.match(rootBootstrapSource, /phase:\s*"pending"/u);
  assert.match(rootBootstrapSource, /<AppRootBootShell\s*\/>/u);
  assert.match(rootBootstrapSource, /<StartupExitOverlay>/u);
  assert.match(rootBootstrapSource, /preferences:\s*normalized/u);
  assert.match(rootBootstrapSource, /preferences:\s*buildRuntimeFailureFallbackBootPreferences\(\)/u);
  assert.doesNotMatch(rootBootstrapSource, /preferences:\s*current\.preferences/u);
  assert.doesNotMatch(rootBootstrapSource, /preferences:\s*null/u);
  assert.doesNotMatch(viewportApiSource, /DESKTOP_VIEWPORT_METRICS_CHANGED_EVENT/u);
  assert.match(viewportApiSource, /main_window_ready_to_show/u);
  assert.match(viewportApiSource, /applyZoom\?: boolean/u);
  assert.match(viewportApiSource, /measureDesktopWebviewViewport/u);
  assert.match(viewportApiSource, /if \(cachedMainDesktopViewportState\)/u);
  assert.match(viewportApiSource, /desktopWebviewZoomRequestRevision/u);
  assert.match(viewportApiSource, /desktopWebviewZoomApplyQueue/u);
  assert.match(viewportApiSource, /initialMainDesktopViewportBootstrapPromise/u);
  assert.match(
    viewportApiSource,
    /bootstrapInitialMainDesktopViewport[\s\S]*?retryCount:\s*8[\s\S]*?retryDelayMs:\s*24/u,
  );
  assert.match(
    viewportApiSource,
    /DESKTOP_VIEWPORT_NATIVE_OPERATION_DEADLINE_MS\s*=\s*1_500/u,
  );
  assert.match(viewportApiSource, /settleDesktopViewportTaskWithin/u);
  assert.match(viewportApiSource, /attachBrowserResizeFallback/u);
  const browserResizeFallbackOffset = viewportApiSource.indexOf(
    "attachBrowserResizeFallback();",
    viewportApiSource.indexOf("subscribeDesktopViewportChanges"),
  );
  const nativeWindowModuleOffset = viewportApiSource.indexOf(
    "loadTauriWindowModule()",
    viewportApiSource.indexOf("subscribeDesktopViewportChanges"),
  );
  assert.ok(browserResizeFallbackOffset >= 0);
  assert.ok(nativeWindowModuleOffset > browserResizeFallbackOffset);
  assert.match(viewportApiSource, /registerNativeListenerWithinDeadline/u);
  assert.match(viewportApiSource, /runTauriUnlistenSafely\(unlisten\)/u);
  assert.match(
    viewportApiSource,
    /reapplyLatestDesktopWebviewZoomRequest\(true\)/u,
  );
  assert.doesNotMatch(viewportApiSource, /notifyDesktopViewportMetricsChanged/u);
  assert.doesNotMatch(viewportApiSource, /new Event\("resize"\)/u);
  assert.match(viewportApiSource, /mainWindowReadyToShowSent/u);
  assert.match(viewportApiSource, /mainWindowReadyToShowSent = true/u);
  assert.match(viewportApiSource, /mainWindowReadyToShowSent = false/u);
  assert.doesNotMatch(commandCenterPageSource, /useTrainingCommandCenterFitScale/u);
  assert.doesNotMatch(commandCenterPageSource, /data-tcc-fit-region/u);
  assert.doesNotMatch(commandCenterPageSource, /densityScaleStyles/u);
  assert.match(tauriConfigSource, /"visible": false/u);
  assert.match(shellMainSource, /on_page_load/u);
  assert.match(shellMainSource, /PageLoadEvent::Finished/u);
  assert.match(shellMainSource, /main_window_ready_to_show/u);
  assert.match(
    shellMainSource,
    /if matches!\(window\.is_visible\(\)\.ok\(\), Some\(true\)\) \{\s*return;\s*\}/u,
  );
  assert.match(
    shellMainSource,
    /if !should_restore_main_window_for_display_fallback\(window\.is_visible\(\)\.ok\(\)\)/u,
  );
  assert.match(
    shellMainSource,
    /fn should_restore_main_window_for_display_fallback\(is_visible: Option<bool>\) -> bool \{\s*!matches!\(is_visible, Some\(true\)\)\s*\}/u,
  );
  assert.match(shellMainSource, /MAIN_WINDOW_DISPLAY_FALLBACK_DELAYS_MS:\s*&\[u64\]\s*=\s*&\[3_000\]/u);
  assert.doesNotMatch(shellMainSource, /MAIN_WINDOW_DISPLAY_FALLBACK_DELAYS_MS:\s*&\[u64\]\s*=\s*&\[30_000\]/u);
  assert.doesNotMatch(shellMainSource, /show_loaded_main_webview/u);
  assert.match(
    shellMainSource,
    /restore_main_window_if_display_fallback_needed/u,
  );
  assert.match(
    shellMainSource,
    /should_restore_main_window_for_display_fallback/u,
  );
  assert.doesNotMatch(
    shellMainSource,
    /fn schedule_main_window_viewport_zoom_settling/u,
  );
  assert.doesNotMatch(shellMainSource, /fn apply_main_(?:window|webview)_viewport_zoom/u);
  assert.doesNotMatch(shellMainSource, /\.set_zoom\(/u);
  assert.doesNotMatch(
    shellMainSource,
    /restore_existing_main_window\(&app\.handle\(\), &window\)/u,
  );
  assert.match(
    shellMainSource,
    /if let Some\(window\) = app\.get_webview_window\(MAIN_WINDOW_LABEL\) \{\s*prepare_main_window_for_display\(&window\);\s*schedule_main_window_display_fallback/u,
  );
  assert.match(shellMainSource, /MAIN_WINDOW_DISPLAY_FALLBACK_DELAYS_MS/u);
  assert.match(shellMainSource, /schedule_main_window_display_fallback/u);
});
