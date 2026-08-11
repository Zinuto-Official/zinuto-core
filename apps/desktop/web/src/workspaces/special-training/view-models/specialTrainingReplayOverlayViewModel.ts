// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import { clamp, formatPercentFixed, toFiniteNumber } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import { resolveFastDecisionChoiceLabel } from "@/workspaces/special-training/domain/specialTrainingDirectionLabels";
import type { FastDecisionResult, SpecialTrainingQuestion } from "@/workspaces/special-training/domain/specialTrainingTypes";

type FastDecisionReplayOverlayContextInput = {
  bars: SpecialTrainingQuestion["bars"];
  startIndex: number;
  revealEndIndex: number;
  directionResult: FastDecisionResult;
  selectionLabel: string;
  buyLabel: string;
  sellLabel: string;
  observeLabel: string;
  mfeLabel: string;
  maeLabel: string;
};

export const buildFastDecisionReplayOverlayContext = (
  input: FastDecisionReplayOverlayContextInput,
): SpecialTrainingReplayOverlayContext => {
  const maxIndex = Math.max(0, input.bars.length - 1);
  const safeStartIndex = clamp(
    Math.floor(toFiniteNumber(input.startIndex) || 0),
    0,
    maxIndex,
  );
  const safeRevealEndIndex = clamp(
    Math.floor(toFiniteNumber(input.revealEndIndex) || safeStartIndex),
    safeStartIndex,
    maxIndex,
  );
  let fastDecisionExtremeRay: SpecialTrainingReplayOverlayContext["fastDecisionExtremeRay"] =
    null;
  if (safeRevealEndIndex > safeStartIndex) {
    const revealBars = input.bars.slice(safeStartIndex + 1, safeRevealEndIndex + 1);
    let revealMaxOpenClose = Number.NEGATIVE_INFINITY;
    let revealMinOpenClose = Number.POSITIVE_INFINITY;
    revealBars.forEach((bar) => {
      const open = toFiniteNumber(bar?.open);
      const close = toFiniteNumber(bar?.close);
      if (Number.isFinite(open) && Number.isFinite(close)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, open, close);
        revealMinOpenClose = Math.min(revealMinOpenClose, open, close);
        return;
      }
      if (Number.isFinite(open)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, open);
        revealMinOpenClose = Math.min(revealMinOpenClose, open);
        return;
      }
      if (Number.isFinite(close)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, close);
        revealMinOpenClose = Math.min(revealMinOpenClose, close);
      }
    });
    if (
      Number.isFinite(revealMaxOpenClose) &&
      Number.isFinite(revealMinOpenClose)
    ) {
      let profitUsesUpperLine = input.directionResult.selection !== "SHORT";
      if (input.directionResult.selection === "OBSERVE") {
        profitUsesUpperLine =
          input.directionResult.longMfeRatio >= input.directionResult.longMaeRatio;
      }
      const profitPrice = profitUsesUpperLine
        ? revealMaxOpenClose
        : revealMinOpenClose;
      const drawdownPrice = profitUsesUpperLine
        ? revealMinOpenClose
        : revealMaxOpenClose;
      const baselinePrice = toFiniteNumber(input.bars[safeStartIndex]?.close);
      const profitRatio = Math.max(
        0,
        toFiniteNumber(input.directionResult.selectedMfeRatio),
      );
      const drawdownRatio = Math.max(
        0,
        toFiniteNumber(input.directionResult.selectedMaeRatio),
      );
      const profitTagText = `${input.mfeLabel} +${formatPercentFixed(profitRatio, 2)}`;
      const drawdownTagText = `${input.maeLabel} -${formatPercentFixed(drawdownRatio, 2)}`;
      if (
        Number.isFinite(profitPrice) &&
        Number.isFinite(drawdownPrice) &&
        Number.isFinite(baselinePrice)
      ) {
        fastDecisionExtremeRay = {
          profitPrice,
          drawdownPrice,
          baselinePrice,
          profitRatio,
          drawdownRatio,
          profitTagText,
          drawdownTagText,
        };
      }
    }
  }

  const decisionMarkerDisplayText = resolveFastDecisionChoiceLabel(
    input.directionResult.selection,
    {
      longLabel: input.buyLabel,
      shortLabel: input.sellLabel,
      observeLabel: input.observeLabel,
    },
  );

  return {
    decisionBoundaryRawIndex: safeStartIndex,
    decisionMarker: {
      selection: input.directionResult.selection,
      label: input.selectionLabel,
      displayText: decisionMarkerDisplayText,
    },
    fastDecisionExtremeRay,
    riskDisciplineGuides: null,
    fastDecisionReview: {
      selection: input.directionResult.selection,
      actual: input.directionResult.actual,
      selectedMfeRatio: Math.max(
        0,
        toFiniteNumber(input.directionResult.selectedMfeRatio),
      ),
      selectedMaeRatio: Math.max(
        0,
        toFiniteNumber(input.directionResult.selectedMaeRatio),
      ),
      correct: Boolean(input.directionResult.correct),
    },
    riskReviewSummary: null,
  };
};
