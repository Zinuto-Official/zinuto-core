// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { getTextLanguage } from "@/frontend-kernel/i18n/messageRuntime";
import type { CsvFieldKey } from "@/domains/data-import/csvHelpers";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import {
  formatDotJoinedText,
  formatListJoinedText,
} from "@/ui/formatting/i18nDisplay";
import type {
  ApiLocalDataImportDraftValidation,
  ApiTradingCalendarConfig,
  ApiTradingCalendarSuggestion,
} from "@/api";
import type { CsvImportBlockingIssueKind } from "@/app-shell/csvMappingModalViewModel";
import {
  addTradingCalendarSession,
  buildTradingSessionRangeFromInput,
  formatTradingCalendarSummary,
  formatTradingMinute,
  formatTradingSessionEndMinute,
  formatTradingSessionRange,
  isDailyTradingCalendarTimeframe,
  removeTradingCalendarSession,
  TRADING_CALENDAR_WEEKDAYS,
  updateTradingCalendarDay,
  updateTradingCalendarSession,
  type TradingCalendarWeekday,
} from "@/domains/data-import/tradingCalendarUi";
import type { CsvImportPlanConfigRow } from "@/app-shell/AppCsvMappingModalTypes";

export const resolveImportRuleConfidenceText = (
  confidence: "HIGH" | "MEDIUM" | "LOW",
  tt: (key: AppTextKey) => string,
): string => {
  if (confidence === "HIGH") {
    return tt("appText.importRuleConfidenceHigh");
  }
  if (confidence === "MEDIUM") {
    return tt("appText.importRuleConfidenceMedium");
  }
  return tt("appText.importRuleConfidenceLow");
};

const IMPORT_DIAGNOSTIC_LABEL_KEYS = {
  ADJUSTED_OHLC: "appText.importDiagnosticAdjustedOhlc",
  ADJUSTED_VOLUME: "appText.importDiagnosticAdjustedVolume",
  CANONICAL_SCHEMA_MISMATCH: "appText.importDiagnosticCanonicalSchemaMismatch",
  CSV_HEADER_SCHEMA_INCONSISTENT:
    "appText.importableFilesFolderTreeMustUseSameHeader",
  DUPLICATE_TIMESTAMP_CONFLICT:
    "appText.importDiagnosticDuplicateTimestampConflict",
  DUPLICATE_TIMESTAMP_IDENTICAL_DEDUPED:
    "appText.importDiagnosticDuplicateTimestampIdenticalDeduped",
  FIELD_MAPPING_DUPLICATED: "appText.importDiagnosticFieldMappingDuplicated",
  FIELD_MISSING: "appText.importDiagnosticFieldMissing",
  HEADER_NORMALIZED: "appText.importDiagnosticHeaderNormalized",
  HIGH_LOW_REVERSED: "appText.importDiagnosticHighLowReversed",
  MISSING_VOLUME_DEFAULT_ZERO:
    "appText.importDiagnosticMissingVolumeDefaultZero",
  NEGATIVE_PRICE: "appText.importDiagnosticNegativePrice",
  NUMERIC_THOUSANDS_SEPARATOR:
    "appText.importDiagnosticNumericThousandsSeparator",
  OHLC_OUT_OF_RANGE: "appText.importDiagnosticOhlcOutOfRange",
  OPTIONAL_VOLUME_DEFAULT_ZERO:
    "appText.importDiagnosticOptionalVolumeDefaultZero",
  RAW_ADJUSTED_MIXED: "appText.importDiagnosticRawAdjustedMixed",
  RAW_OHLC: "appText.importDiagnosticRawOhlc",
  REQUIRED_FIELD_MISSING: "appText.importDiagnosticRequiredFieldMissing",
  SPLIT_TIME_ZERO_PADDED: "appText.importDiagnosticSplitTimeZeroPadded",
  TIME_CLOSE_FALLBACK: "appText.importDiagnosticTimeCloseFallback",
  TIME_PRIMARY: "appText.importDiagnosticTimePrimary",
  TIME_SPLIT: "appText.importDiagnosticTimeSplit",
  TIMESTAMP_SORTED_BEFORE_IMPORT:
    "appText.importDiagnosticTimestampSortedBeforeImport",
  VOLUME: "appText.importDiagnosticVolume",
} as const satisfies Record<string, AppTextKey>;

type ImportDiagnosticCode = keyof typeof IMPORT_DIAGNOSTIC_LABEL_KEYS;

const isImportDiagnosticCode = (value: string): value is ImportDiagnosticCode =>
  Object.prototype.hasOwnProperty.call(IMPORT_DIAGNOSTIC_LABEL_KEYS, value);

