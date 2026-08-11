// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportFieldMappingProfile,
  inferImportTimeZoneRuleEvidence,
} from "../dist/importRules.js";

const inferEvidence = (folderPath: string) =>
  inferImportTimeZoneRuleEvidence({
    folderName: folderPath.split("/").at(-1) ?? folderPath,
    folderPath,
    files: [
      {
        originalname: "123ABC_1d.csv",
        relativePath: "123ABC_1d.csv",
        symbol: "123ABC",
      },
    ],
    timestampSamples: ["2024-01-01"],
    systemTimeZone: "Asia/Shanghai",
  });

test("import time zone keyword rules ignore random embedded short tokens", () => {
  const evidence = inferEvidence("/tmp/zinuto-folder-preview-low-tz-abcutcxyz");

  assert.deepEqual(
    evidence.map((item) => item.code),
    ["SYSTEM_TIME_ZONE"],
  );
});

test("import time zone keyword rules require boundaries for short abbreviations", () => {
  const evidence = inferEvidence("/tmp/zinuto-folder-preview-test-data");

  assert.deepEqual(
    evidence.map((item) => item.code),
    ["SYSTEM_TIME_ZONE"],
  );
});

test("import time zone keyword rules still match explicit path words", () => {
  const utcEvidence = inferEvidence("/tmp/zinuto-folder-preview/utc/data");
  const usEvidence = inferEvidence("/tmp/zinuto-folder-preview/us-stock");

  assert.ok(
    utcEvidence.some(
      (item) => item.code === "PATH_KEYWORD" && item.timeZone === "Etc/UTC",
    ),
  );
  assert.ok(
    usEvidence.some(
      (item) =>
        item.code === "PATH_KEYWORD" && item.timeZone === "America/New_York",
    ),
  );
});

test("China index acquisition symbols use the Shanghai market rule independently of the host time zone", () => {
  const evidence = inferImportTimeZoneRuleEvidence({
    folderName: "market-data",
    folderPath: "/tmp/market-data",
    files: [
      {
        originalname: "INDEX-000001.csv",
        relativePath: "INDEX-000001.csv",
        symbol: "INDEX-000001",
      },
    ],
    timestampSamples: ["2026-07-18T15:00:00+08:00"],
    systemTimeZone: "Etc/UTC",
  });

  assert.ok(
    evidence.some(
      (item) =>
        item.code === "MARKET_SYMBOL_STRONG" && item.timeZone === "Asia/Shanghai",
    ),
  );
});

test("China index namespace matching is exact and keeps existing market rules isolated", () => {
  const marketEvidence = (symbol: string) => inferImportTimeZoneRuleEvidence({
    folderName: "market-data",
    folderPath: "/tmp/market-data",
    files: [{ originalname: `${symbol}.csv`, relativePath: `${symbol}.csv`, symbol }],
    timestampSamples: [],
    systemTimeZone: "Etc/UTC",
  }).filter((item) => item.code === "MARKET_SYMBOL_STRONG");

  for (const symbol of [
    "INDEX-000001",
    "INDEX_399006",
    "INDEX.899050",
    "INDEX000300",
    "SH600000",
    "600000.SH",
    "SZSE-000001",
  ]) {
    assert.ok(
      marketEvidence(symbol).some((item) => item.timeZone === "Asia/Shanghai"),
      symbol,
    );
  }

  for (const symbol of [
    "INDEX-00001",
    "INDEX-0000001",
    "INDEX/000001",
    "MYINDEX-000001",
    "INDEX-SPX",
    "INDEX-ABC123",
  ]) {
    assert.equal(
      marketEvidence(symbol).some((item) => item.timeZone === "Asia/Shanghai"),
      false,
      symbol,
    );
  }
  assert.ok(
    marketEvidence("SPX.US").some((item) => item.timeZone === "America/New_York"),
  );
});

test("complete exchange timestamps do not borrow a fuzzy close-time column", () => {
  const profile = buildImportFieldMappingProfile([
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
  ]);

  assert.equal(profile.mapping.timestampMode, "SINGLE");
  assert.equal(profile.mapping.date, "open_time");
  assert.equal(profile.mapping.time, "");
});
