// SPDX-License-Identifier: GPL-3.0-only

import { AsyncLocalStorage } from 'node:async_hooks';

const apiRequestAbortSignalStorage = new AsyncLocalStorage<AbortSignal>();

export const runWithApiRequestAbortSignal = <T>(
  signal: AbortSignal,
  callback: () => T,
): T => apiRequestAbortSignalStorage.run(signal, callback);

export const getApiRequestAbortSignal = (): AbortSignal | undefined =>
  apiRequestAbortSignalStorage.getStore();
