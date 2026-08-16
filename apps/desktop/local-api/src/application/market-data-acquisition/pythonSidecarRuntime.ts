// SPDX-License-Identifier: GPL-3.0-only

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  AcquisitionRuntimeError,
  throwIfAcquisitionCanceled,
} from './marketDataAcquisitionTypes.js';

export const PYTHON_SIDECAR_RESPONSE_LIMIT_BYTES = 128 * 1024 * 1024;
export const PYTHON_SIDECAR_WORKER_TIMEOUT_MS = 120_000;
export const PYTHON_SIDECAR_TERMINATION_GRACE_MS = 1_000;
export const PYTHON_SIDECAR_SETTLEMENT_DEADLINE_MS = 3_000;

export type PythonSidecarLaunchSource =
  | 'TRUSTED_NATIVE'
  | 'EXPLICIT'
  | 'GENERATED'
  | 'DEV_PYTHON';

export type PythonSidecarLaunchSpec = {
  command: string;
  args: string[];
  source: PythonSidecarLaunchSource;
};

export const isRegularPythonSidecarFile = (filePath: string): boolean => {
  try {
    const metadata = fs.lstatSync(filePath);
    return !metadata.isSymbolicLink() && metadata.isFile();
  } catch {
    return false;
  }
};

export const isExecutablePythonSidecarFile = (filePath: string): boolean => {
  try {
    const metadata = fs.lstatSync(filePath);
    return (
      !metadata.isSymbolicLink() &&
      metadata.isFile() &&
      (process.platform === 'win32' || (metadata.mode & 0o111) !== 0)
    );
  } catch {
    return false;
  }
};

const executableName = (baseName: string): string =>
  process.platform === 'win32' ? `${baseName}.exe` : baseName;

/**
 * Resolves only a packaged executable, an explicitly selected development
 * executable, or the project-owned virtual environment. It never searches a
 * user PATH for Python, which keeps the frozen dependency graph authoritative.
 */
export const resolvePythonSidecarLaunchSpec = ({
  sidecarDirectory,
  generatedRoot,
  bundleDirectoryName,
  executableBaseName,
  explicitPathEnvName,
  trustedPathEnvName,
  env = process.env,
}: {
  sidecarDirectory: string;
  generatedRoot: string;
  bundleDirectoryName: string;
  executableBaseName: string;
  explicitPathEnvName: string;
  trustedPathEnvName: string;
  env?: NodeJS.ProcessEnv;
}): PythonSidecarLaunchSpec | null => {
  if (env.NODE_ENV === 'production') {
    const trustedNativePath = String(env[trustedPathEnvName] ?? '').trim();
    if (trustedNativePath && isExecutablePythonSidecarFile(path.resolve(trustedNativePath))) {
      return {
        command: path.resolve(trustedNativePath),
        args: [],
        source: 'TRUSTED_NATIVE',
      };
    }
    return null;
  }

  const explicitPath = String(env[explicitPathEnvName] ?? '').trim();
  if (explicitPath && isExecutablePythonSidecarFile(path.resolve(explicitPath))) {
    return {
      command: path.resolve(explicitPath),
      args: [],
      source: 'EXPLICIT',
    };
  }

  const generatedPath = path.join(
    generatedRoot,
    'market-data-acquisition',
    bundleDirectoryName,
    `${process.platform}-${process.arch}`,
    executableName(executableBaseName),
  );
  if (isExecutablePythonSidecarFile(generatedPath)) {
    return { command: generatedPath, args: [], source: 'GENERATED' };
  }

  const pythonPath = process.platform === 'win32'
    ? path.join(sidecarDirectory, '.venv', 'Scripts', 'python.exe')
    : path.join(sidecarDirectory, '.venv', 'bin', 'python');
  const workerPath = path.join(sidecarDirectory, 'main.py');
  if (
    isExecutablePythonSidecarFile(pythonPath) &&
    isRegularPythonSidecarFile(workerPath)
  ) {
    return {
      command: pythonPath,
      args: [workerPath],
      source: 'DEV_PYTHON',
    };
  }
  return null;
};

export const pythonSidecarWorkerEnvironment = (
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  const allowedNames = [
    'SYSTEMROOT',
    'WINDIR',
    'PATH',
    'LANG',
    'LC_ALL',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ] as const;
  return Object.fromEntries(
    allowedNames.flatMap((name) =>
      typeof env[name] === 'string' ? [[name, env[name]]] : [],
    ),
  );
};

const pythonSidecarParentWatchdogEnvironment = (): NodeJS.ProcessEnv => (
  process.platform === 'win32'
    ? {}
    : { ZINUTO_PYTHON_SIDECAR_PARENT_PID: String(process.pid) }
);

