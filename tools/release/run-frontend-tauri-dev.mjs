#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROOT_DIR,
  buildDesktopEnv,
  isTruthyEnvFlag,
  nodeCommand,
  npmCommand,
  runCommand,
} from './desktop-command-utils.mjs';

const DEV_SERVER_HOST = '127.0.0.1';
const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}/`;
const DEV_SERVER_PROBE_ATTEMPTS = 20;
const DEV_SERVER_PROBE_DELAY_MS = 250;
const DEV_SERVER_SHUTDOWN_GRACE_MS = 1_500;
const WINDOWS_PARENT_TERMINATED_EXIT_STATUS = 0xffffffff;
const REUSE_EXISTING_DEV_SERVER_ENV = 'ZINUTO_DESKTOP_DEV_REUSE_FRONTEND';
const ZINUTO_DESKTOP_DEV_APP_META = 'name="zinuto-desktop-dev-app"';
const ZINUTO_DESKTOP_DEV_APP_META_CONTENT = 'content="desktop-web"';
const ZINUTO_BOOT_PREFERENCES_CACHE_KEY = 'zinuto.appPreferences.boot.v1';
const ZINUTO_INITIAL_THEME_MARKER = 'dataset.zinutoInitialTheme';
const MAIN_ENTRYPOINT_SCRIPT_RE =
  /<script\b(?=[^>]*\btype=(["'])module\1)(?=[^>]*\bsrc=(["'])\/src\/main\.ts(?:\?[^"']*)?\2)[^>]*>/u;
const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTcpPortOpen = (host, port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });

const readExistingDevServerIndex = () =>
  new Promise((resolve) => {
    const request = http.get(
      DEV_SERVER_URL,
      {
        timeout: 1_500,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 64_000) {
            request.destroy();
          }
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            body,
          });
        });
      },
    );
    request.once('timeout', () => {
      request.destroy();
      resolve(null);
    });
    request.once('error', () => resolve(null));
  });

export const getZinutoDevServerIndexProbe = (body) => {
  const text = String(body || '');
  const hasStableAppMarker =
    text.includes(ZINUTO_DESKTOP_DEV_APP_META) &&
    text.includes(ZINUTO_DESKTOP_DEV_APP_META_CONTENT);
  const hasBootThemeMarker =
    text.includes(ZINUTO_BOOT_PREFERENCES_CACHE_KEY) &&
    text.includes(ZINUTO_INITIAL_THEME_MARKER);
  const hasMainEntrypointScript = MAIN_ENTRYPOINT_SCRIPT_RE.test(text);

  return {
    hasStableAppMarker,
    hasBootThemeMarker,
    hasMainEntrypointScript,
    isZinutoDevServerIndex:
      hasMainEntrypointScript && (hasStableAppMarker || hasBootThemeMarker),
  };
};

export const isZinutoDevServerIndex = (body) =>
  getZinutoDevServerIndexProbe(body).isZinutoDevServerIndex;

const formatDevServerProbeSummary = (response) => {
  if (!response) {
    return 'No readable HTTP index response was returned.';
  }
  const probe = getZinutoDevServerIndexProbe(response.body);
  return [
    `HTTP status: ${response.statusCode}`,
    `stable app marker: ${probe.hasStableAppMarker ? 'yes' : 'no'}`,
    `boot theme marker: ${probe.hasBootThemeMarker ? 'yes' : 'no'}`,
    `main entrypoint script: ${probe.hasMainEntrypointScript ? 'yes' : 'no'}`,
  ].join('\n');
};

export const parseListeningProcessIds = (output) =>
  Array.from(
    new Set(
      String(output || '')
        .split(/\s+/u)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  );

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readDevServerListeningProcessIds = () => {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        [
          `$connections = Get-NetTCPConnection -LocalAddress ${DEV_SERVER_HOST} -LocalPort ${DEV_SERVER_PORT} -State Listen -ErrorAction SilentlyContinue;`,
          '$connections | Select-Object -ExpandProperty OwningProcess',
        ].join(' '),
      ],
      { encoding: 'utf8' },
    );
    return result.status === 0 ? parseListeningProcessIds(result.stdout) : [];
  }

  const result = spawnSync(
    'lsof',
    ['-nP', `-tiTCP:${DEV_SERVER_PORT}`, '-sTCP:LISTEN'],
    { encoding: 'utf8' },
  );
  return result.status === 0 ? parseListeningProcessIds(result.stdout) : [];
};

const terminateWindowsProcessTree = (pid) => {
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    stdio: 'ignore',
  });
};

const terminateUnixProcess = async (pid, { processGroup = false } = {}) => {
  const targetPid = processGroup ? -pid : pid;
  try {
    process.kill(targetPid, 'SIGTERM');
  } catch {
    return;
  }
  await wait(DEV_SERVER_SHUTDOWN_GRACE_MS);
  if (!isProcessAlive(pid)) {
    return;
  }
  try {
    process.kill(targetPid, 'SIGKILL');
  } catch {
    // Process already exited.
  }
};

const terminateProcessTree = async (pid, { processGroup = false } = {}) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return;
  }
  if (process.platform === 'win32') {
    terminateWindowsProcessTree(pid);
    return;
  }
  await terminateUnixProcess(pid, { processGroup });
};

const stopExistingZinutoDevServer = async () => {
  const pids = readDevServerListeningProcessIds();
  if (!pids.length) {
    throw new Error(
      [
        `[desktop-dev] Port ${DEV_SERVER_PORT} is occupied by an existing Zinuto dev server, but no listener PID could be resolved.`,
        `Close the process using ${DEV_SERVER_URL} and run \`npm run desktop:dev\` again.`,
      ].join('\n'),
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[desktop-dev] Stopping existing Zinuto frontend dev server on ${DEV_SERVER_URL} (pid: ${pids.join(', ')}).`,
  );
  await Promise.all(pids.map((pid) => terminateProcessTree(pid)));
  await wait(250);
  if (await isTcpPortOpen(DEV_SERVER_HOST, DEV_SERVER_PORT)) {
    throw new Error(
      [
        `[desktop-dev] Existing Zinuto frontend dev server did not release port ${DEV_SERVER_PORT}.`,
        `Listener pid(s): ${pids.join(', ')}`,
      ].join('\n'),
    );
  }
};

const findExistingZinutoDevServer = async () => {
  if (!(await isTcpPortOpen(DEV_SERVER_HOST, DEV_SERVER_PORT))) {
    return false;
  }
  let lastResponse = null;
  for (let attempt = 0; attempt < DEV_SERVER_PROBE_ATTEMPTS; attempt += 1) {
    const response = await readExistingDevServerIndex();
    lastResponse = response;
    if (response?.statusCode === 200 && isZinutoDevServerIndex(response.body)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, DEV_SERVER_PROBE_DELAY_MS));
  }
  throw new Error(
    [
      `[desktop-dev] Port ${DEV_SERVER_PORT} is already in use, but it is not serving the Zinuto desktop dev app.`,
      formatDevServerProbeSummary(lastResponse),
      `Close the process using ${DEV_SERVER_URL} and run \`npm run desktop:dev\` again.`,
    ].join('\n'),
  );
};

