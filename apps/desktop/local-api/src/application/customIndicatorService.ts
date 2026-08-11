// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import { nowIso } from '../kernel/time.js';
import { appError } from '../kernel/appError.js';
import { parseTimestampMs } from '@zinuto/shared/marketTime';
import {
  buildCustomIndicatorProfileStorageFacts,
  estimateCustomIndicatorProfilesStorageBytes,
  resolveCustomIndicatorStorageBytesLimit,
} from './customIndicatorEngine/indicator/profileFacts.js';
import {
  listCustomIndicatorProfileRows,
  replaceCustomIndicatorProfileRows,
  type CustomIndicatorProfileRow,
} from './ports/infrastructure/db/customIndicator/customIndicatorStore.js';

type SavedIndicatorProfileRevision = {
  source: string;
  parameterInputs: Record<string, string>;
  savedAt: string;
};

type SavedIndicatorProfile = {
  id: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
  revisions?: SavedIndicatorProfileRevision[];
  createdAt: string;
  updatedAt: string;
};

type SaveCustomIndicatorProfileInput = {
  id?: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
};

const CUSTOM_INDICATOR_MAX_NAME_LENGTH = INPUT_LIMITS.customIndicatorProfileNameChars;
const CUSTOM_INDICATOR_SOURCE_MAX_LENGTH = INPUT_LIMITS.formulaSourceChars;
const CUSTOM_INDICATOR_SAVED_PROFILES_MAX = runtimeLimits.customIndicatorSavedProfilesMax;
const CUSTOM_INDICATOR_REVISIONS_MAX = runtimeLimits.customIndicatorProfileRevisionsMax;
const CUSTOM_INDICATOR_STORAGE_BYTES_MAX = resolveCustomIndicatorStorageBytesLimit();
const GENERATED_PROFILE_NAME_PATTERN = /^profile_\d+_[a-z0-9]{4,}$/i;
const SYSTEM_OVERRIDE_PROFILE_ID_PREFIX = 'sys_override:';
const OUTPUT_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:(?!=)/m;
const DEFAULT_PROFILE_FALLBACK_NAME = 'CUSTOM';

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const normalizeProfileNameKey = (value: string): string => value.trim().toUpperCase();
const createSavedIndicatorProfileId = (): string =>
  `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const parseSystemOverrideTemplateId = (profileId: string): string => {
  if (!profileId || !profileId.startsWith(SYSTEM_OVERRIDE_PROFILE_ID_PREFIX)) {
    return '';
  }
  return normalizeProfileNameKey(profileId.slice(SYSTEM_OVERRIDE_PROFILE_ID_PREFIX.length));
};

const deriveNameFromSource = (source: unknown): string => {
  const normalizedSource = normalizeText(source);
  if (!normalizedSource) {
    return '';
  }
  const matched = normalizedSource.match(OUTPUT_ASSIGNMENT_PATTERN);
  if (!matched) {
    return '';
  }
  return normalizeProfileNameKey(matched[1] ?? '');
};

const looksLikeMachineProfileName = (name: string, profileId: string): boolean => {
  if (!name) {
    return false;
  }
  if (GENERATED_PROFILE_NAME_PATTERN.test(name)) {
    return true;
  }
  if (profileId && name.toLowerCase() === profileId.toLowerCase()) {
    return true;
  }
  return false;
};

const resolveCustomIndicatorProfileName = (options: {
  profileId?: unknown;
  name?: unknown;
  source?: unknown;
  fallbackName?: unknown;
}): string => {
  const profileId = normalizeText(options.profileId);
  const resolvedName = normalizeText(options.name);
  const fallbackName = normalizeText(options.fallbackName);
  const overrideTemplateId = parseSystemOverrideTemplateId(profileId);

  if (overrideTemplateId) {
    return overrideTemplateId;
  }

  if (resolvedName && !looksLikeMachineProfileName(resolvedName, profileId)) {
    return resolvedName;
  }

  const sourceDerivedName = deriveNameFromSource(options.source);
  if (sourceDerivedName) {
    return sourceDerivedName;
  }

  if (fallbackName) {
    return fallbackName;
  }
  if (resolvedName) {
    return resolvedName;
  }
  return DEFAULT_PROFILE_FALLBACK_NAME;
};

const normalizeIsoTimestamp = (value: unknown, fallbackIso: string): string => {
  if (typeof value !== 'string') {
    return fallbackIso;
  }
  const timestamp = parseTimestampMs(value);
  if (!Number.isFinite(timestamp)) {
    return fallbackIso;
  }
  return new Date(timestamp).toISOString();
};

const normalizeParameterInputs = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const normalized = Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
    const normalizedKey = normalizeProfileNameKey(key);
    if (!normalizedKey) {
      return acc;
    }
    if (normalizedKey.length > INPUT_LIMITS.parameterKeyChars) {
      throw appError('CUSTOM_INDICATOR_PARAMETER_INVALID', { max: INPUT_LIMITS.parameterKeyChars });
    }
    const normalizedValue = String(item ?? '');
    if (normalizedValue.length > INPUT_LIMITS.parameterValueChars) {
      throw appError('CUSTOM_INDICATOR_PARAMETER_INVALID', { max: INPUT_LIMITS.parameterValueChars });
    }
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
  return Object.keys(normalized)
    .sort((left, right) => left.localeCompare(right, 'en'))
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = normalized[key]!;
      return acc;
    }, {});
};

const normalizeRevision = (value: unknown): SavedIndicatorProfileRevision | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<SavedIndicatorProfileRevision>;
  const source = normalizeText(row.source);
  if (!source || source.length > CUSTOM_INDICATOR_SOURCE_MAX_LENGTH) {
    return null;
  }
  return {
    source,
    parameterInputs: normalizeParameterInputs(row.parameterInputs),
    savedAt: normalizeIsoTimestamp((row as { savedAt?: unknown }).savedAt, nowIso())
  };
};

const normalizeRevisions = (value: unknown): SavedIndicatorProfileRevision[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeRevision(item))
    .filter((item): item is SavedIndicatorProfileRevision => Boolean(item))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, CUSTOM_INDICATOR_REVISIONS_MAX);
};

const normalizeProfile = (value: unknown): SavedIndicatorProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<SavedIndicatorProfile>;
  const id = normalizeText(row.id);
  const source = normalizeText(row.source);
  if (!id || !source) {
    return null;
  }
  if (source.length > CUSTOM_INDICATOR_SOURCE_MAX_LENGTH) {
    return null;
  }
  const name = resolveCustomIndicatorProfileName({
    profileId: id,
    name: row.name,
    source,
    fallbackName: row.name
  });
  if (!name) {
    return null;
  }
  if (name.length > CUSTOM_INDICATOR_MAX_NAME_LENGTH) {
    throw appError('CUSTOM_INDICATOR_PROFILE_NAME_TOO_LONG', { max: CUSTOM_INDICATOR_MAX_NAME_LENGTH });
  }

  const now = nowIso();
  return {
    id,
    name,
    source,
    parameterInputs: normalizeParameterInputs(row.parameterInputs),
    revisions: normalizeRevisions((row as { revisions?: unknown }).revisions),
    createdAt: normalizeIsoTimestamp(row.createdAt, now),
    updatedAt: normalizeIsoTimestamp(row.updatedAt, now),
  };
};

const sortProfilesByUpdatedAtDesc = (profiles: SavedIndicatorProfile[]): SavedIndicatorProfile[] =>
  [...profiles].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const clipProfiles = (profiles: SavedIndicatorProfile[]): SavedIndicatorProfile[] => {
  const deduped: SavedIndicatorProfile[] = [];
  const idSet = new Set<string>();
  sortProfilesByUpdatedAtDesc(profiles).forEach((profile) => {
    if (idSet.has(profile.id)) {
      return;
    }
    idSet.add(profile.id);
    deduped.push(profile);
  });
  return deduped.slice(0, CUSTOM_INDICATOR_SAVED_PROFILES_MAX);
};

const assertProfilesStorageWithinLimits = (
  profiles: readonly SavedIndicatorProfile[],
): void => {
  const bytes = estimateCustomIndicatorProfilesStorageBytes(profiles);
  if (bytes <= CUSTOM_INDICATOR_STORAGE_BYTES_MAX) {
    return;
  }
  throw appError('PROFILE_STORAGE_LIMIT_EXCEEDED', {
    bytes,
    maxBytes: CUSTOM_INDICATOR_STORAGE_BYTES_MAX,
  });
};

const parseJsonSafe = <T,>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const mapProfileRow = (row: CustomIndicatorProfileRow): SavedIndicatorProfile => {
  const now = nowIso();
  const id = normalizeText(row.id);
  const source = normalizeText(row.source);
  return {
    id,
    name: resolveCustomIndicatorProfileName({
      profileId: id,
      name: row.name,
      source,
      fallbackName: row.name
    }),
    source,
    parameterInputs: normalizeParameterInputs(parseJsonSafe<unknown>(row.parameter_inputs_json, {})),
    revisions: normalizeRevisions(parseJsonSafe<unknown>(row.revisions_json, [])),
    createdAt: normalizeIsoTimestamp(row.created_at, now),
    updatedAt: normalizeIsoTimestamp(row.updated_at, now),
  };
};

const profileRowSchema = z.object({
  id: z.string().trim().min(1).max(INPUT_LIMITS.idChars),
  name: z.string().trim().min(1).max(CUSTOM_INDICATOR_MAX_NAME_LENGTH),
  source: z.string().trim().min(1).max(CUSTOM_INDICATOR_SOURCE_MAX_LENGTH),
  parameterInputs: z.record(
    z.string().max(INPUT_LIMITS.parameterKeyChars),
    z.string().max(INPUT_LIMITS.parameterValueChars),
  ),
  revisions: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(CUSTOM_INDICATOR_SOURCE_MAX_LENGTH),
        parameterInputs: z.record(
          z.string().max(INPUT_LIMITS.parameterKeyChars),
          z.string().max(INPUT_LIMITS.parameterValueChars),
        ),
        savedAt: z.string().trim().min(1).max(INPUT_LIMITS.dateTimeChars)
      })
    )
    .max(CUSTOM_INDICATOR_REVISIONS_MAX)
    .optional(),
  createdAt: z.string().trim().min(1).max(INPUT_LIMITS.dateTimeChars),
  updatedAt: z.string().trim().min(1).max(INPUT_LIMITS.dateTimeChars)
});

const listCustomIndicatorProfilesRaw = (): SavedIndicatorProfile[] => {
  const rows = listCustomIndicatorProfileRows();
  const normalized = rows.map(mapProfileRow).map((profile) => normalizeProfile(profile)).filter((item): item is SavedIndicatorProfile => Boolean(item));
  return clipProfiles(normalized);
};

export const listCustomIndicatorProfiles = async (): Promise<SavedIndicatorProfile[]> =>
  listCustomIndicatorProfilesRaw();

export const replaceCustomIndicatorProfiles = async (
  profiles: unknown
): Promise<{
  storedCount: number;
  profiles: SavedIndicatorProfile[];
  updatedAt: string;
}> => {
  if (!Array.isArray(profiles)) {
    throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
  }

  if (profiles.length > CUSTOM_INDICATOR_SAVED_PROFILES_MAX) {
    throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
  }

  const parsedProfiles = profiles.map((item) => {
    const parsed = profileRowSchema.safeParse(item);
    if (!parsed.success) {
      throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
    }
    const normalized = normalizeProfile(parsed.data);
    if (!normalized) {
      throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
    }
    return normalized;
  });

  const nextProfiles = clipProfiles(parsedProfiles);
  if (nextProfiles.length !== parsedProfiles.length) {
    throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
  }
  assertProfilesStorageWithinLimits(nextProfiles);
  replaceCustomIndicatorProfileRows(
    nextProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      source: profile.source,
      parameterInputsJson: JSON.stringify(profile.parameterInputs ?? {}),
      revisionsJson: JSON.stringify(profile.revisions ?? []),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    })),
  );

  return {
    storedCount: nextProfiles.length,
    profiles: await listCustomIndicatorProfiles(),
    updatedAt: nowIso()
  };
};

export const saveCustomIndicatorProfile = async (
  input: SaveCustomIndicatorProfileInput,
): Promise<{
  storedCount: number;
  profiles: SavedIndicatorProfile[];
  profile: SavedIndicatorProfile;
  updatedAt: string;
}> => {
  const previousProfiles = listCustomIndicatorProfilesRaw();
  const normalizedId = normalizeText(input.id);
  const existing = normalizedId
    ? previousProfiles.find((profile) => profile.id === normalizedId) ?? null
    : null;
  const source = normalizeText(input.source);
  if (!source) {
    throw appError('PROFILE_SOURCE_EMPTY');
  }
  if (source.length > CUSTOM_INDICATOR_SOURCE_MAX_LENGTH) {
    throw appError('PROFILE_SOURCE_TOO_LONG', { max: CUSTOM_INDICATOR_SOURCE_MAX_LENGTH });
  }
  const profileId = existing?.id ?? (normalizedId || createSavedIndicatorProfileId());
  const name = resolveCustomIndicatorProfileName({
    profileId,
    name: input.name,
    source,
    fallbackName: existing?.name,
  });
  if (!name) {
    throw appError('PROFILE_NAME_EMPTY');
  }
  if (name.length > CUSTOM_INDICATOR_MAX_NAME_LENGTH) {
    throw appError('CUSTOM_INDICATOR_PROFILE_NAME_TOO_LONG', {
      max: CUSTOM_INDICATOR_MAX_NAME_LENGTH,
    });
  }
  const parameterInputs = normalizeParameterInputs(input.parameterInputs);
  const hasChanged = existing
    ? existing.source !== source ||
      JSON.stringify(existing.parameterInputs) !== JSON.stringify(parameterInputs)
    : false;
  const revisions = existing && hasChanged
    ? [
        {
          source: existing.source,
          parameterInputs: existing.parameterInputs,
          savedAt: existing.updatedAt,
        },
        ...(existing.revisions ?? []),
      ]
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
        .slice(0, CUSTOM_INDICATOR_REVISIONS_MAX)
    : (existing?.revisions ?? []).slice(0, CUSTOM_INDICATOR_REVISIONS_MAX);
  const now = nowIso();
  const profile: SavedIndicatorProfile = {
    id: profileId,
    name,
    source,
    parameterInputs,
    revisions,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const nextProfiles = clipProfiles([
    profile,
    ...previousProfiles.filter((item) => item.id !== profile.id),
  ]);
  if (!nextProfiles.some((item) => item.id === profile.id)) {
    const storageFacts = buildCustomIndicatorProfileStorageFacts(nextProfiles);
    throw appError('PROFILE_STORAGE_LIMIT_EXCEEDED', storageFacts);
  }
  const result = await replaceCustomIndicatorProfiles(nextProfiles);
  const persistedProfile =
    result.profiles.find((item) => item.id === profile.id) ?? profile;
  return {
    ...result,
    profile: persistedProfile,
  };
};

export const deleteCustomIndicatorProfile = async (
  profileId: string,
): Promise<{
  storedCount: number;
  profiles: SavedIndicatorProfile[];
  deletedProfileId: string;
  updatedAt: string;
}> => {
  const normalizedId = normalizeText(profileId);
  if (!normalizedId) {
    throw appError('CUSTOM_INDICATOR_PROFILES_INVALID');
  }
  const previousProfiles = listCustomIndicatorProfilesRaw();
  const result = await replaceCustomIndicatorProfiles(
    previousProfiles.filter((profile) => profile.id !== normalizedId),
  );
  return {
    ...result,
    deletedProfileId: normalizedId,
  };
};
