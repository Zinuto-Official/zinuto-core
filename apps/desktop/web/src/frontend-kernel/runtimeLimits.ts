// SPDX-License-Identifier: GPL-3.0-only

const runtimeEnv: Record<string, unknown> =
  ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>;

const readEnvInt = (
  key: string,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number => {
  const raw = runtimeEnv[key];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return fallback;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const frontendRuntimeLimits = Object.freeze({
  historyProjectPageSize: readEnvInt('VITE_HISTORY_PROJECT_PAGE_SIZE', 60, 1, 500),
  replayNotePageSize: readEnvInt('VITE_REPLAY_NOTE_PAGE_SIZE', 80, 1, 500),
  maxArchiveDrawingCount: readEnvInt('VITE_MAX_ARCHIVE_DRAWING_COUNT', 12_000, 1),
  maxArchiveTextChars: readEnvInt('VITE_MAX_ARCHIVE_TEXT_CHARS', 240, 1),
  customIndicatorAstMaxStatements: readEnvInt('VITE_CUSTOM_INDICATOR_AST_MAX_STATEMENTS', 800, 1, 10_000),
  customIndicatorAstMaxOperations: readEnvInt('VITE_CUSTOM_INDICATOR_AST_MAX_OPERATIONS', 2_000_000, 1, 50_000_000),
  customIndicatorRuntimeBarsMax: readEnvInt('VITE_CUSTOM_INDICATOR_RUNTIME_BARS_MAX', 120_000, 100, 1_000_000),
  customIndicatorSavedProfilesMax: readEnvInt('VITE_CUSTOM_INDICATOR_SAVED_PROFILES_MAX', 80, 1, 500),
  customIndicatorStorageBytesMax: readEnvInt('VITE_CUSTOM_INDICATOR_STORAGE_BYTES_MAX', 4_000_000, 100_000, 30_000_000),
  customIndicatorProfileRevisionsMax: readEnvInt('VITE_CUSTOM_INDICATOR_PROFILE_REVISIONS_MAX', 12, 1, 120),
  customIndicatorRuntimeCacheEntries: readEnvInt('VITE_CUSTOM_INDICATOR_RUNTIME_CACHE_ENTRIES', 120, 0, 2_000),
  customIndicatorRuntimeCacheBytesMax: readEnvInt('VITE_CUSTOM_INDICATOR_RUNTIME_CACHE_BYTES_MAX', 24_000_000, 0, 500_000_000),
  customIndicatorRuntimeWorkerTimeoutMs: readEnvInt('VITE_CUSTOM_INDICATOR_RUNTIME_WORKER_TIMEOUT_MS', 20_000, 2_000, 120_000),
  anchorOverviewCacheEntries: readEnvInt('VITE_ANCHOR_OVERVIEW_CACHE_ENTRIES', 6, 1, 24)
});
