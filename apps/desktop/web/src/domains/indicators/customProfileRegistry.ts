// SPDX-License-Identifier: GPL-3.0-only

import {
  parseSystemDefaultIndicatorOverrideTemplateId,
  readSavedIndicatorProfiles,
  readSavedIndicatorProfilesVersionToken
} from '@/domains/custom-indicator/indicator/profileStore';
import { api } from '@/api';
import type { CompiledIndicator } from '@/domains/custom-indicator/indicator/types';
import { resolveSavedIndicatorProfileDisplayName } from '@/domains/custom-indicator/indicator/profileDisplayName';

type CustomProfileIndicatorOption = {
  key: string;
  label: string;
};

type CustomProfileRuntimeSpec = {
  key: string;
  label: string;
  runtimeName: string;
  calcParams: number[];
  signature: string;
  compiled: CompiledIndicator;
};

type RegisterCompiledIndicatorRuntimeArgs = {
  runtimeName: string;
  shortName?: string;
  calcParams?: number[];
  precision?: number;
  compiled: CompiledIndicator;
};

type RegisterCompiledIndicatorRuntime = (args: RegisterCompiledIndicatorRuntimeArgs) => void;
type RuntimeRegistryStatus = 'idle' | 'syncing' | 'ready' | 'failed';

const CUSTOM_PROFILE_KEY_PREFIX = 'CUS:';
const CUSTOM_PROFILE_RUNTIME_NAME_PREFIX = 'ZINUTO_SCRIPT_';
const SYSTEM_OVERRIDE_RUNTIME_NAME_PREFIX = 'ZINUTO_SYS_';
const REGISTERED_RUNTIME_SIGNATURES = new Map<string, string>();
const CUSTOM_PROFILE_SPECS = new Map<string, CustomProfileRuntimeSpec>();
const SYSTEM_OVERRIDE_SPECS = new Map<string, CustomProfileRuntimeSpec>();
const CUSTOM_RUNTIME_SLOT_BY_KEY = new Map<string, number>();
const USED_CUSTOM_RUNTIME_SLOTS = new Set<number>();
let lastSyncedProfilesVersionToken = '';
let pendingProfilesVersionToken = '';
let latestRegisterCompiledIndicatorRuntime: RegisterCompiledIndicatorRuntime | null = null;
let runtimeSpecSyncSequence = 0;
let runtimeRegistryVersion = 0;
let runtimeRegistryStatus: RuntimeRegistryStatus = 'idle';
const RUNTIME_REGISTRY_LISTENERS = new Set<() => void>();

const normalizeKey = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const normalizeRuntimeNamePart = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeSystemOverrideTemplateKey = (rawTemplateId: string): string => {
  const normalized = normalizeKey(rawTemplateId);
  return normalized || '';
};

const publishRuntimeRegistryState = (status: RuntimeRegistryStatus) => {
  runtimeRegistryStatus = status;
  runtimeRegistryVersion += 1;
  RUNTIME_REGISTRY_LISTENERS.forEach((listener) => listener());
};

export const readCustomIndicatorRuntimeRegistryVersionToken = (): string =>
  [
    runtimeRegistryStatus,
    runtimeRegistryVersion,
    lastSyncedProfilesVersionToken || '__EMPTY__',
  ].join(':');

export const subscribeCustomIndicatorRuntimeRegistryChange = (
  listener: () => void,
): (() => void) => {
  RUNTIME_REGISTRY_LISTENERS.add(listener);
  return () => {
    RUNTIME_REGISTRY_LISTENERS.delete(listener);
  };
};

const buildRuntimeSpec = async (
  profile: ReturnType<typeof readSavedIndicatorProfiles>[number],
  key: string,
  runtimeName: string
): Promise<CustomProfileRuntimeSpec | null> => {
  const profileId = String(profile.id || '').trim();
  const source = String(profile.source || '').trim();
  if (!key || !profileId || !source) {
    return null;
  }
  const profileName = resolveSavedIndicatorProfileDisplayName({
    profileId,
    name: profile.name,
    source,
    overrideTemplateId: parseSystemDefaultIndicatorOverrideTemplateId(profileId)
  });

  const signature = JSON.stringify({
    source,
    parameterInputs: profile.parameterInputs ?? {},
    updatedAt: profile.updatedAt,
  });
  const runtimeNameSafe = String(runtimeName || '').trim();
  if (!runtimeNameSafe) {
    return null;
  }

  const compileResult = await api.compileCustomIndicatorScript({
    source,
    parameterInputs: profile.parameterInputs ?? {},
    displayName: profileName || normalizeKey(key) || runtimeNameSafe,
  });
  if (!compileResult.state) {
    return null;
  }

  return {
    key,
    label: profileName || normalizeKey(key) || runtimeNameSafe,
    runtimeName: runtimeNameSafe,
    calcParams: compileResult.state.calcParams,
    signature,
    compiled: compileResult.state.compiled
  };
};

