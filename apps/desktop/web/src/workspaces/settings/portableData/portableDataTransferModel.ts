// SPDX-License-Identifier: GPL-3.0-only

import type { ApiLocalDataSourceSummary, PortableExportDomain } from "@/api";
import type {
  AppUiLanguage,
  getPortableDataTransferCopy,
} from "@/ui/config/uiConfig";

export type PortableTransferSourceRow = Pick<
  ApiLocalDataSourceSummary,
  "id" | "name" | "baseTimeframe" | "symbolCount" | "barCount" | "status"
>;
export type ExportStep = "SELECT" | "PREVIEW" | "CONFIRM" | "SUCCESS";
export type ImportStep = "PICK" | "OVERVIEW" | "SELECT" | "RESULT";
export type PortableDataTransferSectionProps = {
  exportEnabled: boolean;
  importEnabled: boolean;
  onNavigateToDataForRebind?: (sourceIds: string[]) => void;
};
export type PortableDomainOption = {
  domain: PortableExportDomain;
  label: string;
};

const PORTABLE_EXPORT_DOMAIN_ORDER: readonly PortableExportDomain[] = [
  "SETTINGS",
  "CUSTOM_INDICATORS",
  "NOTES",
  "TRAINING_HISTORY",
  "SPECIAL_TRAINING_HISTORY",
  "MARKET_DATA",
];

export const getDefaultExportDomains = (): PortableExportDomain[] => [
  ...PORTABLE_EXPORT_DOMAIN_ORDER,
];

const countFormatterCache = new Map<string, Intl.NumberFormat>();

export const formatPortableTransferCount = (
  language: AppUiLanguage,
  value: number,
): string => {
  const formatter =
    countFormatterCache.get(language) ?? new Intl.NumberFormat(language);
  if (!countFormatterCache.has(language)) {
    countFormatterCache.set(language, formatter);
  }
  return formatter.format(Math.max(0, Math.floor(Number(value) || 0)));
};

export const normalizePortableTransferSourceRows = (
  rows: ApiLocalDataSourceSummary[],
): PortableTransferSourceRow[] =>
  rows
    .filter(
      (row) =>
        String(row.id || "").trim().length > 0 &&
        Math.max(0, Number(row.barCount || 0)) > 0,
    )
    .sort((left, right) => {
      const updatedCompare = String(right.updatedAt || "").localeCompare(
        String(left.updatedAt || ""),
        "en",
      );
      return updatedCompare !== 0
        ? updatedCompare
        : String(left.name || "").localeCompare(String(right.name || ""), "en");
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      baseTimeframe: row.baseTimeframe,
      symbolCount: row.symbolCount,
      barCount: row.barCount,
      status: row.status,
    }));

export const buildPortableDomainOptions = (
  copy: ReturnType<typeof getPortableDataTransferCopy>,
): PortableDomainOption[] => [
  { domain: "SETTINGS", label: copy.domainSettingsLabel },
  { domain: "CUSTOM_INDICATORS", label: copy.domainIndicatorsLabel },
  { domain: "NOTES", label: copy.domainNotesLabel },
  { domain: "TRAINING_HISTORY", label: copy.domainTrainingHistoryLabel },
  {
    domain: "SPECIAL_TRAINING_HISTORY",
    label: copy.domainSpecialHistoryLabel,
  },
  { domain: "MARKET_DATA", label: copy.marketDataLabel },
];
