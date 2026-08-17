// SPDX-License-Identifier: GPL-3.0-only

import express from 'express';
import { randomUUID } from 'node:crypto';
import fsSync from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { ZodError } from 'zod';
import { DESKTOP_LOCAL_API_BASE_PATH } from '@zinuto/shared/contracts-desktop/http-api';
import { desktopStartupLocalDataReinitializeRequestSchema } from '@zinuto/shared/contracts-desktop/api';
import {
  DB_DATA_DIR,
  DB_FILE_PATH,
  BACKEND_STARTUP_PROGRESS,
  STARTUP_PREFLIGHT_STATUS,
  STORAGE_LAYOUT,
  closeLocalDatabase,
  initDatabase,
} from '../infrastructure/db/database.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import { ok } from '../http/response.js';
import { isAppError } from '../kernel/appError.js';
import { runWithApiRequestAbortSignal } from './apiRequestAbortSignal.js';
import { resolveBackendTransportConfig } from './backendTransport.js';
import { resolveDesktopReleaseChannel, type DesktopReleaseChannel } from './releaseChannel.js';
import {
  getBackendStartupStatus,
  isBackendStartupBlocked,
  setBackendStartupStatus,
} from './startupStatus.js';
import { reinitializeStartupLocalData } from '../infrastructure/db/database/startupReinitialize.js';
import { createApiInteractionActivityTracker } from './apiInteractionActivity.js';
import { isRequestAllowedWhileStartupBlocked } from './startupBlockedRequestPolicy.js';

const app = express();
const apiInteractionActivity = createApiInteractionActivityTracker({
  quietWindowMs: runtimeLimits.idleMaintenanceApiQuietWindowMs,
});
const backendTransport = resolveBackendTransportConfig();
const releaseChannel = resolveDesktopReleaseChannel();
const runtimeBuildId = typeof process.env.ZINUTO_BACKEND_BUILD_ID === 'string' ? process.env.ZINUTO_BACKEND_BUILD_ID.trim() || 'unknown' : 'unknown';
const runtimeStatePathRaw =
  typeof process.env.ZINUTO_BACKEND_RUNTIME_STATE_PATH === 'string' ? process.env.ZINUTO_BACKEND_RUNTIME_STATE_PATH.trim() : '';
const runtimeStatePath = runtimeStatePathRaw ? path.resolve(runtimeStatePathRaw) : '';
const parentPidRaw = typeof process.env.ZINUTO_BACKEND_PARENT_PID === 'string' ? process.env.ZINUTO_BACKEND_PARENT_PID.trim() : '';
const parsedParentPid = Number.parseInt(parentPidRaw, 10);
const backendParentPid = Number.isInteger(parsedParentPid) && parsedParentPid > 1 ? parsedParentPid : 0;
const backendBridgeSecretRaw =
  typeof process.env.ZINUTO_BACKEND_BRIDGE_SECRET === 'string'
    ? process.env.ZINUTO_BACKEND_BRIDGE_SECRET.trim()
    : '';
const backendBridgeSecret = backendBridgeSecretRaw;
delete process.env.ZINUTO_BACKEND_BRIDGE_SECRET;
const backendBridgeHeaderName = 'x-zinuto-bridge-token';

type LocalApiErrorStage =
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'STARTUP'
  | 'IMPORT'
  | 'ACQUISITION'
  | 'SYNC_CHECK'
  | 'SYSTEM';

type BackendRuntimeStateRecord = {
  pid: number;
  parentPid: number | null;
  runtimeBuildId: string;
  releaseChannel: DesktopReleaseChannel;
  transportType: 'unix' | 'tcp';
  socketPath: string | null;
  host: string | null;
  port: number | null;
  startedAtMs: number;
};

const createLocalApiRequestId = (req: express.Request): string => {
  const incomingRequestId = String(req.header('x-request-id') ?? '').trim();
  return incomingRequestId || `local-${randomUUID()}`;
};

const toSafeErrorDetail = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toSafeErrorDetail);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toSafeErrorDetail(entry),
      ]),
    );
  }
  return String(value ?? '');
};

const sanitizeErrorDetails = (
  details: Record<string, unknown> = {},
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, toSafeErrorDetail(value)]),
  );

