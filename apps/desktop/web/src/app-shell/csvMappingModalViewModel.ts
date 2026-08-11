// SPDX-License-Identifier: GPL-3.0-only

import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  CsvImportEntryMode,
  CsvPoolNamingStrategy,
} from "@/app-shell/appCsvImportContracts";

type CsvMappingModalPlanSummary = {
  strategy: "FLAT" | "WITH_PARENT";
  symbolCount: number;
  fileCount: number;
};

type CsvMappingModalPlanRow = {
  hasExistingTargetOptions: boolean;
  effectiveTimeZone: string;
  effectiveTimeZoneSource:
    | "NEW_SOURCE_PENDING_IMPORT"
    | "EXISTING_SOURCE"
    | "FULL_REIMPORT";
  willUpdateExistingSourceTimeZone: boolean;
  symbolCount?: number;
};

type CsvImportPoolNameConfirmationRow = {
  previewPlanId: string;
  poolName: string;
};

type CsvImportPoolNameDraft = {
  value?: string;
};

type BuildCsvMappingModalViewModelArgs = {
  pendingImport: {
    importEntryMode: CsvImportEntryMode;
    planSummaries: CsvMappingModalPlanSummary[];
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    validSymbolCount?: number;
  };
  pendingPlanConfigRows: CsvMappingModalPlanRow[];
  pendingImportTimeZone: string;
  pendingImportScopeStrategy: CsvPoolNamingStrategy;
  isAdvancedOpen: boolean;
  fieldIssueCount?: number;
  blockingIssueKind?: CsvImportBlockingIssueKind;
  requiresTimeZoneConfirmation?: boolean;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

export type CsvImportConfirmationBlockerInput = {
  disabled: boolean;
  confirmEnabled: boolean;
};

export type CsvImportBlockingIssueKind =
  | "none"
  | "field-mapping"
  | "targeting"
  | "trading-calendar"
  | "repair-warnings"
  | "time-zone";

const UTC_OFFSET_PREFIX = String.fromCharCode(85, 84, 67);

const parseShortUtcOffsetLabel = (rawOffset: string): string => {
  const normalized = String(rawOffset || "")
    .trim()
    .replace(/^(?:GMT|UTC)/i, "")
    .trim();
  if (!normalized || normalized === "0") {
    return `${UTC_OFFSET_PREFIX}+00:00`;
  }
  const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(normalized);
  if (!match) {
    return "";
  }
  const sign = match[1];
  const hour = String(match[2] || "0").padStart(2, "0");
  const minute = String(match[3] || "00").padStart(2, "0");
  return `${UTC_OFFSET_PREFIX}${sign}${hour}:${minute}`;
};

export const formatTimeZoneWithUtcOffset = (
  timeZone: string,
  referenceDate: Date = new Date(),
): string => {
  const normalizedTimeZone = String(timeZone || "").trim();
  if (!normalizedTimeZone) {
    return "";
  }
  try {
    const offsetPart = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTimeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(referenceDate)
      .find((part) => part.type === "timeZoneName")?.value;
    const offsetLabel = parseShortUtcOffsetLabel(offsetPart || "");
    return offsetLabel ? `${normalizedTimeZone} (${offsetLabel})` : normalizedTimeZone;
  } catch {
    return normalizedTimeZone;
  }
};

export const shouldDisableCsvPoolNameInput = (
  disabled: boolean,
  importEntryMode: CsvImportEntryMode,
): boolean => disabled || importEntryMode === "FULL_REIMPORT";

export const buildCsvImportPoolNameConfirmationOptions = ({
  shouldDeferPoolNameCommit,
  pendingPlanConfigRows,
  poolNameDrafts,
}: {
  shouldDeferPoolNameCommit: boolean;
  pendingPlanConfigRows: CsvImportPoolNameConfirmationRow[];
  poolNameDrafts: Record<string, CsvImportPoolNameDraft>;
}): { poolNameByPreviewPlanId: Record<string, string> } | undefined => {
  if (!shouldDeferPoolNameCommit) {
    return undefined;
  }
  const poolNameByPreviewPlanId = pendingPlanConfigRows.reduce<Record<string, string>>(
    (result, row) => {
      const planId = String(row.previewPlanId || "").trim();
      if (!planId) {
        return result;
      }
      result[planId] = String(poolNameDrafts[planId]?.value ?? row.poolName ?? "");
      return result;
    },
    {},
  );
  return { poolNameByPreviewPlanId };
};

export const shouldDisableCsvImportConfirmation = ({
  disabled,
  confirmEnabled,
}: CsvImportConfirmationBlockerInput): boolean =>
  disabled ||
  !confirmEnabled;

export const buildCsvMappingModalViewModel = ({
  pendingImport,
  pendingPlanConfigRows,
  pendingImportTimeZone,
  pendingImportScopeStrategy,
  isAdvancedOpen,
  fieldIssueCount = 0,
  blockingIssueKind = "none",
  requiresTimeZoneConfirmation = false,
  tt,
  ttf,
}: BuildCsvMappingModalViewModelArgs) => {
  const totalFiles = Math.max(0, Number(pendingImport.totalFiles) || 0);
  const validFiles = Math.max(0, Number(pendingImport.validFiles) || 0);
  const invalidFiles = Math.max(0, Number(pendingImport.invalidFiles) || 0);
  const validSymbolCount = Math.max(
    0,
    Number(pendingImport.validSymbolCount) ||
      pendingPlanConfigRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.symbolCount) || 0),
        0,
      ),
  );
  const samplePoolCount = pendingPlanConfigRows.length;
  const importFileValidationSummary = ttf("appText.fileValidationTotalValue0ValidValue1SkippedValue2", [
    String(totalFiles),
    String(validFiles),
    String(invalidFiles),
  ]);
  const hasInvalidImportFiles = invalidFiles > 0;
  const validationStatusText = hasInvalidImportFiles
    ? importFileValidationSummary
    : tt("appText.fileValidationPassedFilesImportable");
  const availableScopeStrategies = ["FLAT", "WITH_PARENT"].filter(
    (strategy) =>
      pendingImport.planSummaries.some(
        (plan) =>
          plan.strategy === strategy &&
          Math.max(0, Number(plan.fileCount) || 0) > 0 &&
          Math.max(0, Number(plan.symbolCount) || 0) > 0,
      ),
  ) as CsvPoolNamingStrategy[];
  const shouldShowGlobalTimeZonePicker =
    pendingImport.importEntryMode === "FULL_REIMPORT" ||
    pendingPlanConfigRows.some(
      (row) => row.effectiveTimeZoneSource !== "EXISTING_SOURCE",
    );
  const previewPlanTimeZones = Array.from(
    new Set(
      pendingPlanConfigRows
        .map((row) => String(row.effectiveTimeZone || "").trim())
        .filter(Boolean),
    ),
  );
  const shouldShowPlanTimeZoneInline = previewPlanTimeZones.length > 1;
  const environmentTimeZoneValue =
    previewPlanTimeZones.length === 1
      ? previewPlanTimeZones[0]!
      : String(
          shouldShowGlobalTimeZonePicker ? pendingImportTimeZone : "",
        ).trim() || "--";
  const shouldShowScopeStrategySelector =
    pendingImport.importEntryMode !== "FULL_REIMPORT" &&
    availableScopeStrategies.includes("WITH_PARENT");
  const shouldShowAdvancedTargeting = pendingPlanConfigRows.some(
    (row) =>
      row.hasExistingTargetOptions ||
      row.effectiveTimeZoneSource === "EXISTING_SOURCE" ||
      row.willUpdateExistingSourceTimeZone,
  );
  const shouldShowAdvancedCard =
    shouldShowAdvancedTargeting || shouldShowScopeStrategySelector;
  const normalizedFieldIssueCount = Math.max(
    0,
    Math.floor(Number(fieldIssueCount) || 0),
  );
  const footerBlockerText = normalizedFieldIssueCount
    ? ttf("appText.mappingStatusValue0Missing", [String(normalizedFieldIssueCount)])
    : blockingIssueKind === "targeting"
      ? tt("appText.importTargetNeedsReview")
      : blockingIssueKind === "trading-calendar"
        ? tt("appText.tradingCalendarInvalid")
        : blockingIssueKind === "repair-warnings"
          ? tt("appText.importRepairWarningsNeedReview")
          : blockingIssueKind === "time-zone"
            ? tt("appText.importLowConfidenceTimeZoneConfirm")
            : "";
  const resolvedBlockingIssueKind: CsvImportBlockingIssueKind =
    normalizedFieldIssueCount ? "field-mapping" : blockingIssueKind;
  const hasBlockingIssue = resolvedBlockingIssueKind !== "none";
  const shouldShowWarningBanner = hasInvalidImportFiles || hasBlockingIssue;
  const warningBannerTitleText = hasBlockingIssue ? footerBlockerText : validationStatusText;
  const warningBannerBodyText = hasBlockingIssue
    ? tt("appText.importWorkbenchNeedsReview")
    : tt("appText.continueImportingValidFilesFixTheseFilesFull");

  return {
    availableScopeStrategies,
    blockingIssueKind: resolvedBlockingIssueKind,
    environmentTimeZoneValue,
    footerBlockerText,
    hasBlockingIssue,
    hasInvalidImportFiles,
    headerSummaryText: importFileValidationSummary,
    importFileValidationSummary,
    requiresTimeZoneConfirmation,
    samplePoolCount,
    shouldShowAdvancedCard,
    shouldShowAdvancedBody: shouldShowAdvancedCard && isAdvancedOpen,
    shouldShowAdvancedTargeting,
    shouldShowGlobalTimeZonePicker,
    shouldShowWarningBanner,
    shouldShowPlanTimeZoneInline,
    shouldShowSamplePoolColumnHeader: samplePoolCount > 1,
    shouldShowScopeStrategySelector,
    compactSummaryMetrics: [
      {
        id: "files",
        label: tt("appText.files"),
        value: `${validFiles}/${totalFiles}`,
        tone: hasInvalidImportFiles ? "warning" : "success",
      },
      {
        id: "pools",
        label: tt("appText.samplePool"),
        value: String(samplePoolCount),
        tone: "neutral",
      },
      {
        id: "symbols",
        label: tt("appText.symbols"),
        value: String(validSymbolCount),
        tone: "neutral",
      },
    ] as const,
    validationStatusText,
    warningBannerBodyText,
    warningBannerTitleText,
    visibleAdvancedControlKeys: shouldShowAdvancedCard && isAdvancedOpen
      ? ([
          "appText.type",
          "appText.templateSelection",
          "appText.importTarget",
          "appText.chooseBoundScopeSync",
        ] satisfies AppTextKey[])
      : ([] satisfies AppTextKey[]),
    resolvedScopeStrategy: pendingImportScopeStrategy,
  };
};
