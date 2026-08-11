// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDroppedImportFolderPath,
  normalizeNativeImportDirectoryPath,
  normalizeNativeImportRelativePath,
  resolveNativeImportDirectoryName,
  startCsvFolderStagingWithAbort,
  waitForCsvFolderStagingWithAbort,
} from "../../src/domains/data-import/nativeImportHelpers.js";

test("native import paths preserve legal whitespace in folder and file names", () => {
  assert.equal(
    normalizeNativeImportDirectoryPath("/tmp/source folder /"),
    "/tmp/source folder ",
  );
  assert.equal(
    normalizeNativeImportRelativePath(" group /AAPL .csv "),
    " group /AAPL .csv ",
  );
  assert.equal(
    normalizeDroppedImportFolderPath("/tmp/source folder "),
    "/tmp/source folder ",
  );
  assert.equal(
    normalizeDroppedImportFolderPath("/tmp/source folder /AAPL.csv "),
    "/tmp/source folder ",
  );
});

test("native import directory normalization preserves filesystem roots", () => {
  assert.equal(normalizeNativeImportDirectoryPath("/"), "/");
  assert.equal(normalizeNativeImportDirectoryPath("C:\\"), "C:/");
});

test("native import paths preserve POSIX literal backslashes while normalizing Windows paths", () => {
  assert.equal(
    normalizeNativeImportDirectoryPath("/tmp/source\\folder"),
    "/tmp/source\\folder",
  );
  assert.equal(
    normalizeNativeImportRelativePath("group\\AAPL.csv"),
    "group\\AAPL.csv",
  );
  assert.equal(
    normalizeDroppedImportFolderPath("/tmp/source\\folder/AAPL.csv"),
    "/tmp/source\\folder",
  );
  assert.equal(
    normalizeNativeImportDirectoryPath("C:\\market\\daily\\"),
    "C:/market/daily",
  );
  assert.equal(
    normalizeNativeImportDirectoryPath("\\\\server\\share\\daily\\"),
    "//server/share/daily",
  );
  assert.equal(
    resolveNativeImportDirectoryName("/tmp/source\\folder"),
    "source\\folder",
  );
  assert.equal(
    resolveNativeImportDirectoryName("C:\\market\\daily\\"),
    "daily",
  );
});

test("aborted staging rejects immediately and discards its late native result once", async () => {
  let resolveNativeTask: ((value: string) => void) | undefined;
  const nativeTask = new Promise<string>((resolve) => {
    resolveNativeTask = resolve;
  });
  const abortController = new AbortController();
  const discardedResults: string[] = [];
  let nativeCancelCalls = 0;
  const staging = waitForCsvFolderStagingWithAbort(
    nativeTask,
    abortController.signal,
    async (result) => {
      discardedResults.push(result);
    },
    async () => {
      nativeCancelCalls += 1;
    },
  );
  abortController.abort(new DOMException("source window closed", "AbortError"));

  await assert.rejects(staging, { name: "AbortError" });
  assert.equal(nativeCancelCalls, 1);
  assert.deepEqual(discardedResults, []);

  resolveNativeTask?.("/tmp/zinuto-csv-upload/staged-1-2-3");
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(discardedResults, ["/tmp/zinuto-csv-upload/staged-1-2-3"]);
});

test("completed staging does not run abort cleanup after ownership transfers", async () => {
  const abortController = new AbortController();
  let cleanupCalls = 0;
  const result = await waitForCsvFolderStagingWithAbort(
    Promise.resolve("staged-result"),
    abortController.signal,
    () => {
      cleanupCalls += 1;
    },
  );
  abortController.abort();

  assert.equal(result, "staged-result");
  assert.equal(cleanupCalls, 0);
});

test("pre-aborted staging never starts the native copy", async () => {
  const abortController = new AbortController();
  abortController.abort(new DOMException("already closed", "AbortError"));
  let nativeStarts = 0;
  let nativeCancelCalls = 0;

  await assert.rejects(
    async () =>
      startCsvFolderStagingWithAbort(
        async () => {
          nativeStarts += 1;
          return "unexpected";
        },
        abortController.signal,
        () => undefined,
        () => {
          nativeCancelCalls += 1;
        },
      ),
    { name: "AbortError" },
  );
  assert.equal(nativeStarts, 0);
  assert.equal(nativeCancelCalls, 0);
});

test("native rejection after abort is consumed without cleanup", async () => {
  let rejectNativeTask: ((error: Error) => void) | undefined;
  const nativeTask = new Promise<string>((_resolve, reject) => {
    rejectNativeTask = reject;
  });
  const abortController = new AbortController();
  let cleanupCalls = 0;
  const staging = waitForCsvFolderStagingWithAbort(
    nativeTask,
    abortController.signal,
    () => {
      cleanupCalls += 1;
    },
  );
  abortController.abort(new DOMException("closed", "AbortError"));
  await assert.rejects(staging, { name: "AbortError" });

  rejectNativeTask?.(new Error("native copy failed after cancellation"));
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(cleanupCalls, 0);
});