export const resolveImportDiagnosticText = (
  codeRaw: string,
  tt: (key: AppTextKey) => string,
): string => {
  const code = String(codeRaw || "").trim();
  if (!code) {
    return "";
  }
  if (!isImportDiagnosticCode(code)) {
    throw new Error(`Missing import diagnostic label: ${code}`);
  }
  return tt(IMPORT_DIAGNOSTIC_LABEL_KEYS[code]);
};

export const resolveImportDiagnosticListText = (
  codes: readonly string[],
  tt: (key: AppTextKey) => string,
): string =>
  formatListJoinedText(
    getTextLanguage(),
    codes.map((code) => resolveImportDiagnosticText(code, tt)),
  );

export type CsvMappingDraftIssue =
  ApiLocalDataImportDraftValidation["mapping"]["issues"][number];

export const resolveCsvMappingDraftIssueText = ({
  issue,
  field,
  csvFieldLabels,
  fallbackText,
  tt,
  ttf,
}: {
  issue: CsvMappingDraftIssue | null;
  field: CsvFieldKey;
  csvFieldLabels: Record<CsvFieldKey, string>;
  fallbackText: string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
}): string => {
  if (!issue) {
    return fallbackText;
  }
  if (issue.reasonCode === "CSV_MAPPING_DUPLICATED") {
    return tt("appText.fieldMappingRepeatedSelectDifferentColumnEachField");
  }
  if (issue.reasonCode === "CSV_MAPPING_HEADER_MISSING") {
    return ttf("appText.value0MappingInvalid", [csvFieldLabels[field]]);
  }
  if (issue.reasonCode === "CSV_MAPPING_REQUIRED") {
    return ttf("appText.value0Selected", [csvFieldLabels[field]]);
  }
  return fallbackText;
};

export const resolveWarningBannerBodyText = ({
  blockingIssueKind,
  fallbackText,
  mappingProfileSummaryText,
  repairWarningsText,
  timeZoneSummaryText,
}: {
  blockingIssueKind: CsvImportBlockingIssueKind;
  fallbackText: string;
  mappingProfileSummaryText: string;
  repairWarningsText: string;
  timeZoneSummaryText: string;
}): string => {
  if (blockingIssueKind === "field-mapping") {
    return mappingProfileSummaryText || fallbackText;
  }
  if (blockingIssueKind === "repair-warnings") {
    return repairWarningsText || fallbackText;
  }
  if (blockingIssueKind === "time-zone") {
    return timeZoneSummaryText || fallbackText;
  }
  return fallbackText;
};

export const resolvePlanTimeZoneHintText = (
  row: CsvImportPlanConfigRow,
  tt: (key: AppTextKey) => string,
): string => {
  if (row.effectiveTimeZoneSource === "EXISTING_SOURCE") {
    return tt("appText.planReuseSavedDataSourceTimeZone");
  }
  return tt("appText.planUseImportTimeZone");
};

export const formatCompactCount = (value: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.floor(Number(value) || 0)),
  );

const buildWeekdayLabels = (
  tt: (key: AppTextKey) => string,
): Record<TradingCalendarWeekday, string> => ({
  1: tt("appText.weekdayMon"),
  2: tt("appText.weekdayTue"),
  3: tt("appText.weekdayWed"),
  4: tt("appText.weekdayThu"),
  5: tt("appText.weekdayFri"),
  6: tt("appText.weekdaySat"),
  7: tt("appText.weekdaySun"),
});

const resolveTradingCalendarOriginText = (
  origin: ApiTradingCalendarSuggestion["origin"],
  tt: (key: AppTextKey) => string,
): string => {
  if (origin === "DETECTED") {
    return tt("appText.tradingCalendarOriginDetected");
  }
  if (origin === "EXISTING_SOURCE") {
    return tt("appText.tradingCalendarOriginExistingSource");
  }
  return tt("appText.tradingCalendarOriginPresetDefault");
};