const buildErrorEnvelope = ({
  req,
  errorCode,
  errorStage,
  causeCode,
  details,
}: {
  req: express.Request;
  errorCode: string;
  errorStage: LocalApiErrorStage;
  causeCode?: string;
  details?: Record<string, unknown>;
}) => ({
  ok: false as const,
  requestId: createLocalApiRequestId(req),
  errorCode,
  errorStage,
  cause: {
    code: String(causeCode || errorCode).trim() || errorCode,
    stage: errorStage,
  },
  details: sanitizeErrorDetails({
    path: req.originalUrl || req.url,
    ...(details ?? {}),
  }),
});

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code === 'EPERM';
  }
};

if (backendParentPid > 1 && !isProcessAlive(backendParentPid)) {
  // eslint-disable-next-line no-console
  console.error('[zinuto-backend] parent process missing before startup', { parentPid: backendParentPid });
  process.exit(1);
}

if (!backendBridgeSecret) {
  // eslint-disable-next-line no-console
  console.error('[zinuto-backend] bridge secret missing');
  process.exit(1);
}

if (
  backendTransport.type === 'unix' &&
  backendTransport.socketPathLengthBytes > backendTransport.socketPathMaxBytes
) {
  // eslint-disable-next-line no-console
  console.error('[zinuto-backend] unix socket path exceeds platform limit', {
    socketPath: backendTransport.socketPath,
    socketPathLengthBytes: backendTransport.socketPathLengthBytes,
    unixSocketPathMaxBytes: backendTransport.socketPathMaxBytes
  });
  process.exit(1);
}

let systemIdleMaintenance: null | {
  stop: () => Promise<void>;
  interruptForApiInteraction: () => Promise<void>;
} = null;
let dataSourceRuntime: null | { stop: () => Promise<void> } = null;
let systemDevSimulationRuntime: null | { stop: () => Promise<void> } = null;
let resetAllDataRuntime: null | {
  waitForIdle: () => Promise<void>;
} = null;
let backtestRuntime: null | { stop: () => Promise<void> } = null;
let specialTrainingRuntime: null | { stop: () => void } = null;
let historyRetentionRuntime: null | { stop: () => Promise<void> } = null;
let marketRuntime: null | {
  close: () => Promise<void>;
  stopBackgroundWork: () => Promise<void>;
} = null;
let apiRouter: express.Router | null = null;
const desktopApiBasePath = DESKTOP_LOCAL_API_BASE_PATH;
const BACKTEST_RECOVERY_RETRY_DELAY_MS = 250;

const waitForBacktestRecoveryRetry = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, BACKTEST_RECOVERY_RETRY_DELAY_MS);
  });

if (!STARTUP_PREFLIGHT_STATUS.startupAllowed) {
  // eslint-disable-next-line no-console
  console.warn('[zinuto-backend] startup preflight blocked', {
    mode: STARTUP_PREFLIGHT_STATUS.mode,
    blockReason: STARTUP_PREFLIGHT_STATUS.blockReason,
    blockMessage: STARTUP_PREFLIGHT_STATUS.blockMessage,
    blockDetails: STARTUP_PREFLIGHT_STATUS.blockDetails,
  });
}

