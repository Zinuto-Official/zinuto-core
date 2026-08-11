// SPDX-License-Identifier: GPL-3.0-only

import { runtimeLimits } from '../../../kernel/runtimeLimits.js';

export type CustomIndicatorProfileStorageFactInput = {
  id?: unknown;
  source?: unknown;
  revisions?: unknown;
};

export type CustomIndicatorProfileStorageFacts = {
  profileCount: number;
  revisionCount: number;
  maxProfiles: number;
  maxRevisionsPerProfile: number;
  maxStorageBytes: number;
  storageBytes: number;
  limitExceeded: boolean;
  bytesLimitExceeded: boolean;
};

const DEFAULT_CUSTOM_INDICATOR_STORAGE_BYTES_MAX = 4_000_000;
export const estimateCustomIndicatorProfilesStorageBytes = (
  profiles: readonly unknown[],
): number => Buffer.byteLength(JSON.stringify(profiles), 'utf8');

export const resolveCustomIndicatorStorageBytesLimit = (): number => {
  const configured = Number(
    (
      runtimeLimits as typeof runtimeLimits & {
        customIndicatorStorageBytesMax?: unknown;
      }
    ).customIndicatorStorageBytesMax,
  );
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_CUSTOM_INDICATOR_STORAGE_BYTES_MAX;
};

export const buildCustomIndicatorProfileStorageFacts = (
  profiles: readonly CustomIndicatorProfileStorageFactInput[],
): CustomIndicatorProfileStorageFacts => {
  const revisionCount = profiles.reduce((total, profile) => {
    const revisions = Array.isArray(profile.revisions)
      ? profile.revisions.length
      : 0;
    return total + revisions;
  }, 0);
  const storageBytes = estimateCustomIndicatorProfilesStorageBytes(profiles);
  const maxProfiles = runtimeLimits.customIndicatorSavedProfilesMax;
  const maxStorageBytes = resolveCustomIndicatorStorageBytesLimit();
  return {
    profileCount: profiles.length,
    revisionCount,
    maxProfiles,
    maxRevisionsPerProfile: runtimeLimits.customIndicatorProfileRevisionsMax,
    maxStorageBytes,
    storageBytes,
    limitExceeded: profiles.length > maxProfiles,
    bytesLimitExceeded: storageBytes > maxStorageBytes,
  };
};
