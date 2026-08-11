// SPDX-License-Identifier: GPL-3.0-only

import {
  buildReplayEquityMetrics as readSharedReplayEquityMaterial,
  calcMaxDrawdownRateFromEquityCurve as readSharedReplayPeakDropRate,
  compactReplaySnapshotForArchive as compactSharedReplaySnapshotForArchive,
  deriveFastDecisionReplayTitleMetrics as readSharedFastDecisionTitleSignals,
  deriveHistoryReplayTitleMetrics as readSharedHistoryTitleSignals,
  deriveRiskDisciplineReplayTitleMetrics as readSharedRiskDisciplineTitleSignals,
  type ReplayCurvePoint,
  type ReplaySnapshotLike as SharedReplaySnapshotLike,
} from '@zinuto/shared/replay';
import { REPLAY_NOTE_SUMMARY_CHIP_MATCHERS } from '@/ui/config/uiConfig';
import type {
  ReplayBarLike,
  ReplaySnapshotLike,
} from '@/app-shell/replayNoteDomainTypes';

export const compactReplaySnapshotForArchive = (
  snapshot: ReplaySnapshotLike,
): ReplaySnapshotLike =>
  compactSharedReplaySnapshotForArchive(
    snapshot as unknown as SharedReplaySnapshotLike,
  ) as unknown as ReplaySnapshotLike;

export const readReplayEquityMaterial = (
  initialCapital: number,
  bars: readonly ReplayBarLike[],
  snapshot: ReplaySnapshotLike,
): {
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  finalEquity: number;
  equityReturnRate: number;
} =>
  readSharedReplayEquityMaterial(
    initialCapital,
    bars,
    snapshot as unknown as SharedReplaySnapshotLike,
  );

export const readMaxReplayPeakDropRate = (
  curve: readonly ReplayCurvePoint[],
): number => readSharedReplayPeakDropRate(curve);

export const readFastDecisionReplayTitleSignals = (
  archive: { noteSummary?: unknown } | null,
): { advantageRatio: string | null; winRate: number | null } =>
  readSharedFastDecisionTitleSignals(
    archive,
    REPLAY_NOTE_SUMMARY_CHIP_MATCHERS,
  );

export const readRiskDisciplineReplayTitleSignals = (
  archive: { noteSummary?: unknown } | null,
): { grade: string | null; recoveryRate: number | null } =>
  readSharedRiskDisciplineTitleSignals(
    archive,
    REPLAY_NOTE_SUMMARY_CHIP_MATCHERS,
  );

export const readHistoryReplayTitleSignals = (
  archive: { tradeRounds?: unknown } | null,
): { profitLossRatio: number | null; winRate: number | null } =>
  readSharedHistoryTitleSignals(archive);
