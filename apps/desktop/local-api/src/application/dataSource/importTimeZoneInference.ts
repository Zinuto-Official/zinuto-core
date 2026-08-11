// SPDX-License-Identifier: GPL-3.0-only

import {
  inferImportTimeZoneRuleEvidence,
  type ImportTimeZoneRuleEvidence
} from '@zinuto/shared/importRules';
import {
  normalizeTimeZone,
  resolveSystemTimeZone,
  type TimeZoneSuggestionReason
} from '@zinuto/shared/timezone';
import type { FreeReplayEnvironmentSuggestion } from './freeReplayEnvironmentSuggestion.js';

export type ImportTimeZoneEvidenceReason = {
  code: string;
  timeZone: string;
  score: number;
};

type InferImportTimeZoneInput = {
  folderName: string;
  folderPath: string;
  files: Array<{
    originalname: string;
    relativePath: string;
    symbol: string;
  }>;
  freeReplayEnvironmentSuggestion?: FreeReplayEnvironmentSuggestion | null;
  existingSourceTimeZone?: string;
  timestampSamples?: string[];
};

export type InferredImportTimeZone = {
  timeZone: string;
  reason: TimeZoneSuggestionReason;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: ImportTimeZoneEvidenceReason[];
};

const HIGH_CONFIDENCE_SCORE = 90;
const HIGH_CONFIDENCE_LEAD = 20;
const MEDIUM_CONFIDENCE_SCORE = 65;
const MEDIUM_CONFIDENCE_LEAD = 12;

const normalizeInferenceTimeZone = (value: string): string => {
  const raw = String(value || '').trim();
  const normalized = normalizeTimeZone(raw);
  return raw === 'Etc/UTC' && normalized === 'UTC' ? 'Etc/UTC' : normalized;
};

const normalizeEvidenceScore = (score: unknown): number =>
  Math.max(0, Math.round(Number(score) || 0));

const aggregateEvidence = (
  evidence: ImportTimeZoneRuleEvidence[]
): ImportTimeZoneEvidenceReason[] => {
  const bestByCodeAndTimeZone = new Map<string, ImportTimeZoneEvidenceReason>();
  evidence.forEach((item) => {
    const timeZone = normalizeInferenceTimeZone(item.timeZone);
    const code = String(item.code || '').trim();
    const score = normalizeEvidenceScore(item.score);
    if (!timeZone || !code || score <= 0) {
      return;
    }
    const key = `${timeZone}\u0000${code}`;
    const existing = bestByCodeAndTimeZone.get(key);
    if (!existing || score > existing.score) {
      bestByCodeAndTimeZone.set(key, { code, timeZone, score });
    }
  });
  return Array.from(bestByCodeAndTimeZone.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.timeZone !== right.timeZone) {
      return left.timeZone.localeCompare(right.timeZone, 'en');
    }
    return left.code.localeCompare(right.code, 'en');
  });
};

const sumScoresByTimeZone = (
  reasons: ImportTimeZoneEvidenceReason[]
): Map<string, number> => {
  const scores = new Map<string, number>();
  reasons.forEach((reason) => {
    scores.set(reason.timeZone, (scores.get(reason.timeZone) ?? 0) + reason.score);
  });
  return scores;
};

const resolveConfidence = (
  topScore: number,
  lead: number,
  secondScore: number
): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (secondScore >= HIGH_CONFIDENCE_SCORE && lead < 40) {
    return 'LOW';
  }
  if (topScore >= HIGH_CONFIDENCE_SCORE && lead >= HIGH_CONFIDENCE_LEAD) {
    return 'HIGH';
  }
  if (topScore >= MEDIUM_CONFIDENCE_SCORE && lead >= MEDIUM_CONFIDENCE_LEAD) {
    return 'MEDIUM';
  }
  return 'LOW';
};

const resolveReason = (
  winningReasons: ImportTimeZoneEvidenceReason[]
): TimeZoneSuggestionReason => {
  const codes = new Set(winningReasons.map((reason) => reason.code));
  if (codes.size === 1 && codes.has('SYSTEM_TIME_ZONE')) {
    return 'SYSTEM_FALLBACK';
  }
  if (codes.size === 1 && codes.has('PRESET_DEFAULT')) {
    return 'PRESET_DEFAULT';
  }
  if (
    codes.has('TIMESTAMP_OFFSET') ||
    codes.has('TIMESTAMP_IANA') ||
    codes.has('SESSION_WINDOW_MATCH')
  ) {
    return 'TIMESTAMP_INFERRED';
  }
  return 'RULE_INFERRED';
};

const hasAuthoritativeWinningReason = (
  reasons: ImportTimeZoneEvidenceReason[]
): boolean =>
  reasons.some((reason) =>
    [
      'MARKET_SYMBOL_STRONG',
      'TIMESTAMP_OFFSET',
      'TIMESTAMP_IANA',
      'SESSION_WINDOW_MATCH',
    ].includes(reason.code)
  );

const hasConflictingStrongSymbolEvidence = (
  ranked: Array<{
    timeZone: string;
    reasons: ImportTimeZoneEvidenceReason[];
  }>,
  winningTimeZone: string
): boolean =>
  ranked.some(
    (candidate) =>
      candidate.timeZone !== winningTimeZone &&
      candidate.reasons.some(
        (reason) =>
          reason.code === 'MARKET_SYMBOL_STRONG' &&
          reason.score >= HIGH_CONFIDENCE_SCORE
      )
  );

export const inferImportTimeZone = (
  input: InferImportTimeZoneInput
): InferredImportTimeZone => {
  const existingSourceTimeZone = String(input.existingSourceTimeZone || '').trim();
  if (existingSourceTimeZone) {
    const timeZone = normalizeInferenceTimeZone(existingSourceTimeZone);
    return {
      timeZone,
      reason: 'EXISTING_SOURCE',
      confidence: 'HIGH',
      reasons: [
        {
          code: 'EXISTING_SOURCE',
          timeZone,
          score: 100
        }
      ]
    };
  }

  const systemTimeZone = normalizeInferenceTimeZone(resolveSystemTimeZone());
  const reasons = aggregateEvidence(
    inferImportTimeZoneRuleEvidence({
      folderName: input.folderName,
      folderPath: input.folderPath,
      files: input.files,
      marketPresetId: input.freeReplayEnvironmentSuggestion?.marketPresetId || '',
      timestampSamples: input.timestampSamples ?? [],
      systemTimeZone
    })
  );
  const scoresByTimeZone = sumScoresByTimeZone(reasons);
  const ranked = Array.from(scoresByTimeZone.entries())
    .map(([timeZone, score]) => ({
      timeZone,
      score,
      reasons: reasons.filter((reason) => reason.timeZone === timeZone)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.timeZone.localeCompare(right.timeZone, 'en');
    });
  const best = ranked[0] ?? {
    timeZone: systemTimeZone,
    score: 20,
    reasons: [{ code: 'SYSTEM_TIME_ZONE', timeZone: systemTimeZone, score: 20 }]
  };
  const secondScore = ranked[1]?.score ?? 0;
  const lead = best.score - secondScore;
  const baseConfidence = resolveConfidence(best.score, lead, secondScore);
  const confidence =
    baseConfidence !== 'LOW' &&
    hasConflictingStrongSymbolEvidence(ranked, best.timeZone) &&
    !hasAuthoritativeWinningReason(best.reasons)
      ? 'LOW'
      : baseConfidence;
  return {
    timeZone: best.timeZone,
    reason: resolveReason(best.reasons),
    confidence,
    reasons: best.reasons
  };
};
