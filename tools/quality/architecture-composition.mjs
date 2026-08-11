// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";

const MANIFEST_KIND = "zinuto-desktop-materialized-composition";
const MANIFEST_KEYS = [
  "backendEntryFiles",
  "frontendEntryFiles",
  "kind",
  "schemaVersion",
  "tauriBridgeFiles",
  "tauriCustomCommands",
];

const EMPTY_COMPOSITION = Object.freeze({
  backendEntryFiles: Object.freeze([]),
  frontendEntryFiles: Object.freeze([]),
  manifestPath: null,
  tauriBridgeFiles: Object.freeze([]),
  tauriCustomCommands: Object.freeze([]),
});

const assertSortedUniqueStrings = (value, fieldName) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Architecture composition ${fieldName} must be a string array.`,
    );
  }
  const normalized = value.map((item) => item.trim());
  if (normalized.some((item) => !item)) {
    throw new Error(
      `Architecture composition ${fieldName} cannot contain empty values.`,
    );
  }
  const sorted = [...new Set(normalized)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (JSON.stringify(normalized) !== JSON.stringify(sorted)) {
    throw new Error(
      `Architecture composition ${fieldName} must be sorted and contain no duplicates.`,
    );
  }
  return normalized;
};

const assertRepoFile = ({
  projectRoot,
  relPath,
  prefix,
  extensionPattern,
  fieldName,
}) => {
  if (
    path.isAbsolute(relPath) ||
    relPath.includes("\\") ||
    relPath.split("/").includes("..") ||
    !relPath.startsWith(prefix) ||
    !extensionPattern.test(relPath)
  ) {
    throw new Error(
      `Architecture composition ${fieldName} contains an invalid repository path: ${relPath}.`,
    );
  }
  const absolutePath = path.join(projectRoot, ...relPath.split("/"));
  if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(
      `Architecture composition ${fieldName} references a missing file: ${relPath}.`,
    );
  }
};

export const loadArchitectureComposition = ({ projectRoot, manifestPath }) => {
  if (!manifestPath) {
    return EMPTY_COMPOSITION;
  }
  const absoluteManifestPath = path.resolve(projectRoot, manifestPath);
  const manifestRelPath = path.relative(projectRoot, absoluteManifestPath);
  if (
    !manifestRelPath ||
    manifestRelPath === ".." ||
    manifestRelPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(manifestRelPath)
  ) {
    throw new Error(
      "Architecture composition manifest must stay inside the checked tree.",
    );
  }
  const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, "utf8"));
  const actualKeys = Object.keys(manifest).sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (JSON.stringify(actualKeys) !== JSON.stringify(MANIFEST_KEYS)) {
    throw new Error(
      `Architecture composition manifest keys must be exactly: ${MANIFEST_KEYS.join(", ")}.`,
    );
  }
  if (manifest.schemaVersion !== 1 || manifest.kind !== MANIFEST_KIND) {
    throw new Error(
      `Architecture composition manifest must declare schemaVersion 1 and kind ${MANIFEST_KIND}.`,
    );
  }

  const frontendEntryFiles = assertSortedUniqueStrings(
    manifest.frontendEntryFiles,
    "frontendEntryFiles",
  );
  const backendEntryFiles = assertSortedUniqueStrings(
    manifest.backendEntryFiles,
    "backendEntryFiles",
  );
  const tauriBridgeFiles = assertSortedUniqueStrings(
    manifest.tauriBridgeFiles,
    "tauriBridgeFiles",
  );
  const tauriCustomCommands = assertSortedUniqueStrings(
    manifest.tauriCustomCommands,
    "tauriCustomCommands",
  );

  frontendEntryFiles.forEach((relPath) =>
    assertRepoFile({
      projectRoot,
      relPath,
      prefix: "apps/desktop/web/src/",
      extensionPattern: /\.(?:ts|tsx)$/u,
      fieldName: "frontendEntryFiles",
    }),
  );
  backendEntryFiles.forEach((relPath) =>
    assertRepoFile({
      projectRoot,
      relPath,
      prefix: "apps/desktop/local-api/src/",
      extensionPattern: /\.ts$/u,
      fieldName: "backendEntryFiles",
    }),
  );
  tauriBridgeFiles.forEach((relPath) =>
    assertRepoFile({
      projectRoot,
      relPath,
      prefix: "apps/desktop/web/src/",
      extensionPattern: /\.(?:ts|tsx)$/u,
      fieldName: "tauriBridgeFiles",
    }),
  );
  if (
    tauriCustomCommands.some((command) => !/^[a-z][a-z0-9_]*$/u.test(command))
  ) {
    throw new Error(
      "Architecture composition tauriCustomCommands must use lowercase snake_case command names.",
    );
  }

  return Object.freeze({
    backendEntryFiles: Object.freeze(backendEntryFiles),
    frontendEntryFiles: Object.freeze(frontendEntryFiles),
    manifestPath: manifestRelPath.replaceAll(path.sep, "/"),
    tauriBridgeFiles: Object.freeze(tauriBridgeFiles),
    tauriCustomCommands: Object.freeze(tauriCustomCommands),
  });
};
