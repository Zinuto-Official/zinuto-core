// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { IMPORT_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import {
  normalizePreviewLocalDataImportFolderProgress,
  previewLocalDataImportFolderCore,
  shouldCommitPreviewProgressUpdate,
  type PreviewLocalDataImportFolderProgress,
  type PreviewProgressCommitState,
} from '../../src/application/dataSource/folderPreview.js';
import { readTabularPreviewRowsFromPath } from '../../src/application/dataSource/tabularFileUtils.js';
import { parseSymbolFromFileName } from '../../src/application/dataSource/sourceIdentity.js';
import { serializeMarketDataAcquisitionSourceMetadata } from '../../src/application/dataSource/marketDataAcquisitionSourceMetadata.js';

const CSV_CONTENT = `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100
2024-01-02,1.1,2.1,0.6,1.6,120
`;

const CSV_CONTENT_WITHOUT_VOLUME = `date,open,high,low,close
2024-01-01,1,2,0.5,1.5
2024-01-02,1.1,2.1,0.6,1.6
2024-01-03,1.2,2.2,0.7,1.7
`;

const CSV_CONTENT_1M = `date,open,high,low,close,volume
2024-01-01T09:30:00,1,2,0.5,1.5,100
2024-01-01T09:31:00,1.1,2.1,0.6,1.6,120
2024-01-01T09:32:00,1.2,2.2,0.7,1.7,140
`;

const CSV_CONTENT_MISSING_REQUIRED_HEADER = `date,open,high,low,turnover
2024-01-01,1,2,0.5,100
2024-01-02,1.1,2.1,0.6,120
`;

const createCsvContent = (headers: string[], rows: string[][]): string =>
  `${headers.join(',')}\n${rows.map((row) => row.join(',')).join('\n')}\n`;

const createDenseIntradayCsvContent = (): string => {
  const rows: string[][] = [];
  for (const day of [1, 2, 3, 4, 5]) {
    const date = `2024-01-${String(day).padStart(2, '0')}`;
    for (let minute = 9 * 60 + 30; minute < 11 * 60 + 30; minute += 5) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
      const minuteText = String(minute % 60).padStart(2, '0');
      rows.push([`${date}T${hourText}:${minuteText}:00`, '1', '2', '0.5', '1.5', '100']);
    }
    for (let minute = 13 * 60; minute < 15 * 60; minute += 5) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
      const minuteText = String(minute % 60).padStart(2, '0');
      rows.push([`${date}T${hourText}:${minuteText}:00`, '1', '2', '0.5', '1.5', '100']);
    }
  }
  return createCsvContent(['date', 'open', 'high', 'low', 'close', 'volume'], rows);
};

const createDenseOneMinuteIntradayCsvContent = (): string => {
  const rows: string[][] = [];
  for (const day of [1, 2, 3, 4, 5]) {
    const date = `2024-01-${String(day).padStart(2, '0')}`;
    for (let minute = 9 * 60 + 30; minute < 11 * 60 + 30; minute += 1) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
      const minuteText = String(minute % 60).padStart(2, '0');
      rows.push([`${date}T${hourText}:${minuteText}:00`, '1', '2', '0.5', '1.5', '100']);
    }
    for (let minute = 13 * 60; minute < 15 * 60; minute += 1) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
      const minuteText = String(minute % 60).padStart(2, '0');
      rows.push([`${date}T${hourText}:${minuteText}:00`, '1', '2', '0.5', '1.5', '100']);
    }
  }
  return createCsvContent(['date', 'open', 'high', 'low', 'close', 'volume'], rows);
};

const createMorningOnlyOneMinuteCsvContent = (): string => {
  const rows: string[][] = [];
  for (let minute = 9 * 60 + 30; minute < 10 * 60 + 30; minute += 1) {
    const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
    const minuteText = String(minute % 60).padStart(2, '0');
    rows.push([`2024-01-02T${hourText}:${minuteText}:00`, '1', '2', '0.5', '1.5', '100']);
  }
  return createCsvContent(['date', 'open', 'high', 'low', 'close', 'volume'], rows);
};

const createPreviewDeps = () => {
  let idCursor = 0;
  return {
    normalizeImportFilePath: (input: string) => path.resolve(String(input || '').trim()),
    assertManagedImportTempPath: (_filePath: string) => undefined,
    parseSymbolFromFileName,
    createId: () => `plan-${++idCursor}`,
  };
};

const writeCsv = async (filePath: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, CSV_CONTENT, 'utf8');
};

const writeCsvWithContent = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

const isImportLimitError = (limit: string) => (error: unknown): boolean =>
  error instanceof Error &&
  (error as Error & { code?: string; args?: { limit?: string } }).code ===
    'LOCAL_DATA_IMPORT_LIMIT_EXCEEDED' &&
  (error as Error & { args?: { limit?: string } }).args?.limit === limit;

test('folder preview keeps FLAT candidate available for mixed root/subfolder imports', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsv(path.join(tempRoot, 'AAPL_1d.csv')),
    writeCsv(path.join(tempRoot, 'group-us', 'MSFT_1d.csv')),
    writeCsv(path.join(tempRoot, 'group-cn', '600519_1d.csv')),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  const flatPlans = preview.planSummaries.filter((plan) => plan.strategy === 'FLAT');

  assert.equal(preview.detectedTimeframe, '1d');
  assert.equal(preview.validFiles, 3);
  assert.equal(preview.invalidFiles, 0);
  assert.equal(flatPlans.length, 1);
  assert.equal(flatPlans[0]?.symbolCount, 3);
  assert.equal(flatPlans[0]?.fileCount, 3);
  assert.deepEqual(
    preview.confirmableImportPlans.map((plan) => plan.previewPlanId),
    preview.planSummaries.map((plan) => plan.id),
  );
  assert.ok(preview.confirmableImportPlans.every((plan) => plan.defaultPoolName.trim()));
});

