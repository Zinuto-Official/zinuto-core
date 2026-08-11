// SPDX-License-Identifier: GPL-3.0-only

export type FileStatSnapshot = {
  path: string;
  sizeBytes: number;
  modifiedAtMs: number;
  isFile: boolean;
  isDirectory: boolean;
};

export type FileReaderPort = {
  readText(path: string): Promise<string>;
  readBuffer(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<FileStatSnapshot>;
  listFiles(path: string): Promise<FileStatSnapshot[]>;
};
