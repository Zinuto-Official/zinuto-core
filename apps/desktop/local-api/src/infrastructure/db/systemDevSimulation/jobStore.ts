// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import { readAppPreferencesRow } from "../preferences/appPreferencesStore.js";
import {
  clamp,
  nowIso,
  type SupportedBaseTimeframe,
  type SystemDevSimulationEnabledInstrument,
  type SystemDevSimulationEnabledPool,
} from "../../../domain/systemDevSimulation/sharedDomain.js";
import {
  countSystemDevSimulationEnabledPairs,
  resolveSystemDevSimulationEffectivePlan,
  resolveSystemDevSimulationProfileId,
  type SystemDevSimulationCalibrationObservation,
  type SystemDevSimulationEffectivePlan,
  type SystemDevSimulationProfileId,
} from "@zinuto/shared/systemDevSimulationProfiles";
import {
  getSystemDevSimulationCopy,
  resolveAppUiLanguage,
} from "@zinuto/shared/systemDevSimulationCopy";
import type {
  LocalizedMessageToken,
  MessageId,
  MessagePrimitive,
  MessageValues,
} from "@zinuto/shared/i18n";
import type {
  MutableSystemDevSimulationJob,
  PersistedSystemDevSimulationJobRecord,
  StartSystemDevSimulationPayload,
  SystemDevSimulationJobCreatedCounts,
  SystemDevSimulationJobCurrentWorkload,
  SystemDevSimulationJobMetrics,
  SystemDevSimulationJobPhase,
  SystemDevSimulationJobSnapshot,
  SystemDevSimulationJobThroughput,
} from "./jobTypes.js";
import { SYSTEM_DEV_SIMULATION_JOBS } from "./jobRegistry.js";

export type {
  MutableSystemDevSimulationJob,
  StartSystemDevSimulationPayload,
  SystemDevSimulationJobCreatedCounts,
  SystemDevSimulationJobCurrentWorkload,
  SystemDevSimulationJobMetrics,
  SystemDevSimulationJobPhase,
  SystemDevSimulationJobSnapshot,
  SystemDevSimulationJobStatus,
  SystemDevSimulationJobThroughput,
} from "./jobTypes.js";
export { SYSTEM_DEV_SIMULATION_JOBS } from "./jobRegistry.js";

const RETAINED_FINISHED_SYSTEM_DEV_SIMULATION_JOBS_MAX = 4;
const SYSTEM_DEV_SIMULATION_RECORD_VERSION = 4;

const resolveStoredAppUiLanguage = (): unknown => {
  const row = readAppPreferencesRow(nowIso());
  const encoded = String(row.ui_settings_json ?? "").trim();
  if (!encoded) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return (parsed as Record<string, unknown>).language;
  } catch {
    return undefined;
  }
};

const resolveSystemDevSimulationCopy = () =>
  getSystemDevSimulationCopy(
    resolveAppUiLanguage(resolveStoredAppUiLanguage()),
  );

const emptyCreatedCounts = (): SystemDevSimulationJobCreatedCounts => ({
  trainingProjects: 0,
  replayNotes: 0,
  independentCustomNotes: 0,
  specialTrainingSessions: 0,
  specialTrainingQuestions: 0,
  specialTrainingBanks: 0,
  questionLedger: 0,
  customIndicatorProfiles: 0,
  realBacktestBatches: 0,
  desktopMutableRuns: 0,
});

const emptyCalibrationObservation =
  (): SystemDevSimulationCalibrationObservation => ({
    freeReplayAverageMs: null,
    fastDecisionAverageMs: null,
    riskDisciplineAverageMs: null,
    customNoteAverageMs: null,
  });

const emptyMetrics = (): SystemDevSimulationJobMetrics => ({
  retryCount: 0,
  phaseElapsedMs: 0,
  verificationStatus: "PENDING",
  workloadAverageMs: emptyCalibrationObservation(),
});

const emptyThroughput = (): SystemDevSimulationJobThroughput => ({
  completedItems: 0,
  itemsPerMinute: 0,
});

const cloneEffectivePlan = (
  plan: SystemDevSimulationEffectivePlan | null | undefined,
): SystemDevSimulationEffectivePlan | null =>
  plan ? JSON.parse(JSON.stringify(plan)) : null;

