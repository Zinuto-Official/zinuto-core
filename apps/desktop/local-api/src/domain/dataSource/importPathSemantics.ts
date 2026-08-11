// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

export const preserveImportWireRelativePath = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

export const convertNativeImportPathToWirePath = (
  nativePath: string,
  nativeSeparator = path.sep,
): string =>
  nativeSeparator === '\\' ? nativePath.replace(/\\/g, '/') : nativePath;

export const resolveImportWireRelativePath = (
  rootPath: string,
  absolutePath: string,
): string =>
  convertNativeImportPathToWirePath(path.relative(rootPath, absolutePath));

export const resolveImportWireTopLevelSubfolder = (
  relativePathRaw: unknown,
): string => {
  const relativePath = preserveImportWireRelativePath(relativePathRaw);
  if (!relativePath) {
    return '';
  }
  const [topLevelSubfolder = ''] = relativePath
    .split('/')
    .filter((part) => part.length > 0);
  return topLevelSubfolder;
};
