#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveAkshareSidecarPackageLayout,
  stageAkshareSidecarPackageInput,
} from "../../../../tools/release/market-data-acquisition-runtime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const repositoryDir = path.resolve(backendDir, "../../..");
const projectDir = path.join(backendDir, "sidecars", "akshare");
const complianceManifestPath = path.join(
  repositoryDir,
  "config",
  "open-source",
  "python-sidecar-dependencies.json",
);
const complianceManifest = JSON.parse(
  fs.readFileSync(complianceManifestPath, "utf8"),
);
if (complianceManifest.schemaVersion !== 1) {
  throw new Error("AKSHARE_SIDECAR_COMPLIANCE_SCHEMA_INVALID");
}
const resolveRepositoryFile = (relativePath, errorCode) => {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error(errorCode);
  }
  const resolved = path.resolve(repositoryDir, relativePath);
  const repositoryRelative = path.relative(repositoryDir, resolved);
  if (repositoryRelative.startsWith("..") || path.isAbsolute(repositoryRelative)) {
    throw new Error(errorCode);
  }
  return resolved;
};
const sha256File = (filePath) =>
  createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const lockFile = resolveRepositoryFile(
  complianceManifest.lockFile,
  "AKSHARE_SIDECAR_LOCK_PATH_INVALID",
);
const projectFile = resolveRepositoryFile(
  complianceManifest.projectFile,
  "AKSHARE_SIDECAR_PROJECT_PATH_INVALID",
);
const pythonVersionFile = resolveRepositoryFile(
  complianceManifest.pythonVersionFile,
  "AKSHARE_SIDECAR_PYTHON_VERSION_PATH_INVALID",
);
if (
  lockFile !== path.join(projectDir, "uv.lock") ||
  sha256File(lockFile) !== complianceManifest.lockSha256
) {
  throw new Error("AKSHARE_SIDECAR_LOCK_HASH_INVALID");
}
if (
  projectFile !== path.join(projectDir, "pyproject.toml") ||
  sha256File(projectFile) !== complianceManifest.projectSha256
) {
  throw new Error("AKSHARE_SIDECAR_PROJECT_HASH_INVALID");
}
if (
  pythonVersionFile !== path.join(projectDir, ".python-version") ||
  sha256File(pythonVersionFile) !== complianceManifest.pythonVersionFileSha256
) {
  throw new Error("AKSHARE_SIDECAR_PYTHON_VERSION_HASH_INVALID");
}
const targetId = `${process.platform}-${process.arch}`;
const outputRoot = path.join(repositoryDir, ".cache", "akshare-sidecar", targetId);
const buildRoot = path.join(repositoryDir, ".cache", "akshare-sidecar", "build", targetId);
const generatedRoot = path.join(
  repositoryDir,
  "apps",
  "desktop",
  "shell",
  "gen",
);
const packageLayout = resolveAkshareSidecarPackageLayout({
  generatedRoot,
  nodePlatform: process.platform,
  nodeArch: process.arch,
});
if (packageLayout.targetId !== targetId) {
  throw new Error("AKSHARE_SIDECAR_TARGET_INVALID");
}
const environmentRoot = path.join(buildRoot, "venv");
const uvEnvironment = {
  ...process.env,
  UV_PROJECT_ENVIRONMENT: environmentRoot,
};
const pythonVersion = complianceManifest.pythonRuntime?.version;
if (
  typeof pythonVersion !== "string" ||
  fs.readFileSync(pythonVersionFile, "utf8").trim() !== pythonVersion
) {
  throw new Error("AKSHARE_SIDECAR_PYTHON_VERSION_INVALID");
}
const requiredUvVersion = complianceManifest.buildTool?.version;
if (
  complianceManifest.buildTool?.name !== "uv" ||
  typeof requiredUvVersion !== "string"
) {
  throw new Error("AKSHARE_SIDECAR_BUILD_TOOL_INVALID");
}
const uvVersion = execFileSync("uv", ["--version"], { encoding: "utf8" }).trim();
if (
  !uvVersion.startsWith(`uv ${requiredUvVersion}`) ||
  !/^(?:$|\s)/u.test(uvVersion.slice(`uv ${requiredUvVersion}`.length))
) {
  throw new Error(`AKSHARE_SIDECAR_UV_VERSION_INVALID:${uvVersion}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.rmSync(buildRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
process.once("exit", () => {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.rmSync(buildRoot, { recursive: true, force: true });
});

execFileSync("uv", ["sync", "--python", pythonVersion, "--frozen", "--project", projectDir], {
  cwd: repositoryDir,
  env: uvEnvironment,
  stdio: "inherit",
});
if (process.argv.includes("--sync-only")) {
  process.stdout.write(`${JSON.stringify({ pythonVersion, projectDir })}\n`);
  process.exit(0);
}
execFileSync(
  "uv",
  [
    "run",
    "--python",
    pythonVersion,
    "--frozen",
    "--project",
    projectDir,
    "python",
    path.join(projectDir, "worker_test.py"),
  ],
  { cwd: projectDir, env: uvEnvironment, stdio: "inherit" },
);
execFileSync(
  "uv",
  [
    "run",
    "--python",
    pythonVersion,
    "--frozen",
    "--project",
    projectDir,
    "pyinstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name",
    "zinuto-akshare-sidecar",
    "--distpath",
    outputRoot,
    "--workpath",
    buildRoot,
    "--specpath",
    buildRoot,
    "--copy-metadata",
    "akshare",
    "--collect-data",
    "akshare",
    "--hidden-import",
    "akshare",
    "--hidden-import",
    "akshare.stock_feature.stock_hist_tx",
    "--hidden-import",
    "akshare.stock.stock_zh_a_sina",
    "--hidden-import",
    "akshare.stock.stock_zh_a_tx",
    "--collect-all",
    "py_mini_racer",
    path.join(projectDir, "main.py"),
  ],
  { cwd: repositoryDir, env: uvEnvironment, stdio: "inherit" },
);

const executableName = process.platform === "win32"
  ? "zinuto-akshare-sidecar.exe"
  : "zinuto-akshare-sidecar";
const executablePath = path.join(
  outputRoot,
  "zinuto-akshare-sidecar",
  executableName,
);
if (!fs.existsSync(executablePath)) {
  throw new Error("AKSHARE_SIDECAR_BUILD_OUTPUT_MISSING");
}
const smokeRequest = {
  protocol: "zinuto.akshare.v1",
  requestId: "build-smoke",
  operation: "forbidden_operation",
  params: {},
};
const smoke = spawnSync(executablePath, [], {
  cwd: repositoryDir,
  input: `${JSON.stringify(smokeRequest)}\n`,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
let smokeResponse = null;
try {
  smokeResponse = JSON.parse(String(smoke.stdout ?? "").trim());
} catch {
  // handled by the stable failure below
}
if (
  smoke.status !== 2 ||
  smokeResponse?.protocol !== "zinuto.akshare.v1" ||
  smokeResponse?.requestId !== "unknown" ||
  smokeResponse?.ok !== false ||
  smokeResponse?.error?.code !== "AKSHARE_SIDECAR_OPERATION_FORBIDDEN"
) {
  throw new Error("AKSHARE_SIDECAR_PROTOCOL_SMOKE_FAILED");
}
// The worker imports AKShare at startup. The protocol smoke above therefore
// validates the packaged dependency without making a network request.
const stagedPackage = stageAkshareSidecarPackageInput({
  generatedRoot,
  sourceBundleRoot: path.dirname(executablePath),
  nodePlatform: process.platform,
  nodeArch: process.arch,
});
const packagedExecutablePath = stagedPackage.executablePath;
process.stdout.write(
  `${JSON.stringify({ targetId, pythonVersion, executablePath, packagedExecutablePath })}\n`,
);
