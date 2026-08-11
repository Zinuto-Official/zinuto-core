// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  evaluateTrainerHotInteractionBudgets,
  installTrainerHotInteractionLongTaskObserver,
  markTrainerHotInteractionChartPaint,
  markTrainerHotInteractionInput,
  markTrainerHotInteractionLocalFeedback,
  readTrainerHotInteractionMetrics,
  recordTrainerHotInteractionMetric,
  resetTrainerHotInteractionMetrics,
  summarizeTrainerHotInteractionMetrics,
  type TrainerHotInteractionAction,
} from "../src/domains/trainer/trainerPerfTrace";
import {
  makeSpecialTrainingRiskInputQueue,
  SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX,
  type SpecialTrainingRiskCommandIntent,
} from "../src/workspaces/special-training/session/riskDisciplineCommandQueue";

type PerfTarget = "trainer" | "risk";
type TrainerHotCommand =
  | { action: "STEP" }
  | { action: "UNDO" }
  | { action: "ORDER"; side: "BUY" | "SELL" };
type OptimisticTrainerHotCommand = TrainerHotCommand & {
  optimisticCursorDelta?: number;
};
type OptimisticRiskCommandIntent = SpecialTrainingRiskCommandIntent & {
  optimisticCursorDelta?: number;
};

type RafStats = {
  active: boolean;
  droppedFrames: number;
  lastFrameAtMs: number;
  maxFrameGapMs: number;
};

type HotPerfSnapshot = {
  activeTarget: PerfTarget;
  budgets: ReturnType<typeof evaluateTrainerHotInteractionBudgets>;
  cursors: Record<PerfTarget, number>;
  droppedFrames: number;
  maxFrameGapMs: number;
  maxQueueDepth: number;
  metrics: ReturnType<typeof readTrainerHotInteractionMetrics>;
  queues: Record<PerfTarget, number>;
  summary: ReturnType<typeof summarizeTrainerHotInteractionMetrics>;
};

declare global {
  interface Window {
    __ZINUTO_HOT_INTERACTION_PERF__?: {
      finish: () => HotPerfSnapshot;
      read: () => HotPerfSnapshot;
      reset: (target: PerfTarget) => void;
      start: (target: PerfTarget) => void;
    };
    __ZINUTO_TRAINER_PERF_TRACE__?: boolean;
  }
}

const HOT_BACKEND_SIMULATED_MS = 4;
const FRAME_DROP_THRESHOLD_MS = 50;
const TRAINER_SINGLE_IN_FLIGHT_LIMIT = 1;

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, durationMs));

const actionForTrainerCommand = (
  command: TrainerHotCommand,
): TrainerHotInteractionAction => {
  if (command.action === "ORDER") {
    return command.side;
  }
  return command.action;
};

const actionForRiskCommand = (
  intent: SpecialTrainingRiskCommandIntent,
): TrainerHotInteractionAction => {
  if (intent.action === "BUY_AND_ADVANCE") {
    return "BUY";
  }
  if (intent.action === "SELL_AND_ADVANCE") {
    return "SELL";
  }
  if (intent.action === "UNDO") {
    return "UNDO";
  }
  return "STEP";
};

