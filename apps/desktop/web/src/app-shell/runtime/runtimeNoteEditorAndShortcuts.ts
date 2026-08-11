// SPDX-License-Identifier: GPL-3.0-only

import {
  type UiSettings,
} from "@/frontend-kernel/appTypes";
import { useRuntimeReplayNoteEditorHost } from "@/app-shell/runtime/runtimeReplayNoteEditorHost";
import { useRuntimeSpecialTrainingReviewNote } from "@/app-shell/runtime/runtimeSpecialTrainingReviewNote";
import { useRuntimeTrainerActionsAndShortcuts } from "@/app-shell/runtime/runtimeTrainerActionsAndShortcuts";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & ReturnType<typeof useRuntimeTradingSettingsAndImport> & ReturnType<typeof useRuntimeDataResetNavigation> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeNoteEditorAndShortcuts = (scope: RuntimeHookScope) => {
  const replayNoteEditor = useRuntimeReplayNoteEditorHost(scope);
  const specialTrainingReviewNote = useRuntimeSpecialTrainingReviewNote({
    ...scope,
    ...replayNoteEditor,
  });
  const trainerActionsAndShortcuts = useRuntimeTrainerActionsAndShortcuts({
    ...scope,
    ...replayNoteEditor,
    ...specialTrainingReviewNote,
  });

  return {
    ...replayNoteEditor,
    ...specialTrainingReviewNote,
    ...trainerActionsAndShortcuts,
  };
};