export const TradingCalendarEditor = ({
  calendar,
  suggestion,
  baseTimeframe,
  disabled,
  tt,
  ttf,
  onChange,
  onReset,
  validationIssueText = "",
}: {
  calendar: ApiTradingCalendarConfig;
  suggestion: ApiTradingCalendarSuggestion;
  baseTimeframe: BaseTimeframe;
  disabled: boolean;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  onChange: (calendar: ApiTradingCalendarConfig) => void;
  onReset: () => void;
  validationIssueText?: string;
}) => {
  const weekdayLabels = useMemo(() => buildWeekdayLabels(tt), [tt]);
  const language = getTextLanguage();
  const isDailyTimeframe = isDailyTradingCalendarTimeframe(baseTimeframe);
  const [sessionErrorText, setSessionErrorText] = useState("");
  const calendarSummaryText = formatTradingCalendarSummary(
    calendar,
    weekdayLabels,
    language,
    baseTimeframe,
  );
  const suggestionMetaText = formatDotJoinedText(language, [
    resolveTradingCalendarOriginText(suggestion.origin, tt),
    resolveImportRuleConfidenceText(suggestion.confidence, tt),
    ttf("appText.tradingCalendarSampleCountValue0", [
      String(Math.max(0, Number(suggestion.sampleCount) || 0)),
    ]),
  ]);
  useEffect(() => {
    if (isDailyTimeframe) {
      setSessionErrorText("");
    }
  }, [isDailyTimeframe]);

  const commitSessionField = (
    index: number,
    field: "start" | "end",
    value: string,
  ) => {
    const session = calendar.sessions[index];
    if (!session) {
      return;
    }
    const nextSession = buildTradingSessionRangeFromInput(
      field === "start" ? value : formatTradingMinute(session.startMinute),
      field === "end"
        ? value
        : formatTradingSessionEndMinute(session, baseTimeframe),
      baseTimeframe,
    );
    if (!nextSession) {
      setSessionErrorText(
        tt("appText.tradingCalendarTimeframeAlignmentInvalid"),
      );
      return;
    }
    setSessionErrorText("");
    onChange(updateTradingCalendarSession(calendar, index, nextSession));
  };

  return (
    <section className="csv-preview-advanced-section csv-preview-trading-calendar-editor">
      <div className="csv-preview-rule-card-label">
        {tt("appText.tradingCalendar")}
      </div>
      <div className="csv-preview-section-hint">{suggestionMetaText}</div>
      <div className="csv-preview-import-rule-summary">
        <span className="csv-preview-import-rule-summary-label">
          {tt("appText.detectedDefault")}
        </span>
        <span className="csv-preview-import-rule-summary-value">
          {calendarSummaryText || "--"}
        </span>
      </div>

      <div
        className="csv-preview-trading-calendar-days"
        role="group"
        aria-label={tt("appText.defaultTradingDays")}
      >
        {TRADING_CALENDAR_WEEKDAYS.map((weekday) => {
          const active = calendar.tradingDays.includes(weekday);
          return (
            <Button
              key={weekday}
              type="button"
              variant="outline"
              size="sm"
              className="csv-preview-plan-chip csv-preview-trading-calendar-day"
              aria-pressed={active}
              disabled={disabled}
              onClick={() =>
                onChange(updateTradingCalendarDay(calendar, weekday, !active))
              }
            >
              {weekdayLabels[weekday]}
            </Button>
          );
        })}
      </div>

      {!isDailyTimeframe ? (
        <div className="csv-preview-trading-calendar-sessions">
          {calendar.sessions.map((session, index) => (
            <div
              key={`${index}-${formatTradingSessionRange(session, baseTimeframe)}`}
              className="csv-preview-trading-calendar-session-row"
            >
              <span className="csv-preview-section-label">
                {ttf("appText.tradingSessionValue0", [String(index + 1)])}
              </span>
              <Input
                key={`start-${index}-${session.startMinute}`}
                aria-label={tt("appText.tradingSessionStart")}
                defaultValue={formatTradingMinute(session.startMinute)}
                disabled={disabled}
                inputMode="numeric"
                onBlur={(event) =>
                  commitSessionField(index, "start", event.currentTarget.value)
                }
              />
              <Input
                key={`end-${index}-${session.endMinute}-${session.crossesMidnight ? "x" : "n"}`}
                aria-label={tt("appText.tradingSessionEnd")}
                defaultValue={formatTradingSessionEndMinute(
                  session,
                  baseTimeframe,
                )}
                disabled={disabled}
                inputMode="numeric"
                onBlur={(event) =>
                  commitSessionField(index, "end", event.currentTarget.value)
                }
              />
              {session.crossesMidnight ? (
                <span className="csv-preview-plan-chip">
                  {tt("appText.crossesMidnight")}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || calendar.sessions.length <= 1}
                onClick={() =>
                  onChange(removeTradingCalendarSession(calendar, index))
                }
              >
                <VendorIcon name="trash2" className="csv-preview-inline-icon" />
                <span>{tt("appText.delete2")}</span>
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {!isDailyTimeframe && (sessionErrorText || validationIssueText) ? (
        <div className="csv-preview-invalid-file-hint">
          {sessionErrorText || validationIssueText}
        </div>
      ) : null}

      <div className="csv-preview-modal-action-buttons">
        {!isDailyTimeframe ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(addTradingCalendarSession(calendar))}
          >
            <VendorIcon name="plus" className="csv-preview-inline-icon" />
            <span>{tt("appText.addTradingSession")}</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setSessionErrorText("");
            onReset();
          }}
        >
          {tt("appText.resetRecommended")}
        </Button>
      </div>
    </section>
  );
};
