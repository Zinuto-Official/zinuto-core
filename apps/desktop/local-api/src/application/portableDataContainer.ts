// SPDX-License-Identifier: GPL-3.0-only

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appError } from '../kernel/appError.js';

export const PORTABLE_TRANSFER_EXTENSION = '.otp-package';
export const PORTABLE_TRANSFER_FORMAT_VERSION = 2 as const;

export const PORTABLE_TRANSFER_MAGIC = Buffer.from(
  'OPEN_TRADING_PRACTICE_PACKAGE_V2\0',
  'ascii',
);
const PORTABLE_TRANSFER_HEADER_LENGTH_BYTES = 4;
const PORTABLE_TRANSFER_COPY_CHUNK_BYTES = 1024 * 1024;
const PORTABLE_TRANSFER_MAX_HEADER_BYTES = 64 * 1024;
const PORTABLE_TRANSFER_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024 * 1024;
const PORTABLE_PAYLOAD_PATH = 'payload.sqlite' as const;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export type PortableTransferFileEntry = {
  path: typeof PORTABLE_PAYLOAD_PATH;
  bytes: number;
  sha256: string;
};

export type PortableTransferHeader = {
  schemaVersion: typeof PORTABLE_TRANSFER_FORMAT_VERSION;
  encrypted: false;
  files: [PortableTransferFileEntry];
};

const normalizeText = (value: unknown): string =>
  (typeof value === 'string' ? value : String(value ?? '')).trim();

const normalizePayloadBytes = (value: unknown): number => {
  const bytes = Number(value);
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > PORTABLE_TRANSFER_MAX_PAYLOAD_BYTES
  ) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return bytes;
};

const buildValidatedHeader = (
  value: PortableTransferHeader | Record<string, unknown>,
): PortableTransferHeader => {
  const files = Array.isArray(value.files) ? value.files : [];
  const file = files[0] as Record<string, unknown> | undefined;
  const filePath = normalizeText(file?.path);
  const sha256 = normalizeText(file?.sha256).toLowerCase();
  if (
    value.schemaVersion !== PORTABLE_TRANSFER_FORMAT_VERSION ||
    value.encrypted !== false ||
    files.length !== 1 ||
    filePath !== PORTABLE_PAYLOAD_PATH ||
    path.posix.basename(filePath) !== filePath ||
    !SHA256_HEX_PATTERN.test(sha256)
  ) {
    throw appError('PORTABLE_PACKAGE_UNSUPPORTED');
  }
  return {
    schemaVersion: PORTABLE_TRANSFER_FORMAT_VERSION,
    encrypted: false,
    files: [
      {
        path: PORTABLE_PAYLOAD_PATH,
        bytes: normalizePayloadBytes(file?.bytes),
        sha256,
      },
    ],
  };
};

const readExactBytes = async (
  handle: fs.FileHandle,
  byteLength: number,
  position: number,
): Promise<Buffer> => {
  const buffer = Buffer.alloc(byteLength);
  const { bytesRead } = await handle.read(buffer, 0, byteLength, position);
  if (bytesRead !== byteLength) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return buffer;
};