test('folder preview recognizes strict local acquisition provenance without importing SOURCE.md', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-acquisition-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, '000001.csv'), CSV_CONTENT_WITHOUT_VOLUME),
    fs.writeFile(
      path.join(tempRoot, 'SOURCE.md'),
      `# Data source\n\n${serializeMarketDataAcquisitionSourceMetadata({
        schemaVersion: 1,
        connectorId: 'akshare',
        adjustment: 'qfq',
        sourceSymbols: ['000001'],
        importSymbols: ['000001'],
      })}\n`,
      'utf8',
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.deepEqual(preview.marketDataAcquisitionMetadata, {
    schemaVersion: 1,
    connectorId: 'akshare',
    adjustment: 'qfq',
    sourceSymbols: ['000001'],
    importSymbols: ['000001'],
  });
  assert.equal(preview.totalFiles, 1);
  assert.equal(preview.validFiles, 1);
});

test('folder preview uses versioned acquisition timeframe provenance for one valid bar', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-acquisition-short-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await Promise.all([
    writeCsvWithContent(
      path.join(tempRoot, 'BTC-USDT.csv'),
      `datetime,open,high,low,close,volume
2025-01-01T00:00:00.000Z,100,103,99,102,10
`,
    ),
    fs.writeFile(
      path.join(tempRoot, 'SOURCE.md'),
      `# Data source\n\n${serializeMarketDataAcquisitionSourceMetadata({
        schemaVersion: 2,
        connectorId: 'ccxt',
        adjustment: null,
        sourceSymbols: ['BTC/USDT'],
        importSymbols: ['BTC-USDT'],
        timeframe: '1d',
      })}\n`,
      'utf8',
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.deepEqual(preview.marketDataAcquisitionMetadata, {
    schemaVersion: 2,
    connectorId: 'ccxt',
    adjustment: null,
    sourceSymbols: ['BTC/USDT'],
    importSymbols: ['BTC-USDT'],
    timeframe: '1d',
  });
  assert.equal(preview.detectedTimeframe, '1d');
  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 0);
});

test('folder preview ignores malformed acquisition provenance', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-bad-source-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, '000001.csv'), CSV_CONTENT_WITHOUT_VOLUME),
    fs.writeFile(
      path.join(tempRoot, 'SOURCE.md'),
      '<!-- zinuto-market-data-acquisition:{"schemaVersion":1,"connectorId":"akshare","adjustment":"qfq","sourceSymbols":["../escape"],"importSymbols":["escape"]} -->\n',
      'utf8',
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.marketDataAcquisitionMetadata, null);
  assert.equal(preview.validFiles, 1);
});

test('folder preview ignores acquisition provenance that does not match actual CSV symbols', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-source-mismatch-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, '600000.csv'), CSV_CONTENT_WITHOUT_VOLUME),
    fs.writeFile(
      path.join(tempRoot, 'SOURCE.md'),
      `# Data source\n\n${serializeMarketDataAcquisitionSourceMetadata({
        schemaVersion: 1,
        connectorId: 'akshare',
        adjustment: 'hfq',
        sourceSymbols: ['000001'],
        importSymbols: ['000001'],
      })}\n`,
      'utf8',
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.marketDataAcquisitionMetadata, null);
  assert.deepEqual(
    preview.plans
      .filter((plan) => plan.strategy === 'FLAT')
      .flatMap((plan) => plan.files.map((file) => file.symbol)),
    ['600000'],
  );
});

test('folder preview drops acquisition provenance when the saved folder is incomplete', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-source-partial-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, '000001.csv'), CSV_CONTENT_WITHOUT_VOLUME),
    fs.writeFile(
      path.join(tempRoot, 'SOURCE.md'),
      `# Data source\n\n${serializeMarketDataAcquisitionSourceMetadata({
        schemaVersion: 1,
        connectorId: 'akshare',
        adjustment: 'qfq',
        sourceSymbols: ['000001', '600000'],
        importSymbols: ['000001', '600000'],
      })}\n`,
      'utf8',
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.marketDataAcquisitionMetadata, null);
  assert.equal(preview.validFiles, 1);
});

test('folder preview keeps valid files when a mixed folder has an invalid timeframe sample', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-mixed-timeframe-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, 'NOVOL.csv'), CSV_CONTENT_WITHOUT_VOLUME),
    writeCsvWithContent(
      path.join(tempRoot, 'BROKEN.csv'),
      `date,open,high,low,close,volume
not-a-date,1,2,0.5,1.5,100
still-bad,1.1,2.1,0.6,1.6,120
`,
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  const flatPlan = preview.plans.find((plan) => plan.strategy === 'FLAT');

  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 1);
  assert.deepEqual(preview.invalidFileSamples, [
    { relativePath: 'BROKEN.csv', reason: 'CSV_TIMEFRAME_INVALID' },
  ]);
  assert.deepEqual(
    flatPlan?.files.map((file) => file.symbol),
    ['NOVOL'],
  );
});

test('filename timeframe hint cannot make rows with invalid timestamps confirmable', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-invalid-hinted-time-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await writeCsvWithContent(
    path.join(tempRoot, 'BROKEN_1d.csv'),
    `date,open,high,low,close,volume
not-a-date,1,2,0.5,1.5,100
still-bad,1.1,2.1,0.6,1.6,120
`,
  );

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    (error: unknown) =>
      (error as { code?: unknown }).code === 'CSV_TIMEFRAME_INVALID',
  );
});

test('folder preview emits WITH_PARENT scope candidates per top-level subfolder alongside FLAT', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-scope-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsv(path.join(tempRoot, 'AAPL_1d.csv')),
    writeCsv(path.join(tempRoot, 'group-us', 'MSFT_1d.csv')),
    writeCsv(path.join(tempRoot, 'group-cn', '600519_1d.csv')),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  const flatPlans = preview.planSummaries.filter((plan) => plan.strategy === 'FLAT');
  const withParentPlans = preview.planSummaries.filter(
    (plan) => plan.strategy === 'WITH_PARENT'
  );

  assert.equal(flatPlans.length, 1);
  assert.equal(withParentPlans.length, 2);
  assert.deepEqual(
    withParentPlans.map((plan) => plan.topLevelSubfolder),
    ['group-cn', 'group-us']
  );
  assert.deepEqual(
    withParentPlans.map((plan) => plan.symbolCount),
    [1, 1]
  );
  assert.deepEqual(
    withParentPlans.map((plan) => plan.fileCount),
    [1, 1]
  );
});

