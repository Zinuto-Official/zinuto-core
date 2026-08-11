// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(
  scriptDirectory,
  "../src/assets/fonts/stats-pdf",
);
const fixtures = [
  { language: "en", text: "Training report 2026-08-09", font: null },
  { language: "es", text: "Informe de entrenamiento 2026-08-09", font: null },
  {
    language: "zh-CN",
    text: "训练统计 报告日期 2026-08-09",
    font: "NotoSansSC-Stats.ttf",
  },
  {
    language: "ja",
    text: "トレーニング統計 レポート 2026-08-09",
    font: "NotoSansJP-Stats.ttf",
  },
  {
    language: "ko",
    text: "훈련 통계 보고서 2026-08-09",
    font: "NotoSansKR-Stats.ttf",
  },
];
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "zinuto-stats-pdf-verify-"),
);
try {
  for (const fixture of fixtures) {
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: false });
    if (fixture.font) {
      const fontBase64 = fs
        .readFileSync(path.join(fontDirectory, fixture.font))
        .toString("base64");
      doc.addFileToVFS("NotoSansStats.ttf", fontBase64);
      doc.addFont(
        "NotoSansStats.ttf",
        "NotoSansStats",
        "normal",
        undefined,
        "Identity-H",
      );
      doc.setFont("NotoSansStats", "normal");
    }
    doc.text(fixture.text, 40, 60);
    const pdfPath = path.join(temporaryDirectory, `${fixture.language}.pdf`);
    fs.writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
    const extracted = execFileSync("pdftotext", [pdfPath, "-"], {
      encoding: "utf8",
    });
    assert.match(extracted, new RegExp(fixture.text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    const pngPrefix = path.join(temporaryDirectory, fixture.language);
    execFileSync(
      "pdftoppm",
      ["-f", "1", "-singlefile", "-png", "-r", "96", pdfPath, pngPrefix],
      { stdio: "ignore" },
    );
    const png = fs.readFileSync(`${pngPrefix}.png`);
    assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(png.length > 4_000);
  }
  process.stdout.write("five-locale stats PDF extract and render verification passed\n");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
