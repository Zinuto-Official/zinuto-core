// SPDX-License-Identifier: GPL-3.0-only

import path from "node:path";
import {
  FRONTEND_API_DOMAIN_MODULE_ROOT,
  FRONTEND_API_ENTRY_FILE,
} from "./architecture-guard-config.mjs";

export const APP_PRODUCT_ROOTS = [
  {
    id: "desktop-web",
    label: "desktop web",
    relPath: "apps/desktop/web/",
  },
  {
    id: "desktop-local-api",
    label: "desktop local API",
    relPath: "apps/desktop/local-api/",
  },
  {
    id: "desktop-shell",
    label: "desktop shell",
    relPath: "apps/desktop/shell/",
  },
];

const stripTrailingSlash = (value) => String(value ?? "").replace(/\/+$/u, "");

export const normalizeRepoPath = (value) =>
  stripTrailingSlash(
    String(value ?? "")
      .replaceAll("\\", "/")
      .replace(/^\.\/+/u, "")
      .replace(/^\/+/u, ""),
  );

export const pathIsRepoPathInside = (targetPath, parentPath) => {
  const target = normalizeRepoPath(targetPath);
  const parent = normalizeRepoPath(parentPath);
  return Boolean(parent) && (target === parent || target.startsWith(`${parent}/`));
};

export const resolveRelativeImportRepoPath = (importerRelPath, specifier) => {
  if (
    typeof specifier !== "string" ||
    (!specifier.startsWith("./") && !specifier.startsWith("../"))
  ) {
    return null;
  }
  return normalizeRepoPath(
    path.posix.normalize(
      path.posix.join(path.posix.dirname(normalizeRepoPath(importerRelPath)), specifier),
    ),
  );
};

export const findAppProductRootForRepoPath = (repoPath) => {
  const normalizedPath = normalizeRepoPath(repoPath);
  return (
    APP_PRODUCT_ROOTS.find((rootInfo) =>
      pathIsRepoPathInside(normalizedPath, rootInfo.relPath),
    ) ?? null
  );
};

export const findAppProductRootForSpecifier = (specifier, relativeTargetRelPath) => {
  if (relativeTargetRelPath) {
    const relativeTargetRoot = findAppProductRootForRepoPath(relativeTargetRelPath);
    if (relativeTargetRoot) {
      return relativeTargetRoot;
    }
  }
  const normalizedSpecifier = String(specifier ?? "").replaceAll("\\", "/");
  const appPathIndex = normalizedSpecifier.indexOf("apps/");
  const candidate = normalizeRepoPath(
    appPathIndex >= 0 ? normalizedSpecifier.slice(appPathIndex) : normalizedSpecifier,
  );
  return (
    APP_PRODUCT_ROOTS.find(
      (rootInfo) =>
        candidate === normalizeRepoPath(rootInfo.relPath) ||
        pathIsRepoPathInside(candidate, rootInfo.relPath),
    ) ?? null
  );
};

const FRONTEND_SRC_ROOT = "apps/desktop/web/src";
const FRONTEND_API_ROOT = normalizeRepoPath(FRONTEND_API_DOMAIN_MODULE_ROOT);
const FRONTEND_COMPOSITION_ENTRY_FILES = new Set();
const FRONTEND_APP_SHELL_ROOT = "apps/desktop/web/src/app-shell";
const FRONTEND_SECONDARY_WINDOW_BRIDGE =
  "apps/desktop/web/src/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
const FRONTEND_CUSTOM_INDICATOR_WORKSPACE_ROOT =
  "apps/desktop/web/src/workspaces/custom-indicator";
const FRONTEND_INDICATORS_DOMAIN_ROOT = "apps/desktop/web/src/domains/indicators";
const FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT =
  "apps/desktop/web/src/domains/custom-indicator";
const LOCAL_API_SRC_ROOT = "apps/desktop/local-api/src";
const LOCAL_API_DOMAIN_ROOT = `${LOCAL_API_SRC_ROOT}/domain`;
const LOCAL_API_KERNEL_ROOT = `${LOCAL_API_SRC_ROOT}/kernel`;
const LOCAL_API_APPLICATION_ROOT = `${LOCAL_API_SRC_ROOT}/application`;
const LOCAL_API_APPLICATION_PORTS_ROOT = `${LOCAL_API_APPLICATION_ROOT}/ports`;
const LOCAL_API_HTTP_ROOT = `${LOCAL_API_SRC_ROOT}/http`;
const LOCAL_API_INFRASTRUCTURE_ROOT = `${LOCAL_API_SRC_ROOT}/infrastructure`;
const LOCAL_API_RUNTIME_ROOT = `${LOCAL_API_SRC_ROOT}/runtime`;