test('folder preview keeps valid WITH_PARENT plans when the FLAT plan has duplicate symbols', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-parent-duplicates-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsv(path.join(tempRoot, 'group-us', 'AAPL_1d.csv')),
    writeCsv(path.join(tempRoot, 'group-cn', 'AAPL_1d.csv')),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  assert.equal(
    preview.planSummaries.filter((plan) => plan.strategy === 'FLAT').length,
    0,
  );
  assert.deepEqual(
    preview.planSummaries
      .filter((plan) => plan.strategy === 'WITH_PARENT')
      .map((plan) => plan.topLevelSubfolder)
      .sort(),
    ['group-cn', 'group-us'],
  );
});

test('folder preview rejects header-only files even when the file name has a timeframe hint', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-header-only-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL_1d.csv'),
    'date,open,high,low,close,volume\n',
  );

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'CSV_NO_VALID_BARS',
  );
});

test('folder preview does not treat source_code as an instrument symbol column', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-source-code-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL_1d.csv'),
    createCsvContent(
      ['date', 'source_code', 'open', 'high', 'low', 'close', 'volume'],
      [
        ['2024-01-01', 'vendor-a', '1', '2', '0.5', '1.5', '100'],
        ['2024-01-02', 'vendor-b', '1.1', '2.1', '0.6', '1.6', '120'],
      ],
    ),
  );

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 0);
});

test('folder preview preserves POSIX literal backslashes in relative paths and scope', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows treats backslash as a native path separator');
    return;
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-backslash-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const topLevelSubfolder = 'group\\west';
  const relativePath = `${topLevelSubfolder}/AAPL_1d.csv`;
  const filePath = path.join(tempRoot, topLevelSubfolder, 'AAPL_1d.csv');
  await writeCsv(filePath);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());
  const withParentPlan = preview.plans.find(
    (plan) => plan.strategy === 'WITH_PARENT',
  );

  assert.equal(withParentPlan?.topLevelSubfolder, topLevelSubfolder);
  assert.equal(withParentPlan?.files[0]?.relativePath, relativePath);
  assert.equal(withParentPlan?.files[0]?.originalname, relativePath);
  assert.equal(withParentPlan?.files[0]?.path, filePath);
});

test('folder preview validates headers across the full file set instead of only early samples', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-full-precheck-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const writeTasks = Array.from({ length: 8 }, (_, index) =>
    writeCsvWithContent(
      path.join(tempRoot, `SYMBOL${String(index + 1).padStart(2, '0')}_1d.csv`),
      CSV_CONTENT
    )
  );
  writeTasks.push(
    writeCsvWithContent(
      path.join(tempRoot, 'SYMBOL09_1d.csv'),
      CSV_CONTENT_MISSING_REQUIRED_HEADER
    )
  );
  await Promise.all(writeTasks);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.totalFiles, 9);
  assert.equal(preview.validFiles, 8);
  assert.equal(preview.invalidFiles, 1);
  assert.equal(preview.invalidFileSamples.length, 1);
  assert.equal(preview.invalidFileSamples[0]?.relativePath, 'SYMBOL09_1d.csv');
  assert.equal(preview.invalidFileSamples[0]?.reason, 'CSV_HEADER_SCHEMA_INCONSISTENT');
});

test('folder preview reports real progress across scan, header, timeframe, quality, and done stages', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-progress-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, 'AAPL.csv'), CSV_CONTENT_1M),
    writeCsvWithContent(path.join(tempRoot, 'MSFT.csv'), CSV_CONTENT_1M),
    writeCsvWithContent(path.join(tempRoot, 'NVDA.csv'), CSV_CONTENT_1M),
  ]);

  const progressEvents: Array<{
    stage: string;
    progressPercent: number;
    processedFiles: number;
    totalFiles: number;
  }> = [];
  const preview = await previewLocalDataImportFolderCore(
    tempRoot,
    createPreviewDeps(),
    {
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    },
  );

  assert.equal(preview.validFiles, 3);
  const stages = new Set(progressEvents.map((event) => event.stage));
  assert.ok(stages.has('SCANNING_FILES'));
  assert.ok(stages.has('READING_HEADERS'));
  assert.ok(stages.has('DETECTING_TIMEFRAMES'));
  assert.ok(stages.has('BUILDING_PLAN'));
  assert.ok(stages.has('CHECKING_QUALITY'));
  assert.ok(stages.has('DONE'));
  assert.ok(
    progressEvents.some(
      (event) =>
        event.stage === 'SCANNING_FILES' &&
        event.processedFiles > 0 &&
        event.totalFiles === 0,
    ),
  );
  assert.ok(
    progressEvents.some(
      (event) =>
        event.stage === 'READING_HEADERS' &&
        event.processedFiles === 3 &&
        event.totalFiles === 3,
    ),
  );
  assert.ok(
    progressEvents.some(
      (event) =>
        event.stage === 'DETECTING_TIMEFRAMES' &&
        event.processedFiles === 3 &&
        event.totalFiles === 3,
    ),
  );
  assert.deepEqual(progressEvents.at(-1), {
    stage: 'DONE',
    progressPercent: 100,
    processedFiles: 3,
    totalFiles: 3,
  });
});

test('folder preview job progress coalescer keeps stage and terminal updates without per-file storms', () => {
  const state: PreviewProgressCommitState = {
    lastCommittedAtMs: null,
    lastProgress: null,
  };
  const committed: PreviewLocalDataImportFolderProgress[] = [];
  const commit = (progress: PreviewLocalDataImportFolderProgress, nowMs = 1_000) => {
    if (!shouldCommitPreviewProgressUpdate(state, progress, nowMs)) {
      return false;
    }
    const normalized = normalizePreviewLocalDataImportFolderProgress(progress);
    state.lastCommittedAtMs = nowMs;
    state.lastProgress = normalized;
    committed.push(normalized);
    return true;
  };

  assert.equal(
    commit({
      stage: 'SCANNING_FILES',
      progressPercent: 0,
      processedFiles: 0,
      totalFiles: 0,
    }),
    true,
  );

  for (let index = 1; index <= 80; index += 1) {
    commit({
      stage: 'SCANNING_FILES',
      progressPercent: 0,
      processedFiles: index,
      totalFiles: 0,
    });
  }
  assert.equal(committed.length, 1);

  assert.equal(
    commit({
      stage: 'SCANNING_FILES',
      progressPercent: 0,
      processedFiles: 81,
      totalFiles: 0,
    }, 1_125),
    true,
  );
  assert.equal(
    commit({
      stage: 'READING_HEADERS',
      progressPercent: 10,
      processedFiles: 0,
      totalFiles: 100,
    }, 1_126),
    true,
  );
  assert.equal(
    commit({
      stage: 'DONE',
      progressPercent: 100,
      processedFiles: 100,
      totalFiles: 100,
    }, 1_127),
    true,
  );

  assert.deepEqual(
    committed.map((event) => event.stage),
    ['SCANNING_FILES', 'SCANNING_FILES', 'READING_HEADERS', 'DONE'],
  );
});

