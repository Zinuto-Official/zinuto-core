// SPDX-License-Identifier: GPL-3.0-only

import type {
  CustomIndicatorValidationFacts,
  CustomIndicatorValidationSamplePoolFact,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";

export type CustomIndicatorSamplePoolOption = CustomIndicatorValidationSamplePoolFact;

export const readValidationSamplePoolOptions = (
  facts: CustomIndicatorValidationFacts,
): CustomIndicatorSamplePoolOption[] => facts.samplePools;

export const readValidationSymbolsForPool = (
  facts: CustomIndicatorValidationFacts,
  samplePoolId: string,
): string[] => {
  const normalizedPoolId = String(samplePoolId || "").trim() || facts.allPoolId;
  const pool =
    facts.samplePools.find((item) => item.id === normalizedPoolId) ??
    facts.samplePools.find((item) => item.id === facts.allPoolId) ??
    null;
  return pool?.symbols ?? [];
};
