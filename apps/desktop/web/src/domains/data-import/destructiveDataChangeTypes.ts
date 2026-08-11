// SPDX-License-Identifier: GPL-3.0-only

export type DestructiveDataChangeFinalizerOptions = {
  clearRemovedSymbols?: boolean;
  refreshDataSources?: boolean;
  refreshHistory?: boolean;
  resetAutoplay?: boolean;
  resetBusy?: boolean;
};

export type DestructiveDataChangeFinalizerResult = {
  failed: boolean;
};

export type DestructiveDataChangeFinalizer = (
  options?: DestructiveDataChangeFinalizerOptions,
) => Promise<DestructiveDataChangeFinalizerResult>;
