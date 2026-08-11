// SPDX-License-Identifier: GPL-3.0-only

import {
  resolveSpecialTrainingDecisionSecondsLimit,
  resolveSpecialTrainingHorizonBars,
  resolveSpecialTrainingModeQuestionCount,
  type SpecialTrainingModeId,
} from "@zinuto/shared/specialTrainingModes";
import {
  listSpecialTrainingHistorySessions,
  type SpecialTrainingHistorySessionSummary,
} from "./ports/infrastructure/db/specialTraining/historyStore.js";

export type SpecialTrainingDurationEstimateOperatorMode = "HUMAN";

export type SpecialTrainingDurationEstimateBasis =
  | "EXACT_HISTORY"
  | "SIMILAR_HISTORY"
  | "MODE_HISTORY"
  | "FORMULA_FALLBACK";

export type SpecialTrainingDurationEstimatePayload = {
  modeId: SpecialTrainingModeId;
  operatorMode: SpecialTrainingDurationEstimateOperatorMode;
  questionCount: number;
  horizonBars: number;
  decisionSecondsLimit?: number;
};

export type SpecialTrainingDurationEstimateResult = {
  minMinutes: number;
  maxMinutes: number;
  basis: SpecialTrainingDurationEstimateBasis;
  sampleCount: number;
};

type NormalizedDurationEstimateInput = {
  modeId: SpecialTrainingModeId;
  operatorMode: SpecialTrainingDurationEstimateOperatorMode;
  questionCount: number;
  horizonBars: number;
  decisionSecondsLimit: number;
};

type DurationHistorySample = {
  perQuestionSeconds: number;
  horizonBars: number;
  decisionSecondsLimit: number;
  operatorKind: SpecialTrainingDurationEstimateOperatorMode;
};

const MAX_HISTORY_SESSIONS = 200;
const MIN_HISTORY_SAMPLE_COUNT = 3;
const MAX_PER_QUESTION_SECONDS = 3 * 60 * 60;

const DURATION_RANGE_WIDTH_BY_BASIS: Readonly<
  Record<SpecialTrainingDurationEstimateBasis, number>
> = {
  EXACT_HISTORY: 0.1,
  SIMILAR_HISTORY: 0.2,
  MODE_HISTORY: 0.2,
  FORMULA_FALLBACK: 0.25,
};

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const normalizeOperatorMode = (
  _modeId: SpecialTrainingModeId,
  _operatorMode: unknown,
): SpecialTrainingDurationEstimateOperatorMode =>
  "HUMAN";

const parseHistoryConfigNumber = (
  session: SpecialTrainingHistorySessionSummary,
  key: string,
): number => {
  const config = session.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return Number.NaN;
  }
  return toFiniteNumber((config as Record<string, unknown>)[key]);
};

const toHistorySample = (
  session: SpecialTrainingHistorySessionSummary,
): DurationHistorySample | null => {
  const questionCount = Math.max(0, Math.floor(Number(session.questionCount) || 0));
  if (questionCount <= 0) {
    return null;
  }
  const createdAtMs = Date.parse(String(session.createdAt || ""));
  const finishedAtMs = Date.parse(String(session.finishedAt || ""));
  if (
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(finishedAtMs) ||
    finishedAtMs <= createdAtMs
  ) {
    return null;
  }
  const perQuestionSeconds = (finishedAtMs - createdAtMs) / 1000 / questionCount;
  if (
    !Number.isFinite(perQuestionSeconds) ||
    perQuestionSeconds <= 0 ||
    perQuestionSeconds > MAX_PER_QUESTION_SECONDS
  ) {
    return null;
  }
  const horizonBars = parseHistoryConfigNumber(session, "horizonBars");
  const decisionSecondsLimit = parseHistoryConfigNumber(
    session,
    "decisionSecondsLimit",
  );
  return {
    perQuestionSeconds,
    horizonBars: Number.isFinite(horizonBars) ? Math.max(0, Math.floor(horizonBars)) : 0,
    decisionSecondsLimit: Number.isFinite(decisionSecondsLimit)
      ? Math.max(0, Math.floor(decisionSecondsLimit))
      : 0,
    operatorKind: "HUMAN",
  };
};