const stripModuleExtension = (value) =>
  normalizeRepoPath(value).replace(/(?:\.d)?\.[cm]?[jt]sx?$/u, "");

export const isFrontendApiDomainModuleFile = (relPath) =>
  pathIsRepoPathInside(relPath, FRONTEND_API_ROOT);

export const isFrontendApiPrivateSubpathImportSpecifier = (specifier) =>
  String(specifier ?? "").startsWith("@/api/");

export const isFrontendAppShellImportSpecifier = (specifier) =>
  specifier === "@/app-shell" || String(specifier ?? "").startsWith("@/app-shell/");

export const isFrontendCustomIndicatorWorkspaceImportSpecifier = (specifier) =>
  specifier === "@/workspaces/custom-indicator" ||
  String(specifier ?? "").startsWith("@/workspaces/custom-indicator/");

export const FRONTEND_KERNEL_APP_SHELL_IMPORT_REPLACEMENTS = new Map([
  ["@/app-shell/AppModal", "@/ui/components/AppModal"],
  ["@/app-shell/appErrorUtils", "@/frontend-kernel/errors/appErrorUtils"],
  ["@/app-shell/appMath", "@/frontend-kernel/math"],
  ["@/app-shell/appNotices", "@/frontend-kernel/notifications/globalNoticeDialog"],
  ["@/app-shell/appReplayNoteMapping", "@/domains/notes/replayNoteMapping"],
  ["@/app-shell/appRuntimeConstants", "@/frontend-kernel/runtimeConstants"],
  ["@/app-shell/appSpecialTrainingContracts", "@/domains/special-training/specialTrainingContracts"],
  ["@/app-shell/appTypography", "@/frontend-kernel/typography"],
  ["@/app-shell/appTypes", "@/frontend-kernel/appTypes"],
  ["@/app-shell/desktopWebsiteUrls", "@/frontend-kernel/desktopWebsiteUrls"],
  ["@/app-shell/appUiOptions", "@/frontend-kernel/uiOptions"],
  ["@/app-shell/appValueFormat", "@/frontend-kernel/valueFormat"],
  ["@/app-shell/appTradingFormUtils", "@/domains/trainer/tradingFormUtils"],
  ["@/app-shell/loadChallengeProjectDetail", "@/workspaces/challenge-stats/useTrainingStatsPageController"],
  ["@/app-shell/notices/DesktopNoticeBar", "@/domains/desktop-notices/DesktopNoticeBar"],
  ["@/app-shell/notices/DesktopNoticeDetailPanel", "@/domains/desktop-notices/DesktopNoticeDetailPanel"],
  ["@/app-shell/notices/desktopNoticePresentation", "@/domains/desktop-notices/desktopNoticePresentation"],
  ["@/app-shell/onboarding/desktopOnboardingModel", "@/domains/onboarding/desktopOnboardingModel"],
  ["@/app-shell/tradingCalendarUi", "@/domains/data-import/tradingCalendarUi"],
  ["@/app-shell/trainingStatsViewCache", "@/workspaces/challenge-stats/trainingStatsViewCache"],
  ["@/app-shell/useHistoryReplayChartBindings", "@/domains/chart/useHistoryReplayChartBindings"],
  ["@/ui/formatting/runtimeLimits", "@/frontend-kernel/runtimeLimits"],
  ["@/workspaces/notes/replayNoteSemantics", "@/domains/notes/replayNoteSemantics"],
  [
    "@/app-shell/secondaryWindows/desktopSecondaryWindowManagerModel",
    "@/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel",
  ],
  [
    "@/app-shell/secondaryWindows/desktopWindowViewportConfig",
    "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig",
  ],
]);

export const getFrontendKernelReplacementForAppShellImport = (specifier) =>
  FRONTEND_KERNEL_APP_SHELL_IMPORT_REPLACEMENTS.get(specifier) ?? null;

export const getFrontendRuntimeApiPrivateImportViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  if (
    !pathIsRepoPathInside(importerRelPath, FRONTEND_SRC_ROOT) ||
    isFrontendApiDomainModuleFile(importerRelPath) ||
    FRONTEND_COMPOSITION_ENTRY_FILES.has(normalizeRepoPath(importerRelPath))
  ) {
    return null;
  }
  const importsApiPrivateSubpath =
    isFrontendApiPrivateSubpathImportSpecifier(specifier) ||
    (relativeTargetRelPath &&
      pathIsRepoPathInside(relativeTargetRelPath, FRONTEND_API_ROOT) &&
      normalizeRepoPath(relativeTargetRelPath) !== normalizeRepoPath(FRONTEND_API_ENTRY_FILE));
  return importsApiPrivateSubpath
    ? `Frontend runtime API subpaths are private to apps/desktop/web/src/api/*. Import from "@/api" instead of "${specifier}".`
    : null;
};

export const getFrontendAppShellBoundaryViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  if (
    !(
      pathIsRepoPathInside(importerRelPath, "apps/desktop/web/src/api") ||
      pathIsRepoPathInside(importerRelPath, "apps/desktop/web/src/domains") ||
      pathIsRepoPathInside(importerRelPath, "apps/desktop/web/src/workspaces")
    )
  ) {
    return null;
  }
  const importsAppShell =
    isFrontendAppShellImportSpecifier(specifier) ||
    (relativeTargetRelPath &&
      pathIsRepoPathInside(relativeTargetRelPath, FRONTEND_APP_SHELL_ROOT));
  return importsAppShell
    ? `api/domain/workspace modules must not import app-shell composition code via "${specifier}". Move the shared contract/helper to its owner module first.`
    : null;
};

export const getFrontendSecondaryWindowBridgeBoundaryViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  if (
    !pathIsRepoPathInside(importerRelPath, FRONTEND_SRC_ROOT) ||
    pathIsRepoPathInside(importerRelPath, FRONTEND_APP_SHELL_ROOT)
  ) {
    return null;
  }
  const importsSecondaryWindowBridge =
    specifier === "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge" ||
    (relativeTargetRelPath &&
      pathIsRepoPathInside(relativeTargetRelPath, FRONTEND_SECONDARY_WINDOW_BRIDGE));
  return importsSecondaryWindowBridge
    ? `Secondary-window bridge is private to app-shell composition. Import runtime actions from "@/api" and pure contracts from "@/frontend-kernel/secondary-windows" instead of "${specifier}".`
    : null;
};

export const getFrontendCustomIndicatorWorkspaceViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  if (!pathIsRepoPathInside(importerRelPath, FRONTEND_INDICATORS_DOMAIN_ROOT)) {
    return null;
  }
  const importsCustomIndicatorWorkspace =
    isFrontendCustomIndicatorWorkspaceImportSpecifier(specifier) ||
    (relativeTargetRelPath &&
      pathIsRepoPathInside(relativeTargetRelPath, FRONTEND_CUSTOM_INDICATOR_WORKSPACE_ROOT));
  return importsCustomIndicatorWorkspace
    ? `domains/indicators must not depend on the custom-indicator workspace. Move shared indicator runtime code into a neutral domain module instead of importing "${specifier}".`
    : null;
};

const FRONTEND_BUSINESS_FACT_SHARED_IMPORTS = [
  {
    matches: (specifier) =>
      specifier.startsWith("@zinuto/shared/domain-calculations/"),
    label: "shared domain calculation",
  },
  {
    matches: (specifier) => specifier === "@zinuto/shared/specialTrainingModes",
    label: "special-training mode business helper",
  },
  {
    matches: (specifier) => specifier === "@zinuto/shared/trading",
    label: "trading business helper",
  },
  {
    matches: (specifier) => specifier === "@zinuto/shared/replay",
    label: "replay business helper",
  },
];

const FRONTEND_BUSINESS_FACT_RENDER_FORMAT_EXCEPTIONS = [
  "apps/desktop/web/src/workspaces/special-training/fastDecisionRatioGauge.ts",
];

const FRONTEND_BUSINESS_FACT_RENDER_FORMAT_PATH_SEGMENTS = [
  "/ui/formatting/",
  "/frontend-kernel/valueFormat",
];

const FRONTEND_BUSINESS_FACT_RENDER_FORMAT_FILE_PATTERN =
  /(?:Presentation|ChartOptions|ChartLayout|Gauge|Formatter|Format)\.(?:ts|tsx)$/u;

const getFrontendBusinessFactSharedImportRule = (specifier) =>
  FRONTEND_BUSINESS_FACT_SHARED_IMPORTS.find((rule) =>
    rule.matches(String(specifier ?? "")),
  ) ?? null;

