// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");

const readSource = (relativePath) =>
  fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");

const lineAt = (source, index) => source.slice(0, index).split(/\r?\n/).length;

const pathExists = (relativePath) =>
  fs.existsSync(path.join(frontendRoot, relativePath));

const collectSourceFiles = (relativeRoot) => {
  const absoluteRoot = path.join(frontendRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];
  const walk = (absoluteDir) => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/u.test(entry.name)) {
        continue;
      }
      files.push(path.relative(frontendRoot, absolutePath).replaceAll(path.sep, "/"));
    }
  };
  walk(absoluteRoot);
  return files;
};

const checks = [
  {
    file: "src/workspaces/special-training/session/questionBankRuntimeCore.ts",
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
    file: "src/workspaces/special-training/banks/specialTrainingBankCardPresentation.ts",
    patterns: [
      {
        pattern: /enabledSamplePoolById\.get|resolvedPools|flatMap\(\(pool\)\s*=>\s*pool\.symbols/u,
        message:
          "bank card symbol/status presentation must use backend scopeSummary, not local pool maps.",
      },
    ],
  },
  {
    file: "src/workspaces/special-training/view-models/specialTrainingRiskDisciplineActionViewModel.ts",
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
    file: "src/workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState.ts",
    patterns: [
      {
        pattern: /lifecycleBlockedReason|loadingReason/u,
        message:
          "risk order quote display must not synthesize frontend lifecycle blocked reasons.",
      },
    ],
  },
  {
    file: "src/workspaces/special-training/SpecialTrainingPage.tsx",
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
        pattern: /serverCurrentPrice[\s\S]{0,220}currentBar\?\.close/u,
        message:
          "risk current price must come from backend runtime, not current bar fallback.",
      },
      {
        pattern: /lifecycleBlockedReason|blockedReasonCode:\s*['"](?:QUESTION_LOADING|TRAINING_PAUSED)['"]/u,
        message:
          "special-training lifecycle blocked reasons must come from backend runtime/read-model state.",
      },
    ],
  },
  {
    file: "src/workspaces/special-training/specialTrainingBankEditorModel.ts",
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
    file: "src/workspaces/special-training/specialTrainingBankUi.ts",
    patterns: [
      {
        pattern: /resolveSpecialTrainingBankEditorBlockReason/u,
        message:
          "question-bank editor block reason must come from local-api read model.",
      },
    ],
  },
  {
    file: "src/app-shell/useOrderEstimationController.ts",
    patterns: [
      {
        pattern: /resolveTrainerOrderDisabled|estimate\.qty|blockedReasonCode[\s\S]{0,120}disabled/u,
        message:
          "free-replay order disabled state must use backend quote/action enabled facts only.",
      },
    ],
  },
  {
    file: "src/domains/trainer/trainerOrderActionDisplay.ts",
    patterns: [
      {
        pattern: /\bqty\b|blockedReason|reasonCode/u,
        message:
          "trainer action availability adapter must not inspect order quantities or blocked reasons.",
      },
    ],
  },
  {
    file: "src/domains/data-import/csvHelpers.ts",
    patterns: [
      {
        pattern: /validateCsvFieldMapping|CSV_MAPPING_|HEADER_MISSING|DUPLICATED/u,
        message:
          "CSV mapping validation facts must come from local-api draft validation.",
      },
    ],
  },
  {
    file: "src/domains/data-import/tradingCalendarUi.ts",
    patterns: [
      {
        pattern: /isTradingCalendarValidForSubmit/u,
        message:
          "trading-calendar submit validity must come from local-api validation.",
      },
    ],
  },
  {
    file: "src/app-shell/AppCsvMappingModal.tsx",
    patterns: [
      {
        pattern: /isTradingCalendarValidForSubmit|pendingPlanConfigRows\.some\([\s\S]{0,160}tradingCalendar/u,
        message:
          "CSV import confirmation must use local-api draft validation instead of frontend trading-calendar validation.",
      },
    ],
  },
  {
    file: "src/app-shell/useAppCsvImportActions.ts",
    patterns: [
      {
        pattern: /LOCAL_DATA_IMPORT_DRAFT_VALIDATION_UNAVAILABLE|buildUnavailableDraftValidation/u,
        message:
          "CSV draft validation unavailable fallback facts must not be synthesized in desktop web.",
      },
    ],
  },
];

const customIndicatorLeftoverPaths = [
  "src/domains/custom-indicator/futu/futuSupportMatrix.ts",
  "src/domains/custom-indicator/futu/futuSupportRegistry.ts",
  "src/domains/custom-indicator/indicator/backendRuntimeClient.ts",
  "src/domains/custom-indicator/indicator/runtimeExecutionCache.ts",
  "src/domains/custom-indicator/indicator/runtimeBridgeState.ts",
  "src/domains/custom-indicator/indicator/runtimeWorkerClient.ts",
  "src/domains/custom-indicator/indicator/runtime.worker.ts",
  "src/domains/custom-indicator/indicator/scriptRuntimeUtils.ts",
  "src/domains/custom-indicator/indicator/compiler",
  "src/domains/custom-indicator/indicator/parser",
  "src/domains/custom-indicator/indicator/runtime",
  "src/domains/custom-indicator/runtime",
  "src/workspaces/custom-indicator/ast/evaluator",
  "src/workspaces/custom-indicator/functions",
  "src/workspaces/custom-indicator/runtime",
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

const customIndicatorRuntimeScanFiles = [
  ...collectSourceFiles("src/domains/custom-indicator"),
  ...collectSourceFiles("src/workspaces/custom-indicator"),
  ...collectSourceFiles("src/domains/indicators"),
];

const violations = [];

for (const check of checks) {
  const source = readSource(check.file);
  for (const { pattern, message } of check.patterns) {
    const match = pattern.exec(source);
    if (match) {
      violations.push({
        file: check.file,
        line: lineAt(source, match.index),
        message,
      });
    }
  }
}

for (const leftoverPath of customIndicatorLeftoverPaths) {
  if (pathExists(leftoverPath)) {
    violations.push({
      file: leftoverPath,
      line: 1,
      message:
        "custom indicator evaluator/runtime/parser leftovers must not remain in desktop web.",
    });
  }
}

for (const file of customIndicatorRuntimeScanFiles) {
  const source = readSource(file);
  for (const { pattern, message } of customIndicatorRuntimeImportPatterns) {
    const match = pattern.exec(source);
    if (match) {
      violations.push({
        file,
        line: lineAt(source, match.index),
        message,
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    "[business-presentation-boundaries] Frontend business presentation ownership violations:",
  );
  for (const violation of violations) {
    console.error(
      `  - ${violation.file}:${violation.line} ${violation.message}`,
    );
  }
  process.exit(1);
}

console.log(
  "[business-presentation-boundaries] no frontend-derived workspace business facts or custom-indicator runtime leftovers found.",
);
