// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../kernel/appError.js';
import type { PORTABLE_TRANSFER_FORMAT_VERSION } from './portableDataContainer.js';

export const PORTABLE_EXPORT_DOMAINS = [
  'SETTINGS',
  'CUSTOM_INDICATORS',
  'NOTES',
  'TRAINING_HISTORY',
  'SPECIAL_TRAINING_HISTORY',
  'MARKET_DATA',
] as const;

export type PortableExportDomain = (typeof PORTABLE_EXPORT_DOMAINS)[number];

export const PORTABLE_IMPORT_EXECUTION_ORDER: readonly PortableExportDomain[] = [
  'SETTINGS',
  'CUSTOM_INDICATORS',
  'MARKET_DATA',
  'TRAINING_HISTORY',
  'SPECIAL_TRAINING_HISTORY',
  'NOTES',
];

export type PortableSnapshotPolicy = 'EVIDENCE_ONLY';
export type PortableImportConflictMode =
  | 'MERGE_KEEP_LOCAL'
  | 'REPLACE_DOMAIN';
export type PortableImportSettingsConflictMode =
  | 'KEEP_LOCAL'
  | 'REPLACE_TARGET';
export type ReplayAvailability =
  | 'READY'
  | 'SOURCE_CHANGED'
  | 'SOURCE_MISSING'
  | 'SNAPSHOT_ONLY';

export type PortableDateRangeFilter = {
  from: string | null;
  to: string | null;
};

export type PortableDomainPreview = {
  domain: PortableExportDomain;
  itemCount: number;
  estimatedBytes: number;
  includesEvidenceSnapshots: boolean;
  needsRebindAfterImport: boolean;
};

export type PortableMarketSourcePreview = {
  sourceId: string;
  sourceName: string;
  baseTimeframe: string;
  timeZone: string;
  symbolCount: number;
  barCount: number;
  estimatedBytes: number;
  linkedTrainingProjectCount: number;
  linkedSpecialTrainingQuestionCount: number;
};

export type PortableExportPreview = {
  domains: PortableDomainPreview[];
  marketSources: PortableMarketSourcePreview[];
  totalItems: number;
  estimatedBytes: number;
  snapshotPolicy: PortableSnapshotPolicy;
  dateRange: PortableDateRangeFilter;
};

export type PortableExportManifest = {
  schemaVersion: typeof PORTABLE_TRANSFER_FORMAT_VERSION;
  exportId: string;
  exportedAt: string;
  appBuildVersion: string;
  selectedDomains: PortableExportDomain[];
  selectedMarketSourceIds: string[];
  dateRange: PortableDateRangeFilter;
  snapshotPolicy: PortableSnapshotPolicy;
  countsByDomain: Record<PortableExportDomain, number>;
  payloadBytes: number;
  marketDataIncluded: boolean;
};

export type PortableExportResult = {
  outputPath: string;
  manifest: PortableExportManifest;
  fileBytes: number;
};

export type PortableImportPreviewDomain = PortableDomainPreview & {
  conflictCount: number;
};

export type PortableImportPreview = {
  manifest: PortableExportManifest;
  domains: PortableImportPreviewDomain[];
  marketSources: PortableMarketSourcePreview[];
  totalItems: number;
  payloadBytes: number;
  fullRestoreCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
  snapshotOnlyCounts: {
    trainingProjects: number;
    specialTrainingQuestions: number;
  };
};

export type PortableImportResult = {
  manifest: PortableExportManifest;
  importedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  skippedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  conflictCountByDomain: Partial<Record<PortableExportDomain, number>>;
  remappedIds: {
    notes: number;
    trainingProjects: number;
    specialTrainingSessions: number;
    specialTrainingQuestions: number;
  };
  rebind: {
    trainingProjectRefsUpdated: number;
    specialTrainingQuestionsUpdated: number;
  };
  marketImport: {
    importedSources: number;
    reusedSources: number;
    importedInstruments: number;
    importedBars: number;
    pendingRebindSourceIds: string[];
  };
};

const normalizeText = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value ?? '')).trim();

export const normalizeDateRange = (
  input?: Partial<PortableDateRangeFilter> | null,
): PortableDateRangeFilter => {
  const from = normalizeText(input?.from);
  const to = normalizeText(input?.to);
  return {
    from: from || null,
    to: to || null,
  };
};

export const normalizeDomains = (
  domains?: readonly PortableExportDomain[] | null,
): PortableExportDomain[] => {
  if (domains === undefined || domains === null) {
    return [...PORTABLE_EXPORT_DOMAINS];
  }
  const normalized = Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map((domain) => normalizeText(domain).toUpperCase())
        .filter((domain): domain is PortableExportDomain =>
          PORTABLE_EXPORT_DOMAINS.includes(domain as PortableExportDomain),
        ),
    ),
  );
  if (!normalized.length) {
    throw appError('PORTABLE_DOMAIN_SELECTION_REQUIRED');
  }
  return normalized;
};

export const normalizeManifestDomains = (
  domains?: readonly PortableExportDomain[] | null,
): PortableExportDomain[] => {
  const normalized = Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map((domain) => normalizeText(domain).toUpperCase())
        .filter((domain): domain is PortableExportDomain =>
          PORTABLE_EXPORT_DOMAINS.includes(domain as PortableExportDomain),
        ),
    ),
  );
  if (!normalized.length) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return normalized;
};
