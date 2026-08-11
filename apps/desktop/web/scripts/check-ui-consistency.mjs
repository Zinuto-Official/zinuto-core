// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(projectRoot, "src");
const stylesRoot = path.join(sourceRoot, "styles");
const uiRoot = path.join(sourceRoot, "ui", "primitives");
const sanctionedBusinessRoot = path.join(sourceRoot, "ui", "components");

const SCRIPT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cjs",
]);
const STYLE_EXTENSIONS = new Set([".css"]);

const LEGACY_CLASS_TOKENS = new Set(["btn", "seg-btn", "modal-card"]);
const LEGACY_FIELD_CLASS_TOKENS = new Set([
  "input",
  "select",
  "compact-input",
  "compact-select",
  "file-input",
  "seg-switch",
  "icon-btn",
]);
const FORBIDDEN_MODAL_CLASS_TOKENS = new Set([
  "settings-modal",
  "compact-modal",
  "summary-modal",
  "modal-title",
  "modal-desc",
  "modal-actions",
  "modal-actions-between",
  "modal-actions-group",
]);
const LAYOUT_CLASS_TOKENS = new Set([
  "workspace-page-shell",
  "page-toolbar",
  "page-summary-grid",
  "page-main-layout",
  "page-section-group",
]);
const WORKSPACE_PAGE_CLASS_TOKENS = new Set(["workspace-page", "workspace-page-body"]);
const INTERACTIVE_COMPONENTS = new Set([
  "Button",
  "Checkbox",
  "Input",
  "MultiSelect",
  "RadioGroup",
  "RadioItem",
  "Slider",
  "Textarea",
  "SelectField",
  "DatePicker",
  "SegmentedControl",
  "Switch",
]);
const GEOMETRY_PREFIXES = [
  "rounded-",
  "h-",
  "min-h-",
  "px-",
  "py-",
  "border-",
  "bg-",
];

const CSS_SELECTOR_FORBIDDEN_CLASS_TOKENS = new Set([
  ...LEGACY_CLASS_TOKENS,
  ...LEGACY_FIELD_CLASS_TOKENS,
  ...FORBIDDEN_MODAL_CLASS_TOKENS,
]);
const TEXT_STYLE_SCOPE_FILES = new Set([
  "src/styles/components/ui-system-business.css",
  "src/styles/components/summary-modal.css",
  "src/styles/components/desktop-secondary-windows.css",
  "src/styles/secondary-window.css",
]);
const TEXT_STYLE_SCOPE_PREFIXES = ["src/styles/core/"];
const TEXT_STYLE_SCOPE_PATTERNS = [/^src\/styles\/popup-[^/]+\.css$/];
const PAGE_STYLE_SCOPE_PREFIXES = [
  "src/styles/pages/",
  "src/styles/layout/workspace-overrides/",
];
const NUMERIC_FONT_SIZE_VALUE_RE =
  /(^|[\s(,+-])(?:\d+|\d*\.\d+)(?:px|rem|em|pt|%)\b/i;
const NEGATIVE_NUMERIC_VALUE_RE = /(^|[\s(,(])-\s*(?:\d+|\d*\.\d+)/;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CLASSNAME_LITERAL_RE =
  /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\})/g;
const RAW_CONTROL_RE = /<(button|input|select|textarea|option|optgroup)\b/g;
const SELECT_FIELD_TAG_RE =
  /<SelectField\b([\s\S]*?)(?:\/>|>([\s\S]*?)<\/SelectField>)/g;
const COMPONENT_WITH_CLASS_RE =
  /<(Button|Checkbox|Input|MultiSelect|RadioGroup|RadioItem|Slider|Textarea|SelectField|DatePicker|SegmentedControl|Switch)\b[\s\S]*?className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\})/g;
const INPUT_CHOICE_OR_RANGE_RE =
  /<Input\b[^>]*\btype\s*=\s*(?:"(checkbox|radio|range)"|'(checkbox|radio|range)')[^>]*>/g;
const PAGE_CONTAINER_TAG_RE = /<PageContainer\b[\s\S]*?>/g;
const DIALOG_CONTENT_TAG_RE = /<DialogContent\b[\s\S]*?>/g;
const DIALOG_CONTENT_CLASSNAME_TAG_RE =
  /<DialogContent\b(?=[\s\S]*?\bclassName\s*=)[\s\S]*?>/g;
