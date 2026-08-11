// SPDX-License-Identifier: GPL-3.0-only

const GENERATED_PROFILE_NAME_PATTERN = /^profile_\d+_[a-z0-9]{4,}$/i;
const SYSTEM_OVERRIDE_PROFILE_ID_PREFIX = 'sys_override:';
const OUTPUT_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:(?!=)/m;
const DEFAULT_PROFILE_FALLBACK_NAME = 'CUSTOM';

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const normalizeKey = (value: string): string => value.trim().toUpperCase();

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

const deriveNameFromSource = (source: unknown): string => {
  const normalizedSource = normalizeText(source);
  if (!normalizedSource) {
    return '';
  }
  const matched = normalizedSource.match(OUTPUT_ASSIGNMENT_PATTERN);
  if (!matched) {
    return '';
  }
  return normalizeKey(matched[1] ?? '');
};

export const parseSystemDefaultIndicatorOverrideTemplateIdByProfileId = (profileId: unknown): string | null => {
  const normalizedId = normalizeText(profileId);
  if (!normalizedId || !normalizedId.startsWith(SYSTEM_OVERRIDE_PROFILE_ID_PREFIX)) {
    return null;
  }
  const templateId = normalizeKey(normalizedId.slice(SYSTEM_OVERRIDE_PROFILE_ID_PREFIX.length));
  return templateId || null;
};

export const resolveSavedIndicatorProfileDisplayName = (options: {
  profileId?: unknown;
  name?: unknown;
  source?: unknown;
  overrideTemplateId?: unknown;
  fallbackName?: unknown;
}): string => {
  const profileId = normalizeText(options.profileId);
  const resolvedName = normalizeText(options.name);
  const overrideTemplateId = normalizeKey(normalizeText(options.overrideTemplateId));
  const fallbackName = normalizeText(options.fallbackName);
  const hasMachineLikeName = looksLikeMachineProfileName(resolvedName, profileId);
  const resolvedOverrideTemplateId =
    overrideTemplateId || parseSystemDefaultIndicatorOverrideTemplateIdByProfileId(profileId);

  if (resolvedOverrideTemplateId) {
    return resolvedOverrideTemplateId;
  }

  if (resolvedName && !hasMachineLikeName) {
    return resolvedName;
  }

  const derivedBySource = deriveNameFromSource(options.source);
  if (derivedBySource) {
    return derivedBySource;
  }

  if (fallbackName) {
    return fallbackName;
  }

  if (resolvedName) {
    return resolvedName;
  }

  return DEFAULT_PROFILE_FALLBACK_NAME;
};
