// SPDX-License-Identifier: GPL-3.0-only

import type { ResetAllDataOperationCheckpoint } from '../ports/infrastructure/db/trading/systemResetJournalStore.js';
import {
  getBackendStartupStatus,
  isBackendStartupBlocked,
  setBackendStartupStatus,
} from '../ports/runtime/startupStatus.js';
import { appError } from '../../kernel/appError.js';

export const blockBackendForResetRecovery = (
  operationId: string,
  checkpoint: ResetAllDataOperationCheckpoint,
  errorCode: string,
): void => {
  const currentStatus = getBackendStartupStatus();
  setBackendStartupStatus({
    ...currentStatus,
    mode: 'BLOCKED',
    checkedAt: new Date().toISOString(),
    startupAllowed: false,
    blockReason: 'LOCAL_DATA_NEEDS_ATTENTION',
    blockMessage: null,
    blockDetails: {
      ...currentStatus.blockDetails,
      issueReason: 'RESET_RECOVERY_BLOCKED',
      resetOperationId: operationId,
      resetCheckpoint: checkpoint,
      resetErrorCode: errorCode,
    },
    localDataIssueReason: null,
    localDataStatus: 'NEEDS_ATTENTION',
  });
};

export const ensureBackendStartupReady = (): void => {
  if (!isBackendStartupBlocked()) {
    return;
  }
  const startupStatus = getBackendStartupStatus();
  throw appError(
    'SYSTEM_STARTUP_BLOCKED',
    {
      reason: startupStatus.blockReason ?? 'STARTUP_PREFLIGHT_BLOCKED',
      issueReason: startupStatus.blockDetails.issueReason ?? null,
      resetOperationId: startupStatus.blockDetails.resetOperationId ?? null,
      resetCheckpoint: startupStatus.blockDetails.resetCheckpoint ?? null,
      resetErrorCode: startupStatus.blockDetails.resetErrorCode ?? null,
    },
    503,
  );
};
