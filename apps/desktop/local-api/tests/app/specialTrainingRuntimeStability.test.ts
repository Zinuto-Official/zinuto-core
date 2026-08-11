// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const challengeRuntimeRegistrySource = readFileSync(
  new URL(
    "../../src/application/specialTrainingService/challengeRuntimeRegistry.ts",
    import.meta.url,
  ),
  "utf8",
);

test("special training background challenge cleanup cannot crash the runtime", () => {
  assert.match(
    challengeRuntimeRegistrySource,
    /setInterval\(\(\) => \{\s*try \{\s*cleanupExpiredChallenges\(\);/u,
  );
  assert.match(
    challengeRuntimeRegistrySource,
    /catch \(error\) \{\s*console\.error\("\[special-training\] challenge cleanup failed"/u,
  );
});
