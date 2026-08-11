// SPDX-License-Identifier: GPL-3.0-only

import { useTrainerChartLifecycle } from "@/app-shell/useTrainerChartLifecycle";

export type RuntimeTrainerChartLifecycleProps = Parameters<
  typeof useTrainerChartLifecycle
>[0];

export const RuntimeTrainerChartLifecycle = (
  props: RuntimeTrainerChartLifecycleProps,
) => {
  useTrainerChartLifecycle(props);
  return null;
};
