// SPDX-License-Identifier: GPL-3.0-only

import type {
  SpecialTrainingLaunchRequest,
  SpecialTrainingResumableSessionModeId,
} from "@/domains/special-training/specialTrainingContracts";

export const resolveSpecialTrainingLaunchRequest = ({
  requestedModeId,
  previousRequestId,
}: {
  requestedModeId: SpecialTrainingResumableSessionModeId;
  previousRequestId: number | null;
}): SpecialTrainingLaunchRequest => ({
  requestId: Math.max(0, Math.floor(Number(previousRequestId) || 0)) + 1,
  modeId: requestedModeId,
});