const cloneCreatedCounts = (
  counts: Partial<SystemDevSimulationJobCreatedCounts> | null | undefined,
): SystemDevSimulationJobCreatedCounts => ({
  trainingProjects: Math.max(
    0,
    Math.floor(Number(counts?.trainingProjects) || 0),
  ),
  replayNotes: Math.max(0, Math.floor(Number(counts?.replayNotes) || 0)),
  independentCustomNotes: Math.max(
    0,
    Math.floor(Number(counts?.independentCustomNotes) || 0),
  ),
  specialTrainingSessions: Math.max(
    0,
    Math.floor(Number(counts?.specialTrainingSessions) || 0),
  ),
  specialTrainingQuestions: Math.max(
    0,
    Math.floor(Number(counts?.specialTrainingQuestions) || 0),
  ),
  specialTrainingBanks: Math.max(
    0,
    Math.floor(Number(counts?.specialTrainingBanks) || 0),
  ),
  questionLedger: Math.max(0, Math.floor(Number(counts?.questionLedger) || 0)),
  customIndicatorProfiles: Math.max(
    0,
    Math.floor(Number(counts?.customIndicatorProfiles) || 0),
  ),
  realBacktestBatches: Math.max(
    0,
    Math.floor(Number(counts?.realBacktestBatches) || 0),
  ),
  desktopMutableRuns: Math.max(
    0,
    Math.floor(Number(counts?.desktopMutableRuns) || 0),
  ),
});

const normalizeSystemDevSimulationEnabledInstruments = (
  pool: Partial<SystemDevSimulationEnabledPool>,
  baseTimeframe: SupportedBaseTimeframe,
): SystemDevSimulationEnabledInstrument[] => {
  const normalizedInstruments: SystemDevSimulationEnabledInstrument[] = [];
  const seenInstrumentIds = new Set<string>();
  for (const instrument of Array.isArray(pool?.instruments)
    ? pool.instruments
    : []) {
    const instrumentId = String(instrument?.instrumentId ?? "").trim();
    const symbol = String(instrument?.symbol ?? "")
      .trim()
      .toUpperCase();
    const instrumentBaseTimeframe = String(
      instrument?.baseTimeframe || baseTimeframe,
    ).trim() as SupportedBaseTimeframe;
    const assetClass =
      instrument?.assetClass === "FUTURES" ||
      instrument?.assetClass === "FOREX" ||
      instrument?.assetClass === "CRYPTO"
        ? instrument.assetClass
        : instrument?.assetClass === "STOCK"
          ? instrument.assetClass
          : pool.assetClass === "FUTURES" ||
              pool.assetClass === "FOREX" ||
              pool.assetClass === "CRYPTO" ||
              pool.assetClass === "STOCK"
            ? pool.assetClass
            : null;
    const marketPresetId = String(instrument?.marketPresetId ?? "").trim();
    const sourceKind = instrument?.sourceKind === "SYSTEM" ? "SYSTEM" : "LOCAL";
    const sourceId = String(instrument?.sourceId ?? pool.id ?? "").trim();
    const sourceName = String(instrument?.sourceName ?? pool.name ?? "").trim();
    if (
      !instrumentId ||
      !symbol ||
      !assetClass ||
      !marketPresetId ||
      !sourceId ||
      !sourceName ||
      seenInstrumentIds.has(instrumentId) ||
      (instrumentBaseTimeframe !== "1m" &&
        instrumentBaseTimeframe !== "5m" &&
        instrumentBaseTimeframe !== "1h" &&
        instrumentBaseTimeframe !== "1d")
    ) {
      continue;
    }
    seenInstrumentIds.add(instrumentId);
    normalizedInstruments.push({
      instrumentId,
      symbol,
      baseTimeframe: instrumentBaseTimeframe,
      barCount: Math.max(0, Math.floor(Number(instrument?.barCount) || 0)),
      assetClass,
      marketPresetId:
        marketPresetId as SystemDevSimulationEnabledInstrument["marketPresetId"],
      sourceKind,
      sourceId,
      sourceName,
    });
  }
  return normalizedInstruments;
};

const normalizeCalibrationObservation = (
  value: Partial<SystemDevSimulationCalibrationObservation> | null | undefined,
): SystemDevSimulationCalibrationObservation => ({
  freeReplayAverageMs:
    Number.isFinite(Number(value?.freeReplayAverageMs)) &&
    Number(value?.freeReplayAverageMs) > 0
      ? Number(value?.freeReplayAverageMs)
      : null,
  fastDecisionAverageMs:
    Number.isFinite(Number(value?.fastDecisionAverageMs)) &&
    Number(value?.fastDecisionAverageMs) > 0
      ? Number(value?.fastDecisionAverageMs)
      : null,
  riskDisciplineAverageMs:
    Number.isFinite(Number(value?.riskDisciplineAverageMs)) &&
    Number(value?.riskDisciplineAverageMs) > 0
      ? Number(value?.riskDisciplineAverageMs)
      : null,
  customNoteAverageMs:
    Number.isFinite(Number(value?.customNoteAverageMs)) &&
    Number(value?.customNoteAverageMs) > 0
      ? Number(value?.customNoteAverageMs)
      : null,
});

