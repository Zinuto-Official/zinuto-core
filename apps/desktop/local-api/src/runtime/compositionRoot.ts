// SPDX-License-Identifier: GPL-3.0-only

import type { ClockPort, IdGeneratorPort } from '../application/ports/index.js';
import { initializeApplicationContextPort } from '../application/ports/runtime/compositionRoot.js';
import { createId } from '../kernel/id.js';
import { nowIso } from '../kernel/time.js';

type BackendAppPorts = {
  clock: ClockPort;
  idGenerator: IdGeneratorPort;
};

export type BackendAppContext = {
  ports: BackendAppPorts;
};

let backendAppContext: BackendAppContext | null = null;

const createBackendAppContext = (): BackendAppContext => {
  return {
    ports: {
      clock: {
        now: () => new Date(),
        nowIso,
      },
      idGenerator: {
        createId,
      },
    },
  };
};

export const initializeBackendAppContext = (): BackendAppContext => {
  if (backendAppContext) {
    return backendAppContext;
  }
  backendAppContext = createBackendAppContext();
  return backendAppContext;
};

export const resolveBackendAppContext = (): BackendAppContext =>
  backendAppContext ?? initializeBackendAppContext();

initializeApplicationContextPort({
  resolveBackendAppContext,
});
