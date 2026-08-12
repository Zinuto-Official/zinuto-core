// SPDX-License-Identifier: GPL-3.0-only

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "../../..");
const playwrightCliPath = path.resolve(
  repoRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

export const WORKSPACE_NAVIGATION_SUITE = {
  label: "workspace navigation",
  readyPath: "/workspace-navigation-continuity.html",
  playwrightConfig: "./playwright.hot-interaction.config.ts",
  externalServerEnv: "ZINUTO_WORKSPACE_NAVIGATION_EXTERNAL_SERVER",
  portEnv: "ZINUTO_WORKSPACE_NAVIGATION_PORT",
};

export const I18N_SMOKE_SUITE = {
  label: "i18n smoke",
  readyPath: "/i18n-harness.html",
  playwrightConfig: "./playwright.i18n.config.ts",
  externalServerEnv: "ZINUTO_I18N_SMOKE_EXTERNAL_SERVER",
  portEnv: "ZINUTO_I18N_SMOKE_PORT",
};

const findAvailablePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate a browser harness port")),
        );
        return;
      }
      server.close(() => resolve(String(address.port)));
    });
  });

const buildChildEnv = (overrides = {}) => {
  const env = { ...process.env, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) {
      delete env[key];
    }
  }
  if (env.FORCE_COLOR !== undefined && env.NO_COLOR !== undefined) {
    delete env.NO_COLOR;
  }
  return env;
};

const waitForExit = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const runBrowserHarnessSuites = async (
  suites,
  passthroughArgs = process.argv.slice(2),
) => {
  if (!Array.isArray(suites) || suites.length === 0) {
    throw new Error("At least one browser harness suite is required.");
  }

  const configuredPort = suites
    .map((suite) => process.env[suite.portEnv])
    .find(Boolean);
  const port =
    process.env.ZINUTO_BROWSER_HARNESS_PORT ??
    configuredPort ??
    (await findAvailablePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const childProcesses = new Set();

  const spawnLogged = (command, args, options = {}) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      ...options,
      env: buildChildEnv(options.env),
    });
    childProcesses.add(child);
    child.once("exit", () => childProcesses.delete(child));
    return child;
  };

  const stopChildren = () => {
    for (const child of childProcesses) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  const handleSignal = (signal) => {
    stopChildren();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  const handleSigint = () => handleSignal("SIGINT");
  const handleSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  const server = spawnLogged(
    process.execPath,
    ["./scripts/serve-i18n-smoke.mjs"],
    { env: { ZINUTO_I18N_SMOKE_PORT: port } },
  );

  const stopServer = async () => {
    const exitPromise = waitForExit(server);
    if (
      server.exitCode === null &&
      server.signalCode === null &&
      !server.killed
    ) {
      server.kill("SIGTERM");
    }
    await exitPromise;
  };

  try {
    for (const suite of suites) {
      const deadline = Date.now() + 180_000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${baseUrl}${suite.readyPath}`, {
            method: "HEAD",
          });
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          // The static server may still be starting.
        }
        await sleep(250);
      }
      if (!ready) {
        throw new Error(
          `Timed out waiting for ${suite.label} at ${baseUrl}${suite.readyPath}`,
        );
      }

      const testResult = await waitForExit(
        spawnLogged(
          process.execPath,
          [
            playwrightCliPath,
            "test",
            "-c",
            suite.playwrightConfig,
            ...passthroughArgs,
          ],
          {
            env: {
              FORCE_COLOR: undefined,
              NO_COLOR: undefined,
              [suite.externalServerEnv]: "1",
              [suite.portEnv]: port,
            },
          },
        ),
      );
      if (testResult.code !== 0) {
        return testResult.code ?? 1;
      }
    }
    return 0;
  } finally {
    await stopServer();
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
  }
};
