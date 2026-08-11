#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  IMPORT_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
} from "@zinuto/shared/input-limits";

const root = process.cwd();
const failures = [];

const nativeBridgeContract = JSON.parse(
  readFileSync(
    join(root, "contracts/native-bridge/native-bridge.v1.json"),
    "utf8",
  ),
);

const requirePositiveInteger = (label, value) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    failures.push(`${label} must be a positive safe integer.`);
  }
};

const requireEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} must be ${expected}; received ${String(actual)}.`);
  }
};

for (const [name, value] of Object.entries({
  "INPUT_ARRAY_LIMITS.importColumns": INPUT_ARRAY_LIMITS.importColumns,
  "IMPORT_LIMITS.maxFiles": IMPORT_LIMITS.maxFiles,
  "IMPORT_LIMITS.maxSingleFileBytes": IMPORT_LIMITS.maxSingleFileBytes,
  "IMPORT_LIMITS.maxTotalBytes": IMPORT_LIMITS.maxTotalBytes,
  "IMPORT_LIMITS.maxFullJsonPreviewBytes":
    IMPORT_LIMITS.maxFullJsonPreviewBytes,
  "IMPORT_LIMITS.maxInMemoryTabularFileBytes":
    IMPORT_LIMITS.maxInMemoryTabularFileBytes,
  "IMPORT_LIMITS.maxDepth": IMPORT_LIMITS.maxDepth,
})) {
  requirePositiveInteger(name, value);
}

const nativeImportLimits = nativeBridgeContract?.limits?.import ?? {};
const nativeStageCommand = nativeBridgeContract?.commands?.find(
  (command) => command?.name === "stage_csv_folder_for_import",
);
const nativeStageConstraints = nativeStageCommand?.constraints ?? {};
const nativeSupportedFiles = nativeStageConstraints.supportedFiles ?? {};

const sharedToNativeContract = [
  ["limits.import.maxFiles", nativeImportLimits.maxFiles, IMPORT_LIMITS.maxFiles],
  [
    "limits.import.maxSingleFileBytes",
    nativeImportLimits.maxSingleFileBytes,
    IMPORT_LIMITS.maxSingleFileBytes,
  ],
  [
    "limits.import.maxTotalBytes",
    nativeImportLimits.maxTotalBytes,
    IMPORT_LIMITS.maxTotalBytes,
  ],
  ["limits.import.maxDepth", nativeImportLimits.maxDepth, IMPORT_LIMITS.maxDepth],
  [
    "limits.import.maxPathChars",
    nativeImportLimits.maxPathChars,
    INPUT_LIMITS.pathChars,
  ],
  [
    "limits.import.maxRelativePathChars",
    nativeImportLimits.maxRelativePathChars,
    INPUT_LIMITS.relativePathChars,
  ],
  [
    "limits.import.maxFileNameChars",
    nativeImportLimits.maxFileNameChars,
    INPUT_LIMITS.fileNameChars,
  ],
  [
    "limits.import.maxSecurityBookmarkChars",
    nativeImportLimits.maxSecurityBookmarkChars,
    INPUT_LIMITS.bookmarkChars,
  ],
  [
    "stage_csv_folder_for_import.relativePaths.maxItems",
    nativeStageConstraints.relativePaths?.maxItems,
    IMPORT_LIMITS.maxFiles,
  ],
  [
    "stage_csv_folder_for_import.relativePaths.itemMaxLength",
    nativeStageConstraints.relativePaths?.itemMaxLength,
    INPUT_LIMITS.relativePathChars,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.maxItems",
    nativeSupportedFiles.maxItems,
    IMPORT_LIMITS.maxFiles,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.maxSingleFileBytes",
    nativeSupportedFiles.maxSingleFileBytes,
    IMPORT_LIMITS.maxSingleFileBytes,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.maxTotalBytes",
    nativeSupportedFiles.maxTotalBytes,
    IMPORT_LIMITS.maxTotalBytes,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.maxDepth",
    nativeSupportedFiles.maxDepth,
    IMPORT_LIMITS.maxDepth,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.fileNameMaxLength",
    nativeSupportedFiles.fileNameMaxLength,
    INPUT_LIMITS.fileNameChars,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.relativePathMaxLength",
    nativeSupportedFiles.relativePathMaxLength,
    INPUT_LIMITS.relativePathChars,
  ],
  [
    "stage_csv_folder_for_import.supportedFiles.absolutePathMaxLength",
    nativeSupportedFiles.absolutePathMaxLength,
    INPUT_LIMITS.pathChars,
  ],
];

for (const [path, actual, expected] of sharedToNativeContract) {
  requireEqual(`contracts/native-bridge/native-bridge.v1.json ${path}`, actual, expected);
}

if (failures.length > 0) {
  console.error("Input limit contract check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Input limit contract passed (${sharedToNativeContract.length} native bridge mappings).`,
);
