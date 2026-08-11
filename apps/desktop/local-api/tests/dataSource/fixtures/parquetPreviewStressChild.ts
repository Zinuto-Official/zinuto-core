// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

import { previewLocalDataImportFolderCore } from '../../../src/application/dataSource/folderPreview.js';
import { parseSymbolFromFileName } from '../../../src/application/dataSource/sourceIdentity.js';
import { stopTabularDuckDbRuntime } from '../../../src/application/dataSource/tabularDuckDbRuntime.js';

const FILE_COUNT = 1_600;
const tempRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-parquet-preview-stress-'),
);

const createParquetFixture = async (filePath: string): Promise<void> => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    const outputPath = filePath.replace(/'/g, "''");
    await connection.run(`
      COPY (
        SELECT
          TIMESTAMP '2024-01-01 00:00:00' + index * INTERVAL 1 DAY AS date,
          10.0 + index AS open,
          11.0 + index AS high,
          9.0 + index AS low,
          10.5 + index AS close,
          1000 + index AS volume
        FROM range(3) AS rows(index)
      ) TO '${outputPath}' (FORMAT PARQUET)
    `);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
};

try {
  const seedPath = path.join(tempRoot, 'SYM00000_1d.parquet');
  await createParquetFixture(seedPath);
  for (let index = 1; index < FILE_COUNT; index += 1) {
    const targetPath = path.join(
      tempRoot,
      `SYM${String(index).padStart(5, '0')}_1d.parquet`,
    );
    try {
      await fs.link(seedPath, targetPath);
    } catch {
      await fs.copyFile(seedPath, targetPath);
    }
  }

  let idCursor = 0;
  const preview = await previewLocalDataImportFolderCore(tempRoot, {
    normalizeImportFilePath: (input: string) =>
      path.resolve(String(input || '').trim()),
    assertManagedImportTempPath: (_filePath: string) => undefined,
    parseSymbolFromFileName,
    createId: () => `stress-plan-${++idCursor}`,
  });
  process.stdout.write(JSON.stringify({
    totalFiles: preview.totalFiles,
    validFiles: preview.validFiles,
    invalidFiles: preview.invalidFiles,
    detectedTimeframe: preview.detectedTimeframe,
    confirmablePlans: preview.confirmableImportPlans.length,
  }));
} finally {
  await stopTabularDuckDbRuntime();
  await fs.rm(tempRoot, { recursive: true, force: true });
}
