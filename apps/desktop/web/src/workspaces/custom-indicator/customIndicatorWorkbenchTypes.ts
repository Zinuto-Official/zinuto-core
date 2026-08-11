// SPDX-License-Identifier: GPL-3.0-only

import type {
  CustomIndicatorErrorContext,
  CompiledScriptState,
} from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type {
  CustomIndicatorSystemDefaultTemplate,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";
import type { SavedIndicatorProfile } from "@/domains/custom-indicator/indicator/profileStore";
import type { AppDisplayPeriodKey, AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type { PriceColorMode } from "@/domains/chart/display";

export type CustomIndicatorSystemPageProps = {
  isActive?: boolean;
  language: AppUiLanguage;
  ui: UiLabelEntry;
  priceColorMode: PriceColorMode;
  resolveSamplePoolDisplayName: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
};

export type MarketLoadState = "idle" | "loading" | "ready" | "error";
export type CatalogLoadState = "idle" | "loading" | "ready" | "error";
export type IndicatorGroupKey = "system" | "custom";
export type ManagerGroupKey = "custom" | "system";
export type ConsoleLogLevel = "info" | "success" | "error";
export type CustomIndicatorScriptIssueContext = Extract<
  CustomIndicatorErrorContext,
  "script-run" | "script-save" | "script-apply" | "script-restore"
>;
export type EffectiveSystemIndicatorTemplate =
  CustomIndicatorSystemDefaultTemplate & {
    overrideProfile: SavedIndicatorProfile | null;
  };
export type ConsoleLogEntry = {
  id: string;
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
};

export type ValidationChartIdentity = {
  activeValidationSymbol: string;
  effectiveValidationDisplayPeriod: AppDisplayPeriodKey;
  systemVolumeTemplateId: string;
};

export type ValidationCompiledScriptSelection = {
  activeIndicatorGroup: IndicatorGroupKey;
  activeSystemTemplateId: string;
  effectiveSystemTemplates: EffectiveSystemIndicatorTemplate[];
  loadSystemDefaultTemplate: (
    template: EffectiveSystemIndicatorTemplate,
  ) => Promise<void>;
  expandManagerGroup: (group: ManagerGroupKey) => void;
};

export type ValidationWorkbenchStatus = {
  workbenchStatusTone: "error" | "warning" | "ready";
  workbenchStatusText: string;
  currentIndicatorGroupLabel: string;
  activeScriptName: string;
  diagnosticsSummaryText: string;
  runtimeStatusText: string;
  hasDiagnosticsIssue: boolean;
  hasRunIssue: boolean;
};

export type ValidationCompiledScriptRuntime = {
  compiledScriptState: CompiledScriptState | null;
  mountedCustomScriptStateKey: string;
};
