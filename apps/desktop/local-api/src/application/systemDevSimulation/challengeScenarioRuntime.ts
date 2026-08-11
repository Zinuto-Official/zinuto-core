// SPDX-License-Identifier: GPL-3.0-only

import { INPUT_LIMITS, trimAndLimitInputText } from '@zinuto/shared/input-limits';
import { evaluateFastDecision as evaluateFastDecisionShared } from '@zinuto/shared/domain-calculations/fast-decision';
import { resolveSpecialTrainingLookbackBars } from '@zinuto/shared/specialTrainingModes';
import type { SystemDevSimulationFastDecisionOutcomeBucket, SystemDevSimulationRiskDisciplineOutcomeBucket } from '@zinuto/shared/systemDevSimulationProfiles';
import { resolveAppUiLanguage } from '@zinuto/shared/systemDevSimulationCopy';
import { appError } from '../../kernel/appError.js';
import { createSpecialTrainingBank } from '../specialTraining/banks.js';
import type {
  SpecialTrainingBankSummary,
  SpecialTrainingChallengeRuntime,
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingModeId,
  SpecialTrainingTradeAction,
} from '../../domain/specialTraining/contracts.js';
import { buildRiskTradeActions } from '../systemDevSimulationRiskActions.js';
import type { SpecialTrainingSimulationSymbolGroup } from './barCache.js';
import type { SystemDevSimulationRandom } from '../../domain/systemDevSimulation/random.js';
import { type ReplayArchive } from '../../domain/systemDevSimulation/sharedDomain.js';
import { SLOT_STRIDE_DIVISOR } from '../../domain/specialTraining/constants.js';
import { buildRealisticTrainingBankName } from './presentation.js';

export type SpecialTrainingSimulationQuestion = NonNullable<
  SpecialTrainingChallengeRuntime['question']
> & {
  bars: ReplayArchive['bars'];
};

export type SpecialTrainingSimulationInstrumentCapacity = {
  instrumentId: string;
  symbol: string;
  barCount: number;
};

export type SpecialTrainingSimulationPlan = {
  symbolGroup: SpecialTrainingSimulationSymbolGroup;
  horizonBars: number;
  enabledInstrumentIds: string[];
  availableQuestionCount: number;
};

const rotateSimulationGroups = <T>(items: T[], index: number): T[] => {
  if (items.length <= 1) {
    return items;
  }
  const offset =
    ((Math.floor(Number(index) || 0) % items.length) + items.length) %
    items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
};

const countFullLookbackQuestionSlots = (params: {
  barCount: number;
  lookbackBars: number;
  horizonBars: number;
}): number => {
  const windowBarCount = params.lookbackBars + params.horizonBars;
  const maxWindowStartIndex =
    Math.max(0, Math.floor(Number(params.barCount) || 0)) - windowBarCount;
  if (maxWindowStartIndex < 0) {
    return 0;
  }
  const slotStrideBars = Math.max(
    1,
    Math.floor(Math.max(2, windowBarCount) / SLOT_STRIDE_DIVISOR),
  );
  return Math.floor(maxWindowStartIndex / slotStrideBars) + 1;
};

