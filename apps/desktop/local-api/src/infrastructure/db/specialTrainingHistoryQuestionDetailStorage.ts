// SPDX-License-Identifier: GPL-3.0-only

import {
  encodeStoredJsonToCompressedBuffer,
  parseStoredJsonSafe,
} from '../../kernel/compressedJson.js';

export const SPECIAL_TRAINING_HISTORY_QUESTION_DETAIL_ENCODING =
  'GZIP_JSON_V2_COMPACT';

export type SpecialTrainingHistoryQuestionDetailPayload = {
  cursorIndex: number | null;
  revealEndIndex: number | null;
  tradeActionCount: number;
  decisionSelection: string | null;
  decisionActual: string | null;
  decisionCorrect: boolean | null;
  decisionTimedOut: boolean | null;
  decisionSecondsUsed: number | null;
  strictnessLevel: string | null;
  dominanceRatio: number | null;
  selectedMfeRatio: number | null;
  selectedMaeRatio: number | null;
  selectedMfeMaeRatio: number | null;
  opportunityDirection: string | null;
  opportunityMfeRatio: number | null;
  opportunityMaeRatio: number | null;
  opportunityMfeMaeRatio: number | null;
  longMfeRatio: number | null;
  longMaeRatio: number | null;
  recoveryRate: number | null;
  alpha: number | null;
  captureRate: number | null;
  firstActionBars: number;
  riskBehavior: string;
  riskReviewGrade: string;
  feedbackCodes: string[];
  tradeActions: Array<{
    type: 'BUY' | 'SELL';
    barIndex: number;
    inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
    priceMode: 'CUR_CLOSE' | 'NEXT_OPEN';
    lotInput?: string | number | null;
    amountInput?: string | number | null;
    ratioInput?: string | number | null;
    quantity: number;
    executionPrice: number;
    cashEffect: number;
  }>;
  riskReview: Record<string, unknown> | null;
  fastReview: Record<string, unknown> | null;
};

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeFiniteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const normalizeNonNegativeIntegerOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Math.floor(Number(value) || 0);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const normalizeBooleanOrNull = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return Boolean(value);
};

const normalizeRecordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeOrderInputValue = (value: unknown): string | number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

const normalizeTradeActions = (
  value: unknown,
): SpecialTrainingHistoryQuestionDetailPayload['tradeActions'] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map<SpecialTrainingHistoryQuestionDetailPayload['tradeActions'][number] | null>((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const type = normalizeText(record.type).toUpperCase();
      if (type !== 'BUY' && type !== 'SELL') {
        return null;
      }
      return {
        type,
        barIndex: Math.max(0, Math.floor(Number(record.barIndex) || 0)),
        inputMode:
          record.inputMode === 'LOT' || record.inputMode === 'AMOUNT'
            ? record.inputMode
            : 'RATIO',
        priceMode: record.priceMode === 'NEXT_OPEN' ? 'NEXT_OPEN' : 'CUR_CLOSE',
        lotInput: normalizeOrderInputValue(record.lotInput),
        amountInput: normalizeOrderInputValue(record.amountInput),
        ratioInput: normalizeOrderInputValue(record.ratioInput),
        quantity: Math.max(0, Number(record.quantity) || 0),
        executionPrice: Math.max(0, Number(record.executionPrice) || 0),
        cashEffect: Math.max(0, Number(record.cashEffect) || 0),
      } as const;
    })
    .filter(
      (
        item,
      ): item is {
        type: 'BUY' | 'SELL';
        barIndex: number;
        inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
        priceMode: 'CUR_CLOSE' | 'NEXT_OPEN';
        lotInput?: string | number | null;
        amountInput?: string | number | null;
        ratioInput?: string | number | null;
        quantity: number;
        executionPrice: number;
        cashEffect: number;
      } => Boolean(item),
    );
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
};

const trimTrailingEmptyValues = (values: unknown[]): unknown[] => {
  const next = [...values];
  while (next.length > 0) {
    const value = next[next.length - 1];
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmptyRecord =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0;
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      value === 0 ||
      isEmptyArray ||
      isEmptyRecord
    ) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
};