const resolvePayloadStartOffset = async (
  handle: fs.FileHandle,
): Promise<{
  header: PortableTransferHeader;
  payloadStartOffset: number;
}> => {
  const magic = await readExactBytes(handle, PORTABLE_TRANSFER_MAGIC.byteLength, 0);
  if (!magic.equals(PORTABLE_TRANSFER_MAGIC)) {
    throw appError('PORTABLE_PACKAGE_UNSUPPORTED');
  }
  const headerLengthBuffer = await readExactBytes(
    handle,
    PORTABLE_TRANSFER_HEADER_LENGTH_BYTES,
    PORTABLE_TRANSFER_MAGIC.byteLength,
  );
  const headerLength = headerLengthBuffer.readUInt32BE(0);
  if (headerLength <= 0 || headerLength > PORTABLE_TRANSFER_MAX_HEADER_BYTES) {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  const headerBuffer = await readExactBytes(
    handle,
    headerLength,
    PORTABLE_TRANSFER_MAGIC.byteLength + PORTABLE_TRANSFER_HEADER_LENGTH_BYTES,
  );
  let parsedHeader: PortableTransferHeader | Record<string, unknown>;
  try {
    parsedHeader = JSON.parse(headerBuffer.toString('utf-8')) as
      | PortableTransferHeader
      | Record<string, unknown>;
  } catch {
    throw appError('PORTABLE_PACKAGE_TAMPERED');
  }
  return {
    header: buildValidatedHeader(parsedHeader),
    payloadStartOffset:
      PORTABLE_TRANSFER_MAGIC.byteLength +
      PORTABLE_TRANSFER_HEADER_LENGTH_BYTES +
      headerLength,
  };
};

const hashFile = async (filePath: string): Promise<string> => {
  const handle = await fs.open(filePath, 'r');
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(PORTABLE_TRANSFER_COPY_CHUNK_BYTES);
  try {
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.byteLength,
        position,
      );
      if (bytesRead <= 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest('hex');
  } finally {
    await handle.close().catch(() => undefined);
  }
};

export const buildPortableTransferOutputPath = (rawPath: string): string => {
  const normalizedPath = normalizeText(rawPath);
  if (!normalizedPath) {
    throw appError('PORTABLE_EXPORT_PATH_REQUIRED');
  }
  return normalizedPath.endsWith(PORTABLE_TRANSFER_EXTENSION)
    ? normalizedPath
    : `${normalizedPath}${PORTABLE_TRANSFER_EXTENSION}`;
};

export const readPortableTransferHeader = async (
  inputPath: string,
): Promise<PortableTransferHeader> => {
  const handle = await fs.open(inputPath, 'r');
  try {
    const { header, payloadStartOffset } = await resolvePayloadStartOffset(handle);
    const stat = await handle.stat();
    if (stat.size !== payloadStartOffset + header.files[0].bytes) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
    return header;
  } finally {
    await handle.close().catch(() => undefined);
  }
};

export const createPortablePackage = async ({
  payloadPath,
  outputPath,
}: {
  payloadPath: string;
  outputPath: string;
}): Promise<PortableTransferHeader> => {
  const payloadStat = await fs.stat(payloadPath);
  const payloadBytes = normalizePayloadBytes(payloadStat.size);
  const header: PortableTransferHeader = {
    schemaVersion: PORTABLE_TRANSFER_FORMAT_VERSION,
    encrypted: false,
    files: [
      {
        path: PORTABLE_PAYLOAD_PATH,
        bytes: payloadBytes,
        sha256: await hashFile(payloadPath),
      },
    ],
  };
  const serializedHeader = Buffer.from(JSON.stringify(header), 'utf-8');
  const headerLengthBuffer = Buffer.alloc(PORTABLE_TRANSFER_HEADER_LENGTH_BYTES);
  headerLengthBuffer.writeUInt32BE(serializedHeader.byteLength, 0);
  const tempOutputPath = `${outputPath}.${crypto.randomUUID()}.tmp`;
  const payloadHandle = await fs.open(payloadPath, 'r');
  const outputHandle = await fs.open(tempOutputPath, 'wx', 0o600);
  try {
    let outputOffset = 0;
    for (const chunk of [
      PORTABLE_TRANSFER_MAGIC,
      headerLengthBuffer,
      serializedHeader,
    ]) {
      await outputHandle.write(chunk, 0, chunk.byteLength, outputOffset);
      outputOffset += chunk.byteLength;
    }
    const buffer = Buffer.alloc(PORTABLE_TRANSFER_COPY_CHUNK_BYTES);
    let payloadOffset = 0;
    while (payloadOffset < payloadBytes) {
      const { bytesRead } = await payloadHandle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, payloadBytes - payloadOffset),
        payloadOffset,
      );
      if (bytesRead <= 0) {
        throw appError('PORTABLE_PACKAGE_TAMPERED');
      }
      await outputHandle.write(
        buffer,
        0,
        bytesRead,
        outputOffset,
      );
      payloadOffset += bytesRead;
      outputOffset += bytesRead;
    }
    await outputHandle.sync();
  } catch (error) {
    await outputHandle.close().catch(() => undefined);
    await fs.rm(tempOutputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await payloadHandle.close().catch(() => undefined);
    await outputHandle.close().catch(() => undefined);
  }
  await fs.rename(tempOutputPath, outputPath);
  return header;
};

export const extractPortablePayloadFile = async ({
  inputPath,
  outputPath,
}: {
  inputPath: string;
  outputPath: string;
}): Promise<PortableTransferHeader> => {
  const inputHandle = await fs.open(inputPath, 'r');
  const tempOutputPath = `${outputPath}.${crypto.randomUUID()}.tmp`;
  let outputHandle: fs.FileHandle | null = null;
  try {
    const { header, payloadStartOffset } = await resolvePayloadStartOffset(inputHandle);
    const inputStat = await inputHandle.stat();
    const file = header.files[0];
    if (inputStat.size !== payloadStartOffset + file.bytes) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
    outputHandle = await fs.open(tempOutputPath, 'wx', 0o600);
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(PORTABLE_TRANSFER_COPY_CHUNK_BYTES);
    let copiedBytes = 0;
    while (copiedBytes < file.bytes) {
      const { bytesRead } = await inputHandle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, file.bytes - copiedBytes),
        payloadStartOffset + copiedBytes,
      );
      if (bytesRead <= 0) {
        throw appError('PORTABLE_PACKAGE_TAMPERED');
      }
      hash.update(buffer.subarray(0, bytesRead));
      await outputHandle.write(buffer, 0, bytesRead, copiedBytes);
      copiedBytes += bytesRead;
    }
    if (hash.digest('hex') !== file.sha256) {
      throw appError('PORTABLE_PACKAGE_TAMPERED');
    }
    await outputHandle.sync();
    await outputHandle.close();
    outputHandle = null;
    await fs.rename(tempOutputPath, outputPath);
    return header;
  } catch (error) {
    await outputHandle?.close().catch(() => undefined);
    outputHandle = null;
    await fs.rm(tempOutputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await inputHandle.close().catch(() => undefined);
    await outputHandle?.close().catch(() => undefined);
  }
};