const FORBIDDEN_CSS_SELECTOR_RE = new RegExp(
  String.raw`\.(${[...CSS_SELECTOR_FORBIDDEN_CLASS_TOKENS].map(escapeRegExp).join("|")})(?=$|[^A-Za-z0-9_-])`,
  "g",
);
const FONT_SIZE_DECL_RE =
  /(^|[;{\n\r])(\s*)font-size\s*:\s*([^;{}]+)(?=[;{}])/gim;
const LETTER_SPACING_DECL_RE =
  /(^|[;{\n\r])(\s*)letter-spacing\s*:\s*([^;{}]+)(?=[;{}])/gim;
const LEGACY_LIGHT_TOKEN_RE = /--ui-light-[a-z0-9-]+/g;
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const SELECT_FIELD_ON_CHANGE_RE = /\bonChange\s*=/;
const SELECT_FIELD_LEGACY_OPTION_RE = /<(option|optgroup)\b/;
const BUTTON_VARIANTS_CALL_RE = /\bbuttonVariants\s*\(/g;
const WINDOW_RESIZE_DISPATCH_RE =
  /window\.dispatchEvent\(\s*new Event\(\s*(["'])resize\1\s*\)\s*\)/g;
const CSS_RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
const SELECT_DATA_SLOT_SELECTOR_RE =
  /\[data-slot\s*=\s*(["'])select-(?:trigger|content|item)\1\]/;
const SELECT_CONTROL_STATE_SELECTOR_RE =
  /:(?:hover|focus|focus-visible|active|disabled)\b|\[data-state\s*=|\[aria-disabled\s*=|\[disabled\s*\]/;
const SELECT_CONTROL_GEOMETRY_DECL_RE =
  /(?:^|;)\s*(?:height|min-height|max-height|padding(?:-[a-z]+)?|border(?:-[a-z]+)?|border-radius|box-shadow|outline|background|color|font(?:-[a-z]+)?|letter-spacing|line-height|transition|opacity|filter|cursor|pointer-events)\s*:/i;
const DIALOG_CONTENT_CLASSNAME_ALLOWLIST = new Set([
  "src/ui/components/AppModal.tsx",
  "src/workspaces/trainer/TrainerStartPointDrawer.tsx",
  "src/ui/components/NoteEditorModal.tsx",
]);

const isPageLikeFeatureFile = (filePath) => {
  const relative = toRelative(filePath);
  if (
    !relative.startsWith("apps/desktop/web/src/workspaces/") &&
    !relative.startsWith("apps/desktop/web/src/domains/") &&
    !relative.startsWith("apps/desktop/web/src/app-shell/")
  ) {
    return false;
  }
  return /(Page|PageView|Dashboard)\.(ts|tsx|js|jsx)$/.test(path.basename(filePath));
};

const walkFiles = (dirPath, extensions = SCRIPT_EXTENSIONS) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, extensions));
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
};

const toRelative = (filePath) =>
  path.relative(projectRoot, filePath).replaceAll(path.sep, "/");

const lineAt = (source, index) => source.slice(0, index).split(/\r?\n/).length;

const normalizeClassLiteral = (raw) =>
  String(raw ?? "")
    .replace(/\$\{[\s\S]*?\}/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const isTextStyleScopeFile = (filePath) => {
  const relative = toRelative(filePath);
  return (
    TEXT_STYLE_SCOPE_FILES.has(relative) ||
    TEXT_STYLE_SCOPE_PREFIXES.some((prefix) => relative.startsWith(prefix)) ||
    TEXT_STYLE_SCOPE_PATTERNS.some((pattern) => pattern.test(relative))
  );
};

const isPageStyleScopeFile = (filePath) => {
  const relative = toRelative(filePath);
  return PAGE_STYLE_SCOPE_PREFIXES.some((prefix) => relative.startsWith(prefix));
};

const cssDeclarationLineIndex = (match) => match.index + match[1].length + match[2].length;

const compactCssValue = (value) => value.trim().replace(/\s+/g, " ");

const maskCssComments = (source) =>
  source.replace(CSS_COMMENT_RE, (comment) => comment.replace(/[^\r\n]/g, " "));

const sourceFiles = walkFiles(sourceRoot);
const violations = [];

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const relativePath = toRelative(filePath);

  let classNameMatch = CLASSNAME_LITERAL_RE.exec(source);
  while (classNameMatch) {
    const tokens = normalizeClassLiteral(
      classNameMatch[1] ?? classNameMatch[2] ?? classNameMatch[3],
    );
    const legacyToken = tokens.find((token) => LEGACY_CLASS_TOKENS.has(token));
    if (legacyToken) {
      violations.push({
        file: relativePath,
        line: lineAt(source, classNameMatch.index),
        message: `legacy class token "${legacyToken}" is forbidden.`,
      });
    }
    const legacyFieldToken = tokens.find((token) =>
      LEGACY_FIELD_CLASS_TOKENS.has(token),
    );
    if (legacyFieldToken) {
      violations.push({
        file: relativePath,
        line: lineAt(source, classNameMatch.index),
        message: `legacy field/control class token "${legacyFieldToken}" is forbidden; use primitive props such as density, size and variant.`,
      });
    }
    const forbiddenModalToken = tokens.find((token) =>
      FORBIDDEN_MODAL_CLASS_TOKENS.has(token),
    );
    if (forbiddenModalToken) {
      violations.push({
        file: relativePath,
        line: lineAt(source, classNameMatch.index),
        message: `modal shell token "${forbiddenModalToken}" is forbidden; use shared modal presets and StandardModalFrame instead.`,
      });
    }
    if (!filePath.startsWith(sanctionedBusinessRoot)) {
      const layoutToken = tokens.find((token) => LAYOUT_CLASS_TOKENS.has(token));
      if (layoutToken) {
        violations.push({
          file: relativePath,
          line: lineAt(source, classNameMatch.index),
          message: `layout class token "${layoutToken}" must be introduced via formal layout components, not page-level freehand markup.`,
        });
      }
    }
    if (isPageLikeFeatureFile(filePath)) {
      const workspacePageToken = tokens.find((token) =>
        WORKSPACE_PAGE_CLASS_TOKENS.has(token),
      );
      if (workspacePageToken) {
        violations.push({
          file: relativePath,
          line: lineAt(source, classNameMatch.index),
          message: `page-level class token "${workspacePageToken}" must come from formal page shell components, not freehand page markup.`,
        });
      }
    }
    classNameMatch = CLASSNAME_LITERAL_RE.exec(source);
  }

  if (!filePath.startsWith(sanctionedBusinessRoot)) {
    let pageContainerMatch = PAGE_CONTAINER_TAG_RE.exec(source);
    while (pageContainerMatch) {
      if (!pageContainerMatch[0].includes("template=")) {
        violations.push({
          file: relativePath,
          line: lineAt(source, pageContainerMatch.index),
          message: "PageContainer must declare a formal template.",
        });
      }
      pageContainerMatch = PAGE_CONTAINER_TAG_RE.exec(source);
    }

    let dialogContentMatch = DIALOG_CONTENT_TAG_RE.exec(source);
    while (dialogContentMatch) {
      const tagSource = dialogContentMatch[0];
      if (
        tagSource.includes("layout=\"sheet-right\"") &&
        !tagSource.includes("ui-standard-sheet-content")
      ) {
        violations.push({
          file: relativePath,
          line: lineAt(source, dialogContentMatch.index),
          message:
            'sheet-right dialogs must opt into the sanctioned "ui-standard-sheet-content" shell.',
        });
      }
      dialogContentMatch = DIALOG_CONTENT_TAG_RE.exec(source);
    }

    if (!DIALOG_CONTENT_CLASSNAME_ALLOWLIST.has(relativePath)) {
      let dialogContentClassNameMatch =
        DIALOG_CONTENT_CLASSNAME_TAG_RE.exec(source);
      while (dialogContentClassNameMatch) {
        violations.push({
          file: relativePath,
          line: lineAt(source, dialogContentClassNameMatch.index),
          message:
            "feature/page DialogContent className is forbidden; use AppModal + StandardModalFrame or a sanctioned sheet host.",
        });
        dialogContentClassNameMatch =
          DIALOG_CONTENT_CLASSNAME_TAG_RE.exec(source);
      }
    }
  }

  let windowResizeDispatchMatch = WINDOW_RESIZE_DISPATCH_RE.exec(source);
  while (windowResizeDispatchMatch) {
    violations.push({
      file: relativePath,
      line: lineAt(source, windowResizeDispatchMatch.index),
      message:
        'dispatching a synthetic window "resize" event is forbidden; use element ResizeObserver or a scoped resize channel.',
    });
    windowResizeDispatchMatch = WINDOW_RESIZE_DISPATCH_RE.exec(source);
  }

  if (!filePath.startsWith(uiRoot)) {
    let rawControlMatch = RAW_CONTROL_RE.exec(source);
    while (rawControlMatch) {
      violations.push({
        file: relativePath,
        line: lineAt(source, rawControlMatch.index),
        message: `raw <${rawControlMatch[1]}> is forbidden outside ui/primitives.`,
      });
      rawControlMatch = RAW_CONTROL_RE.exec(source);
    }
  } else {
    let rawControlMatch = RAW_CONTROL_RE.exec(source);
    while (rawControlMatch) {
      if (
        rawControlMatch[1] === "select" ||
        rawControlMatch[1] === "option" ||
        rawControlMatch[1] === "optgroup"
      ) {
        violations.push({
          file: relativePath,
          line: lineAt(source, rawControlMatch.index),
          message:
            `raw <${rawControlMatch[1]}> is forbidden in ui/primitives; SelectField must use the Radix Select primitive.`,
        });
      }
      rawControlMatch = RAW_CONTROL_RE.exec(source);
    }
  }

  let selectFieldMatch = SELECT_FIELD_TAG_RE.exec(source);
  while (selectFieldMatch) {
    const attrs = selectFieldMatch[1] ?? "";
    const children = selectFieldMatch[2] ?? "";
    if (SELECT_FIELD_ON_CHANGE_RE.test(attrs)) {
      violations.push({
        file: relativePath,
        line: lineAt(source, selectFieldMatch.index),
        message:
          "SelectField no longer accepts onChange; use onValueChange with options instead.",
      });
    }
    if (SELECT_FIELD_LEGACY_OPTION_RE.test(children)) {
      violations.push({
        file: relativePath,
        line: lineAt(source, selectFieldMatch.index),
        message:
          "SelectField no longer accepts <option>/<optgroup> children; pass options/groups props instead.",
      });
    }
    selectFieldMatch = SELECT_FIELD_TAG_RE.exec(source);
  }

  if (!filePath.startsWith(uiRoot) && !filePath.startsWith(sanctionedBusinessRoot)) {
    let buttonVariantsMatch = BUTTON_VARIANTS_CALL_RE.exec(source);
    while (buttonVariantsMatch) {
      violations.push({
        file: relativePath,
        line: lineAt(source, buttonVariantsMatch.index),
        message:
          "buttonVariants is a primitive implementation detail; use <Button> or a sanctioned business component.",
      });
      buttonVariantsMatch = BUTTON_VARIANTS_CALL_RE.exec(source);
    }
  }

  if (!filePath.startsWith(uiRoot)) {
    let inputChoiceOrRangeMatch = INPUT_CHOICE_OR_RANGE_RE.exec(source);
    while (inputChoiceOrRangeMatch) {
      const inputType = inputChoiceOrRangeMatch[1] ?? inputChoiceOrRangeMatch[2];
      const componentName =
        inputType === "range"
          ? "Slider"
          : inputType === "radio"
            ? "RadioGroup / RadioItem"
            : "Checkbox";
      violations.push({
        file: relativePath,
        line: lineAt(source, inputChoiceOrRangeMatch.index),
        message: `<Input type="${inputType}"> is forbidden; use ${componentName} instead.`,
      });
      inputChoiceOrRangeMatch = INPUT_CHOICE_OR_RANGE_RE.exec(source);
    }
  }

  if (!filePath.startsWith(uiRoot) && !filePath.startsWith(sanctionedBusinessRoot)) {
    let componentMatch = COMPONENT_WITH_CLASS_RE.exec(source);
    while (componentMatch) {
      const componentName = componentMatch[1];
      if (!INTERACTIVE_COMPONENTS.has(componentName)) {
        componentMatch = COMPONENT_WITH_CLASS_RE.exec(source);
        continue;
      }
      const tokens = normalizeClassLiteral(
        componentMatch[2] ?? componentMatch[3] ?? componentMatch[4],
      );
      const geometryToken = tokens.find((token) =>
        GEOMETRY_PREFIXES.some((prefix) => token.startsWith(prefix)),
      );
      if (geometryToken) {
        violations.push({
          file: relativePath,
          line: lineAt(source, componentMatch.index),
          message: `interactive geometry token "${geometryToken}" must live in sanctioned components, not page-level className on <${componentName}>.`,
        });
      }
      componentMatch = COMPONENT_WITH_CLASS_RE.exec(source);
    }
  }
}

const styleFiles = fs.existsSync(stylesRoot)
  ? walkFiles(stylesRoot, STYLE_EXTENSIONS)
  : [];

for (const filePath of styleFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceWithoutComments = maskCssComments(source);
  const relativePath = toRelative(filePath);

  let forbiddenSelectorMatch = FORBIDDEN_CSS_SELECTOR_RE.exec(sourceWithoutComments);
  while (forbiddenSelectorMatch) {
    const token = forbiddenSelectorMatch[1];
    const isLegacyToken = LEGACY_CLASS_TOKENS.has(token);
    const isFieldToken = LEGACY_FIELD_CLASS_TOKENS.has(token);
    violations.push({
      file: relativePath,
      line: lineAt(source, forbiddenSelectorMatch.index),
      message:
        isLegacyToken || isFieldToken
          ? `legacy CSS selector ".${token}" is forbidden; use data-slot selectors or formal components instead.`
          : `modal shell CSS selector ".${token}" is forbidden; use shared modal presets and StandardModalFrame instead.`,
    });
    forbiddenSelectorMatch = FORBIDDEN_CSS_SELECTOR_RE.exec(sourceWithoutComments);
  }

  let legacyLightTokenMatch = LEGACY_LIGHT_TOKEN_RE.exec(source);
  while (legacyLightTokenMatch) {
    violations.push({
      file: relativePath,
      line: lineAt(source, legacyLightTokenMatch.index),
      message: `legacy light token "${legacyLightTokenMatch[0]}" is forbidden; use the semantic --ui-* token chain instead.`,
    });
    legacyLightTokenMatch = LEGACY_LIGHT_TOKEN_RE.exec(source);
  }

  if (isTextStyleScopeFile(filePath)) {
    let fontSizeMatch = FONT_SIZE_DECL_RE.exec(sourceWithoutComments);
    while (fontSizeMatch) {
      const value = compactCssValue(fontSizeMatch[3]);
      if (NUMERIC_FONT_SIZE_VALUE_RE.test(value)) {
        violations.push({
          file: relativePath,
          line: lineAt(source, cssDeclarationLineIndex(fontSizeMatch)),
          message: `hard-coded font-size "${value}" is forbidden in packages/shared/global/modal/secondary styles; use typography tokens instead.`,
        });
      }
      fontSizeMatch = FONT_SIZE_DECL_RE.exec(sourceWithoutComments);
    }

    let letterSpacingMatch = LETTER_SPACING_DECL_RE.exec(sourceWithoutComments);
    while (letterSpacingMatch) {
      const value = compactCssValue(letterSpacingMatch[3]);
      if (NEGATIVE_NUMERIC_VALUE_RE.test(value)) {
        violations.push({
          file: relativePath,
          line: lineAt(source, cssDeclarationLineIndex(letterSpacingMatch)),
          message: `negative letter-spacing "${value}" is forbidden in packages/shared/global/modal/secondary styles.`,
        });
      }
      letterSpacingMatch = LETTER_SPACING_DECL_RE.exec(sourceWithoutComments);
    }
  }

  if (isPageStyleScopeFile(filePath)) {
    let ruleMatch = CSS_RULE_RE.exec(sourceWithoutComments);
    while (ruleMatch) {
      const selector = ruleMatch[1];
      const declarations = ruleMatch[2];
      if (
        SELECT_DATA_SLOT_SELECTOR_RE.test(selector) &&
        (SELECT_CONTROL_STATE_SELECTOR_RE.test(selector) ||
          SELECT_CONTROL_GEOMETRY_DECL_RE.test(declarations))
      ) {
        violations.push({
          file: relativePath,
          line: lineAt(source, ruleMatch.index),
          message:
            'page CSS must not control select trigger/content/item geometry or state; use SelectField/SearchSelectField props and shared ui primitives.',
        });
      }
      ruleMatch = CSS_RULE_RE.exec(sourceWithoutComments);
    }
  }
}

if (violations.length > 0) {
  console.error("[ui-consistency] Found forbidden desktop UI patterns:");
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} | ${violation.message}`);
  }
  process.exit(1);
}

console.log("[ui-consistency] OK");
