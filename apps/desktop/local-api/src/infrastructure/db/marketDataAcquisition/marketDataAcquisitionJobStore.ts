// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  desktopMarketDataAcquisitionJobSummarySchema,
  desktopMarketDataAcquisitionMarketJobSchema,
  type DesktopMarketDataAcquisitionJobSummary,
  type DesktopMarketDataAcquisitionMarketJob,
  type DesktopMarketDataAcquisitionMarketJobCreateRequest,
} from '@zinuto/shared/contracts-desktop/api';

export type PersistedAcquisitionJob = {
  id: string;
  status: DesktopMarketDataAcquisitionMarketJob['status'];
  requestJson: string;
  progressJson: string;
  sourceResultsJson: string;
  stagingJson: string | null;
  errorJson: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type AcquisitionJobStore = {
  upsert(job: PersistedAcquisitionJob): void;
  remove(jobId: string): void;
  list(limit: number): PersistedAcquisitionJob[];
  prune(keep: number): string[];
  markRunningInterrupted(errorJson: string, updatedAt: string): string[];
};

export const createMemoryAcquisitionJobStore = (): AcquisitionJobStore => {
  const rows = new Map<string, PersistedAcquisitionJob>();
  const byRecency = (): PersistedAcquisitionJob[] =>
    [...rows.values()].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id),
    );
  return {
    upsert(job) {
      rows.set(job.id, job);
    },
    remove(jobId) {
      rows.delete(jobId);
    },
    list(limit) {
      return byRecency().slice(0, limit);
    },
    prune(keep) {
      const prunedIds = byRecency()
        .filter((row) => row.status !== 'READY_TO_SAVE')
        .slice(keep)
        .map((row) => row.id);
      for (const id of prunedIds) {
        rows.delete(id);
      }
      return prunedIds;
    },
    markRunningInterrupted(errorJson, updatedAt) {
      const interrupted: string[] = [];
      for (const row of rows.values()) {
        if (row.status === 'QUEUED' || row.status === 'RUNNING') {
          rows.set(row.id, {
            ...row,
            status: 'FAILED',
            errorJson,
            updatedAt,
            finishedAt: updatedAt,
          });
          interrupted.push(row.id);
        }
      }
      return interrupted;
    },
  };
};

export const INTERRUPTED_ERROR_JSON = JSON.stringify({
  code: 'ACQUISITION_INTERRUPTED',
  args: { runtimeErrorType: 'INTERRUPTED' },
});

export const serializeMarketJob = (job: {
  id: string;
  status: DesktopMarketDataAcquisitionMarketJob['status'];
  request: unknown;
  progress: unknown;
  sourceResults: unknown;
  staging: unknown;
  error: unknown;
  createdAt: string;
  updatedAt: string;
}): PersistedAcquisitionJob => ({
  id: job.id,
  status: job.status,
  requestJson: JSON.stringify(job.request),
  progressJson: JSON.stringify(job.progress),
  sourceResultsJson: JSON.stringify(job.sourceResults),
  stagingJson: job.staging ? JSON.stringify(job.staging) : null,
  errorJson: job.error ? JSON.stringify(job.error) : null,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  finishedAt:
    job.status === 'FAILED' || job.status === 'CANCELED'
      ? job.updatedAt
      : null,
});

export const parsePersistedMarketJob = async ({
  row,
  stagingRoot,
  jobStore,
}: {
  row: PersistedAcquisitionJob;
  stagingRoot: string;
  jobStore: AcquisitionJobStore;
}): Promise<DesktopMarketDataAcquisitionMarketJob | null> => {
  try {
    const job = desktopMarketDataAcquisitionMarketJobSchema.parse({
      id: row.id,
      status: row.status,
      request: JSON.parse(row.requestJson) as unknown,
      progress: JSON.parse(row.progressJson) as unknown,
      sourceResults: JSON.parse(row.sourceResultsJson || '[]') as unknown,
      staging: row.stagingJson ? JSON.parse(row.stagingJson) as unknown : null,
      error: row.errorJson ? JSON.parse(row.errorJson) as unknown : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    if (job.staging) {
      const manifestPath = path.join(stagingRoot, job.id, 'manifest.json');
      const manifestExists = await fs
        .access(manifestPath)
        .then(() => true)
        .catch(() => false);
      if (!manifestExists) {
        job.staging = null;
        jobStore.upsert(serializeMarketJob(job));
      }
    }
    return job;
  } catch {
    return null;
  }
};

export const buildMarketJobSummary = (
  row: PersistedAcquisitionJob,
): DesktopMarketDataAcquisitionJobSummary | null => {
  try {
    const request = JSON.parse(
      row.requestJson,
    ) as DesktopMarketDataAcquisitionMarketJobCreateRequest;
    const progress = JSON.parse(
      row.progressJson,
    ) as DesktopMarketDataAcquisitionMarketJob['progress'];
    const error = row.errorJson
      ? (JSON.parse(row.errorJson) as DesktopMarketDataAcquisitionMarketJob['error'])
      : null;
    return desktopMarketDataAcquisitionJobSummarySchema.parse({
      id: row.id,
      status: row.status,
      marketId: request.marketId,
      sourcePlanId: request.sourcePlanId,
      timeframe: request.timeframe,
      symbolCount: request.symbols.length,
      completedSymbols: progress.completedSymbols,
      stage: progress.stage,
      error,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch {
    return null;
  }
};

export const listMarketJobSummaries = ({
  jobStore,
  limit,
}: {
  jobStore: AcquisitionJobStore;
  limit: number;
}): DesktopMarketDataAcquisitionJobSummary[] =>
  jobStore
    .list(limit)
    .map(buildMarketJobSummary)
    .filter(
      (job): job is DesktopMarketDataAcquisitionJobSummary => job !== null,
    );

export const restoreMarketAcquisitionJobs = async ({
  stagingRoot,
  jobStore,
  limit,
  marketJobs,
  discardStaging,
  preserveEntryNames,
  nowIso,
}: {
  stagingRoot: string;
  jobStore: AcquisitionJobStore;
  limit: number;
  marketJobs: Map<string, DesktopMarketDataAcquisitionMarketJob>;
  discardStaging: (stagingRoot: string, jobId: string) => Promise<void>;
  preserveEntryNames: string[];
  nowIso: () => string;
}): Promise<void> => {
  await fs.mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  jobStore.markRunningInterrupted(INTERRUPTED_ERROR_JSON, nowIso());
  for (const prunedId of jobStore.prune(limit)) {
    await discardStaging(stagingRoot, prunedId).catch(() => undefined);
  }
  const preserved = new Set(preserveEntryNames);
  const restoredIds = new Set<string>();
  for (const row of jobStore.list(limit)) {
    const job = await parsePersistedMarketJob({ row, stagingRoot, jobStore });
    if (!job) {
      jobStore.remove(row.id);
      await discardStaging(stagingRoot, row.id).catch(() => undefined);
      continue;
    }
    restoredIds.add(job.id);
    marketJobs.set(job.id, job);
  }
  const entries = await fs.readdir(stagingRoot).catch(() => [] as string[]);
  await Promise.all(
    entries.map(async (entry) => {
      if (preserved.has(entry) || restoredIds.has(entry)) return;
      await discardStaging(stagingRoot, entry).catch(() => undefined);
    }),
  );
};
