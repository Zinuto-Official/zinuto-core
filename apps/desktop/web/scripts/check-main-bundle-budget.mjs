// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const distRoot = path.join(frontendRoot, "dist");
const indexHtmlPath = path.join(distRoot, "index.html");
const assetRoot = path.join(distRoot, "assets");

const MAX_MAIN_ENTRY_JS_BYTES = 500_000;
const MAX_MAIN_CRITICAL_CSS_BYTES = 30_000;
const MAX_MAIN_ENTRY_CSS_BYTES = 450_000;
const MAX_MAIN_TOTAL_CSS_BYTES = 450_000;
const MAX_MAIN_BOOTSTRAP_PRELOAD_BYTES = 2_000_000;
const MAX_DEFERRED_JS_CHUNK_BYTES = 750_000;

const DENIED_MAIN_PRELOAD_TOKENS = [
  "ChallengeFusionDashboard",
  "ChallengeStatsPage",
  "CustomIndicatorSystemPage",
  "DataConfigWorkspacePage",
  "DiagnosticCenterWorkspacePage",
  "HistoryReplayChart",
  "ReplayNoteEditor",
  "SpecialTrainingPage",
  "TrainerWorkspacePage",
  "echartSurface",
  "html2canvas",
  "jspdf",
  "vendor-codemirror",
  "vendor-klinecharts",
  "vendor-markdown",
  "vendor-milkdown",
  "vendor-prosemirror",
  "vendor-qrcode",
  "vendor-shared-i18n-",
];

const readText = (filePath) => fs.readFileSync(filePath, "utf8");

const fail = (message) => {
  console.error(`[main-bundle-budget] ${message}`);
  process.exitCode = 1;
};

const resolveAssetPath = (assetRef) => {
  if (!assetRef.startsWith("/assets/")) {
    return null;
  }
  return path.join(assetRoot, assetRef.slice("/assets/".length));
};

const readVitePreloadDependencies = (source) => {
  const serializedDependencies = source.match(
    /m\.f\|\|\(m\.f=(\[[\s\S]*?\])\)/u,
  )?.[1];
  if (!serializedDependencies) {
    return [];
  }
  try {
    const parsed = JSON.parse(serializedDependencies);
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "string")
      : [];
  } catch {
    fail("mainApp preload dependency table is not valid JSON.");
    return [];
  }
};

