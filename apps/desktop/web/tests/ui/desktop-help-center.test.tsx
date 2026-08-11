// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";

import { getDesktopHelpCatalog } from "../../src/domains/desktop-help/desktopHelpCatalog";
import { searchDesktopHelpCatalog } from "../../src/domains/desktop-help/desktopHelpSearch";
import { DESKTOP_HELP_ARTICLE_METADATA } from "../../src/domains/desktop-help/desktopHelpMetadata";
import type { DesktopHelpContextId } from "../../src/domains/desktop-help/desktopHelpTypes";
import {
  createNextSystemSettingsTabNavigationRequest,
  type SystemSettingsTabNavigationRequest,
} from "../../src/workspaces/settings/settings/SystemSettingsTabs";

const APP_LOCALES = ["en", "zh-CN", "ja", "ko", "es"] as const;

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");

test("desktop help catalogs keep localized article structures aligned", () => {
  const expectedIds = DESKTOP_HELP_ARTICLE_METADATA.map(({ id }) => id).sort();
  assert.equal(expectedIds.length, 27);
  for (const locale of APP_LOCALES) {
    const catalog = getDesktopHelpCatalog(locale);
    assert.equal(catalog.version, 1);
    const localizedIds = catalog.articles.map(({ id }) => id).sort();
    assert.deepEqual(localizedIds, expectedIds, `${locale}: metadata ids`);
    DESKTOP_HELP_ARTICLE_METADATA.forEach(({ id }) =>
      assert.ok(catalog.articleById.has(id), `${locale}: metadata:${id}`),
    );
    for (const article of catalog.articles) {
      assert.ok(article.title.trim());
      assert.ok(article.summary.trim());
      assert.ok(article.steps.length >= 2);
      assert.ok(article.notes.length >= 1);
      assert.deepEqual(
        article.blocks.map(({ kind }) => kind),
        ["paragraph", "steps", "list"],
      );
      for (const relatedId of article.relatedArticleIds) {
        assert.ok(catalog.articleById.has(relatedId));
      }
      assert.ok(article.relatedArticleIds.length <= 3);
    }
    for (const [contextId, recommendations] of Object.entries(
      catalog.contextRecommendations,
    )) {
      assert.equal(recommendations.length, 4, contextId);
      recommendations.forEach((articleId) =>
        assert.ok(catalog.articleById.has(articleId), `${contextId}:${articleId}`),
      );
    }
  }
});

