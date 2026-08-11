// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(frontendRoot, 'src');

const HOST_TAGS = new Set(['div', 'section', 'article', 'main', 'aside']);
const PANEL_LIKE_COMPONENT_RE =
  /^(?:AppModal|DialogContent|PageContainer|WorkspacePageSwitcher|[A-Z][A-Za-z0-9]*(?:Dialog|Modal|Panel|Page|Shell|Host|PortalHost))$/;
const PANEL_LIKE_CLASS_RE =
  /\b(panel|dialog|modal|banner|console|shell|workspace|page|content|body|surface)\b/i;
const UNSTABLE_KEY_TEXT_RE =
  /\b(?:Date\.now|Math\.random|performance\.now|JSON\.stringify|new Date)\b/;
const ALLOW_RESTART_ATTRS = new Set([
  'data-allow-remount',
  'data-remount-allowed'
]);

const collectSourceFiles = (dirPath) => {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!fullPath.endsWith('.tsx') && !fullPath.endsWith('.jsx')) {
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
      ? path.join(path.resolve(frontendRoot, '../../..'), normalized)
      : path.join(frontendRoot, normalized);
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
        if (
          absolutePath &&
          fs.existsSync(absolutePath) &&
          (absolutePath.endsWith('.tsx') || absolutePath.endsWith('.jsx'))
        ) {
          options.files.push(absolutePath);
        }
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-dynamic-panel-keys.mjs [--files <path> ...]');
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
};

const getScriptKind = (filePath) =>
  filePath.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;

const getJsxTagName = (node) => {
  const tagName = node.tagName.getText();
  return HOST_TAGS.has(tagName) || PANEL_LIKE_COMPONENT_RE.test(tagName)
    ? tagName
    : null;
};

const getJsxAttribute = (node, name) =>
  node.attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) && property.name.text === name
  ) ?? null;

const isDynamicKeyAttribute = (attribute) => {
  const { initializer } = attribute;
  if (!initializer) {
    return false;
  }
  if (ts.isStringLiteral(initializer)) {
    return false;
  }
  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return false;
  }
  const expression = initializer.expression;
  return !(
    ts.isStringLiteralLike(expression) ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.NullKeyword
  );
};

const getClassNameText = (attribute) => {
  if (!attribute?.initializer) {
    return '';
  }
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return attribute.initializer.expression.getText();
  }
  return '';
};

const isInsideArrayMapCallback = (node) => {
  let current = node.parent;
  while (current) {
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isCallExpression(current.parent) &&
      current.parent.arguments[0] === current &&
      ts.isPropertyAccessExpression(current.parent.expression) &&
      current.parent.expression.name.text === 'map'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const toRelativePath = (filePath) =>
  path.relative(frontendRoot, filePath).replaceAll(path.sep, '/');

const violations = [];
const options = parseArgs(process.argv.slice(2));
const sourceFiles = options.files.length > 0
  ? [...new Set(options.files)].sort()
  : collectSourceFiles(srcRoot);

for (const filePath of sourceFiles) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getJsxTagName(node);
      const keyAttribute = getJsxAttribute(node, 'key');
      if (keyAttribute?.initializer?.getText(sourceFile).match(UNSTABLE_KEY_TEXT_RE)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        violations.push({
          file: toRelativePath(filePath),
          line,
          tagName: node.tagName.getText(),
          classNameText: getClassNameText(getJsxAttribute(node, 'className')),
          keyText: keyAttribute.initializer.getText(sourceFile),
        });
      }
      if (tagName) {
        const classNameAttribute = getJsxAttribute(node, 'className');
        const allowRemount =
          [...ALLOW_RESTART_ATTRS].some((attrName) => getJsxAttribute(node, attrName));
        const classNameText = getClassNameText(classNameAttribute);
        if (
          keyAttribute &&
          isDynamicKeyAttribute(keyAttribute) &&
          !allowRemount &&
          !isInsideArrayMapCallback(node) &&
          PANEL_LIKE_CLASS_RE.test(classNameText)
        ) {
          const keyInitializer = keyAttribute.initializer;
          const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          violations.push({
            file: toRelativePath(filePath),
            line,
            tagName,
            classNameText,
            keyText: keyInitializer ? keyInitializer.getText(sourceFile) : '[missing]'
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (violations.length > 0) {
  console.error(
    '[remount-key-check] Found suspicious dynamic keys on panel-like host elements outside list rendering:'
  );
  violations.forEach((item) => {
    console.error(
      `  - ${item.file}:${item.line} <${item.tagName}> class=${JSON.stringify(
        item.classNameText
      )} key=${item.keyText}`
    );
  });
  console.error(
    '[remount-key-check] Prefer updating content in place. Only force remount when the subtree truly needs a hard reset.'
  );
  process.exit(1);
}

console.log(
  '[remount-key-check] ✅ no suspicious dynamic panel keys outside list rendering.'
);