if (!fs.existsSync(indexHtmlPath)) {
  fail("dist/index.html is missing. Run vite build first.");
} else {
  for (const fileName of fs.readdirSync(assetRoot)) {
    if (!fileName.endsWith(".js")) {
      continue;
    }
    const size = fs.statSync(path.join(assetRoot, fileName)).size;
    if (size > MAX_DEFERRED_JS_CHUNK_BYTES) {
      fail(
        `${fileName} is ${size} bytes, above the ${MAX_DEFERRED_JS_CHUNK_BYTES}-byte deferred chunk budget.`,
      );
    }
  }

  const html = readText(indexHtmlPath);
  const assetRefs = Array.from(
    html.matchAll(/(?:src|href)="([^"]*\.(?:js|css))"/g),
    (match) => match[1],
  );
  const modulePreloads = Array.from(
    html.matchAll(/rel="modulepreload"[^>]+href="([^"]+)"/g),
    (match) => match[1],
  );

  for (const ref of modulePreloads) {
    const deniedToken = DENIED_MAIN_PRELOAD_TOKENS.find((token) =>
      ref.toLowerCase().includes(token.toLowerCase()),
    );
    if (deniedToken) {
      fail(`index.html preloads deferred dependency "${deniedToken}" via ${ref}.`);
    }
  }

  const mainJsRefs = assetRefs.filter((ref) => /\/main-[^/]+\.js$/u.test(ref));
  if (mainJsRefs.length !== 1) {
    fail(`expected exactly one main entry JS asset, found ${mainJsRefs.length}.`);
  }
  for (const ref of mainJsRefs) {
    const filePath = resolveAssetPath(ref);
    if (!filePath || !fs.existsSync(filePath)) {
      fail(`main entry JS asset is missing: ${ref}`);
      continue;
    }
    const size = fs.statSync(filePath).size;
    if (size > MAX_MAIN_ENTRY_JS_BYTES) {
      fail(`main entry JS is ${size} bytes, above ${MAX_MAIN_ENTRY_JS_BYTES}.`);
    }
  }

  const mainEntrySource = mainJsRefs.length === 1
    ? readText(resolveAssetPath(mainJsRefs[0]))
    : "";
  const deferredMainCssRefs = readVitePreloadDependencies(mainEntrySource)
    .filter((dependency) => dependency.endsWith(".css"))
    .map((dependency) => `/${dependency.replace(/^\//u, "")}`);
  const criticalMainCssRefs = assetRefs.filter((ref) => ref.endsWith(".css"));
  if (criticalMainCssRefs.length !== 1) {
    fail(
      `expected exactly one critical startup CSS asset, found ${criticalMainCssRefs.length}.`,
    );
  }
  if (deferredMainCssRefs.length !== 1) {
    fail(
      `expected exactly one deferred main CSS asset, found ${deferredMainCssRefs.length}.`,
    );
  }
  const cssRefs = [...new Set([
    ...criticalMainCssRefs,
    ...deferredMainCssRefs,
  ])];
  if (cssRefs.length !== 2) {
    fail(`expected separate startup and deferred main CSS assets, found ${cssRefs.length}.`);
  }
  let totalMainCssBytes = 0;
  for (const ref of cssRefs) {
    const filePath = resolveAssetPath(ref);
    if (!filePath || !fs.existsSync(filePath)) {
      fail(`index CSS asset is missing: ${ref}`);
      continue;
    }
    const size = fs.statSync(filePath).size;
    totalMainCssBytes += size;
    if (size > MAX_MAIN_ENTRY_CSS_BYTES) {
      fail(`index CSS is ${size} bytes, above ${MAX_MAIN_ENTRY_CSS_BYTES}.`);
    }
  }
  for (const ref of criticalMainCssRefs) {
    const filePath = resolveAssetPath(ref);
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    const size = fs.statSync(filePath).size;
    if (size > MAX_MAIN_CRITICAL_CSS_BYTES) {
      fail(
        `critical startup CSS is ${size} bytes, above ${MAX_MAIN_CRITICAL_CSS_BYTES}.`,
      );
    }
  }
  if (totalMainCssBytes > MAX_MAIN_TOTAL_CSS_BYTES) {
    fail(
      `combined main CSS is ${totalMainCssBytes} bytes, above ${MAX_MAIN_TOTAL_CSS_BYTES}.`,
    );
  }

  const mainAppFileName = fs
    .readdirSync(assetRoot)
    .find((fileName) => /^mainApp-[^/]+\.js$/u.test(fileName));
  if (!mainAppFileName) {
    fail("mainApp bootstrap chunk is missing.");
  } else {
    const mainAppSource = readText(path.join(assetRoot, mainAppFileName));
    const preloadDependencies = readVitePreloadDependencies(mainAppSource);
    for (const dependency of preloadDependencies) {
      const deniedToken = DENIED_MAIN_PRELOAD_TOKENS.find((token) =>
        dependency.toLowerCase().includes(token.toLowerCase()),
      );
      if (deniedToken) {
        fail(
          `mainApp preloads deferred dependency "${deniedToken}" via ${dependency}.`,
        );
      }
    }
    const bootstrapAssetNames = new Set([
      mainAppFileName,
      ...preloadDependencies.map((dependency) =>
        dependency.replace(/^assets\//u, ""),
      ),
    ]);
    const bootstrapPreloadBytes = Array.from(bootstrapAssetNames).reduce(
      (total, fileName) => {
        const filePath = path.join(assetRoot, fileName);
        return total + (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);
      },
      0,
    );
    if (bootstrapPreloadBytes > MAX_MAIN_BOOTSTRAP_PRELOAD_BYTES) {
      fail(
        `main bootstrap preload set is ${bootstrapPreloadBytes} bytes, above ${MAX_MAIN_BOOTSTRAP_PRELOAD_BYTES}.`,
      );
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("[main-bundle-budget] main entry budget passed");