export const normalizeSpecialTrainingHistoryQuestionDetailPayload = (
  value: unknown,
): SpecialTrainingHistoryQuestionDetailPayload => {
  const payload =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<SpecialTrainingHistoryQuestionDetailPayload>)
      : {};
  return {
    cursorIndex: normalizeNonNegativeIntegerOrNull(payload.cursorIndex),
    revealEndIndex: normalizeNonNegativeIntegerOrNull(payload.revealEndIndex),
    tradeActionCount: normalizeNonNegativeInteger(payload.tradeActionCount),
    decisionSelection: normalizeText(payload.decisionSelection) || null,
    decisionActual: normalizeText(payload.decisionActual) || null,
    decisionCorrect: normalizeBooleanOrNull(payload.decisionCorrect),
    decisionTimedOut: normalizeBooleanOrNull(payload.decisionTimedOut),
    decisionSecondsUsed: normalizeFiniteNumberOrNull(payload.decisionSecondsUsed),
    strictnessLevel: normalizeText(payload.strictnessLevel) || null,
    dominanceRatio: normalizeFiniteNumberOrNull(payload.dominanceRatio),
    selectedMfeRatio: normalizeFiniteNumberOrNull(payload.selectedMfeRatio),
    selectedMaeRatio: normalizeFiniteNumberOrNull(payload.selectedMaeRatio),
    selectedMfeMaeRatio: normalizeFiniteNumberOrNull(
      payload.selectedMfeMaeRatio,
    ),
    opportunityDirection: normalizeText(payload.opportunityDirection) || null,
    opportunityMfeRatio: normalizeFiniteNumberOrNull(payload.opportunityMfeRatio),
    opportunityMaeRatio: normalizeFiniteNumberOrNull(payload.opportunityMaeRatio),
    opportunityMfeMaeRatio: normalizeFiniteNumberOrNull(
      payload.opportunityMfeMaeRatio,
    ),
    longMfeRatio: normalizeFiniteNumberOrNull(payload.longMfeRatio),
    longMaeRatio: normalizeFiniteNumberOrNull(payload.longMaeRatio),
    recoveryRate: normalizeFiniteNumberOrNull(payload.recoveryRate),
    alpha: normalizeFiniteNumberOrNull(payload.alpha),
    captureRate: normalizeFiniteNumberOrNull(payload.captureRate),
    firstActionBars: normalizeNonNegativeInteger(payload.firstActionBars),
    riskBehavior: normalizeText(payload.riskBehavior) || 'FREEZE',
    riskReviewGrade: normalizeText(payload.riskReviewGrade),
    feedbackCodes: normalizeStringArray(payload.feedbackCodes),
    tradeActions: normalizeTradeActions(payload.tradeActions),
    riskReview: normalizeRecordOrNull(payload.riskReview),
    fastReview: normalizeRecordOrNull(payload.fastReview),
  };
};

export const encodeSpecialTrainingHistoryQuestionDetailPayload = (
  value: SpecialTrainingHistoryQuestionDetailPayload,
): Buffer => {
  const normalized =
    normalizeSpecialTrainingHistoryQuestionDetailPayload(value);
  return encodeStoredJsonToCompressedBuffer(
    trimTrailingEmptyValues([
      normalized.cursorIndex,
      normalized.revealEndIndex,
      normalized.tradeActionCount,
      normalized.decisionSelection,
      normalized.decisionActual,
      normalized.decisionCorrect === null
        ? null
        : normalized.decisionCorrect
          ? 1
          : 0,
      normalized.decisionTimedOut === null
        ? null
        : normalized.decisionTimedOut
          ? 1
          : 0,
      normalized.decisionSecondsUsed,
      normalized.strictnessLevel,
      normalized.dominanceRatio,
      normalized.selectedMfeRatio,
      normalized.selectedMaeRatio,
      normalized.selectedMfeMaeRatio,
      normalized.opportunityDirection,
      normalized.opportunityMfeRatio,
      normalized.opportunityMaeRatio,
      normalized.opportunityMfeMaeRatio,
      normalized.longMfeRatio,
      normalized.longMaeRatio,
      normalized.recoveryRate,
      normalized.alpha,
      normalized.captureRate,
      normalized.firstActionBars,
      normalized.riskBehavior,
      normalized.riskReviewGrade,
      normalized.feedbackCodes,
      normalized.tradeActions,
      normalized.riskReview,
      normalized.fastReview,
    ]),
  );
};

export const parseSpecialTrainingHistoryQuestionDetailPayload = (
  raw: unknown,
): SpecialTrainingHistoryQuestionDetailPayload => {
  const parsed = parseStoredJsonSafe<unknown>(raw, {});
  if (Array.isArray(parsed)) {
    return normalizeSpecialTrainingHistoryQuestionDetailPayload({
      cursorIndex: parsed[0] ?? null,
      revealEndIndex: parsed[1] ?? null,
      tradeActionCount: parsed[2] ?? 0,
      decisionSelection: parsed[3] ?? null,
      decisionActual: parsed[4] ?? null,
      decisionCorrect:
        parsed[5] === null || parsed[5] === undefined
          ? null
          : Number(parsed[5]) === 1,
      decisionTimedOut:
        parsed[6] === null || parsed[6] === undefined
          ? null
          : Number(parsed[6]) === 1,
      decisionSecondsUsed: parsed[7] ?? null,
      strictnessLevel: parsed[8] ?? null,
      dominanceRatio: parsed[9] ?? null,
      selectedMfeRatio: parsed[10] ?? null,
      selectedMaeRatio: parsed[11] ?? null,
      selectedMfeMaeRatio: parsed[12] ?? null,
      opportunityDirection: parsed[13] ?? null,
      opportunityMfeRatio: parsed[14] ?? null,
      opportunityMaeRatio: parsed[15] ?? null,
      opportunityMfeMaeRatio: parsed[16] ?? null,
      longMfeRatio: parsed[17] ?? null,
      longMaeRatio: parsed[18] ?? null,
      recoveryRate: parsed[19] ?? null,
      alpha: parsed[20] ?? null,
      captureRate: parsed[21] ?? null,
      firstActionBars: parsed[22] ?? 0,
      riskBehavior: parsed[23] ?? 'FREEZE',
      riskReviewGrade: parsed[24] ?? '',
      feedbackCodes: parsed[25] ?? [],
      tradeActions: parsed[26] ?? [],
      riskReview: parsed[27] ?? null,
      fastReview: parsed[28] ?? null,
    });
  }
  return normalizeSpecialTrainingHistoryQuestionDetailPayload(parsed);
};
