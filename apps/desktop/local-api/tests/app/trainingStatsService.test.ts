// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-training-stats-service-'),
);
const dbPath = path.join(tempDbDir, 'zinuto.db');
process.env.ZINUTO_DB_PATH = dbPath;

const { db } = await import('../../src/infrastructure/db/database.js');
const {
  getTrainingStatsReport,
  markTrainingStatsDirty,
} = await import('../../src/application/trainingStatsService.js');
const {
  loadTrainingStatsFilterOptionsSnapshot,
} = await import('../../src/infrastructure/db/training/statsRepository.js');

const resetTrainingStatsTables = (): void => {
  db.exec(`
    DELETE FROM training_stats_monthly;
    DELETE FROM training_stats_pool;
    DELETE FROM training_stats_symbol;
    DELETE FROM training_stats_timeframe;
    DELETE FROM training_project_replay_refs;
    DELETE FROM training_stats_sessions;
    DELETE FROM training_projects;
  `);
  markTrainingStatsDirty();
};

const buildSummaryJson = (
  initialAsset: number,
  totalPnl: number,
  totalTrades: number,
  durationDays: number,
): string =>
  JSON.stringify({
    initialAsset,
    endingAsset: initialAsset + totalPnl,
    assetReturnRate: initialAsset > 0 ? totalPnl / initialAsset : 0,
    durationDays,
    totalTrades,
    totalPnl,
    profitRate: initialAsset > 0 ? totalPnl / initialAsset : 0,
    maxDrawdownRate: 0.02,
    tradingCost: 1,
    decisionSecondsUsed: 12,
    decisionCount: 3,
  });

const insertTrainingProject = ({
  id,
  name,
  createdAt,
  samplePoolId,
  samplePoolName,
  symbol,
  totalPnl,
  initialTotal = 1000,
  totalTrades = 3,
  durationDays = 2,
  baseTimeframe = '1d',
}: {
  id: string;
  name: string;
  createdAt: string;
  samplePoolId: string;
  samplePoolName: string;
  symbol: string;
  totalPnl: number;
  initialTotal?: number;
  totalTrades?: number;
  durationDays?: number;
  baseTimeframe?: string;
}): void => {
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,
      training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,
      final_equity,equity_return_rate,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    name,
    createdAt,
    createdAt,
    symbol,
    samplePoolId,
    samplePoolName,
    baseTimeframe,
    `${createdAt.slice(0, 10)}..${createdAt.slice(0, 10)}`,
    initialTotal,
    totalPnl,
    initialTotal > 0 ? totalPnl / initialTotal : 0,
    durationDays,
    totalTrades,
    initialTotal + totalPnl,
    initialTotal > 0 ? totalPnl / initialTotal : 0,
    buildSummaryJson(initialTotal, totalPnl, totalTrades, durationDays),
    'null',
  );
};

