// SPDX-License-Identifier: GPL-3.0-only

import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import { normalizeNativeImportDirectoryPath } from '@/domains/data-import/nativeImportHelpers';

export const isCsvImportCardPhaseActive = (
  phase: CsvImportCardState['phase'],
): boolean =>
  phase === 'UPLOADING' || phase === 'IMPORTING' || phase === 'FINALIZING';

export const resolveActiveImportCardSourceFolderBySourceId = (
  sourceId: string,
  importCards: ReadonlyArray<CsvImportCardState>,
): string => {
  const normalizedSourceId = String(sourceId || '').trim();
  if (!normalizedSourceId) {
    return '';
  }
  for (let index = importCards.length - 1; index >= 0; index -= 1) {
    const card = importCards[index];
    if (String(card?.sourceId || '').trim() !== normalizedSourceId) {
      continue;
    }
    if (!isCsvImportCardPhaseActive(card.phase)) {
      continue;
    }
    const folder = normalizeNativeImportDirectoryPath(card?.sourceFolder || '');
    if (folder) {
      return folder;
    }
  }
  return '';
};
