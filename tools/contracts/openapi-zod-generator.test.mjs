// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { z } from "zod";

import {
  OpenApiZodBuilder,
  buildOpenApiZodModule,
} from "./openapi-zod-generator.mjs";

test("OpenAPI Zod generator renders field-level object constraints", () => {
  const spec = {
    components: {
      schemas: {
        ChildPayload: {
          type: "object",
          required: ["flag"],
          properties: {
            flag: { type: "boolean" },
          },
          additionalProperties: false,
        },
        SamplePayload: {
          "x-zinuto-zod-export-name": "samplePayloadSchema",
          type: "object",
          required: ["id", "mode", "child", "tags", "kind", "amount"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 128 },
            mode: { type: "string", enum: ["A", "B"] },
            child: { $ref: "#/components/schemas/ChildPayload" },
            tags: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string", maxLength: 16 },
            },
            kind: { const: "sample" },
            amount: { type: "number", minimum: 0, maximum: 100 },
            optionalText: { type: "string", nullable: true, maxLength: 32 },
            choice: {
              oneOf: [
                { type: "string", enum: ["left"] },
                { type: "integer", minimum: 1 },
              ],
            },
          },
          additionalProperties: false,
        },
      },
    },
    paths: {
      "/v1/sample": {
        post: {
          "x-zinuto-runtime-request-schema": "samplePayloadSchema",
        },
      },
    },
  };

  const output = buildOpenApiZodModule({
    spec,
    serviceName: "desktop-local-api",
  });

  assert.match(output, /const desktopOpenApiSamplePayloadSchema = z\.object/u);
  assert.match(output, /"id": z\.string\(\)\.min\(1\)\.max\(128\)/u);
  assert.match(output, /"mode": z\.enum\(\["A", "B"\]\)/u);
  assert.match(output, /"child": z\.lazy\(\(\) => desktopOpenApiChildPayloadSchema\)/u);
  assert.match(output, /"tags": z\.array\(z\.string\(\)\.max\(16\)\)\.min\(1\)\.max\(4\)/u);
  assert.match(output, /"kind": z\.literal\("sample"\)/u);
  assert.match(output, /"amount": z\.number\(\)\.min\(0\)\.max\(100\)/u);
  assert.match(output, /"optionalText": z\.string\(\)\.max\(32\)\.nullable\(\)\.optional\(\)/u);
  assert.match(output, /"choice": z\.union\(\[z\.enum\(\["left"\]\), z\.number\(\)\.int\(\)\.min\(1\)\]\)\.optional\(\)/u);
  assert.match(output, /"samplePayloadSchema": \{ source: "component", component: "SamplePayload"/u);
});

test("OpenAPI Zod generator supports allOf intersections and schema-valued maps", () => {
  const builder = new OpenApiZodBuilder({
    serviceName: "desktop-local-api",
    components: {
      Base: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
        additionalProperties: false,
      },
      Extended: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          {
            type: "object",
            required: ["facts"],
            properties: {
              facts: {
                type: "object",
                additionalProperties: { type: "string", maxLength: 20 },
              },
            },
            additionalProperties: false,
          },
        ],
      },
    },
  });

  const expression = builder.buildComponentExpression("Extended");
  assert.match(expression, /z\.lazy\(\(\) => desktopOpenApiBaseSchema\)\.and/u);
  assert.match(expression, /z\.record\(z\.string\(\), z\.string\(\)\.max\(20\)\)/u);
});

test("OpenAPI Zod generator materializes defaults for non-required properties", () => {
  const builder = new OpenApiZodBuilder({
    serviceName: "desktop-local-api",
    components: {},
  });
  const expression = builder.buildSchemaExpression(
    {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["SINGLE", "SPLIT"], default: "SINGLE" },
        time: { type: "string", default: "" },
      },
      additionalProperties: false,
    },
    "DefaultPayload",
  );

  assert.match(expression, /"mode": z\.enum\(\["SINGLE", "SPLIT"\]\)\.default\("SINGLE"\)/u);
  assert.doesNotMatch(expression, /default\("SINGLE"\)\.optional\(\)/u);
  const schema = vm.runInNewContext(expression, { z });
  assert.deepEqual({ ...schema.parse({}) }, { mode: "SINGLE", time: "" });
});

