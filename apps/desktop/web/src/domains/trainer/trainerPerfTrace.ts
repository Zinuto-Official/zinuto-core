// SPDX-License-Identifier: GPL-3.0-only

const TRAINER_PERF_TRACE_GLOBAL_KEY = "__ZINUTO_TRAINER_PERF_TRACE__";
const TRAINER_PERF_TRACE_STORAGE_KEY = "zinuto:trainer-perf-trace";
const TRAINER_PERF_TRACE_PREFIX = "zinuto:trainer-perf";
const AUTO_SHRINK_FLUSH_DELAY_MS = 160;
const HOT_INPUT_STALE_MS = 250;

export const TRAINER_HOT_INTERACTION_BUDGETS = {
  localFeedbackP95Ms: 16,
  visibleAdvanceP95Ms: 100,
  backendActionP95Ms: 80,
  maxLongTaskMs: 50,
  continuousStepSampleCount: 200,
} as const;

export type TrainerHotInteractionAction = "STEP" | "BUY" | "SELL" | "UNDO";

export type TrainerHotInteractionMetricName =
  | "input"
  | "local-feedback"
  | "bridge"
  | "backend-action"
  | "backend-access"
  | "backend-delta"
  | "backend-chart-frame"
  | "backend-serialize"
  | "backend-total"
  | "json-parse"
  | "delta"
  | "chart-paint"
  | "visible-advance"
  | "long-task";

export type TrainerHotInteractionMetricSample = {
  name: TrainerHotInteractionMetricName;
  durationMs: number;
  action?: TrainerHotInteractionAction;
  source?: "keydown" | "pointerdown" | "command" | "bridge" | "backend" | "chart";
  path?: string;
  atMs: number;
};

type TrainerPerfWindow = Window & {
  __zinutoTrainerPerfSpans__?: Map<string, string>;
  __zinutoTrainerHotInteractionMetrics__?: {
    samples: TrainerHotInteractionMetricSample[];
    inputStartedAtByAction: Partial<Record<TrainerHotInteractionAction, number>>;
    longTaskObserverInstalled: boolean;
  };
  __zinutoTrainerPerfAutoShrinkStats__?: {
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
    flushTimerId: number | null;
  };
  [TRAINER_PERF_TRACE_GLOBAL_KEY]?: boolean;
};

const getRuntimeWindow = (): TrainerPerfWindow | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window as TrainerPerfWindow;
};

const roundDurationMs = (value: number): number =>
  Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

