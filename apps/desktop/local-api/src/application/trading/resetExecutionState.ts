// SPDX-License-Identifier: GPL-3.0-only

let systemResetExecutionActive = false;
let systemResetRecoveryWriteBarrierActive = false;

export const tryAcquireSystemResetExecution = (): boolean => {
  if (systemResetExecutionActive || systemResetRecoveryWriteBarrierActive) {
    return false;
  }
  systemResetExecutionActive = true;
  return true;
};

export const tryAcquireSystemResetRecoveryExecution = (): boolean => {
  if (systemResetExecutionActive) {
    return false;
  }
  systemResetExecutionActive = true;
  return true;
};

export const releaseSystemResetExecution = (): void => {
  systemResetExecutionActive = false;
};

export const activateSystemResetRecoveryWriteBarrier = (): void => {
  systemResetRecoveryWriteBarrierActive = true;
};

export const clearSystemResetRecoveryWriteBarrier = (): void => {
  systemResetRecoveryWriteBarrierActive = false;
};

export const isSystemResetRecoveryWriteBarrierActive = (): boolean =>
  systemResetRecoveryWriteBarrierActive;

export const isSystemResetExecutionActive = (): boolean =>
  systemResetExecutionActive || systemResetRecoveryWriteBarrierActive;
