// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const toRel = (projectRoot, filePath) =>
  path.relative(projectRoot, filePath).replaceAll(path.sep, "/");

const readJsonFile = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

export const extractImportSpecifiers = (sourceText) => {
  const specs = new Set();
  const importRegex = /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportFromRegex =
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const moduleUrlRegex =
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match = importRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = importRegex.exec(sourceText);
  }

  match = exportFromRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = exportFromRegex.exec(sourceText);
  }

  match = dynamicImportRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = dynamicImportRegex.exec(sourceText);
  }

  match = moduleUrlRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = moduleUrlRegex.exec(sourceText);
  }

  match = requireRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = requireRegex.exec(sourceText);
  }

  return [...specs];
};

export const extractRuntimeImportSpecifiers = (sourceText) => {
  const specs = new Set();
  const importRegex =
    /\bimport\s+(?!type\b)(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportFromRegex =
    /\bexport\s+(?!type\b)(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const moduleUrlRegex =
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match = importRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = importRegex.exec(sourceText);
  }

  match = exportFromRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = exportFromRegex.exec(sourceText);
  }

  match = dynamicImportRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = dynamicImportRegex.exec(sourceText);
  }

  match = moduleUrlRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = moduleUrlRegex.exec(sourceText);
  }

  match = requireRegex.exec(sourceText);
  while (match) {
    specs.add(match[1]);
    match = requireRegex.exec(sourceText);
  }

  return [...specs];
};

export const resolveImportCandidates = (fromFilePath, specifier, srcRoot) => {
  if (!specifier || typeof specifier !== "string") {
    return [];
  }

  let basePath = null;
  if (specifier.startsWith("@/")) {
    basePath = path.join(srcRoot, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    basePath = path.resolve(path.dirname(fromFilePath), specifier);
  }

  if (!basePath) {
    return [];
  }

  const bases = [basePath];
  for (const ext of [".js", ".mjs", ".cjs"]) {
    if (basePath.endsWith(ext)) {
      bases.push(basePath.slice(0, -ext.length));
    }
  }

  const candidates = new Set();
  for (const base of bases) {
    candidates.add(base);
    candidates.add(`${base}.ts`);
    candidates.add(`${base}.tsx`);
    candidates.add(path.join(base, "index.ts"));
    candidates.add(path.join(base, "index.tsx"));
  }

  return [...candidates];
};

export const resolveRelativeImportBase = (fromFilePath, specifier) => {
  if (
    typeof specifier !== "string" ||
    (!specifier.startsWith("./") && !specifier.startsWith("../"))
  ) {
    return null;
  }
  return path.resolve(path.dirname(fromFilePath), specifier);
};

export const pathIsInside = (targetPath, parentPath) =>
  targetPath === parentPath || targetPath.startsWith(`${parentPath}${path.sep}`);

const BUILTIN_MODULE_SPECIFIERS = new Set(
  builtinModules.flatMap((specifier) =>
    specifier.startsWith("node:")
      ? [specifier, specifier.slice("node:".length)]
      : [specifier, `node:${specifier}`],
  ),
);

export const collectReachableTsFiles = (entryFilePath, fileSet, srcRoot) => {
  const reachable = new Set();
  const stack = [entryFilePath];

  while (stack.length) {
    const current = stack.pop();
    if (!current || reachable.has(current) || !fileSet.has(current)) {
      continue;
    }
    reachable.add(current);

    const sourceText = fs.readFileSync(current, "utf8");
    const importSpecifiers = extractImportSpecifiers(sourceText);
    for (const specifier of importSpecifiers) {
      const candidates = resolveImportCandidates(current, specifier, srcRoot);
      for (const candidate of candidates) {
        if (fileSet.has(candidate) && !reachable.has(candidate)) {
          stack.push(candidate);
          break;
        }
      }
    }
  }

  return reachable;
};

const getPackageNameFromSpecifier = (specifier) => {
  if (!specifier || typeof specifier !== "string") {
    return null;
  }
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0] ?? null;
};

export const collectWorkspaceMissingDependencies = ({
  packageJsonPath,
  filePaths,
  workspaceLabel,
  projectRoot,
}) => {
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }
  const packageJson = readJsonFile(packageJsonPath);
  const declaredDependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const missingDependencyRecords = new Map();

  for (const filePath of filePaths) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const importSpecifiers = extractImportSpecifiers(sourceText);
    for (const specifier of importSpecifiers) {
      if (
        !specifier ||
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith("@/") ||
        specifier.startsWith("@zinuto/shared/")
      ) {
        continue;
      }
      const packageName = getPackageNameFromSpecifier(specifier);
      if (!packageName || BUILTIN_MODULE_SPECIFIERS.has(packageName)) {
        continue;
      }
      if (declaredDependencies.has(packageName)) {
        continue;
      }
      const key = `${workspaceLabel}:${packageName}`;
      const current = missingDependencyRecords.get(key);
      if (!current) {
        missingDependencyRecords.set(key, {
          packageName,
          importer: toRel(projectRoot, filePath),
        });
      }
    }
  }

  return [...missingDependencyRecords.values()];
};

export const collectImportCycles = ({
  filePaths,
  srcRoot,
  projectRoot,
  maxCycles = 20,
}) => {
  const normalizedFilePaths = filePaths.filter(Boolean);
  const fileSet = new Set(normalizedFilePaths);
  const graph = new Map();

  for (const filePath of normalizedFilePaths) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const dependencies = new Set();
    for (const specifier of extractRuntimeImportSpecifiers(sourceText)) {
      const candidates = resolveImportCandidates(filePath, specifier, srcRoot);
      for (const candidate of candidates) {
        if (fileSet.has(candidate)) {
          dependencies.add(candidate);
          break;
        }
      }
    }
    graph.set(filePath, [...dependencies]);
  }

  const seen = new Set();
  const active = new Set();
  const stack = [];
  const cycleKeys = new Set();
  const cycles = [];

  const visit = (filePath) => {
    if (cycles.length >= maxCycles) {
      return;
    }
    seen.add(filePath);
    active.add(filePath);
    stack.push(filePath);

    for (const dependencyPath of graph.get(filePath) ?? []) {
      if (cycles.length >= maxCycles) {
        break;
      }
      if (!seen.has(dependencyPath)) {
        visit(dependencyPath);
        continue;
      }
      if (!active.has(dependencyPath)) {
        continue;
      }
      const cycleStartIndex = stack.indexOf(dependencyPath);
      if (cycleStartIndex < 0) {
        continue;
      }
      const cycle = [...stack.slice(cycleStartIndex), dependencyPath].map(
        (filePathInCycle) => toRel(projectRoot, filePathInCycle),
      );
      const cycleKey = cycle.join(" -> ");
      if (cycleKeys.has(cycleKey)) {
        continue;
      }
      cycleKeys.add(cycleKey);
      cycles.push(cycle);
    }

    stack.pop();
    active.delete(filePath);
  };

  for (const filePath of normalizedFilePaths) {
    if (cycles.length >= maxCycles) {
      break;
    }
    if (!seen.has(filePath)) {
      visit(filePath);
    }
  }

  return cycles;
};