if (STARTUP_PREFLIGHT_STATUS.startupAllowed) {
  BACKEND_STARTUP_PROGRESS.update('SEED_RECONCILE');
  await initDatabase();
  const { initializeBackendAppContext } = await import('./compositionRoot.js');
  initializeBackendAppContext();
  const [
    dataSourceRuntimeModule,
    acquisitionRuntimeModule,
    { startSystemIdleMaintenance },
    apiRoutesModule,
    specialTrainingModule,
    marketDatabaseModule,
    systemDevSimulationModule,
    resetServiceModule,
    backtestRuntimeModule,
    historyRetentionMaintenanceModule,
    portableDataRuntimeModule,
  ] = await Promise.all([
    import('../application/dataSourceService.js'),
    import('../application/market-data-acquisition/marketDataAcquisitionHandler.js'),
    import('../application/systemIdleMaintenanceService.js'),
    import('../http/api.js'),
    import('../application/specialTrainingService.js'),
    import('../infrastructure/db/marketDatabase.js'),
    import('../application/systemDevSimulationService.js'),
    import('../application/trading/resetService.js'),
    import('../application/backtest/backtestService.js'),
    import('./historyRetentionMaintenanceWorkerClient.js'),
    import('../application/portableDataService.js'),
  ]);
  resetAllDataRuntime = {
    waitForIdle: resetServiceModule.waitForResetAllStoredDataRuntimeIdle,
  };
  marketRuntime = {
    close: marketDatabaseModule.closeMarketDatabase,
    stopBackgroundWork: marketDatabaseModule.stopMarketPrewarmRuntime,
  };
  historyRetentionRuntime = {
    stop: historyRetentionMaintenanceModule.stopHistoryRetentionMaintenanceWorker,
  };
  const portableImportRecovery = await portableDataRuntimeModule
    .recoverPortableImportsAtStartup()
    .catch(() => ({
      scanned: 0,
      recovered: 0,
      committedJournalsCleared: 0,
      failed: 1,
    }));
  if (
    portableImportRecovery.recovered > 0 ||
    portableImportRecovery.committedJournalsCleared > 0 ||
    portableImportRecovery.failed > 0
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[zinuto-backend] portable import recovery startup result',
      portableImportRecovery,
    );
  }
  BACKEND_STARTUP_PROGRESS.update('RESET_RECOVERY');
  const resetRecovery = await resetServiceModule
    .recoverInterruptedResetAllStoredData()
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[zinuto-backend] reset recovery failed before API startup', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      return {
        status: 'BLOCKED' as const,
        operationId: null,
        checkpoint: null,
        errorCode: 'RESET_ALL_DATA_RECOVERY_FAILED',
      };
    });
  if (resetRecovery.status !== 'NONE') {
    // eslint-disable-next-line no-console
    console.warn('[zinuto-backend] reset recovery startup result', {
      status: resetRecovery.status,
      operationId: resetRecovery.operationId,
      checkpoint: resetRecovery.checkpoint,
      errorCode: resetRecovery.errorCode,
    });
  }
  if (resetRecovery.status === 'BLOCKED') {
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
        resetOperationId: resetRecovery.operationId ?? '',
        resetCheckpoint: resetRecovery.checkpoint ?? '',
        resetErrorCode: resetRecovery.errorCode ?? 'RESET_ALL_DATA_RECOVERY_FAILED',
      },
      localDataIssueReason: null,
      localDataStatus: 'NEEDS_ATTENTION',
    });
  }
  BACKEND_STARTUP_PROGRESS.update('SEED_RECONCILE');
  if (!isBackendStartupBlocked()) {
    const recoverBacktestBatchesOnce = async (): Promise<boolean> => {
      try {
        backtestRuntimeModule.recoverInterruptedBacktestBatches();
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          '[zinuto-backend] interrupted backtest batch recovery failed',
          { errorType: error instanceof Error ? error.name : typeof error },
        );
        return false;
      }
    };
    // A failed recovery can be caused by a transient SQLite/native-module
    // boundary. Give the first attempt time to release its handles before the
    // bounded retry, while keeping startup deterministic and finite.
    if (!(await recoverBacktestBatchesOnce())) {
      await waitForBacktestRecoveryRetry();
      if (!(await recoverBacktestBatchesOnce())) {
        // eslint-disable-next-line no-console
        console.error(
          '[zinuto-backend] interrupted backtest batch recovery failed after retry',
          { retryDelayMs: BACKTEST_RECOVERY_RETRY_DELAY_MS },
        );
      }
    }
    backtestRuntime = { stop: backtestRuntimeModule.stopBacktestRuntime };
    specialTrainingModule.ensureDefaultSpecialTrainingQuestionBankSeed();
    // A retained portable journal still owns its source mutation locks.
    if (portableImportRecovery.failed === 0) {
      dataSourceRuntimeModule.recoverInterruptedSourceSymbolMutations();
    }
    await acquisitionRuntimeModule.startMarketDataAcquisitionRuntime();
    dataSourceRuntimeModule.startDataSourceRuntime();
    dataSourceRuntime = {
      stop: async () => {
        await acquisitionRuntimeModule.stopMarketDataAcquisitionRuntime();
        await dataSourceRuntimeModule.stopSourceDiagnosticsRuntime();
        await dataSourceRuntimeModule.stopLocalDataImportPreviewJobs();
        await dataSourceRuntimeModule.stopLocalDataImportJobQueue();
        await dataSourceRuntimeModule.stopDataSourceRuntime();
      },
    };
    systemIdleMaintenance = startSystemIdleMaintenance({
      isApiInteractionIdle: apiInteractionActivity.isIdle,
      isBacktestRuntimeIdle: backtestRuntimeModule.isBacktestRuntimeIdle,
      runAutomaticHistoryRetention:
        historyRetentionMaintenanceModule.runAutomaticHistoryRetentionInWorker,
    });
    specialTrainingRuntime = {
      stop: specialTrainingModule.stopSpecialTrainingChallengeRuntime,
    };
    systemDevSimulationRuntime = {
      stop: async () => {
        await systemDevSimulationModule.stopSystemDevSimulationJobRuntime();
        await systemDevSimulationModule.waitForSystemDevSimulationCleanupRuntimeIdle();
      },
    };
    apiRouter = apiRoutesModule.apiRouter;
    // Pre-warm DuckDB instance and connection pool in the background.
    // This avoids cold-start latency on the first market data query.
    marketDatabaseModule.scheduleMarketDatabaseWarmUp();
  }
  BACKEND_STARTUP_PROGRESS.update('RUNTIME_BOOTSTRAP');
}

