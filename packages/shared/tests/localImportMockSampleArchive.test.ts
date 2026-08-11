// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATH,
  LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATHS,
  LOCAL_IMPORT_MOCK_SAMPLE_FILE_NAME,
  LOCAL_IMPORT_MOCK_SAMPLE_FILES,
  LOCAL_IMPORT_MOCK_SAMPLE_ROWS,
  buildLocalImportMockSampleArchiveBytes,
  buildLocalImportMockSampleCsv,
} from "../dist/localImportMockSampleArchive.js";

test("local import mock sample archive is a downloadable zip with multiple 100-row CSV files", () => {
  const archiveBytes = buildLocalImportMockSampleArchiveBytes();
  const archiveText = new TextDecoder().decode(archiveBytes);
  const csv = buildLocalImportMockSampleCsv();

  assert.equal(
    LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_FILE_NAME,
    "zinuto-core-mock-market-data.zip",
  );
  assert.equal(LOCAL_IMPORT_MOCK_SAMPLE_FILE_NAME, "ZIZI.csv");
  assert.equal(archiveBytes[0], 0x50);
  assert.equal(archiveBytes[1], 0x4b);
  assert.equal(
    LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATH,
    "OPEN_TRADING_PRACTICE_MOCK_MARKET_DATA/ZIZI.csv",
  );
  assert.ok(LOCAL_IMPORT_MOCK_SAMPLE_FILES.length >= 2);
  assert.equal(LOCAL_IMPORT_MOCK_SAMPLE_ROWS.length, LOCAL_IMPORT_MOCK_SAMPLE_FILES[0]?.rows.length);
  assert.match(csv, /^datetime,open,high,low,close,volume\r\n/);
  assert.equal(csv.trim().split(/\r?\n/).length - 1, LOCAL_IMPORT_MOCK_SAMPLE_ROWS.length);
  assert.match(archiveText, /datetime,open,high,low,close,volume/);
  for (const file of LOCAL_IMPORT_MOCK_SAMPLE_FILES) {
    assert.ok(file.rows.length >= 100);
    assert.ok(
      archiveText.includes(
        `OPEN_TRADING_PRACTICE_MOCK_MARKET_DATA/${file.fileName}`,
      ),
    );
    assert.ok(archiveText.includes(file.rows[0]?.join(",") ?? ""));
  }
  assert.deepEqual(
    LOCAL_IMPORT_MOCK_SAMPLE_ARCHIVE_INNER_PATHS,
    LOCAL_IMPORT_MOCK_SAMPLE_FILES.map(
      (file) => `OPEN_TRADING_PRACTICE_MOCK_MARKET_DATA/${file.fileName}`,
    ),
  );
});
