// SPDX-License-Identifier: GPL-3.0-only

import {
  startDataSourceRuntime as startDataSourceRuntimeCore,
  warmMissingSystemDataSourceDiagnosticsCaches,
} from './sharedDependencies.js';

export const startDataSourceRuntime = (): void => {
  startDataSourceRuntimeCore();
  warmMissingSystemDataSourceDiagnosticsCaches();
};

export {
  acquireSourceDiagnosticsQuiesceLease,
  stopDataSourceRuntime,
  stopSourceDiagnosticsRuntime,
  recoverInterruptedSourceSymbolMutations,
  invalidateLocalDataSourcesCache as invalidateLocalDataSourceAccessCache,
  ensureLocalDataSourceDiagnosticsCache,
  getLocalDataSourceDiagnostics,
  getLocalDataSourceSymbolDiagnostics,
  updateLocalDataSourceDiagnosticProfile,
  invalidateSourceDiagnosticsRuntimeCaches,
} from './sharedDependencies.js';
