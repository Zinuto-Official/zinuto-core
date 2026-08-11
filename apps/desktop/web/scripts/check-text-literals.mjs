// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(projectRoot, 'src');
const indexHtmlPath = path.join(projectRoot, 'index.html');

const ALLOWED_TEXT_SOURCE_FILES = new Set([]);

const IGNORED_FILE_PATTERNS = [
  /[/\\]ui[/\\]theme[/\\]visual[/\\]/,
  /[/\\]ui[/\\]theme[/\\]visualColors\.ts$/,
  /\.test\.[jt]sx?$/i,
  /\.d\.ts$/i
];

const USER_FACING_JSX_ATTRS = new Set([
  'title',
  'placeholder',
  'aria-label',
  'aria-placeholder',
  'aria-description',
  'alt',
  'label'
]);

const USER_FACING_CALLS = new Set([
  'setHint',
  'setError',
  'showNotice',
  'alert',
  'confirm'
]);

const USER_FACING_PROPERTY_NAMES = new Set([
  'alt',
  'ariaLabel',
  'ariaDescription',
  'caption',
  'description',
  'detailText',
  'displayText',
  'emptyLabel',
  'emptyText',
  'errorMessage',
  'helperText',
  'hint',
  'label',
  'legendTitle',
  'message',
  'placeholder',
  'prompt',
  'searchPlaceholder',
  'subtitle',
  'summary',
  'text',
  'title',
  'tooltip',
  'unit'
]);

const USER_FACING_VARIABLE_NAMES = new Set([
  'alt',
  'caption',
  'description',
  'displayText',
  'emptyText',
  'errorMessage',
  'helperText',
  'hint',
  'label',
  'message',
  'placeholder',
  'prompt',
  'subtitle',
  'summary',
  'text',
  'title',
  'tooltip'
]);

const USER_FACING_PROPERTY_NAME_PATTERN = /(Text|Label|Title|Description|Message|Hint|Placeholder|Summary|Caption|Percent|Ratio|Body|Cta|Notice|Tooltip|Markdown|Formula|Example|Overview|Quote)$/;
const USER_FACING_VARIABLE_NAME_PATTERN = /(Text|Label|Title|Description|Message|Hint|Placeholder|Summary|Caption|Body|Cta|Notice|Tooltip|Markdown)$/;
const USER_FACING_FUNCTION_NAME_PATTERN = /(Text|Label|Title|Description|Message|Hint|Placeholder|Summary|Caption|Percent|Ratio|Copy|Body|Cta|Notice|Markdown|Formula|Example|Overview|Quote)$/;
const USER_FACING_LOCALE_SUFFIX_PATTERN = /(?:Text|Label|Title|Description|Message|Hint|Placeholder|Summary|Caption|Body|Cta|Notice|Tooltip|Markdown|Formula|Example|Overview|Quote|description|formula|example)(?:Zh|En|Ja|Ko|Es|Fr|ZhCn|ZhTw|ZH|EN|JA|KO|ES|FR|ZH_CN|ZH_TW)$/;
const DISPLAY_TEXT_REGEX = /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LOCALIZED_SEPARATOR_REGEX = /[·、，]/u;
const MESSAGE_ID_LITERAL_PATTERN = /^(?:app|appText|common|dialogs|emails|errors|settings|shell|stats|trainer|uiConfig|uiLabels)\.[a-z][A-Za-z0-9_.]*$/u;
const TT_FUNCTION_NAMES = new Set(['tt', 'ttf', 'ttByLanguage', 'appText', 'ttLoose', 'globalTt', 'formatCurrentMessage']);
const TECHNICAL_CALL_NAMES = new Set(['readErrorArg', 'createElement', 'setAttribute', 'execCommand']);

