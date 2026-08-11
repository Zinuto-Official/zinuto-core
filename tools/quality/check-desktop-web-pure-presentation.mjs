#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const frontendSrcRoot = path.join(projectRoot, "apps", "desktop", "web", "src");

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);
const maxPrintedViolations = 220;

const normalizePath = (value) => String(value ?? "").replaceAll(path.sep, "/");

const toRepoPath = (absolutePath) =>
  normalizePath(path.relative(projectRoot, absolutePath));

const toFrontendPath = (absolutePath) =>
  normalizePath(path.relative(frontendSrcRoot, absolutePath));

const normalizeInputPath = (value) => normalizePath(String(value ?? "").trim());

const absoluteFrontendFileFromInput = (value) => {
  const normalized = normalizeInputPath(value);
  if (!normalized) {
    return null;
  }
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : normalized.startsWith("apps/desktop/web/")
      ? path.join(projectRoot, normalized)
      : path.join(path.dirname(frontendSrcRoot), normalized);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(`${frontendSrcRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
};

const isSourceFile = (filePath) => sourceExtensions.has(path.extname(filePath));

const collectSourceFiles = (rootDir, files = []) => {
  if (!fs.existsSync(rootDir)) {
    return files;
  }
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, files);
      continue;
    }
    if (entry.isFile() && isSourceFile(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files.sort();
};

const wildcardToRegExp = (pattern) => {
  const escaped = String(pattern)
    .replace(/[|\\{}()[\]^$+?.]/gu, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "u");
};

const riskIdentifierRules = [
  {
    id: "business-calculation-name",
    pattern:
      /^(?:calc|calculate|compute|derive|evaluate|infer|estimate|summarize)[A-Z0-9_]/u,
    message:
      "calculation, derivation, estimate, or summary function in desktop web",
  },
  {
    id: "business-validation-name",
    pattern: /^(?:validate|is[A-Z0-9_].*Valid)[A-Z0-9_]/u,
    message: "validation function in desktop web",
  },
  {
    id: "business-resolution-name",
    pattern:
      /^(?:resolve|build|create|apply)[A-Z0-9_].*(?:Availability|Available|Disabled|Enabled|Blocked|BlockReason|Reason|Summary|Grade|Drawdown|Eligibility|Permission|Entitlement|Capacity|Quote|OrderAction|ActionState|Validation|Result|Conclusion|Risk|Pnl|Asset|Score|Status|RuntimeState)/u,
    message:
      "business fact, action state, reason, status, or result resolver in desktop web",
  },
  {
    id: "business-fact-name",
    pattern:
      /(?:ActionAvailability|FeatureAccess|DisabledReason|BlockedReason|UnavailableReason|BlockReason|Eligibility|Permission|Entitlement|SessionSummary|RuntimeState|RiskMetrics|Drawdown|Grade|Settlement|Conclusion)/u,
    message: "business fact identifier in desktop web",
  },
];

const riskyFileNameRule = {
  id: "business-fact-file-name",
  pattern:
    /(?:Availability|Validation|Summary|Reason|Metrics|Calculation|RuntimeState|ActionState|Eligibility|Permission|Grade|Drawdown|Capacity|Disabled|Enabled)/u,
  message: "business-fact-like source file name in desktop web",
};

const riskyImportRules = [
  {
    id: "domain-calculation-value-import",
    match: (hit) =>
      hit.kind === "import" &&
      hit.importKind !== "type" &&
      hit.source.startsWith("@zinuto/shared/domain-calculations/"),
    message:
      "desktop web must not import executable shared domain calculations",
  },
  {
    id: "business-fact-module-import",
    match: (hit) =>
      hit.kind === "import" &&
      /(?:ActionAvailability|FormValidation|SubscriptionSummary|subscriptionOwnership|SessionSummary|RuntimeState|ReplayMetrics|OutcomeSummary|hallSummaryStatus|EnvironmentSummary)/u.test(
        hit.source,
      ),
    message:
      "desktop web import points at a business fact, validation, permission, or summary module",
  },
];

const allowedPolicies = [
  {
    id: "type-only-contract-import",
    description:
      "Type-only imports may reference business-shaped contracts without executing or recomputing them.",
    match: (hit) => hit.kind === "import" && hit.importKind === "type",
  },
  {
    id: "react-component",
    description:
      "PascalCase TSX declarations are React surfaces; their props still need separate fact ownership.",
    match: (hit) =>
      hit.kind === "declaration" &&
      hit.file.endsWith(".tsx") &&
      /^[A-Z]/u.test(hit.name ?? ""),
  },
  {
    id: "api-wire-parsing",
    description:
      "API adapters may normalize and validate wire payload shape before handing data to React.",
    match: (hit) => hit.file.startsWith("api/"),
  },
  {
    id: "i18n-mapping",
    description:
      "Locale, copy, label, and error-message mapping is presentation ownership.",
    match: (hit) =>
      hit.file.startsWith("frontend-kernel/i18n/") ||
      hit.file.startsWith("ui/config/") ||
      /(?:Copy|Text|Message|Label|Locale|Language|DisplayName|Title|Caption|Description|Hint|Error|Tone|Icon|Badge|Asset|Url|CspNonce|Typography)/u.test(
        hit.name ?? "",
      ) ||
      /(?:Key|MessageId|LabelId)$/u.test(
        hit.name ?? "",
      ),
  },
  {
    id: "formatting",
    description:
      "Formatting and display adapters may reshape already-owned facts for UI.",
    match: (hit) =>
      /(?:Format|Display|Presentation|Preview|ProgressStage|ProgressPercent|Class|ClassName|Aria|Role|Option|Field|NamePrefix|DetailText|ListText|BodyText|ConfidenceText)/u.test(
        hit.name ?? "",
      ) ||
      /(?:DateRange|DisplayName)/u.test(
        hit.name ?? "",
      ) ||
      /DisplayName/u.test(
        hit.file,
      ),
  },
  {
    id: "chart-pixel-rendering",
    description:
      "Chart, geometry, canvas, and pixel rendering calculations are visual layout, not business fact ownership.",
    match: (hit) =>
      hit.file.startsWith("assets/graphics/") ||
      hit.file.startsWith("domains/chart/") ||
      /(?:Chart|Curve|Sparkline|Render|Renderer|Pixel|Geometry|Viewport|Placement|Tooltip|Width|Height|Layout|Extent|Bucket|Histogram|Slope|Figure|Color|Opacity|Contrast)/u.test(
        hit.name ?? "",
      ),
  },
  {
    id: "component-state",
    description:
      "Pure React state, routing, bootstrap, window, and dialog orchestration may decide visibility and transient UI flow.",
    match: (hit) =>
      /(?:Window|Dialog|Modal|Route|Search|Bootstrap|Boot|Loading|Skeleton|Viewport|Chrome|Shortcut|Hydration|RetryDelay|Retry|Refresh|Visibility|Open|Close|Keep|Fallback|Container|Portal|Current|Initial|Next|Stored|Preference|Language|Theme|Font|Toolbar|SegmentedControl|Onboarding|Tour|Persisted)/u.test(
        hit.name ?? "",
      ) ||
      /(?:Payload|Signature|SignatureParts|Persisted|Tour|Keydown|Key)$/u.test(
        hit.name ?? "",
      ),
  },
  {
    id: "input-orchestration",
    description:
      "Input staging and backend draft-validation orchestration may stay in desktop web.",
    match: (hit) =>
      hit.file === "app-shell/usePendingCsvDraftValidation.ts" ||
      hit.file === "app-shell/usePendingCsvImportPlanning.ts" ||
      hit.file === "app-shell/useAppCsvImportActions.ts" ||
      hit.file === "app-shell/AppCsvMappingModal.tsx" ||
      hit.file.startsWith("domains/data-import/") ||
      hit.file.startsWith("workspaces/custom-indicator/validation") ||
      hit.file === "workspaces/custom-indicator/CustomIndicatorSystemPage.tsx",
  },
  {
    id: "api-backed-read-model-adapter",
    description:
      "Adapters may map backend read-model status codes to UI labels without recomputing source facts.",
    match: (hit) =>
      hit.file === "workspaces/data/dataConfig/hallStatusReadModelAdapter.ts" ||
      hit.file === "workspaces/challenge-stats/challengeStatsReadModelFacts.ts" ||
      hit.file === "domains/notes/notesWorkspaceReadModelFacts.ts" ||
      hit.file === "workspaces/special-training/session/questionBankRuntimeCore.ts" ||
      hit.file === "workspaces/trainer/useTrainerWorkspaceViewModel.ts",
  },
  {
    id: "performance-and-storage-bookkeeping",
    description:
      "CRC, cache, performance, and storage summaries are technical bookkeeping, not product business truth.",
    match: (hit) =>
      hit.file === "domains/custom-indicator/indicator/profileStore.ts" ||
      hit.file === "domains/trainer/trainerPerfTrace.ts" ||
      hit.file === "app-shell/useGlobalResetStorageSummary.ts",
  },
];

const knownMigrationEntries = [];

const knownMigrationFileEntries = [];

const legacyTargetedChecks = [
  {
    file: "workspaces/special-training/session/questionBankRuntimeCore.ts",
    patterns: [
      {
        pattern:
          /totalQuestionCount[\s\S]{0,260}availableQuestionCount[\s\S]{0,120}\+[\s\S]{0,120}builtQuestionCount/u,
        message:
          "question bank total must come from backend summary, not available+built fallback.",
      },
      {
        pattern:
          /remainingQuestionCount[\s\S]{0,220}totalQuestionCount\s*-\s*completedQuestionCount/u,
        message:
          "question bank remaining count must come from backend summary, not frontend subtraction.",
      },
    ],
  },
  {
    file: "workspaces/special-training/banks/specialTrainingBankCardPresentation.ts",
    patterns: [
      {
        pattern:
          /enabledSamplePoolById\.get|resolvedPools|flatMap\(\(pool\)\s*=>\s*pool\.symbols/u,
        message:
          "bank card symbol/status presentation must use backend scopeSummary, not local pool maps.",
      },
    ],
  },
  {
    file: "workspaces/special-training/view-models/specialTrainingRiskDisciplineActionViewModel.ts",
    patterns: [
      {
        pattern: /fallbackBlockedReasonCode/u,
        message:
          "risk action state must not define frontend fallback blocked reasons.",
      },
      {
        pattern:
          /runtime\.(cashBalance|positionQty|openCount)|cursorIndex\s*>=\s*questionEndIndex|risk(?:Buy|Sell)EstimateQty\s*===\s*null/u,
        message:
          "risk action availability must come from backend actionState, not local runtime facts.",
      },
      {
        pattern: /QUESTION_LOADING|TRAINING_PAUSED/u,
        message:
          "risk action availability must not overlay frontend lifecycle/loading reasons.",
      },
    ],
  },
  {
    file: "workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState.ts",
    patterns: [
      {
        pattern: /lifecycleBlockedReason|loadingReason/u,
        message:
          "risk order quote display must not synthesize frontend lifecycle blocked reasons.",
      },
    ],
  },
  {
    file: "workspaces/special-training/SpecialTrainingPage.tsx",
    patterns: [
      {
        pattern:
          /serverCurrentTotalAsset[\s\S]{0,220}runtime\.initialCapital/u,
        message:
          "risk current total asset must come from backend runtime, not runtime.initialCapital fallback.",
      },
      {
        pattern: /serverFloatingPnl[\s\S]{0,160}:\s*0/u,
        message:
          "risk floating PnL must come from backend runtime, not a frontend zero fallback.",
      },
      {
        pattern:
          /serverCurrentPrice[\s\S]{0,220}currentBar\?\.close/u,
        message:
          "risk current price must come from backend runtime, not current bar fallback.",
      },
      {
        pattern:
          /lifecycleBlockedReason|blockedReasonCode:\s*['"](?:QUESTION_LOADING|TRAINING_PAUSED)['"]/u,
        message:
          "special-training lifecycle blocked reasons must come from backend runtime/read-model state.",
      },
    ],
  },
  {
    file: "workspaces/special-training/specialTrainingBankEditorModel.ts",
    patterns: [
      {
        pattern:
          /resolveSpecialTrainingBankEditorPoolDisabledReason|isSpecialTrainingBankEditorNameValid|isSpecialTrainingBankEditorPoolsValid|canAdvanceSpecialTrainingBankEditorStep/u,
        message:
          "question-bank editor readiness and disabled reasons must come from local-api read model.",
      },
    ],
  },
  {
    file: "workspaces/special-training/specialTrainingBankUi.ts",
    patterns: [
      {
        pattern: /resolveSpecialTrainingBankEditorBlockReason/u,
        message:
          "question-bank editor block reason must come from local-api read model.",
      },
    ],
  },
  {
    file: "app-shell/useOrderEstimationController.ts",
    patterns: [
      {
        pattern:
          /resolveTrainerOrderDisabled|estimate\.qty|blockedReasonCode[\s\S]{0,120}disabled/u,
        message:
          "free-replay order disabled state must use backend quote/action enabled facts only.",
      },
    ],
  },
  {
    file: "domains/trainer/trainerOrderActionDisplay.ts",
    patterns: [
      {
        pattern: /\bqty\b|blockedReason|reasonCode/u,
        message:
          "trainer order button display must not inspect order quantities or blocked reasons.",
      },
    ],
  },
  {
    file: "domains/data-import/csvHelpers.ts",
    patterns: [
      {
        pattern: /validateCsvFieldMapping|CSV_MAPPING_|HEADER_MISSING|DUPLICATED/u,
        message:
          "CSV mapping validation facts must come from local-api draft validation.",
      },
    ],
  },
  {
    file: "domains/data-import/tradingCalendarUi.ts",
    patterns: [
      {
        pattern: /isTradingCalendarValidForSubmit/u,
        message:
          "trading-calendar submit validity must come from local-api validation.",
      },
    ],
  },
  {
    file: "app-shell/AppCsvMappingModal.tsx",
    patterns: [
      {
        pattern:
          /isTradingCalendarValidForSubmit|pendingPlanConfigRows\.some\([\s\S]{0,160}tradingCalendar/u,
        message:
          "CSV import confirmation must use local-api draft validation instead of frontend trading-calendar validation.",
      },
    ],
  },
  {
    file: "app-shell/useAppCsvImportActions.ts",
    patterns: [
      {
        pattern:
          /LOCAL_DATA_IMPORT_DRAFT_VALIDATION_UNAVAILABLE|buildUnavailableDraftValidation/u,
        message:
          "CSV draft validation unavailable fallback facts must not be synthesized in desktop web.",
      },
    ],
  },
];

const customIndicatorLeftoverPaths = [
  "domains/custom-indicator/futu/futuSupportMatrix.ts",
  "domains/custom-indicator/futu/futuSupportRegistry.ts",
  "domains/custom-indicator/indicator/backendRuntimeClient.ts",
  "domains/custom-indicator/indicator/runtimeExecutionCache.ts",
  "domains/custom-indicator/indicator/runtimeBridgeState.ts",
  "domains/custom-indicator/indicator/runtimeWorkerClient.ts",
  "domains/custom-indicator/indicator/runtime.worker.ts",
  "domains/custom-indicator/indicator/scriptRuntimeUtils.ts",
  "domains/custom-indicator/indicator/compiler",
  "domains/custom-indicator/indicator/parser",
  "domains/custom-indicator/indicator/runtime",
  "domains/custom-indicator/runtime",
  "workspaces/custom-indicator/ast/evaluator",
  "workspaces/custom-indicator/functions",
  "workspaces/custom-indicator/runtime",
];

const customIndicatorRuntimeImportPatterns = [
  {
    pattern:
      /@\/domains\/custom-indicator\/indicator\/(?:backendRuntimeClient|runtimeBridgeState|runtimeExecutionCache|runtimeWorkerClient|runtime\.worker|scriptRuntimeUtils|compiler|parser|runtime)(?:['"/])/u,
    message:
      "custom indicator web runtime/parser/evaluator imports must not remain; call local-api through backend execution/render adapters.",
  },
  {
    pattern:
      /@\/workspaces\/custom-indicator\/(?:ast\/evaluator|functions|runtime)(?:['"/])/u,
    message:
      "custom indicator workspace evaluator/runtime imports must not remain in desktop web.",
  },
  {
    pattern: /\bnew\s+Function\s*\(|\beval\s*\(/u,
    message:
      "custom indicator scripts must not execute in desktop web; use local-api custom indicator endpoints.",
  },
];

const knownMigrationByKey = new Map();
for (const entry of knownMigrationEntries) {
  for (const name of entry.names) {
    knownMigrationByKey.set(`${entry.file}|${name}`, entry.reason);
  }
}
const knownMigrationFiles = new Map(
  knownMigrationFileEntries.map((entry) => [entry.file, entry.reason]),
);

const getLine = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const getImportKind = (node, specifier) => {
  if (node.importClause?.isTypeOnly) {
    return "type";
  }
  if (specifier?.isTypeOnly) {
    return "type";
  }
  return "value";
};

const isUseCallbackLike = (node) =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  (node.expression.text === "useCallback" || node.expression.text === "useMemo");

const isFunctionLikeInitializer = (node) =>
  Boolean(
    node &&
      (ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node) ||
        isUseCallbackLike(node)),
  );

const getIdentifierRule = (name) =>
  riskIdentifierRules.find((rule) => rule.pattern.test(name)) ?? null;

const isAllowed = (hit) =>
  allowedPolicies.find((policy) => policy.match(hit)) ?? null;

const getKnownMigrationReason = (hit) => {
  if (hit.kind === "file-name") {
    return knownMigrationFiles.get(hit.file) ?? null;
  }
  if (!hit.name) {
    return null;
  }
  return knownMigrationByKey.get(`${hit.file}|${hit.name}`) ?? null;
};

const createDeclarationHit = ({ file, line, name, rule, declarationKind }) => ({
  kind: "declaration",
  file,
  line,
  name,
  declarationKind,
  ruleId: rule.id,
  message: rule.message,
});

const scanSourceFile = (absolutePath) => {
  const sourceText = fs.readFileSync(absolutePath, "utf8");
  const file = toFrontendPath(absolutePath);
  const scriptKind = absolutePath.endsWith(".tsx") || absolutePath.endsWith(".jsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const hits = [];

  const fileNameRuleMatches = riskyFileNameRule.pattern.test(path.basename(file));
  if (
    fileNameRuleMatches &&
    !file.startsWith("ui/components/") &&
    !file.startsWith("styles/")
  ) {
    hits.push({
      kind: "file-name",
      file,
      line: 1,
      name: path.basename(file),
      ruleId: riskyFileNameRule.id,
      message: riskyFileNameRule.message,
    });
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const source = node.moduleSpecifier.text;
      const namedBindings = node.importClause?.namedBindings;
      const defaultName = node.importClause?.name?.text ?? null;
      const importHits = [];
      if (defaultName) {
        importHits.push({
          importedName: "default",
          localName: defaultName,
          importKind: getImportKind(node, null),
        });
      }
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          importHits.push({
            importedName: element.propertyName?.text ?? element.name.text,
            localName: element.name.text,
            importKind: getImportKind(node, element),
          });
        }
      }
      if (importHits.length === 0 && node.importClause?.isTypeOnly) {
        importHits.push({
          importedName: "*",
          localName: "*",
          importKind: "type",
        });
      }
      for (const importInfo of importHits) {
        const hit = {
          kind: "import",
          file,
          line: getLine(sourceFile, node),
          source,
          name: importInfo.localName,
          importedName: importInfo.importedName,
          importKind: importInfo.importKind,
        };
        const rule = riskyImportRules.find((candidate) => candidate.match(hit));
        if (rule) {
          hits.push({
            ...hit,
            ruleId: rule.id,
            message: rule.message,
          });
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const rule = getIdentifierRule(name);
      if (rule) {
        hits.push(
          createDeclarationHit({
            file,
            line: getLine(sourceFile, node),
            name,
            rule,
            declarationKind: "function",
          }),
        );
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isFunctionLikeInitializer(node.initializer)
    ) {
      const name = node.name.text;
      const rule = getIdentifierRule(name);
      if (rule) {
        hits.push(
          createDeclarationHit({
            file,
            line: getLine(sourceFile, node),
            name,
            rule,
            declarationKind: "function-variable",
          }),
        );
      }
    }

    if (
      (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const name = node.name.text;
      const rule = getIdentifierRule(name);
      if (rule) {
        hits.push(
          createDeclarationHit({
            file,
            line: getLine(sourceFile, node),
            name,
            rule,
            declarationKind: "method",
          }),
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { file, sourceText, hits };
};

const lineAt = (source, index) => source.slice(0, index).split(/\r?\n/u).length;

const scanLegacyTargetedRules = () => {
  const hits = [];
  for (const check of legacyTargetedChecks) {
    const absolutePath = path.join(frontendSrcRoot, check.file);
    if (!fs.existsSync(absolutePath)) {
      hits.push({
        kind: "targeted-pattern",
        file: check.file,
        line: 1,
        name: check.file,
        ruleId: "missing-target-file",
        message: "targeted pure-presentation guard file is missing",
      });
      continue;
    }
    const source = fs.readFileSync(absolutePath, "utf8");
    for (const { pattern, message } of check.patterns) {
      const match = pattern.exec(source);
      if (match) {
        hits.push({
          kind: "targeted-pattern",
          file: check.file,
          line: lineAt(source, match.index),
          name: pattern.toString(),
          ruleId: "targeted-business-fact-pattern",
          message,
        });
      }
    }
  }
  return hits;
};

const scanCustomIndicatorRuntimeLeftovers = (sourceRecords) => {
  const hits = [];
  for (const leftoverPath of customIndicatorLeftoverPaths) {
    if (fs.existsSync(path.join(frontendSrcRoot, leftoverPath))) {
      hits.push({
        kind: "custom-indicator-runtime-leftover",
        file: leftoverPath,
        line: 1,
        name: leftoverPath,
        ruleId: "custom-indicator-runtime-leftover",
        message:
          "custom indicator evaluator/runtime/parser leftovers must not remain in desktop web.",
      });
    }
  }

  const scannedSourceRecords = sourceRecords.filter(
    (record) =>
      record.file.startsWith("domains/custom-indicator/") ||
      record.file.startsWith("workspaces/custom-indicator/") ||
      record.file.startsWith("domains/indicators/"),
  );
  for (const record of scannedSourceRecords) {
    for (const { pattern, message } of customIndicatorRuntimeImportPatterns) {
      const match = pattern.exec(record.sourceText);
      if (match) {
        hits.push({
          kind: "custom-indicator-runtime-pattern",
          file: record.file,
          line: lineAt(record.sourceText, match.index),
          name: pattern.toString(),
          ruleId: "custom-indicator-runtime-pattern",
          message,
        });
      }
    }
  }
  return hits;
};

const classifyHits = (hits) => {
  const violations = [];
  const knownMigration = [];
  const allowed = [];

  for (const hit of hits) {
    const migrationReason = getKnownMigrationReason(hit);
    if (migrationReason) {
      knownMigration.push({ ...hit, reason: migrationReason });
      continue;
    }
    const allowedPolicy = isAllowed(hit);
    if (allowedPolicy) {
      allowed.push({
        ...hit,
        allowedPolicy: allowedPolicy.id,
      });
      continue;
    }
    violations.push(hit);
  }
  return { violations, knownMigration, allowed };
};

const getMissingKnownMigrationEntries = (classifiedKnownHits) => {
  const seen = new Set(
    classifiedKnownHits
      .filter((hit) => hit.kind !== "file-name")
      .map((hit) => `${hit.file}|${hit.name}`),
  );
  const missing = [];
  for (const [key, reason] of knownMigrationByKey.entries()) {
    if (!seen.has(key)) {
      missing.push({ key, reason });
    }
  }
  return missing;
};

const countBy = (items, getKey) => {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
};

const formatHit = (hit) => {
  const name = hit.name ? ` ${hit.name}` : "";
  const source = hit.source ? ` from ${hit.source}` : "";
  const detail = hit.reason
    ? ` (${hit.reason})`
    : hit.allowedPolicy
      ? ` (${hit.allowedPolicy})`
      : "";
  return `- ${hit.file}:${hit.line} [${hit.ruleId}]${name}${source} - ${hit.message}${detail}`;
};

const parseArgs = (argv) => {
  const options = {
    files: [],
    showAllowed: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--files") {
      index += 1;
      while (index < argv.length && !String(argv[index]).startsWith("--")) {
        const absolutePath = absoluteFrontendFileFromInput(argv[index]);
        if (absolutePath && isSourceFile(absolutePath) && fs.existsSync(absolutePath)) {
          options.files.push(absolutePath);
        }
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (arg === "--show-allowed") {
      options.showAllowed = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node tools/quality/check-desktop-web-pure-presentation.mjs",
          "  node tools/quality/check-desktop-web-pure-presentation.mjs --files <path> [more paths]",
          "  node tools/quality/check-desktop-web-pure-presentation.mjs --show-allowed",
          "",
          "Scans apps/desktop/web/src for new business fact calculation, validation,",
          "permission, disabled-reason, action-availability, and result-summary logic.",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const hasScopedFiles = options.files.length > 0;
  const sourceFiles = hasScopedFiles
    ? [...new Set(options.files)].sort()
    : collectSourceFiles(frontendSrcRoot);
  const sourceRecords = sourceFiles.map(scanSourceFile);
  const astHits = sourceRecords.flatMap((record) => record.hits);
  const targetedHits = hasScopedFiles ? [] : scanLegacyTargetedRules();
  const customIndicatorHits = scanCustomIndicatorRuntimeLeftovers(sourceRecords);
  const allHits = [...astHits, ...targetedHits, ...customIndicatorHits];
  const classified = classifyHits(allHits);
  const missingKnownMigrations = hasScopedFiles
    ? []
    : getMissingKnownMigrationEntries(classified.knownMigration);

  const result = {
    scannedRoot: toRepoPath(frontendSrcRoot),
    scannedFiles: sourceFiles.length,
    astHits: astHits.length,
    targetedHits: targetedHits.length,
    customIndicatorHits: customIndicatorHits.length,
    allowedHits: classified.allowed.length,
    knownMigrationHits: classified.knownMigration.length,
    violations: classified.violations,
    knownMigration: classified.knownMigration,
    allowedPolicyCounts: countBy(classified.allowed, (hit) => hit.allowedPolicy),
    knownMigrationFileCounts: countBy(classified.knownMigration, (hit) => hit.file),
    missingKnownMigrations,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }

  if (classified.violations.length > 0 || missingKnownMigrations.length > 0) {
    console.error(
      "[desktop-web-pure-presentation] desktop web contains unallowlisted business fact ownership:",
    );
    for (const violation of classified.violations.slice(0, maxPrintedViolations)) {
      console.error(formatHit(violation));
    }
    if (classified.violations.length > maxPrintedViolations) {
      console.error(
        `... ${classified.violations.length - maxPrintedViolations} more violations suppressed`,
      );
    }
    for (const entry of missingKnownMigrations) {
      console.error(
        `- stale migration allowlist entry ${entry.key} (${entry.reason})`,
      );
    }
    process.exit(1);
  }

  console.log(
    `[desktop-web-pure-presentation] scanned ${sourceFiles.length} files in ${toRepoPath(
      frontendSrcRoot,
    )}; ${classified.allowed.length} allowed hits, ${classified.knownMigration.length} known migration hits, 0 unallowlisted violations.`,
  );
  if (classified.knownMigration.length > 0) {
    console.log("[desktop-web-pure-presentation] known migration-required hits:");
    for (const [file, count] of result.knownMigrationFileCounts) {
      console.log(`- ${file}: ${count}`);
    }
  }
  if (options.showAllowed && classified.allowed.length > 0) {
    console.log("[desktop-web-pure-presentation] allowed policy hits:");
    for (const [policyId, count] of result.allowedPolicyCounts) {
      const policy = allowedPolicies.find((entry) => entry.id === policyId);
      console.log(`- ${policyId}: ${count} - ${policy?.description ?? ""}`);
    }
  }
};

main();