test("OpenAPI Zod generator enforces uniqueItems at runtime", () => {
  const builder = new OpenApiZodBuilder({
    serviceName: "desktop-local-api",
    components: {},
  });
  const expression = builder.buildSchemaExpression(
    {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string" },
    },
    "UniqueSymbols",
  );

  assert.match(expression, /\.refine\(.*uniqueItems/u);
  const schema = vm.runInNewContext(expression, { z });
  assert.equal(schema.safeParse(["000001", "000002"]).success, true);
  assert.equal(schema.safeParse(["000001", "000001"]).success, false);
});

test("OpenAPI Zod generator binds explicit external component sources", () => {
  const output = buildOpenApiZodModule({
    serviceName: "desktop-local-api",
    spec: {
      components: {
        schemas: {
          ExternalPayload: {
            "x-zinuto-zod-export-name": "externalPayloadSchema",
            "x-zinuto-zod-source": "external",
            "x-zinuto-zod-import": {
              module: "./external.js",
              name: "externalPayloadSchema",
            },
          },
        },
      },
      paths: {
        "/v1/external": {
          get: {
            "x-zinuto-runtime-response-schema": "externalPayloadSchema",
          },
        },
      },
    },
  });

  assert.match(output, /from "\.\/external\.js"/u);
  assert.match(output, /externalPayloadSchema/u);
  assert.match(output, /source: "external", component: "ExternalPayload"/u);
  assert.doesNotMatch(output, /const desktopOpenApiExternalPayloadSchema/u);
});

test("OpenAPI Zod generator rejects unsafe or incomplete schemas", () => {
  const builder = new OpenApiZodBuilder({
    serviceName: "desktop-local-api",
    components: {},
  });

  assert.throws(
    () => builder.buildSchemaExpression({ type: "array" }, "ArrayPayload"),
    /array is missing items/u,
  );
  assert.throws(
    () => builder.buildSchemaExpression({ type: "object" }, "LooseObject"),
    /explicit additionalProperties marker/u,
  );
  assert.throws(
    () =>
      builder.buildSchemaExpression(
        { type: "object", additionalProperties: true },
        "UnknownMap",
      ),
    /without x-zinuto-zod-allow-additional-properties/u,
  );
  assert.throws(
    () => builder.buildSchemaExpression({ description: "too loose" }, "UnknownPayload"),
    /missing a supported type/u,
  );
  assert.throws(
    () =>
      builder.buildSchemaExpression(
        { $ref: "#/components/parameters/NotASchema" },
        "BadRef",
      ),
    /unsupported \$ref/u,
  );
  assert.throws(
    () =>
      buildOpenApiZodModule({
        serviceName: "desktop-local-api",
        spec: {
          components: { schemas: {} },
          paths: {
            "/v1/missing": {
              get: {
                "x-zinuto-runtime-response-schema": "missingRuntimeSchema",
              },
            },
          },
        },
      }),
    /has no matching components\.schemas entry/u,
  );
  assert.throws(
    () =>
      buildOpenApiZodModule({
        serviceName: "desktop-local-api",
        spec: {
          components: {
            schemas: {
              ExternalPayload: {
                "x-zinuto-zod-export-name": "externalPayloadSchema",
                "x-zinuto-zod-source": "external",
              },
            },
          },
          paths: {
            "/v1/external": {
              get: {
                "x-zinuto-runtime-response-schema": "externalPayloadSchema",
              },
            },
          },
        },
      }),
    /missing x-zinuto-zod-import/u,
  );
});