test('folder preview rejects CSV headers that exceed shared input limits', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-header-limit-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsv(path.join(tempRoot, 'AAPL_1d.csv')),
    writeCsvWithContent(
      path.join(tempRoot, 'MSFT_1d.csv'),
      createCsvContent(
        ['date', 'open', 'high', 'low', 'close', 'x'.repeat(INPUT_LIMITS.csvHeaderChars + 1)],
        [['2024-01-01', '1', '2', '0.5', '1.5', '100']],
      ),
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 1);
  assert.equal(preview.invalidFileSamples[0]?.relativePath, 'MSFT_1d.csv');
  assert.equal(preview.invalidFileSamples[0]?.reason, 'CSV_HEADER_READ_FAILED');
});

test('tabular preview rejects CSV cells that exceed shared input limits', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-preview-cell-limit-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  await writeCsvWithContent(
    filePath,
    createCsvContent(
      ['date', 'open', 'high', 'low', 'close', 'volume'],
      [['2024-01-01', '1', '2', '0.5', '1.5', 'x'.repeat(INPUT_LIMITS.importCellChars + 1)]],
    ),
  );

  await assert.rejects(
    () => readTabularPreviewRowsFromPath(filePath),
    isImportLimitError('csvCellChars'),
  );
});

test('folder preview rejects import trees that exceed depth and file size limits before parsing files', async (t) => {
  const depthRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-depth-limit-'));
  const sizeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-size-limit-'));
  t.after(async () => {
    await Promise.all([
      fs.rm(depthRoot, { recursive: true, force: true }),
      fs.rm(sizeRoot, { recursive: true, force: true }),
    ]);
  });

  let deepDir = depthRoot;
  for (let index = 0; index < IMPORT_LIMITS.maxDepth + 1; index += 1) {
    deepDir = path.join(deepDir, `d${index}`);
  }
  await writeCsvWithContent(path.join(deepDir, 'AAPL_1d.csv'), CSV_CONTENT);
  await assert.rejects(
    () => previewLocalDataImportFolderCore(depthRoot, createPreviewDeps()),
    isImportLimitError('depth')
  );

  const largeFilePath = path.join(sizeRoot, 'AAPL_1d.csv');
  await fs.mkdir(sizeRoot, { recursive: true });
  await fs.writeFile(largeFilePath, '');
  await fs.truncate(largeFilePath, IMPORT_LIMITS.maxSingleFileBytes + 1);
  await assert.rejects(
    () => previewLocalDataImportFolderCore(sizeRoot, createPreviewDeps()),
    isImportLimitError('singleFileBytes')
  );
});

test('folder preview rejects more supported files than the import hard limit', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-count-limit-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  for (let index = 0; index <= IMPORT_LIMITS.maxFiles; index += 1) {
    await fs.writeFile(
      path.join(tempRoot, `SYMBOL${String(index).padStart(4, '0')}_1d.csv`),
      ''
    );
  }

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    isImportLimitError('files')
  );
});

test('folder preview recognizes common vendor OHLCV header families', async (t) => {
  const cases = [
    {
      name: 'wiki-adjusted',
      fileName: 'AAPL_1d.csv',
      headers: ['date', 'adj_open', 'adj_high', 'adj_low', 'adj_close', 'adj_volume'],
      row: ['2024-01-01', '1', '2', '0.5', '1.5', '100'],
      expected: {
        priceFamily: 'ADJUSTED',
        date: 'date',
        open: 'adj_open',
        volume: 'adj_volume',
      },
    },
    {
      name: 'yahoo',
      fileName: 'MSFT_1d.csv',
      headers: ['Date', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'],
      row: ['2024-01-01', '1', '2', '0.5', '1.5', '1.4', '100'],
      expected: {
        priceFamily: 'RAW',
        date: 'Date',
        open: 'Open',
        volume: 'Volume',
      },
    },
    {
      name: 'tushare',
      fileName: '600519_1d.csv',
      headers: ['trade_date', 'open', 'high', 'low', 'close', 'vol'],
      row: ['20240101', '1', '2', '0.5', '1.5', '100'],
      expected: {
        priceFamily: 'RAW',
        date: 'trade_date',
        open: 'open',
        volume: 'vol',
      },
    },
    {
      name: 'mt5',
      fileName: 'EURUSD_1m.csv',
      headers: ['<DATE>', '<TIME>', '<OPEN>', '<HIGH>', '<LOW>', '<CLOSE>', '<TICKVOL>'],
      row: ['2024.01.01', '930', '1', '2', '0.5', '1.5', '100'],
      expected: {
        priceFamily: 'RAW',
        date: '<DATE>',
        time: '<TIME>',
        open: '<OPEN>',
        volume: '<TICKVOL>',
      },
    },
    {
      name: 'tradingview',
      fileName: 'NVDA_1d.csv',
      headers: ['time', 'open', 'high', 'low', 'close', 'Volume'],
      row: ['2024-01-01T09:30:00', '1', '2', '0.5', '1.5', '100'],
      expected: {
        priceFamily: 'RAW',
        date: 'time',
        open: 'open',
        volume: 'Volume',
      },
    },
    {
      name: 'binance',
      fileName: 'BTCUSDT_1m.csv',
      headers: ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time'],
      row: ['1704099600000', '1', '2', '0.5', '1.5', '100', '1704099659999'],
      expected: {
        priceFamily: 'RAW',
        date: 'open_time',
        open: 'open',
        volume: 'volume',
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async (subtest) => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `zinuto-folder-preview-${item.name}-`));
      subtest.after(async () => {
        await fs.rm(tempRoot, { recursive: true, force: true });
      });
      await writeCsvWithContent(
        path.join(tempRoot, item.fileName),
        createCsvContent(item.headers, [item.row])
      );

      const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

      assert.equal(preview.validFiles, 1);
      assert.equal(preview.invalidFiles, 0);
      assert.equal(preview.mappingProfile.priceFamily, item.expected.priceFamily);
      assert.equal(preview.defaultMapping.date, item.expected.date);
      assert.equal(preview.defaultMapping.open, item.expected.open);
      assert.equal(preview.defaultMapping.volume, item.expected.volume);
      if (item.expected.time) {
        assert.equal(preview.defaultMapping.timestampMode, 'SPLIT');
        assert.equal(preview.defaultMapping.time, item.expected.time);
      }
    });
  }
});

