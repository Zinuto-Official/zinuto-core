// SPDX-License-Identifier: GPL-3.0-only

// Import activity guard utilities.
// Canonical implementations in local-api/src/application/dataSourceService.ts.
// These thin wrappers operate on in-memory UI state (import cards, operation flags)
// that is already present in the web layer.

type ImportActivityCard = {
  sourceId?: string | null;
  phase?: string | null;
};

type ImportActivitySource = {
  status?: string | null;
};

type DataConfigOperationLockInput = {
  isPreparingCsvImportPreview: boolean;
  isClearingLocalDataSources: boolean;
  deletingSamplePoolId: string;
  isRemovingSymbols?: boolean;
  isCsvImporting?: boolean;
};

const ACTIVE_IMPORT_PHASES = ["UPLOADING", "IMPORTING", "FINALIZING"] as const;

export const normalizeImportSourceId = (value: unknown): string =>
  String(value ?? "").trim();

export const isActiveLocalDataImportPhase = (phase: unknown): boolean =>
  ACTIVE_IMPORT_PHASES.includes(
    String(phase ?? "").trim() as (typeof ACTIVE_IMPORT_PHASES)[number],
  );

export const isActiveLocalDataImportCard = (
  card: ImportActivityCard | null | undefined,
): boolean =>
  Boolean(
    card &&
      normalizeImportSourceId(card.sourceId) &&
      isActiveLocalDataImportPhase(card.phase),
  );

export const buildActiveLocalDataImportSourceIds = (
  cards: readonly ImportActivityCard[],
): Set<string> => {
  const sourceIds = new Set<string>();
  cards.forEach((card) => {
    if (!isActiveLocalDataImportCard(card)) {
      return;
    }
    const sourceId = normalizeImportSourceId(card.sourceId);
    if (sourceId) {
      sourceIds.add(sourceId);
    }
  });
  return sourceIds;
};

export const isLocalDataImportSourceBusy = (
  sourceIdRaw: unknown,
  activeImportSourceIds: ReadonlySet<string>,
  source?: ImportActivitySource | null,
): boolean => {
  const sourceId = normalizeImportSourceId(sourceIdRaw);
  if (!sourceId) {
    return false;
  }
  return (
    activeImportSourceIds.has(sourceId) ||
    String(source?.status ?? "").trim() === "IMPORTING"
  );
};

export const resolveDataConfigOperationLockState = ({
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  deletingSamplePoolId,
  isRemovingSymbols = false,
  isCsvImporting = false,
}: DataConfigOperationLockInput) => {
  const globalBlocking =
    isPreparingCsvImportPreview ||
    isClearingLocalDataSources ||
    Boolean(String(deletingSamplePoolId || "").trim()) ||
    isRemovingSymbols;
  return {
    globalBlocking,
    importEntryBlocked: globalBlocking,
    cardReorderBlocked: globalBlocking,
    destructiveBlocking: globalBlocking || isCsvImporting,
  };
};
