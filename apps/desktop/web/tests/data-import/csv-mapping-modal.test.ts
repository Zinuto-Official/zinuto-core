// SPDX-License-Identifier: GPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCsvImportPoolNameConfirmationOptions,
  buildCsvMappingModalViewModel,
  formatTimeZoneWithUtcOffset,
  shouldDisableCsvPoolNameInput,
} from "../../src/app-shell/csvMappingModalViewModel";
import { formatMessageByLanguage } from "../../src/frontend-kernel/i18n/messageRuntime";

const tt = (key: string): string =>
  formatMessageByLanguage("zh-CN", key as never);

const ttf = (key: string, values: Array<unknown> = []): string =>
  formatMessageByLanguage("zh-CN", key as never, values);

const buildViewModel = (overrides?: {
  invalidFiles?: number;
  totalFiles?: number;
  validFiles?: number;
  isAdvancedOpen?: boolean;
  hasExistingTargetOptions?: boolean;
  fieldIssueCount?: number;
  hasInvalidTargetSource?: boolean;
  hasInvalidTradingCalendar?: boolean;
  repairWarningCount?: number;
  timeZoneConfidence?: "HIGH" | "MEDIUM" | "LOW";
  pendingImportTimeZoneMode?: "AUTO" | "MANUAL";
  pendingImportTimeZoneConfirmed?: boolean;
  planSummaries?: Array<{
    strategy: "FLAT" | "WITH_PARENT";
    symbolCount: number;
    fileCount: number;
  }>;
}) =>
  buildCsvMappingModalViewModel({
    pendingImport: {
      importEntryMode: "GENERAL",
      planSummaries: overrides?.planSummaries ?? [
        {
          strategy: "FLAT",
          symbolCount: 2,
          fileCount: 2,
        },
        {
          strategy: "WITH_PARENT",
          symbolCount: 2,
          fileCount: 2,
        },
      ],
      totalFiles: overrides?.totalFiles ?? 2,
      validFiles: overrides?.validFiles ?? 2,
      invalidFiles: overrides?.invalidFiles ?? 0,
      validSymbolCount: 2,
    },
    pendingPlanConfigRows: [
      {
        hasExistingTargetOptions: overrides?.hasExistingTargetOptions ?? true,
        effectiveTimeZone: "Asia/Shanghai",
        effectiveTimeZoneSource: "NEW_SOURCE_PENDING_IMPORT",
        willUpdateExistingSourceTimeZone: false,
        symbolCount: 2,
      },
    ],
    pendingImportTimeZone: "Asia/Shanghai",
    pendingImportScopeStrategy: "FLAT",
    isAdvancedOpen: Boolean(overrides?.isAdvancedOpen),
    fieldIssueCount: overrides?.fieldIssueCount,
    blockingIssueKind: overrides?.hasInvalidTargetSource
      ? "targeting"
      : overrides?.hasInvalidTradingCalendar
        ? "trading-calendar"
        : overrides?.repairWarningCount
          ? "repair-warnings"
          : overrides?.timeZoneConfidence === "LOW" &&
              overrides?.pendingImportTimeZoneMode !== "MANUAL" &&
              !overrides?.pendingImportTimeZoneConfirmed
            ? "time-zone"
            : "none",
    requiresTimeZoneConfirmation:
      overrides?.timeZoneConfidence === "LOW" &&
      overrides?.pendingImportTimeZoneMode !== "MANUAL" &&
      !overrides?.pendingImportTimeZoneConfirmed,
    tt: tt as never,
    ttf,
  });

test("csv mapping modal view model defaults to the compact import workspace", () => {
  const viewModel = buildViewModel();

  assert.equal(viewModel.shouldShowAdvancedBody, false);
  assert.equal(viewModel.shouldShowAdvancedCard, true);
  assert.equal(viewModel.shouldShowSamplePoolColumnHeader, false);
  assert.equal(viewModel.footerBlockerText, "");
  assert.equal(viewModel.blockingIssueKind, "none");
  assert.equal(viewModel.hasBlockingIssue, false);
  assert.equal(viewModel.shouldShowWarningBanner, false);
  assert.equal(viewModel.headerSummaryText, "文件校验：共 2，有效 2，已跳过 0");
  assert.equal(viewModel.validationStatusText, "文件校验通过：当前文件均可导入");
  assert.deepEqual(
    viewModel.compactSummaryMetrics.map((metric) => [metric.id, metric.value]),
    [
      ["files", "2/2"],
      ["pools", "1"],
      ["symbols", "2"],
    ],
  );
  assert.doesNotMatch(viewModel.headerSummaryText, /扫描到/);
});

