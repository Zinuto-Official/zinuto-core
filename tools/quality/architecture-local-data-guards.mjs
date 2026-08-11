// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

const readProjectText = (projectRoot, relPath) =>
  fs.readFileSync(path.join(projectRoot, ...relPath.split("/")), "utf8");

const extractSourceSection = (sourceText, startMarker, endMarker) => {
  const startIndex = sourceText.indexOf(startMarker);
  if (startIndex < 0) {
    return "";
  }
  const endIndex = sourceText.indexOf(endMarker, startIndex + startMarker.length);
  return endIndex < 0
    ? sourceText.slice(startIndex)
    : sourceText.slice(startIndex, endIndex);
};

export const collectLocalDataUpdateArchitectureViolations = (projectRoot) => {
  const violations = [];
  const pushProjectViolation = (relPath, message) => {
    violations.push({
      filePath: relPath,
      message,
    });
  };
  const readText = (relPath) => readProjectText(projectRoot, relPath);

  const forbiddenIncrementalRequestFields = [
    "timeZone",
    "timeZoneOrigin",
    "tradingCalendar",
    "allowExistingSourceTimeZoneChange",
  ];
  const backendApiSchemaRelPath = "apps/desktop/local-api/src/http/apiSchemas/dataSourceSchemas.ts";
  const sharedContractRelPath =
    "packages/shared/src/contracts-desktop/local-data-operations.ts";
  const openApiRelPath = "contracts/openapi/desktop-local-api.v1.yaml";
  const importJobStartRelPath = "apps/desktop/local-api/src/application/dataSource/importJobStart.ts";
  const marketCsvImportSqlRelPath = "apps/desktop/local-api/src/infrastructure/db/marketCsvImportSql.ts";
  const frontendLocalDataApiRelPath = "apps/desktop/web/src/api/localData.ts";

  const backendApiSchema = readText(backendApiSchemaRelPath);
  const backendIncrementalSchema = extractSourceSection(
    backendApiSchema,
    "export const localDataIncrementalUpdateByPathSchema = z.object({",
    "export const localDataSourceTradingCalendarUpdateSchema",
  );
  if (!backendIncrementalSchema.includes("}).strict();")) {
    pushProjectViolation(
      backendApiSchemaRelPath,
      "Incremental local data update schema must be strict so stray timezone/calendar fields are rejected.",
    );
  }
  for (const fieldName of forbiddenIncrementalRequestFields) {
    if (new RegExp(`\\b${fieldName}\\b`).test(backendIncrementalSchema)) {
      pushProjectViolation(
        backendApiSchemaRelPath,
        `Incremental local data update schema must not expose ${fieldName}.`,
      );
    }
  }

  const sharedContract = readText(sharedContractRelPath);
  const sharedIncrementalSchema = extractSourceSection(
    sharedContract,
    "export const desktopLocalDataIncrementalUpdateByPathRequestSchema = z.object({",
    "export const desktopLocalDataSourceTradingCalendarUpdateRequestSchema",
  );
  if (!sharedIncrementalSchema.includes("}).strict();")) {
    pushProjectViolation(
      sharedContractRelPath,
      "Shared incremental local data update request schema must be strict.",
    );
  }
  for (const fieldName of forbiddenIncrementalRequestFields) {
    if (new RegExp(`\\b${fieldName}\\b`).test(sharedIncrementalSchema)) {
      pushProjectViolation(
        sharedContractRelPath,
        `Shared incremental local data update request schema must not expose ${fieldName}.`,
      );
    }
  }

  const openApi = readText(openApiRelPath);
  const openApiIncrementalSchema = extractSourceSection(
    openApi,
    "DesktopLocalDataIncrementalUpdateByPathRequest:",
    "DesktopFreeReplayPoolDefaultEnvironmentRequest:",
  );
  if (!openApiIncrementalSchema.includes("additionalProperties: false")) {
    pushProjectViolation(
      openApiRelPath,
      "OpenAPI incremental local data update request must disallow additional properties.",
    );
  }
  for (const fieldName of forbiddenIncrementalRequestFields) {
    if (new RegExp(`\\b${fieldName}\\b`).test(openApiIncrementalSchema)) {
      pushProjectViolation(
        openApiRelPath,
        `OpenAPI incremental local data update request must not expose ${fieldName}.`,
      );
    }
  }

  const importJobStart = readText(importJobStartRelPath);
  if (
    !importJobStart.includes("jobMode === 'INCREMENTAL_UPDATE'") ||
    !importJobStart.includes("? normalizeTimeZone(existingSource?.timeZone)") ||
    !importJobStart.includes("? normalizeTimeZoneOrigin(existingSource?.timeZoneOrigin, 'PRESET_DEFAULT')") ||
    !importJobStart.includes("? existingTradingCalendar")
  ) {
    pushProjectViolation(
      importJobStartRelPath,
      "Incremental import jobs must derive timezone, timezone origin, and trading calendar from the saved source.",
    );
  }
  const incrementalSourceUpdatePayload = extractSourceSection(
    importJobStart,
    "deps.updateSourceForIncrementalImport({",
    "});",
  );
  for (const fieldName of [
    "importScopeStrategy",
    "importScopeTopLevelSubfolder",
    "timeZone",
    "timeZoneOrigin",
    "baseTimeframe",
    "diagnosticProfile",
    "mappingJson",
    "tradingCalendarJson",
  ]) {
    if (new RegExp(`\\b${fieldName}\\b`).test(incrementalSourceUpdatePayload)) {
      pushProjectViolation(
        importJobStartRelPath,
        `updateSourceForIncrementalImport must not persist ${fieldName}.`,
      );
    }
  }

  const marketCsvImportSql = readText(marketCsvImportSqlRelPath);
  if (
    !marketCsvImportSql.includes("REGEXP_EXTRACT(${dateExpr}, '^([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})', 1)") ||
    !marketCsvImportSql.includes("CONCAT(REGEXP_EXTRACT(${dateExpr}")
  ) {
    pushProjectViolation(
      marketCsvImportSqlRelPath,
      "Split timestamp SQL must replace placeholder date-column times with the separate time column.",
    );
  }

  const importJobExecutor = readText("apps/desktop/local-api/src/application/dataSource/importJobExecutor.ts");
  const finalizeQueuedImportJob = readText(
    "apps/desktop/local-api/src/application/dataSource/finalizeQueuedImportJob.ts",
  );
  const importJobOutcomeHelpers = readText(
    "apps/desktop/local-api/src/application/dataSource/importJobOutcomeHelpers.ts",
  );
  if (
    !importJobExecutor.includes("./importJobOutcomeHelpers.js") ||
    !importJobExecutor.includes("./finalizeQueuedImportJob.js") ||
    !finalizeQueuedImportJob.includes("./importJobOutcomeHelpers.js") ||
    !finalizeQueuedImportJob.includes("resolveCompleteFailureErrorMessage") ||
    !importJobOutcomeHelpers.includes("COMPLETE_FAILURE_DETAIL_CODES") ||
    !/["']CSV_NO_VALID_BARS["']/u.test(importJobOutcomeHelpers)
  ) {
    pushProjectViolation(
      "apps/desktop/local-api/src/application/dataSource/importJobExecutor.ts",
      "Complete local data import failures must preserve actionable file-level error codes.",
    );
  }

  const frontendLocalDataApi = readText(frontendLocalDataApiRelPath);
  const frontendIncrementalPayload = extractSourceSection(
    frontendLocalDataApi,
    "startLocalDataIncrementalUpdateJobByPaths:",
    "startLocalDataImportPreviewJobByPath:",
  );
  for (const fieldName of forbiddenIncrementalRequestFields) {
    if (new RegExp(`\\b${fieldName}\\b`).test(frontendIncrementalPayload)) {
      pushProjectViolation(
        frontendLocalDataApiRelPath,
        `Frontend incremental update payload must not send ${fieldName}.`,
      );
    }
  }

  return violations;
};
