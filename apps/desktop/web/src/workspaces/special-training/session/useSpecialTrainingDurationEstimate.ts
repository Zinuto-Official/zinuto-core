// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from "react";
import {
  api,
  type ApiSpecialTrainingDurationEstimateResponse,
} from "@/api";
import type {
  SpecialTrainingDurationEstimateState,
  SpecialTrainingView,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  buildPendingDurationEstimateState,
  createEmptyDurationEstimateState,
} from "@/workspaces/special-training/session/specialTrainingDurationEstimateState";

type DurationEstimatePayload = Parameters<
  typeof api.estimateSpecialTrainingDuration
>[0];

type UseSpecialTrainingDurationEstimateParams = {
  view: SpecialTrainingView;
  activeModeId: string | null;
  activeDurationEstimatePayload: DurationEstimatePayload | null;
  activeDurationEstimateSignature: string;
};

type UseSpecialTrainingDurationEstimateResult = {
  durationEstimateState: SpecialTrainingDurationEstimateState;
};

export const useSpecialTrainingDurationEstimate = ({
  view,
  activeModeId,
  activeDurationEstimatePayload,
  activeDurationEstimateSignature,
}: UseSpecialTrainingDurationEstimateParams): UseSpecialTrainingDurationEstimateResult => {
  const [durationEstimateState, setDurationEstimateState] =
    useState<SpecialTrainingDurationEstimateState>(createEmptyDurationEstimateState);
  const durationEstimateCacheRef = useRef<
    Record<string, ApiSpecialTrainingDurationEstimateResponse>
  >({});
  const durationEstimateRequestVersionRef = useRef(0);

  useEffect(() => {
    if (
      view !== "MODE_PICKER" ||
      !activeModeId ||
      !activeDurationEstimatePayload ||
      !activeDurationEstimateSignature
    ) {
      return;
    }

    const cachedEstimate =
      durationEstimateCacheRef.current[activeDurationEstimateSignature] ?? null;
    if (cachedEstimate) {
      setDurationEstimateState((current) =>
        current.signature === activeDurationEstimateSignature &&
        current.estimate === cachedEstimate &&
        !current.loading &&
        !current.error
          ? current
          : {
              signature: activeDurationEstimateSignature,
              estimate: cachedEstimate,
              loading: false,
              error: false,
            },
      );
      return;
    }

    const requestVersion = durationEstimateRequestVersionRef.current + 1;
    durationEstimateRequestVersionRef.current = requestVersion;
    setDurationEstimateState((current) =>
      buildPendingDurationEstimateState(
        current,
        activeDurationEstimateSignature,
      ),
    );

    let cancelled = false;
    void api
      .estimateSpecialTrainingDuration(activeDurationEstimatePayload)
      .then((estimate) => {
        if (
          cancelled ||
          durationEstimateRequestVersionRef.current !== requestVersion
        ) {
          return;
        }
        durationEstimateCacheRef.current[activeDurationEstimateSignature] =
          estimate;
        setDurationEstimateState({
          signature: activeDurationEstimateSignature,
          estimate,
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (
          cancelled ||
          durationEstimateRequestVersionRef.current !== requestVersion
        ) {
          return;
        }
        setDurationEstimateState({
          signature: activeDurationEstimateSignature,
          estimate: null,
          loading: false,
          error: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeDurationEstimatePayload,
    activeDurationEstimateSignature,
    activeModeId,
    view,
  ]);

  return {
    durationEstimateState,
  };
};