const TECHNICAL_LITERAL_PATTERNS = [
  /^__[\w-]+__$/,
  /^\/(?:api|Users|tmp|var|opt|src|assets)\b/i,
  /^(?:https?:\/\/|app:\/\/|plugin:\/\/)[^\s]+$/i,
  /^(?:application|text|image|audio|video)\/[-.\w+]+$/i,
  /<\/?[a-z][^>]*>/i,
  /^(?:pt|px|rem|em|vh|vw|ms|s|deg|fr|a4)$/i,
  /^(?:utf-?8|ascii)$/i,
  /^(?:string|number|boolean|object|null|undefined|symbol|bigint|function|abort|AbortError|Content-Type)$/i,
  /^(?:en-US|zh-CN|ko-KR|ja-JP|es-ES)$/i,
  /^Asia\/[A-Za-z_]+$/,
  /^\{[^}]+\}$/,
  /^\d+(?:m|h|d|w|q|y|mo|min|hr)$/i,
  /^(?:D|W|M|Q|Y)$/,
  /^(?:NaN|FAILED|READY|DONE|UPLOADING|IMPORTING|FINALIZING|WITH_PARENT|FLAT)$/i,
  /^(?:BUY|SELL|LONG|SHORT|OBSERVE|ALLOW|DISALLOW|INCLUDE_FEES|EXCLUDE_FEES|DISPLAY_PERIOD|RAW_BAR)$/i,
  /^[A-Z0-9_]{2,}$/,
  /^[a-z]+(?:\.[a-z][a-zA-Z0-9]*)+$/,
  /^[a-z0-9]+(?:_[a-z0-9]+)+$/,
  /^[a-z]+(?:[A-Z][a-z0-9]+)+$/,
  /^[a-z]+(?:-[a-z0-9]+)+$/,
  /^[-+*/%=<>()[\]{}|,:.;\\?]+$/,
  /^\d+$/
];

const collectSourceFiles = (dir) => {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx') && !fullPath.endsWith('.css') && !fullPath.endsWith('.json')) {
      continue;
    }
    results.push(fullPath);
  }
  return results;
};

const normalizePath = (value) => String(value ?? '').trim().replaceAll(path.sep, '/');

