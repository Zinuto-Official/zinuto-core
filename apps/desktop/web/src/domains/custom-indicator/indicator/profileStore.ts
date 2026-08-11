// SPDX-License-Identifier: GPL-3.0-only

import { api, type ApiSavedIndicatorProfile } from '@/api';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import {
  parseSystemDefaultIndicatorOverrideTemplateIdByProfileId,
  resolveSavedIndicatorProfileDisplayName
} from '@/domains/custom-indicator/indicator/profileDisplayName';
import { parseTimestampMs } from '@zinuto/shared/marketTime';

export type SavedIndicatorProfile = {
  id: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
  revisions?: SavedIndicatorProfileRevision[];
  createdAt: string;
  updatedAt: string;
};

export type SavedIndicatorProfileRevision = {
  source: string;
  parameterInputs: Record<string, string>;
  savedAt: string;
};

type SavedIndicatorProfileDraft = {
  id?: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
};

type SavedIndicatorProfilesWriteResult = {
  ok: boolean;
  storedCount: number;
  bytes: number;
  code?:
    | 'PROFILE_STORAGE_LIMIT_EXCEEDED'
    | 'STORAGE_WRITE_FAILED';
  message?: string;
};

type SavedIndicatorProfileSaveResult = SavedIndicatorProfilesWriteResult & {
  profiles: SavedIndicatorProfile[];
  profile: SavedIndicatorProfile | null;
};

const CUSTOM_INDICATOR_STORAGE_CHANGE_EVENT = 'zinuto-custom-indicator-profiles-changed';
const SYSTEM_DEFAULT_INDICATOR_OVERRIDE_ID_PREFIX = 'sys_override:';

let savedProfilesCache: SavedIndicatorProfile[] = [];
let savedProfilesVersionToken = '';
let savedProfilesHydrated = false;
let hydrateProfilesPromise: Promise<SavedIndicatorProfile[]> | null = null;
let hydrateProfilesRequestSeq = 0;

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readProfileWriteFailure = (
  error: unknown,
): Pick<SavedIndicatorProfilesWriteResult, 'code' | 'message'> => {
  const code =
    error && typeof error === 'object'
      ? String((error as { code?: unknown }).code ?? '').trim().toUpperCase()
      : '';
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : tt('appText.saveIndicatorProfiles');
  return {
    code:
      code === 'PROFILE_STORAGE_LIMIT_EXCEEDED'
        ? 'PROFILE_STORAGE_LIMIT_EXCEEDED'
        : 'STORAGE_WRITE_FAILED',
    message,
  };
};

export const buildSystemDefaultIndicatorOverrideProfileId = (templateId: string): string => {
  const normalizedTemplateId = normalizeText(templateId);
  return normalizedTemplateId ? `${SYSTEM_DEFAULT_INDICATOR_OVERRIDE_ID_PREFIX}${normalizedTemplateId}` : '';
};

export const parseSystemDefaultIndicatorOverrideTemplateId = (profileId: string): string | null => {
  return parseSystemDefaultIndicatorOverrideTemplateIdByProfileId(profileId);
};

const normalizeParameterInputs = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      return acc;
    }
    const normalizedValue = String(item ?? '');
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
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

const normalizeRevisions = (value: unknown): SavedIndicatorProfileRevision[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Partial<SavedIndicatorProfileRevision>;
      const source = normalizeText(row.source);
      if (!source) {
        return null;
      }
      const savedAt = normalizeIsoTimestamp((row as { savedAt?: unknown }).savedAt, new Date().toISOString());
      return {
        source,
        parameterInputs: normalizeParameterInputs(row.parameterInputs),
        savedAt
      } satisfies SavedIndicatorProfileRevision;
    })
    .filter((item): item is SavedIndicatorProfileRevision => Boolean(item))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));

  return normalized;
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
  const name = resolveSavedIndicatorProfileDisplayName({
    profileId: id,
    name: row.name,
    source,
    overrideTemplateId: parseSystemDefaultIndicatorOverrideTemplateId(id)
  });
  if (!name) {
    return null;
  }

  const nowIso = new Date().toISOString();
  return {
    id,
    name,
    source,
    parameterInputs: normalizeParameterInputs(row.parameterInputs),
    revisions: normalizeRevisions((row as { revisions?: unknown }).revisions),
    createdAt: normalizeIsoTimestamp(row.createdAt, nowIso),
    updatedAt: normalizeIsoTimestamp(row.updatedAt, nowIso),
  };
};

