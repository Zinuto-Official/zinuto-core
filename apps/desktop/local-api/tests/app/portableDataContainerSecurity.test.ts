// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PORTABLE_TRANSFER_EXTENSION,
  PORTABLE_TRANSFER_MAGIC,
  buildPortableTransferOutputPath,
  createPortablePackage,
  extractPortablePayloadFile,
  readPortableTransferHeader,
} from '../../src/application/portableDataContainer.js';

const expectAppErrorCode =
  (expectedCode: string) =>
  (error: unknown): boolean => {
    assert.equal((error as { code?: unknown } | null)?.code, expectedCode);
    return true;
  };

const withTempDir = async (
  run: (tempDir: string) => Promise<void>,
): Promise<void> => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'portable-container-v2-'),
  );
  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const buildRawPackage = ({
  header,
  payload = Buffer.from('x'),
}: {
  header: Record<string, unknown>;
  payload?: Buffer;
}): Buffer => {
  const serializedHeader = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(serializedHeader.byteLength, 0);
  return Buffer.concat([
    PORTABLE_TRANSFER_MAGIC,
    headerLength,
    serializedHeader,
    payload,
  ]);
};

test('portable container v2 round-trips one unencrypted payload with SHA-256 integrity', async () => {
  await withTempDir(async (tempDir) => {
    const payloadPath = path.join(tempDir, 'source.sqlite');
    const packagePath = path.join(tempDir, `archive${PORTABLE_TRANSFER_EXTENSION}`);
    const extractedPath = path.join(tempDir, 'restored.sqlite');
    const payload = crypto.randomBytes(4096);
    await fs.writeFile(payloadPath, payload);

    const createdHeader = await createPortablePackage({
      payloadPath,
      outputPath: packagePath,
    });
    const readHeader = await readPortableTransferHeader(packagePath);
    const extractedHeader = await extractPortablePayloadFile({
      inputPath: packagePath,
      outputPath: extractedPath,
    });

    assert.deepEqual(readHeader, createdHeader);
    assert.deepEqual(extractedHeader, createdHeader);
    assert.equal(createdHeader.schemaVersion, 2);
    assert.equal(createdHeader.encrypted, false);
    assert.deepEqual(await fs.readFile(extractedPath), payload);
    assert.equal(
      buildPortableTransferOutputPath(path.join(tempDir, 'archive')),
      packagePath,
    );
  });
});

test('portable container rejects a tampered payload and leaves no extracted file', async () => {
  await withTempDir(async (tempDir) => {
    const payloadPath = path.join(tempDir, 'source.sqlite');
    const packagePath = path.join(tempDir, 'tampered.otp-package');
    const extractedPath = path.join(tempDir, 'restored.sqlite');
    await fs.writeFile(payloadPath, crypto.randomBytes(1024));
    await createPortablePackage({ payloadPath, outputPath: packagePath });
    const packageBytes = await fs.readFile(packagePath);
    packageBytes[packageBytes.byteLength - 1] ^= 0xff;
    await fs.writeFile(packagePath, packageBytes);

    await assert.rejects(
      extractPortablePayloadFile({
        inputPath: packagePath,
        outputPath: extractedPath,
      }),
      expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
    );
    await assert.rejects(fs.stat(extractedPath), { code: 'ENOENT' });
  });
});

test('portable container rejects traversal paths and extra archive members', async () => {
  await withTempDir(async (tempDir) => {
    const sha256 = crypto.createHash('sha256').update('x').digest('hex');
    for (const [name, files] of [
      [
        'traversal',
        [{ path: '../payload.sqlite', bytes: 1, sha256 }],
      ],
      [
        'extra-member',
        [
          { path: 'payload.sqlite', bytes: 1, sha256 },
          { path: 'extra.sqlite', bytes: 1, sha256 },
        ],
      ],
    ] as const) {
      const packagePath = path.join(tempDir, `${name}.otp-package`);
      await fs.writeFile(
        packagePath,
        buildRawPackage({
          header: { schemaVersion: 2, encrypted: false, files },
        }),
      );
      await assert.rejects(
        readPortableTransferHeader(packagePath),
        expectAppErrorCode('PORTABLE_PACKAGE_UNSUPPORTED'),
      );
    }
  });
});

test('portable container rejects oversized declarations and oversized headers before extraction', async () => {
  await withTempDir(async (tempDir) => {
    const sha256 = crypto.createHash('sha256').update('x').digest('hex');
    const oversizedPayloadPath = path.join(tempDir, 'oversized-payload.otp-package');
    await fs.writeFile(
      oversizedPayloadPath,
      buildRawPackage({
        header: {
          schemaVersion: 2,
          encrypted: false,
          files: [
            {
              path: 'payload.sqlite',
              bytes: 32 * 1024 * 1024 * 1024 + 1,
              sha256,
            },
          ],
        },
      }),
    );
    await assert.rejects(
      readPortableTransferHeader(oversizedPayloadPath),
      expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
    );

    const oversizedHeaderPath = path.join(tempDir, 'oversized-header.otp-package');
    const headerLength = Buffer.alloc(4);
    headerLength.writeUInt32BE(64 * 1024 + 1, 0);
    await fs.writeFile(
      oversizedHeaderPath,
      Buffer.concat([PORTABLE_TRANSFER_MAGIC, headerLength]),
    );
    await assert.rejects(
      readPortableTransferHeader(oversizedHeaderPath),
      expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
    );
  });
});

test('portable container explicitly rejects legacy package magic', async () => {
  await withTempDir(async (tempDir) => {
    const packagePath = path.join(tempDir, 'legacy.otp-package');
    await fs.writeFile(
      packagePath,
      Buffer.concat([
        Buffer.from('ZINUTO_PACKAGE_V1\0legacy'),
        Buffer.alloc(PORTABLE_TRANSFER_MAGIC.byteLength),
      ]),
    );
    await assert.rejects(
      readPortableTransferHeader(packagePath),
      expectAppErrorCode('PORTABLE_PACKAGE_UNSUPPORTED'),
    );
  });
});

test('failed extraction is atomic and preserves an existing destination', async () => {
  await withTempDir(async (tempDir) => {
    const payloadPath = path.join(tempDir, 'source.sqlite');
    const packagePath = path.join(tempDir, 'tampered.otp-package');
    const destinationPath = path.join(tempDir, 'destination.sqlite');
    await fs.writeFile(payloadPath, crypto.randomBytes(256));
    await createPortablePackage({ payloadPath, outputPath: packagePath });
    const packageBytes = await fs.readFile(packagePath);
    packageBytes[packageBytes.byteLength - 1] ^= 0xff;
    await fs.writeFile(packagePath, packageBytes);
    await fs.writeFile(destinationPath, 'existing-database');

    await assert.rejects(
      extractPortablePayloadFile({
        inputPath: packagePath,
        outputPath: destinationPath,
      }),
      expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
    );
    assert.equal(await fs.readFile(destinationPath, 'utf8'), 'existing-database');
    const leftovers = (await fs.readdir(tempDir)).filter((entry) =>
      entry.startsWith('destination.sqlite.') && entry.endsWith('.tmp'),
    );
    assert.deepEqual(leftovers, []);
  });
});
