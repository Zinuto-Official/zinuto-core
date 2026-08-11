// SPDX-License-Identifier: GPL-3.0-only

import {
  api,
  type ApiDesktopWorkspaceReadModel,
  type ApiRecentReplayNoteSummary,
  type ApiSpecialTrainingStatsSummary,
  type ApiTrainingStatsSummary,
} from "@/api";
import type { ResumableSessionSummary, SessionSnapshot } from "@/domains/training/types";

type CommandCenterReadModelLoaderApi = Pick<typeof api, "getWorkspaceReadModel">;

export type CommandCenterActionSnapshot = {
  enabled: boolean;
  reasonCode: string | null;
  facts: Record<string, unknown>;
};

export type CommandCenterDataSummarySnapshot = {
  poolCount: number;
  symbolCount: number;
};

export type CommandCenterReadModelSnapshot = {
  strategyReport: ApiTrainingStatsSummary | null;
  latestResumableSession: ResumableSessionSummary | null;
  latestResumableSnapshot: SessionSnapshot | null;
  fastReport: ApiSpecialTrainingStatsSummary | null;
  riskReport: ApiSpecialTrainingStatsSummary | null;
  recentReplayNotes: ApiRecentReplayNoteSummary[];
  dataCenterSummary: CommandCenterDataSummarySnapshot;
  actions: {
    startTrainer: CommandCenterActionSnapshot;
    resumeTrainer: CommandCenterActionSnapshot;
  };
};

const emptyActionSnapshot = (
  reasonCode: string,
): CommandCenterActionSnapshot => ({
  enabled: false,
  reasonCode,
  facts: {},
});

export const createEmptyCommandCenterReadModelSnapshot =
  (): CommandCenterReadModelSnapshot => ({
    strategyReport: null,
    latestResumableSession: null,
    latestResumableSnapshot: null,
    fastReport: null,
    riskReport: null,
    recentReplayNotes: [],
    dataCenterSummary: {
      poolCount: 0,
      symbolCount: 0,
    },
    actions: {
      startTrainer: emptyActionSnapshot("NO_READY_DATA_SOURCE"),
      resumeTrainer: emptyActionSnapshot("NO_RESUMABLE_SESSION"),
    },
  });

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const toCountWithFallback = (value: unknown, fallback: unknown): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(numeric));
  }
  return toCount(fallback);
};

const readRecordFact = <T,>(value: unknown): T | null => {
  const record = toRecord(value);
  if (!record || Object.keys(record).length === 0) {
    return null;
  }
  return record as T;
};

const readActionSnapshot = (
  model: ApiDesktopWorkspaceReadModel,
  actionId: string,
  fallbackReasonCode: string,
): CommandCenterActionSnapshot => {
  const action = model.actions.find((item) => item.id === actionId);
  if (!action) {
    return emptyActionSnapshot(fallbackReasonCode);
  }
  return {
    enabled: action.enabled,
    reasonCode: action.reasonCode,
    facts: action.facts ?? {},
  };
};

export const readCommandCenterReadModelSnapshot = (
  model: ApiDesktopWorkspaceReadModel,
): CommandCenterReadModelSnapshot => {
  const facts = toRecord(model.facts) ?? {};
  const data = toRecord(facts.data) ?? {};
  const dataCenterSummary = toRecord(facts.dataCenterSummary) ?? {};
  const specialStatsByModeId = toRecord(facts.specialStatsSummariesByModeId) ?? {};

  return {
    strategyReport: readRecordFact<ApiTrainingStatsSummary>(
      facts.trainingStatsSummary,
    ),
    latestResumableSession: readRecordFact<ResumableSessionSummary>(
      facts.latestResumableSession,
    ),
    latestResumableSnapshot: null,
    fastReport: readRecordFact<ApiSpecialTrainingStatsSummary>(
      specialStatsByModeId["fast-decision-training"],
    ),
    riskReport: readRecordFact<ApiSpecialTrainingStatsSummary>(
      specialStatsByModeId["risk-discipline-training"],
    ),
    recentReplayNotes: Array.isArray(facts.recentReplayNotes)
      ? (facts.recentReplayNotes as ApiRecentReplayNoteSummary[])
      : [],
    dataCenterSummary: {
      poolCount: toCountWithFallback(
        dataCenterSummary.poolCount,
        data.sourceCount,
      ),
      symbolCount: toCountWithFallback(
        dataCenterSummary.symbolCount,
        data.symbolCount,
      ),
    },
    actions: {
      startTrainer: readActionSnapshot(
        model,
        "start-trainer",
        "NO_READY_DATA_SOURCE",
      ),
      resumeTrainer: readActionSnapshot(
        model,
        "resume-trainer",
        "NO_RESUMABLE_SESSION",
      ),
    },
  };
};

export const loadCommandCenterReadModelSnapshot = async (
  deps: CommandCenterReadModelLoaderApi = api,
): Promise<CommandCenterReadModelSnapshot> =>
  readCommandCenterReadModelSnapshot(
    await deps.getWorkspaceReadModel("command-center"),
  );
