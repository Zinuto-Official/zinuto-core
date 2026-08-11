// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  loadLazyModuleWithinDeadline,
  resolveLazyModuleRecoveryAction,
  shouldReloadAfterRepeatedLazyModuleFailure,
} from "../../src/frontend-kernel/RetryableLazyModuleSurface";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("lazy module loading rejects at a bounded deadline", async () => {
  await assert.rejects(
    loadLazyModuleWithinDeadline(
      "TEST_SURFACE",
      () => new Promise<never>(() => undefined),
      10,
    ),
    /LAZY_MODULE_TEST_SURFACE_TIMEOUT/,
  );
  await assert.doesNotReject(
    loadLazyModuleWithinDeadline(
      "TEST_SURFACE_READY",
      async () => ({ default: "ready" }),
      100,
    ),
  );
});

test("repeated cached chunk failures escalate from scoped retry to page recovery", () => {
  for (const error of [
    new TypeError("Failed to fetch dynamically imported module"),
    new Error("Importing a module script failed."),
    new Error("ChunkLoadError: Loading chunk 42 failed"),
    new Error("Unable to preload CSS for /assets/example.css"),
  ]) {
    assert.equal(shouldReloadAfterRepeatedLazyModuleFailure(error), true);
  }
  assert.equal(
    shouldReloadAfterRepeatedLazyModuleFailure(
      new Error("LAZY_MODULE_MAIN_APP_RUNTIME_TIMEOUT"),
    ),
    false,
  );
  assert.equal(
    shouldReloadAfterRepeatedLazyModuleFailure(new Error("render failed")),
    false,
  );

  const cachedChunkFailure = new TypeError(
    "Failed to fetch dynamically imported module",
  );
  assert.equal(resolveLazyModuleRecoveryAction(0, cachedChunkFailure), "retry");
  assert.equal(resolveLazyModuleRecoveryAction(1, cachedChunkFailure), "reload");
  assert.equal(
    resolveLazyModuleRecoveryAction(4, new Error("render failed")),
    "retry",
  );
  assert.equal(
    resolveLazyModuleRecoveryAction(
      4,
      new Error("LAZY_MODULE_WORKSPACE_HISTORY_TIMEOUT"),
    ),
    "retry",
  );
});

test("critical and optional lazy chunks use scoped retry surfaces", () => {
  const lazySurfaceSource = readSource(
    "src/frontend-kernel/RetryableLazyModuleSurface.tsx",
  );
  const mainSource = readSource("src/app-shell/mainApp.ts");
  const mainBootSource = readSource("src/app-shell/MainAppBoot.tsx");
  const desktopShellSource = readSource(
    "src/app-shell/AppRootDesktopShell.tsx",
  );
  const runtimeHostSource = readSource(
    "src/app-shell/runtime/RuntimeAppHost.tsx",
  );
  const workspaceSwitcherSource = readSource(
    "src/workspaces/WorkspacePageSwitcher.tsx",
  );

  assert.match(lazySurfaceSource, /LAZY_MODULE_LOAD_DEADLINE_MS\s*=\s*4_000/);
  assert.match(lazySurfaceSource, /key=\{attempt\}/);
  assert.match(lazySurfaceSource, /setAttempt\(\(currentAttempt\)/);
  assert.match(lazySurfaceSource, /attempt > 0/);
  assert.match(lazySurfaceSource, /window\.location\.reload\(\)/);
  assert.match(mainSource, /moduleName:\s*'MAIN_APP_BOOT'/);
  assert.match(mainBootSource, /moduleName="MAIN_APP_RUNTIME"/);
  assert.match(mainBootSource, /RetryableLazyModuleSurface/);
  assert.match(desktopShellSource, /moduleName="APP_TRAINER_MODAL_HOST"/);
  assert.match(desktopShellSource, /moduleName="APP_UTILITY_DIALOGS"/);
  assert.match(
    runtimeHostSource,
    /moduleName="RUNTIME_TRAINER_CHART_LIFECYCLE"/,
  );
  assert.equal(
    workspaceSwitcherSource.match(/<RetryableWorkspacePageSurface/g)?.length,
    9,
  );
  assert.match(workspaceSwitcherSource, /WORKSPACE_PAGE_MODULE_LOADERS/);
  assert.match(
    workspaceSwitcherSource,
    /page === "COMMAND_CENTER"[\s\S]*?<WorkspacePageLoadBoundary/,
  );
  assert.doesNotMatch(workspaceSwitcherSource, /\blazy\(/);
});