app.use(desktopApiBasePath, (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  const completeApiInteraction = apiInteractionActivity.beginRequest();
  res.once('finish', completeApiInteraction);
  res.once('close', completeApiInteraction);
  const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(_req.method.toUpperCase());
  res.once('finish', () => {
    if (res.statusCode >= 400) {
      return;
    }
    void import('../application/systemStorageService.js')
      .then(({ invalidateWorkspaceSystemStorageUsage }) => {
        invalidateWorkspaceSystemStorageUsage();
      })
      .catch(() => undefined);
  });
  // Only write-type requests interrupt running idle maintenance. Read-only
  // requests must not abort an in-flight retention sweep or reset its
  // busy-retry window, otherwise sustained polling starves maintenance.
  if (!isWriteRequest || !systemIdleMaintenance) {
    next();
    return;
  }
  const interruptMaintenance = systemIdleMaintenance.interruptForApiInteraction();
  void interruptMaintenance.catch(() => undefined).finally(next);
});

app.use(express.json({ limit: runtimeLimits.apiJsonBodyLimitBytes }));

app.use(desktopApiBasePath, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const abortController = new AbortController();
  let responseFinished = false;

  function cleanup(): void {
    req.off('aborted', abortRequest);
    res.off('close', abortRequest);
    res.off('finish', finishRequest);
  }

  function abortRequest(): void {
    if (!responseFinished && !abortController.signal.aborted) {
      abortController.abort();
    }
    cleanup();
  }

  function finishRequest(): void {
    responseFinished = true;
    cleanup();
  }

  req.on('aborted', abortRequest);
  res.on('close', abortRequest);
  res.on('finish', finishRequest);

  runWithApiRequestAbortSignal(abortController.signal, next);
});

app.use(desktopApiBasePath, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestTokenRaw = req.header(backendBridgeHeaderName);
  const requestToken = typeof requestTokenRaw === 'string' ? requestTokenRaw.trim() : '';
  if (!requestToken || requestToken !== backendBridgeSecret) {
    res.status(401).json(buildErrorEnvelope({
      req,
      errorCode: 'BACKEND_BRIDGE_UNAUTHORIZED',
      errorStage: 'AUTHORIZATION',
      causeCode: requestToken ? 'BRIDGE_TOKEN_MISMATCH' : 'BRIDGE_TOKEN_MISSING',
      details: {
        reason: requestToken ? 'BRIDGE_TOKEN_MISMATCH' : 'BRIDGE_TOKEN_MISSING',
      },
    }));
    return;
  }
  next();
});

app.get(`${desktopApiBasePath}/system/health`, (_req, res) => {
  const startupStatus = getBackendStartupStatus();
  res.json(
    ok({
      status: 'UP',
      runtimeBuildId,
      pid: process.pid,
      securityIntegrity: startupStatus.securityIntegrity,
      startupStatus,
    }),
  );
});

app.get(`${desktopApiBasePath}/system/startup-status`, (_req, res) => {
  res.json(ok(getBackendStartupStatus()));
});

app.use(desktopApiBasePath, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!isBackendStartupBlocked()) {
    next();
    return;
  }
  const startupStatus = getBackendStartupStatus();
  if (isRequestAllowedWhileStartupBlocked({
    method: req.method,
    path: req.path,
    startupStatus,
  })) {
    next();
    return;
  }
  res.status(503).json(buildErrorEnvelope({
    req,
    errorCode: 'SYSTEM_STARTUP_BLOCKED',
    errorStage: 'STARTUP',
    causeCode: startupStatus.blockReason || 'STARTUP_PREFLIGHT_BLOCKED',
    details: {
      reason: startupStatus.blockReason,
      issueReason: startupStatus.blockDetails.issueReason ?? null,
    },
  }));
});

