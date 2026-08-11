#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readText = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const failures = [];
const desktopSpec = YAML.parse(
  readText("contracts/openapi/desktop-local-api.v1.yaml"),
);
const desktopPaths = Object.keys(desktopSpec.paths ?? {});
const generatedRoutes = readText(
  "packages/shared/src/contracts-desktop/http-api.ts",
);

for (const routePath of desktopPaths) {
  if (!routePath.startsWith("/api/v1/")) {
    failures.push(`desktop local API path is not versioned: ${routePath}`);
  }
  if (!generatedRoutes.includes(JSON.stringify(routePath))) {
    failures.push(`generated desktop route constants are missing ${routePath}`);
  }
}

const nativeBridge = readJson("contracts/native-bridge/native-bridge.v1.json");
const commands = (nativeBridge.commands ?? []).map((command) =>
  String(command.name ?? ""),
);
const forbiddenBridgeCommand =
  /(?:^|_)(?:account|auth|billing|deep_link|feedback|heartbeat|login|notice|oauth|payment|presence|redeem|restore|store_support|subscription|update)(?:_|$)/iu;
for (const command of commands) {
  if (forbiddenBridgeCommand.test(command)) {
    failures.push(`non-local command remains in native bridge: ${command}`);
  }
}

for (const requiredCommand of [
  "backend_http_request",
  "stage_csv_folder_for_import",
]) {
  if (!commands.includes(requiredCommand)) {
    failures.push(`required internal desktop bridge command is missing: ${requiredCommand}`);
  }
}

const runtimeBindings = readJson("contracts/runtime-response-schemas.v1.json");
if (
  JSON.stringify(Object.keys(runtimeBindings.services ?? {})) !==
  JSON.stringify(["desktop-local-api"])
) {
  failures.push("runtime schema bindings must contain only desktop-local-api");
}

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `[contract-check] passed (${desktopPaths.length} local routes, ${commands.length} bridge commands)\n`,
);
