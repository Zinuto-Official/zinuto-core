// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadArchitectureComposition } from "./architecture-composition.mjs";

const createFixture = () => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "zinuto-architecture-composition-"),
  );
  const files = [
    "apps/desktop/web/src/official/entry.tsx",
    "apps/desktop/web/src/official/nativeBridge.ts",
    "apps/desktop/local-api/src/official/runtime.ts",
  ];
  files.forEach((relPath) => {
    const absolutePath = path.join(projectRoot, relPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, "export {};\n");
  });
  const manifest = {
    backendEntryFiles: [files[2]],
    frontendEntryFiles: [files[0]],
    kind: "zinuto-desktop-materialized-composition",
    schemaVersion: 1,
    tauriBridgeFiles: [files[1]],
    tauriCustomCommands: ["official_account_open"],
  };
  const manifestPath = path.join(projectRoot, "architecture-composition.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath, projectRoot };
};

test("loads exact materialized composition entry and bridge authorities", () => {
  const fixture = createFixture();
  const composition = loadArchitectureComposition({
    projectRoot: fixture.projectRoot,
    manifestPath: fixture.manifestPath,
  });
  assert.deepEqual(
    composition.frontendEntryFiles,
    fixture.manifest.frontendEntryFiles,
  );
  assert.deepEqual(
    composition.backendEntryFiles,
    fixture.manifest.backendEntryFiles,
  );
  assert.deepEqual(
    composition.tauriBridgeFiles,
    fixture.manifest.tauriBridgeFiles,
  );
  assert.deepEqual(
    composition.tauriCustomCommands,
    fixture.manifest.tauriCustomCommands,
  );
});

test("rejects unknown keys, unsorted commands, traversal, and missing files", () => {
  const fixture = createFixture();
  const write = (overrides) => {
    fs.writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify({ ...fixture.manifest, ...overrides }, null, 2)}\n`,
    );
  };
  write({ extra: true });
  assert.throws(
    () => loadArchitectureComposition(fixture),
    /keys must be exactly/u,
  );
  write({ tauriCustomCommands: ["z_command", "a_command"] });
  assert.throws(() => loadArchitectureComposition(fixture), /must be sorted/u);
  write({ frontendEntryFiles: ["../escape.ts"] });
  assert.throws(
    () => loadArchitectureComposition(fixture),
    /invalid repository path/u,
  );
  write({ frontendEntryFiles: ["apps/desktop/web/src/official/missing.ts"] });
  assert.throws(() => loadArchitectureComposition(fixture), /missing file/u);
});
