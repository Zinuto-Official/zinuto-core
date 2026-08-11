// SPDX-License-Identifier: GPL-3.0-only

const normalizeEnvValue = (value: unknown): string => {
  const normalized = String(value ?? '').trim();
  return normalized || 'unknown';
};

export type BackendRuntimeIntegrityStatus =
  | 'MANIFEST_DIGESTED'
  | 'UNVERIFIED'
  | 'FAILED';

const normalizeSha256Digest = (value: unknown): string => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : 'unknown';
};

const resolveRuntimeIntegrityStatus = (
  runtimeManifestDigest: string,
): BackendRuntimeIntegrityStatus =>
  runtimeManifestDigest === 'unknown' ? 'UNVERIFIED' : 'MANIFEST_DIGESTED';

export const backendRuntimeBuildId = normalizeEnvValue(process.env.ZINUTO_BACKEND_BUILD_ID);
export const backendRuntimePid = process.pid;
export const desktopAppVersion = normalizeEnvValue(process.env.ZINUTO_DESKTOP_APP_VERSION);
export const backendNodeRuntimeVersion = normalizeEnvValue(process.version);
export const backendRuntimeManifestDigest = normalizeSha256Digest(
  process.env.ZINUTO_BACKEND_RUNTIME_MANIFEST_DIGEST,
);
export const backendRuntimeIntegrityStatus = resolveRuntimeIntegrityStatus(
  backendRuntimeManifestDigest,
);
