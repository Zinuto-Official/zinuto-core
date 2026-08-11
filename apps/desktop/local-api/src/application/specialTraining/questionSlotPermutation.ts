// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from 'node:crypto';
import { randomInt, toFiniteNumber } from './util.js';
import { QUESTION_DRAW_PERMUTATION_SCHEMA_VERSION } from './questionScopeSemantics.js';
import type {
  SpecialTrainingQuestionScopeState,
  SpecialTrainingQuestionSlot,
  SpecialTrainingQuestionSlotRange,
} from '../../domain/specialTraining/contracts.js';

export const shuffleInPlace = <T>(items: T[]): void => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    const temp = items[index]!;
    items[index] = items[swapIndex]!;
    items[swapIndex] = temp;
  }
};

export const findQuestionSlotRangeByOrdinal = (
  scopeState: SpecialTrainingQuestionScopeState,
  ordinal: number,
): SpecialTrainingQuestionSlotRange | null => {
  const safeOrdinal = Math.max(0, Math.floor(toFiniteNumber(ordinal) || 0));
  const ranges = scopeState.slotRanges;
  let left = 0;
  let right = ranges.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const range = ranges[mid];
    if (!range) {
      return null;
    }
    const start = Math.max(0, Math.floor(toFiniteNumber(range.slotStartIndex) || 0));
    const count = Math.max(0, Math.floor(toFiniteNumber(range.slotCount) || 0));
    const end = start + count;
    if (safeOrdinal < start) {
      right = mid - 1;
      continue;
    }
    if (safeOrdinal >= end) {
      left = mid + 1;
      continue;
    }
    if (safeOrdinal >= start && safeOrdinal < start + count) {
      return range;
    }
  }
  return null;
};

export const buildSlotFromRange = (
  range: SpecialTrainingQuestionSlotRange,
  ordinal: number,
): SpecialTrainingQuestionSlot | null => {
  const slotIndex = Math.max(0, Math.floor(toFiniteNumber(ordinal) || 0));
  const localSlotIndex = slotIndex - range.slotStartIndex;
  if (localSlotIndex < 0 || localSlotIndex >= range.slotCount) {
    return null;
  }
  const displayStartIndex = localSlotIndex * range.effectiveSlotStrideBars;
  const displayEndIndex =
    displayStartIndex + range.effectiveWindowBarCount - 1;
  const questionStartIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(range.startIndex) || 0),
  );
  const questionEndIndex = Math.max(
    questionStartIndex,
    Math.floor(toFiniteNumber(range.endIndex) || 0),
  );
  if (
    displayStartIndex < 0 ||
    displayEndIndex >= range.totalEffectiveBars ||
    questionEndIndex <= questionStartIndex ||
    questionEndIndex >= range.effectiveWindowBarCount
  ) {
    return null;
  }

  const isNativeWindow = range.sourceTimeframe === range.effectiveTimeframe;
  const windowStartIndex = isNativeWindow ? displayStartIndex : 0;
  const windowEndIndex = isNativeWindow ? displayEndIndex : 0;
  const sourceWindowBarCount = isNativeWindow
    ? range.effectiveWindowBarCount
    : 0;

  return {
    instrumentId: range.instrumentId,
    samplePoolId: range.samplePoolId,
    symbol: range.symbol,
    slotIndex,
    displayStartIndex,
    displayEndIndex,
    windowStartIndex,
    windowEndIndex,
    startIndex: questionStartIndex,
    endIndex: questionEndIndex,
    targetTimeframe: range.targetTimeframe,
    minimumBaseTimeframe: range.minimumBaseTimeframe,
    sourceTimeframe: range.sourceTimeframe,
    effectiveTimeframe: range.effectiveTimeframe,
    sourceBarsPerEffectiveBar: range.sourceBarsPerEffectiveBar,
    timeZone: range.timeZone,
    effectiveWindowBarCount: range.effectiveWindowBarCount,
    sourceWindowBarCount,
    barsVersionToken: range.barsVersionToken,
    minTradeStep: range.minTradeStep,
  };
};

export const resolveDisplaySlotByOrdinal = async (
  scopeState: SpecialTrainingQuestionScopeState,
  ordinal: number,
): Promise<SpecialTrainingQuestionSlot | null> => {
  const range = findQuestionSlotRangeByOrdinal(scopeState, ordinal);
  return range ? buildSlotFromRange(range, ordinal) : null;
};