const isFrontendBusinessFactRenderFormatException = (relPath) => {
  const normalizedPath = normalizeRepoPath(relPath);
  return (
    FRONTEND_BUSINESS_FACT_RENDER_FORMAT_EXCEPTIONS.includes(normalizedPath) ||
    FRONTEND_BUSINESS_FACT_RENDER_FORMAT_PATH_SEGMENTS.some((segment) =>
      normalizedPath.includes(segment),
    ) ||
    FRONTEND_BUSINESS_FACT_RENDER_FORMAT_FILE_PATTERN.test(normalizedPath)
  );
};

export const getFrontendBusinessFactImportViolation = ({
  importerRelPath,
  specifier,
  isRuntimeImport = true,
}) => {
  if (
    !isRuntimeImport ||
    !pathIsRepoPathInside(importerRelPath, FRONTEND_SRC_ROOT)
  ) {
    return null;
  }
  const rule = getFrontendBusinessFactSharedImportRule(specifier);
  if (!rule || isFrontendBusinessFactRenderFormatException(importerRelPath)) {
    return null;
  }
  return `Desktop web must stay thin after the page migration: non-type imports of ${rule.label} "${specifier}" are only allowed in explicit render/format helpers. Move business fact derivation to the local-api/backend contract, or type-import DTOs only.`;
};