test('folder preview accepts split datetime columns with zero placeholder date time', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-split-datetime-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(tempRoot, 'SZ000001.csv'),
    createCsvContent(
      ['datetime', 'time', 'open', 'close', 'high', 'low', 'volume'],
      [
        ['2025/3/3 00:00', '14:31:00', '10', '10.1', '10.2', '9.9', '100'],
        ['2025/3/3 00:00', '14:32:00', '10.1', '10.2', '10.3', '10', '120'],
        ['2025/3/3 00:00', '14:33:00', '10.2', '10.3', '10.4', '10.1', '140'],
        ['2025/3/3 00:00', '14:34:00', '10.3', '10.4', '10.5', '10.2', '160'],
      ]
    )
  );

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 0);
  assert.equal(preview.detectedTimeframe, '1m');
  assert.equal(preview.defaultMapping.timestampMode, 'SPLIT');
  assert.equal(preview.defaultMapping.date, 'datetime');
  assert.equal(preview.defaultMapping.time, 'time');
  assert.equal(preview.plans[0]?.files[0]?.mapping?.timestampMode, 'SPLIT');
});

test('folder preview rejects raw and adjusted OHLC mixing without a complete family', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-mixed-adjusted-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL_1d.csv'),
    createCsvContent(
      ['date', 'adj_open', 'adj_high', 'adj_low', 'close', 'volume'],
      [['2024-01-01', '1', '2', '0.5', '1.5', '100']]
    )
  );

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === 'CSV_HEADER_SCHEMA_INCONSISTENT'
  );
});

test('folder preview accepts OHLC files without volume and defaults mapping volume to empty', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-no-volume-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(path.join(tempRoot, 'AAPL_1d.csv'), CSV_CONTENT_WITHOUT_VOLUME);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 1);
  assert.equal(preview.invalidFiles, 0);
  assert.equal(preview.defaultMapping.volume, '');
});

test('folder preview allows mixed files where volume exists for only some symbols', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-mixed-volume-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, 'AAPL_1d.csv'), CSV_CONTENT),
    writeCsvWithContent(path.join(tempRoot, 'MSFT_1d.csv'), CSV_CONTENT_WITHOUT_VOLUME),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 2);
  assert.equal(preview.invalidFiles, 0);
  assert.equal(preview.defaultMapping.volume, 'volume');
});

test('folder preview does not treat shared timestamps across symbols as duplicate conflicts', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-cross-symbol-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsvWithContent(
      path.join(tempRoot, 'AAPL_1d.csv'),
      createCsvContent(
        ['date', 'open', 'high', 'low', 'close', 'volume'],
        [
          ['2024-01-01', '1', '2', '0.5', '1.5', '100'],
          ['2024-01-02', '1.1', '2.1', '0.6', '1.6', '120'],
        ]
      )
    ),
    writeCsvWithContent(
      path.join(tempRoot, 'MSFT_1d.csv'),
      createCsvContent(
        ['date', 'open', 'high', 'low', 'close', 'volume'],
        [
          ['2024-01-01', '10', '20', '5', '15', '1000'],
          ['2024-01-02', '11', '21', '6', '16', '1200'],
        ]
      )
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 2);
  assert.equal(preview.invalidFiles, 0);
  assert.equal(preview.repairSummary.sample.duplicateTimestampRows, 0);
  assert.equal(preview.repairSummary.sample.conflictingDuplicateTimestampRows, 0);
  assert.equal(preview.repairSummary.warnings.includes('DUPLICATE_TIMESTAMP_CONFLICT'), false);
});

test('folder preview reports conservative repairs and blocks unsafe data repairs', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-repair-summary-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL_1m.csv'),
    createCsvContent(
      ['date', 'time', 'open', 'high', 'low', 'close'],
      [
        ['20240101', '930', '"1,000"', '"2,000"', '500', '"1,500"'],
        ['20240101', '931', '1', '0.5', '2', '1.5'],
        ['20240101', '932', '-1', '2', '0.5', '1.5'],
        ['20240101', '933', '1', '2', '0.5', '2.5'],
        ['20240101', '934', '1', '2', '0.5', '1.5'],
        ['20240101', '934', '1', '2', '0.5', '1.7'],
      ]
    )
  );

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 1);
  assert.equal(preview.defaultMapping.timestampMode, 'SPLIT');
  assert.ok(preview.repairSummary.applied.includes('MISSING_VOLUME_DEFAULT_ZERO'));
  assert.ok(preview.repairSummary.applied.includes('SPLIT_TIME_ZERO_PADDED'));
  assert.ok(preview.repairSummary.applied.includes('NUMERIC_THOUSANDS_SEPARATOR'));
  assert.ok(preview.repairSummary.warnings.includes('HIGH_LOW_REVERSED'));
  assert.ok(preview.repairSummary.warnings.includes('NEGATIVE_PRICE'));
  assert.ok(preview.repairSummary.warnings.includes('OHLC_OUT_OF_RANGE'));
  assert.ok(preview.repairSummary.warnings.includes('DUPLICATE_TIMESTAMP_CONFLICT'));
  assert.equal(preview.repairSummary.sample.conflictingDuplicateTimestampRows, 1);
});

