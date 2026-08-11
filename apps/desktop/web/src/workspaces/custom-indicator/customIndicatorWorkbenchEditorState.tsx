// SPDX-License-Identifier: GPL-3.0-only

import { api } from "@/api";
import { clearActiveCompiledScriptTooltipFeatures } from "@/domains/custom-indicator/indicator/compiledIndicatorRenderState";
import {
  customIndicatorBackendExecutionClient,
  CustomIndicatorBackendExecutionClientError,
} from "@/domains/custom-indicator/indicator/backendExecutionClient";
import {
  buildParameterInputMap,
  formatCompileErrorMessage,
  formatRuntimeErrorMessage,
  issueArraysEqual,
  normalizeParameterDefinitions,
  resolveCustomIndicatorProductMessage,
  type CompiledScriptState,
  type CompileStateResult,
  type ScriptIssueItem,
} from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type { IndicatorParameterDefinition } from "@/domains/custom-indicator/indicator/types";
import {
  hasSavedIndicatorProfilesHydrated,
  hydrateSavedIndicatorProfilesFromDatabase,
  parseSystemDefaultIndicatorOverrideTemplateId,
  removeSavedIndicatorProfile,
  saveSavedIndicatorProfile,
} from "@/domains/custom-indicator/indicator/profileStore";
import { useCustomIndicatorCodeEditorRuntime } from "@/workspaces/custom-indicator/editor/useCustomIndicatorCodeEditorRuntime";
import {
  DEFAULT_WORKBENCH_PANEL_RATIO,
  buildCompiledScriptMountKey,
  hashString,
  mountCustomScriptIndicator,
  readWorkbenchRuntimeResult,
  rememberWorkbenchRuntimeResult,
  toParameterOverrides,
  toRuntimeBars,
} from "@/workspaces/custom-indicator/chart/workbenchChartHelpers";
import type { CustomIndicatorScriptIssueContext } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import { useArmedAction } from "@/ui/hooks/useArmedAction";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPaneLayout } from "@/workspaces/custom-indicator/chart/workbenchChartHelpers";
import { wrapLockedLabelWithTooltip } from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorDerived";
import {
  resolveSavedProfileDisplayName,
  type CustomIndicatorWorkbenchEditorStateArgs,
  type ScriptRunFeedback,
  type WorkbenchState,
} from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorTypes";
import { useCustomIndicatorWorkbenchFeedback } from "@/workspaces/custom-indicator/useCustomIndicatorWorkbenchFeedback";
import { useCustomIndicatorWorkbenchPresentation } from "@/workspaces/custom-indicator/useCustomIndicatorWorkbenchPresentation";
import { useCustomIndicatorWorkbenchShortcuts } from "@/workspaces/custom-indicator/useCustomIndicatorWorkbenchShortcuts";

