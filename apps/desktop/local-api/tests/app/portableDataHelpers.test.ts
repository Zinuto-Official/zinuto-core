// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { INPUT_LIMITS } from "@zinuto/shared/input-limits";

import { normalizePortableTrainingProjectForImport } from "../../src/application/portableData/helpers.js";

test("portable training project normalization truncates mapped local names", () => {
  const normalized = normalizePortableTrainingProjectForImport(
    {
      name: "N".repeat(60),
      symbol: "S".repeat(INPUT_LIMITS.symbolChars),
      sample_pool_name: "P".repeat(15),
      simulation_batch_id: "B".repeat(INPUT_LIMITS.idChars),
      summary_json: "{}",
    },
    {
      targetProjectId: "project_1",
      mappedSamplePoolId: "pool_1",
      mappedSamplePoolName: "L".repeat(25),
    },
  );
  assert.equal(normalized.name, "N".repeat(60));
  assert.equal(normalized.symbol, "S".repeat(INPUT_LIMITS.symbolChars));
  assert.equal(
    normalized.samplePoolName,
    "L".repeat(INPUT_LIMITS.samplePoolNameChars),
  );
  assert.equal(normalized.simulationBatchId, "B".repeat(INPUT_LIMITS.idChars));
});

test("portable training project normalization rejects out-of-spec bundle fields", () => {
  assert.throws(
    () =>
      normalizePortableTrainingProjectForImport(
        {
          name: "N".repeat(INPUT_LIMITS.generalNameChars + 1),
          symbol: "AAPL",
          sample_pool_name: "Pool",
          summary_json: "{}",
        },
        {
          targetProjectId: "project_3",
          mappedSamplePoolId: "pool_3",
          mappedSamplePoolName: "",
        },
      ),
    /PORTABLE_DATA_IMPORT_INVALID/u,
  );
  assert.throws(
    () =>
      normalizePortableTrainingProjectForImport(
        {
          name: "Project",
          symbol: "AAPL",
          sample_pool_name: "P".repeat(INPUT_LIMITS.samplePoolNameChars + 1),
          summary_json: "{}",
        },
        {
          targetProjectId: "project_4",
          mappedSamplePoolId: "pool_4",
          mappedSamplePoolName: "",
        },
      ),
    /PORTABLE_DATA_IMPORT_INVALID/u,
  );
  assert.throws(
    () =>
      normalizePortableTrainingProjectForImport(
        {
          name: "Project",
          symbol: "S".repeat(INPUT_LIMITS.symbolChars + 1),
          sample_pool_name: "Pool",
          summary_json: "{}",
        },
        {
          targetProjectId: "project_5",
          mappedSamplePoolId: "pool_5",
          mappedSamplePoolName: "",
        },
      ),
    /PORTABLE_DATA_IMPORT_INVALID/u,
  );
});
