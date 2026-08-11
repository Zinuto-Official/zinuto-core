// SPDX-License-Identifier: GPL-3.0-only

import { createId } from "../../kernel/id.js";
import { appError } from "../../kernel/appError.js";
import { createReplayNote } from "../replayNoteService.js";
import {
  discardSpecialTrainingChallenge,
  getSpecialTrainingChallengeRuntime,
  previewSpecialTrainingQuestionBank,
  resetSpecialTrainingQuestionBank,
  settleSpecialTrainingQuestion,
  startSpecialTrainingChallenge,
  type SpecialTrainingModeId,
  type SpecialTrainingSettlementResult,
  type SpecialTrainingTradeAction,
} from "../specialTrainingService.js";
import {
  DEV_SIMULATION_LEDGER_SOURCE_TAG,
  FAST_DECISION_HORIZONS,
  FAST_DECISION_QUESTION_COUNTS,
  FAST_DECISION_SECONDS,
  FAST_DECISION_STRICTNESS,
  RISK_HORIZONS,
  RISK_QUESTION_COUNTS,
  buildChallengeNoteDocument,
  buildChallengeReplay,
  buildChallengeSummaryChips,
  pickDisplayPeriod,
  randomCreatedAt,
  randomInt,
  shiftIso,
  yieldToEventLoop,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import { createSystemDevSimulationRandom } from "../../domain/systemDevSimulation/random.js";
import {
  buildReplayNoteDefaultTitle,
  buildReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate,
  getReplayNoteBuilderCopy,
} from "@zinuto/shared/replayNoteBuilder";
import { REPLAY_NOTE_COLOR_TOKENS } from "@zinuto/shared/replayNoteColors";
import { normalizeReplayNoteDocument } from "@zinuto/shared/replayNoteDocument";
import {
  resolveAppUiLanguage,
  type SystemDevSimulationCopy,
} from "@zinuto/shared/systemDevSimulationCopy";
import type {
  SystemDevSimulationEffectivePlan,
  SystemDevSimulationFastDecisionOutcomeBucket,
  SystemDevSimulationRiskDisciplineOutcomeBucket,
} from "@zinuto/shared/systemDevSimulationProfiles";
import type { SpecialTrainingSimulationSymbolGroup } from "./barCache.js";
import {
  buildFastDecisionSimulationPayload,
  buildRiskDisciplineScenarioActions,
  createSimulationSpecialTrainingBank,
  requireSpecialTrainingQuestionLookback,
  requireSpecialTrainingRuntimeQuestion,
  resolveSpecialTrainingSimulationPlan,
  type SpecialTrainingSimulationQuestion,
} from "./challengeScenarioRuntime.js";
import {
  buildSimulationColors,
  noteTextBlock,
} from "./freeReplayNoteTask.js";
import {
  buildPopulatedReflectionSections,
  buildSpecialTrainingReflectionEntries,
} from "./simulationNoteReflections.js";
import { pickCoverageValue } from "./simulationHelpers.js";
import { createSystemDevSimulationTimeline } from "./timeline.js";
import {
  listInstrumentIdsForSimulationSymbols,
  listSystemDevSimulationInstrumentCapacities,
} from "../ports/infrastructure/db/systemDevSimulation/simulationReadStore.js";
import { throwIfSystemDevSimulationTaskAborted } from "./taskExecutionState.js";

type Language = ReturnType<typeof resolveAppUiLanguage>;

export const simulateChallengeItem = async (
  modeId: SpecialTrainingModeId,
  symbolGroups: SpecialTrainingSimulationSymbolGroup[],
  index: number,
  options: {
    copy: SystemDevSimulationCopy;
    effectivePlan: SystemDevSimulationEffectivePlan;
    language: Language;
    simulationBatchId: string;
    fastOutcomeBucket: SystemDevSimulationFastDecisionOutcomeBucket;
    riskOutcomeBucket: SystemDevSimulationRiskDisciplineOutcomeBucket;
    signal?: AbortSignal;
  },
): Promise<{
  replayNotesCreated: number;
  questionCount: number;
  coverage: {
    createdQuestionBanks: number;
    previewedQuestionBanks: number;
    resetQuestionBanks: number;
    discardedChallenges: number;
    settledAts: string[];
    decisionSecondsUsed: number[];
  };
}> => {
  const throwIfAborted = (): void =>
    throwIfSystemDevSimulationTaskAborted(options.signal);
  throwIfAborted();
  const normalizedSymbolGroups = symbolGroups.flatMap((symbolGroup) => {
    const explicitInstrumentIds = Array.from(
      new Set(
        (symbolGroup.instrumentIds ?? [])
          .map((instrumentId) => String(instrumentId || "").trim())
          .filter((instrumentId) => instrumentId.length > 0),
      ),
    );
    const instrumentIds = explicitInstrumentIds.length
      ? explicitInstrumentIds
      : listInstrumentIdsForSimulationSymbols({
          baseTimeframe: symbolGroup.baseTimeframe,
          symbols: symbolGroup.symbols,
        });
    return instrumentIds.length && symbolGroup.poolIds.length
      ? [{ ...symbolGroup, instrumentIds }]
      : [];
  });
  const seedGroups = normalizedSymbolGroups.filter(
    (symbolGroup) => !symbolGroup.fallbackOnly,
  );
  const seedGroupCandidates = seedGroups.length
    ? seedGroups
    : normalizedSymbolGroups;
  const seedGroup =
    seedGroupCandidates[index % Math.max(1, seedGroupCandidates.length)] ??
    seedGroupCandidates[0];
  if (!seedGroup) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  const itemRandom = createSystemDevSimulationRandom(
    `${options.simulationBatchId}:${modeId}:${index}:${seedGroup.baseTimeframe}`,
  );
  const createdAt = randomCreatedAt(itemRandom.fork("created-at"));
  const timeline = createSystemDevSimulationTimeline({
    startIso: createdAt,
    random: itemRandom.fork("timeline"),
  });
  timeline.advanceSeconds(20, 180);
  let questionCount =
    modeId === "fast-decision-training"
      ? itemRandom.pick(FAST_DECISION_QUESTION_COUNTS)
      : itemRandom.pick(RISK_QUESTION_COUNTS);
  const allowedQuestionCounts =
    modeId === "fast-decision-training"
      ? FAST_DECISION_QUESTION_COUNTS
      : RISK_QUESTION_COUNTS;
  const allowedHorizonBars =
    modeId === "fast-decision-training"
      ? FAST_DECISION_HORIZONS
      : RISK_HORIZONS;
  const preferredHorizonBars = itemRandom.pick(allowedHorizonBars);
  const instrumentCapacities = listSystemDevSimulationInstrumentCapacities(
    normalizedSymbolGroups.flatMap((symbolGroup) => symbolGroup.instrumentIds),
  );
  const simulationPlan = resolveSpecialTrainingSimulationPlan({
    modeId,
    symbolGroups: normalizedSymbolGroups,
    instrumentCapacities,
    index,
    preferredBaseTimeframe: seedGroup.baseTimeframe,
    preferredHorizonBars,
    allowedHorizonBars,
    minimumQuestionCount: allowedQuestionCounts[0]!,
  });
  if (!simulationPlan) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", {
      reason: "SPECIAL_TRAINING_CAPACITY_UNAVAILABLE",
      modeId,
      preferredHorizonBars,
    });
  }
  const {
    symbolGroup,
    horizonBars,
    enabledInstrumentIds,
    availableQuestionCount,
  } = simulationPlan;
  throwIfAborted();
  const bank = createSimulationSpecialTrainingBank({
    modeId,
    symbolGroup,
    simulationBatchId: options.simulationBatchId,
    index,
    language: options.language,
  });
  const coverage = {
    createdQuestionBanks: 1,
    previewedQuestionBanks: 0,
    resetQuestionBanks: 0,
    discardedChallenges: 0,
    settledAts: [] as string[],
    decisionSecondsUsed: [] as number[],
  };
  throwIfAborted();
  const preview = await previewSpecialTrainingQuestionBank({
    bankId: bank.id,
    modeId,
    horizonBars,
  });
  throwIfAborted();
  coverage.previewedQuestionBanks += 1;
  const usableQuestionCount = Math.min(
    preview.availableQuestionCount,
    availableQuestionCount,
  );
  questionCount =
    allowedQuestionCounts
      .filter((count) => count <= usableQuestionCount)
      .at(-1) ?? allowedQuestionCounts[0]!;
  if (usableQuestionCount < questionCount) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", {
      reason: "SPECIAL_TRAINING_CAPACITY_CHANGED",
      modeId,
      horizonBars,
      usableQuestionCount,
    });
  }
  if (index % 2 === 1) {
    throwIfAborted();
    await resetSpecialTrainingQuestionBank({
      bankId: bank.id,
      modeId,
      horizonBars,
    });
    throwIfAborted();
    coverage.resetQuestionBanks += 1;
  }
  const startPayload =
    modeId === "fast-decision-training"
      ? {
          bankId: bank.id,
          modeId,
          questionCount,
          resolvedInstrumentIds: enabledInstrumentIds,
          timeframe: symbolGroup.baseTimeframe,
          horizonBars,
          decisionSecondsLimit: itemRandom.pick(FAST_DECISION_SECONDS),
          fastDecisionStrictnessLevel: itemRandom.pick(
            FAST_DECISION_STRICTNESS,
          ),
          sourceTag: DEV_SIMULATION_LEDGER_SOURCE_TAG,
          simulationBatchId: options.simulationBatchId,
        }
      : {
          bankId: bank.id,
          modeId,
          questionCount,
          resolvedInstrumentIds: enabledInstrumentIds,
          timeframe: symbolGroup.baseTimeframe,
          horizonBars,
          maxOperations: randomInt(3, 8, itemRandom),
          sourceTag: DEV_SIMULATION_LEDGER_SOURCE_TAG,
          simulationBatchId: options.simulationBatchId,
        };
  if (index % 3 === 1) {
    throwIfAborted();
    const unfinishedChallenge =
      await startSpecialTrainingChallenge(startPayload);
    throwIfAborted();
    const unfinishedQuestion = requireSpecialTrainingRuntimeQuestion(
      unfinishedChallenge.runtime,
    );
    throwIfAborted();
    await settleSpecialTrainingQuestion(
      unfinishedChallenge.challengeId,
      unfinishedQuestion.id,
      {
        abandoned: true,
        cursorIndex: unfinishedQuestion.startIndex,
      },
      { settledAt: timeline.advanceSeconds(8, 45) },
    );
    throwIfAborted();
    discardSpecialTrainingChallenge(unfinishedChallenge.challengeId);
    coverage.discardedChallenges += 1;
    throwIfAborted();
    await resetSpecialTrainingQuestionBank({
      bankId: bank.id,
      modeId,
      horizonBars:
        "horizonBars" in startPayload
          ? Number(startPayload.horizonBars) || undefined
          : undefined,
    });
    throwIfAborted();
    coverage.resetQuestionBanks += 1;
  }
  throwIfAborted();
  const challenge = await startSpecialTrainingChallenge(startPayload);
  throwIfAborted();
  let lastSettlement: SpecialTrainingSettlementResult | null = null;
  let lastQuestion: SpecialTrainingSimulationQuestion | null = null;
  let lastActions: SpecialTrainingTradeAction[] = [];
  let lastSettledAt = timeline.currentIso();

  for (
    let questionIndex = 0;
    questionIndex < challenge.questionCount;
    questionIndex += 1
  ) {
    if (questionIndex > 0) {
      await yieldToEventLoop();
      throwIfAborted();
    }
    const runtime =
      questionIndex === 0
        ? challenge.runtime
        : await getSpecialTrainingChallengeRuntime(challenge.challengeId);
    const question = requireSpecialTrainingRuntimeQuestion(runtime);
    requireSpecialTrainingQuestionLookback(modeId, question);
    lastQuestion = question;
    if (modeId === "fast-decision-training") {
      const fastDecision = buildFastDecisionSimulationPayload({
        question,
        horizonBars:
          "horizonBars" in startPayload
            ? Number(startPayload.horizonBars) || 20
            : 20,
        decisionSecondsLimit:
          "decisionSecondsLimit" in startPayload &&
          Number.isFinite(Number(startPayload.decisionSecondsLimit))
            ? Number(startPayload.decisionSecondsLimit)
            : 20,
        strictnessLevel:
          "fastDecisionStrictnessLevel" in startPayload
            ? (startPayload.fastDecisionStrictnessLevel ?? "STANDARD")
            : "STANDARD",
        outcomeBucket: options.fastOutcomeBucket,
        random: itemRandom.fork(`fast:${questionIndex}`),
      });
      const settledAt = timeline.advanceMilliseconds(
        Math.max(1000, Math.round(fastDecision.decisionSecondsUsed * 1000)),
      );
      coverage.settledAts.push(settledAt);
      coverage.decisionSecondsUsed.push(fastDecision.decisionSecondsUsed);
      throwIfAborted();
      lastSettlement = await settleSpecialTrainingQuestion(
        challenge.challengeId,
        question.id,
        {
          abandoned: false,
          fastDecision,
        },
        { settledAt },
      );
      throwIfAborted();
      lastSettledAt = settledAt;
      timeline.advanceSeconds(3, 45);
      lastActions = [];
      continue;
    }
    lastActions = buildRiskDisciplineScenarioActions({
      question,
      maxOperations:
        "maxOperations" in startPayload
          ? Number(startPayload.maxOperations) || 0
          : 0,
      outcomeBucket: options.riskOutcomeBucket,
      random: itemRandom.fork(`risk:${questionIndex}`),
    });
    const riskDecisionSeconds = randomInt(
      8,
      Math.max(18, 8 + lastActions.length * 9 + horizonBars * 2),
      itemRandom,
    );
    const settledAt = timeline.advanceSeconds(
      riskDecisionSeconds,
      riskDecisionSeconds,
    );
    coverage.settledAts.push(settledAt);
    coverage.decisionSecondsUsed.push(riskDecisionSeconds);
    throwIfAborted();
    lastSettlement = await settleSpecialTrainingQuestion(
      challenge.challengeId,
      question.id,
      {
        abandoned: false,
        cursorIndex: question.endIndex,
        decisionSecondsUsed: riskDecisionSeconds,
        tradeActions: lastActions,
      },
      { settledAt },
    );
    throwIfAborted();
    lastSettledAt = settledAt;
    timeline.advanceSeconds(3, 45);
  }

  if (!lastSettlement || !lastQuestion) {
    throw appError("SYSTEM_DEV_SIMULATION_FAILED");
  }

  const summaryChips = buildChallengeSummaryChips(
    modeId,
    lastSettlement,
    options.copy,
  );
  await yieldToEventLoop();
  const replay = buildChallengeReplay(
    modeId,
    challenge.challengeId,
    {
      id: lastQuestion.id,
      symbol: lastQuestion.symbol,
      timeframe: symbolGroup.baseTimeframe,
      bars: lastQuestion.bars,
      startIndex: lastQuestion.startIndex,
      endIndex: lastQuestion.endIndex,
    },
    lastSettlement,
    lastActions,
    createdAt,
    summaryChips,
    {
      rng: itemRandom.fork("challenge-drawings"),
      maxDrawings: modeId === "fast-decision-training" ? 2 : 3,
    },
  );

  const shouldCreateModeNote =
    index < options.effectivePlan.notePolicy.challengeForceCreateUntil ||
    itemRandom.next() <
      options.effectivePlan.notePolicy.challengeCreateProbability;
  if (shouldCreateModeNote) {
    const noteType = "CHALLENGE" as const;
    const meta = buildReplayNoteSeedMeta(noteType);
    const source = buildReplayNoteSourceForCreate({
      noteType,
      trainingProjectId: `special-training:${modeId}:${challenge.challengeId}`,
      contextSessionId: `special-training:${lastQuestion.id}`,
      symbol: lastQuestion.symbol,
    });
    const reflectionEntries = buildSpecialTrainingReflectionEntries({
      modeId,
      language: options.language,
    });
    const noteCreatedAt = shiftIso(
      lastSettledAt,
      randomInt(5, 90, itemRandom) * 60 * 1000,
    );
    throwIfAborted();
    await createReplayNote({
      id: createId(),
      title: buildReplayNoteDefaultTitle({
        language: options.language,
        noteType,
        createdAt: noteCreatedAt,
        symbol: lastQuestion.symbol,
        displayPeriod: symbolGroup.baseTimeframe,
        baseTimeframe: symbolGroup.baseTimeframe,
        advantageRatio:
          modeId === "fast-decision-training"
            ? Number(
                lastSettlement.directionResult?.selectedMfeMaeRatio ??
                  Number.NaN,
              )
            : null,
        winRate:
          modeId === "fast-decision-training"
            ? lastSettlement.directionResult?.correct
              ? 1
              : 0
            : null,
        grade:
          modeId === "risk-discipline-training" ? lastSettlement.grade : null,
        recoveryRate:
          modeId === "risk-discipline-training"
            ? lastSettlement.recoveryRate
            : null,
      }),
      type: noteType,
      contentDocument: normalizeReplayNoteDocument({
        schemaVersion: 1,
        blocks: [
          ...buildChallengeNoteDocument(
            modeId,
            lastQuestion.symbol,
            lastSettlement,
            summaryChips,
            options.copy,
          ).blocks,
          noteTextBlock(
            "H2",
            getReplayNoteBuilderCopy(options.language).reflection,
          ),
          ...buildPopulatedReflectionSections({
            language: options.language,
            reflectionSections: meta.reflectionSections,
            reflectionEntries,
          }).flatMap((section) => [
            noteTextBlock("H2", section.label),
            noteTextBlock("PARAGRAPH", section.value),
          ]),
        ],
      }),
      contextReplay: replay,
      trainingProjectId: `special-training:${modeId}:${challenge.challengeId}`,
      contextSessionId: `special-training:${lastQuestion.id}`,
      contextCursorIndex: Math.max(0, replay.bars.length - 1),
      contextDisplayPeriod: pickDisplayPeriod(
        replay.baseTimeframe ?? "1d",
        itemRandom.fork("note-display"),
      ),
      simulationBatchId: options.simulationBatchId,
      sourceKind: source.kind,
      sourceId: source.id,
      colorTokens: buildSimulationColors(
        options.effectivePlan.notePolicy.maxColorCount,
        `${options.simulationBatchId}:${modeId}:colors:${index}`,
        [
          pickCoverageValue(
            options.effectivePlan.coverage.noteColorTokens,
            REPLAY_NOTE_COLOR_TOKENS,
            index + (modeId === "risk-discipline-training" ? 1 : 0),
          ),
        ],
      ),
      meta: {
        ...meta,
        reflectionEntries,
      },
      createdAt: noteCreatedAt,
      updatedAt: shiftIso(
        noteCreatedAt,
        randomInt(10, 120, itemRandom) * 60 * 1000,
      ),
    });
    throwIfAborted();
  }
  await yieldToEventLoop();
  return {
    replayNotesCreated: shouldCreateModeNote ? 1 : 0,
    questionCount,
    coverage,
  };
};
