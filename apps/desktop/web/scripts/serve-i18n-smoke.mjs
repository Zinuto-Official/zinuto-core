// SPDX-License-Identifier: GPL-3.0-only

import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, "..", "dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(
  process.env.ZINUTO_I18N_SMOKE_PORT ??
    process.env.PORT ??
    (process.env.npm_lifecycle_event === "test:i18n:smoke" ? "4274" : "4174"),
  10,
);
const forceCspNonce = process.env.ZINUTO_I18N_SMOKE_CSP_NONCE === "1";
const cspNonceValue =
  process.env.ZINUTO_I18N_SMOKE_CSP_NONCE_VALUE ??
  Buffer.from("zinuto-i18n-smoke").toString("base64");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const addNonceAttributesToHtml = (html) =>
  html
    .replace(/<script\b(?![^>]*\bnonce=)/giu, `<script nonce="${cspNonceValue}"`)
    .replace(/<style\b(?![^>]*\bnonce=)/giu, `<style nonce="${cspNonceValue}"`);

const buildCspNonceHeader = () =>
  [
    "default-src 'none'",
    `script-src 'self' 'nonce-${cspNonceValue}'`,
    `script-src-elem 'self' 'nonce-${cspNonceValue}'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${cspNonceValue}'`,
    `style-src-elem 'self' 'nonce-${cspNonceValue}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

const resolveStaticRequest = (requestUrl) => {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "i18n-harness.html" : pathname.slice(1);
  const filePath = path.resolve(distRoot, relativePath);
  const distRootWithSeparator = `${distRoot}${path.sep}`;
  if (filePath !== distRoot && !filePath.startsWith(distRootWithSeparator)) {
    return null;
  }
  return {
    cspNonce:
      path.extname(filePath) === ".html" &&
      (forceCspNonce || url.searchParams.get("cspNonce") === "1"),
    filePath,
  };
};

const server = createServer((request, response) => {
  if (!request.url || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(405);
    response.end();
    return;
  }

  const staticRequest = resolveStaticRequest(request.url);
  if (!staticRequest) {
    response.writeHead(403);
    response.end();
    return;
  }
  const { cspNonce, filePath } = staticRequest;

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }

    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
    };

    if (cspNonce) {
      const body = Buffer.from(
        addNonceAttributesToHtml(readFileSync(filePath, "utf8")),
        "utf8",
      );
      response.writeHead(200, {
        ...headers,
        "Content-Length": body.byteLength,
        "Content-Security-Policy": buildCspNonceHeader(),
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    response.writeHead(200, {
      ...headers,
      "Content-Length": stat.size,
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.destroy();
    });
    stream.pipe(response);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

let isClosing = false;
const closeServer = () => {
  if (isClosing) {
    return;
  }
  isClosing = true;
  server.close(() => {
    process.exit(0);
  });
  server.closeAllConnections?.();
};

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);

server.listen(port, host, () => {
  console.log(`[i18n-smoke-server] ${distRoot} -> http://${host}:${port}`);
});
