// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { ApiSpecialTrainingRiskRuntimeMetrics } from "@/api";

type SpecialTrainingPageContent = ReturnType<
  typeof import("@/ui/config/uiConfig").getSpecialTrainingPageContent
>;

type RiskGravityFieldModelContent = Pick<
  SpecialTrainingPageContent,
  "riskDisciplineGravityCurrentPriceLabel" | "riskDisciplineGravitySurfaceLabel"
>;

export type RiskGravityFieldModel = {
  breakevenPrice: number | null;
  referencePrice: number | null;
  breakevenMoveRatio: number | null;
  underwater: boolean;
  gapStart: number | null;
  gapWidth: number;
  markers: Array<{
    id: "surface" | "current";
    label: string;
    value: number | null;
    position: number | null;
    tone: "surface" | "danger" | "positive";
  }>;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

type UseSpecialTrainingRiskDisciplineCoreViewModelInput = {
  content: RiskGravityFieldModelContent;
  riskMetrics: ApiSpecialTrainingRiskRuntimeMetrics | null;
};

export const useSpecialTrainingRiskDisciplineCoreViewModel = ({
  content,
  riskMetrics,
}: UseSpecialTrainingRiskDisciplineCoreViewModelInput) => {
  const riskCostPriceNow = riskMetrics?.costPriceNow ?? null;
  const riskHolderReference = riskMetrics?.holderReference ?? null;
  const riskBaselineCostPrice = riskMetrics?.baselineCostPrice ?? null;
  const riskRemainingActionableBars =
    riskMetrics?.survivalProgress?.remainingActionableBars ?? 0;
  const riskRemainingActionableRatio =
    riskMetrics?.survivalProgress?.remainingActionableRatio ?? 0;

  const riskGravityFieldModel = useMemo((): RiskGravityFieldModel | null => {
    const gravityFact = riskMetrics?.gravityField;
    if (!gravityFact) {
      return null;
    }
    const { breakevenPrice, referencePrice, breakevenMoveRatio, underwater, gapWidth } =
      gravityFact;
    const values = [breakevenPrice, referencePrice].filter(
      (value): value is number => value !== null,
    );
    if (!values.length) {
      return null;
    }
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = Math.max(
      (maxValue - minValue) * 0.34,
      maxValue * 0.05,
      0.01,
    );
    const domainMin = minValue - padding;
    const domainMax = maxValue + padding;
    const domainSpan = Math.max(0.0001, domainMax - domainMin);
    const toPosition = (value: number | null): number | null =>
      value === null
        ? null
        : clamp(((value - domainMin) / domainSpan) * 100, 0, 100);
    const breakevenPosition = toPosition(breakevenPrice);
    const currentPosition = toPosition(referencePrice);
    const gapStart =
      breakevenPosition === null || currentPosition === null
        ? null
        : Math.min(breakevenPosition, currentPosition);

    return {
      breakevenPrice,
      referencePrice,
      breakevenMoveRatio,
      underwater,
      gapStart,
      gapWidth,
      markers: [
        {
          id: "surface",
          label: content.riskDisciplineGravitySurfaceLabel,
          value: breakevenPrice,
          position: breakevenPosition,
          tone: "surface",
        },
        {
          id: "current",
          label: content.riskDisciplineGravityCurrentPriceLabel,
          value: referencePrice,
          position: currentPosition,
          tone: underwater ? "danger" : "positive",
        },
      ],
    };
  }, [
    content.riskDisciplineGravityCurrentPriceLabel,
    content.riskDisciplineGravitySurfaceLabel,
    riskMetrics?.gravityField,
  ]);

  return {
    riskCostPriceNow,
    riskHolderReference,
    riskBaselineCostPrice,
    riskRemainingActionableBars,
    riskRemainingActionableRatio,
    riskGravityFieldModel,
  };
};