test("csv mapping modal view model exposes advanced controls only when expanded", () => {
  const viewModel = buildViewModel({
    isAdvancedOpen: true,
    hasExistingTargetOptions: true,
  });

  assert.equal(viewModel.shouldShowAdvancedBody, true);
  assert.equal(viewModel.shouldShowAdvancedCard, true);
  assert.equal(viewModel.shouldShowAdvancedTargeting, true);
  assert.equal(viewModel.shouldShowScopeStrategySelector, true);
  assert.deepEqual(
    viewModel.visibleAdvancedControlKeys,
    ["appText.type", "appText.templateSelection", "appText.importTarget", "appText.chooseBoundScopeSync"],
  );
});

test("csv mapping modal view model hides advanced settings when nothing is actionable", () => {
  const viewModel = buildViewModel({
    isAdvancedOpen: true,
    hasExistingTargetOptions: false,
    planSummaries: [
      {
        strategy: "FLAT",
        symbolCount: 2,
        fileCount: 2,
      },
    ],
  });

  assert.equal(viewModel.shouldShowAdvancedCard, false);
  assert.equal(viewModel.shouldShowAdvancedBody, false);
  assert.equal(viewModel.shouldShowAdvancedTargeting, false);
  assert.equal(viewModel.shouldShowScopeStrategySelector, false);
  assert.deepEqual(viewModel.visibleAdvancedControlKeys, []);
});

test("csv mapping modal formats time zones with UTC offsets", () => {
  const referenceDate = new Date("2026-01-01T00:00:00.000Z");

  assert.equal(
    formatTimeZoneWithUtcOffset("Asia/Shanghai", referenceDate),
    "Asia/Shanghai (UTC+08:00)",
  );
  assert.equal(
    formatTimeZoneWithUtcOffset("Etc/UTC", referenceDate),
    "Etc/UTC (UTC+00:00)",
  );
});

test("csv mapping modal preserves deferred pool names for confirmation", () => {
  const options = buildCsvImportPoolNameConfirmationOptions({
    shouldDeferPoolNameCommit: true,
    pendingPlanConfigRows: [
      { previewPlanId: "plan-1", poolName: "row-name" },
      { previewPlanId: "plan-2", poolName: "second-row" },
    ],
    poolNameDrafts: {
      "plan-1": { value: "draft-name" },
    },
  });

  assert.deepEqual(options, {
    poolNameByPreviewPlanId: {
      "plan-1": "draft-name",
      "plan-2": "second-row",
    },
  });
  assert.equal(
    buildCsvImportPoolNameConfirmationOptions({
      shouldDeferPoolNameCommit: false,
      pendingPlanConfigRows: [{ previewPlanId: "plan-1", poolName: "row-name" }],
      poolNameDrafts: {},
    }),
    undefined,
  );
});

test("csv mapping modal disables pool name editing for full reimport", () => {
  assert.equal(shouldDisableCsvPoolNameInput(false, "FULL_REIMPORT"), true);
  assert.equal(shouldDisableCsvPoolNameInput(false, "GENERAL"), false);
  assert.equal(shouldDisableCsvPoolNameInput(true, "GENERAL"), true);
});

test("csv mapping modal view model keeps file validation as the primary feedback when files are invalid", () => {
  const viewModel = buildViewModel({
    totalFiles: 3,
    validFiles: 2,
    invalidFiles: 1,
  });

  assert.equal(viewModel.hasInvalidImportFiles, true);
  assert.equal(viewModel.importFileValidationSummary, "文件校验：共 3，有效 2，已跳过 1");
  assert.equal(viewModel.validationStatusText, "文件校验：共 3，有效 2，已跳过 1");
  assert.equal(viewModel.footerBlockerText, "");
  assert.equal(viewModel.blockingIssueKind, "none");
  assert.equal(viewModel.shouldShowWarningBanner, true);
  assert.equal(viewModel.warningBannerTitleText, "文件校验：共 3，有效 2，已跳过 1");
});

