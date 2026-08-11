// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";

const SHARED_TYPOGRAPHY_LITERAL_FILE_PATTERN =
  /^apps\/desktop\/web\/src\/(?:ui\/primitives|ui\/components)\//;
const TAILWIND_LITERAL_TYPOGRAPHY_SIZE_PATTERN =
  /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[(?:\d|\.\d)[^\]]*\]/;
const SHARED_COMPONENT_FONT_FAMILY_LITERAL_PATTERN =
  /(?:font-family:\s*['"]|fontFamily:\s*['"]|family:\s*['"])/;
const SHARED_COMPONENT_FONT_SIZE_LITERAL_PATTERN =
  /font-size:\s*(?!var\(|calc\(|inherit|initial|unset)[^;\n]+/;
const CSS_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const CSS_FONT_SIZE_DECLARATION_PATTERN =
  /(^|[;{\n\r])(\s*)font-size\s*:\s*([^;{}]+)(?=[;{}])/gim;
const CSS_CUSTOM_PROPERTY_DECLARATION_PATTERN =
  /(^|[;{\n\r])(\s*)(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)(?=[;{}])/gim;
const CSS_LITERAL_OR_MATH_FONT_SIZE_PATTERN =
  /^(?:\d|\.\d)|^(?:calc|clamp|min|max)\(/i;
const DIRECT_TYPOGRAPHY_REFERENCE_PATTERN = /^var\(--ty-r[1-8]\)$/;
const LEGACY_HEADING_TYPOGRAPHY_TOKEN_PATTERN = /--ty-h\d+\b/;
const TS_FONT_SIZE_LITERAL_PATTERN =
  /\bfontSize\s*:\s*(?:(["'])[^"']*(?:px|rem|em)[^"']*\1|\d+(?:\.\d+)?)|\bfontSize\s*=\s*(?:(["'])[^"']*(?:px|rem|em)[^"']*\2|\{\s*\d+(?:\.\d+)?\s*\})/g;

const lineAtIndex = (sourceText, index) =>
  sourceText.slice(0, index).split(/\r?\n/u).length;

const compactCssValue = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const isOwnerCssOrExtractedLayer = (relPath, ownerPath) =>
  relPath === ownerPath ||
  (relPath.startsWith(ownerPath.replace(/\.css$/u, ".layer-")) &&
    /\.layer-\d+\.css$/u.test(relPath));

const maskCssComments = (sourceText) =>
  sourceText.replace(CSS_COMMENT_PATTERN, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );

const isAllowedTypographyFontSizeMath = (relPath, value) => {
  if (
    isOwnerCssOrExtractedLayer(
      relPath,
      "apps/desktop/web/src/styles/core/ui-global-consistency.css",
    ) &&
    value ===
      "calc(var(--i18n-text-fit-font-size) * var(--i18n-text-fit-scale))"
  ) {
    return true;
  }
  if (
    !isOwnerCssOrExtractedLayer(
      relPath,
      "apps/desktop/web/src/styles/components/desktop-secondary-windows.css",
    )
  ) {
    return false;
  }
  return /^clamp\(var\(--ty-r[12]\), min\(\d+cqw, \d+cqh\), var\(--ty-r[58]\)\)$/.test(
    value,
  );
};

const isTypographySizeCustomProperty = (propertyName) =>
  /^--[a-z0-9-]+-type-[a-z0-9-]+$/i.test(propertyName) ||
  /^--trainer-workspace-r[1-8]$/i.test(propertyName) ||
  /^--[a-z0-9-]+-font-size$/i.test(propertyName);

const isAllowedTypographyCustomPropertyValue = (relPath, propertyName, value) =>
  isOwnerCssOrExtractedLayer(
    relPath,
    "apps/desktop/web/src/styles/core/ui-global-consistency.css",
  ) &&
  propertyName === "--i18n-text-fit-font-size" &&
  value === "1em";

const createViolationCollector = ({ toRel }) => {
  const violations = [];
  const pushViolation = (filePath, message) => {
    violations.push({ filePath: toRel(filePath), message });
  };
  const pushTypographyViolation = (filePath, sourceText, index, message) => {
    pushViolation(
      filePath,
      `${message} (line ${lineAtIndex(sourceText, index)})`,
    );
  };

  return {
    violations,
    pushViolation,
    pushTypographyViolation,
  };
};

export const collectTypographyArchitectureViolations = ({
  frontendSrcRoot,
  collectFiles,
  toRel,
}) => {
  const { violations, pushViolation, pushTypographyViolation } =
    createViolationCollector({ toRel });
  const typographyGuardFiles = collectFiles(
    frontendSrcRoot,
    (filePath) =>
      filePath.endsWith(".ts") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".css"),
  );

  for (const filePath of typographyGuardFiles) {
    const relPath = toRel(filePath);
    const sourceText = fs.readFileSync(filePath, "utf8");

    if (sourceText.includes("@fontsource")) {
      pushViolation(
        filePath,
        "Typography must use the global system-font resolver. Remove @fontsource imports.",
      );
    }

    if (TAILWIND_LITERAL_TYPOGRAPHY_SIZE_PATTERN.test(sourceText)) {
      pushViolation(
        filePath,
        "Do not use Tailwind literal text sizes. Route text sizing through text-r1..text-r8.",
      );
    }

    if (LEGACY_HEADING_TYPOGRAPHY_TOKEN_PATTERN.test(sourceText)) {
      pushViolation(
        filePath,
        "Do not use legacy --ty-h* typography tokens. Route text sizing through --ty-r1..--ty-r8.",
      );
    }

    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      let fontSizeMatch = TS_FONT_SIZE_LITERAL_PATTERN.exec(sourceText);
      while (fontSizeMatch) {
        pushTypographyViolation(
          filePath,
          sourceText,
          fontSizeMatch.index,
          "Do not hardcode TS/TSX fontSize literals. Use var(--ty-r*) for DOM text or getGlobalTypographyReferencePx() for chart/canvas text.",
        );
        fontSizeMatch = TS_FONT_SIZE_LITERAL_PATTERN.exec(sourceText);
      }
    }

    if (filePath.endsWith(".css")) {
      const cssSource = maskCssComments(sourceText);

      let fontSizeDeclaration =
        CSS_FONT_SIZE_DECLARATION_PATTERN.exec(cssSource);
      while (fontSizeDeclaration) {
        const value = compactCssValue(fontSizeDeclaration[3]);
        const declarationIndex =
          fontSizeDeclaration.index +
          fontSizeDeclaration[1].length +
          fontSizeDeclaration[2].length;

        if (LEGACY_HEADING_TYPOGRAPHY_TOKEN_PATTERN.test(value)) {
          pushTypographyViolation(
            filePath,
            sourceText,
            declarationIndex,
            "Do not use legacy --ty-h* typography tokens in font-size declarations.",
          );
        }

        if (
          CSS_LITERAL_OR_MATH_FONT_SIZE_PATTERN.test(value) &&
          !isAllowedTypographyFontSizeMath(relPath, value)
        ) {
          pushTypographyViolation(
            filePath,
            sourceText,
            declarationIndex,
            `Do not hardcode CSS font-size "${value}". Use --ty-r1..--ty-r8 or semantic variables that map directly to them.`,
          );
        }

        fontSizeDeclaration = CSS_FONT_SIZE_DECLARATION_PATTERN.exec(cssSource);
      }

      let customPropertyDeclaration =
        CSS_CUSTOM_PROPERTY_DECLARATION_PATTERN.exec(cssSource);
      while (customPropertyDeclaration) {
        const propertyName = customPropertyDeclaration[3];
        const value = compactCssValue(customPropertyDeclaration[4]);
        const declarationIndex =
          customPropertyDeclaration.index +
          customPropertyDeclaration[1].length +
          customPropertyDeclaration[2].length;

        if (
          isTypographySizeCustomProperty(propertyName) &&
          !DIRECT_TYPOGRAPHY_REFERENCE_PATTERN.test(value) &&
          !isAllowedTypographyCustomPropertyValue(relPath, propertyName, value)
        ) {
          pushTypographyViolation(
            filePath,
            sourceText,
            declarationIndex,
            `Typography semantic property "${propertyName}" must map directly to var(--ty-r1)..var(--ty-r8), not "${value}".`,
          );
        }

        customPropertyDeclaration =
          CSS_CUSTOM_PROPERTY_DECLARATION_PATTERN.exec(cssSource);
      }
    }

    if (
      SHARED_TYPOGRAPHY_LITERAL_FILE_PATTERN.test(relPath) &&
      SHARED_COMPONENT_FONT_FAMILY_LITERAL_PATTERN.test(sourceText)
    ) {
      pushViolation(
        filePath,
        "Shared UI/component layers must not hardcode font-family literals. Use typography tokens instead.",
      );
    }

    if (
      filePath.endsWith(".css") &&
      SHARED_TYPOGRAPHY_LITERAL_FILE_PATTERN.test(relPath) &&
      SHARED_COMPONENT_FONT_SIZE_LITERAL_PATTERN.test(sourceText)
    ) {
      pushViolation(
        filePath,
        "Shared UI/component CSS must not hardcode font-size literals. Use typography tokens instead.",
      );
    }
  }

  return violations;
};
