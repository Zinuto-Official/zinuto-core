// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const srcRoot = path.join(projectRoot, "src");

const IGNORED_FILE_PATTERNS = [
  /\.test\.ts$/i,
  /[/\\]routes[/\\]apiSchemas(?:\.test)?\.ts$/i,
];

const USER_FACING_PROPERTY_NAMES = new Set([
  "title",
  "content",
  "label",
  "message",
  "description",
  "subtitle",
  "body",
  "prompt",
  "hint",
  "placeholder",
  "markdown",
  "text",
  "summary",
  "tooltip",
  "unit",
]);
const NON_USER_FACING_PROPERTY_NAMES = new Set([
  "currentMessage",
  "errorMessage",
  "errorCode",
  "errorArgs",
]);

const USER_FACING_VARIABLE_NAMES = new Set([
  "title",
  "content",
  "label",
  "message",
  "description",
  "subtitle",
  "body",
  "prompt",
  "hint",
  "placeholder",
  "markdown",
  "summary",
  "tooltip",
]);

const USER_FACING_CALL_NAMES = new Set(["createReplayNote"]);

const USER_FACING_PROPERTY_NAME_PATTERN =
  /(Title|Content|Label|Message|Description|Subtitle|Body|Prompt|Hint|Placeholder|Markdown|Summary|Tooltip|Unit|Copy)$/;
const USER_FACING_VARIABLE_NAME_PATTERN =
  /(Title|Content|Label|Message|Description|Subtitle|Body|Prompt|Hint|Placeholder|Markdown|Summary|Tooltip|Copy)$/;

const DISPLAY_TEXT_REGEX =
  /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const TECHNICAL_LITERAL_PATTERNS = [
  /^__[\w-]+__$/,
  /^(?:[A-Z0-9_]{2,}|[A-Z][a-z]+(?:[A-Z][a-z]+)+)$/,
  /^[-+*/%=<>()[\]{}|,:.;\\?]+$/,
  /^(?:https?:\/\/|\/api\/)[^\s]+$/i,
  /^[a-z0-9]+(?:_[a-z0-9]+)+$/,
  /^[a-z]+(?:[A-Z][a-z0-9]+)+$/,
  /^\d+(?:\.\d+)?%?$/,
  /^\{[^}]+\}$/,
];

const collectSourceFiles = (dirPath) => {
  const results = [];
  const walk = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".ts")) {
        results.push(fullPath);
      }
    }
  };
  walk(dirPath);
  return results;
};

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const isUserFacingLiteralCandidate = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }
  const hasCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    normalized,
  );
  if (hasCjk) {
    return true;
  }
  if (/\s/.test(normalized)) {
    return true;
  }
  if (/[,:;.!?]/.test(normalized) && normalized.length >= 6) {
    return true;
  }
  if (/^[A-Za-z]+$/.test(normalized) && normalized.length <= 6) {
    return false;
  }
  return normalized.length >= 8;
};

const getPropertyName = (node) => {
  if (!node) {
    return null;
  }
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return String(node.text);
  }
  return null;
};

const getCallTargetName = (expression) => {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
};

const isTypePosition = (node) => {
  let current = node.parent;
  while (current) {
    if (
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isPropertySignature(current) ||
      (ts.isParameter(current) && current.type === node)
    ) {
      return true;
    }
    if (
      ts.isVariableDeclaration(current) ||
      ts.isPropertyAssignment(current) ||
      ts.isCallExpression(current) ||
      ts.isReturnStatement(current) ||
      ts.isFunctionLike(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const isTechnicalLiteral = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }
  return TECHNICAL_LITERAL_PATTERNS.some((pattern) => pattern.test(normalized));
};

const sourceFiles = collectSourceFiles(srcRoot).filter(
  (filePath) => !IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filePath)),
);
const violations = [];

for (const filePath of sourceFiles) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const pushViolation = (node, message, value) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    violations.push({
      filePath,
      line: line + 1,
      column: character + 1,
      message,
      value: normalizeText(value).slice(0, 160),
    });
  };

  const checkLiteral = (node, value) => {
    const normalized = normalizeText(value);
    if (!normalized || isTypePosition(node)) {
      return;
    }
    if (!DISPLAY_TEXT_REGEX.test(normalized)) {
      return;
    }
    if (!isUserFacingLiteralCandidate(normalized)) {
      return;
    }
    if (isTechnicalLiteral(normalized)) {
      return;
    }

    const parent = node.parent;
    if (parent && ts.isImportDeclaration(parent)) {
      return;
    }
    if (parent && ts.isExportDeclaration(parent)) {
      return;
    }

    if (parent && ts.isPropertyAssignment(parent)) {
      const propertyName = getPropertyName(parent.name);
      if (propertyName && NON_USER_FACING_PROPERTY_NAMES.has(propertyName)) {
        return;
      }
      if (
        propertyName &&
        (USER_FACING_PROPERTY_NAMES.has(propertyName) ||
          USER_FACING_PROPERTY_NAME_PATTERN.test(propertyName))
      ) {
        pushViolation(
          node,
          `发现 ${propertyName} 字段直写用户可见文本，请迁移到共享文案中心`,
          normalized,
        );
        return;
      }
    }

    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      const variableName = parent.name.text;
      if (
        USER_FACING_VARIABLE_NAMES.has(variableName) ||
        USER_FACING_VARIABLE_NAME_PATTERN.test(variableName)
      ) {
        pushViolation(
          node,
          `发现 ${variableName} 变量直写用户可见文本，请迁移到共享文案中心`,
          normalized,
        );
        return;
      }
    }

    if (parent && ts.isCallExpression(parent) && parent.arguments.includes(node)) {
      const callName = getCallTargetName(parent.expression);
      if (callName && USER_FACING_CALL_NAMES.has(callName)) {
        pushViolation(
          node,
          `发现 ${callName}(...) 直写用户可见文本，请迁移到共享文案中心`,
          normalized,
        );
      }
    }
  };

  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      checkLiteral(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      checkLiteral(node.head, node.head.text);
      for (const span of node.templateSpans) {
        if (span.literal.text) {
          checkLiteral(span.literal, span.literal.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (!violations.length) {
  console.log("✅ 后端用户文案检查通过：未发现新增直写用户可见文本。");
  process.exit(0);
}

console.error("❌ 后端用户文案检查失败：\n");
for (const violation of violations) {
  console.error(
    `${path.relative(projectRoot, violation.filePath)}:${violation.line}:${violation.column} ${violation.message} -> "${violation.value}"`,
  );
}
console.error(
  "\n请将用户可见文本下沉到 shared 文案中心，再由 backend 通过语言选择函数读取。",
);
process.exit(1);