test('folder preview distinguishes high and low confidence time zone suggestions', async (t) => {
  const lowRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-low-tz-'));
  const highRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-high-tz-'));
  t.after(async () => {
    await fs.rm(lowRoot, { recursive: true, force: true });
    await fs.rm(highRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(lowRoot, '123ABC_1d.csv'),
    createCsvContent(
      ['date', 'open', 'high', 'low', 'close'],
      [['2024-01-01', '1', '2', '0.5', '1.5']]
    )
  );
  await writeCsvWithContent(
    path.join(highRoot, '123ABC_1m.csv'),
    createCsvContent(
      ['date', 'open', 'high', 'low', 'close'],
      [['2024-01-01T09:30:00Z', '1', '2', '0.5', '1.5']]
    )
  );

  const lowPreview = await previewLocalDataImportFolderCore(lowRoot, createPreviewDeps());
  const highPreview = await previewLocalDataImportFolderCore(highRoot, createPreviewDeps());
  const existingSourcePreview = await previewLocalDataImportFolderCore(
    lowRoot,
    createPreviewDeps(),
    { existingSourceTimeZone: 'Asia/Tokyo' }
  );

  assert.equal(lowPreview.timeZoneSuggestion.confidence, 'LOW');
  assert.equal(lowPreview.timeZoneSuggestion.reason, 'SYSTEM_FALLBACK');
  assert.equal(highPreview.timeZoneSuggestion.confidence, 'HIGH');
  assert.ok(highPreview.timeZoneSuggestion.reasons.some((reason) => reason.code === 'TIMESTAMP_OFFSET'));
  assert.equal(existingSourcePreview.timeZoneSuggestion.confidence, 'HIGH');
  assert.equal(existingSourcePreview.timeZoneSuggestion.reason, 'EXISTING_SOURCE');
  assert.equal(existingSourcePreview.suggestedTimeZone, 'Asia/Tokyo');
});

test('folder preview does not mark trading calendar high confidence from narrow file coverage', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-calendar-coverage-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const content = createDenseIntradayCsvContent();
  await Promise.all(
    Array.from({ length: 405 }, (_, index) =>
      writeCsvWithContent(
        path.join(tempRoot, `LOCAL${String(index).padStart(4, '0')}_1m.csv`),
        content
      )
    )
  );

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.validFiles, 405);
  assert.equal(preview.tradingCalendarSuggestion.origin, 'DETECTED');
  assert.equal(preview.tradingCalendarSuggestion.confidence, 'MEDIUM');
  assert.ok(preview.tradingCalendarSuggestion.sampleCount >= 50);
});

test('folder preview uses distributed timestamp samples for intraday calendar inference', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-calendar-distributed-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(tempRoot, 'LOCALALPHA_1m.csv'),
    createDenseOneMinuteIntradayCsvContent(),
  );

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps());

  assert.equal(preview.suggestedFreeReplayEnvironment, null);
  assert.equal(preview.tradingCalendarSuggestion.origin, 'DETECTED');
  assert.equal(preview.tradingCalendarSuggestion.confidence, 'HIGH');
  assert.ok(preview.tradingCalendarSuggestion.sampleCount > 128);
  assert.deepEqual(preview.tradingCalendarSuggestion.calendar.sessions, [
    { startMinute: 570, endMinute: 689, crossesMidnight: false },
    { startMinute: 780, endMinute: 899, crossesMidnight: false },
  ]);
});

test('folder preview prefers canonical trading calendar when market preset is recognized', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-calendar-preset-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const importRoot = path.join(tempRoot, '沪深A股导入_1m_csv');

  await writeCsvWithContent(
    path.join(importRoot, 'SZ000001_1m.csv'),
    createMorningOnlyOneMinuteCsvContent(),
  );

  const preview = await previewLocalDataImportFolderCore(importRoot, createPreviewDeps());

  assert.equal(preview.suggestedFreeReplayEnvironment?.marketPresetId, 'A_SHARE');
  assert.equal(preview.tradingCalendarSuggestion.origin, 'PRESET_DEFAULT');
  assert.equal(preview.tradingCalendarSuggestion.confidence, 'HIGH');
  assert.deepEqual(preview.tradingCalendarSuggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(preview.tradingCalendarSuggestion.calendar.sessions, [
    { startMinute: 570, endMinute: 690, crossesMidnight: false },
    { startMinute: 780, endMinute: 900, crossesMidnight: false },
  ]);
});

