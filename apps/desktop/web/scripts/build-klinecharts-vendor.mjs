// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(scriptDirectory, "..");
const vendorDirectory = path.join(webDirectory, "vendor/klinecharts");
const manifest = JSON.parse(
  fs.readFileSync(path.join(vendorDirectory, "manifest.json"), "utf8"),
);
const packageDirectory = path.resolve(
  webDirectory,
  "../../../node_modules/klinecharts",
);
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
);
const checkOnly = process.argv.includes("--check");
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const readAndVerify = (relativePath, expectedSha256) => {
  const bytes = fs.readFileSync(path.join(packageDirectory, relativePath));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `KLINECHARTS_VENDOR_INPUT_DIGEST_MISMATCH:${relativePath}:${actualSha256}`,
    );
  }
  return bytes;
};

if (packageManifest.version !== manifest.version) {
  throw new Error(`KLINECHARTS_VENDOR_VERSION_MISMATCH:${packageManifest.version}`);
}
const upstreamEsm = readAndVerify("dist/index.esm.js", manifest.inputs.esmSha256);
const upstreamTypes = readAndVerify(
  "dist/index.d.ts",
  manifest.inputs.typesSha256,
);
const upstreamLicense = readAndVerify("LICENSE", manifest.inputs.licenseSha256);
const upstreamNotice = readAndVerify("NOTICE", manifest.inputs.noticeSha256);
const upstreamText = upstreamEsm.toString("utf8");
const loggerSource = 'var DEV = process.env.NODE_ENV === "development";';
if (!upstreamText.includes(loggerSource)) {
  throw new Error("KLINECHARTS_VENDOR_LOGGER_PATCH_CONTEXT_MISSING");
}
if (!upstreamText.includes("this._chart.updatePane(UpdateLevel.Overlay);")) {
  throw new Error("KLINECHARTS_VENDOR_CROSSHAIR_REFRESH_MISSING");
}
const outputEsm = Buffer.from(
  upstreamText.replace(loggerSource, "var DEV = false;"),
  "utf8",
);
const upstreamTypesText = upstreamTypes.toString("utf8");
const paneOptionsSource = "state?: PaneState;\n}";
const axisOverrideSource = "export type XAxisOverride =";
if (
  !upstreamTypesText.includes(paneOptionsSource) ||
  !upstreamTypesText.includes(axisOverrideSource)
) {
  throw new Error("KLINECHARTS_VENDOR_TYPES_PATCH_CONTEXT_MISSING");
}
const outputTypes = Buffer.from(
  upstreamTypesText
    .replace(
      paneOptionsSource,
      "state?: PaneState;\n\t/** @deprecated Use overrideYAxis() for new integrations. */\n\taxis?: Partial<AxisCreate>;\n}",
    )
    .replace(
      axisOverrideSource,
      'export type AxisCreate = Omit<AxisTemplate, "displayValueToText" | "valueToRealValue" | "realValueToDisplayValue" | "displayValueToRealValue" | "realValueToValue">;\nexport type XAxisOverride =',
    ),
  "utf8",
);
if (sha256(outputEsm) !== manifest.outputs.esmSha256) {
  throw new Error("KLINECHARTS_VENDOR_OUTPUT_DIGEST_MISMATCH:index.esm.js");
}
if (sha256(outputTypes) !== manifest.outputs.typesSha256) {
  throw new Error("KLINECHARTS_VENDOR_OUTPUT_DIGEST_MISMATCH:index.d.ts");
}
const outputs = [
  ["index.esm.js", outputEsm],
  ["index.d.ts", outputTypes],
  ["LICENSE", upstreamLicense],
  ["NOTICE", upstreamNotice],
];
if (checkOnly) {
  for (const [fileName, expectedBytes] of outputs) {
    const actualBytes = fs.readFileSync(path.join(vendorDirectory, fileName));
    if (!actualBytes.equals(expectedBytes)) {
      throw new Error(`KLINECHARTS_VENDOR_DRIFT:${fileName}`);
    }
  }
  process.stdout.write("klinecharts vendor provenance and bytes verified\n");
  process.exit(0);
}
for (const [fileName, bytes] of outputs) {
  fs.writeFileSync(path.join(vendorDirectory, fileName), bytes);
}
process.stdout.write("klinecharts vendor bytes rebuilt and verified\n");