const quantile = (sortedValues: readonly number[], ratio: number): number => {
  if (!sortedValues.length) {
    return Number.NaN;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? Number.NaN;
  }
  const safeRatio = Math.min(1, Math.max(0, ratio));
  const position = safeRatio * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex] ?? Number.NaN;
  const upper = sortedValues[upperIndex] ?? Number.NaN;
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return Number.NaN;
  }
  if (lowerIndex === upperIndex) {
    return lower;
  }
  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
};

const trimOutliers = (values: readonly number[]): number[] => {
  const sortedValues = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (sortedValues.length <= MIN_HISTORY_SAMPLE_COUNT) {
    return sortedValues;
  }
  const q1 = quantile(sortedValues, 0.25);
  const q3 = quantile(sortedValues, 0.75);
  if (!Number.isFinite(q1) || !Number.isFinite(q3)) {
    return sortedValues;
  }
  const iqr = q3 - q1;
  const lowerBound = Math.max(0, q1 - iqr * 1.5);
  const upperBound = q3 + iqr * 1.5;
  const filteredValues = sortedValues.filter(
    (value) => value >= lowerBound && value <= upperBound,
  );
  return filteredValues.length >= MIN_HISTORY_SAMPLE_COUNT
    ? filteredValues
    : sortedValues;
};

const summarizeMedian = (
  values: readonly number[],
): { median: number; sampleCount: number } | null => {
  const trimmedValues = trimOutliers(values);
  if (trimmedValues.length < MIN_HISTORY_SAMPLE_COUNT) {
    return null;
  }
  const median = quantile(trimmedValues, 0.5);
  if (!Number.isFinite(median) || median <= 0) {
    return null;
  }
  return {
    median,
    sampleCount: trimmedValues.length,
  };
};

const buildEstimateResult = (value: {
  totalSeconds: number;
  basis: SpecialTrainingDurationEstimateBasis;
  sampleCount: number;
}): SpecialTrainingDurationEstimateResult => {
  const totalSeconds = Math.max(1, Number(value.totalSeconds) || 0);
  const widthRatio = DURATION_RANGE_WIDTH_BY_BASIS[value.basis];
  const minMinutes = Math.max(
    1,
    Math.round((totalSeconds * Math.max(0, 1 - widthRatio)) / 60),
  );
  let maxMinutes = Math.max(
    minMinutes,
    Math.round((totalSeconds * (1 + widthRatio)) / 60),
  );
  if (maxMinutes <= minMinutes) {
    maxMinutes = minMinutes + 1;
  }
  return {
    minMinutes,
    maxMinutes,
    basis: value.basis,
    sampleCount: Math.max(0, Math.floor(Number(value.sampleCount) || 0)),
  };
};

const resolveFormulaPerQuestionSeconds = (
  input: NormalizedDurationEstimateInput,
): number =>
  input.modeId === "fast-decision-training"
    ? input.decisionSecondsLimit * 1.15
    : Math.max(input.horizonBars * 1.6, input.horizonBars * 0.72 + 20);