test('folder preview infers common import time zones from deterministic rules', async (t) => {
  const roots: string[] = [];
  t.after(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  const makeRoot = async (prefix: string): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  };
  const previewSingle = async (
    prefix: string,
    fileName: string,
    headers: string[],
    rows: string[][]
  ) => {
    const root = await makeRoot(prefix);
    await writeCsvWithContent(path.join(root, fileName), createCsvContent(headers, rows));
    return previewLocalDataImportFolderCore(root, createPreviewDeps());
  };

  const usPreview = await previewSingle(
    'zinuto-folder-preview-yahoo-nasdaq-',
    'AAPL.csv',
    ['datetime', 'open', 'high', 'low', 'close', 'volume'],
    [
      ['2024-01-02T14:30:00Z', '1', '2', '0.5', '1.5', '100'],
      ['2024-01-02T14:31:00Z', '1.1', '2.1', '0.6', '1.6', '120'],
      ['2024-01-02T14:32:00Z', '1.2', '2.2', '0.7', '1.7', '140'],
    ]
  );
  assert.equal(usPreview.suggestedTimeZone, 'America/New_York');
  assert.equal(usPreview.timeZoneSuggestion.confidence, 'HIGH');
  assert.ok(usPreview.timeZoneSuggestion.reasons.some((reason) => reason.code === 'SESSION_WINDOW_MATCH'));

  const tushareRoot = await makeRoot('zinuto-folder-preview-tushare-');
  await writeCsvWithContent(
    path.join(tushareRoot, '1d', '600519.csv'),
    createCsvContent(
      ['trade_date', 'open', 'high', 'low', 'close', 'vol'],
      [
        ['20240101', '1', '2', '0.5', '1.5', '100'],
        ['20240102', '1.1', '2.1', '0.6', '1.6', '120'],
        ['20240103', '1.2', '2.2', '0.7', '1.7', '140'],
      ]
    )
  );
  const tusharePreview = await previewLocalDataImportFolderCore(tushareRoot, createPreviewDeps());
  assert.equal(tusharePreview.suggestedTimeZone, 'Asia/Shanghai');
  assert.equal(tusharePreview.timeZoneSuggestion.confidence, 'HIGH');

  const stockCases = [
    ['0700.HK.csv', 'Asia/Hong_Kong'],
    ['7203.T.csv', 'Asia/Tokyo'],
    ['005930.KS.csv', 'Asia/Seoul'],
    ['2330.TW.csv', 'Asia/Taipei'],
  ] as const;
  for (const [fileName, expectedTimeZone] of stockCases) {
    const preview = await previewSingle(
      `zinuto-folder-preview-${fileName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-`,
      fileName,
      ['date', 'open', 'high', 'low', 'close', 'volume'],
      [
        ['2024-01-01', '1', '2', '0.5', '1.5', '100'],
        ['2024-01-02', '1.1', '2.1', '0.6', '1.6', '120'],
        ['2024-01-03', '1.2', '2.2', '0.7', '1.7', '140'],
      ]
    );
    assert.equal(preview.suggestedTimeZone, expectedTimeZone);
    assert.equal(preview.timeZoneSuggestion.confidence, 'HIGH');
  }

  const cmePreview = await previewSingle(
    'zinuto-folder-preview-cme-',
    'ESM4.csv',
    ['date', 'open', 'high', 'low', 'close', 'volume'],
    [
      ['2024-01-01', '1', '2', '0.5', '1.5', '100'],
      ['2024-01-02', '1.1', '2.1', '0.6', '1.6', '120'],
      ['2024-01-03', '1.2', '2.2', '0.7', '1.7', '140'],
    ]
  );
  assert.equal(cmePreview.suggestedTimeZone, 'America/Chicago');
  assert.equal(cmePreview.timeZoneSuggestion.confidence, 'HIGH');

  const shfePreview = await previewSingle(
    'zinuto-folder-preview-shfe-',
    'RB2405.csv',
    ['date', 'open', 'high', 'low', 'close', 'volume'],
    [
      ['2024-01-01', '1', '2', '0.5', '1.5', '100'],
      ['2024-01-02', '1.1', '2.1', '0.6', '1.6', '120'],
      ['2024-01-03', '1.2', '2.2', '0.7', '1.7', '140'],
    ]
  );
  assert.equal(shfePreview.suggestedTimeZone, 'Asia/Shanghai');
  assert.equal(shfePreview.timeZoneSuggestion.confidence, 'HIGH');

  const binancePreview = await previewSingle(
    'zinuto-folder-preview-binance-',
    'BTCUSDT.csv',
    ['open_time', 'open', 'high', 'low', 'close', 'volume'],
    [
      ['1704099600000', '1', '2', '0.5', '1.5', '100'],
      ['1704099660000', '1.1', '2.1', '0.6', '1.6', '120'],
      ['1704099720000', '1.2', '2.2', '0.7', '1.7', '140'],
    ]
  );
  assert.equal(binancePreview.suggestedTimeZone, 'Etc/UTC');
  assert.equal(binancePreview.timeZoneSuggestion.confidence, 'HIGH');
});

test('folder preview keeps ambiguous timezone evidence low confidence', async (t) => {
  const roots: string[] = [];
  t.after(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  const makeRoot = async (prefix: string): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  };

  const mt5Root = await makeRoot('zinuto-folder-preview-mt5-');
  await writeCsvWithContent(
    path.join(mt5Root, 'EURUSD.csv'),
    createCsvContent(
      ['<DATE>', '<TIME>', '<OPEN>', '<HIGH>', '<LOW>', '<CLOSE>', '<TICKVOL>'],
      [
        ['2024.01.02', '09:30', '1', '2', '0.5', '1.5', '100'],
        ['2024.01.02', '09:31', '1.1', '2.1', '0.6', '1.6', '120'],
        ['2024.01.02', '09:32', '1.2', '2.2', '0.7', '1.7', '140'],
      ]
    )
  );
  const mt5Preview = await previewLocalDataImportFolderCore(mt5Root, createPreviewDeps());
  assert.equal(mt5Preview.timeZoneSuggestion.confidence, 'LOW');

  const utcRoot = await makeRoot('zinuto-folder-preview-offset-only-');
  await writeCsvWithContent(
    path.join(utcRoot, '123ABC.csv'),
    createCsvContent(
      ['datetime', 'open', 'high', 'low', 'close'],
      [
        ['2024-01-02T14:30:00Z', '1', '2', '0.5', '1.5'],
        ['2024-01-02T14:31:00Z', '1.1', '2.1', '0.6', '1.6'],
        ['2024-01-02T14:32:00Z', '1.2', '2.2', '0.7', '1.7'],
      ]
    )
  );
  const utcPreview = await previewLocalDataImportFolderCore(utcRoot, createPreviewDeps());
  assert.equal(utcPreview.suggestedTimeZone, 'Etc/UTC');
  assert.equal(utcPreview.timeZoneSuggestion.reason, 'TIMESTAMP_INFERRED');
  assert.equal(utcPreview.timeZoneSuggestion.confidence, 'HIGH');

  const conflictRoot = await makeRoot('zinuto-folder-preview-hkex-hong-kong-hk-stock-conflict-');
  await writeCsvWithContent(
    path.join(conflictRoot, 'AAPL.US.csv'),
    createCsvContent(
      ['date', 'open', 'high', 'low', 'close'],
      [
        ['2024-01-01', '1', '2', '0.5', '1.5'],
        ['2024-01-02', '1.1', '2.1', '0.6', '1.6'],
        ['2024-01-03', '1.2', '2.2', '0.7', '1.7'],
      ]
    )
  );
  const conflictPreview = await previewLocalDataImportFolderCore(conflictRoot, createPreviewDeps());
  assert.equal(conflictPreview.timeZoneSuggestion.confidence, 'LOW');

  const existingSourcePreview = await previewLocalDataImportFolderCore(
    mt5Root,
    createPreviewDeps(),
    { existingSourceTimeZone: 'Asia/Tokyo' }
  );
  assert.equal(existingSourcePreview.suggestedTimeZone, 'Asia/Tokyo');
  assert.equal(existingSourcePreview.timeZoneSuggestion.reason, 'EXISTING_SOURCE');
  assert.equal(existingSourcePreview.timeZoneSuggestion.confidence, 'HIGH');
});

