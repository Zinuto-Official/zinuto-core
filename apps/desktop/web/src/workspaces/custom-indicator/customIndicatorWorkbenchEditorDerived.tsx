// SPDX-License-Identifier: GPL-3.0-only

import { formatMessage } from "@zinuto/shared/i18n";
import type { IndicatorParameterDefinition } from "@/domains/custom-indicator/indicator/types";
import { buildParameterInputMap, type ScriptIssueItem } from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/primitives/tooltip";
import type { SavedIndicatorProfile } from "@/domains/custom-indicator/indicator/profileStore";
import type { IndicatorGroupKey } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import { parameterInputMapsEqual } from "@/workspaces/custom-indicator/chart/workbenchChartHelpers";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type { AppUiLanguage } from "@/ui/config/uiConfig";

type BuildEditorDerivedStateArgs = {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  activeIndicatorGroup: IndicatorGroupKey;
  activeSavedProfileId: string | null;
  activeSavedProfile: SavedIndicatorProfile | null;
  activeSystemTemplateName: string | null;
  starterSystemTemplateName: string | null;
  activeSystemTemplateSource: string | null;
  starterSystemTemplateSource: string | null;
  parameterDefinitions: IndicatorParameterDefinition[];
  parameterInputs: Record<string, string>;
  defaultDefinitionName: string;
  defaultDefinitionSource: string;
  defaultDefinitionParameters: IndicatorParameterDefinition[];
  profileNameInput: string;
  scriptSource: string;
  compileIssues: ScriptIssueItem[];
  runtimeIssues: ScriptIssueItem[];
  parameterWarnings: string[];
  storagePersistError: string;
};

export const buildEditorDerivedState = ({
  language,
  ui,
  activeIndicatorGroup,
  activeSavedProfileId,
  activeSavedProfile,
  activeSystemTemplateName,
  starterSystemTemplateName,
  activeSystemTemplateSource,
  starterSystemTemplateSource,
  parameterDefinitions,
  parameterInputs,
  defaultDefinitionName,
  defaultDefinitionSource,
  defaultDefinitionParameters,
  profileNameInput,
  scriptSource,
  compileIssues,
  runtimeIssues,
  parameterWarnings,
  storagePersistError,
}: BuildEditorDerivedStateArgs) => {
  const parameterCards = parameterDefinitions.map((parameter) => {
    const min = Number.isFinite(parameter.min) ? String(parameter.min) : null;
    const max = Number.isFinite(parameter.max) ? String(parameter.max) : null;
    return {
      parameter,
      rangeText: min && max ? `${min} - ${max}` : min || max || "",
    };
  });
  const baselineParameterInputs =
    activeIndicatorGroup === "custom" && activeSavedProfile
      ? buildParameterInputMap(
          parameterDefinitions,
          activeSavedProfile.parameterInputs ?? {},
        )
      : buildParameterInputMap(
          parameterDefinitions,
          buildParameterInputMap(defaultDefinitionParameters),
        );
  const baselineSource =
    activeIndicatorGroup === "custom" && activeSavedProfile
      ? activeSavedProfile.source.trim()
      : activeSystemTemplateSource?.trim() ??
        starterSystemTemplateSource?.trim() ??
        defaultDefinitionSource.trim();
  const baselineDisplayName =
    activeIndicatorGroup === "custom" && activeSavedProfile
      ? activeSavedProfile.name
      : activeSystemTemplateName ??
        starterSystemTemplateName ??
        defaultDefinitionName;
  const hasPendingParameters = !parameterInputMapsEqual(
    parameterDefinitions,
    parameterInputs,
    baselineParameterInputs,
  );
  const isSaveRecommended =
    activeIndicatorGroup === "system"
      ? hasPendingParameters
      : (!activeSavedProfileId &&
          (scriptSource.trim().length > 0 || profileNameInput.trim().length > 0)) ||
        profileNameInput.trim() !== baselineDisplayName.trim() ||
        scriptSource.trim() !== baselineSource.trim() ||
        hasPendingParameters;
  const hasRunIssue = compileIssues.length > 0 || runtimeIssues.length > 0;
  const hasDiagnosticsIssue =
    hasRunIssue || parameterWarnings.length > 0 || Boolean(storagePersistError);
  const latestDiagnosticsIssueMessage =
    compileIssues[0]?.message ||
    runtimeIssues[0]?.message ||
    storagePersistError ||
    parameterWarnings[0] ||
    "";
  const workbenchStatusTone = hasRunIssue
    ? "error"
    : isSaveRecommended
      ? "warning"
      : "ready";
  const workbenchStatusText = hasRunIssue
    ? ui.customIndicatorRuntimeFail
    : isSaveRecommended
      ? ui.customIndicatorDirtyState
      : ui.customIndicatorRuntimePass;
  const currentIndicatorGroupLabel =
    activeIndicatorGroup === "custom"
      ? ui.indicatorGroupCustom
      : ui.indicatorGroupSystemDefault;
  const activeScriptName =
    activeIndicatorGroup === "system"
      ? activeSystemTemplateName ??
        starterSystemTemplateName ??
        ui.customIndicatorName
      : profileNameInput.trim() ||
        activeSavedProfile?.name ||
        ui.customIndicatorName;
  const diagnosticsSummaryText = latestDiagnosticsIssueMessage
    ? `${ui.customIndicatorDiagnosticsSummaryIssue} ${formatMessage(language, "common.symbol.middleDot")} ${latestDiagnosticsIssueMessage}`
    : ui.customIndicatorDiagnosticsSummaryClean;
  return {
    parameterCards,
    isSaveRecommended,
    hasRunIssue,
    hasDiagnosticsIssue,
    workbenchStatusTone,
    workbenchStatusText,
    currentIndicatorGroupLabel,
    activeScriptName,
    diagnosticsSummaryText,
  };
};

export const wrapLockedLabelWithTooltip = (
  content: React.ReactNode,
  locked: boolean,
  lockReason?: string | null,
) => {
  const resolvedLockReason = String(lockReason || "").trim();
  if (!locked || !resolvedLockReason) {
    return content;
  }
  return (
    <Tooltip delay={0}>
      <TooltipTrigger asChild>
        <span className="custom-indicator-locked-tooltip-trigger">
          {content}
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6} className="max-w-64 leading-relaxed">
        {resolvedLockReason}
      </TooltipContent>
    </Tooltip>
  );
};
