// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FRONTEND_ROOT = path.resolve(__dirname, "..");

export const POPUP_ROUTE_CHUNKS = [
  {
    id: "secondaryOnboardingRoute",
    jsPattern: /secondaryOnboardingRoute-[^/]+\.js$/,
    cssPattern: /onboarding-tour-[^/]+\.css$/,
    maxJsBytes: 500_000,
    maxCssBytes: 80_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode", "klinecharts", "echarts"],
  },
  {
    id: "secondaryReplayRoute",
    jsPattern: /secondaryReplayRoute-[^/]+\.js$/,
    cssPattern: /popup-replay-[^/]+\.css$/,
    maxJsBytes: 1_800_000,
    maxCssBytes: 180_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode"],
  },
  {
    id: "secondaryStrategyBacktestDetailRoute",
    jsPattern: /secondaryStrategyBacktestDetailRoute-[^/]+\.js$/,
    cssPattern: /strategy-backtest-[^/]+\.css$/,
    maxJsBytes: 1_800_000,
    maxCssBytes: 160_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode"],
  },
  {
    id: "secondaryNoteEditorRoute",
    jsPattern: /secondaryNoteEditorRoute-[^/]+\.js$/,
    cssPattern: /popup-note-editor-[^/]+\.css$/,
    maxJsBytes: 1_800_000,
    maxCssBytes: 180_000,
    deniedTokens: ["milkdown", "qrcode", "echarts"],
  },
  {
    id: "secondaryDataRoute",
    jsPattern: /secondaryDataRoute-[^/]+\.js$/,
    cssPattern: /popup-data-[^/]+\.css$/,
    maxJsBytes: 1_800_000,
    maxCssBytes: 280_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode"],
  },
  {
    id: "secondaryIndicatorReferenceRoute",
    jsPattern: /secondaryIndicatorReferenceRoute-[^/]+\.js$/,
    cssPattern: /popup-challenge-[^/]+\.css$/,
    maxJsBytes: 1_500_000,
    maxCssBytes: 160_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode", "klinecharts"],
  },
  {
    id: "secondaryTrainingRoute",
    jsPattern: /secondaryTrainingRoute-[^/]+\.js$/,
    cssPattern: /popup-training-[^/]+\.css$/,
    maxJsBytes: 1_500_000,
    maxCssBytes: 120_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode", "klinecharts"],
  },
  {
    id: "secondarySystemRoute",
    jsPattern: /secondarySystemRoute-[^/]+\.js$/,
    cssPattern: /popup-system-[^/]+\.css$/,
    maxJsBytes: 500_000,
    maxCssBytes: 80_000,
    deniedTokens: ["codemirror", "milkdown", "qrcode", "klinecharts", "echarts"],
  },
];

