// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import { DesktopCloseBehaviorController } from "@/app-shell/DesktopCloseBehaviorController";
import { I18nProvider } from "@/frontend-kernel/i18n";
import { renderRuntimeDesktopShell } from "@/app-shell/runtime/workspace-shell/runtimeDesktopShellRenderer";
import type { UiSettings } from "@/frontend-kernel/appTypes";
import type { DesktopHelpNavigationTarget } from "@/domains/desktop-help/desktopHelpTypes";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeGlobalOverlayHost } from "@/app-shell/runtime/runtimeGlobalOverlayHost";
import type { useRuntimeNoteEditorAndShortcuts } from "@/app-shell/runtime/runtimeNoteEditorAndShortcuts";
import type { useRuntimeSecondaryWindows } from "@/app-shell/runtime/runtimeSecondaryWindows";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeWorkspaceBundles } from "@/app-shell/runtime/runtimeWorkspaceBundles";
import type { useRuntimeWorkspaceProps } from "@/app-shell/runtime/runtimeWorkspaceProps";
import { resolveTrainerChartSurfacePage } from "@/app-shell/trainerChartSurfacePage";
import { RetryableLazyModuleSurface } from "@/frontend-kernel/RetryableLazyModuleSurface";
import { Button } from "@/ui/primitives/button";

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};

type RuntimeAppHostScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  ReturnType<typeof useRuntimeStartupPersistence> &
  ReturnType<typeof useRuntimeTrainerChartSession> &
  ReturnType<typeof useRuntimeTrainerMarketSettings> &
  ReturnType<typeof useRuntimeTrainerPoolChartPipeline> &
  ReturnType<typeof useRuntimeTrainerChartOrchestration> &
  ReturnType<typeof useRuntimeFreeReplaySetup> &
  ReturnType<typeof useRuntimeFreeReplayExecution> &
  ReturnType<typeof useRuntimeTradingSettingsAndImport> &
  ReturnType<typeof useRuntimeDataResetNavigation> &
  ReturnType<typeof useRuntimeNoteEditorAndShortcuts> &
  ReturnType<typeof useRuntimeWorkspaceProps> &
  ReturnType<typeof useRuntimeWorkspaceBundles> &
  ReturnType<typeof useRuntimeSecondaryWindows> &
  ReturnType<typeof useRuntimeGlobalOverlayHost> &
  Record<string, unknown>;

const loadRuntimeTrainerChartLifecycle = () =>
  import("@/app-shell/runtime/trainer-runtime/RuntimeTrainerChartLifecycle").then(
    (module) => ({
      default: module.RuntimeTrainerChartLifecycle,
    }),
  );

