// SPDX-License-Identifier: GPL-3.0-only

export type VolumeFieldMappingLike = {
  volume?: unknown;
} | null | undefined;

export type VolumeBarLike = {
  volume?: unknown;
} | null | undefined;

export const hasMappedVolumeField = (fieldMapping: VolumeFieldMappingLike): boolean =>
  String(fieldMapping?.volume ?? "").trim().length > 0;

export const shouldShowVolumePaneForLocalSource = (
  fieldMapping: VolumeFieldMappingLike,
): boolean => fieldMapping == null || hasMappedVolumeField(fieldMapping);

export const hasPositiveVolumeData = (
  bars: readonly VolumeBarLike[] | null | undefined,
): boolean =>
  Array.isArray(bars) &&
  bars.some((bar) => {
    const volume = Number(bar?.volume);
    return Number.isFinite(volume) && volume > 0;
  });

export const shouldShowVolumePaneForReplayBars = (
  bars: readonly VolumeBarLike[] | null | undefined,
  fallback = true,
): boolean => {
  if (!Array.isArray(bars) || bars.length <= 0) {
    return fallback;
  }
  return hasPositiveVolumeData(bars);
};
