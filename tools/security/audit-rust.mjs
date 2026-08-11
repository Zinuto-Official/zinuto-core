// SPDX-License-Identifier: GPL-3.0-only

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const shellManifest = "apps/desktop/shell/Cargo.toml";
const shellLockfile = "apps/desktop/shell/Cargo.lock";
const backtestManifest = "apps/desktop/backtest-engine/Cargo.toml";
const backtestLockfile = "apps/desktop/backtest-engine/Cargo.lock";
const inactiveAdvisory = "RUSTSEC-2026-0235";
const inactivePackage = "rkyv";
const inactiveVersion = "0.7.46";
const shippingTargets = Object.freeze([
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
]);
const reviewedTargetExcludedWarnings = new Set([
  "unmaintained|RUSTSEC-2024-0413|atk@0.18.2",
  "unmaintained|RUSTSEC-2024-0416|atk-sys@0.18.2",
  "unmaintained|RUSTSEC-2024-0412|gdk@0.18.2",
  "unmaintained|RUSTSEC-2024-0418|gdk-sys@0.18.2",
  "unmaintained|RUSTSEC-2024-0411|gdkwayland-sys@0.18.2",
  "unmaintained|RUSTSEC-2024-0417|gdkx11@0.18.2",
  "unmaintained|RUSTSEC-2024-0414|gdkx11-sys@0.18.2",
  "unmaintained|RUSTSEC-2024-0415|gtk@0.18.2",
  "unmaintained|RUSTSEC-2024-0420|gtk-sys@0.18.2",
  "unmaintained|RUSTSEC-2024-0419|gtk3-macros@0.18.2",
  "unmaintained|RUSTSEC-2024-0370|proc-macro-error@1.0.4",
  "unsound|RUSTSEC-2024-0429|glib@0.18.5",
]);
const auditTemporaryRoot = mkdtempSync(path.join(tmpdir(), "zinuto-cargo-audit-"));
const advisoryDatabase = path.join(auditTemporaryRoot, "advisory-db");

const run = (command, args, { capture = false, allowFailure = false } = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${String(result.status ?? 1)}`);
  }
  return result;
};

try {
const shellAudit = run(
  "cargo",
  ["audit", "--db", advisoryDatabase, "--file", shellLockfile, "--format", "json"],
  { capture: true, allowFailure: true },
);

let shellReport;
try {
  shellReport = JSON.parse(shellAudit.stdout);
} catch {
  process.stderr.write(shellAudit.stderr);
  throw new Error("Desktop-shell cargo audit did not return valid JSON.");
}

const shellVulnerabilities = shellReport.vulnerabilities?.list ?? [];
if (shellAudit.status !== 0 || shellVulnerabilities.length > 0) {
  process.stderr.write(shellAudit.stderr);
  process.stderr.write(`${shellAudit.stdout}\n`);
  throw new Error("Desktop-shell cargo audit found a vulnerability or failed to run.");
}

const shellWarnings = Object.entries(shellReport.warnings ?? {}).flatMap(
  ([kind, warnings]) => (warnings ?? []).map((warning) => ({
    kind,
    advisory: String(warning?.advisory?.id ?? ""),
    package: String(warning?.package?.name ?? ""),
    version: String(warning?.package?.version ?? ""),
  })),
);
const actualWarningKeys = new Set(shellWarnings.map(
  (warning) => `${warning.kind}|${warning.advisory}|${warning.package}@${warning.version}`,
));
const unexpectedWarnings = [...actualWarningKeys].filter(
  (warning) => !reviewedTargetExcludedWarnings.has(warning),
);
const missingReviewedWarnings = [...reviewedTargetExcludedWarnings].filter(
  (warning) => !actualWarningKeys.has(warning),
);
if (unexpectedWarnings.length > 0 || missingReviewedWarnings.length > 0) {
  throw new Error(
    `Desktop-shell cargo audit warning set changed. Unexpected: ${unexpectedWarnings.join(", ") || "none"}. `
      + `Missing reviewed entries: ${missingReviewedWarnings.join(", ") || "none"}.`,
  );
}

for (const warning of shellWarnings) {
  for (const target of shippingTargets) {
    const dependencyTree = run(
      "cargo",
      [
        "tree",
        "--locked",
        "--manifest-path",
        shellManifest,
        "--target",
        target,
        "--all-features",
        "--edges",
        "normal,build",
        "--invert",
        `${warning.package}@${warning.version}`,
        "--prefix",
        "none",
      ],
      { capture: true },
    );
    if (dependencyTree.stdout.trim()) {
      process.stderr.write(dependencyTree.stdout);
      throw new Error(
        `${warning.advisory} (${warning.package}@${warning.version}) is reachable from shipping target ${target}.`,
      );
    }
  }
}

console.log(
  `[security:audit:rust] reviewed ${shellWarnings.length} Tauri GTK3 warnings: every package is absent from all declared macOS and Windows shipping target trees.`,
);

const backtestAudit = run(
  "cargo",
  ["audit", "--db", advisoryDatabase, "--no-fetch", "--file", backtestLockfile, "--format", "json"],
  { capture: true, allowFailure: true },
);

let report;
try {
  report = JSON.parse(backtestAudit.stdout);
} catch {
  process.stderr.write(backtestAudit.stderr);
  throw new Error("Backtest-engine cargo audit did not return valid JSON.");
}

const vulnerabilities = report.vulnerabilities?.list ?? [];
const isExpectedInactiveAdvisory =
  backtestAudit.status === 1 &&
  vulnerabilities.length === 1 &&
  vulnerabilities[0]?.advisory?.id === inactiveAdvisory &&
  vulnerabilities[0]?.package?.name === inactivePackage &&
  vulnerabilities[0]?.package?.version === inactiveVersion;

if (!isExpectedInactiveAdvisory) {
  process.stderr.write(backtestAudit.stderr);
  process.stderr.write(`${backtestAudit.stdout}\n`);
  throw new Error(
    `Backtest-engine cargo audit must contain only the reviewed ${inactiveAdvisory} exception.`,
  );
}

const activeDependencyTree = run(
  "cargo",
  [
    "tree",
    "--locked",
    "--manifest-path",
    backtestManifest,
    "--target",
    "all",
    "--edges",
    "normal,build",
    "--invert",
    `${inactivePackage}@${inactiveVersion}`,
    "--prefix",
    "none",
  ],
  { capture: true },
);

if (activeDependencyTree.stdout.trim()) {
  process.stderr.write(activeDependencyTree.stdout);
  throw new Error(
    `${inactiveAdvisory} can be reviewed only while ${inactivePackage}@${inactiveVersion} is absent from every production target dependency tree.`,
  );
}

console.log(
  `[security:audit:rust] reviewed ${inactiveAdvisory}: ${inactivePackage}@${inactiveVersion} is locked only through rust_decimal's disabled optional feature and is absent from all production target dependency trees.`,
);
} finally {
  rmSync(auditTemporaryRoot, { recursive: true, force: true });
}
