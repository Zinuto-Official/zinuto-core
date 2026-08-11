// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  localDataFullReimportByPathSchema,
  localDataImportByPathSchema,
  localDataImportDraftValidationSchema,
  localDataImportPreviewByPathSchema,
  localDataIncrementalUpdateByPathSchema,
  localDataSyncQuickCheckByMetadataSchema,
} from '../../src/http/apiSchemas/dataSourceSchemas.js';

const SINGLE_MAPPING = {
  date: 'date',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
} as const;

test('local data HTTP schemas preserve native path text exactly', () => {
  const sourceFolder = '/tmp/source folder ';
  const relativePath = ' group /AAPL .csv ';

  assert.equal(
    localDataImportPreviewByPathSchema.parse({ folderPath: sourceFolder }).folderPath,
    sourceFolder,
  );
  const quickCheck = localDataSyncQuickCheckByMetadataSchema.parse({
    sourceFolder,
    files: [{ relativePath, originalname: 'AAPL .csv ' }],
  });
  assert.equal(quickCheck.sourceFolder, sourceFolder);
  assert.equal(quickCheck.files[0]?.relativePath, relativePath);
  assert.equal(quickCheck.files[0]?.originalname, 'AAPL .csv ');
  assert.equal(
    localDataImportByPathSchema.parse({
      previewToken: 'preview',
      previewPlanId: 'plan',
      userOverrides: { sourceFolder },
    }).userOverrides.sourceFolder,
    sourceFolder,
  );
  assert.equal(
    localDataImportPreviewByPathSchema.safeParse({ folderPath: '   ' }).success,
    false,
  );
  assert.equal(
    localDataSyncQuickCheckByMetadataSchema.safeParse({
      sourceFolder: '   ',
      files: [],
    }).success,
    false,
  );
});

test('confirmed import mapping schemas are strict while draft mapping stays permissive', () => {
  for (const schema of [
    localDataImportByPathSchema,
    localDataFullReimportByPathSchema,
    localDataIncrementalUpdateByPathSchema,
  ]) {
    assert.equal(
      schema.safeParse({
        previewToken: 'preview',
        previewPlanId: 'plan',
        mapping: {},
      }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        previewToken: 'preview',
        previewPlanId: 'plan',
        mapping: {
          ...SINGLE_MAPPING,
          timestampMode: 'SPLIT',
        },
      }).success,
      false,
    );
    const parsed = schema.parse({
      previewToken: 'preview',
      previewPlanId: 'plan',
      mapping: SINGLE_MAPPING,
    });
    assert.deepEqual(parsed.mapping, {
      timestampMode: 'SINGLE',
      ...SINGLE_MAPPING,
      time: '',
      volume: '',
    });
  }

  assert.deepEqual(
    localDataImportDraftValidationSchema.parse({
      previewToken: 'preview',
      mapping: {},
    }).mapping,
    {
      timestampMode: 'SINGLE',
      date: '',
      time: '',
      open: '',
      high: '',
      low: '',
      close: '',
      volume: '',
    },
  );
});