export const resolveSpecialTrainingSimulationPlan = (params: {
  modeId: SpecialTrainingModeId;
  symbolGroups: SpecialTrainingSimulationSymbolGroup[];
  instrumentCapacities: SpecialTrainingSimulationInstrumentCapacity[];
  index: number;
  preferredBaseTimeframe: SpecialTrainingSimulationSymbolGroup['baseTimeframe'];
  preferredHorizonBars: number;
  allowedHorizonBars: readonly number[];
  minimumQuestionCount: number;
}): SpecialTrainingSimulationPlan | null => {
  const preferredHorizonBars = Math.max(
    1,
    Math.floor(Number(params.preferredHorizonBars) || 0),
  );
  const horizonCandidates = Array.from(
    new Set([
      preferredHorizonBars,
      ...params.allowedHorizonBars
        .map((value) => Math.max(1, Math.floor(Number(value) || 0)))
        .filter((value) => value < preferredHorizonBars)
        .sort((left, right) => right - left),
    ]),
  );
  const requiredLookback = resolveSpecialTrainingLookbackBars(params.modeId);
  const minimumQuestionCount = Math.max(
    1,
    Math.floor(Number(params.minimumQuestionCount) || 0),
  );
  const capacityByInstrumentId = new Map(
    params.instrumentCapacities.map((instrument) => [
      instrument.instrumentId,
      instrument,
    ]),
  );
  const groupTiers = [
    params.symbolGroups.filter((group) => !group.fallbackOnly),
    params.symbolGroups.filter((group) => group.fallbackOnly),
  ];

  for (const tier of groupTiers) {
    const rotatedGroups = rotateSimulationGroups(tier, params.index);
    const orderedGroups = [
      ...rotatedGroups.filter(
        (group) => group.baseTimeframe === params.preferredBaseTimeframe,
      ),
      ...rotatedGroups.filter(
        (group) => group.baseTimeframe !== params.preferredBaseTimeframe,
      ),
    ];
    for (const horizonBars of horizonCandidates) {
      for (const symbolGroup of orderedGroups) {
        const eligibleCapacities = symbolGroup.instrumentIds.flatMap(
          (instrumentId) => {
            const capacity = capacityByInstrumentId.get(instrumentId);
            if (!capacity) {
              return [];
            }
            const questionSlotCount = countFullLookbackQuestionSlots({
              barCount: capacity.barCount,
              lookbackBars: requiredLookback,
              horizonBars,
            });
            return questionSlotCount > 0
              ? [{ ...capacity, questionSlotCount }]
              : [];
          },
        );
        const availableQuestionCount = eligibleCapacities.reduce(
          (total, instrument) => total + instrument.questionSlotCount,
          0,
        );
        if (availableQuestionCount < minimumQuestionCount) {
          continue;
        }
        const enabledInstrumentIds = eligibleCapacities.map(
          (instrument) => instrument.instrumentId,
        );
        return {
          symbolGroup: {
            ...symbolGroup,
            symbols: Array.from(
              new Set(eligibleCapacities.map((instrument) => instrument.symbol)),
            ).sort((left, right) => left.localeCompare(right, 'en')),
            instrumentIds: enabledInstrumentIds,
          },
          horizonBars,
          enabledInstrumentIds,
          availableQuestionCount,
        };
      }
    }
  }
  return null;
};

export const buildFastDecisionSimulationPayload = (params: {
  question: {
    bars: ReplayArchive['bars'];
    startIndex: number;
  };
  horizonBars: number;
  decisionSecondsLimit: number;
  strictnessLevel: SpecialTrainingFastDecisionStrictnessLevel;
  outcomeBucket: SystemDevSimulationFastDecisionOutcomeBucket;
  random: SystemDevSimulationRandom;
}) => {
  const dominanceRatio =
    params.strictnessLevel === 'LENIENT'
      ? 1.2
      : params.strictnessLevel === 'STRICT'
        ? 2
        : 1.5;
  const evaluation = evaluateFastDecisionShared({
    bars: params.question.bars,
    startIndex: params.question.startIndex,
    revealBars: Math.max(1, params.horizonBars),
    strictnessLevel: params.strictnessLevel,
    dominanceRatio,
  });
  const actual = evaluation?.actual ?? 'OBSERVE';
  const wrongSelection =
    actual === 'LONG'
      ? 'SHORT'
      : actual === 'SHORT'
        ? 'LONG'
        : params.random.pick(['LONG', 'SHORT'] as const);
  if (params.outcomeBucket === 'TIMEOUT') {
    return {
      selection: 'OBSERVE' as const,
      decisionSecondsUsed: params.decisionSecondsLimit,
      timedOut: true,
    };
  }
  const decisionWindow =
    params.outcomeBucket === 'LATE_CONFIRM'
      ? { min: 0.74, max: 0.96 }
      : params.outcomeBucket === 'WRONG'
        ? { min: 0.26, max: 0.72 }
        : { min: 0.16, max: 0.48 };
  const minSeconds = Math.max(1, params.decisionSecondsLimit * decisionWindow.min);
  const maxSeconds = Math.max(minSeconds, params.decisionSecondsLimit * decisionWindow.max);
  return {
    selection:
      params.outcomeBucket === 'WRONG'
        ? wrongSelection
        : actual === 'OBSERVE' && params.outcomeBucket === 'LATE_CONFIRM'
          ? params.random.pick(['LONG', 'SHORT'] as const)
          : actual,
    decisionSecondsUsed: Number(
      params.random.float(minSeconds, maxSeconds).toFixed(2),
    ),
    timedOut: false,
  };
};