const insertTrainingStatsFact = ({
  projectId,
  name,
  createdAt,
  samplePoolId,
  samplePoolName,
  symbol,
  totalPnl,
  generatedAt,
  initialTotal = 1000,
  baseTimeframe = '1d',
}: {
  projectId: string;
  name: string;
  createdAt: string;
  samplePoolId: string;
  samplePoolName: string;
  symbol: string;
  totalPnl: number;
  generatedAt: string;
  initialTotal?: number;
  baseTimeframe?: string;
}): void => {
  db.prepare(
    `INSERT INTO training_stats_sessions (
      project_id,name,created_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,
      training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,
      final_equity,generated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    name,
    createdAt,
    symbol,
    samplePoolId,
    samplePoolName,
    baseTimeframe,
    `${createdAt.slice(0, 10)}..${createdAt.slice(0, 10)}`,
    initialTotal,
    totalPnl,
    initialTotal > 0 ? totalPnl / initialTotal : 0,
    2,
    3,
    initialTotal + totalPnl,
    generatedAt,
  );
};

test.beforeEach(() => {
  resetTrainingStatsTables();
});

test.afterEach(() => {
  resetTrainingStatsTables();
});

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DB_PATH;
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

test('getTrainingStatsReport reads current fact rows without synthesizing missing facts', () => {
  insertTrainingProject({
    id: 'project-existing',
    name: 'Existing fact project',
    createdAt: '2026-01-02T00:00:00.000Z',
    samplePoolId: 'pool-a',
    samplePoolName: 'Pool A',
    symbol: 'AAPL',
    totalPnl: 10,
  });
  insertTrainingProject({
    id: 'project-missing',
    name: 'Missing fact project',
    createdAt: '2026-01-03T00:00:00.000Z',
    samplePoolId: 'pool-b',
    samplePoolName: 'Pool B',
    symbol: 'MSFT',
    totalPnl: 20,
  });
  insertTrainingStatsFact({
    projectId: 'project-existing',
    name: 'Existing fact project',
    createdAt: '2026-01-02T00:00:00.000Z',
    samplePoolId: 'pool-a',
    samplePoolName: 'Pool A',
    symbol: 'AAPL',
    totalPnl: 999,
    generatedAt: '2025-12-31T00:00:00.000Z',
  });
  markTrainingStatsDirty();

  const report = getTrainingStatsReport() as {
    totals: {
      totalProjects: number;
      filteredProjects: number;
    };
    filterOptions: {
      samplePools: Array<{ id: string }>;
    };
  };

  const existingFact = db
    .prepare(
      'SELECT total_pnl, generated_at FROM training_stats_sessions WHERE project_id = ?',
    )
    .get('project-existing') as
    | { total_pnl: number; generated_at: string }
    | undefined;
  const missingFact = db
    .prepare(
      'SELECT total_pnl, generated_at FROM training_stats_sessions WHERE project_id = ?',
    )
    .get('project-missing') as
    | { total_pnl: number; generated_at: string }
    | undefined;
  const totalFacts = Number(
    db.prepare('SELECT COUNT(*) AS count FROM training_stats_sessions').pluck().get() ?? 0,
  );

  assert.equal(report.totals.totalProjects, 1);
  assert.equal(report.totals.filteredProjects, 1);
  assert.equal(totalFacts, 1);
  assert.deepEqual(
    report.filterOptions.samplePools.map((item) => item.id).sort(),
    ['pool-a'],
  );
  assert.deepEqual(existingFact, {
    total_pnl: 999,
    generated_at: '2025-12-31T00:00:00.000Z',
  });
  assert.equal(missingFact, undefined);
});

test('training stats filter snapshot cache refreshes only after dirty invalidation', () => {
  insertTrainingProject({
    id: 'project-a',
    name: 'Snapshot A',
    createdAt: '2026-02-01T00:00:00.000Z',
    samplePoolId: 'pool-a',
    samplePoolName: 'Pool A',
    symbol: 'AAPL',
    totalPnl: 12,
  });
  insertTrainingStatsFact({
    projectId: 'project-a',
    name: 'Snapshot A',
    createdAt: '2026-02-01T00:00:00.000Z',
    samplePoolId: 'pool-a',
    samplePoolName: 'Pool A',
    symbol: 'AAPL',
    totalPnl: 12,
    generatedAt: '2026-02-01T00:00:00.000Z',
  });
  markTrainingStatsDirty();

  const firstSnapshot = loadTrainingStatsFilterOptionsSnapshot();
  assert.equal(firstSnapshot.totalFacts, 1);
  assert.deepEqual(firstSnapshot.samplePools.map((item) => item.id), ['pool-a']);

  insertTrainingProject({
    id: 'project-b',
    name: 'Snapshot B',
    createdAt: '2026-02-02T00:00:00.000Z',
    samplePoolId: 'pool-b',
    samplePoolName: 'Pool B',
    symbol: 'MSFT',
    totalPnl: 24,
  });
  insertTrainingStatsFact({
    projectId: 'project-b',
    name: 'Snapshot B',
    createdAt: '2026-02-02T00:00:00.000Z',
    samplePoolId: 'pool-b',
    samplePoolName: 'Pool B',
    symbol: 'MSFT',
    totalPnl: 24,
    generatedAt: '2026-02-02T00:00:00.000Z',
  });

  const cachedSnapshot = loadTrainingStatsFilterOptionsSnapshot();
  assert.equal(cachedSnapshot.totalFacts, 1);
  assert.deepEqual(cachedSnapshot.samplePools.map((item) => item.id), ['pool-a']);

  markTrainingStatsDirty();

  const refreshedSnapshot = loadTrainingStatsFilterOptionsSnapshot();
  assert.equal(refreshedSnapshot.totalFacts, 2);
  assert.deepEqual(
    refreshedSnapshot.samplePools.map((item) => item.id).sort(),
    ['pool-a', 'pool-b'],
  );
});
