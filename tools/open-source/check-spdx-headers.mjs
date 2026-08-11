#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');
const extensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.nsh',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const skippedDirectories = new Set([
  '.git',
  '.cache',
  'coverage',
  'dist',
  'gen',
  'node_modules',
  '.venv',
  'runtime',
  'target',
  'test-results',
  'vendor',
]);
const identifier = 'SPDX-License-Identifier: GPL-3.0-only';
const reviewedExemptions = new Map();

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return skippedDirectories.has(entry.name) ? [] : walk(absolutePath);
      }
      return entry.isFile() && extensions.has(path.extname(entry.name))
        ? [absolutePath]
        : [];
    });
};

const candidates = walk(rootDir);
const missing = [];

for (const filePath of candidates) {
  const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
  if (reviewedExemptions.has(relativePath)) {
    continue;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.slice(0, 512).includes(identifier)) {
    continue;
  }
  missing.push(relativePath);
  if (checkOnly) {
    continue;
  }
  const extension = path.extname(filePath);
  const comment = extension === '.css'
    ? `/* ${identifier} */\n`
    : extension === '.html'
      ? `<!-- ${identifier} -->\n`
      : extension === '.nsh'
        ? `; ${identifier}\n`
        : extension === '.toml' || extension === '.yaml' || extension === '.yml'
          ? `# ${identifier}\n`
          : `// ${identifier}\n`;
  if (source.startsWith('#!')) {
    const newlineIndex = source.indexOf('\n');
    const shebang = newlineIndex >= 0 ? source.slice(0, newlineIndex + 1) : `${source}\n`;
    const remainder = newlineIndex >= 0 ? source.slice(newlineIndex + 1) : '';
    fs.writeFileSync(filePath, `${shebang}\n${comment}\n${remainder}`);
  } else {
    fs.writeFileSync(filePath, `${comment}\n${source}`);
  }
}

if (checkOnly && missing.length > 0) {
  process.stderr.write(`[spdx] missing GPL-3.0-only identifier in ${missing.length} files\n`);
  missing.forEach((filePath) => process.stderr.write(`- ${filePath}\n`));
  process.exit(1);
}

process.stdout.write(
  checkOnly
    ? `[spdx] passed (${candidates.length - reviewedExemptions.size} covered source/build files; ${reviewedExemptions.size} reviewed byte-stable exemption)\n`
    : `[spdx] added identifiers to ${missing.length}/${candidates.length - reviewedExemptions.size} covered source/build files\n`,
);
