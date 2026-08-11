// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, "../../../..");
const outputDirectory = path.resolve(
  scriptDirectory,
  "../src/assets/fonts/stats-pdf",
);
const manifestPath = path.join(outputDirectory, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const checkOnly = process.argv.includes("--check");
const deterministicToolEnvironment = {
  ...process.env,
  SOURCE_DATE_EPOCH: String(manifest.toolchain.sourceDateEpoch),
};

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const verifyFile = (filePath, expectedSha256) => {
  const actualSha256 = sha256(fs.readFileSync(filePath));
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `STATS_PDF_FONT_DIGEST_MISMATCH:${path.basename(filePath)}:${actualSha256}`,
    );
  }
};

const verifyOutputs = () => {
  for (const font of manifest.fonts) {
    verifyFile(path.join(outputDirectory, font.outputFile), font.outputSha256);
  }
  verifyFile(
    path.join(outputDirectory, manifest.license.outputFile),
    manifest.license.sha256,
  );
};

if (checkOnly) {
  verifyOutputs();
  process.stdout.write("stats PDF font assets verified\n");
  process.exit(0);
}

const fontToolsVersion = execFileSync(
  "python3",
  ["-c", "import fontTools; print(fontTools.__version__)"],
  { encoding: "utf8" },
).trim();
if (fontToolsVersion !== manifest.toolchain.fontTools) {
  throw new Error(
    `STATS_PDF_FONT_TOOLCHAIN_MISMATCH:${fontToolsVersion}`,
  );
}

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "zinuto-stats-pdf-fonts-"),
);
try {
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const font of manifest.fonts) {
    const response = await fetch(font.sourceUrl, { redirect: "error" });
    if (!response.ok) {
      throw new Error(`STATS_PDF_FONT_DOWNLOAD_FAILED:${response.status}`);
    }
    const sourceBytes = Buffer.from(await response.arrayBuffer());
    if (sha256(sourceBytes) !== font.sourceSha256) {
      throw new Error(`STATS_PDF_FONT_SOURCE_DIGEST_MISMATCH:${font.locale}`);
    }
    const sourcePath = path.join(temporaryDirectory, font.sourceFile);
    const staticPath = path.join(temporaryDirectory, font.staticFile);
    const textPath = path.join(temporaryDirectory, `${font.locale}.txt`);
    fs.writeFileSync(sourcePath, sourceBytes);
    const messageSource = fs.readFileSync(
      path.join(
        repositoryDirectory,
        `packages/shared/src/i18n.generated.${font.messageLocale}.ts`,
      ),
      "utf8",
    );
    const characters = Array.from(
      new Set(
        `${messageSource} 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:;!?+-=%()[]{}<>/\\|_@#&*~·—–…年月日时分秒`,
      ),
    )
      .sort()
      .join("");
    fs.writeFileSync(textPath, characters, "utf8");
    execFileSync(
      "fonttools",
      [
        "varLib.instancer",
        sourcePath,
        "wght=400",
        "--output",
        staticPath,
      ],
      { env: deterministicToolEnvironment, stdio: "ignore" },
    );
    execFileSync(
      "pyftsubset",
      [
        staticPath,
        `--output-file=${path.join(outputDirectory, font.outputFile)}`,
        `--text-file=${textPath}`,
        "--layout-features=*",
        "--glyph-names",
        "--symbol-cmap",
        "--legacy-cmap",
        "--notdef-glyph",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
        "--no-recalc-timestamp",
      ],
      { env: deterministicToolEnvironment, stdio: "ignore" },
    );
  }
  const licenseResponse = await fetch(manifest.license.sourceUrl, {
    redirect: "error",
  });
  if (!licenseResponse.ok) {
    throw new Error(
      `STATS_PDF_FONT_LICENSE_DOWNLOAD_FAILED:${licenseResponse.status}`,
    );
  }
  const licenseBytes = Buffer.from(await licenseResponse.arrayBuffer());
  if (sha256(licenseBytes) !== manifest.license.sha256) {
    throw new Error("STATS_PDF_FONT_LICENSE_DIGEST_MISMATCH");
  }
  fs.writeFileSync(
    path.join(outputDirectory, manifest.license.outputFile),
    licenseBytes,
  );
  verifyOutputs();
  process.stdout.write("stats PDF font assets rebuilt and verified\n");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
