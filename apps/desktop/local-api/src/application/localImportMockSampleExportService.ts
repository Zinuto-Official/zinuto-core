// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs/promises";
import path from "node:path";
import {
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
  buildLocalImportMockSampleArchiveBytes,
} from "@zinuto/shared/localImportMockSampleArchive";
import { appError } from "../kernel/appError.js";

export type LocalImportMockSampleExportResult = {
  outputPath: string;
  byteLength: number;
};

const ZIP_EXTENSION = ".zip";

const normalizeExportOutputPath = async (outputPathRaw: string): Promise<string> => {
  const trimmedPath = String(outputPathRaw || "").trim();
  if (!trimmedPath) {
    throw appError("LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_REQUIRED");
  }
  const absolutePath = path.resolve(trimmedPath);
  if (path.extname(absolutePath).toLowerCase() !== ZIP_EXTENSION) {
    throw appError("LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_EXTENSION_INVALID", {
      expected: LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
    });
  }
  const outputDir = path.dirname(absolutePath);
  await fs.mkdir(outputDir, { recursive: true });
  const canonicalOutputDir = await fs.realpath(outputDir);
  return path.join(canonicalOutputDir, path.basename(absolutePath));
};

export const exportLocalImportMockSampleArchive = async (input: {
  outputPath: string;
}): Promise<LocalImportMockSampleExportResult> => {
  const outputPath = await normalizeExportOutputPath(input.outputPath);
  const archiveBytes = buildLocalImportMockSampleArchiveBytes();
  try {
    await fs.writeFile(outputPath, Buffer.from(archiveBytes));
  } catch {
    throw appError("LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_FAILED", { outputPath });
  }
  return {
    outputPath,
    byteLength: archiveBytes.byteLength,
  };
};