const absoluteSourceFileFromInput = (value) => {
  const normalized = normalizePath(value);
  if (!normalized) {
    return null;
  }
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : normalized.startsWith('apps/desktop/web/')
      ? path.join(path.resolve(projectRoot, '../../..'), normalized)
      : path.join(projectRoot, normalized);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(`${srcRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
};

const parseArgs = (argv) => {
  const options = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--files') {
      index += 1;
      while (index < argv.length && !String(argv[index]).startsWith('--')) {
        const absolutePath = absoluteSourceFileFromInput(argv[index]);
        if (absolutePath && fs.existsSync(absolutePath)) {
          options.files.push(absolutePath);
        }
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-text-literals.mjs [--files <path> ...]');
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
};

const getScriptKind = (filePath) => (filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const isAllowedTextFile = (filePath) => ALLOWED_TEXT_SOURCE_FILES.has(filePath);
const isIgnoredFile = (filePath) => IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const isTechnicalLiteral = (value, { userContext = false } = {}) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }
  if (normalized === 'Zinuto') {
    return true;
  }
  if (MESSAGE_ID_LITERAL_PATTERN.test(normalized)) {
    return true;
  }
  if (!userContext) {
    return TECHNICAL_LITERAL_PATTERNS.some((pattern) => pattern.test(normalized));
  }
  return [
    /^(?:pt|px|rem|em|vh|vw|ms|s|deg|fr|a4)$/i,
    /^(?:utf-?8|ascii)$/i,
    /^(?:string|number|boolean|object|null|undefined|symbol|bigint|function)$/i,
    /^\/(?:api|Users|tmp|var|opt|src|assets)\b/i,
    /^(?:https?:\/\/|app:\/\/|plugin:\/\/)[^\s]+$/i,
    /^(?:application|text|image|audio|video)\/[-.\w+]+$/i,
    /<\/?[a-z][^>]*>/i,
    /^Asia\/[A-Za-z_]+$/,
    /^[a-z]+(?:\.[a-z][a-zA-Z0-9]*)+$/,
    /^\{\d+\}$/,
    /^\d+$/
  ].some((pattern) => pattern.test(normalized));
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

const getPropertyName = (nameNode) => {
  if (ts.isIdentifier(nameNode) || ts.isPrivateIdentifier(nameNode)) {
    return nameNode.text;
  }
  if (ts.isStringLiteralLike(nameNode) || ts.isNumericLiteral(nameNode)) {
    return String(nameNode.text);
  }
  return null;
};

const getNearestFunctionName = (node) => {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return getPropertyName(current.name);
    }
    if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (parent && ts.isPropertyAssignment(parent)) {
        return getPropertyName(parent.name);
      }
    }
    current = current.parent;
  }
  return null;
};

const isInReturnedExpression = (node) => {
  let current = node.parent;
  while (current) {
    if (ts.isReturnStatement(current)) {
      return true;
    }
    if (
      ts.isFunctionLike(current) ||
      ts.isSourceFile(current) ||
      ts.isVariableStatement(current) ||
      ts.isExpressionStatement(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const isNonEmptyJsxText = (value) => normalizeText(value).length > 0;
const hasDisplayLetters = (value) => DISPLAY_TEXT_REGEX.test(normalizeText(value));
const hasLocalizedSeparator = (value) => LOCALIZED_SEPARATOR_REGEX.test(String(value ?? ''));
const CSS_CONTENT_LITERAL_REGEX = /content\s*:\s*(['"])(.*?)\1/g;
const CJK_OR_COMPACT_SCRIPT_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const isLikelyJsxInlineText = (value) => {
  const normalized = normalizeText(value);
  if (!normalized || !hasDisplayLetters(normalized)) {
    return false;
  }
  if (CJK_OR_COMPACT_SCRIPT_REGEX.test(normalized)) {
    return true;
  }
  if (/^[DWMQY]$/i.test(normalized)) {
    return true;
  }
  return /[\s/:;,.!?()[\]{}+]/.test(normalized);
};

const isInsideJsxExpression = (node) => {
  let current = node.parent;
  let sawJsxExpression = false;
  while (current) {
    if (ts.isJsxAttribute(current) || ts.isJsxSpreadAttribute(current)) {
      return false;
    }
    if (ts.isJsxExpression(current)) {
      sawJsxExpression = true;
    }
    if (
      sawJsxExpression &&
      (
        ts.isJsxElement(current) ||
        ts.isJsxFragment(current) ||
        ts.isJsxSelfClosingElement(current)
      )
    ) {
      return true;
    }
    if (
      ts.isFunctionLike(current) ||
      ts.isSourceFile(current) ||
      ts.isVariableStatement(current) ||
      ts.isExpressionStatement(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
};

const violations = [];
const options = parseArgs(process.argv.slice(2));
const hasScopedFiles = options.files.length > 0;
const sourceFiles = hasScopedFiles ? [...new Set(options.files)].sort() : collectSourceFiles(srcRoot);

for (const filePath of sourceFiles) {
  if (isAllowedTextFile(filePath) || isIgnoredFile(filePath)) {
    continue;
  }
  const sourceText = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.css')) {
    let match = CSS_CONTENT_LITERAL_REGEX.exec(sourceText);
    while (match) {
      const rawValue = String(match[2] ?? '');
      const normalized = normalizeText(rawValue);
      if (normalized && (hasDisplayLetters(normalized) || hasLocalizedSeparator(normalized))) {
        const index = match.index + match[0].indexOf(rawValue);
        const line = sourceText.slice(0, index).split(/\r?\n/).length;
        const lineStart = sourceText.lastIndexOf('\n', index - 1);
        const column = index - lineStart;
        violations.push({
          filePath,
          line,
          column,
          message: '发现 CSS content 直写展示文本，需改为通过组件/属性渲染文案',
          value: normalized.slice(0, 160)
        });
      }
      match = CSS_CONTENT_LITERAL_REGEX.exec(sourceText);
    }
    continue;
  }
  if (filePath.endsWith('.json')) {
    const pushJsonViolation = (pointer, value) => {
      violations.push({
        filePath,
        line: 1,
        column: 1,
        message: `发现 JSON 资产字段 ${pointer} 直写展示文本，需移至文案中心`,
        value: normalizeText(value).slice(0, 160)
      });
    };
    const visitJson = (value, pointer = '$') => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visitJson(item, `${pointer}[${index}]`));
        return;
      }
      if (!value || typeof value !== 'object') {
        return;
      }
      for (const [key, nested] of Object.entries(value)) {
        const nextPointer = `${pointer}.${key}`;
        if (typeof nested === 'string') {
          const normalized = normalizeText(nested);
          const looksUserFacingKey = /(name|label|title|description|subtitle|summary|message|story|quote|caption)$/i.test(key);
          if (looksUserFacingKey && normalized && hasDisplayLetters(normalized)) {
            pushJsonViolation(nextPointer, normalized);
          }
        } else {
          visitJson(nested, nextPointer);
        }
      }
    };
    try {
      visitJson(JSON.parse(sourceText));
    } catch (error) {
      const normalized = error instanceof Error ? error.message : String(error ?? 'invalid json');
      violations.push({
        filePath,
        line: 1,
        column: 1,
        message: 'JSON 解析失败，无法完成文案检查',
        value: normalized.slice(0, 160)
      });
    }
    continue;
  }
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, getScriptKind(filePath));

  const pushViolation = (node, message, rawValue) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      filePath,
      line: line + 1,
      column: character + 1,
      message,
      value: normalizeText(rawValue).slice(0, 160)
    });
  };

  const isTypePosition = (node) => {
    let current = node.parent;
    while (current) {
      if (
        ts.isTypeNode(current) ||
        ts.isInterfaceDeclaration(current) ||
        ts.isTypeAliasDeclaration(current) ||
        ts.isPropertySignature(current) ||
        ts.isParameter(current) && current.type === node
      ) {
        return true;
      }
      if (
        ts.isVariableDeclaration(current) ||
        ts.isPropertyAssignment(current) ||
        ts.isJsxAttribute(current) ||
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

  const checkLiteralValue = (node, value) => {
    const normalized = normalizeText(value);
    const isHumanReadableLiteral = hasDisplayLetters(normalized) || hasLocalizedSeparator(normalized);
    if (!normalized || isTypePosition(node)) {
      return;
    }

    const directParent = node.parent;
    const parent = directParent && ts.isTemplateExpression(directParent)
      ? directParent.parent
      : directParent;
    const valueNode = directParent && ts.isTemplateExpression(directParent)
      ? directParent
      : node;

    if (parent && ts.isImportDeclaration(parent)) {
      return;
    }
    if (parent && ts.isExportDeclaration(parent)) {
      return;
    }

    if (parent && ts.isJsxAttribute(parent)) {
      const attrName = parent.name.getText(sourceFile);
      if (USER_FACING_JSX_ATTRS.has(attrName) && !isTechnicalLiteral(normalized, { userContext: true })) {
        pushViolation(node, `发现 ${attrName} 属性直写文本，需使用 tt/ttf`, normalized);
      }
      return;
    }

    if (parent && ts.isPropertyAssignment(parent)) {
      const propertyName = getPropertyName(parent.name);
      if (
        propertyName &&
        (USER_FACING_PROPERTY_NAMES.has(propertyName) ||
          USER_FACING_PROPERTY_NAME_PATTERN.test(propertyName) ||
          USER_FACING_LOCALE_SUFFIX_PATTERN.test(propertyName)) &&
        isHumanReadableLiteral &&
        !isTechnicalLiteral(normalized, { userContext: true })
      ) {
        pushViolation(node, `发现 ${propertyName} 字段直写文本，需抽离到文案中心`, normalized);
        return;
      }
    }

    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      const variableName = parent.name.text;
      if (
        (USER_FACING_VARIABLE_NAMES.has(variableName) ||
          USER_FACING_VARIABLE_NAME_PATTERN.test(variableName) ||
          USER_FACING_LOCALE_SUFFIX_PATTERN.test(variableName)) &&
        isHumanReadableLiteral &&
        !isTechnicalLiteral(normalized, { userContext: true })
      ) {
        pushViolation(node, `发现 ${variableName} 变量直写文本，需抽离到文案中心`, normalized);
        return;
      }
    }

    let callArgumentNode = valueNode;
    let callExpressionParent = callArgumentNode.parent;
    while (
      callExpressionParent &&
      ((ts.isAsExpression(callExpressionParent) ||
        ts.isTypeAssertionExpression(callExpressionParent) ||
        ts.isParenthesizedExpression(callExpressionParent) ||
        ts.isNonNullExpression(callExpressionParent) ||
        (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(callExpressionParent))) &&
        callExpressionParent.expression === callArgumentNode)
    ) {
      callArgumentNode = callExpressionParent;
      callExpressionParent = callArgumentNode.parent;
    }

    if (
      callExpressionParent &&
      ts.isCallExpression(callExpressionParent) &&
      callExpressionParent.arguments.includes(callArgumentNode)
    ) {
      const callTarget = getCallTargetName(callExpressionParent.expression);
      if (callTarget && (TT_FUNCTION_NAMES.has(callTarget) || TECHNICAL_CALL_NAMES.has(callTarget))) {
        return;
      }
      if (callTarget === 'join' && hasLocalizedSeparator(normalized)) {
        pushViolation(node, '发现 join(...) 直写人类可读分隔符，需走文案中心/展示辅助函数', normalized);
        return;
      }
      if (callTarget && USER_FACING_CALLS.has(callTarget) && !isTechnicalLiteral(normalized, { userContext: true })) {
        pushViolation(node, `发现 ${callTarget}(...) 直写文本，需使用 tt/ttf`, normalized);
        return;
      }
    }

    const functionName = getNearestFunctionName(node);
    if (
      functionName &&
      /^[a-z]/.test(functionName) &&
      USER_FACING_FUNCTION_NAME_PATTERN.test(functionName) &&
      isInReturnedExpression(node) &&
      isHumanReadableLiteral &&
      !isTechnicalLiteral(normalized, { userContext: true })
    ) {
      pushViolation(node, `发现 ${functionName}(...) 内部直写文本，需走文案中心`, normalized);
      return;
    }

    if (
      isInsideJsxExpression(node) &&
      (isLikelyJsxInlineText(normalized) || hasLocalizedSeparator(normalized)) &&
      !isTechnicalLiteral(normalized, { userContext: true })
    ) {
      pushViolation(node, '发现 JSX 表达式内直写文本，需抽离到文案中心', normalized);
    }
  };

  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      checkLiteralValue(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      checkLiteralValue(node.head, node.head.text);
      for (const span of node.templateSpans) {
        if (span.literal.text) {
          checkLiteralValue(span.literal, span.literal.text);
        }
      }
    } else if (ts.isJsxText(node)) {
      const raw = node.getText(sourceFile);
      if (isNonEmptyJsxText(raw)) {
        pushViolation(node, '发现 JSX 直写展示文本，需抽离到文案中心', raw);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (!hasScopedFiles && fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (match) {
    const titleText = normalizeText(match[1] ?? '');
    if (titleText && titleText !== '__DESKTOP_PRODUCT_NAME__') {
      violations.push({
        filePath: indexHtmlPath,
        line: 1,
        column: 1,
        message: 'index.html 的 <title> 禁止直写文本，请在应用启动后通过 tt/ttf 设置',
        value: titleText.slice(0, 160)
      });
    }
  }
}

if (!violations.length) {
  console.log('✅ 文案抽离检查通过：未发现未抽离的前端展示文本。');
  process.exit(0);
}

console.error('❌ 文案抽离检查失败：发现未接入文案中心的前端展示文本。\n');
for (const violation of violations) {
  console.error(
    `${path.relative(projectRoot, violation.filePath)}:${violation.line}:${violation.column} ` +
      `${violation.message} -> "${violation.value}"`
  );
}

console.error(
  '\n请优先把上述文本移至 packages/shared/src/i18n/messages/*.json，并通过现行 i18n runtime 接入；不要新增或扩写旧的 appText / uiLabels / uiConfig 入口。'
);
process.exit(1);
