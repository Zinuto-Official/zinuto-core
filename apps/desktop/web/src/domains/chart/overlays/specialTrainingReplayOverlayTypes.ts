// SPDX-License-Identifier: GPL-3.0-only

export type SpecialTrainingReplayOverlayContext = {
  decisionBoundaryRawIndex: number;
  decisionMarker: {
    selection: "LONG" | "SHORT" | "OBSERVE";
    label: string;
    displayText: string;
  } | null;
  fastDecisionExtremeRay: {
    profitPrice: number;
    drawdownPrice: number;
    baselinePrice: number;
    profitRatio: number;
    drawdownRatio: number;
    profitTagText: string;
    drawdownTagText: string;
  } | null;
  riskDisciplineGuides: {
    baselinePrice: number | null;
    currentCostPrice: number | null;
    baselineTagText: string;
    currentCostTagText: string;
  } | null;
  fastDecisionReview?: {
    selection: "LONG" | "SHORT" | "OBSERVE";
    actual: "LONG" | "SHORT" | "OBSERVE";
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    correct: boolean;
  } | null;
  riskReviewSummary?: {
    alphaVsHolderRatio: number | null;
    alphaVsHardStopRatio: number | null;
    recoveryRate: number | null;
    grade: string;
    costBasisShiftRatio: number | null;
    finalCostBasis: number | null;
  } | null;
};