const keepBeforeDevCommandAlive = async () => {
  // Tauri owns this beforeDevCommand process and terminates it after the app exits.
  const interval = setInterval(() => {}, 60_000);
  const stop = () => {
    clearInterval(interval);
    process.exit(0);
  };
  for (const signal of TERMINATION_SIGNALS) {
    process.once(signal, stop);
  }
  await new Promise(() => {});
};

const runManagedFrontendDevServer = (env) =>
  new Promise((resolve, reject) => {
    // eslint-disable-next-line no-console
    console.log('[desktop-dev] Starting frontend dev server');
    const child = spawn(
      npmCommand,
      ['run', 'dev:tauri', '--workspace=@zinuto/desktop-web'],
      {
        cwd: ROOT_DIR,
        env,
        shell: process.platform === 'win32',
        stdio: 'inherit',
        detached: process.platform !== 'win32',
      },
    );

    let terminating = false;
    let settled = false;

    const cleanupSignalHandlers = () => {
      for (const signal of TERMINATION_SIGNALS) {
        process.off(signal, signalHandlers.get(signal));
      }
    };

    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupSignalHandlers();
      callback();
    };

    const stopChildAndExit = async () => {
      if (terminating) {
        return;
      }
      terminating = true;
      if (child.pid) {
        await terminateProcessTree(child.pid, {
          processGroup: process.platform !== 'win32',
        });
      }
      process.exit(0);
    };

    const signalHandlers = new Map(
      TERMINATION_SIGNALS.map((signal) => [signal, () => void stopChildAndExit()]),
    );

    for (const [signal, handler] of signalHandlers) {
      process.once(signal, handler);
    }

    child.once('error', (error) => {
      settle(() => {
        reject(
          new Error(
            `Failed to launch ${npmCommand} "run" "dev:tauri" "--workspace=@zinuto/desktop-web": ${error.message}`,
          ),
        );
      });
    });

    child.once('exit', (status, signal) => {
      if (terminating) {
        settle(() => resolve({ status: 0, signal }));
        return;
      }
      const allowedExitStatuses =
        process.platform === 'win32' ? [WINDOWS_PARENT_TERMINATED_EXIT_STATUS] : [];
      if (status === 0 || allowedExitStatuses.includes(status)) {
        settle(() => resolve({ status, signal }));
        return;
      }
      settle(() => {
        reject(
          new Error(
            `Command failed (${status || 1}): ${npmCommand} "run" "dev:tauri" "--workspace=@zinuto/desktop-web"`,
          ),
        );
      });
    });
  });

const main = async () => {
  const env = buildDesktopEnv();

  if (!isTruthyEnvFlag(process.env.ZINUTO_DESKTOP_PREFLIGHT_DONE)) {
    runCommand(
      nodeCommand,
      ['./tools/release/prepare-tauri-dev.mjs'],
      'Running shared Tauri dev preflight',
      {
        cwd: ROOT_DIR,
        env,
        logPrefix: 'desktop-dev',
      },
    );
  }

  if (await findExistingZinutoDevServer()) {
    if (!isTruthyEnvFlag(process.env[REUSE_EXISTING_DEV_SERVER_ENV])) {
      await stopExistingZinutoDevServer();
    } else {
      // eslint-disable-next-line no-console
      console.log(`[desktop-dev] Reusing existing Zinuto frontend dev server at ${DEV_SERVER_URL}`);
      await keepBeforeDevCommandAlive();
    }
  }

  const frontendResult = await runManagedFrontendDevServer(env);

  if (frontendResult.status === WINDOWS_PARENT_TERMINATED_EXIT_STATUS) {
    // Tauri terminates beforeDevCommand after the desktop app exits. On Windows,
    // cmd/npm can surface that parent-triggered teardown as 0xffffffff.
    // eslint-disable-next-line no-console
    console.log('[desktop-dev] Frontend dev server stopped after Tauri shutdown.');
  }
};

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  await main();
}
