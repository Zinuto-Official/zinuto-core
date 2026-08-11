// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopSecondaryWindowKind } from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";

export type DesktopSecondaryWindowActionPayload = {
  kind: DesktopSecondaryWindowKind;
  action: string;
  payload?: unknown;
  instanceId: string;
  requestId: string;
  stateRevision: number;
};

export type DesktopSecondaryWindowSyncMode =
  | "live-controlled"
  | "command-only"
  | "visual-only";

export type DesktopSecondaryWindowSyncPolicy = {
  mode: DesktopSecondaryWindowSyncMode;
  staleActionPolicy: "drop-live-actions";
  closeActionPolicy: "require-current-instance";
};

const defineSyncPolicy = (
  mode: DesktopSecondaryWindowSyncMode,
): DesktopSecondaryWindowSyncPolicy => ({
  mode,
  staleActionPolicy: "drop-live-actions",
  closeActionPolicy: "require-current-instance",
});

export const DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES = {
  ONBOARDING_TOUR: defineSyncPolicy("live-controlled"),
  TRAINER_TRADING_ENVIRONMENT: defineSyncPolicy("live-controlled"),
  STRATEGY_BACKTEST_RESULT_DETAIL: defineSyncPolicy("live-controlled"),
  TRAINER_TRADING_DEFAULTS: defineSyncPolicy("live-controlled"),
  TRAINER_START_POINT: defineSyncPolicy("command-only"),
  TRAINER_INDICATOR_SETTINGS: defineSyncPolicy("live-controlled"),
  SYSTEM_GLOBAL_RESET_CONFIRM: defineSyncPolicy("live-controlled"),
  SPECIAL_TRAINING_BANK_EDITOR: defineSyncPolicy("live-controlled"),
  SPECIAL_TRAINING_BANK_DELETE_CONFIRM: defineSyncPolicy("live-controlled"),
  SPECIAL_TRAINING_MODE_RESTART_CONFIRM: defineSyncPolicy("live-controlled"),
  FREE_REPLAY_REPLAY: defineSyncPolicy("live-controlled"),
  FREE_REPLAY_ARCHIVE_DETAIL: defineSyncPolicy("live-controlled"),
  FREE_REPLAY_SETTLEMENT_DETAIL: defineSyncPolicy("command-only"),
  CHALLENGE_SESSION_REPLAY: defineSyncPolicy("live-controlled"),
  CHALLENGE_STATS_REPLAY: defineSyncPolicy("live-controlled"),
  REPLAY_NOTE_EDITOR: defineSyncPolicy("live-controlled"),
  SAMPLE_POOL_IMPORT_CONFIG: defineSyncPolicy("live-controlled"),
  MARKET_DATA_ACQUISITION: defineSyncPolicy("live-controlled"),
  DATA_CONFIG_DETAIL: defineSyncPolicy("live-controlled"),
  INDICATOR_REFERENCE: defineSyncPolicy("visual-only"),
} as const satisfies Record<
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowSyncPolicy
>;

const LIFECYCLE_ACTIONS = new Set([
  "CANCEL",
  "CLOSE",
  "WINDOW_CLOSED",
  "WINDOW_HIDDEN_FOR_REUSE",
]);

export const isDesktopSecondaryWindowLifecycleAction = (
  action: string | null | undefined,
): boolean => LIFECYCLE_ACTIONS.has(String(action || "").trim());