const normalizeMetrics = (
  value: Partial<SystemDevSimulationJobMetrics> | null | undefined,
): SystemDevSimulationJobMetrics => ({
  retryCount: Math.max(0, Math.floor(Number(value?.retryCount) || 0)),
  phaseElapsedMs: Math.max(0, Math.floor(Number(value?.phaseElapsedMs) || 0)),
  verificationStatus:
    value?.verificationStatus === "SUCCESS" ||
    value?.verificationStatus === "FAILED"
      ? value.verificationStatus
      : "PENDING",
  workloadAverageMs: normalizeCalibrationObservation(value?.workloadAverageMs),
});

const normalizeThroughput = (
  value: Partial<SystemDevSimulationJobThroughput> | null | undefined,
): SystemDevSimulationJobThroughput => ({
  completedItems: Math.max(0, Math.floor(Number(value?.completedItems) || 0)),
  itemsPerMinute: Math.max(0, Number(value?.itemsPerMinute) || 0),
});

const normalizeCurrentWorkload = (
  value: Partial<SystemDevSimulationJobCurrentWorkload> | null | undefined,
): SystemDevSimulationJobCurrentWorkload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const phase = resolveSystemDevSimulationJobPhase({ phase: value.phase });
  const workload =
    value.workload === "FAST_DECISION" ||
    value.workload === "RISK_DISCIPLINE" ||
    value.workload === "CUSTOM_NOTE" ||
    value.workload === "CUSTOM_INDICATORS" ||
    value.workload === "REAL_BACKTEST" ||
    value.workload === "DESKTOP_MUTABLE" ||
    value.workload === "VERIFYING"
      ? value.workload
      : "FREE_REPLAY";
  const startedAt = String(value.startedAt ?? "").trim();
  const updatedAt = String(value.updatedAt ?? "").trim();
  if (!startedAt || !updatedAt) {
    return null;
  }
  return {
    phase,
    workload,
    index:
      Number.isFinite(Number(value.index)) && Number(value.index) >= 0
        ? Math.floor(Number(value.index))
        : null,
    current: Math.max(0, Math.floor(Number(value.current) || 0)),
    target: Math.max(0, Math.floor(Number(value.target) || 0)),
    startedAt,
    updatedAt,
  };
};

export const normalizeSystemDevSimulationEnabledPools = (
  pools: Array<Partial<SystemDevSimulationEnabledPool>> | null | undefined,
): SystemDevSimulationEnabledPool[] => {
  const normalizedPools: SystemDevSimulationEnabledPool[] = [];
  const seenPoolKeys = new Set<string>();
  for (const pool of Array.isArray(pools) ? pools : []) {
    const id = String(pool?.id || "").trim();
    const name = String(pool?.name || "").trim();
    const assetClass =
      pool?.assetClass === "FUTURES" ||
      pool?.assetClass === "FOREX" ||
      pool?.assetClass === "CRYPTO"
        ? pool.assetClass
        : pool?.assetClass === "STOCK"
          ? pool.assetClass
          : null;
    const baseTimeframe = String(
      pool?.baseTimeframe || "",
    ).trim() as SupportedBaseTimeframe;
    const symbols = Array.from(
      new Set(
        [
          ...(Array.isArray(pool?.symbols) ? pool.symbols : []),
          ...(Array.isArray(pool?.instruments)
            ? pool.instruments.map((instrument) => instrument?.symbol ?? "")
            : []),
        ]
          .map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol) => symbol.length > 0),
      ),
    );
    const instruments = normalizeSystemDevSimulationEnabledInstruments(
      pool,
      baseTimeframe,
    );
    if (
      !id ||
      !name ||
      !assetClass ||
      (!symbols.length && !instruments.length) ||
      (baseTimeframe !== "1m" &&
        baseTimeframe !== "5m" &&
        baseTimeframe !== "1h" &&
        baseTimeframe !== "1d")
    ) {
      continue;
    }
    const poolKey = `${baseTimeframe}::${id}`;
    if (seenPoolKeys.has(poolKey)) {
      continue;
    }
    seenPoolKeys.add(poolKey);
    normalizedPools.push({
      id,
      name,
      assetClass,
      baseTimeframe,
      symbols,
      ...(instruments.length ? { instruments } : {}),
    });
  }
  return normalizedPools;
};

