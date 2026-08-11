// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as desktopContract from "../dist/contracts-desktop/api.js";
import { DESKTOP_OPENAPI_COMPONENT_ZOD_SCHEMAS } from "../dist/contracts-desktop/openapi-zod.generated.js";
import {
  buildHttpApiRoute,
  toExpressRoutePath,
} from "../dist/httpApiRouteBuilder.js";

type RuntimeBindingFile = {
  version?: unknown;
  services?: Record<
    string,
    {
      responseSchemas?: Record<string, string>;
      requestSchemas?: Record<string, string>;
    }
  >;
};

type OpenApiOperation = {
  key: string;
  runtimeResponseSchema: string | null;
  runtimeRequestSchema: string | null;
};

const readText = (relativePath: string): string =>
  fs.readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");

const readJson = (relativePath: string): RuntimeBindingFile =>
  JSON.parse(readText(relativePath)) as RuntimeBindingFile;

const extractRuntimeSchemaExports = (): Set<string> => {
  const exportedNames = new Set<string>();
  for (const contractModule of [desktopContract]) {
    for (const [name, value] of Object.entries(contractModule)) {
      if (
        name.endsWith("Schema") &&
        value &&
        typeof value === "object" &&
        "safeParse" in value &&
        typeof value.safeParse === "function"
      ) {
        exportedNames.add(name);
      }
    }
  }
  return exportedNames;
};

