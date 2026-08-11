// SPDX-License-Identifier: GPL-3.0-only

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

export const INPUT_LIMITS = Object.freeze({
  localProfileNameChars: 40,
  generalNameChars: 64,
  clientOperationIdChars: 120,
  samplePoolNameChars: 20,
  tradingPresetNameChars: 48,
  specialTrainingBankNameChars: 48,
  trainingProjectNameChars: 64,
  customIndicatorProfileNameChars: 40,
  searchQueryChars: 160,
  symbolChars: 32,
  idChars: 128,
  cursorChars: 2048,
  localeChars: 32,
  urlChars: 8192,
  tokenChars: 65_536,
  orderInputChars: 32,
  csvHeaderChars: 120,
  importRowChars: 1_048_576,
  importCellChars: 16_384,
  jsonlLineChars: 1_048_576,
  noteTitleChars: 80,
  noteContentChars: 65_536,
  formulaSourceChars: 65_536,
  parameterKeyChars: 64,
  parameterValueChars: 128,
  recordKeyChars: 128,
  pathChars: 4096,
  relativePathChars: 1024,
  fileNameChars: 255,
  bookmarkChars: 16_384,
  dateTimeChars: 64,
  shortCodeChars: 64,
  versionChars: 64,
  currencyChars: 16,
  externalIdChars: 240,
  headerChars: 512,
});

export const limitInputText = (value: string, maxChars: number): string => {
  const normalizedMax = Math.max(0, Math.floor(Number(maxChars) || 0));
  if (!normalizedMax) {
    return "";
  }
  const normalizedValue = String(value ?? "");
  return normalizedValue.length <= normalizedMax
    ? normalizedValue
    : normalizedValue.slice(0, normalizedMax);
};

export const trimAndLimitInputText = (
  value: string,
  maxChars: number,
): string => limitInputText(String(value ?? "").trim(), maxChars).trim();

export const INPUT_ARRAY_LIMITS = Object.freeze({
  projectIds: 5000,
  poolIds: 500,
  candidateItems: 500,
  tradeActions: 1000,
  replayNoteColors: 5,
  enabledSamplePools: 500,
  symbols: 20000,
  customIndicatorProfiles: 80,
  customIndicatorRevisions: 12,
  importColumns: 512,
});

export const IMPORT_LIMITS = Object.freeze({
  maxFiles: 20000,
  maxSingleFileBytes: 20 * GB,
  maxTotalBytes: 200 * GB,
  previewJobDeadlineMs: 15 * 60 * 1000,
  previewJobDeadlineMaxMs: 60 * 60 * 1000,
  importJobDeadlineMs: 6 * 60 * 60 * 1000,
  importJobDeadlineMaxMs: 24 * 60 * 60 * 1000,
  clientDeadlineGraceMs: 60 * 1000,
  maxFullJsonPreviewBytes: 8 * MB,
  maxInMemoryTabularFileBytes: 128 * MB,
  maxDepth: 16,
  maxPathChars: INPUT_LIMITS.pathChars,
  maxRelativePathChars: INPUT_LIMITS.relativePathChars,
  maxFileNameChars: INPUT_LIMITS.fileNameChars,
  maxBookmarkChars: INPUT_LIMITS.bookmarkChars,
  maxColumns: INPUT_ARRAY_LIMITS.importColumns,
  maxRowChars: INPUT_LIMITS.importRowChars,
  maxCellChars: INPUT_LIMITS.importCellChars,
  maxJsonlLineChars: INPUT_LIMITS.jsonlLineChars,
});

export const SYSTEM_RESET_LIMITS = Object.freeze({
  jobDeadlineMs: 5 * 60 * 1000,
  jobDeadlineMaxMs: 15 * 60 * 1000,
  recoveryDeadlineMs: 2 * 60 * 1000,
  recoveryDeadlineMaxMs: 15 * 60 * 1000,
  clientDeadlineGraceMs: 60 * 1000,
});

export const API_BODY_LIMITS = Object.freeze({
  desktopJsonBodyBytes: 32 * MB,
});

export const DESKTOP_API_LIMITS = Object.freeze({
  marketFrameBarsMax: 3_000,
  startPointOverviewBarsMax: 5_000,
  noteContextBarsMax: 500,
  specialTrainingQuestionBarsMax: 400,
  sessionFillsPageMax: 500,
  replayMarkerPageMax: 2_000,
});

export const INPUT_SERIALIZED_LIMITS = Object.freeze({
  replayNoteMetaBytes: 64 * KB,
  replayNoteMetaSummaryBytes: 16 * KB,
  appPreferencesBytes: 256 * KB,
  trainingSessionTradingSettingsBytes: 64 * KB,
  trainingArchiveDrawingsBytes: 4 * MB,
  trainingArchiveDrawingBytes: 256 * KB,
  chartIndicatorsBytes: 512 * KB,
  customIndicatorParameterInputsBytes: 32 * KB,
});
