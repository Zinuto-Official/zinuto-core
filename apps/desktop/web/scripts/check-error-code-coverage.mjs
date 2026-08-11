// SPDX-License-Identifier: GPL-3.0-only

import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(frontendRoot, "../../..");
const backendPaths = [
  path.join(repoRoot, "apps", "desktop", "local-api", "src"),
];

const frontendMappingPaths = [
  path.join(frontendRoot, "src", "api", "index.ts"),
  path.join(frontendRoot, "src", "api", "backendErrorMessage.ts"),
];

const readMatches = (pattern, paths) => {
  try {
    return cp.execFileSync(
      "rg",
      ["-o", pattern, ...paths, "-g", "!node_modules"],
      { encoding: "utf8" },
    );
  } catch (error) {
    return error?.stdout ? String(error.stdout) : "";
  }
};

const extractCodes = (pattern, paths) => {
  const matchedText = readMatches(pattern, paths);
  const regex = new RegExp(pattern);
  return Array.from(
    new Set(
      matchedText
        .split(/\n+/)
        .map((line) => line.match(regex)?.[1] ?? "")
        .filter(Boolean),
    ),
  ).sort();
};

const backendErrorCodes = Array.from(
  new Set([
    ...extractCodes(String.raw`appError\(['"]([A-Z0-9_]+)['"]`, backendPaths),
    ...extractCodes(
      String.raw`dynamicAppError\(['"]([A-Z0-9_]+)['"]`,
      backendPaths,
    ),
    ...extractCodes(
      String.raw`errorCode:\s*['"]([A-Z0-9_]+)['"]`,
      backendPaths,
    ),
  ]),
).sort();

const frontendMappedErrorCodes = extractCodes(
  String.raw`case\s+['"]([A-Z0-9_]+)['"]`,
  frontendMappingPaths,
);
const missingErrorCodes = backendErrorCodes.filter(
  (code) => !frontendMappedErrorCodes.includes(code),
);

if (!missingErrorCodes.length) {
  console.log("✅ 错误码覆盖检查通过：前端已映射全部桌面本地后端错误码。");
  process.exit(0);
}

console.error("❌ 错误码覆盖检查失败：以下错误码尚未映射到前端产品文案。\n");
missingErrorCodes.forEach((code) => {
  console.error(`- ${code}`);
});
process.exit(1);