const estimateFromHistoryPool = (
  pool: readonly DurationHistorySample[],
  input: NormalizedDurationEstimateInput,
): {
  perQuestionSeconds: number;
  basis: SpecialTrainingDurationEstimateBasis;
  sampleCount: number;
} | null => {
  if (!pool.length) {
    return null;
  }

  if (input.modeId === "fast-decision-training") {
    const exactByDecision = pool.filter(
      (sample) => sample.decisionSecondsLimit === input.decisionSecondsLimit,
    );
    const exactByDecisionAndHorizon = exactByDecision.filter(
      (sample) => sample.horizonBars === input.horizonBars,
    );
    const exactSummary = summarizeMedian(
      (
        exactByDecisionAndHorizon.length >= MIN_HISTORY_SAMPLE_COUNT
          ? exactByDecisionAndHorizon
          : exactByDecision
      ).map((sample) => sample.perQuestionSeconds),
    );
    if (exactSummary) {
      return {
        perQuestionSeconds: exactSummary.median,
        basis: "EXACT_HISTORY",
        sampleCount: exactSummary.sampleCount,
      };
    }

    const similarByDecision = pool.filter((sample) => sample.decisionSecondsLimit > 0);
    const similarByDecisionAndHorizon = similarByDecision.filter(
      (sample) => sample.horizonBars === input.horizonBars,
    );
    const similarSummary = summarizeMedian(
      (
        similarByDecisionAndHorizon.length >= MIN_HISTORY_SAMPLE_COUNT
          ? similarByDecisionAndHorizon
          : similarByDecision
      ).map((sample) => sample.perQuestionSeconds / sample.decisionSecondsLimit),
    );
    if (similarSummary) {
      return {
        perQuestionSeconds: similarSummary.median * input.decisionSecondsLimit,
        basis: "SIMILAR_HISTORY",
        sampleCount: similarSummary.sampleCount,
      };
    }
  } else {
    const exactByHorizon = pool.filter(
      (sample) => sample.horizonBars === input.horizonBars,
    );
    const exactSummary = summarizeMedian(
      exactByHorizon.map((sample) => sample.perQuestionSeconds),
    );
    if (exactSummary) {
      return {
        perQuestionSeconds: exactSummary.median,
        basis: "EXACT_HISTORY",
        sampleCount: exactSummary.sampleCount,
      };
    }

    const similarByHorizon = pool.filter((sample) => sample.horizonBars > 0);
    const similarSummary = summarizeMedian(
      similarByHorizon.map((sample) => sample.perQuestionSeconds / sample.horizonBars),
    );
    if (similarSummary) {
      return {
        perQuestionSeconds: similarSummary.median * input.horizonBars,
        basis: "SIMILAR_HISTORY",
        sampleCount: similarSummary.sampleCount,
      };
    }
  }

  const modeSummary = summarizeMedian(
    pool.map((sample) => sample.perQuestionSeconds),
  );
  if (!modeSummary) {
    return null;
  }
  return {
    perQuestionSeconds: modeSummary.median,
    basis: "MODE_HISTORY",
    sampleCount: modeSummary.sampleCount,
  };
};

const resolveHistoryPools = (
  samples: readonly DurationHistorySample[],
): DurationHistorySample[][] => {
  const humanSamples = samples.filter((sample) => sample.operatorKind === "HUMAN");
  return [humanSamples];
};

const normalizeInput = (
  payload: SpecialTrainingDurationEstimatePayload,
): NormalizedDurationEstimateInput => ({
  modeId: payload.modeId,
  operatorMode: normalizeOperatorMode(payload.modeId, payload.operatorMode),
  questionCount: resolveSpecialTrainingModeQuestionCount(payload.questionCount),
  horizonBars: resolveSpecialTrainingHorizonBars(payload.modeId, payload.horizonBars),
  decisionSecondsLimit: resolveSpecialTrainingDecisionSecondsLimit(
    payload.modeId,
    payload.decisionSecondsLimit,
  ),
});

export const estimateSpecialTrainingDuration = (
  payload: SpecialTrainingDurationEstimatePayload,
): SpecialTrainingDurationEstimateResult => {
  const input = normalizeInput(payload);
  const historySamples = listSpecialTrainingHistorySessions({
    modeId: input.modeId,
    limit: MAX_HISTORY_SESSIONS,
  })
    .map((session) => toHistorySample(session))
    .filter((sample): sample is DurationHistorySample => Boolean(sample));

  for (const pool of resolveHistoryPools(historySamples)) {
    const historyEstimate = estimateFromHistoryPool(pool, input);
    if (!historyEstimate) {
      continue;
    }
    return buildEstimateResult({
      totalSeconds: historyEstimate.perQuestionSeconds * input.questionCount,
      basis: historyEstimate.basis,
      sampleCount: historyEstimate.sampleCount,
    });
  }

  return buildEstimateResult({
    totalSeconds: resolveFormulaPerQuestionSeconds(input) * input.questionCount,
    basis: "FORMULA_FALLBACK",
    sampleCount: 0,
  });
};
