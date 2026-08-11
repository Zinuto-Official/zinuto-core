// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../../kernel/appError.js';

type GenericPortFunction = (...args: any[]) => any;
type ApplicationContextPort = {
  resolveBackendAppContext: GenericPortFunction;
};

const MODULE_ID = 'runtime/compositionRoot';

const missingPort = (exportName?: string): never => {
  throw appError('APP_PORT_NOT_REGISTERED', {
    moduleId: MODULE_ID,
    exportName: exportName ?? null,
  }, 500);
};

export const initializeApplicationContextPort = (
  port: ApplicationContextPort,
): void => {
  if (typeof port.resolveBackendAppContext !== 'function') {
    missingPort('resolveBackendAppContext');
  }
  resolveBackendAppContext = port.resolveBackendAppContext;
};

export let resolveBackendAppContext: GenericPortFunction = () => missingPort('resolveBackendAppContext');