export const normalizeSystemDevSimulationPayload = (
  payload: Partial<StartSystemDevSimulationPayload> | null | undefined,
): StartSystemDevSimulationPayload | null => {
  const profileId = resolveSystemDevSimulationProfileId(payload?.profileId);
  const repeatMode = payload?.repeatMode === "APPEND" ? "APPEND" : "REPLACE";
  const enabledSamplePools = normalizeSystemDevSimulationEnabledPools(
    payload?.enabledSamplePools,
  );
  const batchId = String(payload?.batchId ?? "").trim();
  const batchSeed = String(payload?.batchSeed ?? "").trim();
  const requestedTargets = payload?.targets;
  const targets =
    requestedTargets && typeof requestedTargets === "object"
      ? {
          freeReplayTarget: Math.max(
            0,
            Math.floor(Number(requestedTargets.freeReplayTarget) || 0),
          ),
          fastDecisionTarget: Math.max(
            0,
            Math.floor(Number(requestedTargets.fastDecisionTarget) || 0),
          ),
          riskDisciplineTarget: Math.max(
            0,
            Math.floor(Number(requestedTargets.riskDisciplineTarget) || 0),
          ),
          independentCustomNotes: Math.max(
            0,
            Math.floor(Number(requestedTargets.independentCustomNotes) || 0),
          ),
          customIndicatorProfiles: Math.max(
            0,
            Math.floor(Number(requestedTargets.customIndicatorProfiles) || 0),
          ),
          realBacktestBatches: Math.max(
            0,
            Math.floor(Number(requestedTargets.realBacktestBatches) || 0),
          ),
        }
      : null;

  if (!batchId || !batchSeed || !targets) {
    return null;
  }

  return {
    profileId,
    repeatMode,
    targets,
    enabledSamplePools,
    batchId,
    batchSeed,
  };
};

export const resolveSystemDevSimulationJobPhase = (
  job:
    | Partial<
        Pick<
          MutableSystemDevSimulationJob,
          | "phase"
          | "freeReplayCompleted"
          | "freeReplayTarget"
          | "fastDecisionCompleted"
          | "fastDecisionTarget"
          | "riskDisciplineCompleted"
          | "riskDisciplineTarget"
          | "createdCounts"
          | "effectivePlan"
        >
      >
    | null
    | undefined,
): SystemDevSimulationJobPhase => {
  const phase = job?.phase;
  if (
    phase === "CALIBRATING" ||
    phase === "FREE_REPLAY" ||
    phase === "FAST_DECISION" ||
    phase === "RISK_DISCIPLINE" ||
    phase === "CUSTOM_INDICATORS" ||
    phase === "REAL_BACKTEST" ||
    phase === "DESKTOP_MUTABLE" ||
    phase === "VERIFYING" ||
    phase === "DONE"
  ) {
    return phase;
  }
  if (
    job?.effectivePlan?.profileId === "STRESS" &&
    !job.effectivePlan.calibrated
  ) {
    return "CALIBRATING";
  }
  if (
    (job?.createdCounts?.realBacktestBatches ?? 0) <
    (job?.effectivePlan?.targets.realBacktestBatches ?? 0)
  ) {
    return "REAL_BACKTEST";
  }
  if (
    (job?.createdCounts?.customIndicatorProfiles ?? 0) <
    (job?.effectivePlan?.targets.customIndicatorProfiles ?? 0)
  ) {
    return "CUSTOM_INDICATORS";
  }
  if ((job?.riskDisciplineCompleted ?? 0) >= (job?.riskDisciplineTarget ?? 0)) {
    return (job?.createdCounts?.desktopMutableRuns ?? 0) > 0
      ? "DONE"
      : "DESKTOP_MUTABLE";
  }
  if ((job?.fastDecisionCompleted ?? 0) >= (job?.fastDecisionTarget ?? 0)) {
    return "RISK_DISCIPLINE";
  }
  if ((job?.freeReplayCompleted ?? 0) >= (job?.freeReplayTarget ?? 0)) {
    return "FAST_DECISION";
  }
  return "FREE_REPLAY";
};

export const updateSystemDevSimulationJobProgress = (
  job: MutableSystemDevSimulationJob,
): void => {
  const completed =
    job.freeReplayCompleted +
    job.fastDecisionCompleted +
    job.riskDisciplineCompleted +
    job.createdCounts.independentCustomNotes +
    job.createdCounts.customIndicatorProfiles +
    job.createdCounts.realBacktestBatches +
    Math.min(1, job.createdCounts.desktopMutableRuns) +
    (job.metrics.verificationStatus === "SUCCESS" ? 1 : 0);
  if (job.status === "SUCCESS") {
    job.progressPercent = 100;
    return;
  }
  job.progressPercent = clamp(
    Math.round((completed / Math.max(1, job.totalTarget)) * 100),
    0,
    99,
  );
};