const buildMarkName = (label: string): string =>
  `${TRAINER_PERF_TRACE_PREFIX}:${label}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;

const getSpanMarks = (): Map<string, string> | null => {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return null;
  }
  if (!runtimeWindow.__zinutoTrainerPerfSpans__) {
    runtimeWindow.__zinutoTrainerPerfSpans__ = new Map<string, string>();
  }
  return runtimeWindow.__zinutoTrainerPerfSpans__;
};

const getAutoShrinkStats = () => {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return null;
  }
  if (!runtimeWindow.__zinutoTrainerPerfAutoShrinkStats__) {
    runtimeWindow.__zinutoTrainerPerfAutoShrinkStats__ = {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      flushTimerId: null,
    };
  }
  return runtimeWindow.__zinutoTrainerPerfAutoShrinkStats__;
};

const getHotInteractionState = () => {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return null;
  }
  if (!runtimeWindow.__zinutoTrainerHotInteractionMetrics__) {
    runtimeWindow.__zinutoTrainerHotInteractionMetrics__ = {
      samples: [],
      inputStartedAtByAction: {},
      longTaskObserverInstalled: false,
    };
  }
  return runtimeWindow.__zinutoTrainerHotInteractionMetrics__;
};

const nowMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export const isTrainerPerfTraceEnabled = (): boolean => {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return false;
  }
  if (runtimeWindow[TRAINER_PERF_TRACE_GLOBAL_KEY] === true) {
    return true;
  }
  try {
    return (
      runtimeWindow.localStorage.getItem(TRAINER_PERF_TRACE_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
};

export const logTrainerPerf = (
  label: string,
  context?: Record<string, unknown>,
): void => {
  if (!isTrainerPerfTraceEnabled()) {
    return;
  }
  console.info(`[trainer-perf] ${label}`, context ?? {});
};

export const recordTrainerHotInteractionMetric = (
  sample: Omit<TrainerHotInteractionMetricSample, "durationMs" | "atMs"> & {
    durationMs?: number;
  },
): void => {
  if (!isTrainerPerfTraceEnabled()) {
    return;
  }
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  const normalizedSample: TrainerHotInteractionMetricSample = {
    ...sample,
    durationMs: roundDurationMs(sample.durationMs ?? 0),
    atMs: nowMs(),
  };
  state.samples.push(normalizedSample);
  if (state.samples.length > 2_000) {
    state.samples.splice(0, state.samples.length - 2_000);
  }
  logTrainerPerf(`hot-${normalizedSample.name}`, normalizedSample);
};

export const markTrainerHotInteractionInput = (
  action: TrainerHotInteractionAction,
  source: TrainerHotInteractionMetricSample["source"],
): void => {
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  state.inputStartedAtByAction[action] = nowMs();
  recordTrainerHotInteractionMetric({
    name: "input",
    action,
    source,
  });
};

export const ensureTrainerHotInteractionInput = (
  action: TrainerHotInteractionAction,
  source: TrainerHotInteractionMetricSample["source"],
): void => {
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  const inputStartedAt = state.inputStartedAtByAction[action] ?? 0;
  if (nowMs() - inputStartedAt <= HOT_INPUT_STALE_MS) {
    return;
  }
  markTrainerHotInteractionInput(action, source);
};

export const markTrainerHotInteractionLocalFeedback = (
  action: TrainerHotInteractionAction,
): void => {
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  const inputStartedAt = state.inputStartedAtByAction[action] ?? nowMs();
  recordTrainerHotInteractionMetric({
    name: "local-feedback",
    action,
    source: "command",
    durationMs: nowMs() - inputStartedAt,
  });
};

export const markTrainerHotInteractionChartPaint = (
  action: TrainerHotInteractionAction,
): void => {
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  const inputStartedAt = state.inputStartedAtByAction[action] ?? nowMs();
  const durationMs = nowMs() - inputStartedAt;
  recordTrainerHotInteractionMetric({
    name: "chart-paint",
    action,
    source: "chart",
    durationMs,
  });
  recordTrainerHotInteractionMetric({
    name: "visible-advance",
    action,
    source: "chart",
    durationMs,
  });
};

const percentile = (values: number[], percentileValue: number): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return roundDurationMs(sorted[index] ?? 0);
};

export const summarizeTrainerHotInteractionMetrics = (
  samples: readonly TrainerHotInteractionMetricSample[],
) => {
  const valuesByName = (name: TrainerHotInteractionMetricName) =>
    samples
      .filter((sample) => sample.name === name)
      .map((sample) => Math.max(0, Number(sample.durationMs) || 0));
  const longTaskDurations = valuesByName("long-task");
  return {
    localFeedbackP95Ms: percentile(valuesByName("local-feedback"), 95),
    visibleAdvanceP95Ms: percentile(valuesByName("visible-advance"), 95),
    backendActionP95Ms: percentile(valuesByName("backend-action"), 95),
    maxLongTaskMs: roundDurationMs(Math.max(0, ...longTaskDurations)),
    longTaskCount: longTaskDurations.length,
    sampleCount: samples.length,
  };
};

export const evaluateTrainerHotInteractionBudgets = (
  samples: readonly TrainerHotInteractionMetricSample[],
) => {
  const summary = summarizeTrainerHotInteractionMetrics(samples);
  return {
    ...summary,
    passes:
      summary.localFeedbackP95Ms <=
        TRAINER_HOT_INTERACTION_BUDGETS.localFeedbackP95Ms &&
      summary.visibleAdvanceP95Ms <=
        TRAINER_HOT_INTERACTION_BUDGETS.visibleAdvanceP95Ms &&
      summary.backendActionP95Ms <=
        TRAINER_HOT_INTERACTION_BUDGETS.backendActionP95Ms &&
      summary.maxLongTaskMs <= TRAINER_HOT_INTERACTION_BUDGETS.maxLongTaskMs,
  };
};

export const readTrainerHotInteractionMetrics =
  (): TrainerHotInteractionMetricSample[] => {
    const state = getHotInteractionState();
    return state ? [...state.samples] : [];
  };

export const resetTrainerHotInteractionMetrics = (): void => {
  const state = getHotInteractionState();
  if (!state) {
    return;
  }
  state.samples = [];
  state.inputStartedAtByAction = {};
};

export const installTrainerHotInteractionLongTaskObserver = (): void => {
  if (
    !isTrainerPerfTraceEnabled() ||
    typeof PerformanceObserver === "undefined"
  ) {
    return;
  }
  const state = getHotInteractionState();
  if (!state || state.longTaskObserverInstalled) {
    return;
  }
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        recordTrainerHotInteractionMetric({
          name: "long-task",
          durationMs: entry.duration,
        });
      });
    });
    observer.observe({ entryTypes: ["longtask"] });
    state.longTaskObserverInstalled = true;
  } catch {
    state.longTaskObserverInstalled = true;
  }
};

const MAX_TRAINER_PERF_SPAN_COUNT = 1000;

export const startTrainerPerfSpan = (
  label: string,
  context?: Record<string, unknown>,
): void => {
  if (!isTrainerPerfTraceEnabled() || typeof performance === "undefined") {
    return;
  }
  const spanMarks = getSpanMarks();
  if (!spanMarks) {
    return;
  }
  if (spanMarks.size >= MAX_TRAINER_PERF_SPAN_COUNT && !spanMarks.has(label)) {
    const firstKey = spanMarks.keys().next().value;
    if (firstKey !== undefined) {
      const firstMark = spanMarks.get(firstKey);
      if (firstMark) {
        performance.clearMarks(firstMark);
      }
      spanMarks.delete(firstKey);
    }
  }
  const nextStartMark = buildMarkName(`${label}:start`);
  performance.mark(nextStartMark);
  spanMarks.set(label, nextStartMark);
  if (context) {
    logTrainerPerf(`${label}:start`, context);
  }
};

export const endTrainerPerfSpan = (
  label: string,
  context?: Record<string, unknown>,
): void => {
  if (!isTrainerPerfTraceEnabled() || typeof performance === "undefined") {
    return;
  }
  const spanMarks = getSpanMarks();
  const startMark = spanMarks?.get(label) ?? null;
  if (!startMark) {
    return;
  }
  const endMark = buildMarkName(`${label}:end`);
  const measureName = `${TRAINER_PERF_TRACE_PREFIX}:${label}`;
  performance.mark(endMark);
  try {
    performance.measure(measureName, startMark, endMark);
    const entries = performance.getEntriesByName(measureName, "measure");
    const latestEntry = entries[entries.length - 1];
    logTrainerPerf(label, {
      durationMs: roundDurationMs(latestEntry?.duration ?? 0),
      ...(context ?? {}),
    });
  } catch {
    // Ignore invalid mark combinations in runtime traces.
  } finally {
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(measureName);
    spanMarks?.delete(label);
  }
};

export const recordTrainerAutoShrinkMeasurement = (
  durationMs: number,
): void => {
  if (!isTrainerPerfTraceEnabled()) {
    return;
  }
  const stats = getAutoShrinkStats();
  if (!stats) {
    return;
  }
  const normalizedDurationMs = Math.max(0, Number(durationMs) || 0);
  stats.count += 1;
  stats.totalDurationMs += normalizedDurationMs;
  stats.maxDurationMs = Math.max(stats.maxDurationMs, normalizedDurationMs);
  if (stats.flushTimerId !== null && typeof window !== "undefined") {
    window.clearTimeout(stats.flushTimerId);
  }
  if (typeof window !== "undefined") {
    stats.flushTimerId = window.setTimeout(() => {
      logTrainerPerf("auto-shrink-batch", {
        count: stats.count,
        totalDurationMs: roundDurationMs(stats.totalDurationMs),
        maxDurationMs: roundDurationMs(stats.maxDurationMs),
      });
      stats.count = 0;
      stats.totalDurationMs = 0;
      stats.maxDurationMs = 0;
      stats.flushTimerId = null;
    }, AUTO_SHRINK_FLUSH_DELAY_MS);
  }
};