test('folder preview splits mixed timeframe folders into separate import plans', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-folder-preview-mixed-timeframe-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await Promise.all([
    writeCsvWithContent(path.join(tempRoot, 'AAPL_1d.csv'), CSV_CONTENT),
    writeCsvWithContent(path.join(tempRoot, 'BTCUSDT_1m.csv'), CSV_CONTENT_1M),
    writeCsvWithContent(path.join(tempRoot, 'group-asia', '700HK_1d.csv'), CSV_CONTENT),
    writeCsvWithContent(path.join(tempRoot, 'group-asia', 'ETHUSDT_1m.csv'), CSV_CONTENT_1M),
  ]);

  const preview = await previewLocalDataImportFolderCore(tempRoot, createPreviewDeps(), {
    locale: 'zh-CN',
  });
  const flatPlans = preview.planSummaries.filter((plan) => plan.strategy === 'FLAT');
  const withParentPlans = preview.planSummaries.filter((plan) => plan.strategy === 'WITH_PARENT');

  assert.equal(preview.validFiles, 4);
  assert.equal(preview.invalidFiles, 0);
  assert.deepEqual(preview.detectedTimeframes, ['1m', '1d']);
  assert.deepEqual(
    flatPlans.map((plan) => [plan.baseTimeframe, plan.fileCount, plan.symbolCount]),
    [
      ['1m', 2, 2],
      ['1d', 2, 2],
    ],
  );
  assert.deepEqual(
    withParentPlans.map((plan) => [plan.topLevelSubfolder, plan.baseTimeframe, plan.fileCount]),
    [
      ['group-asia', '1m', 1],
      ['group-asia', '1d', 1],
    ],
  );
  const flatPlanNames = preview.confirmableImportPlans
    .filter((plan) => plan.strategy === 'FLAT')
    .map((plan) => plan.defaultPoolName);
  assert.ok(flatPlanNames.some((name) => name.endsWith('-1分钟')));
  assert.ok(flatPlanNames.some((name) => name.endsWith('-日K')));
});

test('folder preview keeps compact daily stock and index schemas in one daily plan', async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-folder-preview-flat-daily-regression-'),
  );
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const dailyDates = ['20120104', '20120105', '20120106', '20120109'];
  await Promise.all([
    writeCsvWithContent(
      path.join(tempRoot, 'SH600000.csv'),
      createCsvContent(
        [
          'trade_date',
          'stock_code',
          'open',
          'high',
          'low',
          'close',
          'volume',
          'amount',
          'preClose',
          'suspendFlag',
          'time',
        ],
        dailyDates.map((tradeDate, index) => [
          tradeDate,
          '600000.SH',
          '10',
          '11',
          '9',
          '10.5',
          '1000',
          '10500',
          '10',
          '0',
          String(Date.UTC(2012, 0, 4 + index)),
        ]),
      ),
    ),
    ...['SH000300.csv', 'SH000905.csv'].map((fileName) =>
      writeCsvWithContent(
        path.join(tempRoot, fileName),
        createCsvContent(
          [
            'trade_date',
            'index_code',
            'source_code',
            'open',
            'high',
            'low',
            'close',
            'volume',
            'amount',
            'pct_chg',
          ],
          dailyDates.map((tradeDate) => [
            tradeDate,
            fileName.slice(0, -4),
            'source',
            '10',
            '11',
            '9',
            '10.5',
            '1000',
            '10500',
            '0.5',
          ]),
        ),
      ),
    ),
  ]);

  const preview = await previewLocalDataImportFolderCore(
    tempRoot,
    createPreviewDeps(),
  );
  const flatPlans = preview.planSummaries.filter(
    (plan) => plan.strategy === 'FLAT',
  );

  assert.equal(preview.totalFiles, 3);
  assert.equal(preview.validFiles, 3);
  assert.equal(preview.invalidFiles, 0);
  assert.deepEqual(preview.detectedTimeframes, ['1d']);
  assert.deepEqual(
    flatPlans.map((plan) => [plan.baseTimeframe, plan.fileCount]),
    [['1d', 3]],
  );
});

test('folder preview trusts sampled timestamps over a misleading path timeframe hint', async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-folder-preview-data-over-path-'),
  );
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL_1m.csv'),
    createCsvContent(
      ['date', 'open', 'high', 'low', 'close'],
      [
        ['2024-01-02', '1', '2', '0.5', '1.5'],
        ['2024-01-03', '1.1', '2.1', '0.6', '1.6'],
        ['2024-01-04', '1.2', '2.2', '0.7', '1.7'],
      ],
    ),
  );

  const preview = await previewLocalDataImportFolderCore(
    tempRoot,
    createPreviewDeps(),
  );

  assert.deepEqual(preview.detectedTimeframes, ['1d']);
  assert.equal(preview.planSummaries[0]?.baseTimeframe, '1d');
});

test('folder preview uses the selected source folder name instead of the internal staging name', async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'staged-internal-import-name-'),
  );
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  await writeCsvWithContent(
    path.join(tempRoot, 'AAPL.csv'),
    CSV_CONTENT_WITHOUT_VOLUME,
  );

  const preview = await previewLocalDataImportFolderCore(
    tempRoot,
    createPreviewDeps(),
    { locale: 'zh-CN', sourceFolderName: 'flat_daily_csv' },
  );

  assert.equal(preview.folderName, 'flat_daily_csv');
  assert.ok(
    preview.confirmableImportPlans.every((plan) =>
      plan.defaultPoolName.startsWith('flat_daily_csv-'),
    ),
  );
  assert.ok(
    preview.confirmableImportPlans.every(
      (plan) => !plan.defaultPoolName.includes('staged-internal-import-name'),
    ),
  );
});