export const RuntimeAppHost = ({ scope }: { scope: RuntimeAppHostScope }) => {
  const trainerChartSurfacePage = resolveTrainerChartSurfacePage({
    activePage: scope.activePage,
    displayedPage: scope.displayedWorkspacePage,
  });
  const trainerChartDomAttachVersion =
    trainerChartSurfacePage === "SPECIAL_TRAINING"
      ? scope.specialTrainingChartDomAttachVersion
      : scope.trainerChartDomAttachVersion;
  const handleNavigateToDesktopHelpTarget = useCallback(
    (target: DesktopHelpNavigationTarget) => {
      if (target.workspace === "SETTINGS" && target.settingsTab) {
        scope.setRequestedSystemSettingsTab(target.settingsTab);
      }
      scope.workspaceSwitcherProps.onSelectPage(target.workspace);
    },
    [scope.setRequestedSystemSettingsTab, scope.workspaceSwitcherProps.onSelectPage],
  );

  return (
    <I18nProvider locale={scope.language}>
      {trainerChartSurfacePage ? (
        <RetryableLazyModuleSurface
          componentProps={{
            activePage: trainerChartSurfacePage,
            chartDomAttachVersion: trainerChartDomAttachVersion,
            chartDomRef: scope.chartDomRef,
            resolveChartDomForPage: scope.resolveChartDomForPage,
            chartRef: scope.chartRef,
            chartDataRef: scope.chartDataRef,
            liveBarSubscriberRef: scope.liveBarSubscriberRef,
            barsRef: scope.barsRef,
            visibleAggregatedBarsRef: scope.visibleAggregatedBarsRef,
            snapshotRef: scope.snapshotRef,
            currentDisplayPeriodRef: scope.currentDisplayPeriodRef,
            signalTopRef: scope.signalTopRef,
            signalBottomRef: scope.signalBottomRef,
            signalTopParamsRef: scope.signalTopParamsRef,
            signalBottomParamsRef: scope.signalBottomParamsRef,
            showTrainerVolumePaneRef: scope.showTrainerVolumePaneRef,
            drawingOverlayIdRef: scope.drawingOverlayIdRef,
            rearmTimerRef: scope.rearmTimerRef,
            chartDataRenderSignatureRef: scope.chartDataRenderSignatureRef,
            chartMarkerHeavyRenderSignatureRef:
              scope.chartMarkerHeavyRenderSignatureRef,
            chartMarkerPositionRenderSignatureRef:
              scope.chartMarkerPositionRenderSignatureRef,
            lastMainIndicatorMountKeyRef: scope.lastMainIndicatorMountKeyRef,
            lastSignalIndicatorMountKeyRef: scope.lastSignalIndicatorMountKeyRef,
            language: scope.language,
            effectiveThemeMode: scope.effectiveThemeMode,
            priceColorMode: scope.priceColorMode,
            chartRenderMode: scope.chartRenderMode,
            trainerResponsiveChartEdgeConfig:
              scope.trainerResponsiveChartEdgeConfig,
            applyTrainerMaxOffsetRightDistance:
              scope.applyTrainerMaxOffsetRightDistance,
            syncTradeMarkerCompactMode: scope.syncTradeMarkerCompactMode,
            adjustPaneHeights: scope.adjustPaneHeights,
            setSelectedDataIndex: scope.setSelectedDataIndex,
            setChartReady: scope.setChartReady,
            setError: scope.setError,
            chartInitErrorText: scope.tt("appText.chartInitialization"),
            loadMoreTrainerBars: scope.loadMoreTrainerBarsForChart,
            onOpenChartSettingsModal: scope.openChartSettingsModal,
            onOpenIndicatorQuickMenu: scope.openIndicatorQuickMenu,
          }}
          fallback={null}
          loader={loadRuntimeTrainerChartLifecycle}
          moduleName="RUNTIME_TRAINER_CHART_LIFECYCLE"
          renderError={({ retry }) => (
            <div
              className="app-lazy-module-recovery is-chart-lifecycle"
              role="alert"
              aria-live="assertive"
            >
              <span>{scope.tt("appText.chartInitialization")}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={retry}
              >
                {scope.tt("appText.retry")}
              </Button>
            </div>
          )}
        />
      ) : null}
      {renderRuntimeDesktopShell({
        language: scope.language,
        themeMode: scope.themeMode,
        resolvedThemeMode: scope.effectiveThemeMode,
        priceColorMode: scope.priceColorMode,
        fontSizePreset: scope.fontSizePreset,
        viewportLayoutMode: scope.viewportLayoutMode,
        activePage: scope.activePage,
        showDesktopHelpLauncher: scope.showDesktopHelpLauncher,
        setShowDesktopHelpLauncher: scope.setShowDesktopHelpLauncher,
        onNavigateToDesktopHelpTarget: handleNavigateToDesktopHelpTarget,
        rootStyle: scope.appRootStyle,
        rootLocaleWidthProfile: scope.localeWidthProfile,
        onMouseDownCapture: scope.startWindowDrag,
        onMouseMoveCapture: scope.continueWindowDrag,
        onMouseUpCapture: scope.clearPendingWindowDrag,
        onMouseLeave: scope.clearPendingWindowDrag,
        onDoubleClickCapture: scope.toggleWindowMaximize,
        sidebarGroups: scope.sidebarGroups,
        workspaceSwitcherProps: scope.workspaceSwitcherProps,
        onboardingTourStatus: scope.onboardingTourStatus,
        onboardingTourStep: scope.onboardingTourStep,
        onOnboardingTourStatusChange: scope.setOnboardingTourStatus,
        onOnboardingTourStepChange: scope.setOnboardingTourStep,
        trainerModalHostProps: scope.trainerModalHostProps,
        utilityDialogsProps: scope.utilityDialogsProps,
        actionDialogNode: scope.actionDialogNode,
      })}
      <DesktopCloseBehaviorController
        desktopCloseButtonAction={scope.desktopCloseButtonAction}
        setDesktopCloseButtonAction={scope.setDesktopCloseButtonAction}
        buildUiSettings={scope.buildUiSettingsForPersist}
        canPersistUiSettings={scope.canPersistUiSettings}
      />
    </I18nProvider>
  );
};