const sortProfilesByUpdatedAtDesc = (profiles: SavedIndicatorProfile[]): SavedIndicatorProfile[] =>
  [...profiles].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const dedupeProfilesById = (profiles: SavedIndicatorProfile[]): SavedIndicatorProfile[] => {
  const next: SavedIndicatorProfile[] = [];
  const seen = new Set<string>();
  sortProfilesByUpdatedAtDesc(profiles).forEach((profile) => {
    if (seen.has(profile.id)) {
      return;
    }
    seen.add(profile.id);
    next.push(profile);
  });
  return next;
};

const estimateTextBytes = (value: string): number => {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value).length;
    }
  } catch {
    // Fallback below.
  }
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
      continue;
    }
    if (code <= 0x7ff) {
      bytes += 2;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
      continue;
    }
    bytes += 3;
  }
  return bytes;
};

const serializeProfiles = (profiles: SavedIndicatorProfile[]): string => JSON.stringify(profiles);

const estimateProfilesBytes = (profiles: SavedIndicatorProfile[]): number => estimateTextBytes(serializeProfiles(profiles));

const createProfileVersionToken = (profiles: SavedIndicatorProfile[]): string =>
  `${Date.now()}_${profiles.length}_${Math.random().toString(36).slice(2, 8)}`;

const emitProfileChangeEvent = (versionToken: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(CUSTOM_INDICATOR_STORAGE_CHANGE_EVENT, {
        detail: { versionToken }
      })
    );
  } catch {
    // Ignore custom event dispatch failures.
  }
};

const publishSavedProfilesSnapshot = (profiles: SavedIndicatorProfile[]): SavedIndicatorProfile[] => {
  savedProfilesCache = dedupeProfilesById(
    profiles.map((item) => normalizeProfile(item)).filter((item): item is SavedIndicatorProfile => Boolean(item))
  );
  savedProfilesVersionToken = createProfileVersionToken(savedProfilesCache);
  emitProfileChangeEvent(savedProfilesVersionToken);
  return savedProfilesCache;
};

const mapApiProfile = (profile: ApiSavedIndicatorProfile): SavedIndicatorProfile | null => normalizeProfile(profile);