const releaseInactiveCustomRuntimeSlots = (activeCustomKeys: Set<string>) => {
  Array.from(CUSTOM_RUNTIME_SLOT_BY_KEY.keys()).forEach((key) => {
    if (activeCustomKeys.has(key)) {
      return;
    }
    const slot = CUSTOM_RUNTIME_SLOT_BY_KEY.get(key);
    CUSTOM_RUNTIME_SLOT_BY_KEY.delete(key);
    if (typeof slot === 'number') {
      USED_CUSTOM_RUNTIME_SLOTS.delete(slot);
    }
  });
};

const allocateCustomRuntimeSlot = (): number => {
  const maxSlots = Math.max(1, readSavedIndicatorProfiles().length || 1);
  for (let slot = 1; slot <= maxSlots; slot += 1) {
    if (USED_CUSTOM_RUNTIME_SLOTS.has(slot)) {
      continue;
    }
    USED_CUSTOM_RUNTIME_SLOTS.add(slot);
    return slot;
  }
  // This branch should never happen because custom profiles are already clipped by the same storage limit.
  return maxSlots;
};

const resolveCustomRuntimeName = (customKey: string): string => {
  const normalizedKey = normalizeKey(customKey);
  if (!normalizedKey) {
    return '';
  }
  const existingSlot = CUSTOM_RUNTIME_SLOT_BY_KEY.get(normalizedKey);
  const slot = typeof existingSlot === 'number' ? existingSlot : allocateCustomRuntimeSlot();
  CUSTOM_RUNTIME_SLOT_BY_KEY.set(normalizedKey, slot);
  USED_CUSTOM_RUNTIME_SLOTS.add(slot);
  return `${CUSTOM_PROFILE_RUNTIME_NAME_PREFIX}${String(slot).padStart(3, '0')}`;
};

const resolveSystemOverrideRuntimeName = (templateKey: string): string => {
  const normalized = normalizeRuntimeNamePart(templateKey);
  if (!normalized) {
    return '';
  }
  return `${SYSTEM_OVERRIDE_RUNTIME_NAME_PREFIX}${normalized}`;
};

const registerRuntimeIndicator = (
  spec: CustomProfileRuntimeSpec,
  registerCompiledIndicatorRuntime: RegisterCompiledIndicatorRuntime,
) => {
  const registeredSignature = REGISTERED_RUNTIME_SIGNATURES.get(spec.runtimeName);
  if (registeredSignature === spec.signature) {
    return;
  }

  registerCompiledIndicatorRuntime({
    runtimeName: spec.runtimeName,
    shortName: spec.label,
    calcParams: spec.calcParams,
    precision: 3,
    compiled: spec.compiled,
  });

  REGISTERED_RUNTIME_SIGNATURES.set(spec.runtimeName, spec.signature);
};

const registerCurrentRuntimeIndicators = (
  registerCompiledIndicatorRuntime: RegisterCompiledIndicatorRuntime,
) => {
  CUSTOM_PROFILE_SPECS.forEach((spec) => {
    registerRuntimeIndicator(spec, registerCompiledIndicatorRuntime);
  });
  SYSTEM_OVERRIDE_SPECS.forEach((spec) => {
    registerRuntimeIndicator(spec, registerCompiledIndicatorRuntime);
  });
};

const collectFulfilledRuntimeSpecs = (
  results: Array<PromiseSettledResult<CustomProfileRuntimeSpec | null>>,
): CustomProfileRuntimeSpec[] =>
  results
    .filter(
      (result): result is PromiseFulfilledResult<CustomProfileRuntimeSpec> =>
        result.status === 'fulfilled' && result.value !== null,
    )
    .map((result) => result.value);