const signalChildTree = (
  target: ChildProcess,
  signalName: NodeJS.Signals,
): void => {
  if (!target.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-target.pid, signalName);
      return;
    } catch {
      // The child may have exited between the liveness check and the signal.
    }
  }
  try {
    target.kill(signalName);
  } catch {
    // A close/error event or the independent settlement deadline will follow.
  }
};

const forceKillChildTree = (target: ChildProcess): void => {
  if (process.platform === 'win32' && target.pid) {
    const killer = spawn(
      'taskkill.exe',
      ['/PID', String(target.pid), '/T', '/F'],
      {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...pythonSidecarWorkerEnvironment(process.env),
          ...pythonSidecarParentWatchdogEnvironment(),
        },
      },
    );
    killer.once('error', () => signalChildTree(target, 'SIGKILL'));
    killer.unref();
    return;
  }
  signalChildTree(target, 'SIGKILL');
};

/**
 * One bounded NDJSON invocation. Keeping cancellation, response limits and
 * child-tree termination here makes provider workers mechanically equivalent
 * without coupling their request protocols or upstream fallback behaviour.
 */
export const executePythonSidecar = async ({
  launchSpec,
  request,
  signal,
  startFailureCode,
  timeoutCode,
  responseTooLargeCode,
  responseLimitBytes = PYTHON_SIDECAR_RESPONSE_LIMIT_BYTES,
  workerTimeoutMs = PYTHON_SIDECAR_WORKER_TIMEOUT_MS,
  terminationGraceMs = PYTHON_SIDECAR_TERMINATION_GRACE_MS,
  settlementDeadlineMs = PYTHON_SIDECAR_SETTLEMENT_DEADLINE_MS,
}: {
  launchSpec: PythonSidecarLaunchSpec;
  request: unknown;
  signal: AbortSignal;
  startFailureCode: string;
  timeoutCode: string;
  responseTooLargeCode: string;
  responseLimitBytes?: number;
  workerTimeoutMs?: number;
  terminationGraceMs?: number;
  settlementDeadlineMs?: number;
}): Promise<string> => {
  throwIfAcquisitionCanceled(signal);
  const child = spawn(launchSpec.command, launchSpec.args, {
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...pythonSidecarWorkerEnvironment(process.env),
      ...pythonSidecarParentWatchdogEnvironment(),
    },
  });
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let settled = false;
  let terminationReason: 'CANCELED' | 'RESPONSE_TOO_LARGE' | 'TIMEOUT' | null = null;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  let settlementTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectForDeadline: (() => void) | null = null;

  const terminate = (
    reason: Exclude<typeof terminationReason, null>,
  ): void => {
    if (terminationReason === null) terminationReason = reason;
    child.stdin.destroy();
    signalChildTree(child, 'SIGTERM');
    if (forceKillTimer === undefined) {
      forceKillTimer = setTimeout(
        () => forceKillChildTree(child),
        Math.max(0, Math.floor(terminationGraceMs)),
      );
      forceKillTimer.unref?.();
    }
    if (settlementTimer === undefined) {
      settlementTimer = setTimeout(
        () => rejectForDeadline?.(),
        Math.max(1, Math.floor(terminationGraceMs + settlementDeadlineMs)),
      );
      settlementTimer.unref?.();
    }
  };
  const cancel = () => terminate('CANCELED');
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(
    () => terminate('TIMEOUT'),
    Math.max(1, Math.floor(workerTimeoutMs)),
  );
  timeout.unref?.();
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > responseLimitBytes) {
      terminate('RESPONSE_TOO_LARGE');
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      const rejectForTerminationReason = (): void => {
        if (terminationReason === 'CANCELED') {
          reject(new AcquisitionRuntimeError('ACQUISITION_CANCELED'));
          return;
        }
        if (terminationReason === 'RESPONSE_TOO_LARGE') {
          reject(new AcquisitionRuntimeError(responseTooLargeCode));
          return;
        }
        if (terminationReason === 'TIMEOUT') {
          reject(new AcquisitionRuntimeError(timeoutCode));
          return;
        }
        reject(new AcquisitionRuntimeError(startFailureCode));
      };
      rejectForDeadline = () => {
        if (settled) return;
        settled = true;
        child.stdout.destroy();
        child.stderr.destroy();
        forceKillChildTree(child);
        rejectForTerminationReason();
      };
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(
          new AcquisitionRuntimeError(startFailureCode, {
            upstreamErrorType: error.name,
          }),
        );
      });
      child.once('close', () => {
        if (settled) return;
        settled = true;
        if (terminationReason !== null) {
          rejectForTerminationReason();
          return;
        }
        resolve(Buffer.concat(stdout).toString('utf8').trim());
      });
      child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
    });
  } finally {
    clearTimeout(timeout);
    if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    if (settlementTimer !== undefined) clearTimeout(settlementTimer);
    rejectForDeadline = null;
    signal.removeEventListener('abort', cancel);
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
};
