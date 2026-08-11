// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  findAppProductRootForRepoPath,
  getDesktopLocalApiApplicationOwnershipViolation,
  getDesktopLocalApiLayerBoundaryViolation,
  getFrontendAppShellBoundaryViolation,
  getFrontendBusinessFactImportViolation,
  getFrontendCustomIndicatorWorkspaceViolation,
  getFrontendCustomIndicatorRuntimeLeftoverViolation,
  getFrontendKernelReplacementForAppShellImport,
  getFrontendRuntimeApiPrivateImportViolation,
  getFrontendSecondaryWindowBridgeBoundaryViolation,
  getTestAndDevProductLaneImportViolation,
  resolveRelativeImportRepoPath,
} from "./architecture-import-boundaries.mjs";

test("frontend modules outside api must import the runtime API through the public entry", () => {
  const violation = getFrontendRuntimeApiPrivateImportViolation({
    importerRelPath: "apps/desktop/web/src/workspaces/data/useDataConfig.ts",
    specifier: "@/api/localData",
    relativeTargetRelPath: null,
  });

  assert.match(violation, /Import from "@\/api" instead of "@\/api\/localData"/u);
});

test("frontend api modules may keep private imports inside the api owner", () => {
  const violation = getFrontendRuntimeApiPrivateImportViolation({
    importerRelPath: "apps/desktop/web/src/api/index.ts",
    specifier: "@/api/localData",
    relativeTargetRelPath: null,
  });

  assert.equal(violation, null);
});

test("relative imports into frontend api subpaths are still private imports", () => {
  const relativeTargetRelPath = resolveRelativeImportRepoPath(
    "apps/desktop/web/src/domains/data-import/importWorkflow.ts",
    "../../api/localData",
  );
  const violation = getFrontendRuntimeApiPrivateImportViolation({
    importerRelPath: "apps/desktop/web/src/domains/data-import/importWorkflow.ts",
    specifier: "../../api/localData",
    relativeTargetRelPath,
  });

  assert.equal(relativeTargetRelPath, "apps/desktop/web/src/api/localData");
  assert.match(violation, /runtime API subpaths are private/u);
});

test("api domain and workspace modules must not import app-shell composition", () => {
  assert.match(
    getFrontendAppShellBoundaryViolation({
      importerRelPath: "apps/desktop/web/src/domains/account/accountModel.ts",
      specifier: "@/app-shell/appTypes",
      relativeTargetRelPath: null,
    }),
    /must not import app-shell composition code/u,
  );
  assert.match(
    getFrontendAppShellBoundaryViolation({
      importerRelPath: "apps/desktop/web/src/workspaces/trainer/trainerModel.ts",
      specifier: "../../app-shell/useAppDialogState",
      relativeTargetRelPath: "apps/desktop/web/src/app-shell/useAppDialogState",
    }),
    /must not import app-shell composition code/u,
  );
});

test("frontend-kernel replacement map catches migrated app-shell shared helpers", () => {
  assert.equal(
    getFrontendKernelReplacementForAppShellImport("@/app-shell/appMath"),
    "@/frontend-kernel/math",
  );
  assert.equal(
    getFrontendKernelReplacementForAppShellImport("@/app-shell/appTypes"),
    "@/frontend-kernel/appTypes",
  );
});

test("secondary-window bridge stays private to app-shell composition", () => {
  assert.match(
    getFrontendSecondaryWindowBridgeBoundaryViolation({
      importerRelPath: "apps/desktop/web/src/secondaryWindowMain.tsx",
      specifier: "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge",
      relativeTargetRelPath: null,
    }),
    /bridge is private to app-shell composition/u,
  );
  assert.equal(
    getFrontendSecondaryWindowBridgeBoundaryViolation({
      importerRelPath:
        "apps/desktop/web/src/app-shell/secondaryWindows/DesktopSecondaryWindowRoot.tsx",
      specifier: "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge",
      relativeTargetRelPath: null,
    }),
    null,
  );
});

