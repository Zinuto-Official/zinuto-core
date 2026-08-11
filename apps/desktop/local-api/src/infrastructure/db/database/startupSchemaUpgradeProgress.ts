// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

export type StartupSchemaUpgradeStage =
  | "CORE_SCHEMA"
  | "MARKET_PROBING"
  | "MARKET_COPYING"
  | "MARKET_VALIDATING"
  | "MARKET_SWITCHING"
  | "RESET_RECOVERY"
  | "SEED_RECONCILE"
  | "RUNTIME_BOOTSTRAP";

type StartupSchemaUpgradeProgressRecord = {
  schemaVersion: 2;
  pid: number;
  parentPid: number | null;
  runtimeBuildId: string;
  stage: StartupSchemaUpgradeStage;
  stageOrdinal: number;
  startedAtMs: number;
  stageStartedAtMs: number;
  updatedAtMs: number;
};

const STARTUP_PROGRESS_ENV = "ZINUTO_BACKEND_STARTUP_PROGRESS_PATH";
const HEARTBEAT_INTERVAL_MS = 1_000;

const resolveProgressPath = (): string => {
  const raw = String(process.env[STARTUP_PROGRESS_ENV] ?? "").trim();
  return raw && path.isAbsolute(raw) ? path.resolve(raw) : "";
};

const readOwnedProgressPid = (progressPath: string): number | null => {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(progressPath, "utf8"),
    ) as Partial<StartupSchemaUpgradeProgressRecord>;
    const pid = Number(parsed.pid);
    return Number.isInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  }
};

export const startStartupSchemaUpgradeProgress = (): {
  update: (stage: StartupSchemaUpgradeStage) => void;
  heartbeat: () => void;
  close: () => void;
} => {
  const progressPath = resolveProgressPath();
  if (!progressPath) {
    return {
      update: () => undefined,
      heartbeat: () => undefined,
      close: () => undefined,
    };
  }

  const startedAtMs = Date.now();
  const tempPath = `${progressPath}.${process.pid}.tmp`;
  let stage: StartupSchemaUpgradeStage = "CORE_SCHEMA";
  let stageOrdinal = 1;
  const writtenStages = new Set<StartupSchemaUpgradeStage>([stage]);
  let stageStartedAtMs = startedAtMs;
  let closed = false;

  const write = (): void => {
    if (closed) {
      return;
    }
    const record: StartupSchemaUpgradeProgressRecord = {
      schemaVersion: 2,
      pid: process.pid,
      parentPid: process.ppid > 1 ? process.ppid : null,
      runtimeBuildId: String(
        process.env.ZINUTO_BACKEND_BUILD_ID ?? "unknown",
      ).trim(),
      stage,
      stageOrdinal,
      startedAtMs,
      stageStartedAtMs,
      updatedAtMs: Date.now(),
    };
    try {
      fs.mkdirSync(path.dirname(progressPath), { recursive: true });
      fs.writeFileSync(tempPath, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      try {
        fs.renameSync(tempPath, progressPath);
      } catch (error) {
        if (process.platform !== "win32") {
          throw error;
        }
        // Windows does not replace an existing destination with rename. The
        // shell tolerates this sub-millisecond gap and validates every record's
        // pid/build ownership before extending startup.
        fs.rmSync(progressPath, { force: true });
        fs.renameSync(tempPath, progressPath);
      }
    } catch {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // Startup progress is diagnostic only and must not block data safety.
      }
    }
  };

  write();
  const heartbeat = setInterval(write, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  return {
    update: (nextStage) => {
      if (stage === nextStage || writtenStages.has(nextStage)) {
        // Re-announcing an already-written stage (for example SEED_RECONCILE
        // at runtime bootstrap) must not re-arm the shell's per-stage timeout
        // window or restart the stage clock. The heartbeat keeps the record
        // fresh without re-arming idempotent stage progress.
        return;
      }
      stage = nextStage;
      stageOrdinal += 1;
      writtenStages.add(nextStage);
      stageStartedAtMs = Date.now();
      write();
    },
    heartbeat: () => {
      write();
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      try {
        if (readOwnedProgressPid(progressPath) === process.pid) {
          fs.rmSync(progressPath, { force: true });
        }
        fs.rmSync(tempPath, { force: true });
      } catch {
        // The shell also clears progress owned by a terminated startup process.
      }
    },
  };
};