export const createPopupManifestPaths = (frontendRoot = DEFAULT_FRONTEND_ROOT) => ({
  secondaryCssSource: path.join(frontendRoot, "src", "styles", "secondary-window.css"),
  oldSecondaryRenderer: path.join(
    frontendRoot,
    "src",
    "app-shell",
    "secondaryWindows",
    "DesktopSecondaryWindowRenderers.tsx",
  ),
  secondaryRootSource: path.join(
    frontendRoot,
    "src",
    "app-shell",
    "secondaryWindows",
    "DesktopSecondaryWindowRoot.tsx",
  ),
  popupRegistrySource: path.join(
    frontendRoot,
    "src",
    "app-shell",
    "popups",
    "popupRegistry.ts",
  ),
  visualColorSource: path.join(frontendRoot, "src", "ui", "theme", "visualColors.ts"),
  popupReplayChartCss: path.join(
    frontendRoot,
    "src",
    "styles",
    "components",
    "popup-replay-chart.css",
  ),
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const readSource = ({ key, paths, sourceOverrides, readFile, fileExists }) => {
  if (hasOwn(sourceOverrides, key)) {
    const value = sourceOverrides[key];
    return {
      exists: value !== null && value !== undefined,
      source: value === null || value === undefined ? "" : String(value),
    };
  }
  const filePath = paths[key];
  if (!filePath || !fileExists(filePath)) {
    return { exists: false, source: "" };
  }
  return { exists: true, source: readFile(filePath) };
};

const collectRegisteredRouteChunkIds = (source) =>
  new Set(
    Array.from(
      source.matchAll(
        /import\("@\/app-shell\/secondaryWindows\/routes\/([^"]+)"\)/g,
      ),
      (match) => match[1],
    ),
  );

export const collectPopupManifestIssues = ({
  frontendRoot = DEFAULT_FRONTEND_ROOT,
  paths = createPopupManifestPaths(frontendRoot),
  sourceOverrides = {},
  routeChunks = POPUP_ROUTE_CHUNKS,
  readFile = (filePath) => fs.readFileSync(filePath, "utf8"),
  fileExists = (filePath) => fs.existsSync(filePath),
} = {}) => {
  const issues = [];
  const read = (key) =>
    readSource({ key, paths, sourceOverrides, readFile, fileExists });

  const secondaryCss = read("secondaryCssSource");
  if (secondaryCss.exists) {
    if (secondaryCss.source.includes('@import "./index.css"')) {
      issues.push("secondary-window.css must not import the full app style entry.");
    }
    if (
      secondaryCss.source.includes('@import "./styles.css"') ||
      secondaryCss.source.includes("@import \"../styles.css\"")
    ) {
      issues.push("secondary-window.css must not import the full app styles.css entry.");
    }
    if (
      secondaryCss.source.includes("popup-note-editor.css") ||
      secondaryCss.source.includes("popup-data.css")
    ) {
      issues.push("secondary-window.css must only import shell CSS, not route CSS packages.");
    }
  }

  if (read("oldSecondaryRenderer").exists) {
    issues.push("DesktopSecondaryWindowRenderers.tsx must not exist as a shared secondary runtime route.");
  }

  const secondaryRoot = read("secondaryRootSource");
  if (secondaryRoot.exists) {
    if (secondaryRoot.source.includes("DesktopSecondaryWindowRenderers")) {
      issues.push("DesktopSecondaryWindowRoot must not reference the old shared renderer.");
    }
    if (
      !secondaryRoot.source.includes("definition.cssLoader()") ||
      !secondaryRoot.source.includes("definition.loader()")
    ) {
      issues.push("DesktopSecondaryWindowRoot must load popup CSS before loading the route module.");
    }
  }

  const popupRegistry = read("popupRegistrySource");
  if (popupRegistry.exists) {
    for (const token of [
      "loader",
      "cssLoader",
      "i18nNamespaces",
      "warmPolicy",
      "maxRouteJsBytes",
    ]) {
      if (!popupRegistry.source.includes(token)) {
        issues.push(`popup registry is missing required manifest field "${token}".`);
      }
    }

    const registeredRouteChunkIds = collectRegisteredRouteChunkIds(popupRegistry.source);
    const budgetedRouteChunkIds = new Set(routeChunks.map((route) => route.id));
    for (const routeId of registeredRouteChunkIds) {
      if (!budgetedRouteChunkIds.has(routeId)) {
        issues.push(`popup route ${routeId} is registered without a bundle budget.`);
      }
    }
    for (const routeId of budgetedRouteChunkIds) {
      if (!registeredRouteChunkIds.has(routeId)) {
        issues.push(`popup bundle budget references unregistered route ${routeId}.`);
      }
    }
  }

  const replayChartCss = read("popupReplayChartCss");
  const visualColorSource = read("visualColorSource");
  if (
    replayChartCss.exists &&
    visualColorSource.exists &&
    replayChartCss.source.includes("--history-preview-glass-edge") &&
    !visualColorSource.source.includes("'--history-preview-glass-edge'")
  ) {
    issues.push("popup replay chart edge mask token must be provided by runtime visual variables.");
  }

  return issues;
};