export const hashToModulo = (parts: string[], modulo: number): number => {
  const normalizedModulo = Math.max(0, Math.floor(toFiniteNumber(modulo) || 0));
  if (normalizedModulo <= 1) {
    return 0;
  }
  const digest = createHash("sha256").update(parts.join("|")).digest("hex");
  return Number(BigInt(`0x${digest.slice(0, 16)}`) % BigInt(normalizedModulo));
};

export const gcd = (left: number, right: number): number => {
  let a = Math.abs(Math.floor(left));
  let b = Math.abs(Math.floor(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
};

export const resolvePermutationStep = (input: {
  scopeHash: string;
  cycleIndex: number;
  totalQuestionCount: number;
}): number => {
  const totalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(input.totalQuestionCount) || 0),
  );
  if (totalQuestionCount <= 1) {
    return 0;
  }
  let step = hashToModulo(
    [
      QUESTION_DRAW_PERMUTATION_SCHEMA_VERSION,
      input.scopeHash,
      `cycle:${input.cycleIndex}`,
      "step",
    ],
    totalQuestionCount,
  );
  if (step <= 0) {
    step = 1;
  }
  while (gcd(step, totalQuestionCount) !== 1) {
    step += 1;
    if (step >= totalQuestionCount) {
      step = 1;
    }
  }
  return step;
};

export const resolveDeterministicQuestionSlotOrdinal = (input: {
  scopeHash: string;
  cycleIndex: number;
  position: number;
  totalQuestionCount: number;
}): number => {
  const totalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(input.totalQuestionCount) || 0),
  );
  if (totalQuestionCount <= 1) {
    return 0;
  }
  const offset = hashToModulo(
    [
      QUESTION_DRAW_PERMUTATION_SCHEMA_VERSION,
      input.scopeHash,
      `cycle:${input.cycleIndex}`,
      "offset",
    ],
    totalQuestionCount,
  );
  const step = resolvePermutationStep({
    scopeHash: input.scopeHash,
    cycleIndex: Math.max(0, Math.floor(toFiniteNumber(input.cycleIndex) || 0)),
    totalQuestionCount,
  });
  const position = Math.max(0, Math.floor(toFiniteNumber(input.position) || 0));
  return (offset + position * step) % totalQuestionCount;
};

export const buildDeterministicQuestionSlotPermutation = (input: {
  scopeHash: string;
  cycleIndex?: number;
  totalQuestionCount: number;
  limit?: number;
}): number[] => {
  const totalQuestionCount = Math.max(
    0,
    Math.floor(toFiniteNumber(input.totalQuestionCount) || 0),
  );
  const limit = Math.max(
    0,
    Math.min(
      totalQuestionCount,
      Math.floor(toFiniteNumber(input.limit ?? totalQuestionCount) || 0),
    ),
  );
  return Array.from({ length: limit }, (_, position) =>
    resolveDeterministicQuestionSlotOrdinal({
      scopeHash: input.scopeHash,
      cycleIndex: Math.max(0, Math.floor(toFiniteNumber(input.cycleIndex) || 0)),
      position,
      totalQuestionCount,
    }),
  );
};

export const selectRemainingQuestionSlots = async (
  scopeState: SpecialTrainingQuestionScopeState,
  usedSlotKeys: Set<string>,
  questionCount: number,
): Promise<SpecialTrainingQuestionSlot[]> => {
  void usedSlotKeys;
  const requestedCount = Math.max(0, Math.floor(toFiniteNumber(questionCount) || 0));
  if (requestedCount <= 0 || scopeState.totalQuestionCount <= 0) {
    return [];
  }
  return buildDeterministicQuestionSlotPermutation({
    scopeHash: scopeState.scopeHash,
    cycleIndex: 0,
    totalQuestionCount: scopeState.totalQuestionCount,
    limit: requestedCount,
  })
    .map((ordinal) => {
      const range = findQuestionSlotRangeByOrdinal(scopeState, ordinal);
      return range ? buildSlotFromRange(range, ordinal) : null;
    })
    .filter((slot): slot is SpecialTrainingQuestionSlot => Boolean(slot));
};
