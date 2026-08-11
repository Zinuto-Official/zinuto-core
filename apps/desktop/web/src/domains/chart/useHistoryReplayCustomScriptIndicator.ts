// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, type RefObject } from "react";
import type { Chart, KLineData } from "klinecharts";
import { api, type ApiCompileCustomIndicatorScriptRequest } from "@/api";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { customIndicatorBackendExecutionClient } from "@/domains/custom-indicator/indicator/backendExecutionClient";
import {
  CUSTOM_SCRIPT_PANE_ID,
  mountCustomScriptIndicator,
  readWorkbenchRuntimeResult,
  rememberWorkbenchRuntimeResult,
  toParameterOverrides,
  toRuntimeBars,
  unmountCustomScriptIndicator,
} from "@/workspaces/custom-indicator/chart/workbenchChartHelpers";

export const HISTORY_REPLAY_CUSTOM_SCRIPT_PANE_ID = CUSTOM_SCRIPT_PANE_ID;

export type HistoryReplayCustomScriptIndicatorInput = {
  source: string;
  parameterInputs: Record<string, string>;
  parameters?: ApiCompileCustomIndicatorScriptRequest["parameters"];
  displayName: string;
};

type UseHistoryReplayCustomScriptIndicatorArgs = {
  chartReadyVersion: number;
  chartRef: RefObject<Chart | null>;
  customScriptIndicator?: HistoryReplayCustomScriptIndicatorInput | null;
  language: UiLanguage;
  replayData: KLineData[];
  onMountedLayout: () => void;
};

export const useHistoryReplayCustomScriptIndicator = ({
  chartReadyVersion,
  chartRef,
  customScriptIndicator,
  language,
  replayData,
  onMountedLayout,
}: UseHistoryReplayCustomScriptIndicatorArgs) => {
  const mountedRef = useRef(false);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const source = String(customScriptIndicator?.source ?? "").trim();
    if (!source || !customScriptIndicator || !replayData.length) {
      if (mountedRef.current) {
        unmountCustomScriptIndicator(chart);
        mountedRef.current = false;
      }
      return;
    }

    let cancelled = false;
    const runtimeBars = toRuntimeBars(replayData);
    const parameterInputs = { ...(customScriptIndicator.parameterInputs ?? {}) };

    void api
      .compileCustomIndicatorScript({
        source,
        parameters: customScriptIndicator.parameters,
        parameterInputs,
        displayName: customScriptIndicator.displayName,
        language,
      })
      .then(async (result) => {
        if (cancelled || !result.state || chartRef.current !== chart) {
          return;
        }
        const parameterOverrides = toParameterOverrides(
          result.state.compiled,
          result.state.calcParams,
        );
        const cachedResult = readWorkbenchRuntimeResult(
          result.state.compiled,
          runtimeBars,
          parameterOverrides,
        );
        const runtimeResult =
          cachedResult ??
          (await customIndicatorBackendExecutionClient.execute(
            result.state.compiled,
            { bars: runtimeBars, parameterOverrides },
            language,
          ));
        if (cancelled || chartRef.current !== chart) {
          return;
        }
        if (!cachedResult) {
          rememberWorkbenchRuntimeResult(
            result.state.compiled,
            runtimeBars,
            parameterOverrides,
            runtimeResult,
          );
        }
        mountCustomScriptIndicator(chart, result.state);
        mountedRef.current = true;
        onMountedLayout();
      })
      .catch(() => {
        if (!cancelled && chartRef.current === chart && mountedRef.current) {
          unmountCustomScriptIndicator(chart);
          mountedRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      if (mountedRef.current) {
        if (chartRef.current === chart) {
          unmountCustomScriptIndicator(chart);
        }
        mountedRef.current = false;
      }
    };
  }, [
    chartReadyVersion,
    chartRef,
    customScriptIndicator,
    language,
    onMountedLayout,
    replayData,
  ]);
};