const HotInteractionPerfHarness = () => {
  const [trainerCursor, setTrainerCursor] = useState(0);
  const [riskCursor, setRiskCursor] = useState(0);
  const [trainerQueueDepth, setTrainerQueueDepth] = useState(0);
  const [riskQueueDepth, setRiskQueueDepth] = useState(0);
  const activeTargetRef = useRef<PerfTarget>("trainer");
  const maxQueueDepthRef = useRef(0);
  const trainerCursorRef = useRef(0);
  const riskCursorRef = useRef(0);
  const trainerActionInFlightRef = useRef(false);
  const trainerQueueRef = useRef<OptimisticTrainerHotCommand[]>([]);
  const riskQueueRef = useRef<ReturnType<
    typeof makeSpecialTrainingRiskInputQueue
  > | null>(null);
  const rafStatsRef = useRef<RafStats>({
    active: false,
    droppedFrames: 0,
    lastFrameAtMs: 0,
    maxFrameGapMs: 0,
  });

  const updateTrainerCursor = useCallback((delta: number) => {
    trainerCursorRef.current = Math.max(0, trainerCursorRef.current + delta);
    setTrainerCursor(trainerCursorRef.current);
  }, []);

  const updateRiskCursor = useCallback((delta: number) => {
    riskCursorRef.current = Math.max(0, riskCursorRef.current + delta);
    setRiskCursor(riskCursorRef.current);
  }, []);

  const refreshQueueDepth = useCallback(() => {
    const nextTrainerDepth =
      (trainerActionInFlightRef.current ? 1 : 0) +
      trainerQueueRef.current.length;
    const nextRiskDepth = riskQueueRef.current?.size() ?? 0;
    setTrainerQueueDepth(nextTrainerDepth);
    setRiskQueueDepth(nextRiskDepth);
    maxQueueDepthRef.current = Math.max(
      maxQueueDepthRef.current,
      nextTrainerDepth,
      nextRiskDepth,
    );
  }, []);

  const schedulePaintMetric = useCallback(
    (action: TrainerHotInteractionAction) => {
      window.requestAnimationFrame(() => {
        markTrainerHotInteractionChartPaint(action);
      });
    },
    [],
  );

  const recordBackendSegments = useCallback(
    (action: TrainerHotInteractionAction, startedAtMs: number) => {
      const durationMs = performance.now() - startedAtMs;
      recordTrainerHotInteractionMetric({
        name: "backend-action",
        action,
        source: "backend",
        durationMs,
      });
      recordTrainerHotInteractionMetric({
        name: "backend-delta",
        action,
        source: "backend",
        durationMs: Math.min(durationMs, 1),
      });
      recordTrainerHotInteractionMetric({
        name: "backend-total",
        action,
        source: "backend",
        durationMs,
      });
      recordTrainerHotInteractionMetric({
        name: "bridge",
        action,
        source: "bridge",
        durationMs: Math.min(durationMs, 2),
      });
      recordTrainerHotInteractionMetric({
        name: "json-parse",
        action,
        source: "bridge",
        durationMs: 0.2,
      });
      recordTrainerHotInteractionMetric({
        name: "delta",
        action,
        source: "command",
        durationMs: 0,
      });
    },
    [],
  );

  const executeTrainerCommand = useCallback(
    async (command: OptimisticTrainerHotCommand) => {
      const action = actionForTrainerCommand(command);
      const backendStartedAtMs = performance.now();
      const optimisticCursorDelta = Math.max(
        0,
        Math.floor(Number(command.optimisticCursorDelta) || 0),
      );
      await sleep(HOT_BACKEND_SIMULATED_MS);
      if (optimisticCursorDelta <= 0) {
        markTrainerHotInteractionLocalFeedback(action);
        if (command.action === "UNDO") {
          updateTrainerCursor(-1);
        } else {
          updateTrainerCursor(1);
        }
        schedulePaintMetric(action);
      }
      recordBackendSegments(action, backendStartedAtMs);
    },
    [recordBackendSegments, schedulePaintMetric, updateTrainerCursor],
  );

  const drainTrainerQueue = useCallback(() => {
      if (trainerActionInFlightRef.current) {
        refreshQueueDepth();
        return;
      }
      const command = trainerQueueRef.current.shift();
      if (!command) {
        refreshQueueDepth();
        return;
      }
      trainerActionInFlightRef.current = true;
      refreshQueueDepth();
      void executeTrainerCommand(command).finally(() => {
        trainerActionInFlightRef.current = false;
        refreshQueueDepth();
        drainTrainerQueue();
      });
    },
    [executeTrainerCommand, refreshQueueDepth],
  );

  const enqueueTrainerCommand = useCallback(
    (command: OptimisticTrainerHotCommand) => {
      trainerQueueRef.current.push(command);
      refreshQueueDepth();
      drainTrainerQueue();
    },
    [drainTrainerQueue, refreshQueueDepth],
  );

  const executeRiskCommand = useCallback(
    async (intent: SpecialTrainingRiskCommandIntent) => {
      const action = actionForRiskCommand(intent);
      const backendStartedAtMs = performance.now();
      const optimisticCursorDelta = Math.max(
        0,
        Math.floor(
          Number(
            (intent as OptimisticRiskCommandIntent).optimisticCursorDelta,
          ) || 0,
        ),
      );
      if (optimisticCursorDelta <= 0) {
        markTrainerHotInteractionLocalFeedback(action);
      }
      if (intent.action === "UNDO") {
        updateRiskCursor(-1);
      } else if (optimisticCursorDelta <= 0) {
        updateRiskCursor(1);
      }
      if (optimisticCursorDelta <= 0) {
        schedulePaintMetric(action);
      }
      await sleep(HOT_BACKEND_SIMULATED_MS);
      recordBackendSegments(action, backendStartedAtMs);
      refreshQueueDepth();
      return { continueDraining: true };
    },
    [
      recordBackendSegments,
      refreshQueueDepth,
      schedulePaintMetric,
      updateRiskCursor,
    ],
  );

  if (!riskQueueRef.current) {
    riskQueueRef.current = makeSpecialTrainingRiskInputQueue({
      execute: executeRiskCommand,
      onError: () => undefined,
    });
  }

  const enqueueRiskCommand = useCallback(
    (intent: SpecialTrainingRiskCommandIntent) => {
      void riskQueueRef.current?.enqueue(intent).then(refreshQueueDepth);
      refreshQueueDepth();
    },
    [refreshQueueDepth],
  );

  const applyImmediateVisualFeedback = useCallback(
    (target: PerfTarget, action: TrainerHotInteractionAction) => {
      markTrainerHotInteractionLocalFeedback(action);
      if (target === "trainer") {
        updateTrainerCursor(action === "UNDO" ? -1 : 1);
      } else {
        updateRiskCursor(action === "UNDO" ? -1 : 1);
      }
      schedulePaintMetric(action);
    },
    [schedulePaintMetric, updateRiskCursor, updateTrainerCursor],
  );

  const startRafMonitor = useCallback(() => {
    rafStatsRef.current = {
      active: true,
      droppedFrames: 0,
      lastFrameAtMs: 0,
      maxFrameGapMs: 0,
    };
    const tick = (frameAtMs: number) => {
      const stats = rafStatsRef.current;
      if (!stats.active) {
        return;
      }
      if (stats.lastFrameAtMs <= 0) {
        stats.lastFrameAtMs = frameAtMs;
        window.requestAnimationFrame(tick);
        return;
      }
      const gapMs = Math.max(0, frameAtMs - stats.lastFrameAtMs);
      stats.maxFrameGapMs = Math.max(stats.maxFrameGapMs, gapMs);
      if (gapMs > FRAME_DROP_THRESHOLD_MS) {
        stats.droppedFrames += 1;
      }
      stats.lastFrameAtMs = frameAtMs;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }, []);

  const stopRafMonitor = useCallback(() => {
    rafStatsRef.current.active = false;
  }, []);

  const resetHarness = useCallback(
    (target: PerfTarget) => {
      activeTargetRef.current = target;
      trainerActionInFlightRef.current = false;
      trainerQueueRef.current = [];
      riskQueueRef.current?.clear();
      trainerCursorRef.current = 0;
      riskCursorRef.current = 0;
      maxQueueDepthRef.current = 0;
      setTrainerCursor(0);
      setRiskCursor(0);
      refreshQueueDepth();
      resetTrainerHotInteractionMetrics();
    },
    [refreshQueueDepth],
  );

  const readSnapshot = useCallback((): HotPerfSnapshot => {
    const metrics = readTrainerHotInteractionMetrics();
    const summary = summarizeTrainerHotInteractionMetrics(metrics);
    return {
      activeTarget: activeTargetRef.current,
      budgets: evaluateTrainerHotInteractionBudgets(metrics),
      cursors: {
        trainer: trainerCursorRef.current,
        risk: riskCursorRef.current,
      },
      droppedFrames: rafStatsRef.current.droppedFrames,
      maxFrameGapMs: Math.round(rafStatsRef.current.maxFrameGapMs * 100) / 100,
      maxQueueDepth: maxQueueDepthRef.current,
      metrics,
      queues: {
        trainer:
          (trainerActionInFlightRef.current ? 1 : 0) +
          trainerQueueRef.current.length,
        risk: riskQueueRef.current?.size() ?? 0,
      },
      summary,
    };
  }, []);

  useEffect(() => {
    window.__ZINUTO_TRAINER_PERF_TRACE__ = true;
    installTrainerHotInteractionLongTaskObserver();
    window.__ZINUTO_HOT_INTERACTION_PERF__ = {
      finish: () => {
        stopRafMonitor();
        return readSnapshot();
      },
      read: readSnapshot,
      reset: resetHarness,
      start: (target) => {
        resetHarness(target);
        startRafMonitor();
      },
    };
    return () => {
      stopRafMonitor();
      delete window.__ZINUTO_HOT_INTERACTION_PERF__;
    };
  }, [readSnapshot, resetHarness, startRafMonitor, stopRafMonitor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }
      event.preventDefault();
      if (activeTargetRef.current === "risk") {
        markTrainerHotInteractionInput("STEP", "keydown");
        applyImmediateVisualFeedback("risk", "STEP");
        enqueueRiskCommand({
          action: "NEXT_BAR",
          optimisticCursorDelta: 1,
        } as OptimisticRiskCommandIntent);
        return;
      }
      markTrainerHotInteractionInput("STEP", "keydown");
      applyImmediateVisualFeedback("trainer", "STEP");
      enqueueTrainerCommand({ action: "STEP", optimisticCursorDelta: 1 });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enqueueRiskCommand, enqueueTrainerCommand]);

  const handleTrainerButton = (command: TrainerHotCommand) => {
    markTrainerHotInteractionInput(actionForTrainerCommand(command), "pointerdown");
    enqueueTrainerCommand(command);
  };

  const handleRiskButton = (intent: SpecialTrainingRiskCommandIntent) => {
    const action = actionForRiskCommand(intent);
    markTrainerHotInteractionInput(action, "pointerdown");
    if (intent.action === "NEXT_BAR") {
      applyImmediateVisualFeedback("risk", action);
      enqueueRiskCommand({
        ...intent,
        optimisticCursorDelta: 1,
      } as OptimisticRiskCommandIntent);
      return;
    }
    enqueueRiskCommand(intent);
  };

  const trainerBars = Array.from({ length: 24 }, (_, index) => {
    const isActive = index === trainerCursor % 24;
    return (
      <i
        key={`trainer-${index}`}
        data-active={isActive ? "true" : "false"}
        style={{ height: `${24 + ((index + trainerCursor) % 11) * 7}px` }}
      />
    );
  });
  const riskBars = Array.from({ length: 24 }, (_, index) => {
    const isActive = index === riskCursor % 24;
    return (
      <i
        key={`risk-${index}`}
        data-active={isActive ? "true" : "false"}
        style={{ height: `${30 + ((index + riskCursor) % 9) * 8}px` }}
      />
    );
  });

  return (
    <main className="hot-perf-root">
      <section
        className="hot-perf-surface"
        data-testid="hot-trainer-target"
        tabIndex={0}
        onFocus={() => {
          activeTargetRef.current = "trainer";
        }}
      >
        <div className="hot-perf-chart" data-testid="hot-trainer-chart">
          {trainerBars}
        </div>
        <div className="hot-perf-actions">
          <button
            aria-label="trainer step"
            data-testid="hot-trainer-step"
            onPointerDown={() => handleTrainerButton({ action: "STEP" })}
            type="button"
          />
          <button
            aria-label="trainer buy"
            data-testid="hot-trainer-buy"
            onPointerDown={() =>
              handleTrainerButton({ action: "ORDER", side: "BUY" })
            }
            type="button"
          />
          <button
            aria-label="trainer sell"
            data-testid="hot-trainer-sell"
            onPointerDown={() =>
              handleTrainerButton({ action: "ORDER", side: "SELL" })
            }
            type="button"
          />
          <button
            aria-label="trainer undo"
            data-testid="hot-trainer-undo"
            onPointerDown={() => handleTrainerButton({ action: "UNDO" })}
            type="button"
          />
        </div>
        <output data-testid="hot-trainer-cursor">{trainerCursor}</output>
        <output data-testid="hot-trainer-queue">{trainerQueueDepth}</output>
      </section>

      <section
        className="hot-perf-surface"
        data-testid="hot-risk-target"
        tabIndex={0}
        onFocus={() => {
          activeTargetRef.current = "risk";
        }}
      >
        <div className="hot-perf-chart" data-testid="hot-risk-chart">
          {riskBars}
        </div>
        <div className="hot-perf-actions">
          <button
            aria-label="risk next"
            data-testid="hot-risk-next"
            onPointerDown={() => handleRiskButton({ action: "NEXT_BAR" })}
            type="button"
          />
          <button
            aria-label="risk buy"
            data-testid="hot-risk-buy"
	            onPointerDown={() =>
	              handleRiskButton({
	                action: "BUY_AND_ADVANCE",
	                order: {
	                  inputMode: "RATIO",
	                  ratioInput: "25",
	                  priceMode: "CUR_CLOSE",
	                },
	              })
	            }
            type="button"
          />
          <button
            aria-label="risk sell"
            data-testid="hot-risk-sell"
	            onPointerDown={() =>
	              handleRiskButton({
	                action: "SELL_AND_ADVANCE",
	                order: {
	                  inputMode: "RATIO",
	                  ratioInput: "25",
	                  priceMode: "CUR_CLOSE",
	                },
	              })
	            }
            type="button"
          />
          <button
            aria-label="risk undo"
            data-testid="hot-risk-undo"
            onPointerDown={() => handleRiskButton({ action: "UNDO" })}
            type="button"
          />
        </div>
        <output data-testid="hot-risk-cursor">{riskCursor}</output>
        <output data-testid="hot-risk-queue">{riskQueueDepth}</output>
      </section>

      <output data-testid="hot-queue-limit">
        {Math.min(
          TRAINER_SINGLE_IN_FLIGHT_LIMIT,
          SPECIAL_TRAINING_RISK_COMMAND_QUEUE_MAX,
        )}
      </output>
    </main>
  );
};

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #root {
    min-height: 100%;
    margin: 0;
  }

  body {
    background: #0b1117;
  }

  .hot-perf-root {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    min-height: 100vh;
    padding: 16px;
  }

  .hot-perf-surface {
    align-content: start;
    background: #101922;
    border: 1px solid #293847;
    border-radius: 8px;
    box-sizing: border-box;
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 12px;
  }

  .hot-perf-surface:focus {
    outline: 2px solid #78b7ff;
    outline-offset: 2px;
  }

  .hot-perf-chart {
    align-items: end;
    border-bottom: 1px solid #627181;
    display: grid;
    gap: 3px;
    grid-template-columns: repeat(24, minmax(0, 1fr));
    height: 260px;
    min-width: 0;
  }

  .hot-perf-chart i {
    background: #7b8da1;
    border-radius: 2px 2px 0 0;
    display: block;
    min-height: 18px;
  }

  .hot-perf-chart i[data-active="true"] {
    background: #e2b85d;
  }

  .hot-perf-actions {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(4, 32px);
  }

  .hot-perf-actions button {
    appearance: none;
    background: #223142;
    border: 1px solid #506174;
    border-radius: 6px;
    height: 32px;
    padding: 0;
    width: 32px;
  }

  .hot-perf-actions button:active {
    background: #35516d;
  }

  output {
    color: transparent;
    font: 0 / 0 system-ui;
    height: 0;
    overflow: hidden;
    position: absolute;
    width: 0;
  }
`;
document.head.append(style);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HotInteractionPerfHarness />
  </React.StrictMode>,
);
