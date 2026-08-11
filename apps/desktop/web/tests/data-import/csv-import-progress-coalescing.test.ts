// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import type { CsvFolderStagingProgress } from '../../src/api';
import {
  createCsvFolderStagingProgressRafBuffer,
  toCsvFolderStagingPreviewProgressPatch,
} from '../../src/app-shell/appCsvImportPreviewActions';

const makeProgress = (processedFiles: number): CsvFolderStagingProgress =>
  ({
    progressRequestId: 'progress-1',
    stageMode: 'FULL_COPY',
    phase: 'COPYING',
    processedFiles,
    totalFiles: 100,
    processedBytes: processedFiles * 10,
    totalBytes: 1000,
    progressPercent: processedFiles,
  }) as CsvFolderStagingProgress;

test('csv folder staging progress buffers native event storms to one animation-frame state update', () => {
  const patches: Array<ReturnType<typeof toCsvFolderStagingPreviewProgressPatch>> = [];
  const scheduledFrames: FrameRequestCallback[] = [];
  const canceledFrames: number[] = [];
  const buffer = createCsvFolderStagingProgressRafBuffer(
    (patch) => {
      patches.push(patch);
    },
    (callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    },
    (handle) => {
      canceledFrames.push(handle);
    },
  );

  for (let index = 1; index <= 80; index += 1) {
    buffer.push(makeProgress(index));
  }

  assert.equal(patches.length, 0);
  assert.equal(scheduledFrames.length, 1);
  scheduledFrames[0]?.(16);
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.stage, 'STAGING_COPYING');
  assert.equal(patches[0]?.processedFiles, 80);
  assert.equal(patches[0]?.progressPercent, 80);

  buffer.push({
    ...makeProgress(100),
    phase: 'DONE',
    progressPercent: 100,
  });
  assert.equal(canceledFrames.length, 0);
  assert.equal(patches.length, 2);
  assert.equal(patches[1]?.processedFiles, 100);
});