export const useCustomIndicatorWorkbenchEditorState = ({
  isActive = true,
  language,
  ui,
  resolvedMode,
  defaultDefinition,
  activeValidationSymbol,
  marketRunContextKey,
  indicatorTooltipFeatureColor,
  indicatorTooltipFeatureActiveColor,
  indicatorTooltipFeatureBackground,
  chartDataRef,
  chartRef,
  chartContainerRef,
  requestValidationChartLayoutRef,
  mountedCustomScriptStateKeyRef,
  state,
}: CustomIndicatorWorkbenchEditorStateArgs) => {
  const compileRequestRef = useRef(0);
  const workbenchDraftVersionRef = useRef(0);
  const selectionRevisionRef = useRef(0);
  const runtimeValidationRequestRef = useRef(0);
  const scriptRunInFlightRef = useRef(false);
  const scriptRunFeedbackContextRef = useRef(0);
  const hasAppliedInitialSystemTemplateRef = useRef(false);
  const hasUserSelectedIndicatorRef = useRef(false);
  const consoleOutputRef = useRef<HTMLDivElement | null>(null);
  const [scriptSource, setScriptSource] = useState(defaultDefinition.source);
  const [parameterDefinitions, setParameterDefinitions] = useState<
    IndicatorParameterDefinition[]
  >(() => normalizeParameterDefinitions(defaultDefinition.parameters));
  const [parameterInputs, setParameterInputs] = useState<
    Record<string, string>
  >(() => buildParameterInputMap(defaultDefinition.parameters));
  const [compiledScriptState, setCompiledScriptState] =
    useState<CompiledScriptState | null>(null);
  const [compileIssues, setCompileIssues] = useState<ScriptIssueItem[]>([]);
  const [parameterWarnings, setParameterWarnings] = useState<string[]>([]);
  const [runtimeIssues, setRuntimeIssues] = useState<ScriptIssueItem[]>([]);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileNameEditMode, setProfileNameEditMode] = useState(false);
  const [workbenchPanelRatio, setWorkbenchPanelRatio] = useState(
    DEFAULT_WORKBENCH_PANEL_RATIO,
  );
  const [isWorkbenchResizing, setIsWorkbenchResizing] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isDiagnosticsDrawerOpen, setIsDiagnosticsDrawerOpen] = useState(false);
  const [scriptRunFeedback, setScriptRunFeedback] = useState<ScriptRunFeedback>(
    { state: "idle", message: "" },
  );
  const {
    appendConsoleLog,
    clearStoragePersistFailure,
    consoleLogs,
    setStoragePersistFailure,
    storagePersistError,
  } = useCustomIndicatorWorkbenchFeedback();
  const parameterDefinitionSignature = useMemo(
    () => JSON.stringify(parameterDefinitions),
    [parameterDefinitions],
  );
  const parameterInputSignature = useMemo(
    () =>
      JSON.stringify(
        Object.entries(parameterInputs).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    [parameterInputs],
  );
  const [savedProfilesReady, setSavedProfilesReady] = useState<boolean>(() =>
    hasSavedIndicatorProfilesHydrated(),
  );
  const {
    buildBlurClearHandler,
    clearArmedAction,
    isActionArmed,
    setArmedKey,
  } = useArmedAction<string>();
  const isSystemIndicatorReadonly = state.activeIndicatorGroup === "system";

  useEffect(() => {
    scriptRunFeedbackContextRef.current += 1;
    setScriptRunFeedback((current) =>
      current.state === "idle" ? current : { state: "idle", message: "" },
    );
  }, [
    marketRunContextKey,
    parameterDefinitionSignature,
    parameterInputSignature,
    scriptSource,
  ]);

  const { codeEditorHostRef, codeEditorViewRef } =
    useCustomIndicatorCodeEditorRuntime({
      scriptSource,
      isReadOnly: isSystemIndicatorReadonly,
      resolvedMode,
      onSourceChange: (nextSource) => {
        if (nextSource.length > INPUT_LIMITS.formulaSourceChars) {
          return;
        }
        hasUserSelectedIndicatorRef.current = true;
        workbenchDraftVersionRef.current += 1;
        setScriptSource(nextSource);
      },
    });
  const updateProfileNameInput = useCallback((nextValue: string) => {
    hasUserSelectedIndicatorRef.current = true;
    workbenchDraftVersionRef.current += 1;
    setProfileNameInput(nextValue);
  }, []);

  const markSelectionChange = useCallback(
    (options?: { userInitiated?: boolean }) => {
      selectionRevisionRef.current += 1;
      workbenchDraftVersionRef.current += 1;
      if (options?.userInitiated !== false) {
        hasUserSelectedIndicatorRef.current = true;
      }
      return selectionRevisionRef.current;
    },
    [],
  );
  const readRuntimeDataList = useCallback(() => {
    const chartDataList = chartRef.current?.getDataList?.();
    return chartDataList?.length ? chartDataList : chartDataRef.current;
  }, [chartDataRef, chartRef]);
  const primeWorkbenchRuntimeResult = useCallback(
    async (scriptState: CompiledScriptState) => {
      const bars = readRuntimeDataList();
      if (!bars.length) {
        return;
      }
      const runtimeBars = toRuntimeBars(bars);
      const parameterOverrides = toParameterOverrides(
        scriptState.compiled,
        scriptState.calcParams,
      );
      if (
        readWorkbenchRuntimeResult(
          scriptState.compiled,
          runtimeBars,
          parameterOverrides,
        )
      ) {
        return;
      }
      const execResult = await customIndicatorBackendExecutionClient.execute(
        scriptState.compiled,
        { bars: runtimeBars, parameterOverrides },
        language,
      );
      rememberWorkbenchRuntimeResult(
        scriptState.compiled,
        runtimeBars,
        parameterOverrides,
        execResult,
      );
    },
    [language, readRuntimeDataList],
  );
  const compileAndApplyScript = useCallback(
    async (
      source: string,
      definitions: IndicatorParameterDefinition[],
      inputs: Record<string, string>,
      displayName: string,
    ): Promise<CompileStateResult> => {
      const requestId = compileRequestRef.current + 1;
      compileRequestRef.current = requestId;
      const requestDraftVersion = workbenchDraftVersionRef.current;
      const requestSelectionRevision = selectionRevisionRef.current;
      const result = await api
        .compileCustomIndicatorScript({
          source,
          parameters: definitions,
          parameterInputs: inputs,
          invalidParamLabel: ui.customIndicatorInvalidParam,
          displayName,
          language,
        })
        .catch((error): CompileStateResult => ({
          state: null,
          compileErrors: [
            {
              stage: "validate",
              code: "COMPILE_REQUEST_FAILED",
              message: resolveCustomIndicatorProductMessage(error, {
                context: "script-run",
                fallback: ui.customIndicatorCompileFail,
              }),
            },
          ],
          compileMessages: [],
          parameterWarnings: [],
          nextParameterDefinitions: definitions,
          nextParameterInputs: inputs,
        }));
      if (
        compileRequestRef.current !== requestId ||
        workbenchDraftVersionRef.current !== requestDraftVersion ||
        selectionRevisionRef.current !== requestSelectionRevision
      ) {
        return { ...result, state: null, stale: true };
      }
      setParameterDefinitions(result.nextParameterDefinitions);
      setParameterInputs(result.nextParameterInputs);
      setCompileIssues(
        result.compileErrors.map((error) =>
          formatCompileErrorMessage(error, source, language),
        ),
      );
      setParameterWarnings(result.parameterWarnings);
      if (result.state) {
        try {
          await primeWorkbenchRuntimeResult(result.state);
        } catch {
          // Best-effort.
        }
      }
      if (
        compileRequestRef.current !== requestId ||
        workbenchDraftVersionRef.current !== requestDraftVersion ||
        selectionRevisionRef.current !== requestSelectionRevision
      ) {
        return { ...result, state: null, stale: true };
      }
      setCompiledScriptState(result.state);
      return result;
    },
    [
      language,
      primeWorkbenchRuntimeResult,
      ui.customIndicatorCompileFail,
      ui.customIndicatorInvalidParam,
    ],
  );
  const runScriptRuntimeCheck = useCallback(
    async (
      nextState: CompiledScriptState,
      context: CustomIndicatorScriptIssueContext = "script-run",
    ) => {
      const bars = readRuntimeDataList();
      if (!bars.length) {
        setRuntimeIssues([]);
        return [];
      }
      const requestId = runtimeValidationRequestRef.current + 1;
      runtimeValidationRequestRef.current = requestId;
      const requestSelectionRevision = selectionRevisionRef.current;
      try {
        const runtimeBars = toRuntimeBars(bars);
        const parameterOverrides = toParameterOverrides(
          nextState.compiled,
          nextState.calcParams,
        );
        const cachedResult = readWorkbenchRuntimeResult(
          nextState.compiled,
          runtimeBars,
          parameterOverrides,
        );
        const result =
          cachedResult ??
          (await customIndicatorBackendExecutionClient.execute(
            nextState.compiled,
            { bars: runtimeBars, parameterOverrides },
            language,
          ));
        if (
          runtimeValidationRequestRef.current !== requestId ||
          selectionRevisionRef.current !== requestSelectionRevision
        ) {
          return [];
        }
        if (!cachedResult) {
          rememberWorkbenchRuntimeResult(
            nextState.compiled,
            runtimeBars,
            parameterOverrides,
            result,
          );
        }
        const nextIssues = result.ok
          ? []
          : result.errors.map((error) =>
              formatRuntimeErrorMessage(
                error,
                nextState.compiled.definition.source,
              ),
            );
        setRuntimeIssues((current) =>
          issueArraysEqual(current, nextIssues) ? current : nextIssues,
        );
        return nextIssues;
      } catch (error) {
        if (
          runtimeValidationRequestRef.current !== requestId ||
          selectionRevisionRef.current !== requestSelectionRevision
        ) {
          return [];
        }
        const message = resolveCustomIndicatorProductMessage(error, {
          context,
          fallback: ui.customIndicatorRuntimeFail,
        });
        const nextIssues = [
          {
            id:
              error instanceof CustomIndicatorBackendExecutionClientError
                ? `backend:${error.code}`
                : "runtime:unknown",
            message,
          },
        ];
        setRuntimeIssues(nextIssues);
        return nextIssues;
      }
    },
    [language, readRuntimeDataList, ui.customIndicatorRuntimeFail],
  );

  useEffect(() => {
    if (savedProfilesReady) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const profiles = await hydrateSavedIndicatorProfilesFromDatabase();
        if (!cancelled) {
          state.setSavedProfiles(profiles);
          clearStoragePersistFailure();
        }
      } catch (error) {
        if (!cancelled) {
          setStoragePersistFailure(
            error,
            "profile-read",
            resolveCustomIndicatorProductMessage(
              { code: "PROFILE_STORAGE_READ_FAILED" },
              { context: "profile-read" },
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setSavedProfilesReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    clearStoragePersistFailure,
    savedProfilesReady,
    setStoragePersistFailure,
    state,
  ]);

  useEffect(
    () => () => {
      customIndicatorBackendExecutionClient.dispose();
      clearActiveCompiledScriptTooltipFeatures();
    },
    [],
  );

  useEffect(() => {
    const output = consoleOutputRef.current;
    if (output) {
      output.scrollTop = output.scrollHeight;
      output.scrollLeft = 0;
    }
  }, [compileIssues, consoleLogs, runtimeIssues]);

  const runScriptRuntimeCheckWithDiagnostics = useCallback(
    async (
      nextState: CompiledScriptState,
      context: CustomIndicatorScriptIssueContext,
    ) => {
      const requestSelectionRevision = selectionRevisionRef.current;
      const nextRuntimeIssues = await runScriptRuntimeCheck(nextState, context);
      if (selectionRevisionRef.current !== requestSelectionRevision) {
        return;
      }
      const chart = chartRef.current;
      const container = chartContainerRef.current;
      if (chart && container) {
        mountCustomScriptIndicator(chart, nextState);
        mountedCustomScriptStateKeyRef.current =
          buildCompiledScriptMountKey(nextState);
        applyPaneLayout(chart, container.clientHeight, {
          preserveCurrentRatio: false,
        });
        requestValidationChartLayoutRef.current(false);
      }
      if (nextRuntimeIssues.length) {
        setIsDiagnosticsDrawerOpen(true);
        appendConsoleLog(
          "error",
          nextRuntimeIssues[0]?.message || ui.customIndicatorRuntimeFail,
        );
      }
    },
    [
      appendConsoleLog,
      chartContainerRef,
      chartRef,
      mountedCustomScriptStateKeyRef,
      requestValidationChartLayoutRef,
      ui.customIndicatorRuntimeFail,
      runScriptRuntimeCheck,
    ],
  );

  const refreshActiveScriptPreview = useCallback(
    async (context: CustomIndicatorScriptIssueContext = "script-restore") => {
      if (!compiledScriptState) {
        return;
      }
      await runScriptRuntimeCheckWithDiagnostics(compiledScriptState, context);
    },
    [compiledScriptState, runScriptRuntimeCheckWithDiagnostics],
  );

  const runCustomScript = useCallback(async () => {
    if (scriptRunInFlightRef.current) {
      return;
    }
    if (!readRuntimeDataList().length) {
      setRuntimeIssues([]);
      setIsDiagnosticsDrawerOpen(true);
      setScriptRunFeedback({ state: "empty", message: ui.statsNoData });
      appendConsoleLog("error", ui.statsNoData);
      return;
    }
    scriptRunInFlightRef.current = true;
    const runFeedbackContext = scriptRunFeedbackContextRef.current;
    setScriptRunFeedback({
      state: "running",
      message: ui.customIndicatorRunScript,
    });
    appendConsoleLog("info", ui.customIndicatorRunScript);
    try {
      const runtimeName =
        profileNameInput.trim() ||
        state.effectiveSystemTemplates.find(
          (template) => template.id === state.activeSystemTemplateId,
        )?.definition.name ||
        ui.customIndicatorTitle;
      const result = await compileAndApplyScript(
        scriptSource,
        parameterDefinitions,
        parameterInputs,
        runtimeName,
      );
      if (scriptRunFeedbackContextRef.current !== runFeedbackContext) {
        return;
      }
      if (result.stale) {
        setScriptRunFeedback({ state: "idle", message: "" });
        return;
      }
      if (!result.state) {
        const message = resolveCustomIndicatorProductMessage(
          result.compileErrors[0] ?? null,
          { context: "script-run", fallback: ui.customIndicatorCompileFail },
        );
        setRuntimeIssues([]);
        setIsDiagnosticsDrawerOpen(true);
        setScriptRunFeedback({ state: "error", message });
        appendConsoleLog("error", message);
        return;
      }
      const nextRuntimeIssues = await runScriptRuntimeCheck(
        result.state,
        "script-run",
      );
      if (scriptRunFeedbackContextRef.current !== runFeedbackContext) {
        return;
      }
      if (nextRuntimeIssues.length) {
        const message =
          nextRuntimeIssues[0]?.message || ui.customIndicatorRuntimeFail;
        setIsDiagnosticsDrawerOpen(true);
        setScriptRunFeedback({ state: "error", message });
        appendConsoleLog("error", message);
        return;
      }
      const chart = chartRef.current;
      const container = chartContainerRef.current;
      if (chart && container) {
        mountCustomScriptIndicator(chart, result.state);
        mountedCustomScriptStateKeyRef.current = buildCompiledScriptMountKey(
          result.state,
        );
        applyPaneLayout(chart, container.clientHeight, {
          preserveCurrentRatio: false,
        });
        requestValidationChartLayoutRef.current(false);
      }
      setScriptRunFeedback({
        state: "success",
        message: ui.customIndicatorRuntimePass,
      });
      appendConsoleLog("success", ui.customIndicatorCompilePass);
    } catch (error) {
      if (scriptRunFeedbackContextRef.current !== runFeedbackContext) {
        return;
      }
      const message = resolveCustomIndicatorProductMessage(error, {
        context: "script-run",
        fallback: ui.customIndicatorRuntimeFail,
      });
      setIsDiagnosticsDrawerOpen(true);
      setScriptRunFeedback({ state: "error", message });
      appendConsoleLog("error", message);
    } finally {
      scriptRunInFlightRef.current = false;
    }
  }, [
    appendConsoleLog,
    chartContainerRef,
    chartRef,
    compileAndApplyScript,
    mountedCustomScriptStateKeyRef,
    parameterDefinitions,
    parameterInputs,
    profileNameInput,
    requestValidationChartLayoutRef,
    readRuntimeDataList,
    scriptSource,
    state.activeSystemTemplateId,
    state.effectiveSystemTemplates,
    ui.customIndicatorCompileFail,
    ui.customIndicatorCompilePass,
    ui.customIndicatorRunScript,
    ui.customIndicatorRuntimeFail,
    ui.customIndicatorRuntimePass,
    ui.customIndicatorTitle,
    ui.statsNoData,
    runScriptRuntimeCheck,
  ]);

  const loadSystemDefaultTemplate = useCallback(
    async (
      template: WorkbenchState["effectiveSystemTemplates"][number],
      options?: { userInitiated?: boolean },
    ) => {
      const nextSource = template.definition.source;
      const nextDefinitions = normalizeParameterDefinitions(
        template.definition.parameters,
      );
      const nextInputs = buildParameterInputMap(
        nextDefinitions,
        template.overrideProfile?.parameterInputs,
      );
      markSelectionChange(options);
      setScriptSource(nextSource);
      setParameterDefinitions(nextDefinitions);
      setParameterInputs(nextInputs);
      setProfileNameInput(template.definition.name);
      setProfileNameEditMode(false);
      state.setActiveIndicatorGroup("system");
      state.setActiveSystemTemplateId(template.id);
      state.setActiveSavedProfileId(null);
      const compileResult = await compileAndApplyScript(
        nextSource,
        nextDefinitions,
        nextInputs,
        template.definition.name,
      );
      if (!compileResult.stale && compileResult.state) {
        await runScriptRuntimeCheckWithDiagnostics(
          compileResult.state,
          "script-apply",
        );
      }
    },
    [
      compileAndApplyScript,
      markSelectionChange,
      state,
      runScriptRuntimeCheckWithDiagnostics,
    ],
  );

  useEffect(() => {
    if (
      hasAppliedInitialSystemTemplateRef.current ||
      hasUserSelectedIndicatorRef.current
    ) {
      return;
    }
    const firstSystemTemplate = state.effectiveSystemTemplates[0] ?? null;
    if (!firstSystemTemplate) {
      return;
    }
    hasAppliedInitialSystemTemplateRef.current = true;
    void loadSystemDefaultTemplate(firstSystemTemplate, {
      userInitiated: false,
    });
  }, [loadSystemDefaultTemplate, state.effectiveSystemTemplates]);

  const loadSavedProfile = useCallback(
    async (profile: WorkbenchState["userSavedProfiles"][number]) => {
      const applySavedProfile = async () => {
        const nextDefinitions = normalizeParameterDefinitions([]);
        const nextInputs = { ...(profile.parameterInputs ?? {}) };
        const nextSource = profile.source.trim();
        markSelectionChange();
        setScriptSource(nextSource);
        setParameterDefinitions(nextDefinitions);
        setParameterInputs(nextInputs);
        setProfileNameInput(resolveSavedProfileDisplayName(profile));
        setProfileNameEditMode(false);
        state.setActiveIndicatorGroup("custom");
        state.setActiveSystemTemplateId("");
        state.setActiveSavedProfileId(profile.id);
        const compileResult = await compileAndApplyScript(
          nextSource,
          nextDefinitions,
          nextInputs,
          resolveSavedProfileDisplayName(profile),
        );
        if (!compileResult.stale && compileResult.state) {
          await runScriptRuntimeCheckWithDiagnostics(
            compileResult.state,
            "script-restore",
          );
        }
      };
      await applySavedProfile();
    },
    [
      compileAndApplyScript,
      markSelectionChange,
      state,
      runScriptRuntimeCheckWithDiagnostics,
    ],
  );

  const createNewScriptDraft = useCallback(async () => {
    const startBlankDraft = () => {
      const nextDefinitions: IndicatorParameterDefinition[] = [];
      const nextInputs: Record<string, string> = {};
      markSelectionChange();
      setScriptSource("");
      setParameterDefinitions(nextDefinitions);
      setParameterInputs(nextInputs);
      setProfileNameInput("");
      setProfileNameEditMode(true);
      setCompiledScriptState(null);
      setCompileIssues([]);
      setParameterWarnings([]);
      setRuntimeIssues([]);
      state.setActiveIndicatorGroup("custom");
      state.setActiveSystemTemplateId("");
      state.setActiveSavedProfileId(null);
    };
    startBlankDraft();
  }, [markSelectionChange, state]);

  const saveCurrentIndicator = useCallback(async () => {
    try {
      appendConsoleLog("info", ui.customIndicatorSave);
      const activeSystemTemplate =
        state.activeIndicatorGroup === "system"
          ? (state.effectiveSystemTemplates.find(
              (template) => template.id === state.activeSystemTemplateId,
            ) ?? null)
          : null;
      const sourceToPersist =
        state.activeIndicatorGroup === "system" && activeSystemTemplate
          ? activeSystemTemplate.definition.source.trim()
          : scriptSource.trim();
      const parameterDefinitionsToPersist =
        state.activeIndicatorGroup === "system" && activeSystemTemplate
          ? normalizeParameterDefinitions(
              activeSystemTemplate.definition.parameters,
            )
          : parameterDefinitions;
      const nextName =
        state.activeIndicatorGroup === "system" && activeSystemTemplate
          ? activeSystemTemplate.definition.name
          : profileNameInput.trim() ||
            `${activeValidationSymbol}-${hashString(sourceToPersist).slice(0, 6)}`;
      const compileResult = await compileAndApplyScript(
        sourceToPersist,
        parameterDefinitionsToPersist,
        parameterInputs,
        nextName,
      );
      if (compileResult.stale || !compileResult.state) {
        return;
      }
      const nextProfileId =
        state.activeIndicatorGroup === "system" && activeSystemTemplate
          ? state.buildSystemDefaultIndicatorOverrideProfileId(
              activeSystemTemplate.id,
            )
          : (state.activeSavedProfileId ?? undefined);
      const result = await saveSavedIndicatorProfile({
        id: nextProfileId,
        name: nextName,
        source: sourceToPersist,
        parameterInputs: compileResult.nextParameterInputs,
      });
      if (!result.ok || !result.profile) {
        appendConsoleLog(
          "error",
          setStoragePersistFailure(
            result,
            "profile-save",
            resolveCustomIndicatorProductMessage(
              { code: result.code || "PROFILE_SAVE_FAILED" },
              { context: "profile-save" },
            ),
          ),
        );
        setIsDiagnosticsDrawerOpen(true);
        return;
      }
      state.setSavedProfiles(result.profiles);
      const overrideTemplateId = parseSystemDefaultIndicatorOverrideTemplateId(
        result.profile.id,
      );
      if (overrideTemplateId) {
        state.setActiveIndicatorGroup("system");
        state.setActiveSystemTemplateId(overrideTemplateId);
        state.setActiveSavedProfileId(null);
      } else {
        state.setActiveIndicatorGroup("custom");
        state.setActiveSavedProfileId(result.profile.id);
      }
      setProfileNameInput(resolveSavedProfileDisplayName(result.profile));
      appendConsoleLog("success", ui.customIndicatorSaveInfo);
    } catch (error) {
      appendConsoleLog(
        "error",
        resolveCustomIndicatorProductMessage(error, {
          context: "script-save",
          fallback: ui.customIndicatorCompileFail,
        }),
      );
      setIsDiagnosticsDrawerOpen(true);
    }
  }, [
    activeValidationSymbol,
    appendConsoleLog,
    compileAndApplyScript,
    parameterDefinitions,
    parameterInputs,
    profileNameInput,
    scriptSource,
    setStoragePersistFailure,
    state,
    ui.customIndicatorCompileFail,
    ui.customIndicatorSave,
    ui.customIndicatorSaveInfo,
  ]);

  useCustomIndicatorWorkbenchShortcuts({
    isActive,
    runScript: runCustomScript,
    saveIndicator: saveCurrentIndicator,
  });

  const requestDeleteSavedProfile = useCallback(
    (profile: WorkbenchState["userSavedProfiles"][number]) => {
      setArmedKey(profile.id);
    },
    [setArmedKey],
  );
  const confirmDeleteSavedProfile = useCallback(
    async (profileId: string) => {
      const profile =
        state.userSavedProfiles.find((item) => item.id === profileId) ?? null;
      if (!profile) {
        return;
      }
      const result = await removeSavedIndicatorProfile(profile.id);
      if (!result.ok) {
        appendConsoleLog(
          "error",
          setStoragePersistFailure(
            result,
            "profile-write",
            resolveCustomIndicatorProductMessage(
              { code: result.code || "PROFILE_DELETE_FAILED" },
              { context: "profile-save" },
            ),
          ),
        );
        setIsDiagnosticsDrawerOpen(true);
        return;
      }
      state.setSavedProfiles(result.profiles);
      if (
        state.activeIndicatorGroup === "custom" &&
        state.activeSavedProfileId === profile.id
      ) {
        const firstSystemTemplate = state.effectiveSystemTemplates[0] ?? null;
        if (firstSystemTemplate) {
          await loadSystemDefaultTemplate(firstSystemTemplate);
        } else {
          markSelectionChange();
          state.setActiveIndicatorGroup("system");
          state.setActiveSystemTemplateId("");
          state.setActiveSavedProfileId(null);
          setProfileNameInput("");
        }
      }
      clearArmedAction();
      appendConsoleLog("info", ui.customIndicatorDeleteSaved);
    },
    [
      appendConsoleLog,
      clearArmedAction,
      loadSystemDefaultTemplate,
      markSelectionChange,
      setStoragePersistFailure,
      state,
      ui.customIndicatorDeleteSaved,
    ],
  );

  const updateParameterInput = useCallback((name: string, value: string) => {
    if (
      name.length > INPUT_LIMITS.parameterKeyChars ||
      value.length > INPUT_LIMITS.parameterValueChars
    ) {
      return;
    }
    hasUserSelectedIndicatorRef.current = true;
    workbenchDraftVersionRef.current += 1;
    setParameterInputs((current) => ({ ...current, [name]: value }));
  }, []);
  const {
    activeScriptName,
    activeScriptTooltipFeature,
    currentIndicatorGroupLabel,
    diagnosticsSummaryText,
    formatConsoleTime,
    hasDiagnosticsIssue,
    hasRunIssue,
    isSaveRecommended,
    jumpToScriptIssue,
    parameterCards,
    workbenchPanelStyle,
    workbenchStatusText,
    workbenchStatusTone,
  } = useCustomIndicatorWorkbenchPresentation({
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
  });

  return {
    codeEditorHostRef,
    codeEditorViewRef,
    consoleOutputRef,
    scriptSource,
    setScriptSource,
    parameterDefinitions,
    parameterInputs,
    compiledScriptState,
    compileIssues,
    parameterWarnings,
    runtimeIssues,
    storagePersistError,
    profileNameInput,
    setProfileNameInput: updateProfileNameInput,
    profileNameEditMode,
    setProfileNameEditMode,
    workbenchPanelRatio,
    setWorkbenchPanelRatio,
    isWorkbenchResizing,
    setIsWorkbenchResizing,
    isInspectorCollapsed,
    setIsInspectorCollapsed,
    isDiagnosticsDrawerOpen,
    setIsDiagnosticsDrawerOpen,
    consoleLogs,
    isScriptRunning: scriptRunFeedback.state === "running",
    scriptRunFeedback,
    isSystemIndicatorReadonly,
    appendConsoleLog,
    clearStoragePersistFailure,
    runCustomScript,
    refreshActiveScriptPreview,
    saveCurrentIndicator,
    createNewScriptDraft,
    loadSavedProfile,
    loadSystemDefaultTemplate,
    requestDeleteSavedProfile,
    confirmDeleteSavedProfile,
    buildBlurClearHandler,
    isActionArmed,
    updateParameterInput,
    parameterCards,
    isSaveRecommended,
    hasDiagnosticsIssue,
    hasRunIssue,
    diagnosticsSummaryText,
    workbenchStatusTone,
    workbenchStatusText,
    currentIndicatorGroupLabel,
    activeScriptName,
    activeScriptTooltipFeature,
    jumpToScriptIssue,
    formatConsoleTime,
    wrapLockedLabelWithTooltip,
    workbenchPanelStyle,
  };
};