export const snapshotSystemDevSimulationJob = (
  job: MutableSystemDevSimulationJob,
): SystemDevSimulationJobSnapshot => ({
  id: job.id,
  profileId: job.profileId,
  status: job.status,
  progressPercent: job.progressPercent,
  phase: job.phase,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  freeReplayCompleted: job.freeReplayCompleted,
  freeReplayTarget: job.freeReplayTarget,
  fastDecisionCompleted: job.fastDecisionCompleted,
  fastDecisionTarget: job.fastDecisionTarget,
  riskDisciplineCompleted: job.riskDisciplineCompleted,
  riskDisciplineTarget: job.riskDisciplineTarget,
  totalTarget: job.totalTarget,
  currentMessage: job.currentMessage,
  currentMessageToken: job.currentMessageToken ?? null,
  errorMessage: job.errorMessage,
  errorMessageToken: job.errorMessageToken ?? null,
  errorCode: job.errorCode,
  errorArgs: job.errorArgs,
  effectivePlan: cloneEffectivePlan(job.effectivePlan),
  elapsedMs: Math.max(0, Math.floor(Number(job.elapsedMs) || 0)),
  estimatedRemainingMs:
    Number.isFinite(Number(job.estimatedRemainingMs)) &&
    Number(job.estimatedRemainingMs) >= 0
      ? Math.floor(Number(job.estimatedRemainingMs))
      : null,
  throughput: normalizeThroughput(job.throughput),
  createdCounts: cloneCreatedCounts(job.createdCounts),
  currentWorkload: normalizeCurrentWorkload(job.currentWorkload),
  canCancel:
    (job.status === "QUEUED" || job.status === "RUNNING") &&
    Boolean(job.canCancel),
  cancelRequested: Boolean(job.cancelRequested),
  metrics: normalizeMetrics(job.metrics),
});

const toMutableSystemDevSimulationJob = (
  snapshot: SystemDevSimulationJobSnapshot,
  payload: StartSystemDevSimulationPayload | null = null,
): MutableSystemDevSimulationJob => ({
  ...snapshot,
  effectivePlan: cloneEffectivePlan(snapshot.effectivePlan),
  throughput: normalizeThroughput(snapshot.throughput),
  createdCounts: cloneCreatedCounts(snapshot.createdCounts),
  metrics: normalizeMetrics(snapshot.metrics),
  currentWorkload: normalizeCurrentWorkload(snapshot.currentWorkload),
  payload,
  phaseStartedAt: snapshot.startedAt,
});

const toSystemDevSimulationJobTimestamp = (
  job: Pick<MutableSystemDevSimulationJob, "startedAt" | "finishedAt">,
): number => {
  const candidateTimestamp = Math.max(
    Date.parse(job.finishedAt ?? ""),
    Date.parse(job.startedAt ?? ""),
  );
  return Number.isFinite(candidateTimestamp) ? candidateTimestamp : 0;
};

const trimFinishedSystemDevSimulationJobs = (): void => {
  const finishedJobs = Array.from(SYSTEM_DEV_SIMULATION_JOBS.values())
    .filter((job) => job.status !== "QUEUED" && job.status !== "RUNNING")
    .sort(
      (left, right) =>
        toSystemDevSimulationJobTimestamp(right) -
        toSystemDevSimulationJobTimestamp(left),
    );
  if (finishedJobs.length <= RETAINED_FINISHED_SYSTEM_DEV_SIMULATION_JOBS_MAX) {
    return;
  }
  finishedJobs
    .slice(RETAINED_FINISHED_SYSTEM_DEV_SIMULATION_JOBS_MAX)
    .forEach((job) => {
      SYSTEM_DEV_SIMULATION_JOBS.delete(job.id);
    });
};

export const upsertSystemDevSimulationJob = (
  job: MutableSystemDevSimulationJob,
): void => {
  SYSTEM_DEV_SIMULATION_JOBS.set(job.id, job);
  trimFinishedSystemDevSimulationJobs();
};

const readPersistedSimulationJobRecord = (): string =>
  String(
    db
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .pluck()
      .get("system_dev_simulation_last_job_v1") ?? "",
  ).trim();