export const buildRiskDisciplineScenarioActions = (params: {
  question: {
    startIndex: number;
    endIndex: number;
  };
  maxOperations: number;
  outcomeBucket: SystemDevSimulationRiskDisciplineOutcomeBucket;
  random: SystemDevSimulationRandom;
}): SpecialTrainingTradeAction[] => {
  const safeStart = params.question.startIndex;
  const safeEnd = Math.max(safeStart, params.question.endIndex);
  const earlyExitIndex = Math.min(safeEnd, safeStart + 1);
  const midIndex = Math.min(safeEnd, safeStart + 3);
  const lateIndex = Math.max(safeStart, safeEnd - 1);
  const buildRatioAction = (
    type: 'BUY' | 'SELL',
    barIndex: number,
    ratioInput: number,
  ): SpecialTrainingTradeAction => ({
    type,
    barIndex,
    inputMode: 'RATIO',
    priceMode: 'CUR_CLOSE',
    ratioInput: String(ratioInput),
    quantity: 0,
    executionPrice: 0,
    cashEffect: 0,
  });
  if (params.outcomeBucket === 'FREEZE') {
    return [];
  }
  if (params.outcomeBucket === 'EARLY_CUT') {
    return [
      buildRatioAction('BUY', safeStart, 50),
      buildRatioAction('SELL', earlyExitIndex, 100),
    ];
  }
  if (params.outcomeBucket === 'ADD_AND_HOLD') {
    return [
      buildRatioAction('BUY', safeStart, 25),
      buildRatioAction('BUY', midIndex, 50),
    ];
  }
  if (params.outcomeBucket === 'RECOVERED') {
    return [
      buildRatioAction('BUY', safeStart, 25),
      buildRatioAction('BUY', midIndex, 25),
      buildRatioAction('SELL', lateIndex, 100),
    ];
  }
  return buildRiskTradeActions(params.question, params.maxOperations, {
    next: params.random.next,
    pickInt: params.random.int,
    shuffle: (items) => {
      const shuffled = params.random.shuffle(items);
      items.splice(0, items.length, ...shuffled);
    },
  });
};

export const requireSpecialTrainingRuntimeQuestion = (
  runtime: SpecialTrainingChallengeRuntime,
): SpecialTrainingSimulationQuestion => {
  const question = runtime.question;
  if (!question || !Array.isArray(question.bars)) {
    throw appError('SYSTEM_DEV_SIMULATION_FAILED');
  }
  return question as SpecialTrainingSimulationQuestion;
};

export const requireSpecialTrainingQuestionLookback = (
  modeId: SpecialTrainingModeId,
  question: SpecialTrainingSimulationQuestion,
): void => {
  const requiredLookback = resolveSpecialTrainingLookbackBars(modeId);
  if (
    question.startIndex + 1 < requiredLookback ||
    question.bars.length < requiredLookback + 1 ||
    question.endIndex <= question.startIndex
  ) {
    throw appError('SYSTEM_DEV_SIMULATION_FAILED', {
      reason: 'SPECIAL_TRAINING_LOOKBACK_TOO_SHORT',
      modeId,
      requiredLookback,
      startIndex: question.startIndex,
      endIndex: question.endIndex,
      barCount: question.bars.length,
    });
  }
};

export const createSimulationSpecialTrainingBank = (params: {
  modeId: SpecialTrainingModeId;
  symbolGroup: SpecialTrainingSimulationSymbolGroup;
  simulationBatchId: string;
  index: number;
  language: ReturnType<typeof resolveAppUiLanguage>;
}): SpecialTrainingBankSummary => {
  const poolIds = Array.from(
    new Set(
      params.symbolGroup.poolIds
        .map((poolId) => String(poolId || '').trim())
        .filter((poolId) => poolId.length > 0),
    ),
  );
  if (!poolIds.length) {
    throw appError('SYSTEM_DEV_SIMULATION_INVALID');
  }
  const bankName = trimAndLimitInputText(
    buildRealisticTrainingBankName({
      language: params.language,
      modeId: params.modeId,
      symbol:
        params.symbolGroup.symbols[
          params.index % Math.max(1, params.symbolGroup.symbols.length)
        ] ?? params.symbolGroup.assetClass,
      timeframe: params.symbolGroup.baseTimeframe,
    }),
    INPUT_LIMITS.specialTrainingBankNameChars,
  );
  return createSpecialTrainingBank({
    name: bankName,
    assetClass: params.symbolGroup.assetClass,
    targetTimeframe: params.symbolGroup.baseTimeframe,
    poolIds,
    simulationBatchId: params.simulationBatchId,
  });
};
