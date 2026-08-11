// SPDX-License-Identifier: GPL-3.0-only

import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import type { Fill, SessionSnapshot } from '@/domains/training/types';

export const TRAINER_RESIDENT_FILLS_MAX = DESKTOP_API_LIMITS.sessionFillsPageMax;

export type TrainerFillEnvelope = {
  fills: Fill[];
  fillsTotal: number;
  nextFillCursor: string | null;
  residentFillsStartIndex: number;
};

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
};

const resolveFillsTotal = (value: unknown, fallback: number): number =>
  toNonNegativeInteger(value, Math.max(0, Math.floor(fallback)));

export const normalizeTrainerFillCursor = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

export const resolveTrainerFillCursor = (
  snapshot?: Pick<SessionSnapshot, 'nextFillCursor'> | null,
): string | null => normalizeTrainerFillCursor(snapshot?.nextFillCursor);

export const resolveTrainerResidentFillsStartIndex = (
  snapshot?: Pick<SessionSnapshot, 'residentFillsStartIndex'> | null,
): number => toNonNegativeInteger(snapshot?.residentFillsStartIndex, 0);

const mergeFillTail = ({
  previousFills,
  incomingFills,
  maxResidentFills,
}: {
  previousFills: Fill[];
  incomingFills: Fill[];
  maxResidentFills: number;
}): {
  fills: Fill[];
  trimmedHeadCount: number;
} => {
  const totalSourceLength = previousFills.length + incomingFills.length;
  const keepCount = Math.min(maxResidentFills, totalSourceLength);
  const trimmedHeadCount = Math.max(0, totalSourceLength - keepCount);
  if (trimmedHeadCount === 0) {
    if (!previousFills.length) {
      return { fills: incomingFills, trimmedHeadCount };
    }
    if (!incomingFills.length) {
      return { fills: previousFills, trimmedHeadCount };
    }
  }

  const fills = new Array<Fill>(keepCount);
  for (let targetIndex = 0; targetIndex < keepCount; targetIndex += 1) {
    const sourceIndex = trimmedHeadCount + targetIndex;
    fills[targetIndex] =
      sourceIndex < previousFills.length
        ? previousFills[sourceIndex]
        : incomingFills[sourceIndex - previousFills.length];
  }
  return { fills, trimmedHeadCount };
};

export const mergeTrainerFillEnvelope = ({
  sessionId,
  previousSnapshot,
  incomingFills,
  incomingFillsTotal,
  incomingNextFillCursor,
  incomingResidentFillsStartIndex,
  appendFromPrevious = false,
  maxResidentFills = TRAINER_RESIDENT_FILLS_MAX,
}: {
  sessionId?: string | null;
  previousSnapshot?: SessionSnapshot | null;
  incomingFills?: Fill[] | null;
  incomingFillsTotal?: number | null;
  incomingNextFillCursor?: string | null;
  incomingResidentFillsStartIndex?: number | null;
  appendFromPrevious?: boolean;
  maxResidentFills?: number;
}): TrainerFillEnvelope => {
  const normalizedSessionId = String(sessionId || '').trim();
  const canAppend =
    Boolean(appendFromPrevious) &&
    Boolean(previousSnapshot) &&
    normalizedSessionId.length > 0 &&
    previousSnapshot?.session.id === normalizedSessionId;
  const previousFills =
    canAppend && Array.isArray(previousSnapshot?.fills)
      ? previousSnapshot.fills
      : [];
  const incoming = Array.isArray(incomingFills) ? incomingFills : [];
  const serverResidentStartIndex = toNonNegativeInteger(
    incomingResidentFillsStartIndex,
    0,
  );
  const residentLimit = Math.max(
    1,
    Math.floor(Number(maxResidentFills) || TRAINER_RESIDENT_FILLS_MAX),
  );
  const previousResidentStartIndex = canAppend
    ? resolveTrainerResidentFillsStartIndex(previousSnapshot)
    : 0;
  const previousResidentEndIndex =
    previousResidentStartIndex + previousFills.length;
  const previousKnownTotal = canAppend
    ? resolveFillsTotal(previousSnapshot?.fillsTotal, previousResidentEndIndex)
    : 0;
  const merged = mergeFillTail({
    previousFills,
    incomingFills: incoming,
    maxResidentFills: residentLimit,
  });
  const residentFillsStartIndex =
    canAppend
      ? previousResidentStartIndex + merged.trimmedHeadCount
      : serverResidentStartIndex + merged.trimmedHeadCount;
  const fallbackTotal = canAppend
    ? Math.max(previousKnownTotal, previousResidentEndIndex + incoming.length)
    : Math.max(incoming.length, residentFillsStartIndex + merged.fills.length);
  const fillsTotal = resolveFillsTotal(incomingFillsTotal, fallbackTotal);
  const nextFillCursor =
    normalizeTrainerFillCursor(incomingNextFillCursor) ??
    (canAppend ? resolveTrainerFillCursor(previousSnapshot) : null);

  return {
    fills: merged.fills,
    fillsTotal,
    nextFillCursor,
    residentFillsStartIndex,
  };
};

export const applyTrainerFillEnvelopeToSnapshot = (
  snapshot: SessionSnapshot,
  {
    previousSnapshot = null,
    appendFromPrevious = false,
  }: {
    previousSnapshot?: SessionSnapshot | null;
    appendFromPrevious?: boolean;
  } = {},
): SessionSnapshot => {
  const envelope = mergeTrainerFillEnvelope({
    sessionId: snapshot.session.id,
    previousSnapshot,
    incomingFills: snapshot.fills,
    incomingFillsTotal: snapshot.fillsTotal,
    incomingNextFillCursor: snapshot.nextFillCursor,
    incomingResidentFillsStartIndex: snapshot.residentFillsStartIndex,
    appendFromPrevious,
  });
  return {
    ...snapshot,
    fills: envelope.fills,
    fillsTotal: envelope.fillsTotal,
    nextFillCursor: envelope.nextFillCursor,
    residentFillsStartIndex: envelope.residentFillsStartIndex,
  };
};
