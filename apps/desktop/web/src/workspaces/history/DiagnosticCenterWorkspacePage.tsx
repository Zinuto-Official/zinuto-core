// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/workspaces/history.css";

import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  ReplayReviewConsolePage,
  type ReplayReviewConsoleHistoryDeps,
} from "@/workspaces/history/history-console/ReplayReviewConsolePage";

export type DiagnosticHistoryDeps = ReplayReviewConsoleHistoryDeps;

type DiagnosticCenterWorkspacePageProps = {
  history: DiagnosticHistoryDeps;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  isActive?: boolean;
  onError?: (message: string) => void;
};

export const DiagnosticCenterWorkspacePage = ({
  history,
  ui,
  language,
  isActive = true,
  onError,
}: DiagnosticCenterWorkspacePageProps) => (
  <ReplayReviewConsolePage
    history={history}
    isActive={isActive}
    ui={ui}
    language={language}
    onError={onError}
  />
);
