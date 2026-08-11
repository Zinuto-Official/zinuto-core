// SPDX-License-Identifier: GPL-3.0-only

/**
 * Barrel file — re-exports the portable data API from portableData/.
 * Split from the original monolith for maintainability.
 */
export {
  PORTABLE_EXPORT_DOMAINS,
  previewPortableExport,
  executePortableExport,
  inspectPortableImportPackage,
  executePortableImport,
  recoverPortableImportsAtStartup,
} from './portableData/index.js';

export type {
  PortableDateRangeFilter,
  PortableDomainPreview,
  PortableExportDomain,
  PortableExportManifest,
  PortableExportPreview,
  PortableExportResult,
  PortableImportConflictMode,
  PortableImportPreview,
  PortableImportPreviewDomain,
  PortableImportResult,
  PortableImportDurablePhase,
  PortableImportExecutionRuntime,
  PortableImportSettingsConflictMode,
  PortableMarketSourcePreview,
  PortableSnapshotPolicy,
  ReplayAvailability,
} from './portableData/index.js';