export const syncSavedCustomProfileIndicators = (
  registerCompiledIndicatorRuntime?: RegisterCompiledIndicatorRuntime,
) => {
  if (registerCompiledIndicatorRuntime) {
    latestRegisterCompiledIndicatorRuntime = registerCompiledIndicatorRuntime;
  }
  const rawVersionToken = readSavedIndicatorProfilesVersionToken();
  const versionToken = rawVersionToken || '__EMPTY__';
  if (versionToken === lastSyncedProfilesVersionToken) {
    if (registerCompiledIndicatorRuntime) {
      registerCurrentRuntimeIndicators(registerCompiledIndicatorRuntime);
      if (runtimeRegistryStatus !== 'ready') {
        publishRuntimeRegistryState('ready');
      }
    }
    return;
  }
  if (versionToken === pendingProfilesVersionToken) {
    return;
  }

  const allProfiles = readSavedIndicatorProfiles();
  const activeCustomKeys = new Set<string>();
  allProfiles.forEach((profile) => {
    if (parseSystemDefaultIndicatorOverrideTemplateId(profile.id)) {
      return;
    }
    const customKey = `${CUSTOM_PROFILE_KEY_PREFIX}${String(profile.id || '').trim()}`;
    if (!normalizeKey(customKey)) {
      return;
    }
    activeCustomKeys.add(normalizeKey(customKey));
  });
  releaseInactiveCustomRuntimeSlots(activeCustomKeys);
  const syncSequence = runtimeSpecSyncSequence + 1;
  runtimeSpecSyncSequence = syncSequence;
  pendingProfilesVersionToken = versionToken;
  publishRuntimeRegistryState('syncing');
  const customSpecPromises: Array<Promise<CustomProfileRuntimeSpec | null>> = [];
  const systemSpecPromises: Array<Promise<CustomProfileRuntimeSpec | null>> = [];

  allProfiles.forEach((profile) => {
    const overrideTemplateId = parseSystemDefaultIndicatorOverrideTemplateId(profile.id);
    if (!overrideTemplateId) {
      const customKey = `${CUSTOM_PROFILE_KEY_PREFIX}${String(profile.id || '').trim()}`;
      const runtimeName = resolveCustomRuntimeName(customKey);
      customSpecPromises.push(buildRuntimeSpec(profile, customKey, runtimeName));
      return;
    }

    const templateKey = normalizeSystemOverrideTemplateKey(overrideTemplateId);
    if (!templateKey) {
      return;
    }
    const runtimeName = resolveSystemOverrideRuntimeName(templateKey);
    systemSpecPromises.push(buildRuntimeSpec(profile, templateKey, runtimeName));
  });

  void Promise.all([
    Promise.allSettled(customSpecPromises),
    Promise.allSettled(systemSpecPromises),
  ]).then(([customSpecResults, systemOverrideSpecResults]) => {
    if (runtimeSpecSyncSequence !== syncSequence) {
      return;
    }
    pendingProfilesVersionToken = '';
    const hasRejectedSpecs =
      customSpecResults.some((result) => result.status === 'rejected') ||
      systemOverrideSpecResults.some((result) => result.status === 'rejected');
    if (hasRejectedSpecs) {
      publishRuntimeRegistryState('failed');
      return;
    }
    const nextCustomSpecs = collectFulfilledRuntimeSpecs(customSpecResults);
    const nextSystemOverrideSpecs = collectFulfilledRuntimeSpecs(systemOverrideSpecResults);
    CUSTOM_PROFILE_SPECS.clear();
    SYSTEM_OVERRIDE_SPECS.clear();
    nextCustomSpecs.filter((spec): spec is CustomProfileRuntimeSpec => Boolean(spec)).forEach((spec) => {
      CUSTOM_PROFILE_SPECS.set(spec.key, spec);
    });
    nextSystemOverrideSpecs.filter((spec): spec is CustomProfileRuntimeSpec => Boolean(spec)).forEach((spec) => {
      SYSTEM_OVERRIDE_SPECS.set(normalizeKey(spec.key), spec);
    });
    lastSyncedProfilesVersionToken = versionToken;
    if (latestRegisterCompiledIndicatorRuntime) {
      registerCurrentRuntimeIndicators(latestRegisterCompiledIndicatorRuntime);
    }
    publishRuntimeRegistryState('ready');
  }).catch(() => {
    if (runtimeSpecSyncSequence === syncSequence) {
      pendingProfilesVersionToken = '';
      publishRuntimeRegistryState('failed');
    }
  });
};

export const getCustomProfileIndicatorOptions = (): CustomProfileIndicatorOption[] => {
  return readSavedIndicatorProfiles()
    .filter((profile) => !parseSystemDefaultIndicatorOverrideTemplateId(profile.id))
    .map((profile) => ({
      key: `${CUSTOM_PROFILE_KEY_PREFIX}${String(profile.id || '').trim()}`,
      label: resolveSavedIndicatorProfileDisplayName({
        profileId: profile.id,
        name: profile.name,
        source: profile.source,
      }),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));
};

export const getCustomProfileIndicatorKeySet = (): Set<string> => {
  return new Set(
    readSavedIndicatorProfiles()
      .filter((profile) => !parseSystemDefaultIndicatorOverrideTemplateId(profile.id))
      .map((profile) => `${CUSTOM_PROFILE_KEY_PREFIX}${String(profile.id || '').trim()}`)
      .filter((key) => Boolean(normalizeKey(key))),
  );
};

export const resolveIndicatorRuntimeSpec = (
  indicatorName: string,
  calcParams: number[]
): { runtimeName: string; calcParams: number[] } => {
  syncSavedCustomProfileIndicators();
  const customSpec = CUSTOM_PROFILE_SPECS.get(indicatorName);
  if (customSpec) {
    const nextCalcParams = calcParams.length ? calcParams : customSpec.calcParams;
    return {
      runtimeName: customSpec.runtimeName,
      calcParams: nextCalcParams
    };
  }

  const normalizedIndicatorName = normalizeKey(indicatorName);
  const systemOverrideSpec = SYSTEM_OVERRIDE_SPECS.get(normalizedIndicatorName);
  if (systemOverrideSpec) {
    const nextCalcParams = calcParams.length ? calcParams : systemOverrideSpec.calcParams;
    return {
      runtimeName: systemOverrideSpec.runtimeName,
      calcParams: nextCalcParams
    };
  }

  return {
    runtimeName: indicatorName,
    calcParams
  };
};
