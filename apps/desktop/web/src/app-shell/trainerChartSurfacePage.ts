// SPDX-License-Identifier: GPL-3.0-only

import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

export type TrainerChartSurfacePage = Extract<
  WorkspacePage,
  "TRAINER" | "SPECIAL_TRAINING"
>;

export const isTrainerChartSurfacePage = (
  page: WorkspacePage | null | undefined,
): page is TrainerChartSurfacePage =>
  page === "TRAINER" || page === "SPECIAL_TRAINING";

export const resolveTrainerChartSurfacePage = ({
  activePage,
  displayedPage,
}: {
  activePage: WorkspacePage;
  displayedPage: WorkspacePage;
}): TrainerChartSurfacePage | null => {
  if (isTrainerChartSurfacePage(displayedPage)) {
    return displayedPage;
  }
  return isTrainerChartSurfacePage(activePage) ? activePage : null;
};