app.post(`${desktopApiBasePath}/system/startup-local-data/reinitialize`, (req, res) => {
  const payload = desktopStartupLocalDataReinitializeRequestSchema.parse(req.body ?? {});
  const result = reinitializeStartupLocalData({
    request: payload,
    startupStatus: getBackendStartupStatus(),
    storageLayout: STORAGE_LAYOUT,
  });
  res.once('finish', () => {
    setTimeout(() => {
      shutdownBackend(0);
    }, 100).unref();
  });
  res.json(ok(result));
});

if (apiRouter) {
  app.use(desktopApiBasePath, apiRouter);
}

const formatUnknownErrorForLog = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return util.inspect(error, {
    depth: 6,
    maxArrayLength: 50,
    maxStringLength: 2000,
    breakLength: 120
  });
};

const logUnhandledApiError = (error: unknown, req: express.Request): void => {
  const payload = {
    time: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.url,
    errorType: error instanceof Error ? error.name : typeof error
  };
  // eslint-disable-next-line no-console
  console.error('[zinuto-backend] unhandled API error', payload);
  // eslint-disable-next-line no-console
  console.error(formatUnknownErrorForLog(error));
};

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    // eslint-disable-next-line no-console
    console.error(`[zinuto-backend] ${req.method} ${req.originalUrl || req.url} → 400 INVALID_PARAMS`, {
      fieldPath: firstIssue?.path?.join('.'),
      issueMessage: firstIssue?.message,
      issueCount: error.issues.length,
    });
    res.status(400).json(buildErrorEnvelope({
      req,
      errorCode: 'INVALID_PARAMS',
      errorStage: 'VALIDATION',
      causeCode: firstIssue?.code ? `ZOD_${String(firstIssue.code).toUpperCase()}` : 'REQUEST_SCHEMA_INVALID',
      details: {
        reason: 'REQUEST_SCHEMA_INVALID',
        issueCount: error.issues.length,
        fieldPath: firstIssue?.path?.join('.') ?? '',
        issueMessage: firstIssue?.message ?? '',
        issues: error.issues.slice(0, 5).map((issue) => ({
          code: issue.code,
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }));
    return;
  }

  if (isAppError(error)) {
    const isCanceledRequest =
      error.code === 'BACKEND_HTTP_REQUEST_CANCELED' &&
      error.args?.reason === 'ABORTED';
    if (!isCanceledRequest) {
      // eslint-disable-next-line no-console
      console.error(`[zinuto-backend] ${req.method} ${req.originalUrl || req.url} → ${error.status} ${error.code}`, {
        stage: error.stage,
        reason: error.args?.reason,
      });
    }
    res.status(error.status).json(buildErrorEnvelope({
      req,
      errorCode: error.code,
      errorStage: error.stage,
      causeCode:
        typeof error.args?.reason === 'string' && error.args.reason.trim()
          ? error.args.reason
          : error.code,
      details: error.args,
    }));
    return;
  }

  logUnhandledApiError(error, req);
  res.status(500).json(buildErrorEnvelope({
    req,
    errorCode: 'INTERNAL_SERVER_ERROR',
    errorStage: 'SYSTEM',
    causeCode: error instanceof Error ? error.name : typeof error,
    details: {
      reason: 'UNHANDLED_EXCEPTION',
      errorType: error instanceof Error ? error.name : typeof error,
    },
  }));
});

const cleanupUnixSocket = (): void => {
  if (backendTransport.type !== 'unix') {
    return;
  }
  try {
    if (fsSync.existsSync(backendTransport.socketPath)) {
      fsSync.unlinkSync(backendTransport.socketPath);
    }
  } catch {
    // ignore cleanup failures
  }
};

const createRuntimeStateRecord = (): BackendRuntimeStateRecord => ({
  pid: process.pid,
  parentPid: backendParentPid > 1 ? backendParentPid : null,
  runtimeBuildId,
  releaseChannel,
  transportType: backendTransport.type,
  socketPath: backendTransport.type === 'unix' ? backendTransport.socketPath : null,
  host: backendTransport.type === 'tcp' ? backendTransport.host : null,
  port: backendTransport.type === 'tcp' ? backendTransport.port : null,
  startedAtMs: Date.now()
});

const cleanupRuntimeStateFile = (): void => {
  if (!runtimeStatePath) {
    return;
  }
  try {
    if (!fsSync.existsSync(runtimeStatePath)) {
      return;
    }
    const raw = fsSync.readFileSync(runtimeStatePath, 'utf8').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<BackendRuntimeStateRecord>;
        if (Number(parsed.pid) !== process.pid) {
          return;
        }
      } catch {
        // best effort cleanup for malformed stale state files
      }
    }
    fsSync.unlinkSync(runtimeStatePath);
  } catch {
    // ignore cleanup failures
  }
};

