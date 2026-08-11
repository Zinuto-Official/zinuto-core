// SPDX-License-Identifier: GPL-3.0-only

/**
 * Stable compatibility surface for the replay-review console.
 *
 * Data contracts and scalar formatting live in the model module, while the
 * chart and React presentation remain in the presentation module.
 */
export * from "@/workspaces/history/history-console/ReplayReviewConsoleModel";
export * from "@/workspaces/history/history-console/ReplayReviewConsolePresentation";
