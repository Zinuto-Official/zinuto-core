// SPDX-License-Identifier: GPL-3.0-only

import {
  clamp,
  toFiniteNumber,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";

export type FastDecisionRevealFrame = {
  cursorIndex: number;
  progressRatio: number;
  complete: boolean;
};

export const resolveFastDecisionRevealDurationMs = ({
  baseDurationMs,
  fullRevealBarsTotal,
  revealBarsTotal,
}: {
  baseDurationMs: number;
  fullRevealBarsTotal: number;
  revealBarsTotal: number;
}): number => {
  const safeBaseDurationMs = Math.max(
    16,
    Math.round(toFiniteNumber(baseDurationMs) || 0),
  );
  const safeFullRevealBarsTotal = Math.max(
    1,
    Math.floor(toFiniteNumber(fullRevealBarsTotal) || 0),
  );
  const safeRevealBarsTotal = Math.max(
    0,
    Math.floor(toFiniteNumber(revealBarsTotal) || 0),
  );

  return Math.max(
    16,
    Math.round(
      safeBaseDurationMs *
        (safeRevealBarsTotal / safeFullRevealBarsTotal),
    ),
  );
};

export const resolveFastDecisionRevealFrame = ({
  elapsedMs,
  revealDurationMs,
  revealBarsTotal,
  revealStartIndex,
  revealEndIndex,
}: {
  elapsedMs: number;
  revealDurationMs: number;
  revealBarsTotal: number;
  revealStartIndex: number;
  revealEndIndex: number;
}): FastDecisionRevealFrame => {
  const safeRevealStartIndex = Math.floor(toFiniteNumber(revealStartIndex) || 0);
  const safeRevealEndIndex = Math.max(
    safeRevealStartIndex,
    Math.floor(toFiniteNumber(revealEndIndex) || safeRevealStartIndex),
  );
  const safeRevealBarsTotal = Math.max(
    0,
    Math.floor(toFiniteNumber(revealBarsTotal) || 0),
  );
  const safeRevealDurationMs = Math.max(1, toFiniteNumber(revealDurationMs) || 1);
  const progressRatio = clamp(
    Math.max(0, toFiniteNumber(elapsedMs) || 0) / safeRevealDurationMs,
    0,
    1,
  );
  const visibleBars = Math.min(
    safeRevealBarsTotal,
    Math.floor(progressRatio * safeRevealBarsTotal),
  );

  return {
    cursorIndex: clamp(
      safeRevealStartIndex + visibleBars,
      safeRevealStartIndex,
      safeRevealEndIndex,
    ),
    progressRatio,
    complete: progressRatio >= 1,
  };
};