const writeRuntimeStateFile = (): boolean => {
  if (!runtimeStatePath) {
    return true;
  }
  const tempPath = `${runtimeStatePath}.${process.pid}.tmp`;
  try {
    fsSync.mkdirSync(path.dirname(runtimeStatePath), { recursive: true });
    fsSync.writeFileSync(tempPath, JSON.stringify(createRuntimeStateRecord()), 'utf8');
    fsSync.renameSync(tempPath, runtimeStatePath);
    return true;
  } catch (error) {
    try {
      if (fsSync.existsSync(tempPath)) {
        fsSync.unlinkSync(tempPath);
      }
    } catch {
      // ignore best-effort temp cleanup failures
    }
    // eslint-disable-next-line no-console
    console.error('[zinuto-backend] failed to write runtime state file');
    // eslint-disable-next-line no-console
    console.error(formatUnknownErrorForLog(error));
    return false;
  }
};

let parentWatchTimer: NodeJS.Timeout | null = null;
let shutdownStarted = false;
let runtimeServicesStopPromise: Promise<void> | null = null;
let server: ReturnType<typeof app.listen>;

const stopParentWatchdog = (): void => {
  if (!parentWatchTimer) {
    return;
  }
  clearInterval(parentWatchTimer);
  parentWatchTimer = null;
};

const stopRuntimeServicesSync = (): void => {
  stopParentWatchdog();
  void marketRuntime?.stopBackgroundWork();
  void historyRetentionRuntime?.stop();
  historyRetentionRuntime = null;
  void dataSourceRuntime?.stop();
  dataSourceRuntime = null;
  specialTrainingRuntime?.stop();
  specialTrainingRuntime = null;
  void systemDevSimulationRuntime?.stop();
  systemDevSimulationRuntime = null;
  void resetAllDataRuntime?.waitForIdle();
  resetAllDataRuntime = null;
  void backtestRuntime?.stop();
  backtestRuntime = null;
  void systemIdleMaintenance?.stop();
  systemIdleMaintenance = null;
  // The market runtime owns a separate database. The local application
  // database must still be closed on the synchronous exit path, including
  // while reset or market work is unwinding, so SQLite receives an explicit
  // close before the process leaves.
  closeLocalDatabase();
};

const stopRuntimeServices = (): Promise<void> => {
  if (runtimeServicesStopPromise) {
    return runtimeServicesStopPromise;
  }
  runtimeServicesStopPromise = (async () => {
    stopParentWatchdog();
    const marketRuntimeForShutdown = marketRuntime;
    const marketBackgroundStopPromise =
      marketRuntimeForShutdown?.stopBackgroundWork() ?? Promise.resolve();
    const historyRetentionStopPromise =
      historyRetentionRuntime?.stop() ?? Promise.resolve();
    historyRetentionRuntime = null;
    const dataSourceStopPromise = dataSourceRuntime?.stop() ?? Promise.resolve();
    dataSourceRuntime = null;
    specialTrainingRuntime?.stop();
    specialTrainingRuntime = null;
    const systemDevStopPromise = systemDevSimulationRuntime?.stop() ?? Promise.resolve();
    systemDevSimulationRuntime = null;
    const resetAllIdlePromise = resetAllDataRuntime?.waitForIdle() ?? Promise.resolve();
    const backtestStopPromise = backtestRuntime?.stop() ?? Promise.resolve();
    backtestRuntime = null;
    const idleMaintenanceStopPromise = systemIdleMaintenance?.stop() ?? Promise.resolve();
    systemIdleMaintenance = null;
    await Promise.all([
      dataSourceStopPromise,
      systemDevStopPromise,
      resetAllIdlePromise,
      backtestStopPromise,
      idleMaintenanceStopPromise,
      marketBackgroundStopPromise,
      historyRetentionStopPromise,
    ]);
    resetAllDataRuntime = null;
    closeLocalDatabase();
    if (marketRuntimeForShutdown) {
      marketRuntime = null;
      await marketRuntimeForShutdown.close();
    }
  })();
  return runtimeServicesStopPromise;
};

