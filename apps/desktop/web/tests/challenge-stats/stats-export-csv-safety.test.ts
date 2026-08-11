// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { encodeCsvCell } from "../../src/workspaces/challenge-stats/statsCsvEncoding";

test("CSV text cells cannot start spreadsheet formulas", () => {
  for (const input of [
    "=HYPERLINK(\"https://invalid.example\")",
    "+1+1",
    "-1+1",
    "@SUM(A1:A2)",
    "  =cmd",
    "\t@cmd",
    "\r\n+cmd",
  ]) {
    const encoded = encodeCsvCell(input);
    assert.equal(encoded.startsWith("\"'"), true, input);
  }
});

test("CSV numbers and ordinary text retain their value while quotes and lines are escaped", () => {
  assert.equal(encodeCsvCell(-42.5), '"-42.5"');
  assert.equal(encodeCsvCell("ordinary - text"), '"ordinary - text"');
  assert.equal(encodeCsvCell('a,"b"\r\n中文'), '"a,""b""\r\n中文"');
});
