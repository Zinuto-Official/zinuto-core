// SPDX-License-Identifier: GPL-3.0-only

import { AppIcon, VendorIcon } from "@/assets/graphics";
import { FeatureLockLabel, WorkspaceFrameShell, WorkspacePageShell } from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import { InlineLoadingState } from "@/ui/primitives/loading";
import { Input } from "@/ui/primitives/input";
import { SearchSelectField } from "@/ui/primitives/search-select-field";
import { SelectField } from "@/ui/primitives/select-field";
import type { CustomIndicatorSystemPageProps } from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import { useCustomIndicatorWorkbenchEditorState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchEditorState";
import { useCustomIndicatorWorkbenchMarketState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchMarketState";
import { useCustomIndicatorWorkbenchState } from "@/workspaces/custom-indicator/customIndicatorWorkbenchState";
import { resolveCustomIndicatorMarketSurfaceState } from "@/workspaces/custom-indicator/customIndicatorMarketSurfaceState";
import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";

type WorkbenchState = ReturnType<typeof useCustomIndicatorWorkbenchState>;
type EditorState = ReturnType<typeof useCustomIndicatorWorkbenchEditorState>;
type MarketState = ReturnType<typeof useCustomIndicatorWorkbenchMarketState>;

type CustomIndicatorWorkbenchLayoutProps = Pick<
  CustomIndicatorSystemPageProps,
  "language" | "ui"
> & {
  state: WorkbenchState;
  editor: EditorState;
  market: MarketState;
  mainPanelRef: MutableRefObject<HTMLDivElement | null>;
  chartContainerRef: MutableRefObject<HTMLDivElement | null>;
  isWorkbenchResizing: boolean;
  handleWorkbenchResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  handleWorkbenchResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  openIndicatorReferenceWindow: () => void;
};

export const CustomIndicatorWorkbenchLayout = ({
  ui,
  state,
  editor,
  market,
  mainPanelRef,
  chartContainerRef,
  isWorkbenchResizing,
  handleWorkbenchResizeKeyDown,
  handleWorkbenchResizeStart,
  openIndicatorReferenceWindow,
}: CustomIndicatorWorkbenchLayoutProps) => {
  const runtimeStatusText = editor.hasRunIssue
    ? ui.customIndicatorRuntimeFail
    : ui.customIndicatorRuntimePass;
  const isCustomGroupCollapsed = state.collapsedManagerGroups.includes("custom");
  const isSystemGroupCollapsed = state.collapsedManagerGroups.includes("system");
  const consolePromptSymbol = ">_";
  const marketSurfaceState = resolveCustomIndicatorMarketSurfaceState({
    catalogLoadState: market.catalogLoadState,
    marketLoadState: market.marketLoadState,
    hasMarketData: market.hasMarketData,
  });
  const marketSurfaceMessage =
    marketSurfaceState === "error"
      ? market.marketLoadError ||
        market.catalogLoadError ||
        ui.customIndicatorDataLoadFailed
      : marketSurfaceState === "empty"
        ? ui.statsNoData
        : marketSurfaceState === "loading"
          ? ui.statsLoading
          : "";
  const isRunDisabled =
    editor.isScriptRunning || marketSurfaceState !== "ready";
  const createNewScriptButton = (
    <Button
      type="button"
      variant="default"
      className="custom-indicator-manager-create-btn"
      onClick={() => {
        void editor.createNewScriptDraft();
      }}
      aria-label={ui.customIndicatorCreateNew}
    >
      <AppIcon name="actionAdd" />
      <span className="custom-indicator-manager-create-label">
        <span>{ui.customIndicatorCreateNew}</span>
      </span>
    </Button>
  );
  const marketLoadMessages = useMemo(
    () => [
      market.marketLoadState === "error"
        ? market.marketLoadError || ui.customIndicatorDataLoadFailed
        : "",
      market.catalogLoadError,
      editor.storagePersistError,
    ].filter(Boolean),
    [
      editor.storagePersistError,
      market.catalogLoadError,
      market.marketLoadError,
      market.marketLoadState,
      ui.customIndicatorDataLoadFailed,
    ],
  );

  return (
    <WorkspacePageShell
      template="workbench"
      className="custom-indicator-page"
      bodyClassName="custom-indicator-page-body"
    >
      <WorkspaceFrameShell
        className="custom-indicator-body"
        data-onboarding-target="TOOLS_INDICATOR"
      >
        <div
          className="custom-indicator-ide-layout"
          data-inspector-collapsed={editor.isInspectorCollapsed ? "true" : "false"}
        >
          <aside
            className="custom-indicator-manager-panel"
            aria-label={ui.customIndicatorManageTitle}
          >
            <div className="custom-indicator-manager-rail">
              {createNewScriptButton}
            </div>

            <div
              className="custom-indicator-manager-groups"
              data-system-collapsed={isSystemGroupCollapsed ? "true" : "false"}
              data-custom-collapsed={isCustomGroupCollapsed ? "true" : "false"}
            >
              <section
                className="custom-indicator-manager-group"
                data-manager-group="system"
                data-collapsed={isSystemGroupCollapsed ? "true" : "false"}
                aria-label={ui.indicatorGroupSystemDefault}
              >
                <Button
                  type="button"
                  className="custom-indicator-manager-group-toggle"
                  onClick={() => state.toggleManagerGroup("system")}
                  aria-expanded={!isSystemGroupCollapsed}
                  title={ui.indicatorGroupSystemDefault}
                >
                  <span className="custom-indicator-manager-group-label">
                    {ui.indicatorGroupSystemDefault}
                  </span>
                  <span className="custom-indicator-manager-group-meta">
                    {state.effectiveSystemTemplates.length}
                  </span>
                  <span className="custom-indicator-manager-group-caret">
                    <AppIcon
                      name={
                        isSystemGroupCollapsed
                          ? "actionChevronRight"
                          : "actionChevronDown"
                      }
                    />
                  </span>
                </Button>
                {!isSystemGroupCollapsed ? (
                  <div className="custom-indicator-manager-list">
                    {state.effectiveSystemTemplates.map((template) => {
                      const isActive =
                        state.activeIndicatorGroup === "system" &&
                        state.activeSystemTemplateId === template.id;
                      return (
                        <Button
                          key={template.id}
                          type="button"
                          className={`custom-indicator-manager-system-item ${
                            isActive ? "is-active" : ""
                          }`}
                          onClick={() => {
                            void editor.loadSystemDefaultTemplate(template);
                          }}
                          title={template.definition.name}
                        >
                          <span className="custom-indicator-manager-item-label">
                            <span>{template.definition.name}</span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section
                className="custom-indicator-manager-group"
                data-manager-group="custom"
                data-collapsed={isCustomGroupCollapsed ? "true" : "false"}
                aria-label={ui.indicatorGroupCustom}
              >
                <Button
                  type="button"
                  className="custom-indicator-manager-group-toggle"
                  onClick={() => state.toggleManagerGroup("custom")}
                  aria-expanded={!isCustomGroupCollapsed}
                  title={ui.indicatorGroupCustom}
                >
                  <span className="custom-indicator-manager-group-label">
                    {ui.indicatorGroupCustom}
                  </span>
                  <span className="custom-indicator-manager-group-meta">
                    {state.userSavedProfiles.length}
                  </span>
                  <span className="custom-indicator-manager-group-caret">
                    <AppIcon
                      name={
                        isCustomGroupCollapsed
                          ? "actionChevronRight"
                          : "actionChevronDown"
                      }
                    />
                  </span>
                </Button>
                {!isCustomGroupCollapsed ? (
                  <div className="custom-indicator-manager-list">
                    {state.userSavedProfiles.length ? (
                      state.userSavedProfiles.map((profile) => {
                        const isActive =
                          state.activeIndicatorGroup === "custom" &&
                          state.activeSavedProfileId === profile.id;
                        const profileName = profile.name;
                        return (
                          <div
                            key={profile.id}
                            className={`custom-indicator-manager-item ${
                              isActive ? "is-active" : ""
                            }`}
                          >
                            <Button
                              type="button"
                              className={`custom-indicator-manager-system-item custom-indicator-manager-custom-item ${
                                isActive ? "is-active" : ""
                              }`}
                              onClick={() => {
                                void editor.loadSavedProfile(profile);
                              }}
                              title={profileName}
                            >
                              <span className="custom-indicator-manager-item-label">
                                <span>{profileName}</span>
                              </span>
                            </Button>
                            <div
                              className="custom-indicator-manager-item-actions"
                              onBlurCapture={editor.buildBlurClearHandler(profile.id)}
                            >
                              <Button
                                type="button"
                                className="custom-indicator-manager-item-icon danger"
                                variant={
                                  editor.isActionArmed(profile.id)
                                    ? "destructive"
                                    : "ghost"
                                }
                                onClick={() => {
                                  if (editor.isActionArmed(profile.id)) {
                                    void editor.confirmDeleteSavedProfile(profile.id);
                                    return;
                                  }
                                  editor.requestDeleteSavedProfile(profile);
                                }}
                                title={ui.customIndicatorDeleteSaved}
                                aria-label={ui.customIndicatorDeleteSaved}
                              >
                                <AppIcon name="actionDelete" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="custom-indicator-manager-empty">
                        {ui.customIndicatorNoSaved}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            </div>
          </aside>

          <section
            className="custom-indicator-main-panel"
            ref={mainPanelRef}
            style={editor.workbenchPanelStyle}
            aria-label={ui.customIndicatorWorkspaceEditor}
          >
            <section
              className="custom-indicator-viewport-panel"
              aria-label={ui.customIndicatorChartTitle}
            >
              <div className="custom-indicator-viewport-head">
                <h3 className="custom-indicator-viewport-title">
                  {ui.customIndicatorChartTitle}
                </h3>
                <div
                  className="custom-indicator-viewport-controls"
                  aria-label={`${ui.randomPool} ${ui.symbol} ${market.validationPeriodTitle}`}
                >
                  <SelectField
                    className="custom-indicator-viewport-pool-select"
                    align="start"
                    contentWidth="content"
                    value={
                      market.samplePoolOptions.length
                        ? market.activeSamplePoolId
                        : ""
                    }
                    disabled={!market.samplePoolOptions.length}
                    aria-label={ui.randomPool}
                    onValueChange={market.setActiveSamplePoolId}
                    options={
                      market.samplePoolOptions.length
                        ? market.samplePoolOptions.map((option) => ({
                            value: option.id,
                            disabled: option.disabled,
                            label: editor.wrapLockedLabelWithTooltip(
                              <FeatureLockLabel locked={option.locked}>
                                {option.name}
                              </FeatureLockLabel>,
                              Boolean(option.locked),
                              option.lockReason,
                            ),
                            textValue: option.name,
                          }))
                        : [{ value: "", label: ui.randomPool }]
                    }
                  />
                  <SearchSelectField
                    value={market.validationSymbol}
                    options={market.validationSymbolOptions}
                    placeholder={ui.symbol}
                    searchPlaceholder={ui.freeReplaySymbolSearch}
                    onValueChange={market.setValidationSymbol}
                    disabled={!market.validationSymbolOptions.length}
                    className="custom-indicator-viewport-symbol-select"
                    align="start"
                    contentWidth="content"
                  />
                  <SelectField
                    className="custom-indicator-viewport-period-select"
                    align="start"
                    contentWidth="content"
                    value={market.effectiveValidationDisplayPeriod}
                    disabled={!market.validationPeriodSelectOptions.length}
                    aria-label={market.validationPeriodTitle}
                    title={market.validationPeriodTitle}
                    onValueChange={(nextValue) =>
                      market.setValidationDisplayPeriod(nextValue as any)
                    }
                    options={market.validationPeriodSelectOptions}
                  />
                </div>
              </div>
              <div
                className="custom-indicator-chart-stage"
                data-market-state={marketSurfaceState}
              >
                <div
                  ref={chartContainerRef}
                  className="custom-indicator-chart-canvas"
                />
                {marketSurfaceState !== "ready" ? (
                  <div
                    className={`custom-indicator-chart-state is-${marketSurfaceState}`}
                    role={marketSurfaceState === "error" ? "alert" : "status"}
                    aria-live={marketSurfaceState === "error" ? "assertive" : "polite"}
                  >
                    {marketSurfaceState === "loading" ? (
                      <InlineLoadingState label={marketSurfaceMessage} />
                    ) : (
                      <span>{marketSurfaceMessage}</span>
                    )}
                  </div>
                ) : null}
              </div>
            </section>

            <div
              className={`custom-indicator-panel-resizer ${
                isWorkbenchResizing ? "is-active" : ""
              }`}
              role="separator"
              aria-orientation="horizontal"
              aria-label={ui.customIndicatorWorkspaceEditor}
              tabIndex={0}
              onPointerDown={handleWorkbenchResizeStart}
              onKeyDown={handleWorkbenchResizeKeyDown}
            >
              <span className="custom-indicator-panel-resizer-handle" />
            </div>

            <section
              className="custom-indicator-engine-panel"
              aria-label={ui.customIndicatorWorkspaceEditor}
            >
              <div className="custom-indicator-workbench-head">
                <div className="custom-indicator-workbench-info">
                  <div className="custom-indicator-workbench-title-main">
                    {editor.profileNameEditMode ? (
                      <Input
                        autoFocus
                        className="custom-indicator-toolbar-name-input"
                        value={editor.profileNameInput}
                        maxLength={120}
                        onChange={(event) =>
                          editor.setProfileNameInput(event.target.value)
                        }
                        placeholder={ui.customIndicatorName}
                        onBlur={() => editor.setProfileNameEditMode(false)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape") {
                            event.preventDefault();
                            editor.setProfileNameEditMode(false);
                          }
                        }}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="inline"
                        disabled={editor.isSystemIndicatorReadonly}
                        className="custom-indicator-workbench-name-button"
                        onClick={() => editor.setProfileNameEditMode(true)}
                        title={ui.customIndicatorName}
                      >
                        {editor.activeScriptName}
                      </Button>
                    )}
                  </div>
                  <div className="custom-indicator-workbench-status-row">
                    <span
                      className={`custom-indicator-context-status is-${editor.workbenchStatusTone}`}
                      title={editor.workbenchStatusText}
                    >
                      {editor.isSaveRecommended ? (
                        <span
                          className="custom-indicator-context-status-dot"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="custom-indicator-context-status-label">
                        {editor.workbenchStatusText}
                      </span>
                    </span>
                    <span
                      className="custom-indicator-workbench-group-meta"
                      title={editor.currentIndicatorGroupLabel}
                    >
                      {editor.currentIndicatorGroupLabel}
                    </span>
                    <span
                      className="custom-indicator-run-feedback"
                      data-state={editor.scriptRunFeedback.state}
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {editor.scriptRunFeedback.message}
                    </span>
                  </div>
                </div>
                <div
                  className="custom-indicator-workbench-actions"
                  role="toolbar"
                  aria-label={ui.customIndicatorWorkspaceEditor}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="custom-indicator-workbench-action custom-indicator-workbench-action-more"
                    onClick={openIndicatorReferenceWindow}
                    title={ui.customIndicatorRulesOpen}
                  >
                    <VendorIcon name="circleHelp" data-icon="inline-start" />
                    <span className="custom-indicator-workbench-action-label">
                      {ui.customIndicatorRulesOpen}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="custom-indicator-workbench-action custom-indicator-workbench-action-run"
                    onClick={() => void editor.runCustomScript()}
                    disabled={isRunDisabled}
                    loading={editor.isScriptRunning}
                    loadingLabel={ui.customIndicatorRunScript}
                    title={ui.customIndicatorRunApply}
                  >
                    <AppIcon name="statusBolt" data-icon="inline-start" />
                    <span className="custom-indicator-workbench-action-label">
                      {ui.customIndicatorRunApply}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={`custom-indicator-workbench-action custom-indicator-workbench-action-save ${
                      editor.isSaveRecommended ? "is-dirty" : ""
                    }`}
                    onClick={() => void editor.saveCurrentIndicator()}
                    title={ui.customIndicatorSave}
                  >
                    <VendorIcon name="fileCheck" data-icon="inline-start" />
                    <span className="custom-indicator-workbench-action-label">
                      {ui.customIndicatorSave}
                    </span>
                  </Button>
                </div>
              </div>

              <div
                className="custom-indicator-engine-body"
                data-diagnostics-open={editor.isDiagnosticsDrawerOpen ? "true" : "false"}
              >
                <section
                  className="custom-indicator-source-tab"
                  aria-label={ui.customIndicatorScriptSource}
                >
                  <div className="custom-indicator-code-editor-frame">
                    <div
                      ref={editor.codeEditorHostRef}
                      className="custom-indicator-code-editor"
                      data-readonly={editor.isSystemIndicatorReadonly ? "true" : "false"}
                    />
                  </div>
                </section>

                <section
                  className={`custom-indicator-diagnostics-drawer ${
                    editor.isDiagnosticsDrawerOpen ? "is-open" : ""
                  }`}
                  aria-label={ui.customIndicatorRuntimeDiagnostics}
                >
                  <Button
                    type="button"
                    className={`custom-indicator-diagnostics-toggle is-${
                      editor.hasDiagnosticsIssue ? "error" : "ready"
                    } ${editor.isDiagnosticsDrawerOpen ? "is-open" : ""}`}
                    onClick={() =>
                      editor.setIsDiagnosticsDrawerOpen((current) => !current)
                    }
                    aria-expanded={editor.isDiagnosticsDrawerOpen}
                    title={ui.customIndicatorRuntimeDiagnostics}
                  >
                    <div className="custom-indicator-diagnostics-toggle-copy">
                      <span className="custom-indicator-diagnostics-toggle-label">
                        {ui.customIndicatorRuntimeDiagnostics}
                      </span>
                      <strong className="custom-indicator-diagnostics-toggle-summary">
                        {editor.diagnosticsSummaryText}
                      </strong>
                    </div>
                    <div className="custom-indicator-diagnostics-toggle-tail">
                      <span
                        className={`custom-indicator-diagnostics-toggle-text is-${
                          editor.hasDiagnosticsIssue ? "error" : "ready"
                        }`}
                      >
                        {editor.isDiagnosticsDrawerOpen
                          ? ui.customIndicatorDiagnosticsHide
                          : ui.customIndicatorDiagnosticsShow}
                      </span>
                      <span
                        className="custom-indicator-diagnostics-toggle-icon"
                        aria-hidden="true"
                      >
                        <AppIcon name="actionChevronDown" />
                      </span>
                    </div>
                  </Button>

                  {editor.isDiagnosticsDrawerOpen ? (
                    <div className="custom-indicator-diagnostics-drawer-body">
                      <div className="custom-indicator-diagnostics-stack">
                        <div className="custom-indicator-status-grid">
                          <article
                            className={`custom-indicator-status-card ${
                              editor.compileIssues.length ? "is-error" : "is-ready"
                            }`}
                          >
                            <span>{ui.customIndicatorCompileStatus}</span>
                            <strong>
                              {editor.compileIssues.length
                                ? ui.customIndicatorCompileFail
                                : ui.customIndicatorCompilePass}
                            </strong>
                          </article>
                          <article
                            className={`custom-indicator-status-card ${
                              editor.hasRunIssue ? "is-error" : "is-ready"
                            }`}
                          >
                            <span>{ui.customIndicatorRuntimeErrors}</span>
                            <strong>{runtimeStatusText}</strong>
                          </article>
                        </div>

                        <section className="custom-indicator-diagnostics-block">
                          <header className="custom-indicator-side-block-head">
                            <h4>{ui.customIndicatorCompileStatus}</h4>
                          </header>
                          <div className="custom-indicator-side-block-body custom-indicator-diagnostics-body">
                            {editor.compileIssues.length ? (
                              editor.compileIssues.map((issue) => (
                                <div
                                  key={issue.id}
                                  className="custom-indicator-console-row is-error"
                                >
                                  <span className="custom-indicator-console-time">
                                    {editor.formatConsoleTime(Date.now())}
                                  </span>
                                  {Number.isFinite(issue.line) &&
                                  Number.isFinite(issue.column) ? (
                                    <Button
                                      type="button"
                                      className="custom-indicator-console-inline-link custom-indicator-console-message"
                                      onClick={() => editor.jumpToScriptIssue(issue)}
                                    >
                                      {issue.message}
                                    </Button>
                                  ) : (
                                    <span className="custom-indicator-console-message">
                                      {issue.message}
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="custom-indicator-side-empty compact">
                                {ui.customIndicatorCompilePass}
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="custom-indicator-diagnostics-block">
                          <header className="custom-indicator-side-block-head">
                            <h4>{ui.customIndicatorRuntimeErrors}</h4>
                          </header>
                          <div className="custom-indicator-side-block-body custom-indicator-diagnostics-body">
                            {market.marketLoadState === "loading" ? (
                              <InlineLoadingState label={ui.statsLoading} />
                            ) : null}
                            {marketLoadMessages.map((message, index) => (
                              <div
                                key={`${message}-${String(index)}`}
                                className="custom-indicator-console-row is-error"
                              >
                                <span className="custom-indicator-console-time">
                                  {editor.formatConsoleTime(Date.now())}
                                </span>
                                <span className="custom-indicator-console-message">
                                  {message}
                                </span>
                              </div>
                            ))}
                            {editor.parameterWarnings.map((warning, index) => (
                              <div
                                key={`${warning}-${String(index)}`}
                                className="custom-indicator-console-row is-info"
                              >
                                <span className="custom-indicator-console-time">
                                  {editor.formatConsoleTime(Date.now())}
                                </span>
                                <span className="custom-indicator-console-message">
                                  {warning}
                                </span>
                              </div>
                            ))}
                            {editor.runtimeIssues.map((issue) => (
                              <div
                                key={issue.id}
                                className="custom-indicator-console-row is-error"
                              >
                                <span className="custom-indicator-console-time">
                                  {editor.formatConsoleTime(Date.now())}
                                </span>
                                {Number.isFinite(issue.line) &&
                                Number.isFinite(issue.column) ? (
                                  <Button
                                    type="button"
                                    className="custom-indicator-console-inline-link custom-indicator-console-message"
                                    onClick={() => editor.jumpToScriptIssue(issue)}
                                  >
                                    {issue.message}
                                  </Button>
                                ) : (
                                  <span className="custom-indicator-console-message">
                                    {issue.message}
                                  </span>
                                )}
                              </div>
                            ))}
                            {market.marketLoadState !== "error" &&
                            !market.catalogLoadError &&
                            !editor.parameterWarnings.length &&
                            !editor.runtimeIssues.length &&
                            !editor.storagePersistError ? (
                              <div className="custom-indicator-side-empty compact">
                                {ui.customIndicatorRuntimePass}
                              </div>
                            ) : null}
                          </div>
                        </section>

                        <section className="custom-indicator-diagnostics-block">
                          <div className="custom-indicator-console-head">
                            <span className="custom-indicator-console-prompt">
                              {consolePromptSymbol}
                            </span>
                            <span className="custom-indicator-console-title">
                              {ui.customIndicatorRuntimeStatus}
                            </span>
                          </div>
                          <div
                            ref={editor.consoleOutputRef}
                            className="custom-indicator-console-body"
                          >
                            {editor.consoleLogs.length ? (
                              editor.consoleLogs.map((entry) => (
                                <div
                                  key={entry.id}
                                  className={`custom-indicator-console-row is-${entry.level}`}
                                >
                                  <span className="custom-indicator-console-time">
                                    {editor.formatConsoleTime(entry.timestamp)}
                                  </span>
                                  <span className="custom-indicator-console-message">
                                    {entry.message}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="custom-indicator-side-empty compact">
                                {ui.customIndicatorNoErrors}
                              </div>
                            )}
                          </div>
                        </section>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            </section>
          </section>

          <aside
            className={`custom-indicator-side-panel ${
              editor.isInspectorCollapsed ? "is-collapsed" : ""
            }`}
            aria-label={ui.customIndicatorParameters}
          >
            {editor.isInspectorCollapsed ? (
              <div className="custom-indicator-side-rail">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => editor.setIsInspectorCollapsed(false)}
                  title={ui.customIndicatorInspectorExpand}
                  aria-label={ui.customIndicatorInspectorExpand}
                >
                  <AppIcon name="actionChevronLeft" />
                </Button>
              </div>
            ) : (
              <div className="custom-indicator-side-panel-body custom-indicator-side-tabs-shell">
                <div className="custom-indicator-side-panel-head is-static">
                  <div className="custom-indicator-side-panel-title">
                    <span
                      className="custom-indicator-side-panel-title-kicker"
                      data-i18n-slot="sectionKicker"
                      data-i18n-critical="true"
                    >
                      {ui.customIndicatorWorkspaceEditor}
                    </span>
                    <strong
                      data-i18n-slot="sectionTitle"
                      data-i18n-critical="true"
                    >
                      {ui.customIndicatorParameters}
                    </strong>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => editor.setIsInspectorCollapsed(true)}
                    title={ui.customIndicatorInspectorCollapse}
                    aria-label={ui.customIndicatorInspectorCollapse}
                  >
                    <AppIcon name="actionChevronRight" />
                  </Button>
                </div>

                <section className="custom-indicator-side-card custom-indicator-side-tab-panel is-active">
                  <div className="custom-indicator-side-card-body">
                    {editor.parameterCards.length ? (
                      <div className="custom-indicator-param-grid">
                        {editor.parameterCards.map(({ parameter, rangeText }) => (
                          <label
                            key={parameter.name}
                            className="custom-indicator-param-item"
                          >
                            <div className="custom-indicator-param-head">
                              <strong>{parameter.name}</strong>
                              {rangeText ? (
                                <p>{`${ui.customIndicatorParameterRange} ${rangeText}`}</p>
                              ) : null}
                            </div>
                            <Input
                              className="custom-indicator-param-input"
                              density="compact"
                              value={editor.parameterInputs[parameter.name] ?? ""}
                              maxLength={240}
                              onChange={(event) =>
                                editor.updateParameterInput(
                                  parameter.name,
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="custom-indicator-side-empty">
                        {ui.customIndicatorNoParameters}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      </WorkspaceFrameShell>
    </WorkspacePageShell>
  );
};
