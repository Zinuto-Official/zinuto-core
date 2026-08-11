// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_RULES_END,
  GENERATED_RULES_START,
  buildExpectedAgentBlocks,
  checkAgentsRules,
  readAgentScopes,
  validateAgentScopes,
} from "./agents-rules.mjs";

test("one generated root block covers every registered path scope", () => {
  const blocks = buildExpectedAgentBlocks();
  assert.equal(blocks.size, 1);
  for (const [agentPath, block] of blocks) {
    assert.equal(agentPath, "AGENTS.md");
    assert.ok(block.startsWith(GENERATED_RULES_START), `${agentPath} should start with marker`);
    assert.ok(block.endsWith(GENERATED_RULES_END), `${agentPath} should end with marker`);
    assert.match(block, /npm run check:affected -- --files <changed-files\.\.\.>/u);
    assert.match(block, /npm run check:full/u);
    assert.match(block, /File budgets/u);
  }
  const scopes = readAgentScopes();
  assert.equal(scopes.length, 8);
  assert.ok(scopes.some((scope) => (
    scope.path === "apps/desktop/local-api/src/infrastructure/assets/system-market-seed"
  )));
  assert.deepEqual(validateAgentScopes(), []);
  const invalidScopes = structuredClone(scopes);
  invalidScopes[1].path = "apps/desktop/data";
  assert.ok(validateAgentScopes(invalidScopes).some((failure) => (
    failure.includes("apps/desktop/data")
  )));
});

test("checked-in AGENTS rules are generated from the shared rule sources", () => {
  const result = checkAgentsRules({ write: false });
  assert.deepEqual(result.failures, []);
});