test("indicators domain must not depend on the custom-indicator workspace", () => {
  assert.match(
    getFrontendCustomIndicatorWorkspaceViolation({
      importerRelPath: "apps/desktop/web/src/domains/indicators/runtime.ts",
      specifier: "@/workspaces/custom-indicator/parser",
      relativeTargetRelPath: null,
    }),
    /must not depend on the custom-indicator workspace/u,
  );
  assert.match(
    getFrontendCustomIndicatorWorkspaceViolation({
      importerRelPath: "apps/desktop/web/src/domains/indicators/runtime.ts",
      specifier: "../../workspaces/custom-indicator/parser",
      relativeTargetRelPath: "apps/desktop/web/src/workspaces/custom-indicator/parser",
    }),
    /must not depend on the custom-indicator workspace/u,
  );
});

test("desktop web may only runtime-import shared business facts from render-format helpers", () => {
  assert.match(
    getFrontendBusinessFactImportViolation({
      importerRelPath:
        "apps/desktop/web/src/workspaces/special-training/SpecialTrainingPage.tsx",
      specifier: "@zinuto/shared/domain-calculations/fast-decision",
      isRuntimeImport: true,
    }),
    /Desktop web must stay thin/u,
  );
  assert.equal(
    getFrontendBusinessFactImportViolation({
      importerRelPath:
        "apps/desktop/web/src/workspaces/special-training/domain/specialTrainingTypes.ts",
      specifier:
        "@zinuto/shared/domain-calculations/fast-decision-capital-review",
      isRuntimeImport: false,
    }),
    null,
  );
  assert.equal(
    getFrontendBusinessFactImportViolation({
      importerRelPath:
        "apps/desktop/web/src/workspaces/special-training/fastDecisionRatioGauge.ts",
      specifier: "@zinuto/shared/domain-calculations/fast-decision",
      isRuntimeImport: true,
    }),
    null,
  );
  assert.match(
    getFrontendBusinessFactImportViolation({
      importerRelPath:
        "apps/desktop/web/src/workspaces/challenge-stats/challengeStatsModeRegistry.ts",
      specifier: "@zinuto/shared/specialTrainingModes",
      isRuntimeImport: true,
    }),
    /special-training mode business helper/u,
  );
  assert.match(
    getFrontendBusinessFactImportViolation({
      importerRelPath:
        "apps/desktop/web/src/workspaces/data/dataConfig/useDataConfigImportAccess.ts",
      specifier: "@zinuto/shared/specialTrainingModes",
      isRuntimeImport: true,
    }),
    /special-training mode business helper/u,
  );
});

test("desktop web custom-indicator evaluator and runtime leftovers are flagged", () => {
  assert.match(
    getFrontendCustomIndicatorRuntimeLeftoverViolation(
      "apps/desktop/web/src/workspaces/custom-indicator/ast/evaluator.ts",
    ),
    /evaluator\/runtime code must not remain/u,
  );
  assert.match(
    getFrontendCustomIndicatorRuntimeLeftoverViolation(
      "apps/desktop/web/src/domains/custom-indicator/indicator/runtimeWorkerClient.ts",
    ),
    /local-api v1 endpoints/u,
  );
  assert.equal(
    getFrontendCustomIndicatorRuntimeLeftoverViolation(
      "apps/desktop/web/src/domains/custom-indicator/indicator/renderAdapter.ts",
    ),
    null,
  );
});