const logRuntimeServiceStopFailure = (error: unknown): void => {
  console.error('[zinuto-backend] runtime service stop failed', {
    error: formatUnknownErrorForLog(error),
  });
};

const exitBackendProcess = (code: number): void => {
  cleanupRuntimeStateFile();
  cleanupUnixSocket();
  process.exit(code);
};

const closeBackendHttpConnections = (): void => {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
};

const shutdownBackend = (code: number): void => {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  const stopPromise = stopRuntimeServices().catch(logRuntimeServiceStopFailure);
  server.close(() => {
    void stopPromise.finally(() => {
      exitBackendProcess(code);
    });
  });
  closeBackendHttpConnections();
  setTimeout(() => {
    exitBackendProcess(code);
  }, 1500).unref();
};

const startParentWatchdog = (): void => {
  if (backendParentPid <= 1) {
    return;
  }
  parentWatchTimer = setInterval(() => {
    const adoptedByInit = process.ppid === 1 && backendParentPid !== 1;
    if (isProcessAlive(backendParentPid) && !adoptedByInit) {
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[zinuto-backend] parent process disappeared, shutting down', { parentPid: backendParentPid, currentPpid: process.ppid });
    shutdownBackend(0);
  }, 1500);
  parentWatchTimer.unref();
};

server =
  backendTransport.type === 'unix'
    ? app.listen(backendTransport.socketPath)
    : app.listen(backendTransport.port, backendTransport.host);

server.on('listening', () => {
  if (!writeRuntimeStateFile()) {
    shutdownBackend(1);
    return;
  }
  BACKEND_STARTUP_PROGRESS.close();
  startParentWatchdog();
  // eslint-disable-next-line no-console
  console.log(
    backendTransport.type === 'unix'
      ? `Zinuto backend listening on unix socket ${backendTransport.socketPath} (db: ${DB_FILE_PATH}, dataDir: ${DB_DATA_DIR})`
      : `Zinuto backend listening on tcp ${backendTransport.host}:${backendTransport.port} (db: ${DB_FILE_PATH}, dataDir: ${DB_DATA_DIR})`
  );
  // eslint-disable-next-line no-console
  console.log('[zinuto-backend] storage layout', {
    appRootDir: STORAGE_LAYOUT.appRootDir,
    coreDataDir: STORAGE_LAYOUT.coreDataDir,
    marketDataDir: STORAGE_LAYOUT.marketDataDir,
    cacheDir: STORAGE_LAYOUT.cacheDir,
    tempDir: STORAGE_LAYOUT.tempDir,
    startupMode: getBackendStartupStatus().mode,
  });
});

server.on('error', (error) => {
  BACKEND_STARTUP_PROGRESS.close();
  void stopRuntimeServices()
    .catch(logRuntimeServiceStopFailure)
    .finally(() => {
      cleanupRuntimeStateFile();
      // eslint-disable-next-line no-console
      console.error('[zinuto-backend] listen failed');
      // eslint-disable-next-line no-console
      console.error(formatUnknownErrorForLog(error));
      process.exit(1);
    });
});

server.on('close', () => {
  void stopRuntimeServices()
    .catch(logRuntimeServiceStopFailure)
    .finally(() => {
      cleanupRuntimeStateFile();
      cleanupUnixSocket();
    });
});

process.on('SIGINT', () => {
  shutdownBackend(0);
});

process.on('SIGTERM', () => {
  shutdownBackend(0);
});

process.on('exit', () => {
  BACKEND_STARTUP_PROGRESS.close();
  stopRuntimeServicesSync();
  cleanupRuntimeStateFile();
  cleanupUnixSocket();
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[unhandledRejection]', formatUnknownErrorForLog(reason));
});

process.on('uncaughtException', (error: unknown) => {
  console.error('[uncaughtException]', formatUnknownErrorForLog(error));
  shutdownBackend(1);
});