const FRONTEND_CUSTOM_INDICATOR_RUNTIME_LEFTOVER_PATHS = [
  `${FRONTEND_CUSTOM_INDICATOR_WORKSPACE_ROOT}/ast/evaluator`,
  `${FRONTEND_CUSTOM_INDICATOR_WORKSPACE_ROOT}/functions`,
  `${FRONTEND_CUSTOM_INDICATOR_WORKSPACE_ROOT}/runtime`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/runtime`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/indicator/compiler`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/indicator/runtime`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/indicator/runtime.worker`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/indicator/runtimeWorkerClient`,
  `${FRONTEND_CUSTOM_INDICATOR_DOMAIN_ROOT}/indicator/scriptRuntimeUtils`,
];

export const getFrontendCustomIndicatorRuntimeLeftoverViolation = (relPath) => {
  const normalizedPath = stripModuleExtension(relPath);
  const matchedPath = FRONTEND_CUSTOM_INDICATOR_RUNTIME_LEFTOVER_PATHS.find(
    (leftoverPath) =>
      normalizedPath === leftoverPath ||
      pathIsRepoPathInside(normalizedPath, leftoverPath),
  );
  if (!matchedPath) {
    return null;
  }
  return `Custom-indicator evaluator/runtime code must not remain in desktop web after the thin-page migration (${matchedPath}). Move execution/compilation behind local-api v1 endpoints and keep only web DTO, render, and formatting adapters.`;
};

const isDesktopLocalApiApplicationStoreModule = (relPath) => {
  const normalizedPath = stripModuleExtension(relPath);
  return (
    pathIsRepoPathInside(normalizedPath, LOCAL_API_APPLICATION_ROOT) &&
    (/(^|\/)[^/]*Store$/u.test(normalizedPath) ||
      normalizedPath.includes("/store/") ||
      normalizedPath.includes("/stores/"))
  );
};

export const getDesktopLocalApiApplicationOwnershipViolation = (relPath) => {
  const normalizedPath = stripModuleExtension(relPath);
  if (
    pathIsRepoPathInside(normalizedPath, LOCAL_API_APPLICATION_ROOT) &&
    !pathIsRepoPathInside(normalizedPath, LOCAL_API_APPLICATION_PORTS_ROOT) &&
    (/(^|\/)[^/]*(?:Store|Repository)$/u.test(normalizedPath) ||
      normalizedPath.includes("/store/") ||
      normalizedPath.includes("/stores/") ||
      normalizedPath.includes("/repositories/"))
  ) {
    return "desktop local-api persistence stores and repositories belong under infrastructure or behind application ports, not application.";
  }
  return null;
};

export const getDesktopLocalApiDomainKernelOwnershipViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  return getDesktopLocalApiLayerBoundaryViolation({
    importerRelPath,
    specifier,
    relativeTargetRelPath,
  });
};

const isDesktopLocalApiApplicationServiceModule = (relPath) => {
  const normalizedPath = stripModuleExtension(relPath);
  return (
    pathIsRepoPathInside(normalizedPath, LOCAL_API_APPLICATION_ROOT) &&
    /Service$/u.test(path.posix.basename(normalizedPath))
  );
};

export const getDesktopLocalApiLayerBoundaryViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
  isRuntimeImport = true,
}) => {
  const importer = stripModuleExtension(importerRelPath);
  const target = relativeTargetRelPath
    ? stripModuleExtension(relativeTargetRelPath)
    : stripModuleExtension(specifier);

  if (
    pathIsRepoPathInside(importer, LOCAL_API_DOMAIN_ROOT) &&
    (pathIsRepoPathInside(target, LOCAL_API_APPLICATION_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_HTTP_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_INFRASTRUCTURE_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_RUNTIME_ROOT))
  ) {
    return `desktop local-api domain modules must stay pure and must not import app/runtime adapter code via "${specifier}".`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_KERNEL_ROOT) &&
    (pathIsRepoPathInside(target, LOCAL_API_DOMAIN_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_APPLICATION_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_HTTP_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_INFRASTRUCTURE_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_RUNTIME_ROOT))
  ) {
    return `desktop local-api kernel modules must stay layer-neutral and must not import app/runtime adapter code via "${specifier}".`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_APPLICATION_PORTS_ROOT) &&
    ((pathIsRepoPathInside(target, LOCAL_API_APPLICATION_ROOT) &&
      !pathIsRepoPathInside(target, LOCAL_API_APPLICATION_PORTS_ROOT)) ||
      pathIsRepoPathInside(target, LOCAL_API_HTTP_ROOT))
  ) {
    return `desktop local-api application ports must not depend on application implementations or HTTP adapters via "${specifier}".`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_APPLICATION_ROOT) &&
    pathIsRepoPathInside(target, LOCAL_API_HTTP_ROOT)
  ) {
    return `desktop local-api application modules must not import HTTP adapter code via "${specifier}". Keep direction http route -> application use case.`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_APPLICATION_ROOT) &&
    !pathIsRepoPathInside(importer, LOCAL_API_APPLICATION_PORTS_ROOT) &&
    (pathIsRepoPathInside(target, LOCAL_API_INFRASTRUCTURE_ROOT) ||
      pathIsRepoPathInside(target, LOCAL_API_RUNTIME_ROOT))
  ) {
    return `desktop local-api application modules must depend on ports, not adapters, via "${specifier}". Move the adapter binding behind application/ports.`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_INFRASTRUCTURE_ROOT) &&
    pathIsRepoPathInside(target, LOCAL_API_APPLICATION_PORTS_ROOT) &&
    isRuntimeImport
  ) {
    return `desktop local-api infrastructure modules may only type-import application ports via "${specifier}".`;
  }

  if (
    pathIsRepoPathInside(importer, LOCAL_API_INFRASTRUCTURE_ROOT) &&
    pathIsRepoPathInside(target, LOCAL_API_APPLICATION_ROOT)
    && !pathIsRepoPathInside(target, LOCAL_API_APPLICATION_PORTS_ROOT)
  ) {
    return `desktop local-api infrastructure modules must not import application code via "${specifier}". Keep direction application port -> infrastructure implementation.`;
  }

  if (
    isDesktopLocalApiApplicationStoreModule(importer) &&
    isDesktopLocalApiApplicationServiceModule(target)
  ) {
    return `desktop local-api store modules must not import application services via "${specifier}". Move shared contracts/types to neutral application modules.`;
  }

  return null;
};

export const getTestAndDevProductLaneImportViolation = ({
  importerRelPath,
  specifier,
  relativeTargetRelPath,
}) => {
  const normalizedImporterRelPath = normalizeRepoPath(importerRelPath);
  const targetRoot = findAppProductRootForSpecifier(specifier, relativeTargetRelPath);
  if (!targetRoot) {
    return null;
  }
  if (pathIsRepoPathInside(normalizedImporterRelPath, "tools/dev")) {
    return `tools/dev scripts must not source-import app product-line internals. Move the harness into the owning app and invoke it as a command instead of importing "${specifier}".`;
  }
  if (pathIsRepoPathInside(normalizedImporterRelPath, "tools")) {
    return `Tool tests must not source-import app product-line internals. Exercise an owning-lane command or public contract instead of importing "${specifier}".`;
  }
  if (pathIsRepoPathInside(normalizedImporterRelPath, "packages/shared/tests")) {
    return `Shared tests must not source-import app product-line internals. Move the fixture into the owning app or test a declared @zinuto/shared export instead of importing "${specifier}".`;
  }
  const importerRoot = findAppProductRootForRepoPath(normalizedImporterRelPath);
  if (importerRoot && targetRoot.id !== importerRoot.id) {
    return `Tests must not source-import across product lanes (${importerRoot.label} -> ${targetRoot.label}). Use public contracts, package exports, or an owning-lane harness instead of importing "${specifier}".`;
  }
  return null;
};
