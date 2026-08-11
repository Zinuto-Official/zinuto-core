// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cssImportPattern =
  /@import\s+(?:url\()?["'](?<specifier>[^"']+)["']\)?\s*;/g;

export const readCssWithImports = (
  url: URL,
  seen = new Set<string>(),
): string => {
  const filePath = fileURLToPath(url);
  if (seen.has(filePath)) {
    return "";
  }
  seen.add(filePath);

  const source = readFileSync(filePath, "utf8");
  return source.replace(cssImportPattern, (statement, specifier: string) => {
    if (/^(?:[a-z]+:|\/)/iu.test(specifier)) {
      return statement;
    }
    return `${statement}\n${readCssWithImports(new URL(specifier, url), seen)}`;
  });
};
