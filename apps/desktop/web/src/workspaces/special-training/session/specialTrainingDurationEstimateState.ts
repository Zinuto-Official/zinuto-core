// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingDurationEstimateState } from "@/workspaces/special-training/domain/specialTrainingTypes";

export const createEmptyDurationEstimateState =
  (): SpecialTrainingDurationEstimateState => ({
    signature: "",
    estimate: null,
    loading: false,
    error: false,
  });

export const buildPendingDurationEstimateState = (
  current: SpecialTrainingDurationEstimateState,
  signature: string,
): SpecialTrainingDurationEstimateState => ({
  signature,
  estimate: current.estimate,
  loading: true,
  error: false,
});
