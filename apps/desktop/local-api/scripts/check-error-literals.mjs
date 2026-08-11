// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(projectRoot, 'src');

const sourceFiles = [];
const collect = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      sourceFiles.push(fullPath);
    }
  }
};
collect(srcRoot);

const violations = [];
const CODE_REGEX = /^[A-Z0-9_]+$/;

for (const filePath of sourceFiles) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const pushViolation = (node, message, value) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      filePath,
      line: line + 1,
      column: character + 1,
      message,
      value: String(value ?? '').slice(0, 120)
    });
  };

  const visit = (node) => {
    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      const newExpr = node.expression;
      if (
        ts.isIdentifier(newExpr.expression) &&
        newExpr.expression.text === 'Error' &&
        newExpr.arguments?.length
      ) {
        const firstArg = newExpr.arguments[0];
        if (ts.isStringLiteralLike(firstArg)) {
          const text = firstArg.text.trim();
          const isInternalMarker = /^__[\w-]+__$/.test(text);
          const isErrorCode = CODE_REGEX.test(text);
          if (!isInternalMarker && !isErrorCode) {
            pushViolation(firstArg, '后端抛错禁止直写文本，请改为 appError(ERROR_CODE, args?)', text);
          }
        } else if (ts.isTemplateExpression(firstArg)) {
          pushViolation(firstArg, '后端抛错禁止模板文本，请改为 appError(ERROR_CODE, args?)', firstArg.getText(sourceFile));
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'appError') {
      const firstArg = node.arguments[0];
      if (!firstArg || !ts.isStringLiteralLike(firstArg)) {
        pushViolation(node, 'appError 第一个参数必须是字符串错误码', node.getText(sourceFile));
      } else if (!CODE_REGEX.test(firstArg.text.trim())) {
        pushViolation(firstArg, 'appError 错误码必须使用大写下划线风格', firstArg.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (!violations.length) {
  console.log('✅ 后端错误文本检查通过：未发现直写展示错误文本。');
  process.exit(0);
}

console.error('❌ 后端错误文本检查失败：\n');
for (const item of violations) {
  console.error(
    `${path.relative(projectRoot, item.filePath)}:${item.line}:${item.column} ${item.message} -> "${item.value}"`
  );
}
process.exit(1);