test("csv mapping modal blocks only on actionable setup issues", () => {
  const fieldIssueViewModel = buildViewModel({
    fieldIssueCount: 1,
  });
  assert.equal(fieldIssueViewModel.footerBlockerText, "映射状态：缺少 1 项");
  assert.equal(fieldIssueViewModel.blockingIssueKind, "field-mapping");
  assert.equal(fieldIssueViewModel.warningBannerTitleText, "映射状态：缺少 1 项");
  assert.notEqual(
    fieldIssueViewModel.warningBannerBodyText,
    fieldIssueViewModel.validationStatusText,
  );

  const repairWarningViewModel = buildViewModel({
    repairWarningCount: 1,
  });
  assert.equal(repairWarningViewModel.blockingIssueKind, "repair-warnings");
  assert.equal(repairWarningViewModel.footerBlockerText, "数据问题需要修正");
  assert.equal(repairWarningViewModel.warningBannerTitleText, "数据问题需要修正");
  assert.notEqual(
    repairWarningViewModel.warningBannerBodyText,
    repairWarningViewModel.validationStatusText,
  );

  const invalidTradingCalendarViewModel = buildViewModel({
    hasInvalidTradingCalendar: true,
  });
  assert.equal(invalidTradingCalendarViewModel.blockingIssueKind, "trading-calendar");
  assert.equal(
    invalidTradingCalendarViewModel.footerBlockerText,
    "交易日历无效，请检查交易日和时段",
  );

  const lowConfidenceTimeZoneViewModel = buildViewModel({
    timeZoneConfidence: "LOW",
    pendingImportTimeZoneMode: "AUTO",
  });
  assert.equal(lowConfidenceTimeZoneViewModel.requiresTimeZoneConfirmation, true);
  assert.equal(lowConfidenceTimeZoneViewModel.blockingIssueKind, "time-zone");
  assert.equal(
    lowConfidenceTimeZoneViewModel.footerBlockerText,
    "时区置信度较低，请确认当前推荐时区或选择其他时区后继续",
  );

  const confirmedTimeZoneViewModel = buildViewModel({
    timeZoneConfidence: "LOW",
    pendingImportTimeZoneMode: "AUTO",
    pendingImportTimeZoneConfirmed: true,
  });
  assert.equal(confirmedTimeZoneViewModel.requiresTimeZoneConfirmation, false);
  assert.equal(confirmedTimeZoneViewModel.blockingIssueKind, "none");
  assert.equal(confirmedTimeZoneViewModel.footerBlockerText, "");

  const manuallySelectedTimeZoneViewModel = buildViewModel({
    timeZoneConfidence: "LOW",
    pendingImportTimeZoneMode: "MANUAL",
    pendingImportTimeZoneConfirmed: false,
  });
  assert.equal(manuallySelectedTimeZoneViewModel.requiresTimeZoneConfirmation, false);
  assert.equal(manuallySelectedTimeZoneViewModel.blockingIssueKind, "none");
  assert.equal(manuallySelectedTimeZoneViewModel.footerBlockerText, "");
});

test("csv mapping modal warning priority uses the first actionable setup blocker", () => {
  const viewModel = buildViewModel({
    totalFiles: 3,
    validFiles: 2,
    invalidFiles: 1,
    fieldIssueCount: 1,
    repairWarningCount: 1,
    timeZoneConfidence: "LOW",
    pendingImportTimeZoneMode: "AUTO",
  });

  assert.equal(viewModel.requiresTimeZoneConfirmation, true);
  assert.equal(viewModel.footerBlockerText, "映射状态：缺少 1 项");
  assert.equal(viewModel.blockingIssueKind, "field-mapping");
  assert.equal(viewModel.shouldShowWarningBanner, true);
  assert.equal(viewModel.warningBannerTitleText, "映射状态：缺少 1 项");
});
