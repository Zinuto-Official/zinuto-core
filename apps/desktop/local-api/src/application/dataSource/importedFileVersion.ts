// SPDX-License-Identifier: GPL-3.0-only

export type ImportedFileContentVersion =
  | 'UNCHANGED'
  | 'CHANGED'
  | 'FINGERPRINT_REQUIRED';

const SHA256_DIGEST_REGEX = /^[0-9a-f]{64}$/i;

export const extractImportFileFingerprintDigest = (
  fingerprintRaw: unknown,
): string => {
  const normalized = String(fingerprintRaw || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  if (SHA256_DIGEST_REGEX.test(normalized)) {
    return normalized;
  }
  const segments = normalized.split(':');
  const maybeDigest = String(segments[segments.length - 1] || '')
    .trim()
    .toLowerCase();
  return SHA256_DIGEST_REGEX.test(maybeDigest) ? maybeDigest : '';
};

const normalizeFileSize = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

export const classifyImportedFileContentVersion = ({
  incomingSize,
  incomingFingerprint,
  existingSize,
  existingFingerprint,
}: {
  incomingSize: unknown;
  incomingFingerprint: unknown;
  existingSize: unknown;
  existingFingerprint: unknown;
}): ImportedFileContentVersion => {
  if (normalizeFileSize(incomingSize) !== normalizeFileSize(existingSize)) {
    return 'CHANGED';
  }
  const incomingDigest =
    extractImportFileFingerprintDigest(incomingFingerprint);
  if (!incomingDigest) {
    return 'FINGERPRINT_REQUIRED';
  }
  const existingDigest =
    extractImportFileFingerprintDigest(existingFingerprint);
  return existingDigest && existingDigest === incomingDigest
    ? 'UNCHANGED'
    : 'CHANGED';
};