test("desktop local-api layers keep http application port infrastructure direction", () => {
  assert.match(
    getDesktopLocalApiApplicationOwnershipViolation(
      "apps/desktop/local-api/src/application/trading/sessionStore.ts",
    ),
    /persistence stores and repositories belong under infrastructure/u,
  );
  assert.equal(
    getDesktopLocalApiApplicationOwnershipViolation(
      "apps/desktop/local-api/src/application/trading/sessionService.ts",
    ),
    null,
  );
  assert.equal(
    getDesktopLocalApiApplicationOwnershipViolation(
      "apps/desktop/local-api/src/application/ports/infrastructure/db/trading/sessionStore.ts",
    ),
    null,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath: "apps/desktop/local-api/src/domain/trading/orderQuote.ts",
      specifier: "../../application/trading/sessionService",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/application/trading/sessionService",
    }),
    /domain modules must stay pure/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath: "apps/desktop/local-api/src/kernel/runtimeLimits.ts",
      specifier: "../runtime/startupStatus",
      relativeTargetRelPath: "apps/desktop/local-api/src/runtime/startupStatus",
    }),
    /kernel modules must stay layer-neutral/u,
  );
  assert.equal(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/ports/marketReader.ts",
      specifier: "../../infrastructure/db/marketDatabase",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/infrastructure/db/marketDatabase",
      isRuntimeImport: true,
    }),
    null,
  );
  assert.equal(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/ports/marketReader.ts",
      specifier: "../../infrastructure/db/marketDatabase",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/infrastructure/db/marketDatabase",
      isRuntimeImport: false,
    }),
    null,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/ports/historyReader.ts",
      specifier: "../historyService",
      relativeTargetRelPath: "apps/desktop/local-api/src/application/historyService",
      isRuntimeImport: true,
    }),
    /application ports must not depend on application implementations/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/trading/sessionService.ts",
      specifier: "../http/response",
      relativeTargetRelPath: "apps/desktop/local-api/src/http/response",
    }),
    /application modules must not import HTTP adapter code/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/trading/sessionService.ts",
      specifier: "../../infrastructure/db/trading/sessionResumeStore",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/infrastructure/db/trading/sessionResumeStore",
    }),
    /must depend on ports, not adapters/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/trading/sessionService.ts",
      specifier: "../../runtime/startupStatus",
      relativeTargetRelPath: "apps/desktop/local-api/src/runtime/startupStatus",
    }),
    /must depend on ports, not adapters/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/infrastructure/db/database.ts",
      specifier: "../../application/trading/sessionService",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/application/trading/sessionService",
    }),
    /infrastructure modules must not import application code/u,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/infrastructure/repositories/trading/sessionRepository.ts",
      specifier: "../../../application/ports",
      relativeTargetRelPath: "apps/desktop/local-api/src/application/ports",
      isRuntimeImport: true,
    }),
    /only type-import application ports/u,
  );
  assert.equal(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/infrastructure/repositories/trading/sessionRepository.ts",
      specifier: "../../../application/ports",
      relativeTargetRelPath: "apps/desktop/local-api/src/application/ports",
      isRuntimeImport: false,
    }),
    null,
  );
  assert.match(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/historyRetentionStore.ts",
      specifier: "./historyRetentionService",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/application/historyRetentionService",
    }),
    /store modules must not import application services/u,
  );
  assert.equal(
    getDesktopLocalApiLayerBoundaryViolation({
      importerRelPath:
        "apps/desktop/local-api/src/application/historyRetentionStore.ts",
      specifier: "./historyRetentionTypes",
      relativeTargetRelPath:
        "apps/desktop/local-api/src/application/historyRetentionTypes",
    }),
    null,
  );
});

test("test and dev boundaries catch cross-lane app source imports", () => {
  assert.equal(
    findAppProductRootForRepoPath("apps/desktop/web/tests/data-import/import.test.ts")?.id,
    "desktop-web",
  );
  assert.equal(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "apps/desktop/web/tests/data-import/import.test.ts",
      specifier: "../../src/api",
      relativeTargetRelPath: "apps/desktop/web/src/api",
    }),
    null,
  );
  assert.match(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "apps/desktop/local-api/tests/app/runtime.test.ts",
      specifier: "../../../web/src/api",
      relativeTargetRelPath: "apps/desktop/web/src/api",
    }),
    /Tests must not source-import across product lanes/u,
  );
  assert.match(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "apps/desktop/web/tests/ui/native-menu.test.ts",
      specifier: "../../../shell/src/platform/native_menu.rs",
      relativeTargetRelPath: "apps/desktop/shell/src/platform/native_menu.rs",
    }),
    /desktop web -> desktop shell/u,
  );
  assert.match(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "packages/shared/tests/runtime.test.ts",
      specifier: "../../apps/desktop/local-api/src/application/dataSourceService",
      relativeTargetRelPath: "apps/desktop/local-api/src/application/dataSourceService",
    }),
    /Shared tests must not source-import app product-line internals/u,
  );
  assert.match(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "tools/dev/load-fixture.mts",
      specifier: "../../apps/desktop/local-api/src/application/dataSource",
      relativeTargetRelPath: "apps/desktop/local-api/src/application/dataSource",
    }),
    /tools\/dev scripts must not source-import app product-line internals/u,
  );
  assert.match(
    getTestAndDevProductLaneImportViolation({
      importerRelPath: "tools/quality/example.test.mjs",
      specifier: "../../apps/desktop/web/src/api",
      relativeTargetRelPath: "apps/desktop/web/src/api",
    }),
    /Tool tests must not source-import app product-line internals/u,
  );
});
