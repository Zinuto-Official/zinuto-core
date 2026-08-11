// SPDX-License-Identifier: GPL-3.0-only

const randomInt = (min: number, max: number): number => {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return (
    safeMin + Math.floor(Math.random() * Math.max(1, safeMax - safeMin + 1))
  );
};

const shuffleInPlace = <T>(items: T[]): void => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    const temp = items[index]!;
    items[index] = items[swapIndex]!;
    items[swapIndex] = temp;
  }
};

type RiskTradeQuestion = {
  startIndex: number;
  endIndex: number;
};

type RiskTradeAction = {
  type: "BUY" | "SELL";
  barIndex: number;
  inputMode: "RATIO";
  priceMode: "CUR_CLOSE";
  ratioInput: string;
  quantity: number;
  executionPrice: number;
  cashEffect: number;
};

type BuildRiskTradeActionBarIndexesOptions = {
  pickInt?: (min: number, max: number) => number;
  shuffle?: (items: number[]) => void;
};

type BuildRiskTradeActionsOptions = BuildRiskTradeActionBarIndexesOptions & {
  next?: () => number;
};

export const buildRiskTradeActionBarIndexes = (
  question: RiskTradeQuestion,
  maxOperations: number,
  options?: BuildRiskTradeActionBarIndexesOptions,
): number[] => {
  const safeStartIndex = Math.max(
    0,
    Math.floor(Number(question.startIndex) || 0),
  );
  const safeEndIndex = Math.max(
    safeStartIndex,
    Math.floor(Number(question.endIndex) || safeStartIndex),
  );
  const lastActionableIndex = Math.max(safeStartIndex, safeEndIndex - 1);
  const candidateIndexes: number[] = [];
  for (
    let barIndex = safeStartIndex;
    barIndex <= lastActionableIndex;
    barIndex += 1
  ) {
    candidateIndexes.push(barIndex);
  }

  const pickInt = options?.pickInt ?? randomInt;
  const shuffle = options?.shuffle ?? shuffleInPlace;
  const maxRequestedOperations = Math.max(
    1,
    Math.floor(Number(maxOperations) || 0),
  );
  const requestedOperations = pickInt(
    1,
    maxOperations > 0 ? maxRequestedOperations : Math.max(1, candidateIndexes.length),
  );
  const totalOperations = Math.min(
    Math.max(1, candidateIndexes.length),
    Math.max(1, Math.floor(Number(requestedOperations) || 1)),
  );

  shuffle(candidateIndexes);
  return candidateIndexes
    .slice(0, totalOperations)
    .sort((left, right) => left - right);
};

export const buildRiskTradeActions = (
  question: RiskTradeQuestion,
  maxOperations: number,
  options?: BuildRiskTradeActionsOptions,
): RiskTradeAction[] => {
  const sortedIndexes = buildRiskTradeActionBarIndexes(
    question,
    maxOperations,
    options,
  );
  const pickInt = options?.pickInt ?? randomInt;
  const next = options?.next ?? Math.random;
  let hasPosition = false;
  const buildAction = (
    type: "BUY" | "SELL",
    barIndex: number,
    ratioInput: number,
  ): RiskTradeAction => ({
    type,
    barIndex,
    inputMode: "RATIO",
    priceMode: "CUR_CLOSE",
    ratioInput: String(ratioInput),
    quantity: 0,
    executionPrice: 0,
    cashEffect: 0,
  });
  return sortedIndexes.map((barIndex, index) => {
    if (!hasPosition) {
      hasPosition = true;
      return buildAction("BUY", barIndex, [25, 50, 75, 100][pickInt(0, 3)]!);
    }
    const shouldSell = index === sortedIndexes.length - 1 || next() < 0.52;
    if (shouldSell) {
      hasPosition = false;
      return buildAction("SELL", barIndex, [25, 50, 100][pickInt(0, 2)]!);
    }
    return buildAction("BUY", barIndex, [10, 25, 50][pickInt(0, 2)]!);
  });
};
