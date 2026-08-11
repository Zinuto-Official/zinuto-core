// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SUPPORTED_SCAFFOLDS,
  parseScaffoldArgs,
  resolveScaffoldFiles,
  resolveScaffoldPlan,
  writeScaffoldFiles,
} from "./scaffold-core.mjs";

const withTempRoot = (callback) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zinuto-gen-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("all public scaffolds generate bounded files with tests", () => {
  for (const scaffold of SUPPORTED_SCAFFOLDS) {
    withTempRoot((root) => {
      const options = parseScaffoldArgs([
        scaffold,
        "--name",
        "Sample Governance",
        "--owner",
        "workspace",
        "--root",
        root,
      ]);
      const files = resolveScaffoldFiles(options);
      const plan = resolveScaffoldPlan(options);
      assert.ok(files.length >= 2, `${scaffold} should create source and test files`);
      assert.ok(plan.metadata.ownerRoot, `${scaffold} should expose an owner root`);
      assert.ok(plan.metadata.verifyFiles.length > 0, `${scaffold} should expose verify files`);
      assert.deepEqual(plan.files.map((file) => file.path), files.map((file) => file.path));
      assert.match(plan.metadata.nextCommands[0] ?? "", /^npm run check:fast -- --files /u);
      assert.ok(
        files.some((file) => /tests?\//u.test(file.path) || /\.test\./u.test(file.path)),
        `${scaffold} should include a regression test skeleton`,
      );
      for (const file of files) {
        assert.ok(
          file.content.split(/\r?\n/u).length < 120,
          `${file.path} should stay well below file-size budgets`,
        );
      }
      const written = writeScaffoldFiles(files, options);
      assert.deepEqual(written, files.map((file) => file.path));
      for (const file of files) {
        assert.ok(fs.existsSync(path.join(root, file.path)), `${file.path} should be written`);
      }
    });
  }
});

test("route scaffolds use current owner paths", () => {
  const localApiPlan = resolveScaffoldPlan(
    parseScaffoldArgs(["local-api-route", "--name", "Quote Probe"]),
  );
  assert.ok(
    localApiPlan.files.some((file) =>
      file.path === "apps/desktop/local-api/src/http/quoteProbeRoutes.ts",
    ),
    "local-api route scaffolds must include an HTTP route owner file",
  );
  assert.ok(
    localApiPlan.files.some((file) =>
      file.path === "apps/desktop/local-api/src/http/apiSchemas/quoteProbeSchemas.ts",
    ),
    "local-api route scaffolds must include an HTTP schema owner file",
  );
});

test("desktop component validates owner options", () => {
  assert.throws(
    () =>
      resolveScaffoldFiles(
        parseScaffoldArgs([
          "desktop-component",
          "--name",
          "Risk Meter",
          "--owner",
          "app-shell",
        ]),
      ),
    /desktop-component --owner/u,
  );
});

test("scaffold writer refuses to overwrite existing files without force", () => {
  withTempRoot((root) => {
    const options = parseScaffoldArgs([
      "quality-check",
      "--name",
      "Rule Drift",
      "--root",
      root,
    ]);
    const files = resolveScaffoldFiles(options);
    writeScaffoldFiles(files, options);
    assert.throws(() => writeScaffoldFiles(files, options), /Refusing to overwrite/u);
    assert.doesNotThrow(() => writeScaffoldFiles(files, { ...options, force: true }));
  });
});
