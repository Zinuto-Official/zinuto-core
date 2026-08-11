// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { BaseTimeframe, DisplayPeriodKey } from '@/domains/trainer/trainerTypes';

type UseTrainerPeriodOptionsControllerParams = {
  selectedSymbol: string;
  snapshotSessionSymbol?: string;
  currentTrainingBaseTimeframe: BaseTimeframe;
  activeSamplePoolBaseTimeframe: BaseTimeframe;
  trainerDisplayPeriod: DisplayPeriodKey;
  shouldClampDisplayPeriod?: boolean;
  defaultTrainerDisplayPeriodByBase: Record<BaseTimeframe, DisplayPeriodKey>;
  defaultTrainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
  setTrainerDisplayPeriod: Dispatch<SetStateAction<DisplayPeriodKey>>;
};

type ResolveTrainerDisplayPeriodClampTargetParams = {
  shouldClampDisplayPeriod: boolean;
  trainerBaseTimeframe: BaseTimeframe;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptions: readonly DisplayPeriodKey[];
  defaultTrainerDisplayPeriodByBase: Record<BaseTimeframe, DisplayPeriodKey>;
};

export const resolveTrainerDisplayPeriodClampTarget = ({
  shouldClampDisplayPeriod,
  trainerBaseTimeframe,
  trainerDisplayPeriod,
  trainerPeriodOptions,
  defaultTrainerDisplayPeriodByBase,
}: ResolveTrainerDisplayPeriodClampTargetParams): DisplayPeriodKey | null => {
  if (!shouldClampDisplayPeriod) {
    return null;
  }
  if (trainerPeriodOptions.includes(trainerDisplayPeriod)) {
    return null;
  }
  return defaultTrainerDisplayPeriodByBase[trainerBaseTimeframe];
};

export const useTrainerPeriodOptionsController = ({
  selectedSymbol,
  snapshotSessionSymbol,
  currentTrainingBaseTimeframe,
  activeSamplePoolBaseTimeframe,
  trainerDisplayPeriod,
  shouldClampDisplayPeriod = true,
  defaultTrainerDisplayPeriodByBase,
  defaultTrainerPeriodOptionsByBase,
  setTrainerDisplayPeriod
}: UseTrainerPeriodOptionsControllerParams) => {
  const trainerBaseTimeframe = useMemo<BaseTimeframe>(() => {
    const hasLoadedSymbol = Boolean((selectedSymbol || snapshotSessionSymbol || '').trim());
    if (hasLoadedSymbol) {
      return currentTrainingBaseTimeframe;
    }
    return activeSamplePoolBaseTimeframe;
  }, [activeSamplePoolBaseTimeframe, currentTrainingBaseTimeframe, selectedSymbol, snapshotSessionSymbol]);

  const trainerPeriodOptions = useMemo<DisplayPeriodKey[]>(
    () => [...defaultTrainerPeriodOptionsByBase[trainerBaseTimeframe]],
    [defaultTrainerPeriodOptionsByBase, trainerBaseTimeframe]
  );

  useEffect(() => {
    const clampTarget = resolveTrainerDisplayPeriodClampTarget({
      shouldClampDisplayPeriod,
      trainerBaseTimeframe,
      trainerDisplayPeriod,
      trainerPeriodOptions,
      defaultTrainerDisplayPeriodByBase,
    });
    if (!clampTarget) {
      return;
    }
    setTrainerDisplayPeriod(clampTarget);
  }, [
    defaultTrainerDisplayPeriodByBase,
    setTrainerDisplayPeriod,
    shouldClampDisplayPeriod,
    trainerBaseTimeframe,
    trainerDisplayPeriod,
    trainerPeriodOptions
  ]);

  return {
    trainerBaseTimeframe,
    trainerPeriodOptions
  };
};
