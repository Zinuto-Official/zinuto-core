// SPDX-License-Identifier: GPL-3.0-only

import type { BackendStartupStatus } from './startupStatus.js';

const RESET_JOB_STATUS_PATH_PATTERN =
  /^\/system\/reset-all-data\/jobs\/[^/]+$/u;

export const isResetRecoveryStartupBlock = (
  startupStatus: Pick<BackendStartupStatus, 'blockDetails'>,
): boolean =>
  startupStatus.blockDetails.issueReason === 'RESET_RECOVERY_BLOCKED';

export const isRequestAllowedWhileStartupBlocked = ({
  method,
  path,
  startupStatus,
}: {
  method: string;
  path: string;
  startupStatus: Pick<BackendStartupStatus, 'blockDetails'>;
}): boolean => {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  const normalizedPath = String(path || '').trim();
  if (
    normalizedPath === '/system/health' ||
    normalizedPath === '/system/startup-status'
  ) {
    return normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
  }
  if (normalizedPath === '/system/startup-local-data/reinitialize') {
    return (
      normalizedMethod === 'POST' &&
      !isResetRecoveryStartupBlock(startupStatus)
    );
  }
  return (
    normalizedMethod === 'GET' &&
    isResetRecoveryStartupBlock(startupStatus) &&
    RESET_JOB_STATUS_PATH_PATTERN.test(normalizedPath)
  );
};