test("settings help targets carry the exact requested settings tab", async () => {
  const catalog = getDesktopHelpCatalog("en");
  const settingsArticleIds = [
    "settings-general",
    "settings-transfer",
    "settings-about",
    "settings-advanced",
  ] as const;
  assert.deepEqual(
    settingsArticleIds
      .map((articleId) => catalog.articleById.get(articleId))
      .map((article) => [
        article?.targetWorkspace,
        article?.targetSettingsTab,
      ]),
    [
      ["SETTINGS", "GENERAL"],
      ["SETTINGS", "DATA_TRANSFER"],
      ["SETTINGS", "ABOUT"],
      ["SETTINGS", "ADVANCED"],
    ],
  );

  const centerSource = readSource(
    "domains/desktop-help/DesktopHelpCenter.tsx",
  );
  const runtimeHostSource = readSource("app-shell/runtime/RuntimeAppHost.tsx");
  const startupStateSource = readSource(
    "app-shell/runtime/runtimeStartupState.ts",
  );
  const workspaceBundlesSource = readSource(
    "app-shell/runtime/runtimeWorkspaceBundles.ts",
  );
  const settingsPageSource = readSource(
    "workspaces/settings/SystemSettingsWorkspacePage.tsx",
  );
  assert.match(centerSource, /navigateToTarget\(\{[\s\S]*settingsTab:/);
  assert.match(
    runtimeHostSource,
    /target\.workspace === "SETTINGS" && target\.settingsTab/,
  );
  assert.match(runtimeHostSource, /setRequestedSystemSettingsTab\(target\.settingsTab\)/);
  assert.doesNotMatch(startupStateSource, /clearRequestTimerId/);
  assert.match(
    startupStateSource,
    /createNextSystemSettingsTabNavigationRequest\(current, requestedTab\)/,
  );
  assert.match(
    workspaceBundlesSource,
    /requestedTabRequestId: requestedSystemSettingsTabRequestId/,
  );
  assert.match(
    settingsPageSource,
    /\[requestedTab, requestedTabRequestId, tabItems\]/,
  );

  let resolveDelayedSettingsModule!: () => void;
  const delayedSettingsModule = new Promise<void>((resolve) => {
    resolveDelayedSettingsModule = resolve;
  });
  let pendingRequest: SystemSettingsTabNavigationRequest | null =
    createNextSystemSettingsTabNavigationRequest(null, "DATA_TRANSFER");
  const mountedSettingsPage = delayedSettingsModule.then(() => pendingRequest);

  await Promise.resolve();
  assert.deepEqual(pendingRequest, {
    requestId: 1,
    tab: "DATA_TRANSFER",
  });
  resolveDelayedSettingsModule();
  assert.deepEqual(await mountedSettingsPage, pendingRequest);

  const repeatedRequest = createNextSystemSettingsTabNavigationRequest(
    pendingRequest,
    "DATA_TRANSFER",
  );
  assert.equal(repeatedRequest.tab, "DATA_TRANSFER");
  assert.equal(repeatedRequest.requestId, 2);
  assert.notDeepEqual(repeatedRequest, pendingRequest);
});

test("pseudo locale deliberately uses the reviewed English help bundle", () => {
  const english = getDesktopHelpCatalog("en");
  const pseudo = getDesktopHelpCatalog("en-XA");
  assert.equal(pseudo.locale, "en");
  assert.equal(pseudo.copy.panelTitle, english.copy.panelTitle);
  assert.equal(
    pseudo.articleById.get("data-acquire")?.summary,
    english.articleById.get("data-acquire")?.summary,
  );
});

test("local search covers exact titles, aliases, CJK phrases, and all locales", () => {
  const cases = [
    { locale: "zh-CN", query: "哪里获取数据", expected: ["data-acquire"] },
    { locale: "zh-CN", query: "A股数据", expected: ["data-source-by-market"] },
    { locale: "zh-CN", query: "券商导出", expected: ["data-acquire"] },
    { locale: "zh-CN", query: "如何导入本地行情文件夹", expected: ["data-import"] },
    { locale: "ja", query: "データの入手先", expected: ["data-acquire"] },
    { locale: "ja", query: "タイムゾーン", expected: ["data-prepare", "data-import"] },
    { locale: "ko", query: "시장별 데이터 출처", expected: ["data-source-by-market"] },
    { locale: "ko", query: "시간대", expected: ["data-prepare", "data-import"] },
    { locale: "es", query: "dónde obtener datos", expected: ["data-acquire"] },
    { locale: "es", query: "zona horaria", expected: ["data-prepare", "data-import"] },
    { locale: "en", query: "function reference", expected: ["indicator-reference"] },
  ] as const;
  for (const { locale, query, expected } of cases) {
    const results = searchDesktopHelpCatalog({
      catalog: getDesktopHelpCatalog(locale),
      contextId: "COMMAND_CENTER",
      query,
    });
    assert.ok(
      (expected as readonly string[]).includes(results[0]?.article.id ?? ""),
      `${locale}:${query}:${results[0]?.article.id}`,
    );
    assert.ok(results.length <= 8);
  }
});

test("named market-data providers remain globally searchable", () => {
  const catalog = getDesktopHelpCatalog("zh-CN");
  for (const query of [
    "AkShare",
    "Tushare",
    "TradingView",
    "MT5",
    "Binance",
    "OKX",
    "HistData",
    "Nasdaq Data Link",
  ]) {
    const results = searchDesktopHelpCatalog({
      catalog,
      contextId: "TRAINER_SESSION",
      query,
    });
    assert.ok(
      results.some(({ article }) =>
        ["data-acquire", "data-source-by-market"].includes(article.id),
      ),
      query,
    );
  }
});

test("context changes ranking without narrowing the global search scope", () => {
  const catalog = getDesktopHelpCatalog("zh-CN");
  const scoreIn = (contextId: DesktopHelpContextId) =>
    searchDesktopHelpCatalog({ catalog, contextId, query: "历史行情" }).find(
      ({ article }) => article.id === "data-prepare",
    )?.score;
  const commandScore = scoreIn("COMMAND_CENTER");
  const dataScore = scoreIn("DATA");
  assert.ok(commandScore);
  assert.equal(dataScore, Number(commandScore) + 35);
  assert.ok(
    searchDesktopHelpCatalog({
      catalog,
      contextId: "TRAINER_SESSION",
      query: "回测",
    }).some(({ article }) => article.id === "backtest-configure"),
  );
});

test("unreliable search returns an explicit empty result instead of filler", () => {
  const results = searchDesktopHelpCatalog({
    catalog: getDesktopHelpCatalog("zh-CN"),
    contextId: "COMMAND_CENTER",
    query: "火星殖民氧气循环",
  });
  assert.deepEqual(results, []);
});

test("data acquisition guidance follows the real import contract and stays offline", () => {
  const catalog = getDesktopHelpCatalog("zh-CN");
  assert.deepEqual(
    catalog.articles
      .filter(({ categoryId }) => categoryId === "DATA")
      .map(({ id }) => id),
    [
      "data-acquire",
      "data-source-by-market",
      "data-prepare",
      "data-import",
      "data-manage",
    ],
  );
  assert.deepEqual(catalog.contextRecommendations.DATA, [
    "data-acquire",
    "data-source-by-market",
    "data-prepare",
    "data-import",
  ]);
  assert.deepEqual(catalog.contextRecommendations.COMMAND_CENTER, [
    "getting-started",
    "command-center-overview",
    "trainer-prepare",
    "data-acquire",
  ]);
  assert.deepEqual(catalog.contextRecommendations.TRAINER_PREP, [
    "trainer-prepare",
    "data-acquire",
    "data-prepare",
    "data-import",
  ]);

  const acquisitionArticleIds = [
    "data-acquire",
    "data-source-by-market",
    "data-prepare",
  ] as const;
  for (const articleId of acquisitionArticleIds) {
    const article = catalog.articleById.get(articleId);
    assert.equal(article?.categoryId, "DATA");
    assert.equal(article?.targetWorkspace, "DATA");
    assert.doesNotMatch(JSON.stringify(article), /https?:\/\/|www\./i);
  }

  const prepareArticle = catalog.articleById.get("data-prepare");
  const prepareText = [
    prepareArticle?.summary,
    ...(prepareArticle?.steps ?? []),
    ...(prepareArticle?.notes ?? []),
  ].join(" ");
  assert.match(prepareText, /csv.*json.*parquet.*xlsx/i);
  assert.match(prepareText, /1m.*5m.*1h.*1d/);
  assert.match(prepareText, /date\/time.*open.*high.*low.*close.*volume/i);
  assert.match(prepareText, /同一个导入文件夹只放一种格式/);
  assert.match(prepareText, /时区/);
  assert.match(prepareText, /原始价格和复权价格不要混用/);

  const centerSource = readSource(
    "domains/desktop-help/DesktopHelpCenter.tsx",
  );
  assert.doesNotMatch(centerSource, /DesktopHelpDataSection|desktop-help-data-section/);
  assert.doesNotMatch(centerSource, /localStorage|sessionStorage|fetch\(|api\./);
  assert.doesNotMatch(centerSource, /href=|window\.open|openExternal/);
  assert.match(centerSource, /searchResults\.length \? \(/);
  assert.doesNotMatch(centerSource, /openFeedback|feedbackAction/);
});

test("article details keep a visible reading hierarchy and reset their scroll position", () => {
  const centerSource = readSource(
    "domains/desktop-help/DesktopHelpCenter.tsx",
  );
  const centerStyles = readSource(
    "styles/components/desktop-help-center.css",
  );

  assert.match(centerSource, /className="desktop-help-detail-heading"/);
  assert.match(centerSource, /className="desktop-help-summary-block"/);
  assert.match(centerSource, /className="desktop-help-step-list"/);
  assert.match(centerSource, /className="desktop-help-step-number"/);
  assert.match(centerSource, /className="desktop-help-note-list"/);
  assert.match(centerSource, /className="desktop-help-related"/);
  assert.match(centerSource, /scrollContainerRef\.current\.scrollTop = 0/);
  assert.match(centerSource, /ref=\{scrollContainerRef\}/);

  assert.match(centerStyles, /\.desktop-help-step-row\s*\{/);
  assert.match(centerStyles, /\.desktop-help-step-number\s*\{/);
  assert.match(centerStyles, /\.desktop-help-note-list > li::before/);
  assert.match(
    centerStyles,
    /\.desktop-help-summary-copy\s*\{[^}]*color: var\(--text\)/s,
  );
});

test("settings help reuses the floating catalog and expands only its embedded layout", () => {
  const floatingHostSource = readSource(
    "domains/desktop-help/DesktopHelpFloatingHost.tsx",
  );
  const settingsHelpSource = readSource(
    "workspaces/settings/SystemSettingsHelpSection.tsx",
  );
  const centerStyles = readSource(
    "styles/components/desktop-help-center.css",
  );
  const settingsStyles = readCssWithImports(
    new URL("../../src/styles/pages/settings-system.css", import.meta.url),
  );
  const sharedCatalogPattern =
    /const catalog = useMemo\(\(\) => getDesktopHelpCatalog\(locale\), \[locale\]\);/;

  assert.match(floatingHostSource, sharedCatalogPattern);
  assert.match(settingsHelpSource, sharedCatalogPattern);
  assert.match(
    floatingHostSource,
    /<DesktopHelpCenter[\s\S]*?catalog=\{catalog\}[\s\S]*?mode="floating"/,
  );
  assert.match(
    settingsHelpSource,
    /<DesktopHelpCenter[\s\S]*?catalog=\{catalog\}[\s\S]*?mode="embedded"/,
  );
  assert.equal(
    settingsHelpSource.match(/<DesktopHelpCenter/g)?.length,
    1,
  );
  assert.doesNotMatch(
    settingsHelpSource,
    /desktopHelp\.bundle|articleById|articles\s*:/,
  );

  assert.match(
    centerStyles,
    /\.desktop-help-detail\s*\{[^}]*width: min\(100%, 760px\);[^}]*margin: 0 auto;/s,
  );
  assert.match(
    settingsStyles,
    /\.settings-help-center-section \.desktop-help-detail\s*\{[^}]*width: 100%;[^}]*margin: 0;/s,
  );
  assert.match(
    settingsStyles,
    /@container \(min-width: 960px\)\s*\{[\s\S]*?\.settings-help-center-section \.desktop-help-detail\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns:/,
  );
  assert.match(
    settingsStyles,
    /\.settings-help-center-section \.desktop-help-detail-section\s*\{[^}]*grid-column: 1;/s,
  );
  assert.match(
    settingsStyles,
    /\.settings-help-center-section \.desktop-help-note-block\s*\{[^}]*grid-column: 2;/s,
  );
  assert.match(
    settingsStyles,
    /\.settings-help-center-section \.desktop-help-back,[\s\S]*?> \[data-slot="button"\]:not\(\.desktop-help-back\)\s*\{[^}]*justify-self: start;/s,
  );
});

test("main-shell integration hides duplicate entry points and only navigates at workspace level", () => {
  const appRootSource = readSource("app-shell/AppRootDesktopShell.tsx");
  const floatingHostSource = readSource(
    "domains/desktop-help/DesktopHelpFloatingHost.tsx",
  );
  const settingsSource = readSource(
    "workspaces/settings/SystemSettingsWorkspacePage.tsx",
  );
  const aboutIndex = settingsSource.indexOf("renderAboutUpdatesSection()");
  const helpIndex = settingsSource.indexOf("<SystemSettingsHelpSection />");

  assert.match(appRootSource, /<DesktopHelpContextProvider/);
  assert.match(appRootSource, /<DesktopHelpFloatingHost/);
  assert.match(floatingHostSource, /onboardingActive \|\| embeddedHelpVisible/);
  assert.match(
    floatingHostSource,
    /contextId === "SETTINGS_ABOUT"/,
  );
  assert.ok(aboutIndex >= 0 && helpIndex > aboutIndex);
  assert.doesNotMatch(settingsSource, /helpFeedbackRequestEpoch|scrollIntoView/);
  assert.doesNotMatch(appRootSource, /handleOpenHelpFeedback|onOpenFeedback/);
  assert.doesNotMatch(
    readSource("domains/desktop-help/DesktopHelpContext.tsx"),
    /openFeedback|onOpenFeedback/,
  );
});
