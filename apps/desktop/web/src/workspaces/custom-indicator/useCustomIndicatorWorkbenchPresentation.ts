// SPDX-License-Identifier: GPL-3.0-only

import type { EditorView } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  resolveSourceCursorOffset,
  type ScriptIssueItem,
} from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type {
  IndicatorDefinition,
  IndicatorParameterDefinition,
} from "@/domains/custom-indicator/indicator/types";
import { setActiveCompiledScriptTooltipFeatures } from "@/domains/custom-indicator/indicator/compiledIndicatorRenderState";
import { toMarketTimeKey } from "@zinuto/shared/marketTime";
import {
  createCustomIndicatorTooltipNameFeature,
  CUSTOM_INDICATOR_TOOLTIP_TARGET_ACTIVE_SCRIPT,
} from "@/workspaces/custom-indicator/indicatorTooltipFeature";
import type { CustomIndicatorSystemPageProps } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import type { WorkbenchState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorTypes";
import { buildEditorDerivedState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorDerived";

export const useCustomIndicatorWorkbenchPresentation = ({
  codeEditorViewRef,
  compileIssues,
  defaultDefinition,
  indicatorTooltipFeatureActiveColor,
  indicatorTooltipFeatureBackground,
  indicatorTooltipFeatureColor,
  language,
  parameterDefinitions,
  parameterInputs,
  parameterWarnings,
  profileNameInput,
  runtimeIssues,
  scriptSource,
  state,
  storagePersistError,
  ui,
  workbenchPanelRatio,
}: {
  codeEditorViewRef: MutableRefObject<EditorView | null>;
  compileIssues: ScriptIssueItem[];
  defaultDefinition: IndicatorDefinition;
  indicatorTooltipFeatureActiveColor: string;
  indicatorTooltipFeatureBackground: string;
  indicatorTooltipFeatureColor: string;
  language: CustomIndicatorSystemPageProps["language"];
  parameterDefinitions: IndicatorParameterDefinition[];
  parameterInputs: Record<string, string>;
  parameterWarnings: string[];
  profileNameInput: string;
  runtimeIssues: ScriptIssueItem[];
  scriptSource: string;
  state: WorkbenchState;
  storagePersistError: string;
  ui: CustomIndicatorSystemPageProps["ui"];
  workbenchPanelRatio: number;
}) => {
  const derivedState = useMemo(
    () =>
      buildEditorDerivedState({
        language,
        ui,
        activeIndicatorGroup: state.activeIndicatorGroup,
        activeSavedProfileId: state.activeSavedProfileId,
        activeSavedProfile: state.activeSavedProfile,
        activeSystemTemplateName:
          state.activeSystemTemplate?.definition.name ?? null,
        starterSystemTemplateName:
          state.starterSystemTemplate?.definition.name ?? null,
        activeSystemTemplateSource:
          state.activeSystemTemplate?.definition.source ?? null,
        starterSystemTemplateSource:
          state.starterSystemTemplate?.definition.source ?? null,
        parameterDefinitions,
        parameterInputs,
        defaultDefinitionName: defaultDefinition.name,
        defaultDefinitionSource: defaultDefinition.source,
        defaultDefinitionParameters: defaultDefinition.parameters,
        profileNameInput,
        scriptSource,
        compileIssues,
        runtimeIssues,
        parameterWarnings,
        storagePersistError,
      }),
    [
      compileIssues,
      defaultDefinition,
      language,
      parameterDefinitions,
      parameterInputs,
      parameterWarnings,
      profileNameInput,
      runtimeIssues,
      scriptSource,
      state.activeIndicatorGroup,
      state.activeSavedProfile,
      state.activeSavedProfileId,
      state.activeSystemTemplate,
      state.starterSystemTemplate,
      storagePersistError,
      ui,
    ],
  );
  const activeScriptTooltipFeature = useMemo(
    () =>
      createCustomIndicatorTooltipNameFeature({
        target: CUSTOM_INDICATOR_TOOLTIP_TARGET_ACTIVE_SCRIPT,
        label: derivedState.activeScriptName,
        color: indicatorTooltipFeatureColor,
        activeColor: indicatorTooltipFeatureActiveColor,
        backgroundColor: indicatorTooltipFeatureBackground,
      }),
    [
      derivedState.activeScriptName,
      indicatorTooltipFeatureActiveColor,
      indicatorTooltipFeatureBackground,
      indicatorTooltipFeatureColor,
    ],
  );
  useEffect(() => {
    setActiveCompiledScriptTooltipFeatures([activeScriptTooltipFeature]);
  }, [activeScriptTooltipFeature]);

  const jumpToScriptIssue = useCallback(
    (issue: ScriptIssueItem) => {
      if (!Number.isFinite(issue.line) || !Number.isFinite(issue.column)) {
        return;
      }
      const view = codeEditorViewRef.current;
      if (!view) {
        return;
      }
      const offset = resolveSourceCursorOffset(
        scriptSource,
        Number(issue.line),
        Number(issue.column),
      );
      view.focus();
      view.dispatch({
        selection: {
          anchor: Math.min(Math.max(0, offset), view.state.doc.length),
        },
        scrollIntoView: true,
      });
    },
    [codeEditorViewRef, scriptSource],
  );
  const formatConsoleTime = useCallback(
    (timestamp: number) => toMarketTimeKey(timestamp, true) || "--:--:--",
    [],
  );
  const workbenchPanelStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--custom-indicator-workbench-ratio": String(workbenchPanelRatio),
      }) as CSSProperties,
    [workbenchPanelRatio],
  );

  return {
    ...derivedState,
    activeScriptTooltipFeature,
    formatConsoleTime,
    jumpToScriptIssue,
    workbenchPanelStyle,
  };
};