const toApiProfile = (profile: SavedIndicatorProfile): ApiSavedIndicatorProfile => ({
  id: profile.id,
  name: profile.name,
  source: profile.source,
  parameterInputs: { ...(profile.parameterInputs ?? {}) },
  revisions: Array.isArray(profile.revisions)
    ? profile.revisions.map((revision) => ({
        source: revision.source,
        parameterInputs: { ...(revision.parameterInputs ?? {}) },
        savedAt: revision.savedAt
      }))
    : [],
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

export const hasSavedIndicatorProfilesHydrated = (): boolean => savedProfilesHydrated;

export const hydrateSavedIndicatorProfilesFromDatabase = async (force = false): Promise<SavedIndicatorProfile[]> => {
  if (!force && savedProfilesHydrated) {
    return savedProfilesCache;
  }
  if (!force && hydrateProfilesPromise) {
    return hydrateProfilesPromise;
  }

  const requestSeq = hydrateProfilesRequestSeq + 1;
  hydrateProfilesRequestSeq = requestSeq;
  hydrateProfilesPromise = (async () => {
    const profiles = await api.listCustomIndicatorProfiles();
    const normalized = profiles.map((item) => mapApiProfile(item)).filter((item): item is SavedIndicatorProfile => Boolean(item));
    savedProfilesHydrated = true;
    if (requestSeq !== hydrateProfilesRequestSeq) {
      return savedProfilesCache;
    }
    return publishSavedProfilesSnapshot(normalized);
  })()
    .catch((error) => {
      if (requestSeq === hydrateProfilesRequestSeq) {
        savedProfilesHydrated = false;
      }
      throw error;
    })
    .finally(() => {
      if (requestSeq === hydrateProfilesRequestSeq) {
        hydrateProfilesPromise = null;
      }
    });

  return hydrateProfilesPromise;
};

export const readSavedIndicatorProfilesVersionToken = (): string => savedProfilesVersionToken;

export const subscribeSavedIndicatorProfilesChange = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onCustomEvent = () => {
    listener();
  };

  window.addEventListener(CUSTOM_INDICATOR_STORAGE_CHANGE_EVENT, onCustomEvent as EventListener);
  return () => {
    window.removeEventListener(CUSTOM_INDICATOR_STORAGE_CHANGE_EVENT, onCustomEvent as EventListener);
  };
};


export const readSavedIndicatorProfiles = (): SavedIndicatorProfile[] => savedProfilesCache;

export const writeSavedIndicatorProfiles = async (
  profiles: SavedIndicatorProfile[]
): Promise<SavedIndicatorProfilesWriteResult> => {
  try {
    const persisted = await api.replaceCustomIndicatorProfiles(profiles.map((item) => toApiProfile(item)));
    const persistedProfiles = persisted.profiles
      .map((item) => mapApiProfile(item))
      .filter((item): item is SavedIndicatorProfile => Boolean(item));
    const finalProfiles = publishSavedProfilesSnapshot(persistedProfiles);
    savedProfilesHydrated = true;

    return {
      ok: true,
      storedCount: finalProfiles.length,
      bytes: estimateProfilesBytes(finalProfiles)
    };
  } catch (error) {
    console.error('[custom-indicator] profile list save failed', error);
    const failure = readProfileWriteFailure(error);
    return {
      ok: false,
      storedCount: 0,
      bytes: 0,
      ...failure,
    };
  }
};

export const saveSavedIndicatorProfile = async (
  draft: SavedIndicatorProfileDraft
): Promise<SavedIndicatorProfileSaveResult> => {
  try {
    const persisted = await api.saveCustomIndicatorProfile({
      id: normalizeText(draft.id) || undefined,
      name: draft.name,
      source: draft.source,
      parameterInputs: normalizeParameterInputs(draft.parameterInputs),
    });
    const persistedProfiles = persisted.profiles
      .map((item) => mapApiProfile(item))
      .filter((item): item is SavedIndicatorProfile => Boolean(item));
    const finalProfiles = publishSavedProfilesSnapshot(persistedProfiles);
    const profile = mapApiProfile(persisted.profile);
    savedProfilesHydrated = true;
    return {
      ok: true,
      storedCount: finalProfiles.length,
      bytes: estimateProfilesBytes(finalProfiles),
      profiles: finalProfiles,
      profile,
    };
  } catch (error) {
    console.error('[custom-indicator] profile save failed', error);
    const failure = readProfileWriteFailure(error);
    return {
      ok: false,
      storedCount: 0,
      bytes: 0,
      profiles: savedProfilesCache,
      profile: null,
      ...failure,
    };
  }
};

export const removeSavedIndicatorProfile = async (
  profileId: string
): Promise<SavedIndicatorProfilesWriteResult & { profiles: SavedIndicatorProfile[] }> => {
  try {
    const persisted = await api.deleteCustomIndicatorProfile(profileId);
    const persistedProfiles = persisted.profiles
      .map((item) => mapApiProfile(item))
      .filter((item): item is SavedIndicatorProfile => Boolean(item));
    const finalProfiles = publishSavedProfilesSnapshot(persistedProfiles);
    savedProfilesHydrated = true;
    return {
      ok: true,
      storedCount: finalProfiles.length,
      bytes: estimateProfilesBytes(finalProfiles),
      profiles: finalProfiles,
    };
  } catch (error) {
    console.error('[custom-indicator] profile deletion failed', error);
    const failure = readProfileWriteFailure(error);
    return {
      ok: false,
      storedCount: 0,
      bytes: 0,
      profiles: savedProfilesCache,
      ...failure,
    };
  }
};
