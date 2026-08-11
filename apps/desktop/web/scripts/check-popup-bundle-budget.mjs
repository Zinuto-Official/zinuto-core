// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { POPUP_ROUTE_CHUNKS } from "./popup-manifest-rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const distRoot = path.join(frontendRoot, "dist");
const secondaryHtmlPath = path.join(distRoot, "secondary-window.html");

const DENIED_INITIAL_DEPENDENCY_TOKENS = [
  "codemirror",
  "milkdown",
  "markdown",
  "klinecharts",
  "echarts",
  "qrcode",
  "DesktopSecondaryWindowRenderers",
  "HistoryReplayChart",
  "ReplayNoteEditor",
  "SpecialTraining",
  "vendor-shared",
  "vendor-shared-i18n-",
];

const MAX_SECONDARY_ENTRY_JS_BYTES = 500_000;
const MAX_SECONDARY_ENTRY_CSS_BYTES = 120_000;
const VENDOR_CHUNK_PATTERN = /^vendor-[^/]*\.js$/;
const ALLOWED_VENDOR_NON_VENDOR_IMPORT_PATTERN =
  /^(?:preload-helper|rolldown-runtime)-[^/]*\.js$/;
const RELATIVE_JS_IMPORT_PATTERN =
  /(?:\bimport\s*(?:[^'"()]*?\s*from\s*)?|\bexport\s*[^'"()]*?\s*from\s*|\bimport\(\s*)["']\.\/([^"']+\.js)["']/g;

const readText = (filePath) => fs.readFileSync(filePath, "utf8");

const collectRelativeJsImports = (source) =>
  Array.from(source.matchAll(RELATIVE_JS_IMPORT_PATTERN), (match) => match[1]);

const fail = (message) => {
  console.error(`[popup-bundle-budget] ${message}`);
  process.exitCode = 1;
};

if (!fs.existsSync(secondaryHtmlPath)) {
  fail("dist/secondary-window.html is missing. Run vite build first.");
}

if (fs.existsSync(secondaryHtmlPath)) {
  const html = readText(secondaryHtmlPath);
  const assetRefs = Array.from(
    html.matchAll(/(?:src|href)="([^"]*\.(?:js|css))"/g),
    (match) => match[1],
  );
  const modulePreloads = Array.from(
    html.matchAll(/rel="modulepreload"[^>]+href="([^"]+)"/g),
    (match) => match[1],
  );

  for (const ref of modulePreloads) {
    const deniedToken = DENIED_INITIAL_DEPENDENCY_TOKENS.find((token) =>
      ref.toLowerCase().includes(token.toLowerCase()),
    );
    if (deniedToken) {
      fail(
        `secondary-window.html preloads denied popup dependency "${deniedToken}" via ${ref}.`,
      );
    }
  }

  for (const ref of assetRefs) {
    if (!ref.startsWith("/assets/")) {
      continue;
    }
    const filePath = path.join(distRoot, ref.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      fail(`Referenced secondary asset is missing: ${ref}`);
      continue;
    }
    const size = fs.statSync(filePath).size;
    if (/secondary-window-[^/]+\.js$/.test(ref) && size > MAX_SECONDARY_ENTRY_JS_BYTES) {
      fail(
        `secondary entry JS is ${size} bytes, above ${MAX_SECONDARY_ENTRY_JS_BYTES}.`,
      );
    }
    if (/secondary-window-[^/]+\.css$/.test(ref) && size > MAX_SECONDARY_ENTRY_CSS_BYTES) {
      fail(
        `secondary entry CSS is ${size} bytes, above ${MAX_SECONDARY_ENTRY_CSS_BYTES}.`,
      );
    }
  }

  const assetDir = path.join(distRoot, "assets");
  const assetFiles = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
  for (const fileName of assetFiles) {
    const filePath = path.join(assetDir, fileName);
    if (!fileName.endsWith(".js") || !fs.statSync(filePath).isFile()) {
      continue;
    }
    const source = readText(filePath);
    if (source.includes("DesktopSecondaryWindowRenderers")) {
      fail(`built asset ${fileName} still references DesktopSecondaryWindowRenderers.`);
    }
    if (VENDOR_CHUNK_PATTERN.test(fileName)) {
      for (const importedFileName of collectRelativeJsImports(source)) {
        if (
          !VENDOR_CHUNK_PATTERN.test(importedFileName) &&
          !ALLOWED_VENDOR_NON_VENDOR_IMPORT_PATTERN.test(importedFileName)
        ) {
          fail(
            `vendor chunk ${fileName} must not import app chunk ${importedFileName}.`,
          );
        }
      }
    }
  }

  for (const route of POPUP_ROUTE_CHUNKS) {
    const jsFileName = assetFiles.find((fileName) => route.jsPattern.test(fileName));
    if (!jsFileName) {
      fail(`missing popup route JS chunk for ${route.id}.`);
      continue;
    }
    const jsPath = path.join(assetDir, jsFileName);
    const jsSize = fs.statSync(jsPath).size;
    if (jsSize > route.maxJsBytes) {
      fail(
        `${route.id} JS is ${jsSize} bytes, above ${route.maxJsBytes}.`,
      );
    }
    const jsSource = readText(jsPath);
    for (const token of route.deniedTokens) {
      if (jsSource.toLowerCase().includes(token.toLowerCase())) {
        fail(`${route.id} includes denied dependency token "${token}".`);
      }
    }

    const cssFileName = assetFiles.find((fileName) =>
      route.cssPattern.test(fileName),
    );
    if (!cssFileName) {
      continue;
    }
    const cssPath = path.join(assetDir, cssFileName);
    const cssSize = fs.statSync(cssPath).size;
    if (cssSize > route.maxCssBytes) {
      fail(
        `${route.id} CSS is ${cssSize} bytes, above ${route.maxCssBytes}.`,
      );
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log("[popup-bundle-budget] secondary popup entry budget passed");
