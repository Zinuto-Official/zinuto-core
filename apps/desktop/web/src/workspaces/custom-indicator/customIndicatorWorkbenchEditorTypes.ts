// SPDX-License-Identifier: GPL-3.0-only

import type { Chart } from "klinecharts";
import type { MutableRefObject } from "react";
import type { IndicatorDefinition } from "@/domains/custom-indicator/indicator/types";
import { parseSystemDefaultIndicatorOverrideTemplateId } from "@/domains/custom-indicator/indicator/profileStore";
import { resolveSavedIndicatorProfileDisplayName } from "@/domains/custom-indicator/indicator/profileDisplayName";
import type { CustomIndicatorSystemPageProps } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import { useCustomIndicatorWorkbenchState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchState";

export type WorkbenchState = ReturnType<
  typeof useCustomIndicatorWorkbenchState
>;

export type CustomIndicatorWorkbenchEditorStateArgs = Pick<
  CustomIndicatorSystemPageProps,
  "isActive" | "language" | "ui"
> & {
  resolvedMode: "light" | "dark";
  defaultDefinition: IndicatorDefinition;
  activeValidationSymbol: string;
  marketRunContextKey: string;
  indicatorTooltipFeatureColor: string;
  indicatorTooltipFeatureActiveColor: string;
  indicatorTooltipFeatureBackground: string;
  chartDataRef: MutableRefObject<any[]>;
  chartRef: MutableRefObject<Chart | null>;
  chartContainerRef: MutableRefObject<HTMLDivElement | null>;
  requestValidationChartLayoutRef: MutableRefObject<
    (preserveCurrentRatio?: boolean) => void
  >;
  mountedCustomScriptStateKeyRef: MutableRefObject<string>;
  state: WorkbenchState;
};

export type ScriptRunFeedback = {
  state: "idle" | "running" | "success" | "empty" | "error";
  message: string;
};

export const resolveSavedProfileDisplayName = (profile: {
  id: string;
  name: string;
  source: string;
}) =>
  resolveSavedIndicatorProfileDisplayName({
    profileId: profile.id,
    name: profile.name,
    source: profile.source,
    overrideTemplateId: parseSystemDefaultIndicatorOverrideTemplateId(
      profile.id,
    ),
  });