export const persistSystemDevSimulationJobSnapshot = (
  job: MutableSystemDevSimulationJob,
): void => {
  const record: PersistedSystemDevSimulationJobRecord = {
    version: SYSTEM_DEV_SIMULATION_RECORD_VERSION,
    snapshot: snapshotSystemDevSimulationJob(job),
    payload:
      job.status === "QUEUED" || job.status === "RUNNING" ? job.payload : null,
  };
  db.prepare(
    `INSERT INTO app_meta (key,value,updated_at)
     VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run("system_dev_simulation_last_job_v1", JSON.stringify(record), nowIso());
};

export const clearPersistedSystemDevSimulationJobSnapshot = (): void => {
  db.prepare("DELETE FROM app_meta WHERE key = ?").run(
    "system_dev_simulation_last_job_v1",
  );
};

const isLocalizedMessagePrimitive = (
  value: unknown,
): value is MessagePrimitive =>
  value == null ||
  value instanceof Date ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const normalizeLocalizedMessageTokenValues = (
  values: unknown,
): MessageValues | undefined => {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return undefined;
  }
  const normalizedEntries = Object.entries(values).filter(
    ([key, value]) => key.trim() && isLocalizedMessagePrimitive(value),
  );
  if (!normalizedEntries.length) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries) as MessageValues;
};

const parseLocalizedMessageToken = (
  candidate: unknown,
): LocalizedMessageToken | null => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const id = String((candidate as { id?: unknown }).id ?? "").trim();
  const fallback = String(
    (candidate as { fallback?: unknown }).fallback ?? "",
  ).trim();
  if (!id || !fallback) {
    return null;
  }
  const values = normalizeLocalizedMessageTokenValues(
    (candidate as { values?: unknown }).values,
  );
  return {
    id: id as MessageId,
    fallback,
    ...(values ? { values } : {}),
  };
};

const resolveFallbackEffectivePlan = (
  profileId: SystemDevSimulationProfileId,
  enabledSamplePools: SystemDevSimulationEnabledPool[],
  calibration?: Partial<SystemDevSimulationCalibrationObservation> | null,
): SystemDevSimulationEffectivePlan =>
  resolveSystemDevSimulationEffectivePlan({
    profileId,
    enabledPairCount: countSystemDevSimulationEnabledPairs(enabledSamplePools),
    calibration,
  });

export const parsePersistedSystemDevSimulationJobSnapshot =
  (): MutableSystemDevSimulationJob | null => {
    const raw = readPersistedSimulationJobRecord();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as
        | Partial<SystemDevSimulationJobSnapshot>
        | Partial<PersistedSystemDevSimulationJobRecord>;
      const snapshotCandidate =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "snapshot" in parsed &&
        parsed.snapshot &&
        typeof parsed.snapshot === "object" &&
        !Array.isArray(parsed.snapshot)
          ? (parsed.snapshot as Partial<SystemDevSimulationJobSnapshot>)
          : (parsed as Partial<SystemDevSimulationJobSnapshot>);
      const persistedPayload =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "snapshot" in parsed
          ? normalizeSystemDevSimulationPayload(
              parsed.payload as Partial<StartSystemDevSimulationPayload> | null,
            )
          : null;
      const id = String(snapshotCandidate.id ?? "").trim();
      if (!id) {
        return null;
      }
      const profileId = resolveSystemDevSimulationProfileId(
        snapshotCandidate.profileId,
      );
      const effectivePlan =
        snapshotCandidate.effectivePlan &&
        typeof snapshotCandidate.effectivePlan === "object" &&
        !Array.isArray(snapshotCandidate.effectivePlan)
          ? cloneEffectivePlan(
              snapshotCandidate.effectivePlan as SystemDevSimulationEffectivePlan,
            )
          : persistedPayload
            ? resolveFallbackEffectivePlan(
                profileId,
                persistedPayload.enabledSamplePools,
              )
            : null;
      const defaultTargets = effectivePlan?.targets ?? {
        freeReplayTarget: Math.max(
          1,
          Math.floor(Number(snapshotCandidate.freeReplayTarget) || 0),
        ),
        fastDecisionTarget: Math.max(
          1,
          Math.floor(Number(snapshotCandidate.fastDecisionTarget) || 0),
        ),
        riskDisciplineTarget: Math.max(
          1,
          Math.floor(Number(snapshotCandidate.riskDisciplineTarget) || 0),
        ),
        independentCustomNotes: 0,
      };
      const freeReplayTarget = Math.max(
        defaultTargets.freeReplayTarget,
        Math.floor(Number(snapshotCandidate.freeReplayCompleted) || 0),
      );
      const fastDecisionTarget = Math.max(
        defaultTargets.fastDecisionTarget,
        Math.floor(Number(snapshotCandidate.fastDecisionCompleted) || 0),
      );
      const riskDisciplineTarget = Math.max(
        defaultTargets.riskDisciplineTarget,
        Math.floor(Number(snapshotCandidate.riskDisciplineCompleted) || 0),
      );
      const freeReplayCompleted = clamp(
        Math.floor(Number(snapshotCandidate.freeReplayCompleted) || 0),
        0,
        freeReplayTarget,
      );
      const fastDecisionCompleted = clamp(
        Math.floor(Number(snapshotCandidate.fastDecisionCompleted) || 0),
        0,
        fastDecisionTarget,
      );
      const riskDisciplineCompleted = clamp(
        Math.floor(Number(snapshotCandidate.riskDisciplineCompleted) || 0),
        0,
        riskDisciplineTarget,
      );
      const currentMessageToken = parseLocalizedMessageToken(
        snapshotCandidate.currentMessageToken,
      );
      const errorMessageToken = parseLocalizedMessageToken(
        snapshotCandidate.errorMessageToken,
      );
      const defaultQueuedMessage =
        resolveSystemDevSimulationCopy().jobMessages.queued;
      const currentMessage =
        String(snapshotCandidate.currentMessage ?? "").trim() ||
        currentMessageToken?.fallback ||
        defaultQueuedMessage;
      const errorMessage =
        (typeof snapshotCandidate.errorMessage === "string" &&
          snapshotCandidate.errorMessage.trim()) ||
        errorMessageToken?.fallback ||
        null;
      const status =
        snapshotCandidate.status === "RUNNING" ||
        snapshotCandidate.status === "SUCCESS" ||
        snapshotCandidate.status === "FAILED" ||
        snapshotCandidate.status === "INTERRUPTED"
          ? snapshotCandidate.status
          : "QUEUED";
      const normalizedPhase =
        snapshotCandidate.phase === "CALIBRATING" ||
        snapshotCandidate.phase === "FREE_REPLAY" ||
        snapshotCandidate.phase === "FAST_DECISION" ||
        snapshotCandidate.phase === "RISK_DISCIPLINE" ||
        snapshotCandidate.phase === "DESKTOP_MUTABLE" ||
        snapshotCandidate.phase === "VERIFYING" ||
        snapshotCandidate.phase === "DONE"
          ? snapshotCandidate.phase
          : null;
      const snapshot: SystemDevSimulationJobSnapshot = {
        id,
        profileId,
        status,
        progressPercent: clamp(
          Number(snapshotCandidate.progressPercent) || 0,
          0,
          100,
        ),
        phase: resolveSystemDevSimulationJobPhase({
          ...(normalizedPhase ? { phase: normalizedPhase } : {}),
          freeReplayCompleted,
          freeReplayTarget,
          fastDecisionCompleted,
          fastDecisionTarget,
          riskDisciplineCompleted,
          riskDisciplineTarget,
          effectivePlan,
        }),
        startedAt:
          typeof snapshotCandidate.startedAt === "string" &&
          snapshotCandidate.startedAt.trim()
            ? snapshotCandidate.startedAt
            : null,
        finishedAt:
          typeof snapshotCandidate.finishedAt === "string" &&
          snapshotCandidate.finishedAt.trim()
            ? snapshotCandidate.finishedAt
            : null,
        freeReplayCompleted,
        freeReplayTarget,
        fastDecisionCompleted,
        fastDecisionTarget,
        riskDisciplineCompleted,
        riskDisciplineTarget,
        totalTarget: Math.max(
          1,
          Math.floor(
            Number(snapshotCandidate.totalTarget) ||
              freeReplayTarget + fastDecisionTarget + riskDisciplineTarget,
          ),
        ),
        currentMessage,
        currentMessageToken: currentMessageToken ?? null,
        errorMessage,
        errorMessageToken: errorMessageToken ?? null,
        errorCode:
          typeof snapshotCandidate.errorCode === "string" &&
          snapshotCandidate.errorCode.trim()
            ? snapshotCandidate.errorCode
            : null,
        errorArgs:
          snapshotCandidate.errorArgs &&
          typeof snapshotCandidate.errorArgs === "object" &&
          !Array.isArray(snapshotCandidate.errorArgs)
            ? (snapshotCandidate.errorArgs as Record<
                string,
                string | number | boolean | null
              >)
            : null,
        effectivePlan,
        elapsedMs: Math.max(
          0,
          Math.floor(Number(snapshotCandidate.elapsedMs) || 0),
        ),
        estimatedRemainingMs:
          Number.isFinite(Number(snapshotCandidate.estimatedRemainingMs)) &&
          Number(snapshotCandidate.estimatedRemainingMs) >= 0
            ? Math.floor(Number(snapshotCandidate.estimatedRemainingMs))
            : null,
        throughput: normalizeThroughput(snapshotCandidate.throughput),
        createdCounts: cloneCreatedCounts(snapshotCandidate.createdCounts),
        currentWorkload: normalizeCurrentWorkload(
          snapshotCandidate.currentWorkload,
        ),
        canCancel:
          snapshotCandidate.canCancel !== undefined
            ? Boolean(snapshotCandidate.canCancel)
            : status === "QUEUED" || status === "RUNNING",
        cancelRequested: Boolean(snapshotCandidate.cancelRequested),
        metrics: normalizeMetrics(snapshotCandidate.metrics),
      };
      return toMutableSystemDevSimulationJob(snapshot, persistedPayload);
    } catch {
      return null;
    }
  };

export const buildRecoveredSystemDevSimulationJobSnapshot =
  (): MutableSystemDevSimulationJob | null => null;

export const releaseSystemDevSimulationJobPayload = (
  job: MutableSystemDevSimulationJob,
): void => {
  job.payload = null;
};

export const getLatestSystemDevSimulationJobInternal =
  (): MutableSystemDevSimulationJob | null => {
    let latestJob: MutableSystemDevSimulationJob | null = null;
    let latestTimestamp = -1;
    for (const job of SYSTEM_DEV_SIMULATION_JOBS.values()) {
      const normalizedTimestamp = toSystemDevSimulationJobTimestamp(job);
      if (!latestJob || normalizedTimestamp >= latestTimestamp) {
        latestJob = job;
        latestTimestamp = normalizedTimestamp;
      }
    }
    return latestJob;
  };

export const hasActiveSystemDevSimulationJob = (): boolean =>
  Array.from(SYSTEM_DEV_SIMULATION_JOBS.values()).some(
    (job) => job.status === "QUEUED" || job.status === "RUNNING",
  );

export const createInitialSystemDevSimulationJob = (input: {
  id: string;
  profileId: SystemDevSimulationProfileId;
  payload: StartSystemDevSimulationPayload;
  effectivePlan: SystemDevSimulationEffectivePlan;
  currentMessage: string;
  currentMessageToken: LocalizedMessageToken;
}): MutableSystemDevSimulationJob => {
  const totalTarget =
    input.effectivePlan.profileId === "STRESS" &&
    !input.effectivePlan.calibrated
      ? (input.effectivePlan.budget.calibrationTargets?.freeReplayTarget ?? 0) +
        (input.effectivePlan.budget.calibrationTargets?.fastDecisionTarget ??
          0) +
        (input.effectivePlan.budget.calibrationTargets?.riskDisciplineTarget ??
          0) +
        (input.effectivePlan.budget.calibrationTargets
          ?.independentCustomNotes ?? 0) +
        2
      : input.effectivePlan.targets.freeReplayTarget +
        input.effectivePlan.targets.fastDecisionTarget +
        input.effectivePlan.targets.riskDisciplineTarget +
        input.effectivePlan.targets.independentCustomNotes +
        input.effectivePlan.targets.customIndicatorProfiles +
        input.effectivePlan.targets.realBacktestBatches +
        2;
  return {
    id: input.id,
    profileId: input.profileId,
    status: "QUEUED",
    progressPercent: 0,
    phase:
      input.effectivePlan.profileId === "STRESS" &&
      !input.effectivePlan.calibrated
        ? "CALIBRATING"
        : "FREE_REPLAY",
    startedAt: null,
    finishedAt: null,
    freeReplayCompleted: 0,
    freeReplayTarget: input.effectivePlan.targets.freeReplayTarget,
    fastDecisionCompleted: 0,
    fastDecisionTarget: input.effectivePlan.targets.fastDecisionTarget,
    riskDisciplineCompleted: 0,
    riskDisciplineTarget: input.effectivePlan.targets.riskDisciplineTarget,
    totalTarget: Math.max(1, totalTarget),
    currentMessage: input.currentMessage,
    currentMessageToken: input.currentMessageToken,
    errorMessage: null,
    errorMessageToken: null,
    errorCode: null,
    errorArgs: null,
    effectivePlan: cloneEffectivePlan(input.effectivePlan),
    elapsedMs: 0,
    estimatedRemainingMs: input.effectivePlan.budget.projectedDurationMs,
    throughput: emptyThroughput(),
    createdCounts: emptyCreatedCounts(),
    currentWorkload: null,
    canCancel: true,
    cancelRequested: false,
    metrics: emptyMetrics(),
    payload: input.payload,
    phaseStartedAt: null,
  };
};
