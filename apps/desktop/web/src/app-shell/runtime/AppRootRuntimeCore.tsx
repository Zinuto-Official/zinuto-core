// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from "react";
import type { UiSettings } from "@/frontend-kernel/appTypes";
import { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
import { useRuntimeNoteEditorAndShortcuts } from "@/app-shell/runtime/runtimeNoteEditorAndShortcuts";
import { useRuntimeWorkspaceProps } from "@/app-shell/runtime/runtimeWorkspaceProps";
import { useRuntimeWorkspaceBundles } from "@/app-shell/runtime/runtimeWorkspaceBundles";
import { useRuntimeSecondaryWindows } from "@/app-shell/runtime/runtimeSecondaryWindows";
import { useRuntimeGlobalOverlayHost } from "@/app-shell/runtime/runtimeGlobalOverlayHost";
import { useRuntimeStartupRefresh } from "@/app-shell/runtime/useRuntimeStartupRefresh";
import { RuntimeAppHost } from "@/app-shell/runtime/RuntimeAppHost";
import { DesktopCloseBehaviorController } from "@/app-shell/DesktopCloseBehaviorController";
import { I18nProvider } from "@/frontend-kernel/i18n";
import { setDesktopDevTextSelectionEnabled } from "@/ui/desktopInteractionPolicy";

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};

export const AppRootRuntimeCore = ({
  initialUiSettings,
  initialDataPoolRemovedSymbolsBySourceId,
  canPersistUiSettings,
}: AppRootRuntimeProps) => {
  const runtimeStartupState = useRuntimeStartupState({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
  });
  useEffect(() => {
    setDesktopDevTextSelectionEnabled(
      import.meta.env.DEV || runtimeStartupState.developerModeEnabled === true,
    );
  }, [runtimeStartupState.developerModeEnabled]);
  const runtimeStartupHistoryState = useRuntimeStartupHistoryState({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
  });
  const runtimeStartupPersistence = useRuntimeStartupPersistence({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
  });
  const runtimeTrainerChartSession = useRuntimeTrainerChartSession({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
  });
  const runtimeTrainerMarketSettings = useRuntimeTrainerMarketSettings({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
  });
  const runtimeTrainerPoolChartPipeline = useRuntimeTrainerPoolChartPipeline({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
  });
  const runtimeTrainerChartOrchestration = useRuntimeTrainerChartOrchestration({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
  });
  const runtimeFreeReplaySetup = useRuntimeFreeReplaySetup({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
  });
  const runtimeFreeReplayExecution = useRuntimeFreeReplayExecution({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
  });
  const runtimeTradingSettingsAndImport = useRuntimeTradingSettingsAndImport({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
  });
  useRuntimeStartupRefresh({
    appIsMountedRef: runtimeStartupHistoryState.appIsMountedRef,
    historyProjectsWarmupTaskRef:
      runtimeStartupHistoryState.historyProjectsWarmupTaskRef,
    replayNotesWarmupTaskRef: runtimeStartupHistoryState.replayNotesWarmupTaskRef,
    challengeStatsWarmupTaskRef:
      runtimeStartupHistoryState.challengeStatsWarmupTaskRef,
    refreshInstruments: runtimeTrainerChartSession.refreshInstruments,
    syncCustomSamplePoolsFromDataSources:
      runtimeTrainerChartSession.syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings: runtimeTrainerChartSession.refreshTradingSettings,
    refreshLatestResumableTrainerSession:
      runtimeTrainerChartSession.refreshLatestResumableTrainerSession,
    refreshSystemStorageUsage: runtimeTrainerChartSession.refreshSystemStorageUsage,
    loadTrainingProjectsPage: runtimeStartupHistoryState.loadTrainingProjectsPage,
    loadReplayNotesPage: runtimeStartupHistoryState.loadReplayNotesPage,
    runDataSourceSyncQuickCheckSweep:
      runtimeTradingSettingsAndImport.runDataSourceSyncQuickCheckSweep,
  });
  const runtimeDataResetNavigation = useRuntimeDataResetNavigation({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
  });
  const runtimeNoteEditorAndShortcuts = useRuntimeNoteEditorAndShortcuts({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
    ...runtimeDataResetNavigation,
  });
  const runtimeWorkspaceProps = useRuntimeWorkspaceProps({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
    ...runtimeDataResetNavigation,
    ...runtimeNoteEditorAndShortcuts,
  });
  const runtimeWorkspaceBundles = useRuntimeWorkspaceBundles({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
    ...runtimeDataResetNavigation,
    ...runtimeNoteEditorAndShortcuts,
    ...runtimeWorkspaceProps,
  });
  const runtimeSecondaryWindows = useRuntimeSecondaryWindows({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
    ...runtimeDataResetNavigation,
    ...runtimeNoteEditorAndShortcuts,
    ...runtimeWorkspaceProps,
    ...runtimeWorkspaceBundles,
  });
  const runtimeGlobalOverlayHost = useRuntimeGlobalOverlayHost({
    initialUiSettings,
    initialDataPoolRemovedSymbolsBySourceId,
    canPersistUiSettings,
    ...runtimeStartupState,
    ...runtimeStartupHistoryState,
    ...runtimeStartupPersistence,
    ...runtimeTrainerChartSession,
    ...runtimeTrainerMarketSettings,
    ...runtimeTrainerPoolChartPipeline,
    ...runtimeTrainerChartOrchestration,
    ...runtimeFreeReplaySetup,
    ...runtimeFreeReplayExecution,
    ...runtimeTradingSettingsAndImport,
    ...runtimeDataResetNavigation,
    ...runtimeNoteEditorAndShortcuts,
    ...runtimeWorkspaceProps,
    ...runtimeWorkspaceBundles,
    ...runtimeSecondaryWindows,
  });

  return (
    <I18nProvider locale={runtimeStartupState.language}>
      <DesktopCloseBehaviorController
        desktopCloseButtonAction={runtimeStartupState.desktopCloseButtonAction}
        setDesktopCloseButtonAction={
          runtimeStartupState.setDesktopCloseButtonAction
        }
        buildUiSettings={runtimeStartupPersistence.buildUiSettingsForPersist}
        canPersistUiSettings={canPersistUiSettings}
      />
      <RuntimeAppHost
        scope={{
          initialUiSettings,
          initialDataPoolRemovedSymbolsBySourceId,
          canPersistUiSettings,
          ...runtimeStartupState,
          ...runtimeStartupHistoryState,
          ...runtimeStartupPersistence,
          ...runtimeTrainerChartSession,
          ...runtimeTrainerMarketSettings,
          ...runtimeTrainerPoolChartPipeline,
          ...runtimeTrainerChartOrchestration,
          ...runtimeFreeReplaySetup,
          ...runtimeFreeReplayExecution,
          ...runtimeTradingSettingsAndImport,
          ...runtimeDataResetNavigation,
          ...runtimeNoteEditorAndShortcuts,
          ...runtimeWorkspaceProps,
          ...runtimeWorkspaceBundles,
          ...runtimeSecondaryWindows,
          ...runtimeGlobalOverlayHost,
        }}
      />
    </I18nProvider>
  );
};
