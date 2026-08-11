// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATH,
} from "@zinuto/shared/localImportMockSampleArchive";
import { exportLocalImportMockSampleArchive } from "../../src/application/localImportMockSampleExportService.js";

test("local import mock sample export writes the fixed zip to the selected path", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-local-import-mock-export-"),
  );
  const requestedPath = path.join(tempDir, LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME);
  const canonicalPath = path.join(
    await fs.realpath(tempDir),
    LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
  );

  const result = await exportLocalImportMockSampleArchive({
    outputPath: requestedPath,
  });
  const written = await fs.readFile(result.outputPath);

  assert.equal(result.outputPath, canonicalPath);
  assert.equal(result.byteLength, written.byteLength);
  assert.equal(written[0], 0x50);
  assert.equal(written[1], 0x4b);
  assert.match(new TextDecoder().decode(written), new RegExp(LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATH));
});

test("local import mock sample export rejects an empty output path", async () => {
  await assert.rejects(
    () => exportLocalImportMockSampleArchive({ outputPath: "" }),
    /LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_REQUIRED/,
  );
});

test("local import mock sample export only writes zip files", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "zinuto-local-import-mock-export-invalid-"),
  );
  await assert.rejects(
    () =>
      exportLocalImportMockSampleArchive({
        outputPath: path.join(tempDir, "zinuto-mock-market-data.txt"),
      }),
    /LOCAL_IMPORT_MOCK_SAMPLE_EXPORT_PATH_EXTENSION_INVALID/,
  );
});