const extractOpenApiRuntimeSchemaOperations = (
  relativePath: string,
): Map<string, OpenApiOperation> => {
  const operations = new Map<string, OpenApiOperation>();
  const lines = readText(relativePath).split(/\r?\n/u);
  let inPaths = false;
  let currentPath = "";
  let currentOperation: OpenApiOperation | null = null;

  const finishOperation = () => {
    if (currentOperation) {
      operations.set(currentOperation.key, currentOperation);
      currentOperation = null;
    }
  };

  for (const line of lines) {
    if (/^paths:\s*$/u.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) {
      continue;
    }
    if (/^[^\s]/u.test(line)) {
      finishOperation();
      break;
    }
    const pathMatch = line.match(/^  (?:("[^"]+")|(\/[^:]+)):\s*$/u);
    if (pathMatch) {
      finishOperation();
      currentPath = pathMatch[1] ? JSON.parse(pathMatch[1]) : pathMatch[2];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/u);
    if (methodMatch) {
      finishOperation();
      currentOperation = {
        key: `${methodMatch[1].toUpperCase()} ${currentPath}`,
        runtimeResponseSchema: null,
        runtimeRequestSchema: null,
      };
      continue;
    }
    if (!currentOperation) {
      continue;
    }
    const schemaMatch = line.match(
      /^\s+x-zinuto-runtime-response-schema:\s*([A-Za-z0-9_]+)\s*$/u,
    );
    if (schemaMatch) {
      currentOperation.runtimeResponseSchema = schemaMatch[1];
    }
    const requestSchemaMatch = line.match(
      /^\s+x-zinuto-runtime-request-schema:\s*([A-Za-z0-9_]+)\s*$/u,
    );
    if (requestSchemaMatch) {
      currentOperation.runtimeRequestSchema = requestSchemaMatch[1];
    }
  }
  finishOperation();
  return operations;
};

test("v1 OpenAPI runtime schema bindings point to exported shared validators", () => {
  const bindings = readJson("contracts/runtime-response-schemas.v1.json");
  assert.equal(bindings.version, "v1");

  const exportedSchemaNames = extractRuntimeSchemaExports();
  const specsByService = {
    "desktop-local-api": extractOpenApiRuntimeSchemaOperations(
      "contracts/openapi/desktop-local-api.v1.yaml",
    ),
    "desktop-official-api": extractOpenApiRuntimeSchemaOperations(
      "contracts/openapi/desktop-local-api.v1.yaml",
    ),
  };

  for (const [serviceName, serviceBindings] of Object.entries(
    bindings.services ?? {},
  )) {
    const specOperations =
      specsByService[serviceName as keyof typeof specsByService];
    assert.ok(specOperations, `Unknown service in runtime bindings: ${serviceName}`);

    for (const [operationKey, schemaName] of Object.entries(
      serviceBindings.responseSchemas ?? {},
    )) {
      assert.ok(
        exportedSchemaNames.has(schemaName),
        `${operationKey} references a non-exported schema: ${schemaName}`,
      );
      assert.equal(
        specOperations.get(operationKey)?.runtimeResponseSchema,
        schemaName,
        `${operationKey} must carry the same x-zinuto-runtime-response-schema in OpenAPI`,
      );
    }

    for (const [operationKey, schemaName] of Object.entries(
      serviceBindings.requestSchemas ?? {},
    )) {
      assert.ok(
        exportedSchemaNames.has(schemaName),
        `${operationKey} references a non-exported request schema: ${schemaName}`,
      );
      assert.equal(
        specOperations.get(operationKey)?.runtimeRequestSchema,
        schemaName,
        `${operationKey} must carry the same x-zinuto-runtime-request-schema in OpenAPI`,
      );
    }
  }
});

test("HTTP API route builder replaces OpenAPI params and query values", () => {
  assert.equal(
    buildHttpApiRoute(
      "/api/v1/training/free-replay/sessions/{id}/snapshot",
      { id: "session with space" },
      { include: "fills", stale: false, empty: null },
    ),
    "/api/v1/training/free-replay/sessions/session%20with%20space/snapshot?include=fills&stale=false",
  );
  assert.equal(
    toExpressRoutePath("/v1/desktop/artifacts/{target}/{arch}/{version}"),
    "/v1/desktop/artifacts/:target/:arch/:version",
  );
  assert.throws(
    () => buildHttpApiRoute("/api/v1/training/free-replay/sessions/{id}/snapshot"),
    /Missing route parameter: id/u,
  );
  assert.throws(
    () => buildHttpApiRoute("/api/v1/training/free-replay/sessions", { id: "unused" }),
    /Unused route parameter: id/u,
  );
});

test("market acquisition OpenAPI and runtime schemas enforce the same closed request union", () => {
  const openApiSchema =
    DESKTOP_OPENAPI_COMPONENT_ZOD_SCHEMAS.DesktopMarketDataAcquisitionJobCreateRequest;
  const cases = [
    {
      expected: true,
      request: {
        connectorId: "akshare",
        dataset: "stock_zh_a_hist",
        symbols: ["000001"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: true,
      request: {
        connectorId: "akshare",
        dataset: "stock_zh_a_hist_min_em",
        symbols: ["000001"],
        timeframe: "5m",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "qfq",
      },
    },
    {
      expected: true,
      request: {
        connectorId: "akshare",
        dataset: "index_zh_a_hist",
        symbols: ["INDEX-000001", "INDEX-399006"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "akshare",
        dataset: "index_zh_a_hist",
        symbols: ["000001"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "akshare",
        dataset: "index_zh_a_hist",
        symbols: ["INDEX-000001"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "qfq",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "akshare",
        dataset: "stock_zh_a_hist",
        symbols: ["000001"],
        timeframe: "5m",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "akshare",
        dataset: "stock_zh_a_hist_min_em",
        symbols: ["000001"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "akshare",
        dataset: "stock_zh_a_hist",
        symbols: ["000001", "000001"],
        timeframe: "1d",
        startAt: "2026-07-18T00:00:00+08:00",
        endAt: "2026-07-18T23:59:59+08:00",
        adjustment: "none",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "ccxt",
        exchangeId: "binance",
        marketType: "spot",
        symbols: ["BTC/USDT", "BTC/USDT"],
        timeframe: "1m",
        startAt: "2026-07-18T00:00:00Z",
        endAt: "2026-07-18T23:59:59Z",
      },
    },
    {
      expected: false,
      request: {
        connectorId: "ccxt",
        exchangeId: "binance",
        marketType: "spot",
        symbols: ["btc/usdt", "BTC/USDT"],
        timeframe: "1m",
        startAt: "2026-07-18T00:00:00Z",
        endAt: "2026-07-18T23:59:59Z",
      },
    },
  ];

  for (const { expected, request } of cases) {
    assert.equal(openApiSchema.safeParse(request).success, expected);
    assert.equal(
      desktopContract.desktopMarketDataAcquisitionJobCreateRequestSchema.safeParse(request)
        .success,
      expected,
    );
  }
});
