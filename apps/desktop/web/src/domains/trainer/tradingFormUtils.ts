// SPDX-License-Identifier: GPL-3.0-only

export const DEFAULT_RATIO_PRESET_INPUTS = ['25', '50', '75', '100'] as const;

const DEFAULT_RATIO_PRESET_INPUT_SET = new Set<string>(DEFAULT_RATIO_PRESET_INPUTS);

export const isFixedRatioPresetOption = (
  value: unknown
): value is (typeof DEFAULT_RATIO_PRESET_INPUTS)[number] => {
  return DEFAULT_RATIO_PRESET_INPUT_SET.has(String(value ?? '').trim());
};

export const normalizeFixedRatioPresetOption = (
  value: unknown,
  fallback: (typeof DEFAULT_RATIO_PRESET_INPUTS)[number] = DEFAULT_RATIO_PRESET_INPUTS[0]
): (typeof DEFAULT_RATIO_PRESET_INPUTS)[number] => {
  const normalizedFallback = isFixedRatioPresetOption(fallback) ? fallback : DEFAULT_RATIO_PRESET_INPUTS[0];
  const normalizedValue = String(value ?? '').trim();
  return isFixedRatioPresetOption(normalizedValue) ? normalizedValue : normalizedFallback;
};

export const normalizePoolLotSizeMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const source = value as Record<string, unknown>;
  const next: Record<string, number> = {};
  Object.entries(source).forEach(([rawKey, rawValue]) => {
    const poolId = rawKey.trim();
    if (!poolId) {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    next[poolId] = Math.max(1, Math.floor(parsed));
  });
  return next;
};
