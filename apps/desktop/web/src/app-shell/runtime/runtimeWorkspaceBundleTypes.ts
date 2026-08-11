// SPDX-License-Identifier: GPL-3.0-only

import type { UiSettings } from "@/frontend-kernel/appTypes";
import type { useCsvImportController } from "@/domains/data-import/useCsvImportController";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeNoteEditorAndShortcuts } from "@/app-shell/runtime/runtimeNoteEditorAndShortcuts";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeWorkspaceProps } from "@/app-shell/runtime/runtimeWorkspaceProps";

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};

export type RuntimeWorkspaceBundleScope = AppRootRuntimeProps &
  ReturnType<typeof useCsvImportController> &
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
  Record<string, unknown>;
