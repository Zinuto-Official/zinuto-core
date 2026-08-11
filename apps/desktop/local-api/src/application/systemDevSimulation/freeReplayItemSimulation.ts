// SPDX-License-Identifier: GPL-3.0-only

import { appError, isAppError } from "../../kernel/appError.js";
import { createId } from "../../kernel/id.js";
import {
  buildReplayPayloadFromSessionArchive,
  createTrainingProject,
} from "../historyService.js";
import {
  createOrGetSessionBootstrap,
  deleteSession,
  executeSessionAction,
  getSessionSnapshot,
  getTradingSettings,
} from "../trading/core.js";
import { buildHumanOperatorSummary } from "../../domain/operatorSummary.js";
import {
  EPSILON,
  buildChartIndicators,
  buildSimulationDrawings,
  clamp,
  floorToStep,
  randomCreatedAt,
  randomFloat,
  randomInt,
  resolveSessionPosition,
  type ReplayArchive,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import { createSystemDevSimulationRandom } from "../../domain/systemDevSimulation/random.js";
import {
  INPUT_LIMITS,
  trimAndLimitInputText,
} from "@zinuto/shared/input-limits";
import {
  formatProjectNameByPattern,
  resolveSessionNameFormat,
} from "@zinuto/shared/sessionNaming";
import { resolveAppUiLanguage } from "@zinuto/shared/systemDevSimulationCopy";
import type {
  SystemDevSimulationEffectivePlan,
  SystemDevSimulationFreeReplayInputMode,
  SystemDevSimulationFreeReplayPriceMode,
} from "@zinuto/shared/systemDevSimulationProfiles";
import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import { getBarCountCached, getBarsWindowCached } from "./barCache.js";
import {
  applyBuiltInTradingMarketPresetToSettings,
  type SystemDevSimulationFreeReplayPlanItem,
} from "./freeReplayPlan.js";
import {
  buildFreeReplayNoteTask,
  type FreeReplayScenarioArchetype,
} from "./freeReplayNoteTask.js";
import {
  resolveSimulationBuyQty,
  resolveSimulationInitialCapital,
} from "./orderSizing.js";
import {
  resolveFreeReplayArchiveStartIndex,
  resolveFreeReplayDrawingTools,
  resolveFreeReplayInputMode,
  resolveFreeReplayLoopBudget,
  resolveFreeReplayObservationBars,
  resolveFreeReplayOrderExecution,
  resolveFreeReplayPriceMode,
  resolveFreeReplayRequiredColor,
  resolveFreeReplayScenario,
  resolveFreeReplayStepRange,
  resolveFreeReplayTrainingTag,
  resolveHumanReplayAnchorIndex,
  tryPlaceSimulationOrder,
} from "./simulationHelpers.js";
import { buildRealisticFreeReplayProjectName } from "./presentation.js";
import { createSystemDevSimulationTimeline } from "./timeline.js";
import { throwIfSystemDevSimulationTaskAborted } from "./taskExecutionState.js";

type Language = ReturnType<typeof resolveAppUiLanguage>;
type SessionNameFormat = ReturnType<typeof resolveSessionNameFormat>;

const readFreeReplayBarWindow = async (
  input: SystemDevSimulationFreeReplayPlanItem,
  offset: number,
  limit: number,
): Promise<ReplayArchive["bars"]> => {
  const range = await getBarsWindowCached(
    input.symbol,
    input.baseTimeframe,
    input.instrumentId,
    offset,
    limit,
  );
  return range.bars;
};

const readFreeReplayBarAtIndex = async (
  input: SystemDevSimulationFreeReplayPlanItem,
  index: number,
  totalBarCount: number,
): Promise<ReplayArchive["bars"][number] | null> => {
  const safeIndex = clamp(
    Math.floor(Number(index) || 0),
    0,
    Math.max(0, Math.floor(Number(totalBarCount) || 0) - 1),
  );
  const bars = await readFreeReplayBarWindow(input, safeIndex, 1);
  return bars[0] ?? null;
};

const resolveBarsToNextTradeDayFromRanges = async (
  input: SystemDevSimulationFreeReplayPlanItem,
  currentIndex: number,
  totalBarCount: number,
): Promise<number> => {
  const safeTotal = Math.max(0, Math.floor(Number(totalBarCount) || 0));
  if (safeTotal <= 1) {
    return 0;
  }
  const safeIndex = clamp(
    Math.floor(Number(currentIndex) || 0),
    0,
    Math.max(0, safeTotal - 1),
  );
  const currentBar = await readFreeReplayBarAtIndex(
    input,
    safeIndex,
    safeTotal,
  );
  const currentDay = String(currentBar?.ts ?? "").slice(0, 10);
  if (!currentDay) {
    return 0;
  }
  const chunkSize = input.baseTimeframe === "1m" ? 720 : 256;
  let offset = safeIndex + 1;
  while (offset < safeTotal) {
    const limit = Math.min(chunkSize, safeTotal - offset);
    const bars = await readFreeReplayBarWindow(input, offset, limit);
    for (let index = 0; index < bars.length; index += 1) {
      const nextDay = String(bars[index]?.ts ?? "").slice(0, 10);
      if (nextDay && nextDay !== currentDay) {
        return offset + index - safeIndex;
      }
    }
    if (bars.length < limit) {
      return 0;
    }
    offset += bars.length;
  }
  return 0;
};

export const simulateFreeReplayItem = async (
  input: SystemDevSimulationFreeReplayPlanItem,
  index: number,
  options: {
    language: Language;
    effectivePlan: SystemDevSimulationEffectivePlan;
    simulationBatchId: string;
    sessionNameFormat: SessionNameFormat;
    signal?: AbortSignal;
  },
): Promise<{
  replayNotesCreated: number;
  coverage: {
    nextOpenOrders: number;
    autoStepOrders: number;
    undoActions: number;
    finalizePriceMode: "CUR_CLOSE" | "NEXT_OPEN";
    inputMode: SystemDevSimulationFreeReplayInputMode;
    priceMode: SystemDevSimulationFreeReplayPriceMode;
    archetype: FreeReplayScenarioArchetype;
    advancedBars: number;
    observationSteps: number;
    replayBarCount: number;
    archivedCursorIndex: number;
    archivedEntryIndex: number;
    totalTrades: number;
    noteContextCursorIndex: number | null;
    drawingTools: string[];
    noteColorTokens: ReplayNoteColorToken[];
    trainingTag: string;
  };
}> => {
  const throwIfAborted = (): void =>
    throwIfSystemDevSimulationTaskAborted(options.signal);
  throwIfAborted();
  const symbol = input.symbol;
  const itemRandom = createSystemDevSimulationRandom(
    `${options.simulationBatchId}:free:${index}:${symbol}:${input.baseTimeframe}`,
  );
  const archetype = resolveFreeReplayScenario(index, options.effectivePlan);
  const createdAt = randomCreatedAt(itemRandom.fork("created-at"));
  const timeline = createSystemDevSimulationTimeline({
    startIso: createdAt,
    random: itemRandom.fork("timeline"),
  });
  timeline.advanceSeconds(30, 240);
  const inputMode = resolveFreeReplayInputMode(index, options.effectivePlan);
  const priceMode = resolveFreeReplayPriceMode(index, options.effectivePlan);
  const trainingTag =
    archetype === "WATCH_ONLY"
      ? "watch"
      : resolveFreeReplayTrainingTag(index, options.effectivePlan);
  const requiredColorToken = resolveFreeReplayRequiredColor(
    index,
    options.effectivePlan,
  );
  const symbolBarCount = await getBarCountCached(
    symbol,
    input.baseTimeframe,
    input.instrumentId,
  );
  if (symbolBarCount < 24) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  const anchorIndex = resolveHumanReplayAnchorIndex(
    symbolBarCount,
    input.baseTimeframe,
    itemRandom.fork("anchor"),
  );
  const archiveStartIndex = resolveFreeReplayArchiveStartIndex(
    anchorIndex,
    input.baseTimeframe,
  );
  const currentTradingSettings = getTradingSettings();
  const presetTradingSettings = applyBuiltInTradingMarketPresetToSettings(
    currentTradingSettings,
    input.marketPresetId,
  );
  const anchorBar = await readFreeReplayBarAtIndex(
    input,
    anchorIndex,
    symbolBarCount,
  );
  const sessionInitialCapital = resolveSimulationInitialCapital({
    configuredInitialCapital: currentTradingSettings.initialSecuritiesBalance,
    referencePrice: Number(anchorBar?.close) || 0,
    minTradeStep: presetTradingSettings.minTradeStep,
    contractMultiplier: presetTradingSettings.contractMultiplier,
  });
  const sessionTradingSettings = {
    ...presetTradingSettings,
    initialSecuritiesBalance: sessionInitialCapital,
  };
  throwIfAborted();
  const bootstrap = await createOrGetSessionBootstrap(
    symbol,
    input.baseTimeframe,
    true,
    anchorIndex,
    {
      samplePoolId: input.samplePoolId,
      instrumentId: input.instrumentId,
      sessionTradingSettings,
      sessionScope: "SIMULATION_ONLY",
      createdAt,
      archiveStartIndex,
    },
  );
  throwIfAborted();
  const sessionId = bootstrap.session.id;
  const initialCapital = sessionInitialCapital;

  try {
    let latestSnapshot = bootstrap.snapshot;
    const finalizePriceMode = priceMode;
    const coverage = {
      nextOpenOrders: 0,
      autoStepOrders: 0,
      undoActions: 0,
      finalizePriceMode,
      inputMode,
      priceMode,
      archetype,
      advancedBars: 0,
      observationSteps: 0,
      replayBarCount: 0,
      archivedCursorIndex: 0,
      archivedEntryIndex: 0,
      totalTrades: 0,
      noteContextCursorIndex: null as number | null,
      drawingTools: [] as string[],
      noteColorTokens: [requiredColorToken],
      trainingTag,
    };
    const maxLoops = resolveFreeReplayLoopBudget(
      input.baseTimeframe,
      archetype,
      itemRandom.fork("loop-budget"),
    );
    const stepRange = resolveFreeReplayStepRange(
      input.baseTimeframe,
      archetype,
    );
    const shouldCoverUndoPath = Math.abs(index) % 4 === 2;
    let undoCoverageUsed = false;
    let lastOrderRejectionCode: string | null = null;
    const stepSimulationSession = async (count: number) => {
      const safeCount = Math.max(1, Math.floor(Number(count) || 1));
      throwIfAborted();
      await executeSessionAction(sessionId, {
        action: "STEP",
        count: safeCount,
        occurredAt: timeline.advanceSeconds(2, 20),
      });
      throwIfAborted();
      coverage.advancedBars += safeCount;
      coverage.observationSteps += 1;
    };
    const placeSimulationOrder = async (params: {
      side: "BUY" | "SELL";
      qty: number;
      loopIndex: number;
      minTradeStep: number;
      currentClose: number;
      contractMultiplier: number;
    }): Promise<boolean> => {
      const execution = {
        ...resolveFreeReplayOrderExecution(
          index,
          params.loopIndex,
          options.effectivePlan,
        ),
      };
      if (shouldCoverUndoPath) {
        execution.undoAfterFill =
          params.loopIndex <= maxLoops && !undoCoverageUsed;
      }
      throwIfAborted();
      const placed = await tryPlaceSimulationOrder(sessionId, {
        side: params.side,
        qty: params.qty,
        inputMode,
        assetClass: input.assetClass,
        minTradeStep: params.minTradeStep,
        currentClose: params.currentClose,
        contractMultiplier: params.contractMultiplier,
        random: itemRandom.fork(`order-input:${params.loopIndex}`),
        itemIndex: index,
        loopIndex: params.loopIndex,
        occurredAt: timeline.advanceSeconds(5, 90),
        undoOccurredAt: execution.undoAfterFill
          ? timeline.advanceSeconds(3, 15)
          : undefined,
        ...execution,
      });
      throwIfAborted();
      if (placed.placed) {
        coverage.nextOpenOrders += execution.priceMode === "NEXT_OPEN" ? 1 : 0;
        coverage.autoStepOrders += execution.autoStep ? 1 : 0;
        coverage.undoActions += execution.undoAfterFill ? 1 : 0;
        undoCoverageUsed = undoCoverageUsed || Boolean(execution.undoAfterFill);
      }
      lastOrderRejectionCode = placed.rejectionCode ?? lastOrderRejectionCode;
      return placed.placed;
    };
    await stepSimulationSession(
      resolveFreeReplayObservationBars(
        input.baseTimeframe,
        archetype,
        itemRandom.fork("initial-observation"),
      ),
    );
    for (let loopIndex = 0; loopIndex < maxLoops; loopIndex += 1) {
      latestSnapshot = await getSessionSnapshot(sessionId, null);
      const position = resolveSessionPosition({
        positions: latestSnapshot.positions.map((item) => ({
          symbol: item.symbol,
          qty: item.qty,
          avgCost: item.avgCost,
          markPrice: item.markPrice,
        })),
        session: {
          symbol: latestSnapshot.session.symbol,
        },
      });
      const minTradeStep = Math.max(
        EPSILON,
        Number(latestSnapshot.sessionTradingSettings?.minTradeStep) || 1,
      );
      const contractMultiplier = Math.max(
        EPSILON,
        Number(latestSnapshot.sessionTradingSettings?.contractMultiplier) || 1,
      );
      const currentBar = await readFreeReplayBarAtIndex(
        input,
        Number(latestSnapshot.session.cursor_index) || 0,
        symbolBarCount,
      );
      const currentClose = Math.max(EPSILON, Number(currentBar?.close) || 0);
      const allowShortSelling = Boolean(
        latestSnapshot.sessionTradingSettings?.allowShortSelling,
      );
      const accountBalance = Math.max(
        0,
        Number(latestSnapshot.session.cash_balance) ||
          (Array.isArray(latestSnapshot.accounts)
            ? latestSnapshot.accounts.reduce(
                (sum, item) => sum + Math.max(0, Number(item.balance) || 0),
                0,
              )
            : initialCapital),
      );
      if (
        archetype === "WATCH_ONLY" ||
        itemRandom.next() <
          (archetype === "RANGE_ROTATION"
            ? 0.24
            : archetype === "MEAN_REVERSION"
              ? 0.16
              : 0.11)
      ) {
        await stepSimulationSession(
          randomInt(stepRange.min, stepRange.max, itemRandom),
        );
        continue;
      }

      if (!position) {
        const budgetRange =
          archetype === "MEAN_REVERSION"
            ? { min: 0.05, max: 0.16 }
            : archetype === "SCALE_IN_OUT"
              ? { min: 0.08, max: 0.18 }
              : { min: 0.06, max: 0.28 };
        const entryQty = resolveSimulationBuyQty({
          budget:
            accountBalance *
            randomFloat(budgetRange.min, budgetRange.max, itemRandom),
          fillPrice: currentClose,
          minTradeStep,
          contractMultiplier,
        });
        if (entryQty > EPSILON) {
          const shouldOpenShort =
            allowShortSelling &&
            (archetype === "SHORT_OPPORTUNITY" ||
              (archetype === "FALSE_BREAKOUT" && itemRandom.next() < 0.55) ||
              itemRandom.next() < 0.12);
          await placeSimulationOrder({
            side: shouldOpenShort ? "SELL" : "BUY",
            qty: entryQty,
            loopIndex,
            minTradeStep,
            currentClose,
            contractMultiplier,
          });
        }
      } else if (position.qty > 0) {
        const actionRoll = itemRandom.next();
        const closeThreshold =
          archetype === "FORCED_EXIT"
            ? 1
            : archetype === "SCALE_IN_OUT"
              ? 0.28
              : 0.44;
        const addThreshold =
          archetype === "SCALE_IN_OUT"
            ? 0.74
            : archetype === "TREND_CONTINUATION"
              ? 0.7
              : 0.62;
        if (actionRoll < closeThreshold) {
          const closeQty = floorToStep(
            Math.abs(position.qty) *
              (archetype === "FORCED_EXIT"
                ? 1
                : randomFloat(0.35, 1, itemRandom)),
            minTradeStep,
          );
          if (closeQty > EPSILON) {
            try {
              await placeSimulationOrder({
                side: "SELL",
                qty: closeQty,
                loopIndex,
                minTradeStep,
                currentClose,
                contractMultiplier,
              });
            } catch (error) {
              if (isAppError(error) && error.code === "T1_SELL_LIMIT") {
                const barsToNextTradeDay =
                  await resolveBarsToNextTradeDayFromRanges(
                    input,
                    latestSnapshot.session.cursor_index,
                    symbolBarCount,
                  );
                if (barsToNextTradeDay > 0) {
                  await stepSimulationSession(barsToNextTradeDay);
                  continue;
                }
                break;
              }
              throw error;
            }
          }
        } else if (actionRoll < addThreshold) {
          const addQty = resolveSimulationBuyQty({
            budget:
              accountBalance *
              randomFloat(
                archetype === "TREND_CONTINUATION" ? 0.08 : 0.04,
                archetype === "TREND_CONTINUATION" ? 0.2 : 0.16,
                itemRandom,
              ),
            fillPrice: currentClose,
            minTradeStep,
            contractMultiplier,
          });
          if (addQty > EPSILON) {
            await placeSimulationOrder({
              side: "BUY",
              qty: addQty,
              loopIndex,
              minTradeStep,
              currentClose,
              contractMultiplier,
            });
          }
        }
      } else if (position.qty < 0) {
        const actionRoll = itemRandom.next();
        const closeThreshold =
          archetype === "FORCED_EXIT"
            ? 1
            : archetype === "SHORT_OPPORTUNITY"
              ? 0.38
              : 0.48;
        if (actionRoll < closeThreshold) {
          const coverQty = floorToStep(
            Math.abs(position.qty) *
              (archetype === "FORCED_EXIT"
                ? 1
                : randomFloat(0.3, 1, itemRandom)),
            minTradeStep,
          );
          if (coverQty > EPSILON) {
            await placeSimulationOrder({
              side: "BUY",
              qty: coverQty,
              loopIndex,
              minTradeStep,
              currentClose,
              contractMultiplier,
            });
          }
        } else if (
          actionRoll < (archetype === "SHORT_OPPORTUNITY" ? 0.78 : 0.68) &&
          allowShortSelling
        ) {
          const addQty = resolveSimulationBuyQty({
            budget: accountBalance * randomFloat(0.04, 0.14, itemRandom),
            fillPrice: currentClose,
            minTradeStep,
            contractMultiplier,
          });
          if (addQty > EPSILON) {
            await placeSimulationOrder({
              side: "SELL",
              qty: addQty,
              loopIndex,
              minTradeStep,
              currentClose,
              contractMultiplier,
            });
          }
        }
      }
      await stepSimulationSession(
        randomInt(stepRange.min, stepRange.max, itemRandom),
      );
    }
    latestSnapshot = await getSessionSnapshot(sessionId, null);
    if (archetype !== "WATCH_ONLY" && Number(latestSnapshot.fillsTotal) <= 0) {
      const currentIndex = clamp(
        Number(latestSnapshot.session.cursor_index) || 0,
        0,
        Math.max(0, symbolBarCount - 1),
      );
      const currentBar = await readFreeReplayBarAtIndex(
        input,
        currentIndex,
        symbolBarCount,
      );
      const currentClose = Math.max(EPSILON, Number(currentBar?.close) || 0);
      const accountBalance = Math.max(
        0,
        Number(latestSnapshot.session.cash_balance) || initialCapital,
      );
      const minTradeStep = Math.max(
        EPSILON,
        Number(latestSnapshot.sessionTradingSettings?.minTradeStep) || 1,
      );
      const contractMultiplier = Math.max(
        EPSILON,
        Number(latestSnapshot.sessionTradingSettings?.contractMultiplier) || 1,
      );
      const entryQty = resolveSimulationBuyQty({
        budget: accountBalance * randomFloat(0.08, 0.18, itemRandom),
        fillPrice: currentClose,
        minTradeStep,
        contractMultiplier,
      });
      if (entryQty > EPSILON) {
        const forcedLoopIndex =
          (maxLoops + 1) % 4 === 0 ? maxLoops + 2 : maxLoops + 1;
        await placeSimulationOrder({
          side: "BUY",
          qty: entryQty,
          loopIndex: forcedLoopIndex,
          minTradeStep,
          currentClose,
          contractMultiplier,
        });
        await stepSimulationSession(1);
      }
    }

    throwIfAborted();
    const replayResult = await buildReplayPayloadFromSessionArchive(
      sessionId,
      initialCapital,
      [],
      buildChartIndicators(),
      input.baseTimeframe,
      finalizePriceMode,
      {
        // System dev simulation runs on ephemeral internal sessions and should
        // not be re-blocked by the local archive access guard.
        bypassAccessGuard: true,
      },
    );
    throwIfAborted();
    const replay = replayResult.replay as ReplayArchive | undefined;
    const archivedSummary = replayResult.summary;
    const archivedTrainingDateRange = replayResult.trainingDateRange;
    if (replay && (!Array.isArray(replay.bars) || !replay.bars.length)) {
      throw appError("SYSTEM_DEV_SIMULATION_FAILED");
    }
    coverage.totalTrades = Math.max(
      0,
      Math.floor(Number(archivedSummary.totalTrades) || 0),
    );
    if (archetype !== "WATCH_ONLY" && coverage.totalTrades <= 0) {
      throw appError("SYSTEM_DEV_SIMULATION_FAILED", {
        reason: "FREE_REPLAY_NO_REAL_TRADE",
        symbol,
        baseTimeframe: input.baseTimeframe,
        marketPresetId: input.marketPresetId,
        inputMode,
        priceMode,
        archetype,
        lastOrderRejectionCode,
      });
    }
    if (replay) {
      coverage.replayBarCount = Array.isArray(replay.bars)
        ? replay.bars.length
        : 0;
      coverage.archivedCursorIndex = Math.max(
        0,
        Math.floor(Number(replay.snapshot?.session?.cursor_index) || 0),
      );
      coverage.archivedEntryIndex = Math.max(
        0,
        Math.floor(Number(replay.snapshot?.session?.entry_index) || 0),
      );
      const drawingTools = resolveFreeReplayDrawingTools({
        archetype,
        itemIndex: index,
        effectivePlan: options.effectivePlan,
        random: itemRandom.fork("drawing-tools"),
      });
      replay.drawings = buildSimulationDrawings(replay.bars, {
        rng: itemRandom.fork("drawings"),
        sourcePeriod: input.baseTimeframe,
        drawingTools,
        maxDrawings: 4,
      });
      coverage.drawingTools = replay.drawings
        .map((item) =>
          item && typeof item === "object" && "name" in item
            ? String((item as { name?: unknown }).name ?? "")
            : "",
        )
        .filter(Boolean);
      replay.chartIndicators = buildChartIndicators();
    }
    const archivedAt = timeline.advanceMinutes(2, 45);
    const baseProjectName =
      formatProjectNameByPattern(
        new Date(createdAt),
        options.sessionNameFormat,
      ) || createdAt.slice(0, 16).replace("T", " ");
    throwIfAborted();
    const project = await createTrainingProject({
      id: createId(),
      name: trimAndLimitInputText(
        buildRealisticFreeReplayProjectName({
          language: options.language,
          fallbackName: baseProjectName,
          symbol,
          timeframe: input.baseTimeframe,
          archetype,
        }),
        INPUT_LIMITS.trainingProjectNameChars,
      ),
      createdAt: archivedAt,
      updatedAt: archivedAt,
      initialTotal: archivedSummary.initialAsset,
      totalPnl: archivedSummary.totalPnl,
      profitRate: archivedSummary.profitRate,
      durationDays: archivedSummary.durationDays,
      totalTrades: archivedSummary.totalTrades,
      symbol,
      samplePoolId: input.samplePoolId,
      samplePoolName: input.samplePoolName,
      baseTimeframe: input.baseTimeframe,
      trainingDateRange: archivedTrainingDateRange,
      summary: archivedSummary,
      finalEquity: replayResult.metrics.finalEquity,
      equityReturnRate: replayResult.metrics.equityReturnRate,
      simulationBatchId: options.simulationBatchId,
      sourceTag: "SYSTEM_DEV_SIMULATION",
      replay,
      operatorSummary: buildHumanOperatorSummary(),
    });
    throwIfAborted();
    const projectReplay = project.replay as ReplayArchive | undefined;
    if (!projectReplay) {
      return { replayNotesCreated: 0, coverage };
    }
    const noteResult = await buildFreeReplayNoteTask({
      projectId: project.id,
      replay: projectReplay,
      baseTimeframe: input.baseTimeframe,
      createdAt: archivedAt,
      index,
      language: options.language,
      simulationBatchId: options.simulationBatchId,
      archetype,
      notePolicy: options.effectivePlan.notePolicy,
      requiredColorTokens: [requiredColorToken],
      signal: options.signal,
    });
    throwIfAborted();
    coverage.noteContextCursorIndex = noteResult.contextCursorIndex;
    return {
      replayNotesCreated: noteResult.created ? 1 : 0,
      coverage,
    };
  } finally {
    await deleteSession(sessionId);
  }
};
